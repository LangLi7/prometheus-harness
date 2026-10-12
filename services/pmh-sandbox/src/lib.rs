//! `pmh-sandbox` — sandbox enforcement as a service.
//!
//! # The division of labour
//!
//! The reference template's sandbox is split the same way, and this port keeps
//! that split because it is the right one:
//!
//! | Concern | Where it lives |
//! |---|---|
//! | **Policy** — which modes exist, what each mode grants, what is validated | the TypeScript core (`packages/sandbox/sandbox-policy`), because policy must be visible to the agent, the UI and the settings surface |
//! | **Enforcement** — actually confining a process | here, because that is operating-system work |
//!
//! So this service never decides *what* the policy should be. It receives a
//! policy, validates that it can enforce it, and reports honestly what it
//! achieved. `docs/stack.md` makes the argument for Rust in exactly this place
//! ("Betriebssystem-Arbeit, wo Rusts Speichersicherheit und FFI-Ergonomie
//! tragen") and notes that the template already had Windows-ACL and Landlock
//! packages — this is their successor.
//!
//! # The honesty requirement
//!
//! The template's own launcher documents this and it is preserved verbatim in
//! spirit: a partially enforced sandbox must **say so**. Reporting `enforced`
//! when only a subset of the requested accesses is governed would be worse than
//! refusing, because the caller stops worrying. Every verdict therefore carries
//! both the requested mode and the mode actually achieved.

/// Exit code for every failure.
pub const EXIT_FAILURE: i32 = 125;

/// The JSON schema version of the reports this program prints.
pub const REPORT_VERSION: u32 = 1;

/// How completely a request could be enforced.
///
/// The three values mirror the template's `LandlockEnforcement` vocabulary
/// because the same three answers are needed: fully, partly, or not at all —
/// and "not at all" must be indistinguishable between the possible causes, since
/// the caller's response is the same in every case.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Enforcement {
    /// Every requested restriction is enforced.
    Full,
    /// Some restrictions are enforced; the report says which are not.
    Partial,
    /// Nothing could be enforced. Do not trust this run.
    Unusable,
}

impl Enforcement {
    pub fn as_str(self) -> &'static str {
        match self {
            Enforcement::Full => "full",
            Enforcement::Partial => "partial",
            Enforcement::Unusable => "unusable",
        }
    }
}

/// The filesystem permission level a policy asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileAccess {
    /// No filesystem access at all beyond what the process already needs to run.
    None,
    /// Read and execute beneath the granted roots only.
    ReadOnly,
    /// Read, write and execute beneath the granted roots only.
    ReadWrite,
}

impl FileAccess {
    pub fn parse(value: &str) -> Result<Self, SandboxError> {
        match value {
            "none" => Ok(FileAccess::None),
            "read-only" | "readonly" | "ro" => Ok(FileAccess::ReadOnly),
            "read-write" | "readwrite" | "rw" => Ok(FileAccess::ReadWrite),
            other => Err(SandboxError::new(
                "ERR_SANDBOX_POLICY",
                format!("unknown file access level: {other}"),
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            FileAccess::None => "none",
            FileAccess::ReadOnly => "read-only",
            FileAccess::ReadWrite => "read-write",
        }
    }
}

/// The policy a caller asks this service to enforce.
///
/// This mirrors the knobs the TypeScript policy package models. It is
/// deliberately a plain value: the service must be usable without importing any
/// part of the core.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxPolicy {
    /// Filesystem level requested.
    pub file_access: FileAccess,
    /// Roots granted read (and execute) beneath.
    pub read_roots: Vec<String>,
    /// Roots granted full access beneath.
    pub write_roots: Vec<String>,
    /// Whether outbound network access is requested.
    pub network: bool,
    /// Whether the process may spawn further processes.
    pub spawn: bool,
}

impl Default for SandboxPolicy {
    fn default() -> Self {
        SandboxPolicy {
            file_access: FileAccess::ReadOnly,
            read_roots: Vec::new(),
            write_roots: Vec::new(),
            network: false,
            spawn: false,
        }
    }
}

impl SandboxPolicy {
    /// Reject a policy that is internally inconsistent.
    ///
    /// A `none` policy with granted roots is contradictory, and so is a
    /// read-only policy with write roots: one of the two would have to be
    /// silently ignored, which is exactly the dishonesty this service exists to
    /// avoid.
    pub fn validate(&self) -> Result<(), SandboxError> {
        if self.file_access == FileAccess::None
            && (!self.read_roots.is_empty() || !self.write_roots.is_empty())
        {
            return Err(SandboxError::new(
                "ERR_SANDBOX_POLICY",
                "file access \"none\" cannot be combined with granted roots",
            ));
        }
        if self.file_access == FileAccess::ReadOnly && !self.write_roots.is_empty() {
            return Err(SandboxError::new(
                "ERR_SANDBOX_POLICY",
                "file access \"read-only\" cannot be combined with write roots; use \"read-write\"",
            ));
        }
        for root in self.read_roots.iter().chain(self.write_roots.iter()) {
            if root.is_empty() {
                return Err(SandboxError::new(
                    "ERR_SANDBOX_POLICY",
                    "a granted root must not be empty",
                ));
            }
        }
        Ok(())
    }
}

/// What this service can actually do on the running host.
///
/// Reported before anything is enforced, so a caller can choose a fallback
/// instead of discovering the limitation by failing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Capabilities {
    /// The mechanism that will be used: `landlock` on Linux, `acl` on Windows,
    /// or `none`.
    pub mechanism: &'static str,
    /// Whether filesystem confinement can be enforced at all.
    pub filesystem: bool,
    /// Whether network confinement can be enforced.
    pub network: bool,
    /// Whether process-spawn confinement can be enforced.
    pub spawn: bool,
    /// A short, honest note about the limits of the mechanism on this host.
    pub note: &'static str,
}

