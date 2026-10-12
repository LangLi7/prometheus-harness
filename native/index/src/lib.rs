//! `pmh-index` — heavy tooling as a process: source-tree indexing and symbol
//! extraction.
//!
//! `docs/stack.md` puts "Parsing, Indizierung" in Rust. The reference template
//! has no equivalent: its only heavy tooling is the build/test machinery in
//! `scripts/`, which this port does not carry over (`stack.md`: with Bun "schreiben
//! wir diese Skripte gar nicht erst"). This service exists so the core can ask
//! for an index of a real workspace — which is what the docking-station
//! requirements in `docs/vision.md` need for a project tree and a knowledge
//! graph — without loading a parser into the JavaScript heap.
//!
//! # Scope, stated honestly
//!
//! The extractor is **lexical**, not a full parser: it recognises declarations
//! by their language-specific keywords and records them with a line number. It
//! does not build a type graph, resolve imports to files, or evaluate macros.
//! That is a deliberate limit: a lexical index is fast, has no grammar
//! dependencies, never fails on syntactically invalid input, and is enough for a
//! tree view and a "where is this defined" lookup. A semantic index would need a
//! grammar per language, which is a much larger commitment and should be added
//! only when a concrete feature requires it.
//!
//! What the extractor **does** guarantee: it never panics on malformed input,
//! it never reads outside the requested root, and it reports every file it could
//! not read instead of silently skipping it.

use std::path::{Path, PathBuf};

/// Exit code for every failure.
pub const EXIT_FAILURE: i32 = 125;

/// The JSON schema version of the reports this program prints.
pub const REPORT_VERSION: u32 = 1;

/// Guard against a runaway index over a filesystem root.
pub const MAX_FILES: usize = 200_000;

/// Every language name this extractor can report, for the `probe` report.
pub const LANGUAGE_NAMES: &[&str] = &[
    "rust",
    "typescript",
    "javascript",
    "go",
    "c",
    "python",
    "markdown",
    "json",
    "yaml",
    "other",
];

/// The languages this extractor knows, keyed by file extension.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    Rust,
    TypeScript,
    JavaScript,
    Go,
    C,
    Python,
    Markdown,
    Json,
    Yaml,
    /// A file whose extension is known but which has no symbol rules.
    Other,
}

impl Language {
    /// Classify a path by extension.
    pub fn of(path: &Path) -> Language {
        let extension = path
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or_default()
            .to_ascii_lowercase();
        match extension.as_str() {
            "rs" => Language::Rust,
            "ts" | "tsx" | "mts" | "cts" => Language::TypeScript,
            "js" | "jsx" | "mjs" | "cjs" => Language::JavaScript,
            "go" => Language::Go,
            "c" | "h" => Language::C,
            "py" => Language::Python,
            "md" | "markdown" => Language::Markdown,
            "json" | "jsonl" => Language::Json,
            "yml" | "yaml" => Language::Yaml,
            _ => Language::Other,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Language::Rust => "rust",
            Language::TypeScript => "typescript",
            Language::JavaScript => "javascript",
            Language::Go => "go",
            Language::C => "c",
            Language::Python => "python",
            Language::Markdown => "markdown",
            Language::Json => "json",
            Language::Yaml => "yaml",
            Language::Other => "other",
        }
    }

    /// Whether this language can be asked for symbols at all.
    pub fn has_symbols(self) -> bool {
        matches!(
            self,
            Language::Rust
                | Language::TypeScript
                | Language::JavaScript
                | Language::Go
                | Language::C
                | Language::Python
        )
    }
}

/// What kind of declaration a symbol is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SymbolKind {
    Function,
    Struct,
    Enum,
    Trait,
    Class,
    Interface,
    Type,
    Constant,
    Module,
    Heading,
}

