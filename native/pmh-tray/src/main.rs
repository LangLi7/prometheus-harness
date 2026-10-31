//! `pmh-tray` — the console companion: status, autostart, and a tray with a console.
//!
//! The icon itself lives in `pmh-tray-gui.exe`, built with the Windows subsystem so
//! it can start at login **without** a console window appearing. This binary is the
//! one a human types, and it therefore keeps its console: asking `--status` and
//! seeing nothing would be the kind of quiet failure this repository keeps naming.
//!
//! ```text
//! pmh-tray                       diese Uebersicht
//! pmh-tray --status              Zustand, Port, Adresse, Autostart
//! pmh-tray --autostart on|off|query
//! pmh-tray --probe-tray          beweist, dass der Infobereich das Symbol nimmt
//! pmh-tray --tray                das Tray mit Konsole starten (zum Suchen)
//! ```

use pmh_tray::{
    autostart, boot, config, health, traywin, EXIT_ALREADY_RUNNING, EXIT_FAILURE, EXIT_NOT_RUNNING,
    EXIT_OK, EXIT_USAGE, VERSION,
};

const HELP: &str = "Aufruf: pmh-tray [Schalter]

  --status                  Zustand, Port, Adresse und Autostart berichten
  --autostart on|off|query  Autostart beim Anmelden schalten oder abfragen
  --probe-tray              pruefen, ob der Infobereich das Symbol annimmt
  --tray                    das Tray in diesem Konsolenfenster starten
  --port <n>                Port fuer Meldungen und Start (Vorgabe 3080)
  --version                 Fassung ausgeben
  --help, -h                diese Uebersicht

Umgebung: PMH_ROOT (Projektordner), PMH_BUN (Bun-Pfad), PMH_PORT (Port).
Das Icon selbst ist pmh-tray-gui.exe — ohne Konsolenfenster, fuer den Autostart.
";

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(run(&arguments));
}

fn run(arguments: &[String]) -> i32 {
    let mut action: Option<Action> = None;
    let mut port_argument: Option<String> = None;
    let mut index = 0usize;
    while index < arguments.len() {
        let argument = arguments[index].as_str();
        match argument {
            "--help" | "-h" => action = Some(Action::Help),
            "--version" => action = Some(Action::Version),
            "--status" => action = Some(Action::Status),
            "--probe-tray" => action = Some(Action::ProbeTray),
            "--tray" => action = Some(Action::Tray),
            "--autostart" => {
                match arguments.get(index + 1).map(String::as_str) {
                    Some("on") => action = Some(Action::Autostart(AutostartAction::On)),
                    Some("off") => action = Some(Action::Autostart(AutostartAction::Off)),
                    Some("query") => action = Some(Action::Autostart(AutostartAction::Query)),
                    other => {
                        eprintln!(
                            "FEHLER: --autostart braucht on, off oder query (gelesen: {})",
                            other.unwrap_or("nichts")
                        );
                        return EXIT_USAGE;
                    }
                }
                index += 2;
                continue;
            }
            "--port" => match arguments.get(index + 1) {
                Some(value) => {
                    port_argument = Some(value.clone());
                    // Skip the value: without this, `--port 3080` would read 3080 as
                    // an unknown switch and refuse a command line the README shows.
                    index += 2;
                    continue;
                }
                None => {
                    eprintln!("FEHLER: --port braucht eine Zahl.");
                    return EXIT_USAGE;
                }
            },
            other if other.starts_with("--port=") => {
                port_argument = Some(other["--port=".len()..].to_string());
            }
            other => {
                eprintln!("FEHLER: unbekannter Schalter: {other}");
                eprintln!("Die vollstaendige Liste steht in `pmh-tray --help`.");
                return EXIT_USAGE;
            }
        }
        index += 1;
    }

    match action.unwrap_or(Action::Help) {
        Action::Help => {
            print!("{HELP}");
            EXIT_OK
        }
        Action::Version => {
            println!("pmh-tray {VERSION}");
            EXIT_OK
        }
        Action::Status => status(port_argument.as_deref()),
        Action::Autostart(what) => autostart_mode(what),
        Action::ProbeTray => probe_tray(),
        Action::Tray => tray_mode(port_argument.as_deref()),
    }
}

/// What the caller asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Action {
    Help,
    Version,
    Status,
    Autostart(AutostartAction),
    ProbeTray,
    Tray,
}

/// The three autostart requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AutostartAction {
    On,
    Off,
    Query,
}

