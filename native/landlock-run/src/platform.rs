//! The Landlock vocabulary and the platform enforcement.
//!
//! # Why the vocabulary lives here and not behind a platform gate
//!
//! The Landlock ABI numbers, the access-bit table and the mask arithmetic
//! describe the Linux kernel's contract. They are compiled on **every** target
//! on purpose: they are the audit record of which kernel API this launcher
//! touches, and the tests that pin them (does ABI 3 really add `TRUNCATE`? is
//! the read side contained in every mask?) must be able to run wherever the
//! crate is built. Gating the record to Linux would leave it dead code on other
//! hosts — an authoritative-looking table nobody exercises.
//!
//! Only the **syscall wrappers** are platform gated, and they sit in the two
//! `imp` blocks at the bottom of this file. On a host that cannot enforce
//! Landlock they fail closed with the same verdict and the same words as a
//! kernel without Landlock — deliberately indistinguishable, because the
//! consumer's answer is identical in every case: do not trust this launcher.

use crate::FATAL_PREFIX;

/// Newest Landlock ABI this build knows. The negotiation scales the actual
/// ruleset down to what the running kernel supports.
pub const MAX_ABI: i64 = 5;

/// The fatal message for a kernel that cannot enforce Landlock at all.
///
/// The exact sentence is part of the contract's fatal diagnostics.
pub const NOT_ENFORCED_MESSAGE: &str =
    "landlock is not enforced by this kernel (ABI unsupported or disabled)";

// Filesystem access bits, grouped by the ABI that introduced them. Values are
// verbatim from the kernel UAPI (`include/uapi/linux/landlock.h`); Landlock has
// no libc wrappers and the numeric UAPI is stable by contract.
//
// Every constant is spelled out even where it is only reachable through a
// composed mask, because this block doubles as the audit record — the same
// reasoning the C original documents when it defines the UAPI locally instead
// of including a header. `LANDLOCK_BIT_VOCABULARY` below is what makes the
// record load-bearing rather than decorative.
const LL_FS_EXECUTE: u64 = 1 << 0; // ABI 1
const LL_FS_WRITE_FILE: u64 = 1 << 1;
const LL_FS_READ_FILE: u64 = 1 << 2;
const LL_FS_READ_DIR: u64 = 1 << 3;
const LL_FS_REMOVE_DIR: u64 = 1 << 4;
const LL_FS_REMOVE_FILE: u64 = 1 << 5;
const LL_FS_MAKE_CHAR: u64 = 1 << 6;
const LL_FS_MAKE_DIR: u64 = 1 << 7;
const LL_FS_MAKE_REG: u64 = 1 << 8;
const LL_FS_MAKE_SOCK: u64 = 1 << 9;
const LL_FS_MAKE_FIFO: u64 = 1 << 10;
const LL_FS_MAKE_BLOCK: u64 = 1 << 11;
const LL_FS_MAKE_SYM: u64 = 1 << 12;
const LL_FS_REFER: u64 = 1 << 13; // ABI 2
const LL_FS_TRUNCATE: u64 = 1 << 14; // ABI 3 (ABI 4 added TCP bits only)
const LL_FS_IOCTL_DEV: u64 = 1 << 15; // ABI 5

/// Every access bit this build knows, paired with the ABI that introduced it.
///
/// Not used to build a mask — [`fs_mask_for_abi`] does that — but it is the
/// complete record of the vocabulary, and the tests iterate it to prove the
/// mask scales correctly at every ABI boundary.
pub const LANDLOCK_BIT_VOCABULARY: &[(u64, i64)] = &[
    (LL_FS_EXECUTE, 1),
    (LL_FS_WRITE_FILE, 1),
    (LL_FS_READ_FILE, 1),
    (LL_FS_READ_DIR, 1),
    (LL_FS_REMOVE_DIR, 1),
    (LL_FS_REMOVE_FILE, 1),
    (LL_FS_MAKE_CHAR, 1),
    (LL_FS_MAKE_DIR, 1),
    (LL_FS_MAKE_REG, 1),
    (LL_FS_MAKE_SOCK, 1),
    (LL_FS_MAKE_FIFO, 1),
    (LL_FS_MAKE_BLOCK, 1),
    (LL_FS_MAKE_SYM, 1),
    (LL_FS_REFER, 2),
    (LL_FS_TRUNCATE, 3),
    (LL_FS_IOCTL_DEV, 5),
];

