//! Autostart über eine Verknüpfung im Startup-Ordner.
//!
//! Der Betreiber hat den Ausschlag gegeben: *„wegen autostart kann man ja
//! Verknüpfung dafür nutzen: …\Start Menu\Programs\Startup"*. Das ist der bessere
//! Weg, und zwar nicht nur der kürzere:
//!
//! | | Verknüpfung im Startup-Ordner | Registry (`HKCU\…\Run`) |
//! |---|---|---|
//! | sichtbar | **ja**, eine Datei mit Namen | nein, ein Wert in einem Schlüssel |
//! | löschen | Datei löschen | Werkzeug oder Skript nötig |
//! | Rechte | keine (im Ordner des Benutzers) | keine |
//! | Task-Manager | erscheint unter „Autostart von Apps" | erscheint dort auch |
//!
//! Der Registry-Weg ist damit **nicht** kaputt, nur unnötig: dieselbe Wirkung mit
//! weniger Code und einem Gegenstand, den man anfassen kann. Der frühere Code lag
//! hier und ist ersetzt, nicht vergessen.
//!
//! ## Zwei Startup-Ordner, die man nicht verwechseln darf
//!
//! - **`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`** — dieser
//!   Benutzer, **ohne** Administratorrechte. Das ist der Ordner, den dieses
//!   Programm benutzt.
//! - `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup` — **alle**
//!   Benutzer, Schreiben braucht **Administratorrechte**. Wer den meint, muss die
//!   Verknüpfung selbst mit erhöhten Rechten hineinlegen.

use std::path::{Path, PathBuf};

/// Name der Verknüpfung. Der Name ist der, den der Task-Manager anzeigt.
pub const SHORTCUT_NAME: &str = "Prometheus Harness.lnk";

/// Was gerade gilt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum State {
    /// Keine Verknüpfung.
    Absent,
    /// Eine Verknüpfung liegt dort.
    Present {
        /// Der volle Pfad der Verknüpfung.
        path: PathBuf,
    },
}

impl State {
    /// Ob Autostart eingeschaltet ist.
    pub fn is_enabled(&self) -> bool {
        matches!(self, State::Present { .. })
    }
}

/// Der Startup-Ordner **dieses** Benutzers.
///
/// `%APPDATA%` wird übergeben statt gelesen, damit die Rechnung prüfbar bleibt.
pub fn startup_folder(app_data: &Path) -> PathBuf {
    app_data
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup")
}

/// Der volle Pfad der Verknüpfung.
pub fn shortcut_path(app_data: &Path) -> PathBuf {
    startup_folder(app_data).join(SHORTCUT_NAME)
}

/// `%APPDATA%` aus der Umgebung.
fn app_data_from_environment() -> Result<PathBuf, String> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "APPDATA ist nicht gesetzt — der Startup-Ordner ist unbekannt.".to_string())
}

/// Liest den aktuellen Zustand.
///
/// Geprüft wird die **Existenz** der Verknüpfung. Ihr Ziel auszulesen bräuchte COM
/// (das `.lnk`-Format ist binär); die Datei zu löschen und neu anzulegen ist
/// billiger und sagt dasselbe.
pub fn query() -> Result<State, String> {
    let path = shortcut_path(&app_data_from_environment()?);
    if path.is_file() {
        Ok(State::Present { path })
    } else {
        Ok(State::Absent)
    }
}

/// Ob Autostart eingeschaltet ist.
pub fn is_enabled() -> bool {
    matches!(query(), Ok(State::Present { .. }))
}

/// Ein Pfad als PowerShell-Literal in einfachen Anführungszeichen.
///
/// In PowerShell verdoppelt man ein einfaches Anführungszeichen, um es zu
/// maskieren; alles andere ist darin wörtlich. Das ist der Grund, warum hier keine
/// doppelten Anführungszeichen stehen: in denen würde `$` interpoliert, und ein
/// Pfad mit `$` wäre dann ein Befehl.
pub fn ps_literal(path: &Path) -> String {
    format!("'{}'", path.display().to_string().replace('\'', "''"))
}

