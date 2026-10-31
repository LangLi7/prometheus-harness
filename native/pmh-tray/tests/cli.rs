//! Contract tests for the console companion.
//!
//! These check the part a human types: the documented flags, the exit codes and
//! the fact that a status line actually names the things it claims. The unit tests
//! inside the library cover the parsing and discovery logic; this file checks that
//! the binary wired it together the way the README says.

use std::process::Command;

/// The binary under test, as built by cargo for this test run.
fn tray() -> Command {
    Command::new(env!("CARGO_BIN_EXE_pmh-tray"))
}

#[test]
fn help_lists_every_documented_switch() {
    let outcome = tray().arg("--help").output().expect("run pmh-tray --help");
    assert!(outcome.status.success(), "--help must succeed");
    let text = String::from_utf8_lossy(&outcome.stdout);
    for switch in [
        "--status",
        "--autostart",
        "--probe-tray",
        "--tray",
        "--port",
        "--version",
    ] {
        assert!(text.contains(switch), "--help must mention {switch}:\n{text}");
    }
}

#[test]
fn version_reports_the_package_version() {
    let outcome = tray().arg("--version").output().expect("run --version");
    assert!(outcome.status.success());
    let text = String::from_utf8_lossy(&outcome.stdout);
    assert!(
        text.contains(env!("CARGO_PKG_VERSION")),
        "version output must carry the crate version:\n{text}"
    );
}

#[test]
fn an_unknown_switch_is_rejected_with_exit_code_2() {
    // A silently ignored typo starts something other than what the caller meant —
    // the reason `scripts/start.mjs` reports unknown switches too.
    let outcome = tray().arg("--stats").output().expect("run --stats");
    assert_eq!(outcome.status.code(), Some(2), "usage errors exit 2");
    let text = String::from_utf8_lossy(&outcome.stderr);
    assert!(text.contains("--stats"), "the message names the switch:\n{text}");
}

#[test]
fn autostart_without_a_value_is_rejected() {
    let outcome = tray().arg("--autostart").output().expect("run --autostart");
    assert_eq!(outcome.status.code(), Some(2));
    let text = String::from_utf8_lossy(&outcome.stderr);
    assert!(text.contains("on, off oder query"), "the message says what is allowed:\n{text}");
}

#[test]
fn an_unusable_port_is_rejected_before_anything_starts() {
    let outcome = tray()
        .args(["--status", "--port", "0"])
        .output()
        .expect("run --status --port 0");
    assert_eq!(outcome.status.code(), Some(125), "a bad value is a real failure");
    let text = String::from_utf8_lossy(&outcome.stderr);
    assert!(text.contains("Port"), "the message names the value:\n{text}");
}

#[test]
fn status_names_the_facts_it_reports() {
    let outcome = tray().arg("--status").output().expect("run --status");
    // Whether a harness runs is the machine's business; the shape of the answer is
    // this program's. Exit 0 = runs, exit 4 = does not — both are answers.
    let code = outcome.status.code();
    assert!(
        code == Some(0) || code == Some(4),
        "status exits 0 (running) or 4 (not running), got {code:?}"
    );
    let text = String::from_utf8_lossy(&outcome.stdout);
    for label in ["Wurzel:", "Bun:", "Port:", "Zustand:", "Adresse:", "Autostart:", "Protokoll:"] {
        assert!(text.contains(label), "status must print {label}\n{text}");
    }
}