/// The access bits a non-directory grant root may keep.
///
/// The kernel rejects directory-only accesses on a non-directory rule
/// (`EINVAL`), so a file grant keeps only its file-compatible bits — this is
/// how a `--rw /dev/null` grant works.
pub const FILE_COMPATIBLE_MASK: u64 =
    LL_FS_EXECUTE | LL_FS_WRITE_FILE | LL_FS_READ_FILE | LL_FS_TRUNCATE | LL_FS_IOCTL_DEV;

/// The read side of the vocabulary: everything a `--ro` root grants.
///
/// The wrapped `bash` and everything it spawns must stay executable, which is
/// why `EXECUTE` belongs to the read side rather than being its own grant.
pub const READ_SIDE: u64 = LL_FS_EXECUTE | LL_FS_READ_FILE | LL_FS_READ_DIR;

/// The filesystem accesses the running kernel's ABI can govern.
///
/// ABI 1 covers bits 0..=12, which is exactly `REFER - 1`. ABI 2 adds `REFER`,
/// ABI 3 adds `TRUNCATE`, ABI 4 added only TCP bits (so the filesystem mask is
/// unchanged), and ABI 5 adds `IOCTL_DEV`.
pub fn fs_mask_for_abi(abi: i64) -> u64 {
    let mut mask = LL_FS_REFER - 1;
    if abi >= 2 {
        mask |= LL_FS_REFER;
    }
    if abi >= 3 {
        mask |= LL_FS_TRUNCATE;
    }
    if abi >= 5 {
        mask |= LL_FS_IOCTL_DEV;
    }
    mask
}

/// Whether the negotiated ABI governs only a subset of `MAX_ABI`'s accesses.
///
/// `true` is not a failure: the run is still confined for everything the kernel
/// supports. The launcher reports it on stderr and proceeds; the probe reports
/// it on stdout, which is what distinguishes `full` from `partial`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Enforcement {
    pub partial: bool,
    pub abi: i64,
}

/// One launcher-level failure, already rendered as the exact stderr line the
/// CLI contract requires.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LauncherError(pub String);

impl std::fmt::Display for LauncherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}{}", FATAL_PREFIX, self.0)
    }
}

impl std::error::Error for LauncherError {}

impl LauncherError {
    /// A failure with a plain message.
    pub fn new(detail: impl Into<String>) -> Self {
        LauncherError(detail.into())
    }

    /// A failure whose message is a `prefix: <os error>` pair.
    pub fn with_errno(prefix: &str, errno: i32) -> Self {
        LauncherError(format!(
            "{prefix}: {}",
            std::io::Error::from_raw_os_error(errno)
        ))
    }
}

/// Print one fatal `landlock-run: …` line to stderr and return the fatal exit
/// code. The single place that renders a launcher failure.
pub fn report_fatal(error: &LauncherError) -> i32 {
    eprintln!("{error}");
    crate::LAUNCHER_FAILURE_EXIT
}

/// Print one `landlock-run: usage error: …` line and return the fatal code.
pub fn report_usage_error(error: &crate::UsageError) -> i32 {
    eprintln!("{}{}", FATAL_PREFIX, format_args!("usage error: {error}"));
    crate::LAUNCHER_FAILURE_EXIT
}