/// Das PowerShell-Skript, das die Verknüpfung anlegt.
///
/// Es benutzt `WScript.Shell` — den Weg, den Windows selbst für Verknüpfungen
/// anbietet. Damit braucht dieses Programm keine COM-Anbindung und keinen
/// `.lnk`-Schreiber; es startet einen Prozess, wie es die Regel dieses
/// Arbeitsbereichs für jede fremde Fähigkeit verlangt.
pub fn create_script(executable: &Path, working_directory: &Path, shortcut: &Path) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'\n\
         $folder = Split-Path -Parent {shortcut}\n\
         New-Item -ItemType Directory -Force -Path $folder | Out-Null\n\
         $shell = New-Object -ComObject WScript.Shell\n\
         $link = $shell.CreateShortcut({shortcut})\n\
         $link.TargetPath = {target}\n\
         $link.WorkingDirectory = {working}\n\
         $link.Description = 'Prometheus Harness'\n\
         $link.IconLocation = {icon}\n\
         $link.Save()\n",
        shortcut = ps_literal(shortcut),
        target = ps_literal(executable),
        working = ps_literal(working_directory),
        icon = ps_literal(&PathBuf::from(format!("{},0", executable.display()))),
    )
}

/// Legt die Verknüpfung an und gibt ihren Pfad zurück.
pub fn enable(executable: &Path, working_directory: &Path) -> Result<PathBuf, String> {
    if !executable.is_file() {
        return Err(format!(
            "{} fehlt — die Verknüpfung wuerde ins Leere zeigen.",
            executable.display()
        ));
    }
    let shortcut = shortcut_path(&app_data_from_environment()?);
    let script = create_script(executable, working_directory, &shortcut);
    let mut command = std::process::Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    // The tray is a GUI process, so Windows would give this console-subsystem
    // child a fresh console window. It exists for a few milliseconds and is the
    // exact flash the tray is supposed to avoid.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let outcome = command
        .output()
        .map_err(|error| format!("PowerShell liess sich nicht starten: {error}"))?;
    if !outcome.status.success() {
        let error = String::from_utf8_lossy(&outcome.stderr);
        return Err(format!(
            "die Verknuepfung wurde nicht angelegt (PowerShell exit {}): {}",
            outcome.status.code().unwrap_or(-1),
            error.trim()
        ));
    }
    if !shortcut.is_file() {
        return Err(format!(
            "PowerShell meldete Erfolg, aber {} fehlt.",
            shortcut.display()
        ));
    }
    Ok(shortcut)
}

/// Entfernt die Verknüpfung. Eine fehlende Verknüpfung ist Erfolg: der gewünschte
/// Zustand ist erreicht.
pub fn disable() -> Result<bool, String> {
    let path = shortcut_path(&app_data_from_environment()?);
    if !path.is_file() {
        return Ok(false);
    }
    std::fs::remove_file(&path)
        .map_err(|error| format!("{} liess sich nicht loeschen: {error}", path.display()))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shortcut_lives_in_this_users_startup_folder() {
        let app_data = Path::new("C:/Users/someone/AppData/Roaming");
        let path = shortcut_path(app_data);
        assert!(path.starts_with(app_data));
        assert!(path.ends_with(SHORTCUT_NAME));
        assert!(path.parent().unwrap().ends_with("Startup"));
        // The all-users folder needs administrator rights and is therefore not the
        // one this program touches. Naming it here keeps the distinction visible.
        assert!(!path.display().to_string().contains("ProgramData"));
    }

    #[test]
    fn a_missing_entry_is_not_enabled() {
        assert!(!State::Absent.is_enabled());
        assert!(State::Present {
            path: PathBuf::from("x.lnk")
        }
        .is_enabled());
    }

    #[test]
    fn a_quote_in_a_path_is_doubled_for_powershell() {
        assert_eq!(ps_literal(Path::new("C:/a b/c")), "'C:/a b/c'");
        assert_eq!(ps_literal(Path::new("C:/it's/x")), "'C:/it''s/x'");
    }

    #[test]
    fn the_script_points_at_the_given_target_and_folder() {
        let script = create_script(
            Path::new("C:/pmh/pmh-tray-gui.exe"),
            Path::new("C:/repo"),
            Path::new("C:/Users/x/Startup/Prometheus Harness.lnk"),
        );
        assert!(script.contains("$link.TargetPath = 'C:/pmh/pmh-tray-gui.exe'"));
        assert!(script.contains("$link.WorkingDirectory = 'C:/repo'"));
        assert!(script.contains("Prometheus Harness.lnk"));
        // A shortcut without Save() is a file that is never written.
        assert!(script.contains("$link.Save()"));
        assert!(script.contains("New-Item"));
    }

    #[test]
    fn enabling_refuses_a_target_that_does_not_exist() {
        // Refusing beats writing a shortcut into nothing: at login it would fail
        // silently, which is the failure mode this repository keeps naming.
        let error = enable(Path::new("C:/does/not/exist.exe"), Path::new("C:/repo"))
            .expect_err("a missing target must be refused");
        assert!(error.contains("fehlt"));
    }

    #[test]
    fn querying_reports_instead_of_failing() {
        // A real answer depends on the machine; a query must not be a crash path.
        let _ = query();
    }
}
