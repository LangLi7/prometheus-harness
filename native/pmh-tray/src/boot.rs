//! Finding the pieces once, for both front ends.
//!
//! The console companion (`pmh-tray`) and the tray itself (`pmh-tray-gui`) need the
//! same answers: which repository, which Bun, which port. Two copies of that logic
//! would eventually disagree, and the disagreement would look like "autostart works
//! but the icon does not".

use crate::config::{self, BunChoice, Paths, PortChoice};
use std::path::{Path, PathBuf};

/// One **reported** fact: the value and where it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fact {
    /// What was found.
    pub value: String,
    /// Where it came from, in German, for the report line.
    pub origin: String,
}

impl Fact {
    /// The report line, e.g. `Wurzel: C:\repo (aus dem Programmordner)`.
    pub fn line(&self, label: &str) -> String {
        format!("{label}: {} (aus {})", self.value, self.origin)
    }
}

/// Everything a front end needs before it can do anything.
#[derive(Debug, Clone)]
pub struct Prepared {
    /// Repository root and derived paths.
    pub paths: Paths,
    /// The Bun executable.
    pub bun: BunChoice,
    /// The port and its source.
    pub port: PortChoice,
    /// Where the root was found.
    pub root: Fact,
    /// Where Bun was found.
    pub bun_fact: Fact,
}

/// Collects the facts from the real environment.
///
/// Every failure names the thing that is missing and the place it was looked for.
/// A tray that starts and then does nothing is the failure mode this function
/// exists to prevent.
pub fn prepare(port_argument: Option<&str>) -> Result<Prepared, String> {
    let root_environment = std::env::var_os("PMH_ROOT").map(PathBuf::from);
    let exe = std::env::current_exe().ok();
    let exe_dir = exe.as_deref().and_then(Path::parent).map(Path::to_path_buf);
    let working_directory = std::env::current_dir().ok();
    let is_file = |path: &Path| path.is_file();

    let root = config::discover_root(
        root_environment.as_deref(),
        exe_dir.as_deref(),
        working_directory.as_deref(),
        &is_file,
    );
    let Some((root, root_origin)) = root else {
        let hint = match &root_environment {
            Some(named) => format!(
                "PMH_ROOT zeigt auf {}, dort liegt keine {}",
                named.display(),
                config::ROOT_MARKER
            ),
            None => format!(
                "weder der Programmordner noch das Arbeitsverzeichnis enthalten {}",
                config::ROOT_MARKER
            ),
        };
        return Err(format!(
            "das Projekt wurde nicht gefunden: {hint}. Abhilfe: PMH_ROOT auf den Ordner mit {} setzen.",
            config::ROOT_MARKER
        ));
    };

    let bun_environment = std::env::var_os("PMH_BUN").map(PathBuf::from);
    let user_profile = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let path_variable = std::env::var_os("PATH").map(|value| value.to_string_lossy().to_string());
    let bun = config::discover_bun(
        bun_environment.as_deref(),
        user_profile.as_deref(),
        path_variable.as_deref(),
        &is_file,
    );
    let Some(bun) = bun else {
        return Err(format!(
            "Bun wurde nicht gefunden: weder PMH_BUN noch {}\\.bun\\bin\\bun.exe noch ein bun.exe in PATH. \
             Abhilfe: scripts\\install.cmd ausfuehren oder PMH_BUN setzen.",
            user_profile
                .as_deref()
                .map(|profile| profile.display().to_string())
                .unwrap_or_else(|| "%USERPROFILE%".to_string())
        ));
    };

    let port_environment = std::env::var("PMH_PORT").ok();
    let port = config::resolve_port(port_argument, port_environment.as_deref())
        .map_err(|error| error.message)?;

    let root_fact = Fact {
        value: root.display().to_string(),
        origin: root_origin.label().to_string(),
    };
    let bun_fact = Fact {
        value: bun.path.display().to_string(),
        origin: bun.origin.label().to_string(),
    };

    Ok(Prepared {
        paths: Paths::from_root(root),
        bun,
        port,
        root: root_fact,
        bun_fact,
    })
}

/// Appends one line to the tray log.
///
/// Used for every failure of the console-free front end: when nobody sees stdout,
/// the log is the only place a reason can survive.
pub fn log_line(paths: &Paths, text: &str) {
    if let Some(parent) = paths.log.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.log)
    {
        use std::io::Write;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[pmh-tray {stamp}] {text}");
    }
}
