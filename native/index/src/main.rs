//! `pmh-index` — source-tree indexing and symbol extraction as a process.
//!
//! ```text
//! pmh-index tree  <root> [--depth <n>] [--symbols]
//! pmh-index symbols <root> [--name <identifier>]
//! pmh-index probe
//! ```
//!
//! `tree` prints one JSON line per indexed file: path, language, size, digest
//! and — with `--symbols` — the declarations found. One line per file keeps the
//! output streamable, so the core can consume a large workspace without holding
//! the whole index in memory at once.
//!
//! `symbols` prints only the declarations, optionally filtered to one name.
//!
//! Every failure prints one JSON object on stderr and exits [`EXIT_FAILURE`].

use std::path::PathBuf;

use pmh_index::{
    index_tree, json_string, FileEntry, Symbol, EXIT_FAILURE, LANGUAGE_NAMES, MAX_FILES,
    REPORT_VERSION,
};

fn fail(code: &str, message: &str) -> ! {
    eprintln!(
        "{{\"code\":{},\"message\":{}}}",
        json_string(code),
        json_string(message)
    );
    std::process::exit(EXIT_FAILURE);
}

fn usage_error(message: &str) -> ! {
    fail("ERR_INDEX_USAGE", message)
}

/// Render one symbol as a JSON object.
fn symbol_json(symbol: &Symbol) -> String {
    format!(
        "{{\"name\":{},\"kind\":{},\"line\":{},\"exported\":{}}}",
        json_string(&symbol.name),
        json_string(symbol.kind.as_str()),
        symbol.line,
        symbol.exported
    )
}

/// Render one file entry as a JSON object, without a trailing newline.
fn file_json(entry: &FileEntry, with_symbols: bool) -> String {
    let mut out = format!(
        "{{\"path\":{},\"language\":{},\"bytes\":{},\"digest\":{},\"symbols\":[",
        json_string(&entry.path),
        json_string(entry.language.as_str()),
        entry.bytes,
        json_string(&entry.digest)
    );
    if with_symbols {
        let rendered: Vec<String> = entry.symbols.iter().map(symbol_json).collect();
        out.push_str(&rendered.join(","));
    }
    out.push_str("]}");
    out
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        usage_error("a command is required: tree | symbols | probe");
    };

    match command {
        "probe" => {
            if args.len() != 1 {
                usage_error("probe takes no other arguments");
            }
            let languages: Vec<String> = LANGUAGE_NAMES.iter().map(|name| json_string(name)).collect();
            println!(
                "{{\"version\":{REPORT_VERSION},\"operation\":\"probe\",\"languages\":[{}],\"max_files\":{MAX_FILES},\"extraction\":\"lexical\"}}",
                languages.join(",")
            );
            std::process::exit(0);
        }

        "tree" | "symbols" => {
            let mut root: Option<PathBuf> = None;
            let mut depth: Option<usize> = None;
            let mut with_symbols = command == "symbols";
            let mut name_filter: Option<String> = None;

            let mut index = 1usize;
            while index < args.len() {
                match args[index].as_str() {
                    "--depth" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--depth requires a value");
                        };
                        match value.parse::<usize>() {
                            Ok(value) => depth = Some(value),
                            Err(_) => usage_error("--depth must be a non-negative integer"),
                        }
                        index += 2;
                    }
                    "--symbols" => {
                        with_symbols = true;
                        index += 1;
                    }
                    "--name" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--name requires a value");
                        };
                        name_filter = Some(value.clone());
                        with_symbols = true;
                        index += 2;
                    }
                    other if root.is_none() && !other.starts_with("--") => {
                        root = Some(PathBuf::from(other));
                        index += 1;
                    }
                    other => usage_error(&format!("unknown argument: {other}")),
                }
            }

            let Some(root) = root else {
                usage_error("a root directory is required");
            };

            let index = match index_tree(&root, depth) {
                Ok(index) => index,
                Err(error) => {
                    eprintln!("{}", error.to_json());
                    std::process::exit(EXIT_FAILURE);
                }
            };

            // The header line lets a consumer know whether the walk was
            // complete before it starts trusting the file lines.
            println!(
                "{{\"event\":\"index\",\"version\":{REPORT_VERSION},\"root\":{},\"files\":{},\"skipped\":{},\"truncated\":{}}}",
                json_string(&index.root),
                index.files.len(),
                index.skipped.len(),
                index.truncated
            );

            for entry in &index.files {
                if let Some(filter) = &name_filter {
                    if !entry.symbols.iter().any(|symbol| symbol.name == *filter) {
                        continue;
                    }
                }
                println!("{}", file_json(entry, with_symbols));
            }

            // A file that could not be read is reported, never silently dropped:
            // an index that hides its own gaps is worse than no index.
            for skipped in &index.skipped {
                println!(
                    "{{\"event\":\"skipped\",\"path\":{},\"reason\":{}}}",
                    json_string(&skipped.path),
                    json_string(&skipped.reason)
                );
            }

            // Exit 1 when the walk was bounded, so a caller cannot mistake a
            // partial index for a complete one.
            std::process::exit(if index.truncated { 1 } else { 0 });
        }

        other => usage_error(&format!("unknown command: {other}")),
    }
}
