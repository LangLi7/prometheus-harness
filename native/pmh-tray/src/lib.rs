//! `pmh-tray` — the Prometheus Harness in the Windows notification area.
//!
//! Start, stop, open and autostart, from the icon the operator already looks at.
//!
//! ## Why this is a separate process and not part of the core
//!
//! `native/README.md` states the binding rule: *the JS core stays the kernel, every
//! other language is a service it calls.* This program is the other direction — a
//! native front end that calls the core — and it keeps the same boundary: it spawns
//! a process and reads its output. No addon, no ABI question, and the harness runs
//! exactly as `bun run start` runs it.
//!
//! ## What it deliberately does not do
//!
//! - **No service, no boot start.** Autostart means "at login", in
//!   `HKCU\…\CurrentVersion\Run` — the list the task manager itself shows. A
//!   start before login would need administrator rights and would be a background
//!   daemon, which is not what an icon in the notification area is.
//! - **No replacement of PostgreSQL or Docker.** The harness needs its database;
//!   the tray reports what is listening instead of pretending to provide one.
//! - **No hidden lifecycle.** Quitting the tray stops the harness (the job object
//!   is closed with it), and the menu says so in the item's own label.

pub mod autostart;
pub mod boot;
pub mod config;
pub mod health;
pub mod proc;
pub mod token;
#[cfg(windows)]
pub mod traywin;

/// Everything went as asked.
pub const EXIT_OK: i32 = 0;
/// The command line made no sense.
pub const EXIT_USAGE: i32 = 2;
/// Another tray already holds the single-instance claim.
pub const EXIT_ALREADY_RUNNING: i32 = 3;
/// The question was answered, and the answer is "not running".
pub const EXIT_NOT_RUNNING: i32 = 4;
/// Something else failed; the message says what.
pub const EXIT_FAILURE: i32 = 125;

/// Version of this program, for `--version`.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
