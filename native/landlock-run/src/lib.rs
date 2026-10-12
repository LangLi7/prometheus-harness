//! Shared types for the `pmh-landlock-run` launcher.
//!
//! Everything the launcher promises to the outside world is pinned in
//! `native/system/docs/cli-contract.md` of the source template and is
//! reproduced here verbatim. This crate is a **new implementation**, not a
//! translation of the C original: the contract is the interface.
//!
//! `platform` carries the Landlock vocabulary (compiled on every target, so its
//! tests always run) and the platform enforcement (gated, because a syscall
//! family is a platform fact).

mod platform;

pub use platform::{
    exec, fs_mask_for_abi, probe, report_fatal, report_usage_error, restrict_self, Enforcement,
    LauncherError, FILE_COMPATIBLE_MASK, LANDLOCK_BIT_VOCABULARY, MAX_ABI, NOT_ENFORCED_MESSAGE,
    READ_SIDE,
};

/// Binary file name inside each platform package's `bin/` directory.
///
/// Same role as `LAUNCHER_BIN` in the template's `entry/src/index.ts`.
pub const LAUNCHER_BIN: &str = "landlock-run";

/// Exit code for every launcher-level failure: usage error, a kernel that
/// cannot enforce Landlock, an unopenable grant root, a failed `exec`.
///
/// The wrapped command was NOT run in any of those cases. After a *successful*
/// `exec` the child's status is passed through unchanged — including 125 — so
/// a consumer attributes a launcher failure only when the status is 125 **and**
/// a `landlock-run: ` fatal line was seen. Part of the CLI contract.
pub const LAUNCHER_FAILURE_EXIT: i32 = 125;

/// The single fatal-diagnostic prefix. Every launcher-level error prints
/// exactly one stderr line starting with this. Part of the CLI contract.
pub const FATAL_PREFIX: &str = "landlock-run: ";

/// Probe verdict for a host, mapped from the probe's one stdout report line.
///
/// * `Full` — the running kernel enforces every access the launcher can govern.
/// * `Partial` — an older Landlock ABI governs only a subset; the run is still
///   confined for everything that ABI supports.
/// * `Unusable` — nothing can be enforced: no Landlock in the kernel, a disabled
///   LSM, a missing binary, or any other launcher failure. Deliberately
///   indistinguishable, exactly as in the template, because the consumer's
///   answer is the same either way: do not trust this launcher.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LandlockEnforcement {
    Full,
    Partial,
    Unusable,
}

impl LandlockEnforcement {
    /// The exact string a probe call maps back to this variant.
    pub fn as_str(self) -> &'static str {
        match self {
            LandlockEnforcement::Full => "full",
            LandlockEnforcement::Partial => "partial",
            LandlockEnforcement::Unusable => "unusable",
        }
    }
}

/// Filesystem grants for one confined run.
///
/// Everything not granted is denied — Landlock rulesets are allow-lists.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LauncherGrants {
    /// Roots granted read + execute beneath (`--ro`).
    pub read_only: Vec<String>,
    /// Roots granted full filesystem access beneath (`--rw`).
    pub read_write: Vec<String>,
}

impl LauncherGrants {
    /// The grant arguments for one set of grants — everything before the `--`
    /// argv separator. Flag spellings stay private to this crate, mirroring
    /// `grantArgs()` in the template's entry package.
    ///
    /// Read-only roots come first, each list in the caller's order.
    pub fn to_args(&self) -> Vec<String> {
        let mut args = Vec::with_capacity(2 * (self.read_only.len() + self.read_write.len()));
        for root in &self.read_only {
            args.push("--ro".to_string());
            args.push(root.clone());
        }
        for root in &self.read_write {
            args.push("--rw".to_string());
            args.push(root.clone());
        }
        args
    }
}

/// The parsed command line: either a probe, or grants plus the command argv
/// after `--`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Invocation {
    /// `landlock-run --probe` — mutually exclusive with grants and a command.
    Probe,
    /// `landlock-run [--ro <path>]... [--rw <path>]... -- <argv>...`
    Confine {
        grants: LauncherGrants,
        command: Vec<String>,
    },
}

impl Invocation {
    /// Parse `args` **without** the program name — i.e. `std::env::args_os().skip(1)`.
    ///
    /// Mirrors the C parser's accept/reject decisions exactly:
    ///
    /// * `--probe` is mutually exclusive with every other argument, and any
    ///   other argument makes it a usage error.
    /// * `--ro` and `--rw` each consume exactly one path.
    /// * `--` is mandatory before the command and is taken literally: nothing
    ///   after it is parsed as a launcher flag.
    /// * Without `--probe`, a command is required — `--` alone is a usage error.
    /// * There are no other flags and no environment-variable inputs.
    pub fn parse<I, S>(args: I) -> Result<Invocation, UsageError>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let args: Vec<String> = args.into_iter().map(Into::into).collect();
        let mut grants = LauncherGrants::default();
        let mut probe = false;
        let mut command: Option<Vec<String>> = None;