// ---------------------------------------------------------------------------
// Platform enforcement
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod imp {
    use super::*;
    use std::ffi::CString;

    // The Landlock UAPI, defined locally. The kernel's user-space ABI is stable
    // by contract, and self-defining it keeps the build independent of the
    // toolchain's header vintage — the same reasoning the C original documents.
    #[repr(C)]
    struct LandlockRulesetAttr {
        handled_access_fs: u64,
    }

    // The kernel header marks this struct packed, so it must be packed here.
    #[repr(C, packed)]
    struct LandlockPathBeneathAttr {
        allowed_access: u64,
        parent_fd: i32,
    }

    const LANDLOCK_CREATE_RULESET_VERSION: u32 = 1 << 0;
    const LANDLOCK_RULE_PATH_BENEATH: u32 = 1;

    /// Ask the kernel which Landlock ABI it supports.
    fn landlock_abi() -> Result<i64, LauncherError> {
        // SAFETY: the version query passes a null attribute pointer with a zero
        // size, which is the documented form for `LANDLOCK_CREATE_RULESET_VERSION`.
        let abi = unsafe {
            libc::syscall(
                libc::SYS_landlock_create_ruleset,
                std::ptr::null::<LandlockRulesetAttr>(),
                0usize,
                LANDLOCK_CREATE_RULESET_VERSION,
            )
        };
        if abi < 0 {
            // ENOSYS: the kernel was built without Landlock. EOPNOTSUPP: built
            // but disabled. Either way it is not enforceable — fail CLOSED and
            // never exec unconfined.
            return Err(LauncherError::new(NOT_ENFORCED_MESSAGE));
        }
        Ok(abi)
    }

    /// Create a ruleset governing `handled`; returns the ruleset fd.
    fn create_ruleset(handled: u64) -> Result<i32, LauncherError> {
        let attr = LandlockRulesetAttr {
            handled_access_fs: handled,
        };
        // SAFETY: `attr` is a correctly laid-out `landlock_ruleset_attr` and the
        // size passed matches it exactly.
        let fd = unsafe {
            libc::syscall(
                libc::SYS_landlock_create_ruleset,
                &attr as *const LandlockRulesetAttr,
                std::mem::size_of::<LandlockRulesetAttr>(),
                0u32,
            )
        };
        if fd < 0 {
            return Err(LauncherError::with_errno(
                "landlock ruleset error",
                std::io::Error::last_os_error().raw_os_error().unwrap_or(0),
            ));
        }
        Ok(fd as i32)
    }

    /// Add one path-beneath rule to `ruleset_fd`.
    fn add_rule(ruleset_fd: i32, path: &str, access: u64) -> Result<(), LauncherError> {
        let path_c = CString::new(path.as_bytes()).map_err(|_| {
            LauncherError::new(format!("cannot open rule path: {path}: interior NUL byte"))
        })?;

        // SAFETY: `path_c` is a valid NUL-terminated C string.
        let path_fd = unsafe { libc::open(path_c.as_ptr(), libc::O_PATH | libc::O_CLOEXEC) };
        if path_fd < 0 {
            // Fail closed on an unopenable grant root: silently narrowing the
            // granted set would be safe, but running with a profile the caller
            // did not get is not worth the ambiguity.
            let errno = std::io::Error::last_os_error();
            return Err(LauncherError::new(format!(
                "cannot open rule path: {path}: {errno}"
            )));
        }

        // Keep only file-compatible bits for a non-directory grant root.
        let mut access = access;
        // SAFETY: `path_fd` is an open descriptor and `stat` is a valid out-param.
        let mut stat: libc::stat = unsafe { std::mem::zeroed() };
        if unsafe { libc::fstat(path_fd, &mut stat) } == 0
            && (stat.st_mode & libc::S_IFMT) != libc::S_IFDIR
        {
            access &= FILE_COMPATIBLE_MASK;
        }

        let attr = LandlockPathBeneathAttr {
            allowed_access: access,
            parent_fd: path_fd,
        };
        // SAFETY: `attr` has the kernel's packed layout and `ruleset_fd` is a
        // ruleset descriptor returned by `create_ruleset`.
        let rc = unsafe {
            libc::syscall(
                libc::SYS_landlock_add_rule,
                ruleset_fd,
                LANDLOCK_RULE_PATH_BENEATH,
                &attr as *const LandlockPathBeneathAttr,
                0u32,
            )
        };
        // The path fd is only needed for the syscall; the kernel holds its own
        // reference for the lifetime of the ruleset.
        unsafe { libc::close(path_fd) };
        if rc != 0 {
            let errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
            return Err(LauncherError::with_errno("landlock ruleset error", errno));
        }
        Ok(())
    }

    /// Install a ruleset on the current thread and negotiate the ABI down from
    /// `MAX_ABI`.
    ///
    /// `--ro` roots get the read side of the vocabulary; `--rw` roots get every
    /// filesystem access the negotiated ABI can grant.
    ///
    /// `no_new_privs` is set first: it is mandatory for an unprivileged
    /// restrict and it neutralizes setuid/setgid escalation inside the sandbox.
    pub fn restrict_self(grants: &crate::LauncherGrants) -> Result<Enforcement, LauncherError> {
        let abi = landlock_abi()?;
        let partial = abi < MAX_ABI;
        let handled = fs_mask_for_abi(abi.min(MAX_ABI));

        let ruleset_fd = create_ruleset(handled)?;
        // From here on every early return must close the ruleset fd.
        let result = (|| {
            for root in &grants.read_only {
                add_rule(ruleset_fd, root, READ_SIDE & handled)?;
            }
            for root in &grants.read_write {
                add_rule(ruleset_fd, root, handled)?;
            }

            // SAFETY: `PR_SET_NO_NEW_PRIVS` with a 1 argument is the documented
            // form and takes no pointers.
            if unsafe { libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) } != 0 {
                return Err(LauncherError::with_errno(
                    "landlock ruleset error",
                    std::io::Error::last_os_error().raw_os_error().unwrap_or(0),
                ));
            }
            // SAFETY: `ruleset_fd` is a valid ruleset descriptor.
            if unsafe { libc::syscall(libc::SYS_landlock_restrict_self, ruleset_fd, 0u32) } != 0 {
                return Err(LauncherError::with_errno(
                    "landlock ruleset error",
                    std::io::Error::last_os_error().raw_os_error().unwrap_or(0),
                ));
            }
            Ok(())
        })();
        unsafe { libc::close(ruleset_fd) };
        result?;

        Ok(Enforcement { partial, abi })
    }

    /// The functional probe.
    ///
    /// Builds and enforces a maximal (`--ro /`) ruleset in **this** short-lived
    /// process, then prints the one report line the CLI contract pins. A
    /// `--version`-style check would miss a kernel that has the syscalls but
    /// refuses enforcement; actually restricting is the only honest signal.
    pub fn probe() -> Result<Enforcement, LauncherError> {
        let grants = crate::LauncherGrants {
            read_only: vec!["/".to_string()],
            read_write: Vec::new(),
        };
        let enforcement = restrict_self(&grants)?;
        if enforcement.partial {
            println!("landlock: partially enforced (older ABI)");
        } else {
            println!("landlock: fully enforced");
        }
        Ok(enforcement)
    }

    /// Hand over to the wrapped command. Only returns on failure.
    pub fn exec(command: &[String]) -> LauncherError {
        let argv: Vec<CString> = command
            .iter()
            .map(|arg| CString::new(arg.as_bytes()).unwrap_or_default())
            .collect();
        let mut raw: Vec<*const libc::c_char> = argv.iter().map(|arg| arg.as_ptr()).collect();
        raw.push(std::ptr::null());

        // SAFETY: `raw` is a NULL-terminated argv vector of valid C strings, and
        // `execvp` does not return on success.
        unsafe { libc::execvp(raw[0], raw.as_ptr()) };

        // exec only returns on failure.
        LauncherError::with_errno(
            "exec failed",
            std::io::Error::last_os_error().raw_os_error().unwrap_or(0),
        )
    }
}

