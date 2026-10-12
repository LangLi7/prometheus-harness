//! `pmh-flock` — one advisory file-lock attempt, as a process.
//!
//! ```text
//! pmh-flock --path <file> [--shared] [--wait-ms <n>] [--hold-ms <n>] [--daemon]
//! pmh-flock --fd <n>      [--shared] [--wait-ms <n>]
//! pmh-flock --inspect --path <file>
//! pmh-flock --inspect --fd <n>
//! pmh-flock --probe
//! ```
//!
//! Success prints one line of JSON on stdout and exits 0. Failure prints one
//! JSON object on stderr and exits [`EXIT_CONTENTION`] when the failure is lock
//! contention, otherwise [`EXIT_FAILURE`].
//!
//! See `README.md` for the lock-lifetime consequence of running the lock in a
//! process, and `docs/reference/inventory-native-contracts.md` for the full
//! contract this program preserves.

use pmh_flock::{
    identity_of, try_lock, DescriptorIdentity, LockError, LockKind, Report, ERR_UNSUPPORTED_PLATFORM,
    EXIT_FAILURE, SYSCALL,
};

/// What the caller asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Action {
    /// Take a lock and keep holding it according to the lifetime options.
    Lock {
        target: Target,
        kind: LockKind,
        wait_ms: Option<u64>,
        hold_ms: Option<u64>,
        daemon: bool,
    },
    /// Report the target's identity and exit without locking.
    Inspect { target: Target },
    /// Report whether this host supports flock at all.
    Probe,
}

/// What to lock: a path this program opens, or a descriptor the caller owns.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Target {
    Path(String),
    Fd(i32),
}

fn usage_error(message: &str) -> ! {
    eprintln!(
        "{}",
        LockError::other("ERR_FLOCK_USAGE", message).to_json()
    );
    std::process::exit(EXIT_FAILURE);
}

fn parse_args(args: &[String]) -> Action {
    let mut path: Option<String> = None;
    let mut fd: Option<i32> = None;
    let mut shared = false;
    let mut wait_ms: Option<u64> = None;
    let mut hold_ms: Option<u64> = None;
    let mut daemon = false;
    let mut inspect = false;
    let mut probe = false;

    let mut index = 0usize;
    while index < args.len() {
        let arg = args[index].as_str();
        // Read the value of a flag that takes exactly one. Deliberately a plain
        // function rather than a closure over `index`, so the loop stays free to
        // advance it.
        let value_of = |at: usize, name: &str| -> String {
            match args.get(at + 1) {
                Some(value) => value.clone(),
                None => usage_error(&format!("{name} requires a value")),
            }
        };
        match arg {
            "--probe" => {
                probe = true;
                index += 1;
            }
            "--inspect" => {
                inspect = true;
                index += 1;
            }
            "--shared" => {
                shared = true;
                index += 1;
            }
            "--daemon" => {
                daemon = true;
                index += 1;
            }
            "--path" => {
                path = Some(value_of(index, "--path"));
                index += 2;
            }
            "--fd" => {
                let raw = value_of(index, "--fd");
                match raw.parse::<i32>() {
                    Ok(value) if value >= 0 => fd = Some(value),
                    _ => usage_error("--fd must be a non-negative integer descriptor"),
                }
                index += 2;
            }
            "--wait-ms" => {
                let raw = value_of(index, "--wait-ms");
                match raw.parse::<u64>() {
                    Ok(value) => wait_ms = Some(value),
                    Err(_) => usage_error("--wait-ms must be a non-negative integer"),
                }
                index += 2;
            }
            "--hold-ms" => {
                let raw = value_of(index, "--hold-ms");
                match raw.parse::<u64>() {
                    Ok(value) => hold_ms = Some(value),
                    Err(_) => usage_error("--hold-ms must be a non-negative integer"),
                }
                index += 2;
            }
            other => usage_error(&format!("unknown argument: {other}")),
        }
    }

    if probe {
        return Action::Probe;
    }

    let target = match (path, fd) {
        (Some(_), Some(_)) => usage_error("--path and --fd are mutually exclusive"),
        (Some(path), None) => Target::Path(path),
        (None, Some(fd)) => Target::Fd(fd),
        (None, None) => usage_error("one of --path or --fd is required"),
    };

    if inspect {
        if wait_ms.is_some() || hold_ms.is_some() || daemon || shared {
            usage_error("--inspect does not lock and takes no lock options");
        }
        return Action::Inspect { target };
    }

    Action::Lock {
        target,
        kind: if shared {
            LockKind::Shared
        } else {
            LockKind::Exclusive
        },
        wait_ms,
        hold_ms,
        daemon,
    }
}

