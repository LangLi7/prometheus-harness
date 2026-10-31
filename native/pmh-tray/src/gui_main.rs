//! `pmh-tray-gui` — the icon, without a console window.
//!
//! This is the binary the autostart entry points at. The Windows subsystem matters
//! here and only here: with a console subsystem, every login would open a black
//! window that never goes away. The console companion (`pmh-tray`) keeps its
//! console, because a human types there and expects an answer.
//!
//! Failure has nowhere to go in a console-free process, so it goes to the log —
//! the one place where a reason survives after the window that would have shown it
//! does not exist.

#![windows_subsystem = "windows"]

use pmh_tray::{boot, EXIT_FAILURE};

fn main() {
    std::process::exit(run());
}

fn run() -> i32 {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let port_argument = port_from(&arguments);
    match boot::prepare(port_argument.as_deref()) {
        Ok(prepared) => {
            let paths = prepared.paths.clone();
            let code = pmh_tray::traywin::run(prepared.paths, prepared.bun, prepared.port);
            if code != 0 {
                boot::log_line(
                    &paths,
                    &format!("das Tray endete mit Code {code} (siehe vorherige Zeilen)"),
                );
            }
            code
        }
        Err(message) => {
            // Without a repository root there is no `.pmh-build` to log into, so the
            // temporary directory stands in. Losing the reason entirely would make
            // "nothing happened at login" undiagnosable.
            let fallback = pmh_tray::config::Paths {
                root: std::env::temp_dir(),
                start_script: std::env::temp_dir(),
                state: std::env::temp_dir().join("pmh-tray.state"),
                log: std::env::temp_dir().join("pmh-tray.log"),
            };
            boot::log_line(&fallback, &format!("Start gescheitert: {message}"));
            EXIT_FAILURE
        }
    }
}

/// Reads `--port <n>` / `--port=<n>`; everything else is ignored here.
///
/// Ignoring unknown arguments on purpose: this front end is started by the shell at
/// login, and refusing to show an icon because of an argument it does not know
/// would turn a harmless extra switch into "the tray stopped working".
fn port_from(arguments: &[String]) -> Option<String> {
    let mut found = None;
    let mut index = 0usize;
    while index < arguments.len() {
        let argument = arguments[index].as_str();
        if argument == "--port" {
            found = arguments.get(index + 1).cloned();
            index += 2;
            continue;
        }
        if let Some(value) = argument.strip_prefix("--port=") {
            found = Some(value.to_string());
        }
        index += 1;
    }
    found
}
