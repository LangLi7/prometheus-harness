//! `pmh-flock` — advisory file locking as a process.
//!
//! Rust successor to `native/system/packages/entry/src/flock.c` (a Node-API v8
//! binding) **and** `flock.ts` (its JavaScript façade) of the source template.
//!
//! # Why a process instead of a native addon
//!
//! The template implements the lock as a Node-API addon because it must run the
//! `flock(2)` syscall off the JavaScript thread. The port's binding rules say
//! otherwise (`docs/stack.md`): *Der JS-Core bleibt der Kernel. Jede andere
//! Sprache ist ein Dienst, den er aufruft.* A native addon would re-raise the
//! very question this port exists to remove — whether native addons work under
//! Bun at all. As a process there is no ABI question and no addon test.
//!
//! # What is preserved from the contract
//!
//! The **behaviour**, not the code. `native/system/docs/flock-contract.md` pins
//! a table of conditions; every one of them is reproduced as a test in this
//! crate (see `tests/contract.rs`). The properties that matter:
//!
//! * One attempt, non-blocking, `flock(fd, LOCK_EX | LOCK_NB)` — with an
//!   optional bounded wait and a shared (`LOCK_SH`) mode.
//! * The caller owns the locking target. In `--path` mode this program opens it
//!   and holds it for its lifetime; in `--fd` mode it never opens, duplicates,
//!   closes or explicitly unlocks the descriptor it was handed.
//! * Contention is distinguishable from every other failure.
//! * Errors carry a symbolic `code`, a **positive** `errno`, and
//!   `syscall: "flock"`.
//! * Unsupported platforms report `ERR_FLOCK_UNSUPPORTED_PLATFORM` — on Windows
//!   the template keeps its own semaphore implementation and does **not** use
//!   flock. That decision is preserved.
//! * Locks belong to *open file descriptions*, so removing or replacing a
//!   pathname does not transfer a lock to the replacement inode. A caller that
//!   cares about that must compare inode identity itself — the JSONL session
//!   backend in the template does exactly that, and the `--inspect` mode here
//!   exists to serve it.
//!
//! # Lock lifetime across a process boundary
//!
//! The one thing a process cannot reproduce verbatim is "the lock lives in the
//! caller's memory". `flock` locks belong to an open file description, so
//! whoever holds the descriptor holds the lock. This program therefore offers
//! two explicit modes and states the consequence in `README.md`:
//!
//! * `--path <file>` — this program owns the descriptor and must stay alive for
//!   as long as the lock is wanted. `--hold-ms` bounds that; `--daemon` keeps it
//!   until stdin closes or a signal arrives.
//! * `--fd <n>` — a caller that already owns an appropriately inherited
//!   descriptor asks for one attempt on it; the lock lives exactly as long as
//!   that descriptor does, which is the template's semantics unchanged.

/// Exit code for a lock *contention* failure specifically.
///
/// Distinct from every other failure so a caller can tell "someone else holds
/// it" (an expected, routine outcome) from "the lock could not be attempted"
/// (a real error).
pub const EXIT_CONTENTION: i32 = 2;

/// Exit code for every other failure: bad arguments, an unsupported platform,
/// an unusable descriptor, or any other syscall error.
///
/// Chosen the same way the template's launcher chose 125 — a value the wrapped
/// work does not itself produce, so a caller can attribute the failure.
pub const EXIT_FAILURE: i32 = 125;

/// The JSON schema version of the report this program prints. Bumped only if
/// the report shape changes incompatibly.
pub const REPORT_VERSION: u32 = 1;

/// The syscall name reported in every error, matching the template's
/// `syscall: 'flock'` field exactly.
pub const SYSCALL: &str = "flock";

/// The error code the template raises on a platform without flock.
///
/// `flock.ts` throws this for anything that is not Linux or Darwin. Windows is
/// deliberately included: the template's own contract says "Windows does not
/// use this API and retains its existing semaphore implementation".
pub const ERR_UNSUPPORTED_PLATFORM: &str = "ERR_FLOCK_UNSUPPORTED_PLATFORM";

/// Errno value of `EAGAIN` on the running platform, used to classify
/// contention. `EWOULDBLOCK` is the same value on every platform this crate
/// supports, which the contract also states.
///
/// Defined for every platform, not just Unix, so the classification and its
/// tests do not depend on the target.
pub fn eagain() -> i32 {
    #[cfg(unix)]
    {
        libc::EAGAIN
    }
    #[cfg(not(unix))]
    {
        // The POSIX value. It is never produced on a platform without `flock`
        // — every attempt fails with `ERR_FLOCK_UNSUPPORTED_PLATFORM` instead —
        // but keeping the constant available makes the classification code and
        // its tests target-independent.
        11
    }
}