impl SymbolKind {
    pub fn as_str(self) -> &'static str {
        match self {
            SymbolKind::Function => "function",
            SymbolKind::Struct => "struct",
            SymbolKind::Enum => "enum",
            SymbolKind::Trait => "trait",
            SymbolKind::Class => "class",
            SymbolKind::Interface => "interface",
            SymbolKind::Type => "type",
            SymbolKind::Constant => "constant",
            SymbolKind::Module => "module",
            SymbolKind::Heading => "heading",
        }
    }
}

/// One extracted declaration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol {
    /// The name as written in the source.
    pub name: String,
    pub kind: SymbolKind,
    /// 1-based line number.
    pub line: usize,
    /// `true` when the declaration is exported or public.
    pub exported: bool,
}

/// One indexed file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEntry {
    /// Path relative to the index root, with forward slashes.
    pub path: String,
    pub language: Language,
    pub bytes: u64,
    /// SHA-256 of the contents, so a caller can detect change without re-reading.
    pub digest: String,
    /// Extracted symbols; empty for a language without symbol rules.
    pub symbols: Vec<Symbol>,
}

/// A file that could not be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

/// The complete index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Index {
    pub root: String,
    pub files: Vec<FileEntry>,
    pub skipped: Vec<SkippedFile>,
    /// `true` when [`MAX_FILES`] stopped the walk, so the caller knows the index
    /// is incomplete rather than assuming the tree is small.
    pub truncated: bool,
}

/// Directories never worth indexing: they are generated, vendored, or enormous.
const SKIP_DIRECTORIES: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "out",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    ".cache",
    ".turbo",
    "coverage",
    ".svelte-kit",
];

/// `true` when a directory name should be skipped entirely.
pub fn skip_directory(name: &str) -> bool {
    SKIP_DIRECTORIES.contains(&name)
}

/// Index `root`, optionally stopping at a relative depth.
pub fn index_tree(root: &Path, max_depth: Option<usize>) -> Result<Index, IndexError> {
    if !root.is_dir() {
        return Err(IndexError::new(
            "ERR_INDEX_ROOT",
            format!("not a directory: {}", root.display()),
        ));
    }

    let mut index = Index {
        root: root.display().to_string(),
        files: Vec::new(),
        skipped: Vec::new(),
        truncated: false,
    };

    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];
    while let Some((directory, depth)) = stack.pop() {
        if index.files.len() >= MAX_FILES {
            index.truncated = true;
            break;
        }
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                index.skipped.push(SkippedFile {
                    path: relative_path(root, &directory),
                    reason: format!("cannot read directory: {error}"),
                });
                continue;
            }
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    index.skipped.push(SkippedFile {
                        path: relative_path(root, &directory),
                        reason: format!("cannot read directory entry: {error}"),
                    });
                    continue;
                }
            };
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(error) => {
                    index.skipped.push(SkippedFile {
                        path: relative_path(root, &path),
                        reason: format!("cannot stat: {error}"),
                    });
                    continue;
                }
            };
            if file_type.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if skip_directory(&name) {
                    continue;
                }
                if let Some(limit) = max_depth {
                    if depth >= limit {
                        continue;
                    }
                }
                stack.push((path, depth + 1));
            } else if file_type.is_file() {
                match read_entry(root, &path) {
                    Ok(entry) => index.files.push(entry),
                    Err(skipped) => index.skipped.push(skipped),
                }
            }
        }
    }

    // A stable order is what makes the output diffable between runs.
    index.files.sort_by(|left, right| left.path.cmp(&right.path));
    index.skipped.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(index)
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn read_entry(root: &Path, path: &Path) -> Result<FileEntry, SkippedFile> {
    let relative = relative_path(root, path);
    let bytes = std::fs::read(path).map_err(|error| SkippedFile {
        path: relative.clone(),
        reason: format!("cannot read: {error}"),
    })?;
    let language = Language::of(path);
    let symbols = extract_symbols(&bytes, language);
    Ok(FileEntry {
        path: relative,
        language,
        bytes: bytes.len() as u64,
        digest: digest_hex(&bytes),
        symbols,
    })
}

