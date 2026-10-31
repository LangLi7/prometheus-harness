//! Where the tray finds what it needs: repository root, Bun, port, state file, log.
//!
//! Every value here is discovered **and reported**: the tray says which root and
//! which Bun it used instead of assuming. That follows the finding that made
//! `scripts/start.mjs` hand the host its own harness home — a foreign installation
//! won the module resolution and silently disabled 27 profile entries, and the
//! start looked fine.

use std::path::{Path, PathBuf};

/// Port the harness uses when nobody says otherwise.
///
/// The same `3080` the console launcher defaults to. An argument beats the
/// environment variable, the variable beats this default — the order
/// `scripts/start.mjs` documents and enforces.
pub const DEFAULT_PORT: u16 = 3080;

/// The marker that identifies the repository root.
pub const ROOT_MARKER: &str = "scripts/start.mjs";

/// Where a value came from, for the report line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    /// An explicit command-line argument.
    Argument,
    /// An environment variable.
    Environment,
    /// The documented default.
    Default,
    /// Next to the executable, or in a directory above it.
    NextToExecutable,
    /// Found by walking up from the working directory.
    WorkingDirectory,
    /// Found in `%USERPROFILE%`.
    UserProfile,
    /// Found in `PATH`.
    PathVariable,
}

impl Origin {
    /// A short German phrase for the report line.
    pub fn label(self) -> &'static str {
        match self {
            Origin::Argument => "dem Argument",
            Origin::Environment => "der Umgebungsvariable",
            Origin::Default => "der Vorgabe",
            Origin::NextToExecutable => "dem Programmordner",
            Origin::WorkingDirectory => "dem Arbeitsverzeichnis",
            Origin::UserProfile => "dem Benutzerprofil",
            Origin::PathVariable => "PATH",
        }
    }
}

/// A port and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortChoice {
    /// The port itself.
    pub port: u16,
    /// Which source won.
    pub origin: Origin,
}

impl PortChoice {
    /// The report line, e.g. `Port 3080 aus der Vorgabe`.
    pub fn report(&self) -> String {
        format!("Port {} aus {}", self.port, self.origin.label())
    }
}

/// Why a port was rejected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortError {
    /// A German sentence naming the source that carried the bad value.
    pub message: String,
}

impl std::fmt::Display for PortError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

/// Validates one port string.
///
/// `0` is rejected: port 0 means "any free port" to the operating system, and a
/// tray that then reports "port 0" would be telling the user an address that
/// cannot be opened.
fn parse_port(raw: &str, origin: Origin) -> Result<u16, PortError> {
    let trimmed = raw.trim();
    let reject = |why: &str| PortError {
        message: format!(
            "Port \"{trimmed}\" aus {} ist unbrauchbar: {why}.",
            origin.label()
        ),
    };
    if trimmed.is_empty() {
        return Err(reject("er ist leer"));
    }
    if !trimmed.chars().all(|character| character.is_ascii_digit()) {
        return Err(reject("er ist keine Zahl"));
    }
    match trimmed.parse::<u32>() {
        Ok(0) => Err(reject("0 überlässt die Wahl dem Betriebssystem, dann gibt es keine Adresse")),
        Ok(value) if value > u32::from(u16::MAX) => Err(reject("er liegt über 65535")),
        Ok(value) => Ok(value as u16),
        Err(_) => Err(reject("er ist zu groß")),
    }
}

/// The port to use: argument beats environment beats default.
pub fn resolve_port(cli: Option<&str>, environment: Option<&str>) -> Result<PortChoice, PortError> {
    if let Some(raw) = cli {
        return Ok(PortChoice {
            port: parse_port(raw, Origin::Argument)?,
            origin: Origin::Argument,
        });
    }
    if let Some(raw) = environment {
        if !raw.trim().is_empty() {
            return Ok(PortChoice {
                port: parse_port(raw, Origin::Environment)?,
                origin: Origin::Environment,
            });
        }
    }
    Ok(PortChoice {
        port: DEFAULT_PORT,
        origin: Origin::Default,
    })
}