/// Reports what is true right now, one fact per line.
fn status(port_argument: Option<&str>) -> i32 {
    let prepared = match boot::prepare(port_argument) {
        Ok(prepared) => prepared,
        Err(message) => {
            eprintln!("FEHLER: {message}");
            return EXIT_FAILURE;
        }
    };
    let port = prepared.port.port;
    let running = health::is_open(port);
    let remembered = std::fs::read_to_string(&prepared.paths.state)
        .map(|text| config::Remembered::parse(&text))
        .unwrap_or_default();
    let autostart_state = autostart::query();

    println!("{}", prepared.root.line("Wurzel"));
    println!("{}", prepared.bun_fact.line("Bun"));
    println!("Port: {port} (aus {})", prepared.port.origin.label());
    println!(
        "Zustand: {} — TCP-Probe auf 127.0.0.1:{port}",
        if running { "laeuft" } else { "gestoppt" }
    );
    // An address for a different port is not this address: saying it would open
    // something that is not running.
    match (remembered.address.as_deref(), remembered.port) {
        (Some(address), Some(known)) if known == port => println!("Adresse: {address}"),
        (Some(_), Some(_)) => println!("Adresse: (gemerkt fuer einen anderen Port — nicht giltig)"),
        (None, _) => println!("Adresse: (noch nicht gemeldet — sie erscheint nach dem ersten Start)"),
        (Some(address), None) => println!("Adresse: {address}"),
    }
    match autostart_state {
        Ok(state) => println!(
            "Autostart: {}",
            match state {
                autostart::State::Present { path } => {
                    format!("eingetragen — {}", path.display())
                }
                autostart::State::Absent => "nicht eingetragen".to_string(),
            }
        ),
        Err(message) => println!("Autostart: unbekannt — {message}"),
    }
    println!("Protokoll: {}", prepared.paths.log.display());
    if running {
        EXIT_OK
    } else {
        EXIT_NOT_RUNNING
    }
}

/// Switches or reports the autostart shortcut.
fn autostart_mode(what: AutostartAction) -> i32 {
    match what {
        AutostartAction::Query => match autostart::query() {
            Ok(autostart::State::Present { path }) => {
                println!("Autostart: eingetragen — {}", path.display());
                EXIT_OK
            }
            Ok(autostart::State::Absent) => {
                println!("Autostart: nicht eingetragen");
                EXIT_NOT_RUNNING
            }
            Err(message) => {
                eprintln!("FEHLER: {message}");
                EXIT_FAILURE
            }
        },
        AutostartAction::Off => match autostart::disable() {
            Ok(true) => {
                println!("Verknuepfung entfernt.");
                EXIT_OK
            }
            Ok(false) => {
                println!("Es war keine Verknuepfung eingetragen — nichts zu tun.");
                EXIT_OK
            }
            Err(message) => {
                eprintln!("FEHLER: {message}");
                EXIT_FAILURE
            }
        },
        AutostartAction::On => {
            let prepared = match boot::prepare(None) {
                Ok(prepared) => prepared,
                Err(message) => {
                    eprintln!("FEHLER: {message}");
                    return EXIT_FAILURE;
                }
            };
            // The shortcut must point at the **console-free** binary: at login, a
            // console window would otherwise appear and never go away.
            let gui = match std::env::current_exe() {
                Ok(current) => config::gui_binary_for(&current),
                Err(error) => {
                    eprintln!("FEHLER: der eigene Programmweg ist unbekannt: {error}");
                    return EXIT_FAILURE;
                }
            };
            match autostart::enable(&gui, &prepared.paths.root) {
                Ok(path) => {
                    println!("Verknuepfung angelegt: {}", path.display());
                    println!("Sie zeigt auf: {}", gui.display());
                    println!("Der Task-Manager listet sie unter \"Autostart von Apps\".");
                    println!("Loeschen: `pmh-tray --autostart off` oder die Datei selbst entfernen.");
                    EXIT_OK
                }
                Err(message) => {
                    eprintln!("FEHLER: {message}");
                    EXIT_FAILURE
                }
            }
        }
    }
}

/// Proves that the notification area accepts our icon.
fn probe_tray() -> i32 {
    #[cfg(windows)]
    {
        traywin::probe()
    }
    #[cfg(not(windows))]
    {
        eprintln!("Das Tray gibt es nur unter Windows.");
        EXIT_FAILURE
    }
}

/// Runs the tray with a console attached, for looking for trouble.
fn tray_mode(port_argument: Option<&str>) -> i32 {
    let prepared = match boot::prepare(port_argument) {
        Ok(prepared) => prepared,
        Err(message) => {
            eprintln!("FEHLER: {message}");
            return EXIT_FAILURE;
        }
    };
    println!("{}", prepared.root.line("Wurzel"));
    println!("{}", prepared.bun_fact.line("Bun"));
    println!("{}", prepared.port.report());
    #[cfg(windows)]
    {
        let code = traywin::run(prepared.paths.clone(), prepared.bun.clone(), prepared.port.clone());
        if code == EXIT_ALREADY_RUNNING {
            println!("Es laeuft bereits ein Tray — dieses Programm beendet sich wieder.");
        }
        code
    }
    #[cfg(not(windows))]
    {
        eprintln!("Das Tray gibt es nur unter Windows.");
        EXIT_FAILURE
    }
}