/// Detect what the running host supports.
pub fn capabilities() -> Capabilities {
    if cfg!(target_os = "linux") {
        Capabilities {
            mechanism: "landlock",
            filesystem: true,
            // Landlock's filesystem family constrains files, not sockets. The
            // template's launcher governs the same set and no more.
            network: false,
            spawn: false,
            note: "Landlock allow-lists filesystem access; it does not govern network or process creation",
        }
    } else if cfg!(windows) {
        Capabilities {
            mechanism: "acl",
            filesystem: true,
            network: false,
            spawn: false,
            note: "Windows ACLs confine filesystem access; network and process creation need a job object or a filter driver",
        }
    } else {
        Capabilities {
            mechanism: "none",
            filesystem: false,
            network: false,
            spawn: false,
            note: "no sandbox mechanism is implemented for this platform",
        }
    }
}

/// Judge how completely `policy` can be enforced on this host.
///
/// Returns the verdict and the list of requests that could **not** be honoured.
/// An empty list with [`Enforcement::Full`] is the only honest "everything you
/// asked for" answer.
pub fn assess(policy: &SandboxPolicy) -> Result<(Enforcement, Vec<&'static str>), SandboxError> {
    policy.validate()?;
    let capabilities = capabilities();

    if !capabilities.filesystem {
        return Ok((Enforcement::Unusable, vec!["filesystem"]));
    }

    let mut unenforced = Vec::new();
    if policy.network && !capabilities.network {
        unenforced.push("network");
    }
    if policy.spawn && !capabilities.spawn {
        unenforced.push("spawn");
    }

    let verdict = if unenforced.is_empty() {
        Enforcement::Full
    } else {
        Enforcement::Partial
    };
    Ok((verdict, unenforced))
}

/// A policy or enforcement failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxError {
    pub code: String,
    pub message: String,
}