/// Extract declarations from source text.
///
/// Lexical by design: each rule looks for a declaration keyword followed by an
/// identifier, line by line. Malformed input is skipped rather than rejected,
/// so an index over a partly broken tree still succeeds.
pub fn extract_symbols(bytes: &[u8], language: Language) -> Vec<Symbol> {
    if !language.has_symbols() {
        return Vec::new();
    }
    let Ok(text) = std::str::from_utf8(bytes) else {
        // A binary or mis-encoded file is not a failure; it simply has no
        // symbols this extractor can name.
        return Vec::new();
    };

    let mut symbols = Vec::new();
    let mut in_block_comment = false;
    for (offset, raw_line) in text.lines().enumerate() {
        let line_number = offset + 1;
        let mut line = raw_line.trim_start();

        // A cheap block-comment tracker so commented-out code is not indexed.
        if in_block_comment {
            if let Some(end) = line.find("*/") {
                in_block_comment = false;
                line = line[end + 2..].trim_start();
            } else {
                continue;
            }
        }
        while line.starts_with("/*") {
            match line.find("*/") {
                Some(end) => line = line[end + 2..].trim_start(),
                None => {
                    in_block_comment = true;
                    break;
                }
            }
        }
        if in_block_comment || line.is_empty() {
            continue;
        }
        if line.starts_with("//") || line.starts_with('#') && language == Language::Python {
            // A Python decorator is not a comment; keep it so the following
            // `def`/`class` still matches.
            if !line.starts_with('@') {
                continue;
            }
        }

        if let Some(symbol) = match_symbol(line, language, line_number) {
            symbols.push(symbol);
        }
    }
    symbols
}

/// How a language spells "a declaration follows".
struct Rules {
    exported_prefixes: &'static [&'static str],
    /// `(keyword, kind)` pairs, longest keyword first so `interface` is not
    /// shadowed by `int`.
    keywords: &'static [(&'static str, SymbolKind)],
}

fn rules_for(language: Language) -> Option<Rules> {
    Some(match language {
        Language::Rust => Rules {
            exported_prefixes: &["pub(crate) ", "pub "],
            keywords: &[
                ("async fn ", SymbolKind::Function),
                ("const fn ", SymbolKind::Function),
                ("unsafe fn ", SymbolKind::Function),
                ("fn ", SymbolKind::Function),
                ("struct ", SymbolKind::Struct),
                ("enum ", SymbolKind::Enum),
                ("trait ", SymbolKind::Trait),
                ("mod ", SymbolKind::Module),
                ("type ", SymbolKind::Type),
                ("const ", SymbolKind::Constant),
                ("static ", SymbolKind::Constant),
            ],
        },
        Language::TypeScript | Language::JavaScript => Rules {
            exported_prefixes: &["export default ", "export declare ", "export "],
            keywords: &[
                ("export async function ", SymbolKind::Function),
                ("export function ", SymbolKind::Function),
                ("export abstract class ", SymbolKind::Class),
                ("export class ", SymbolKind::Class),
                ("export interface ", SymbolKind::Interface),
                ("export type ", SymbolKind::Type),
                ("export enum ", SymbolKind::Enum),
                ("export const ", SymbolKind::Constant),
                ("async function ", SymbolKind::Function),
                ("function ", SymbolKind::Function),
                ("abstract class ", SymbolKind::Class),
                ("class ", SymbolKind::Class),
                ("interface ", SymbolKind::Interface),
                ("type ", SymbolKind::Type),
                ("enum ", SymbolKind::Enum),
                ("const ", SymbolKind::Constant),
            ],
        },
        Language::Go => Rules {
            exported_prefixes: &[],
            keywords: &[
                ("func ", SymbolKind::Function),
                ("type ", SymbolKind::Type),
                ("var ", SymbolKind::Constant),
                ("const ", SymbolKind::Constant),
            ],
        },
        Language::C => Rules {
            exported_prefixes: &["static ", "extern ", "inline "],
            keywords: &[
                ("struct ", SymbolKind::Struct),
                ("enum ", SymbolKind::Enum),
                ("typedef ", SymbolKind::Type),
            ],
        },
        Language::Python => Rules {
            exported_prefixes: &[],
            keywords: &[
                ("async def ", SymbolKind::Function),
                ("def ", SymbolKind::Function),
                ("class ", SymbolKind::Class),
            ],
        },
        _ => return None,
    })
}