        let mut index = 0usize;
        while index < args.len() {
            let arg = args[index].as_str();
            match arg {
                "--probe" => {
                    if args.len() != 1 {
                        return Err(UsageError::ProbeTakesNoOtherArguments);
                    }
                    probe = true;
                    index += 1;
                }
                "--ro" | "--rw" => {
                    let Some(path) = args.get(index + 1) else {
                        return Err(UsageError::MissingPath(arg.to_string()));
                    };
                    if arg == "--ro" {
                        grants.read_only.push(path.clone());
                    } else {
                        grants.read_write.push(path.clone());
                    }
                    index += 2;
                }
                "--" => {
                    command = Some(args[index + 1..].to_vec());
                    break;
                }
                other => return Err(UsageError::UnknownArgument(other.to_string())),
            }
        }

        if probe {
            return Ok(Invocation::Probe);
        }
        match command {
            // `--` with nothing behind it is a usage error, not an empty exec.
            Some(argv) if !argv.is_empty() => Ok(Invocation::Confine {
                grants,
                command: argv,
            }),
            _ => Err(UsageError::MissingCommand),
        }
    }
}

/// Every way the command line can be rejected. Each maps to one
/// `landlock-run: usage error: …` stderr line and exit code 125.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UsageError {
    ProbeTakesNoOtherArguments,
    MissingPath(String),
    UnknownArgument(String),
    MissingCommand,
}

impl std::fmt::Display for UsageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UsageError::ProbeTakesNoOtherArguments => {
                write!(f, "--probe takes no other arguments")
            }
            UsageError::MissingPath(flag) => write!(f, "{flag} requires a path"),
            UsageError::UnknownArgument(arg) => write!(f, "unknown argument: {arg}"),
            UsageError::MissingCommand => write!(f, "missing `-- <argv>...` command"),
        }
    }
}

impl std::error::Error for UsageError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn confine(args: &[&str]) -> Invocation {
        Invocation::parse(args.iter().copied()).expect("should parse")
    }

    #[test]
    fn probe_alone_is_accepted() {
        assert_eq!(confine(&["--probe"]), Invocation::Probe);
    }

    #[test]
    fn probe_with_any_other_argument_is_a_usage_error() {
        assert_eq!(
            Invocation::parse(["--probe", "--ro", "/tmp"]),
            Err(UsageError::ProbeTakesNoOtherArguments)
        );
        assert_eq!(
            Invocation::parse(["--ro", "/tmp", "--probe"]),
            Err(UsageError::ProbeTakesNoOtherArguments)
        );
    }

    #[test]
    fn grants_and_command_parse_in_order() {
        let invocation = confine(&["--ro", "/usr", "--rw", "/work", "--ro", "/etc", "--", "bash", "-c", "true"]);
        let Invocation::Confine { grants, command } = invocation else {
            panic!("expected Confine");
        };
        assert_eq!(grants.read_only, vec!["/usr".to_string(), "/etc".to_string()]);
        assert_eq!(grants.read_write, vec!["/work".to_string()]);
        assert_eq!(command, vec!["bash".to_string(), "-c".to_string(), "true".to_string()]);
    }

    #[test]
    fn grant_without_a_path_is_a_usage_error() {
        assert_eq!(
            Invocation::parse(["--ro"]),
            Err(UsageError::MissingPath("--ro".to_string()))
        );
        assert_eq!(
            Invocation::parse(["--rw", "--"]),
            Err(UsageError::MissingCommand)
        );
    }

    #[test]
    fn unknown_flag_is_rejected() {
        assert_eq!(
            Invocation::parse(["--rwx", "/tmp", "--", "true"]),
            Err(UsageError::UnknownArgument("--rwx".to_string()))
        );
    }

    #[test]
    fn separator_is_mandatory() {
        assert_eq!(Invocation::parse(["true"]), Err(UsageError::UnknownArgument("true".to_string())));
    }

    #[test]
    fn separator_alone_is_a_usage_error() {
        assert_eq!(Invocation::parse(["--"]), Err(UsageError::MissingCommand));
    }

    #[test]
    fn everything_after_the_separator_is_taken_literally() {
        let invocation = confine(&["--", "--ro", "--probe", "--"]);
        let Invocation::Confine { grants, command } = invocation else {
            panic!("expected Confine");
        };
        assert!(grants.read_only.is_empty());
        assert!(grants.read_write.is_empty());
        assert_eq!(
            command,
            vec!["--ro".to_string(), "--probe".to_string(), "--".to_string()]
        );
    }

    #[test]
    fn grant_args_put_read_only_roots_first() {
        let grants = LauncherGrants {
            read_only: vec!["/a".into(), "/b".into()],
            read_write: vec!["/c".into()],
        };
        assert_eq!(grants.to_args(), vec!["--ro", "/a", "--ro", "/b", "--rw", "/c"]);
    }

    #[test]
    fn failure_exit_code_is_pinned() {
        // The number is part of the CLI contract; a consumer distinguishes a
        // launcher failure from a child status by 125 plus the fatal prefix.
        assert_eq!(LAUNCHER_FAILURE_EXIT, 125);
        assert_eq!(FATAL_PREFIX, "landlock-run: ");
        assert_eq!(LAUNCHER_BIN, "landlock-run");
    }
}