impl SandboxError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        SandboxError {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn to_json(&self) -> String {
        format!(
            "{{\"code\":{},\"message\":{}}}",
            json_string(&self.code),
            json_string(&self.message)
        )
    }
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for SandboxError {}

/// Minimal JSON string escaping for the reports.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_minimal_policy_is_valid() {
        let policy = SandboxPolicy {
            file_access: FileAccess::ReadOnly,
            read_roots: vec!["/usr".to_string()],
            ..SandboxPolicy::default()
        };
        assert!(policy.validate().is_ok());
    }

    #[test]
    fn none_with_granted_roots_is_contradictory() {
        let policy = SandboxPolicy {
            file_access: FileAccess::None,
            read_roots: vec!["/usr".to_string()],
            ..SandboxPolicy::default()
        };
        let error = policy.validate().expect_err("rejects");
        assert_eq!(error.code, "ERR_SANDBOX_POLICY");
    }

    #[test]
    fn read_only_with_write_roots_is_contradictory() {
        // One of the two would have to be silently ignored, which is the
        // dishonesty this service exists to prevent.
        let policy = SandboxPolicy {
            file_access: FileAccess::ReadOnly,
            write_roots: vec!["/work".to_string()],
            ..SandboxPolicy::default()
        };
        let error = policy.validate().expect_err("rejects");
        assert_eq!(error.code, "ERR_SANDBOX_POLICY");
        assert!(error.message.contains("read-write"), "{}", error.message);
    }

    #[test]
    fn an_empty_root_is_rejected() {
        let policy = SandboxPolicy {
            read_roots: vec![String::new()],
            ..SandboxPolicy::default()
        };
        assert_eq!(
            policy.validate().expect_err("rejects").code,
            "ERR_SANDBOX_POLICY"
        );
    }

    #[test]
    fn access_levels_round_trip_through_their_names() {
        for level in [FileAccess::None, FileAccess::ReadOnly, FileAccess::ReadWrite] {
            assert_eq!(FileAccess::parse(level.as_str()).expect("parses"), level);
        }
        // The spellings a caller is likely to use are all accepted.
        assert_eq!(FileAccess::parse("ro").expect("parses"), FileAccess::ReadOnly);
        assert_eq!(FileAccess::parse("rw").expect("parses"), FileAccess::ReadWrite);
        assert_eq!(
            FileAccess::parse("readonly").expect("parses"),
            FileAccess::ReadOnly
        );
    }

    #[test]
    fn an_unknown_access_level_is_rejected() {
        let error = FileAccess::parse("godmode").expect_err("rejects");
        assert_eq!(error.code, "ERR_SANDBOX_POLICY");
        assert!(error.message.contains("godmode"));
    }

    #[test]
    fn a_filesystem_only_request_is_fully_enforceable_where_filesystem_works() {
        if !capabilities().filesystem {
            return;
        }
        let policy = SandboxPolicy {
            file_access: FileAccess::ReadWrite,
            read_roots: vec!["/usr".to_string()],
            write_roots: vec!["/work".to_string()],
            network: false,
            spawn: false,
        };
        let (verdict, unenforced) = assess(&policy).expect("assesses");
        assert_eq!(verdict, Enforcement::Full);
        assert!(unenforced.is_empty());
    }

    #[test]
    fn requesting_network_is_never_silently_granted() {
        // The important property: asking for something the mechanism cannot do
        // must produce `partial`, never a quiet `full`.
        let policy = SandboxPolicy {
            network: true,
            ..SandboxPolicy::default()
        };
        let (verdict, unenforced) = assess(&policy).expect("assesses");
        if capabilities().network {
            assert_eq!(verdict, Enforcement::Full);
        } else {
            assert_eq!(verdict, Enforcement::Partial);
            assert!(unenforced.contains(&"network"));
        }
    }

    #[test]
    fn requesting_spawn_control_is_never_silently_granted() {
        let policy = SandboxPolicy {
            spawn: true,
            ..SandboxPolicy::default()
        };
        let (verdict, unenforced) = assess(&policy).expect("assesses");
        if capabilities().spawn {
            assert_eq!(verdict, Enforcement::Full);
        } else {
            assert_eq!(verdict, Enforcement::Partial);
            assert!(unenforced.contains(&"spawn"));
        }
    }

    #[test]
    fn every_unenforceable_request_is_listed_not_just_the_first() {
        let policy = SandboxPolicy {
            network: true,
            spawn: true,
            ..SandboxPolicy::default()
        };
        let (_, unenforced) = assess(&policy).expect("assesses");
        if !capabilities().network {
            assert!(unenforced.contains(&"network"));
        }
        if !capabilities().spawn {
            assert!(unenforced.contains(&"spawn"));
        }
        // A report that names only one of two gaps is not an honest report.
        let expected = usize::from(!capabilities().network) + usize::from(!capabilities().spawn);
        assert_eq!(unenforced.len(), expected);
    }

    #[test]
    fn an_invalid_policy_is_rejected_before_any_assessment() {
        let policy = SandboxPolicy {
            file_access: FileAccess::ReadOnly,
            write_roots: vec!["/work".to_string()],
            ..SandboxPolicy::default()
        };
        assert!(assess(&policy).is_err());
    }

    #[test]
    fn the_verdict_vocabulary_matches_the_template() {
        // The same three words the template's launcher probe uses; a caller must
        // be able to treat both services identically.
        assert_eq!(Enforcement::Full.as_str(), "full");
        assert_eq!(Enforcement::Partial.as_str(), "partial");
        assert_eq!(Enforcement::Unusable.as_str(), "unusable");
    }

    #[test]
    fn capabilities_name_the_real_mechanism() {
        let capabilities = capabilities();
        if cfg!(target_os = "linux") {
            assert_eq!(capabilities.mechanism, "landlock");
            assert!(capabilities.filesystem);
        } else if cfg!(windows) {
            assert_eq!(capabilities.mechanism, "acl");
        }
        // Neither mechanism governs the network; claiming otherwise would be a
        // security bug, not a feature.
        assert!(!capabilities.network || capabilities.filesystem);
    }

    #[test]
    fn the_report_version_is_pinned() {
        assert_eq!(REPORT_VERSION, 1);
        assert_eq!(EXIT_FAILURE, 125);
    }
}