/// `true` when this platform supports the POSIX `flock` family.
///
/// Exactly the template's platform set: Linux and Darwin. Windows is excluded
/// on purpose and keeps its own locking mechanism.
pub const fn platform_supports_flock() -> bool {
    cfg!(unix)
}

/// Which kind of lock to attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockKind {
    /// `LOCK_EX` — at most one holder.
    Exclusive,
    /// `LOCK_SH` — many readers, no writer.
    Shared,
}

impl LockKind {
    /// The lowercase name used in reports and on the command line.
    pub fn as_str(self) -> &'static str {
        match self {
            LockKind::Exclusive => "exclusive",
            LockKind::Shared => "shared",
        }
    }
}

/// The one-line JSON report this program writes to stdout on success.
///
/// Field names are stable: they are the process-boundary contract that the
/// TypeScript side parses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    /// Report schema version.
    pub version: u32,
    /// Always `true`; failures are reported on stderr instead.
    pub locked: bool,
    /// The lock actually taken.
    pub kind: LockKind,
    /// The syscall name, so a caller can build an error object of the same
    /// shape as the template's.
    pub syscall: &'static str,
}

impl Report {
    /// A success report for `kind`.
    pub fn locked(kind: LockKind) -> Self {
        Report {
            version: REPORT_VERSION,
            locked: true,
            kind,
            syscall: SYSCALL,
        }
    }

    /// Render as one line of JSON.
    pub fn to_json(&self) -> String {
        format!(
            "{{\"version\":{},\"locked\":{},\"kind\":{},\"syscall\":{}}}",
            self.version,
            self.locked,
            json_string(self.kind.as_str()),
            json_string(self.syscall)
        )
    }
}

/// A failure, rendered as a JSON object on stderr.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockError {
    /// Symbolic code: a POSIX name such as `EAGAIN`, or
    /// [`ERR_UNSUPPORTED_PLATFORM`].
    pub code: String,
    /// Positive errno, when the failure came from the syscall.
    pub errno: Option<i32>,
    /// Human-readable message.
    pub message: String,
    /// Whether this specific failure is lock contention.
    pub contention: bool,
}

impl LockError {
    /// Build a failure from a raw errno (as returned by the OS, i.e. positive).
    pub fn from_errno(errno: i32) -> Self {
        let name = errno_name(errno);
        LockError {
            contention: errno == eagain(),
            message: format!("{name}: flock failed"),
            code: name,
            errno: Some(errno),
        }
    }

    /// A failure that did not come from the lock syscall itself.
    pub fn other(code: impl Into<String>, message: impl Into<String>) -> Self {
        LockError {
            code: code.into(),
            errno: None,
            message: message.into(),
            contention: false,
        }
    }

    /// The process exit code this failure maps to.
    pub fn exit_code(&self) -> i32 {
        if self.contention {
            EXIT_CONTENTION
        } else {
            EXIT_FAILURE
        }
    }

    /// Render the error as the JSON object callers expect.
    pub fn to_json(&self) -> String {
        let mut fields = vec![
            format!("\"code\":{}", json_string(&self.code)),
            format!("\"syscall\":{}", json_string(SYSCALL)),
            format!("\"message\":{}", json_string(&self.message)),
            format!("\"contention\":{}", self.contention),
        ];
        if let Some(errno) = self.errno {
            fields.push(format!("\"errno\":{errno}"));
        }
        format!("{{{}}}", fields.join(","))
    }
}

impl std::fmt::Display for LockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.errno {
            Some(errno) => write!(f, "{}: {} (errno {errno})", SYSCALL, self.message),
            None => write!(f, "{}: {}", SYSCALL, self.message),
        }
    }
}

impl std::error::Error for LockError {}

/// Minimal JSON string escaping — the reports have no other dynamic content, so
/// pulling in a JSON library for output is not warranted. `serde_json` *is*
/// used on the input side, where the parsing actually happens.
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

/// The POSIX symbolic name for a positive errno.
///
/// A small closed table rather than a libc call, so the mapping is identical on
/// every platform and testable without a syscall.
pub fn errno_name(errno: i32) -> String {
    let name = match errno {
        1 => "EPERM",
        2 => "ENOENT",
        4 => "EINTR",
        9 => "EBADF",
        11 => "EAGAIN",
        12 => "ENOMEM",
        13 => "EACCES",
        16 => "EBUSY",
        21 => "EISDIR",
        22 => "EINVAL",
        24 => "EMFILE",
        28 => "ENOSPC",
        30 => "EROFS",
        37 => "ENOLCK",
        38 => "ENOSYS",
        _ => return format!("ERRNO_{errno}"),
    };
    name.to_string()
}