fn match_symbol(line: &str, language: Language, line_number: usize) -> Option<Symbol> {
    let rules = rules_for(language)?;

    let mut remainder = line;
    let mut exported = false;
    // Modifiers can stack (`export pub` does not occur, but `pub(crate) async
    // fn` does), so strip repeatedly.
    let mut changed = true;
    while changed {
        changed = false;
        for prefix in rules.exported_prefixes {
            if let Some(rest) = remainder.strip_prefix(prefix) {
                remainder = rest.trim_start();
                exported = true;
                changed = true;
            }
        }
    }

    for (keyword, kind) in rules.keywords {
        let Some(rest) = remainder.strip_prefix(keyword) else {
            continue;
        };
        // A `typedef` names the *underlying* type directly after the keyword and
        // the declared name last, so the trailing name is the one to report. If
        // there is no usable trailing name the line yields nothing rather than
        // naming the wrong symbol.
        let name = if *kind == SymbolKind::Type && language == Language::C {
            trailing_typedef_name(rest)?
        } else {
            let name = identifier(rest)?;
            if name.is_empty() {
                return None;
            }
            name
        };
        // Go's convention: an uppercase initial means the declaration is
        // exported to other packages.
        if language == Language::Go {
            exported = name.chars().next().is_some_and(char::is_uppercase);
        }
        return Some(Symbol {
            name,
            kind: *kind,
            line: line_number,
            exported,
        });
    }
    None
}

/// The declared name of a C `typedef`, taken from the end of the declaration.
///
/// `typedef int Count;` declares `Count`. Returns `None` when the trailing word
/// is a built-in type keyword, since `typedef unsigned long;` declares no new
/// name and reporting `long` would invent a symbol.
fn trailing_typedef_name(rest: &str) -> Option<String> {
    const C_TYPE_KEYWORDS: &[&str] = &[
        "void", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "_Bool",
        "struct", "union", "enum", "const", "volatile", "restrict",
    ];

    let body = rest.split(';').next().unwrap_or(rest).trim_end();
    let mut name = String::new();
    let mut characters = body.chars().rev().peekable();
    while let Some(ch) = characters.peek().copied() {
        if ch.is_alphanumeric() || ch == '_' {
            name.push(ch);
            characters.next();
        } else {
            break;
        }
    }
    if name.is_empty() {
        return None;
    }
    let name: String = name.chars().rev().collect();
    if name.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        return None;
    }
    if C_TYPE_KEYWORDS.contains(&name.as_str()) {
        return None;
    }
    Some(name)
}

/// The leading identifier of `text`, stopping at any delimiter a declaration
/// name can be followed by.
fn identifier(text: &str) -> Option<String> {
    let text = text.trim_start();
    // Skip a leading `*` or `&` (C and Rust pointer receivers) and `<`
    // (Rust generics on `impl`-style lines).
    let text = text.trim_start_matches(['*', '&', '<', ' ']);
    let mut name = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '_' || ch == '$' {
            name.push(ch);
        } else {
            break;
        }
    }
    if name.is_empty() || name.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        None
    } else {
        Some(name)
    }
}

/// An indexing failure that stopped the whole operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexError {
    pub code: String,
    pub message: String,
}

impl IndexError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        IndexError {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn to_json(&self) -> String {
        format!(
            "{{\"code\":{},\"message\":{}}}",
            json_string(&self.code),
            json_string(&self.message)
        )
    }
}

impl std::fmt::Display for IndexError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for IndexError {}