/// Whether a directory is the repository: it must hold the start script.
fn is_root(directory: &Path, exists: &dyn Fn(&Path) -> bool) -> bool {
    exists(&directory.join(ROOT_MARKER))
}

/// Walks from `start` upwards, returning the first repository root.
fn walk_up(start: &Path, exists: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    let mut current = Some(start);
    while let Some(directory) = current {
        if is_root(directory, exists) {
            return Some(directory.to_path_buf());
        }
        current = directory.parent();
    }
    None
}

/// Finds the repository root.
///
/// Order: `PMH_ROOT` (an explicit statement wins), then the executable's own
/// folder, then the working directory. The executable is tried before the working
/// directory because the tray is started by the shell at logon, where the working
/// directory is somewhere else entirely.
pub fn discover_root(
    environment: Option<&Path>,
    exe_dir: Option<&Path>,
    working_directory: Option<&Path>,
    exists: &dyn Fn(&Path) -> bool,
) -> Option<(PathBuf, Origin)> {
    if let Some(directory) = environment {
        if is_root(directory, exists) {
            return Some((directory.to_path_buf(), Origin::Environment));
        }
        // Explicitly named but not a repository: do not silently look elsewhere.
        // A start from the wrong folder is exactly the quiet failure to avoid.
        return None;
    }
    if let Some(directory) = exe_dir.and_then(|directory| walk_up(directory, exists)) {
        return Some((directory, Origin::NextToExecutable));
    }
    let directory = working_directory.and_then(|directory| walk_up(directory, exists))?;
    Some((directory, Origin::WorkingDirectory))
}

/// A Bun executable and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BunChoice {
    /// The executable.
    pub path: PathBuf,
    /// Which source won.
    pub origin: Origin,
}

/// Finds `bun.exe`.
///
/// Order: `PMH_BUN`, then `%USERPROFILE%\.bun\bin\bun.exe`, then `PATH`.
///
/// **The `PATH` entry matters more than it looks.** On this machine `bun` on
/// `PATH` is `...\npm\bun.ps1`, and the user execution policy is `Restricted`, so
/// that shim fails with "running scripts is disabled". Spawning it would produce a
/// tray whose only visible behaviour is "nothing happens". The real executable is
/// `bun.exe`; the `.ps1`/`.cmd` wrappers are not spawn targets.
pub fn discover_bun(
    environment: Option<&Path>,
    user_profile: Option<&Path>,
    path_variable: Option<&str>,
    exists: &dyn Fn(&Path) -> bool,
) -> Option<BunChoice> {
    if let Some(path) = environment {
        if exists(path) {
            return Some(BunChoice {
                path: path.to_path_buf(),
                origin: Origin::Environment,
            });
        }
        return None;
    }
    if let Some(profile) = user_profile {
        let candidate = profile.join(".bun").join("bin").join("bun.exe");
        if exists(&candidate) {
            return Some(BunChoice {
                path: candidate,
                origin: Origin::UserProfile,
            });
        }
    }
    for entry in path_variable.unwrap_or_default().split(';') {
        if entry.trim().is_empty() {
            continue;
        }
        let candidate = Path::new(entry.trim()).join("bun.exe");
        if exists(&candidate) {
            return Some(BunChoice {
                path: candidate,
                origin: Origin::PathVariable,
            });
        }
    }
    None
}

/// Everything the tray needs to know about where things live.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paths {
    /// The repository root.
    pub root: PathBuf,
    /// `scripts/start.mjs` under it.
    pub start_script: PathBuf,
    /// `.pmh-build/pmh-tray.state`.
    pub state: PathBuf,
    /// `.pmh-build/pmh-tray.log`.
    pub log: PathBuf,
}