/// Everything a caller needs to reason about a descriptor's identity.
///
/// This is the hook the JSONL session backend uses: `flock-contract.md` notes
/// that removing or replacing a pathname does not transfer a lock to the
/// replacement inode, and that the backend "separately checks inode identity".
/// Reporting device + inode is what makes that check possible across a process
/// boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DescriptorIdentity {
    pub device: u64,
    pub inode: u64,
    /// `true` when the descriptor refers to a regular file.
    pub regular: bool,
}

impl DescriptorIdentity {
    /// Render as JSON, for the `--inspect` mode's report.
    pub fn to_json(&self) -> String {
        format!(
            "{{\"device\":{},\"inode\":{},\"regular\":{}}}",
            self.device, self.inode, self.regular
        )
    }
}

#[cfg(unix)]
mod imp {
    use super::*;
    use std::os::fd::{AsRawFd, BorrowedFd};

    fn last_errno() -> i32 {
        std::io::Error::last_os_error()
            .raw_os_error()
            .unwrap_or(libc::EIO)
            .abs()
    }

    /// Attempt one `flock` on an already-open descriptor.
    ///
    /// The descriptor is **borrowed**: it is never closed here, which is the
    /// contract's central ownership rule (`flock-contract.md`: "the binding
    /// does not open, duplicate, or close it"). `BorrowedFd` is what makes that
    /// rule a compile-time property instead of a comment.
    ///
    /// `wait_ms` of `None` or `Some(0)` is the contract's primary behaviour:
    /// one non-blocking attempt. A larger budget polls with bounded exponential
    /// backoff, which is easier to reason about than a signal-driven blocking
    /// `flock` and keeps the reported error identical — a timeout reports the
    /// contention that actually stopped us, never a synthetic timeout code.
    pub fn try_lock(
        fd: BorrowedFd<'_>,
        kind: LockKind,
        wait_ms: Option<u64>,
    ) -> Result<(), LockError> {
        let operation = match kind {
            LockKind::Exclusive => libc::LOCK_EX,
            LockKind::Shared => libc::LOCK_SH,
        };
        let raw = fd.as_raw_fd();

        let Some(budget) = wait_ms.filter(|ms| *ms > 0) else {
            // SAFETY: `raw` is a borrowed descriptor that stays open for the
            // duration of the call, which is all `flock` requires.
            return if unsafe { libc::flock(raw, operation | libc::LOCK_NB) } == 0 {
                Ok(())
            } else {
                Err(LockError::from_errno(last_errno()))
            };
        };

        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(budget);
        let mut backoff = std::time::Duration::from_millis(1);
        loop {
            // SAFETY: as above.
            if unsafe { libc::flock(raw, operation | libc::LOCK_NB) } == 0 {
                return Ok(());
            }
            let errno = last_errno();
            if errno != eagain() {
                return Err(LockError::from_errno(errno));
            }
            if std::time::Instant::now() >= deadline {
                return Err(LockError::from_errno(errno));
            }
            std::thread::sleep(backoff);
            backoff = std::cmp::min(backoff * 2, std::time::Duration::from_millis(50));
        }
    }

    /// Read the identity of an already-open descriptor.
    pub fn identity_of(fd: BorrowedFd<'_>) -> Result<DescriptorIdentity, LockError> {
        let raw = fd.as_raw_fd();
        // SAFETY: `raw` is a borrowed descriptor and `stat` is a valid
        // out-parameter for `fstat`.
        let mut stat: libc::stat = unsafe { std::mem::zeroed() };
        if unsafe { libc::fstat(raw, &mut stat) } != 0 {
            return Err(LockError::from_errno(last_errno()));
        }
        Ok(DescriptorIdentity {
            device: stat.st_dev as u64,
            inode: stat.st_ino as u64,
            regular: (stat.st_mode & libc::S_IFMT) == libc::S_IFREG,
        })
    }

    /// Wrap a raw descriptor number as a borrowed fd without taking ownership.
    ///
    /// # Safety
    ///
    /// The caller guarantees the descriptor is open and stays open for the
    /// returned borrow's lifetime, and that closing it is not this crate's job.
    pub unsafe fn borrow_raw(raw: i32) -> BorrowedFd<'static> {
        // SAFETY: the caller upholds openness and lifetime.
        unsafe { BorrowedFd::borrow_raw(raw) }
    }
}

#[cfg(not(unix))]
mod imp {
    use super::*;

    /// On a platform without POSIX `flock`, every attempt fails with the same
    /// code the template's JavaScript façade raises. This is not a gap: the
    /// template's contract states that Windows does not use this API at all and
    /// keeps its own semaphore implementation instead.
    pub fn try_lock(_raw: i32, _kind: LockKind, _wait_ms: Option<u64>) -> Result<(), LockError> {
        Err(unsupported())
    }