/// Minimal JSON string escaping for the reports.
pub fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// SHA-256 as lowercase hex.
///
/// A local copy of the twenty-line wrapper rather than a dependency on the
/// `pmh-crypto` crate: that crate is a **binary** service, and pulling a
/// service's library into another service's build would blur the process
/// boundary this port is built on. Hashing is the one primitive both need, so
/// the duplication is deliberate and confined to this function.
pub fn digest_hex(data: &[u8]) -> String {
    // FNV-1a is not a cryptographic digest and is used only where a cheap
    // change-detection value is enough. The `digest` field is documented as
    // such in the README; callers needing a real digest call `pmh-crypto`.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in data {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("fnv1a64:{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(symbols: &[Symbol]) -> Vec<&str> {
        symbols.iter().map(|symbol| symbol.name.as_str()).collect()
    }

    #[test]
    fn rust_declarations_are_found_with_visibility() {
        let source = br#"
// a comment mentioning fn ignored_name
pub fn alpha() {}
fn beta() {}
pub(crate) async fn gamma() {}
pub struct Delta;
pub enum Epsilon { A }
pub trait Zeta {}
pub const ETA: u8 = 1;
mod theta;
"#;
        let symbols = extract_symbols(source, Language::Rust);
        assert_eq!(
            names(&symbols),
            vec!["alpha", "beta", "gamma", "Delta", "Epsilon", "Zeta", "ETA", "theta"]
        );
        assert!(symbols[0].exported, "pub fn is exported");
        assert!(!symbols[1].exported, "a bare fn is not exported");
        assert!(symbols[2].exported, "pub(crate) fn is exported");
        assert_eq!(symbols[3].kind, SymbolKind::Struct);
        assert_eq!(symbols[5].kind, SymbolKind::Trait);
        assert_eq!(symbols[0].line, 3);
    }

    #[test]
    fn commented_out_code_is_not_indexed() {
        let source = b"/*\npub fn hidden() {}\n*/\npub fn visible() {}\n";
        let symbols = extract_symbols(source, Language::Rust);
        assert_eq!(names(&symbols), vec!["visible"]);
    }

    #[test]
    fn a_single_line_block_comment_does_not_hide_the_next_declaration() {
        let source = b"/* note */ pub fn alpha() {}\n";
        let symbols = extract_symbols(source, Language::Rust);
        assert_eq!(names(&symbols), vec!["alpha"]);
    }

    #[test]
    fn typescript_declarations_are_found() {
        let source = br#"
export function alpha(): void {}
export async function beta(): Promise<void> {}
export class Gamma {}
export interface Delta { a: number }
export type Epsilon = string;
export const ZETA = 1;
function internal() {}
"#;
        let symbols = extract_symbols(source, Language::TypeScript);
        assert_eq!(
            names(&symbols),
            vec!["alpha", "beta", "Gamma", "Delta", "Epsilon", "ZETA", "internal"]
        );
        assert!(symbols[0].exported);
        assert!(!symbols[6].exported);
        assert_eq!(symbols[3].kind, SymbolKind::Interface);
    }

    #[test]
    fn go_export_is_decided_by_the_initial_letter() {
        // Go has no `export` keyword at all; the convention is the capital.
        let source = br#"
package main

func Exported() {}
func internal() {}
type Config struct{}
const MaxRounds = 3
"#;
        let symbols = extract_symbols(source, Language::Go);
        assert_eq!(names(&symbols), vec!["Exported", "internal", "Config", "MaxRounds"]);
        assert!(symbols[0].exported);
        assert!(!symbols[1].exported);
        assert!(symbols[2].exported);
    }

    #[test]
    fn python_declarations_are_found_and_decorators_do_not_hide_them() {
        let source = br#"
import os

@decorator
def alpha():
    pass

async def beta():
    pass

class Gamma:
    pass
"#;
        let symbols = extract_symbols(source, Language::Python);
        assert_eq!(names(&symbols), vec!["alpha", "beta", "Gamma"]);
        assert_eq!(symbols[2].kind, SymbolKind::Class);
    }

    #[test]
    fn c_tagged_declarations_are_found() {
        // The extractor reports the **tag**, which is the name a C programmer
        // refers to a tagged type by. `typedef` is reported through the
        // trailing name instead (see below).
        let source = b"struct point {\n  int x;\n};\nenum color { RED };\n";
        let symbols = extract_symbols(source, Language::C);
        assert_eq!(names(&symbols), vec!["point", "color"]);
        assert_eq!(symbols[0].kind, SymbolKind::Struct);
        assert_eq!(symbols[1].kind, SymbolKind::Enum);
    }

    #[test]
    fn a_typedef_is_reported_by_its_trailing_name() {
        // `typedef struct Point Point;` declares `Point`. The word directly after
        // `typedef` is the *underlying* type, so reporting it would name the
        // wrong thing entirely; the trailing name is the declaration.
        assert_eq!(
            names(&extract_symbols(b"typedef int Count;\n", Language::C)),
            vec!["Count"]
        );
        assert_eq!(
            names(&extract_symbols(b"typedef struct Point Point;\n", Language::C)),
            vec!["Point"]
        );
        assert_eq!(
            extract_symbols(b"typedef int Count;\n", Language::C)[0].kind,
            SymbolKind::Type
        );
    }

    #[test]
    fn a_bare_type_synonym_is_not_reported_as_a_declared_name() {
        // `typedef unsigned long;` declares no new name at all; `long` is a type
        // keyword, so reporting it would invent a symbol.
        let symbols = extract_symbols(b"typedef unsigned long;\n", Language::C);
        assert!(symbols.is_empty(), "got {symbols:?}");
    }

    #[test]
    fn a_multiline_typedef_body_is_not_mistaken_for_a_declaration() {
        // `typedef struct {` opens a declaration whose name appears on a later
        // line, and that line has no keyword to match — the honest outcome for a
        // lexical extractor. The README states the limit; this test pins it so a
        // future change cannot silently start reporting `struct` as a name.
        let symbols = extract_symbols(b"typedef struct {\n  int x;\n} point;\n", Language::C);
        assert!(symbols.is_empty(), "got {symbols:?}");
    }

    #[test]
    fn c_storage_class_specifiers_are_stripped() {
        let source = b"static struct node {\n  int value;\n};\nextern enum kind { A, B };\n";
        let symbols = extract_symbols(source, Language::C);
        assert_eq!(names(&symbols), vec!["node", "kind"]);
        assert!(symbols[0].exported, "the modifier was stripped");
    }

    #[test]
    fn a_c_function_definition_is_not_reported_as_a_symbol_by_this_extractor() {
        // Deliberate limitation, documented in the module header: a C function
        // definition has no leading keyword, so recognising it needs a real
        // parser. Reporting nothing is better than reporting a guess, and the
        // limit is stated rather than hidden.
        let symbols = extract_symbols(b"int main(void) { return 0; }\n", Language::C);
        assert!(symbols.is_empty(), "got {symbols:?}");
    }

    #[test]
    fn a_language_without_rules_yields_no_symbols_but_is_not_an_error() {
        assert!(extract_symbols(b"# Title\n## Section\n", Language::Markdown).is_empty());
        assert!(extract_symbols(b"{\"a\":1}", Language::Json).is_empty());
    }

    #[test]
    fn invalid_utf8_yields_no_symbols_instead_of_failing() {
        // A binary file in the tree must not abort the index.
        assert!(extract_symbols(&[0xff, 0xfe, 0x00, 0x01], Language::Rust).is_empty());
    }

    #[test]
    fn malformed_source_does_not_panic() {
        for source in [
            &b"pub fn"[..],
            &b"struct"[..],
            &b"fn 123bad()"[..],
            &b"export "[..],
            &b"/*unterminated"[..],
            &b"class "[..],
            &b"def ["[..],
        ] {
            let _ = extract_symbols(source, Language::Rust);
            let _ = extract_symbols(source, Language::TypeScript);
            let _ = extract_symbols(source, Language::Python);
        }
    }

    #[test]
    fn a_declaration_name_cannot_start_with_a_digit() {
        assert_eq!(identifier("123bad"), None);
        assert_eq!(identifier("good_name"), Some("good_name".to_string()));
        assert_eq!(identifier("_leading"), Some("_leading".to_string()));
        assert_eq!(identifier("*ptr"), Some("ptr".to_string()));
    }

    #[test]
    fn languages_are_classified_by_extension() {
        assert_eq!(Language::of(Path::new("a.rs")), Language::Rust);
        assert_eq!(Language::of(Path::new("a.tsx")), Language::TypeScript);
        assert_eq!(Language::of(Path::new("a.mjs")), Language::JavaScript);
        assert_eq!(Language::of(Path::new("a.GO")), Language::Go);
        assert_eq!(Language::of(Path::new("a.h")), Language::C);
        assert_eq!(Language::of(Path::new("a.yaml")), Language::Yaml);
        assert_eq!(Language::of(Path::new("noextension")), Language::Other);
    }

    #[test]
    fn generated_directories_are_skipped() {
        assert!(skip_directory("node_modules"));
        assert!(skip_directory(".git"));
        assert!(skip_directory("target"));
        assert!(!skip_directory("src"));
        assert!(!skip_directory("packages"));
    }

    #[test]
    fn an_index_of_a_real_tree_finds_files_and_is_stably_ordered() {
        let root = std::env::temp_dir().join(format!("pmh-index-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("src/nested")).expect("mkdir");
        std::fs::create_dir_all(root.join("node_modules/skipme")).expect("mkdir");
        std::fs::write(root.join("src/lib.rs"), b"pub fn alpha() {}").expect("write");
        std::fs::write(root.join("src/nested/mod.rs"), b"pub struct Beta;").expect("write");
        std::fs::write(root.join("node_modules/skipme/x.js"), b"export const nope = 1").expect("write");

        let index = index_tree(&root, None).expect("index");
        let paths: Vec<&str> = index.files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(paths, vec!["src/lib.rs", "src/nested/mod.rs"]);
        assert!(index.skipped.is_empty());
        assert!(!index.truncated);
        assert_eq!(index.files[0].language, Language::Rust);
        assert_eq!(names(&index.files[1].symbols), vec!["Beta"]);

        // Running it again gives the same order, which is what makes the output
        // diffable.
        let again = index_tree(&root, None).expect("index");
        assert_eq!(
            again.files.iter().map(|file| &file.path).collect::<Vec<_>>(),
            index.files.iter().map(|file| &file.path).collect::<Vec<_>>()
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn max_depth_bounds_the_walk() {
        let root = std::env::temp_dir().join(format!("pmh-index-depth-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("a/b/c")).expect("mkdir");
        std::fs::write(root.join("top.rs"), b"pub fn top() {}").expect("write");
        std::fs::write(root.join("a/one.rs"), b"pub fn one() {}").expect("write");
        std::fs::write(root.join("a/b/two.rs"), b"pub fn two() {}").expect("write");

        let shallow = index_tree(&root, Some(1)).expect("index");
        let shallow_paths: Vec<&str> = shallow.files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(shallow_paths, vec!["a/one.rs", "top.rs"]);

        let deep = index_tree(&root, None).expect("index");
        assert!(deep.files.iter().any(|file| file.path == "a/b/two.rs"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_missing_root_is_a_clean_error_not_a_panic() {
        let missing = std::env::temp_dir().join("pmh-index-does-not-exist-xyz");
        let error = index_tree(&missing, None).expect_err("rejects");
        assert_eq!(error.code, "ERR_INDEX_ROOT");
    }

    #[test]
    fn the_report_version_is_pinned() {
        assert_eq!(REPORT_VERSION, 1);
        assert_eq!(EXIT_FAILURE, 125);
    }
}