#[cfg(not(target_os = "linux"))]
mod imp {
    use super::*;

    /// Landlock is a Linux-only syscall family. On any other host the launcher
    /// is unusable — the same verdict a consumer gets from a kernel without
    /// Landlock, which is deliberate: the answer is always "do not trust this
    /// launcher".
    pub fn restrict_self(_grants: &crate::LauncherGrants) -> Result<Enforcement, LauncherError> {
        Err(LauncherError::new(NOT_ENFORCED_MESSAGE))
    }

    pub fn probe() -> Result<Enforcement, LauncherError> {
        Err(LauncherError::new(NOT_ENFORCED_MESSAGE))
    }

    pub fn exec(_command: &[String]) -> LauncherError {
        LauncherError::new(NOT_ENFORCED_MESSAGE)
    }
}

pub use imp::{exec, probe, restrict_self};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abi1_governs_exactly_the_first_thirteen_bits() {
        let mask = fs_mask_for_abi(1);
        assert_eq!(mask, (1 << 13) - 1);
        assert_eq!(mask & LL_FS_REFER, 0);
        assert_eq!(mask & LL_FS_TRUNCATE, 0);
        assert_eq!(mask & LL_FS_IOCTL_DEV, 0);
    }

    #[test]
    fn newer_abis_add_exactly_their_own_bits() {
        assert_eq!(fs_mask_for_abi(2) & LL_FS_REFER, LL_FS_REFER);
        assert_eq!(fs_mask_for_abi(2) & LL_FS_TRUNCATE, 0);

        assert_eq!(fs_mask_for_abi(3) & LL_FS_TRUNCATE, LL_FS_TRUNCATE);
        assert_eq!(fs_mask_for_abi(3) & LL_FS_IOCTL_DEV, 0);

        // ABI 4 added TCP bits only, so the filesystem mask is unchanged.
        assert_eq!(fs_mask_for_abi(4), fs_mask_for_abi(3));

        assert_eq!(fs_mask_for_abi(5) & LL_FS_IOCTL_DEV, LL_FS_IOCTL_DEV);
        // Nothing newer than ABI 5 exists in this build.
        assert_eq!(fs_mask_for_abi(6), fs_mask_for_abi(5));
    }

    #[test]
    fn every_known_bit_is_governed_by_the_abi_that_introduced_it() {
        // The vocabulary is the audit record; this test is what makes it
        // load-bearing rather than a comment. Every bit must appear in the mask
        // of its own ABI and in every later one, and in none of the earlier ones.
        for (bit, introduced_in) in LANDLOCK_BIT_VOCABULARY {
            assert_ne!(*bit, 0, "a bit must be a real bit");
            assert!(
                bit.is_power_of_two(),
                "0x{bit:x} is not a single bit, so the vocabulary has a typo"
            );
            for abi in *introduced_in..=MAX_ABI {
                assert_eq!(
                    fs_mask_for_abi(abi) & bit,
                    *bit,
                    "ABI {abi} must govern the bit introduced in ABI {introduced_in}"
                );
            }
            if *introduced_in > 1 {
                assert_eq!(
                    fs_mask_for_abi(*introduced_in - 1) & bit,
                    0,
                    "the bit introduced in ABI {introduced_in} must NOT be governed earlier"
                );
            }
        }
    }

    #[test]
    fn the_vocabulary_has_no_duplicate_bits() {
        // A duplicated bit would mean the table is not a faithful record of the
        // kernel UAPI.
        for (index, (bit, _)) in LANDLOCK_BIT_VOCABULARY.iter().enumerate() {
            for (other_index, (other, _)) in LANDLOCK_BIT_VOCABULARY.iter().enumerate() {
                if index != other_index {
                    assert_ne!(bit, other, "bit 0x{bit:x} appears twice");
                }
            }
        }
    }

    #[test]
    fn the_read_side_is_a_subset_of_every_abi_mask() {
        for abi in 1..=MAX_ABI {
            let mask = fs_mask_for_abi(abi);
            assert_eq!(
                READ_SIDE & mask,
                READ_SIDE,
                "ABI {abi} must grant the read side"
            );
        }
    }

    #[test]
    fn a_file_grant_cannot_keep_directory_only_bits() {
        let all = fs_mask_for_abi(MAX_ABI);
        let file_bits = all & FILE_COMPATIBLE_MASK;
        assert_eq!(file_bits & LL_FS_READ_DIR, 0);
        assert_eq!(file_bits & LL_FS_MAKE_REG, 0);
        assert_eq!(file_bits & LL_FS_REMOVE_FILE, 0);
        // `--rw /dev/null` therefore still grants read, write, truncate, ioctl.
        assert_eq!(file_bits & LL_FS_READ_FILE, LL_FS_READ_FILE);
        assert_eq!(file_bits & LL_FS_WRITE_FILE, LL_FS_WRITE_FILE);
    }

    #[test]
    fn the_unenforced_message_is_pinned() {
        // The exact sentence is part of the contract's fatal diagnostics, and it
        // must be what a host without Landlock produces.
        assert_eq!(
            NOT_ENFORCED_MESSAGE,
            "landlock is not enforced by this kernel (ABI unsupported or disabled)"
        );
    }

    #[test]
    fn a_non_linux_host_reports_the_unenforced_message() {
        // The fail-closed verdict must be identical on a host where Landlock
        // does not exist at all and on a kernel that refuses enforcement — the
        // consumer's answer is the same either way.
        if !cfg!(target_os = "linux") {
            let error = probe().expect_err("no Landlock on this target");
            assert_eq!(error.0, NOT_ENFORCED_MESSAGE);
            let error = restrict_self(&crate::LauncherGrants::default())
                .expect_err("no Landlock on this target");
            assert_eq!(error.0, NOT_ENFORCED_MESSAGE);
        }
    }
}