    /// Identity is unavailable without `fstat`; report the platform failure
    /// rather than inventing values.
    pub fn identity_of(_raw: i32) -> Result<DescriptorIdentity, LockError> {
        Err(unsupported())
    }

    fn unsupported() -> LockError {
        LockError::other(
            ERR_UNSUPPORTED_PLATFORM,
            format!(
                "flock is not supported on {}-{}",
                std::env::consts::OS,
                std::env::consts::ARCH
            ),
        )
    }
}

pub use imp::{identity_of, try_lock};

#[cfg(unix)]
pub use imp::borrow_raw;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_report_names_the_syscall_and_version() {
        assert_eq!(SYSCALL, "flock");
        assert_eq!(REPORT_VERSION, 1);
        assert_eq!(ERR_UNSUPPORTED_PLATFORM, "ERR_FLOCK_UNSUPPORTED_PLATFORM");
    }

    #[test]
    fn exit_codes_are_pinned_and_distinct() {
        assert_eq!(EXIT_CONTENTION, 2);
        assert_eq!(EXIT_FAILURE, 125);
        assert_ne!(EXIT_CONTENTION, EXIT_FAILURE);
    }

    #[test]
    fn contention_maps_to_the_contention_exit_code() {
        let error = LockError::from_errno(eagain());
        assert!(error.contention);
        assert_eq!(error.exit_code(), EXIT_CONTENTION);
        assert_eq!(error.code, "EAGAIN");
        assert_eq!(error.errno, Some(eagain()));
    }

    #[test]
    fn every_other_errno_maps_to_the_generic_failure_code() {
        let error = LockError::from_errno(9); // EBADF
        assert!(!error.contention);
        assert_eq!(error.exit_code(), EXIT_FAILURE);
        assert_eq!(error.code, "EBADF");
        assert_eq!(error.message, "EBADF: flock failed");
    }

    #[test]
    fn errno_names_cover_the_contract_relevant_set() {
        // The contract explicitly names EAGAIN/EWOULDBLOCK and EBADF.
        assert_eq!(errno_name(11), "EAGAIN");
        assert_eq!(errno_name(9), "EBADF");
        // An unknown errno still yields a stable symbolic code.
        assert_eq!(errno_name(12345), "ERRNO_12345");
    }

    #[test]
    fn the_error_json_has_the_fields_a_caller_builds_an_error_object_from() {
        let error = LockError::from_errno(eagain());
        let json = error.to_json();
        assert!(json.contains("\"code\":\"EAGAIN\""), "{json}");
        assert!(json.contains("\"syscall\":\"flock\""), "{json}");
        assert!(json.contains("\"errno\":11"), "{json}");
        assert!(json.contains("\"contention\":true"), "{json}");
    }

    #[test]
    fn a_non_syscall_failure_omits_the_errno_field() {
        let error = LockError::other(
            ERR_UNSUPPORTED_PLATFORM,
            "flock is not supported on plan9-x64",
        );
        let json = error.to_json();
        assert!(json.contains("ERR_FLOCK_UNSUPPORTED_PLATFORM"), "{json}");
        assert!(!json.contains("\"errno\""), "{json}");
        assert_eq!(error.exit_code(), EXIT_FAILURE);
    }

    #[test]
    fn json_strings_are_escaped() {
        assert_eq!(json_string("plain"), "\"plain\"");
        assert_eq!(json_string("a\"b"), "\"a\\\"b\"");
        assert_eq!(json_string("a\\b"), "\"a\\\\b\"");
        assert_eq!(json_string("a\nb"), "\"a\\nb\"");
    }

    #[test]
    fn the_success_report_has_stable_field_names_and_order() {
        assert_eq!(
            Report::locked(LockKind::Exclusive).to_json(),
            "{\"version\":1,\"locked\":true,\"kind\":\"exclusive\",\"syscall\":\"flock\"}"
        );
        assert_eq!(
            Report::locked(LockKind::Shared).to_json(),
            "{\"version\":1,\"locked\":true,\"kind\":\"shared\",\"syscall\":\"flock\"}"
        );
    }

    #[test]
    fn lock_kind_names_match_the_command_line_spelling() {
        assert_eq!(LockKind::Exclusive.as_str(), "exclusive");
        assert_eq!(LockKind::Shared.as_str(), "shared");
    }

    #[test]
    fn identity_json_has_stable_field_names() {
        let identity = DescriptorIdentity {
            device: 7,
            inode: 42,
            regular: true,
        };
        assert_eq!(
            identity.to_json(),
            "{\"device\":7,\"inode\":42,\"regular\":true}"
        );
    }

    #[test]
    fn platform_support_matches_the_template() {
        // Linux and Darwin only. Windows keeps its own mechanism.
        #[cfg(unix)]
        assert!(platform_supports_flock());
        #[cfg(not(unix))]
        assert!(!platform_supports_flock());
    }
}