impl Paths {
    /// Derives the paths from a repository root.
    pub fn from_root(root: PathBuf) -> Self {
        let build = root.join(".pmh-build");
        Self {
            start_script: root.join(ROOT_MARKER),
            state: build.join("pmh-tray.state"),
            log: build.join("pmh-tray.log"),
            root,
        }
    }
}

/// What the tray remembers between runs.
///
/// Plain `key=value` lines, not JSON: two fields do not justify a parser, and this
/// file is written by the tray for the tray. Anything unreadable means "no memory",
/// never an error — a corrupt state file must not stop a start.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Remembered {
    /// The port the last start used.
    pub port: Option<u16>,
    /// The address with token the host last reported.
    pub address: Option<String>,
}

impl Remembered {
    /// Renders the file content.
    pub fn render(&self) -> String {
        let mut text = String::new();
        if let Some(port) = self.port {
            text.push_str(&format!("port={port}\n"));
        }
        if let Some(address) = &self.address {
            text.push_str(&format!("address={address}\n"));
        }
        text
    }

    /// Parses file content; unknown lines and unreadable values are dropped.
    pub fn parse(text: &str) -> Self {
        let mut remembered = Remembered::default();
        for line in text.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            match key.trim() {
                "port" => {
                    remembered.port = value.trim().parse::<u16>().ok().filter(|port| *port != 0)
                }
                // Deliberately not validated as a URL: the address is only ever
                // handed to the shell to open, and a stricter check here would
                // discard an address the host considers valid.
                "address" => {
                    let value = value.trim();
                    if !value.is_empty() {
                        remembered.address = Some(value.to_string());
                    }
                }
                _ => {}
            }
        }
        remembered
    }
}