fn fail(error: &LockError) -> ! {
    eprintln!("{}", error.to_json());
    std::process::exit(error.exit_code());
}

fn succeed(identity: Option<DescriptorIdentity>, kind: LockKind) {
    let report = Report::locked(kind).to_json();
    match identity {
        Some(identity) => {
            // Splice the identity into the same one-line report so a caller
            // needs exactly one parse. `report` ends with `}`.
            let with_identity = format!(
                "{},\"identity\":{}}}",
                report.trim_end_matches('}'),
                identity.to_json()
            );
            println!("{with_identity}");
        }
        None => println!("{report}"),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let action = parse_args(&args);

    // `--probe` answers a question, so it must answer it on every host.
    //
    // Placing the platform gate before the probe would make the probe fail
    // exactly where its answer matters most: the caller wants to learn that this
    // host cannot lock, and exiting non-zero with no diagnosis conflates "asked
    // and answered" with "could not ask".
    if action == Action::Probe {
        println!(
            "{{\"version\":{},\"syscall\":\"{}\",\"supported\":{},\"platform\":\"{}-{}\"}}",
            pmh_flock::REPORT_VERSION,
            SYSCALL,
            pmh_flock::platform_supports_flock(),
            std::env::consts::OS,
            std::env::consts::ARCH
        );
        std::process::exit(0);
    }

    if !pmh_flock::platform_supports_flock() {
        fail(&LockError::other(
            ERR_UNSUPPORTED_PLATFORM,
            format!(
                "flock is not supported on {}-{}",
                std::env::consts::OS,
                std::env::consts::ARCH
            ),
        ));
    }

    match action {
        // Answered above, before the platform gate.
        Action::Probe => unreachable!("probe is answered before the platform check"),
        Action::Inspect { target } => match open_target(&target) {
            Ok(handle) => {
                let report = match handle.identity() {
                    Ok(identity) => identity.to_json(),
                    Err(error) => fail(&error),
                };
                println!("{{\"version\":1,\"syscall\":\"{}\",\"identity\":{report}}}", SYSCALL);
                std::process::exit(0);
            }
            Err(error) => fail(&error),
        },
        Action::Lock {
            target,
            kind,
            wait_ms,
            hold_ms,
            daemon,
        } => {
            let handle = match open_target(&target) {
                Ok(handle) => handle,
                Err(error) => fail(&error),
            };
            let identity = handle.identity().ok();
            if let Err(error) = handle.lock(kind, wait_ms) {
                fail(&error);
            }
            succeed(identity, kind);
            // The lock lives on this descriptor, so it lives exactly as long as
            // this process keeps it open.
            handle.hold(hold_ms, daemon);
            std::process::exit(0);
        }
    }
}

/// A held descriptor: opened by this program in path mode, borrowed in fd mode.
enum Handle {
    Owned(std::fs::File),
    /// Borrowed raw descriptor. The program does not own it and never closes it.
    #[allow(dead_code)]
    Borrowed(i32),
}

impl Handle {
    fn identity(&self) -> Result<DescriptorIdentity, LockError> {
        match self {
            Handle::Owned(file) => identity_of_file(file),
            Handle::Borrowed(raw) => identity_of_raw(*raw),
        }
    }

    fn lock(&self, kind: LockKind, wait_ms: Option<u64>) -> Result<(), LockError> {
        match self {
            Handle::Owned(file) => lock_file(file, kind, wait_ms),
            Handle::Borrowed(raw) => lock_raw(*raw, kind, wait_ms),
        }
    }

    /// Keep the descriptor open for the requested lifetime.
    fn hold(&self, hold_ms: Option<u64>, daemon: bool) {
        if daemon {
            // Until stdin reaches EOF or a termination signal arrives. Reading
            // is the cheapest portable way to notice either.
            let mut sink = String::new();
            let _ = std::io::stdin().read_line(&mut sink);
            return;
        }
        if let Some(ms) = hold_ms {
            std::thread::sleep(std::time::Duration::from_millis(ms));
        }
    }
}

fn open_target(target: &Target) -> Result<Handle, LockError> {
    match target {
        Target::Path(path) => std::fs::OpenOptions::new()
            .read(true)
            .write(false)
            .create(false)
            .open(path)
            .map(Handle::Owned)
            .map_err(|error| {
                LockError::other(
                    "ERR_FLOCK_OPEN",
                    format!(
                        "cannot open {path}: {}",
                        error
                            .raw_os_error()
                            .map(|errno| pmh_flock::errno_name(errno.abs()))
                            .unwrap_or_else(|| "unknown".to_string())
                    ),
                )
            }),
        Target::Fd(raw) => Ok(Handle::Borrowed(*raw)),
    }
}

#[cfg(unix)]
fn lock_file(
    file: &std::fs::File,
    kind: LockKind,
    wait_ms: Option<u64>,
) -> Result<(), LockError> {
    use std::os::fd::AsFd;
    try_lock(file.as_fd(), kind, wait_ms)
}

#[cfg(unix)]
fn identity_of_file(file: &std::fs::File) -> Result<DescriptorIdentity, LockError> {
    use std::os::fd::AsFd;
    identity_of(file.as_fd())
}

#[cfg(unix)]
fn lock_raw(raw: i32, kind: LockKind, wait_ms: Option<u64>) -> Result<(), LockError> {
    // SAFETY: in `--fd` mode the caller guarantees the descriptor is open and
    // stays open; this program never closes it, which is the contract's rule.
    let fd = unsafe { pmh_flock::borrow_raw(raw) };
    try_lock(fd, kind, wait_ms)
}

#[cfg(unix)]
fn identity_of_raw(raw: i32) -> Result<DescriptorIdentity, LockError> {
    // SAFETY: as in `lock_raw`.
    let fd = unsafe { pmh_flock::borrow_raw(raw) };
    identity_of(fd)
}

#[cfg(not(unix))]
fn lock_file(_file: &std::fs::File, kind: LockKind, wait_ms: Option<u64>) -> Result<(), LockError> {
    try_lock(0, kind, wait_ms)
}

#[cfg(not(unix))]
fn identity_of_file(_file: &std::fs::File) -> Result<DescriptorIdentity, LockError> {
    identity_of(0)
}

#[cfg(not(unix))]
fn lock_raw(raw: i32, kind: LockKind, wait_ms: Option<u64>) -> Result<(), LockError> {
    try_lock(raw, kind, wait_ms)
}

#[cfg(not(unix))]
fn identity_of_raw(raw: i32) -> Result<DescriptorIdentity, LockError> {
    identity_of(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn a_path_lock_is_the_default_exclusive_form() {
        let action = parse_args(&args(&["--path", "/tmp/x"]));
        assert_eq!(
            action,
            Action::Lock {
                target: Target::Path("/tmp/x".into()),
                kind: LockKind::Exclusive,
                wait_ms: None,
                hold_ms: None,
                daemon: false,
            }
        );
    }

    #[test]
    fn shared_and_wait_and_hold_parse() {
        let action = parse_args(&args(&[
            "--path", "/tmp/x", "--shared", "--wait-ms", "250", "--hold-ms", "10",
        ]));
        assert_eq!(
            action,
            Action::Lock {
                target: Target::Path("/tmp/x".into()),
                kind: LockKind::Shared,
                wait_ms: Some(250),
                hold_ms: Some(10),
                daemon: false,
            }
        );
    }

    #[test]
    fn an_fd_lock_needs_no_path() {
        let action = parse_args(&args(&["--fd", "3"]));
        assert_eq!(
            action,
            Action::Lock {
                target: Target::Fd(3),
                kind: LockKind::Exclusive,
                wait_ms: None,
                hold_ms: None,
                daemon: false,
            }
        );
    }

    #[test]
    fn probe_short_circuits_everything_else() {
        assert_eq!(parse_args(&args(&["--probe"])), Action::Probe);
    }

    #[test]
    fn inspect_takes_a_target() {
        assert_eq!(
            parse_args(&args(&["--inspect", "--path", "/tmp/x"])),
            Action::Inspect {
                target: Target::Path("/tmp/x".into())
            }
        );
    }
}