/// The console-free twin next to a given executable.
///
/// The autostart shortcut must point at `pmh-tray-gui`: the console companion would
/// open a black window at every login. Deriving the name instead of hard-coding a
/// directory keeps the two binaries together after any copy or move.
pub fn gui_binary_for(companion: &Path) -> PathBuf {
    let name = if cfg!(windows) {
        "pmh-tray-gui.exe"
    } else {
        "pmh-tray-gui"
    };
    let mut path = companion.to_path_buf();
    path.set_file_name(name);
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nothing(_path: &Path) -> bool {
        false
    }

    #[test]
    fn the_argument_beats_the_environment_beats_the_default() {
        assert_eq!(
            resolve_port(Some("3090"), Some("3081")).unwrap(),
            PortChoice {
                port: 3090,
                origin: Origin::Argument
            }
        );
        assert_eq!(
            resolve_port(None, Some("3085")).unwrap(),
            PortChoice {
                port: 3085,
                origin: Origin::Environment
            }
        );
        assert_eq!(
            resolve_port(None, None).unwrap(),
            PortChoice {
                port: DEFAULT_PORT,
                origin: Origin::Default
            }
        );
    }

    #[test]
    fn an_empty_environment_value_falls_through_to_the_default() {
        // `PMH_PORT=` is a statement about nothing, not a demand for port 0.
        assert_eq!(resolve_port(None, Some("")).unwrap().origin, Origin::Default);
    }

    #[test]
    fn unusable_ports_are_rejected_with_the_source_that_carried_them() {
        for raw in ["", "abc", "0", "70000", "30 80", "-1"] {
            let error = resolve_port(Some(raw), None).expect_err(raw);
            assert!(
                error.message.contains("dem Argument"),
                "message must name the source: {}",
                error.message
            );
        }
    }

    #[test]
    fn the_root_is_found_by_walking_up() {
        // The predicate compares the **whole** path, not its tail: `Path::ends_with`
        // would answer "yes" for `<anything>/scripts/start.mjs`, which is exactly how
        // a discovery test can pass while the search is broken.
        let root = PathBuf::from("repo");
        let exe_dir = root.join("native").join("pmh-tray").join("target").join("debug");
        let marker = root.join("scripts").join("start.mjs");
        let exists = |path: &Path| path == marker;
        let found = discover_root(None, Some(&exe_dir), None, &exists);
        assert_eq!(found, Some((root, Origin::NextToExecutable)));
    }

    #[test]
    fn an_explicit_root_that_is_not_one_is_not_replaced_by_a_guess() {
        // PMH_ROOT says "here", and "here" is wrong: reporting no root is the
        // honest answer, walking on would start a different project.
        let named = PathBuf::from("nope");
        let marker = PathBuf::from("repo").join("scripts").join("start.mjs");
        let found = discover_root(
            Some(&named),
            Some(&PathBuf::from("repo").join("native")),
            None,
            &|path: &Path| path == marker,
        );
        assert_eq!(found, None);
    }

    #[test]
    fn bun_is_taken_from_the_environment_first() {
        let exists = |path: &Path| path.ends_with("bun.exe");
        let choice = discover_bun(
            Some(Path::new(r"D:\tools\bun.exe")),
            Some(Path::new(r"C:\Users\someone")),
            None,
            &exists,
        )
        .unwrap();
        assert_eq!(choice.origin, Origin::Environment);
    }

    #[test]
    fn bun_falls_back_to_the_user_profile_then_to_path() {
        // Exact paths again: a tail comparison would accept the profile candidate in
        // the `PATH` branch and hide the order this test is about.
        let profile = PathBuf::from("C:/Users/someone");
        let wanted = profile.join(".bun").join("bin").join("bun.exe");
        let profile_only = |path: &Path| path == wanted;
        let choice = discover_bun(None, Some(&profile), None, &profile_only).unwrap();
        assert_eq!(choice.origin, Origin::UserProfile);
        assert_eq!(choice.path, wanted);

        let in_path = PathBuf::from("C:/tools").join("bun.exe");
        let path_choice = discover_bun(
            None,
            Some(Path::new("C:/nobody")),
            Some("C:/Windows;C:/tools;"),
            &|path: &Path| path == in_path,
        )
        .unwrap();
        assert_eq!(path_choice.origin, Origin::PathVariable);
        assert_eq!(path_choice.path, in_path);
    }

    #[test]
    fn no_bun_anywhere_is_reported_as_absent() {
        assert_eq!(discover_bun(None, Some(Path::new(r"C:\nobody")), Some(""), &nothing), None);
    }

    #[test]
    fn the_paths_hang_off_the_root() {
        let paths = Paths::from_root(PathBuf::from(r"C:\repo"));
        assert_eq!(paths.start_script, PathBuf::from(r"C:\repo").join("scripts/start.mjs"));
        assert!(paths.state.ends_with("pmh-tray.state"));
        assert!(paths.log.ends_with("pmh-tray.log"));
    }

    #[test]
    fn the_state_file_round_trips_and_ignores_junk() {
        let remembered = Remembered {
            port: Some(3081),
            address: Some("http://127.0.0.1:3081/?token=abcdefghij".into()),
        };
        assert_eq!(Remembered::parse(&remembered.render()), remembered);

        let junk = Remembered::parse("port=kaputt\naddress=\nnonsense\nport=0\n");
        assert_eq!(junk, Remembered::default());
    }

    #[test]
    fn the_gui_twin_is_derived_from_its_companions_own_folder() {
        let companion = if cfg!(windows) {
            Path::new(r"D:\pmh\pmh-tray.exe")
        } else {
            Path::new("/opt/pmh/pmh-tray")
        };
        let expected = if cfg!(windows) {
            PathBuf::from(r"D:\pmh\pmh-tray-gui.exe")
        } else {
            PathBuf::from("/opt/pmh/pmh-tray-gui")
        };
        assert_eq!(gui_binary_for(companion), expected);
        // Whatever the folder is, the twin stays in it.
        assert_eq!(gui_binary_for(companion).parent(), companion.parent());
    }
}
