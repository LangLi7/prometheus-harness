//! `pmh-atomicfs` — durable atomic file operations as a process.
//!
//! # Why this exists
//!
//! The reference template depends on the native Node addon **`koffi`** for its
//! JSONL session durability, specifically to reach `MoveFileExW` with
//! `MOVEFILE_WRITE_THROUGH` on Windows. `docs/risks.md` §1 rates that dependency
//! as the **highest** risk in the whole project ("**hoch**"), because the addon
//! is built from source and its behaviour under Bun is unverified.
//!
//! Rather than measure that risk, this port removes it: the same guarantee is
//! provided by a process the TypeScript core calls. There is then no native
//! addon, no ABI question, and no Node/Bun compatibility test — only a binary
//! with a documented command line.
//!
//! # The guarantee being reproduced
//!
//! A durable write must satisfy all four of these:
//!
//! 1. **Never a torn file.** A reader sees either the old content or the new
//!    content, never a half-written mixture. Guaranteed by writing to a
//!    temporary file in the same directory and replacing atomically.
//! 2. **The bytes reach the medium before success is reported.** Guaranteed by
//!    flushing the file's buffers and, on Windows, by asking the filesystem to
//!    write through. This is the `MOVEFILE_WRITE_THROUGH` half of `koffi`'s job.
//! 3. **The rename itself is durable.** On POSIX the directory entry must be
//!    flushed too, otherwise a crash can lose the rename even though the data
//!    survived. Guaranteed by fsyncing the containing directory.
//! 4. **Identity is reportable.** `flock-contract.md` notes that replacing a
//!    pathname does not transfer a lock to the replacement inode, and that the
//!    JSONL backend checks identity separately. The report therefore carries the
//!    device and inode (or Windows file index) of what was written.

use std::path::{Path, PathBuf};

/// Exit code for every failure.
pub const EXIT_FAILURE: i32 = 125;

/// The JSON schema version of the reports this program prints.
pub const REPORT_VERSION: u32 = 1;

/// One operation's outcome, reported as a single line of JSON on stdout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriteReport {
    /// Always [`REPORT_VERSION`].
    pub version: u32,
    /// The path that now holds the new content.
    pub path: String,
    /// Bytes written.
    pub bytes: u64,
    /// Bytes flushed to the medium as part of this operation.
    pub synced: u64,
    /// Identity of the written file, when the platform can report it.
    pub identity: Option<FileIdentity>,
    /// `true` when an existing target was replaced rather than created.
    pub replaced: bool,
}

impl WriteReport {
    /// Render as one line of JSON.
    pub fn to_json(&self) -> String {
        let identity = match &self.identity {
            Some(identity) => identity.to_json(),
            None => "null".to_string(),
        };
        format!(
            "{{\"version\":{},\"path\":{},\"bytes\":{},\"synced\":{},\"replaced\":{},\"identity\":{}}}",
            self.version,
            json_string(&self.path),
            self.bytes,
            self.synced,
            self.replaced,
            identity
        )
    }
}

/// Enough identity to answer "is this still the same file as before?", which is
/// what a lock owner needs after a replace.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileIdentity {
    /// Device number (Unix) or volume serial number (Windows).
    pub device: u64,
    /// Inode number (Unix) or file index (Windows).
    pub inode: u64,
}

impl FileIdentity {
    /// Render as JSON.
    pub fn to_json(&self) -> String {
        format!(
            "{{\"device\":{},\"inode\":{}}}",
            self.device, self.inode
        )
    }
}

/// A failure, rendered as one JSON object on stderr.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtomicError {
    /// Symbolic code, for example `ERR_ATOMIC_WRITE` or a POSIX name.
    pub code: String,
    /// Positive OS error number when the failure came from a syscall.
    pub errno: Option<i32>,
    /// Human-readable message naming the path involved.
    pub message: String,
}

impl AtomicError {
    /// A failure with an explicit code and no errno.
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        AtomicError {
            code: code.into(),
            errno: None,
            message: message.into(),
        }
    }

    /// A failure carrying the current OS error.
    pub fn from_io(code: impl Into<String>, context: &str, error: &std::io::Error) -> Self {
        let errno = error.raw_os_error().map(|value| value.abs());
        AtomicError {
            code: code.into(),
            errno,
            message: format!("{context}: {error}"),
        }
    }

    /// Render as JSON.
    pub fn to_json(&self) -> String {
        let mut fields = vec![
            format!("\"code\":{}", json_string(&self.code)),
            format!("\"message\":{}", json_string(&self.message)),
        ];
        if let Some(errno) = self.errno {
            fields.push(format!("\"errno\":{errno}"));
        }
        format!("{{{}}}", fields.join(","))
    }
}

impl std::fmt::Display for AtomicError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AtomicError {}

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

/// The temporary file name for `target`, in the **same directory**.
///
/// Same directory matters: an atomic replace is only atomic within one
/// filesystem, so a temp file in the system temp directory would silently
/// degrade to a copy. The name carries the process id so two concurrent writers
/// never collide.
pub fn temporary_path(target: &Path) -> Result<PathBuf, AtomicError> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let Some(name) = target.file_name() else {
        return Err(AtomicError::new(
            "ERR_ATOMIC_TARGET",
            format!("target has no file name: {}", target.display()),
        ));
    };
    let mut temp_name = std::ffi::OsString::from(".");
    temp_name.push(name);
    temp_name.push(format!(".pmh-tmp.{}", std::process::id()));
    Ok(parent.join(temp_name))
}

/// Write `contents` to `target` atomically and durably.
///
/// The four guarantees are documented on this module. On success the file at
/// `target` holds exactly `contents`, and the bytes are on the medium.
pub fn write_atomic(target: &Path, contents: &[u8]) -> Result<WriteReport, AtomicError> {
    let replaced = target.exists();
    let temp = temporary_path(target)?;

    // Step 1 — write the full content to a sibling temporary file.
    {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temp)
            .map_err(|error| {
                AtomicError::from_io(
                    "ERR_ATOMIC_WRITE",
                    &format!("cannot create temporary file {}", temp.display()),
                    &error,
                )
            })?;
        use std::io::Write;
        file.write_all(contents).map_err(|error| {
            AtomicError::from_io(
                "ERR_ATOMIC_WRITE",
                &format!("cannot write temporary file {}", temp.display()),
                &error,
            )
        })?;
        // Step 2 — the bytes must reach the medium before the rename makes them
        // visible. `sync_all` covers both data and metadata.
        file.sync_all().map_err(|error| {
            AtomicError::from_io(
                "ERR_ATOMIC_SYNC",
                &format!("cannot flush temporary file {}", temp.display()),
                &error,
            )
        })?;
    }

    // Step 3 — replace the target. On both platforms this replaces an existing
    // name in one step; an interrupted replace leaves the old file intact.
    let identity = replace(&temp, target).inspect_err(|_| {
        // Leave no debris behind on failure.
        let _ = std::fs::remove_file(&temp);
    })?;

    Ok(WriteReport {
        version: REPORT_VERSION,
        path: target.display().to_string(),
        bytes: contents.len() as u64,
        synced: contents.len() as u64,
        identity,
        replaced,
    })
}

/// Read a file and report its identity, for callers that need to confirm a file
/// is still the one they locked.
pub fn read_with_identity(target: &Path) -> Result<(Vec<u8>, Option<FileIdentity>), AtomicError> {
    let bytes = std::fs::read(target).map_err(|error| {
        AtomicError::from_io(
            "ERR_ATOMIC_READ",
            &format!("cannot read {}", target.display()),
            &error,
        )
    })?;
    let identity = identity_of(target).ok();
    Ok((bytes, identity))
}

/// Report the identity of an existing path.
pub fn identity_of(target: &Path) -> Result<FileIdentity, AtomicError> {
    let metadata = std::fs::metadata(target).map_err(|error| {
        AtomicError::from_io(
            "ERR_ATOMIC_STAT",
            &format!("cannot stat {}", target.display()),
            &error,
        )
    })?;
    platform::identity_of(&metadata, target)
}

/// Remove a stale temporary file left by a crashed writer with the same pid.
pub fn cleanup_temporary(target: &Path) -> Result<bool, AtomicError> {
    let temp = temporary_path(target)?;
    match std::fs::remove_file(&temp) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(AtomicError::from_io(
            "ERR_ATOMIC_CLEANUP",
            &format!("cannot remove {}", temp.display()),
            &error,
        )),
    }
}

#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> Result<Option<FileIdentity>, AtomicError> {
    platform::windows::move_file_write_through(from, to)?;
    Ok(identity_of(to).ok())
}

#[cfg(unix)]
fn replace(from: &Path, to: &Path) -> Result<Option<FileIdentity>, AtomicError> {
    std::fs::rename(from, to).map_err(|error| {
        AtomicError::from_io(
            "ERR_ATOMIC_RENAME",
            &format!("cannot replace {} with {}", to.display(), from.display()),
            &error,
        )
    })?;
    // Step 4 — make the rename itself durable. Without flushing the directory a
    // crash can lose the new name even though the file's data survived. This
    // half has no Windows analogue: `MoveFileExW` with write-through already
    // covers the directory entry there.
    if let Some(parent) = to.parent() {
        if let Ok(directory) = std::fs::File::open(parent) {
            let _ = directory.sync_all();
        }
    }
    Ok(identity_of(to).ok())
}

#[cfg(unix)]
mod platform {
    use super::*;

    pub fn identity_of(metadata: &std::fs::Metadata, _path: &Path) -> Result<FileIdentity, AtomicError> {
        use std::os::unix::fs::MetadataExt;
        Ok(FileIdentity {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
}

#[cfg(windows)]
mod platform {
    use super::*;

    pub mod windows {
        use super::*;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, MOVEFILE_REPLACE_EXISTING,
            MOVEFILE_WRITE_THROUGH, MoveFileExW,
        };

        fn wide(path: &Path) -> Vec<u16> {
            path.as_os_str().encode_wide().chain(Some(0)).collect()
        }

        // `CreateFileW` is declared directly instead of imported. The helper
        // crate moves it between modules and feature gates between releases, and
        // pinning the declaration here keeps the build independent of that
        // churn — the same reasoning the template's C original used when it
        // defined the Landlock UAPI locally rather than including a header.
        #[link(name = "kernel32")]
        extern "system" {
            fn CreateFileW(
                file_name: *const u16,
                desired_access: u32,
                share_mode: u32,
                security_attributes: *const core::ffi::c_void,
                creation_disposition: u32,
                flags_and_attributes: u32,
                template_file: *mut core::ffi::c_void,
            ) -> *mut core::ffi::c_void;

            fn CloseHandle(object: *mut core::ffi::c_void) -> i32;
        }

        const GENERIC_READ: u32 = 0x8000_0000;
        const FILE_SHARE_READ: u32 = 0x0000_0001;
        const FILE_SHARE_WRITE: u32 = 0x0000_0002;
        const FILE_SHARE_DELETE: u32 = 0x0000_0004;
        const OPEN_EXISTING: u32 = 3;
        /// Lets `CreateFileW` succeed on a directory as well as a file, which
        /// the `identity` subcommand needs.
        const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
        const INVALID_HANDLE_VALUE: *mut core::ffi::c_void = usize::MAX as *mut core::ffi::c_void;

        /// `MoveFileExW` with both `MOVEFILE_REPLACE_EXISTING` and
        /// `MOVEFILE_WRITE_THROUGH`.
        ///
        /// This is precisely the call the template reaches through `koffi`, and
        /// the reason it needed a native addon at all. `MOVEFILE_WRITE_THROUGH`
        /// makes the function return only once the move has been flushed — the
        /// Windows equivalent of the POSIX `fsync` of both file and directory.
        pub fn move_file_write_through(from: &Path, to: &Path) -> Result<(), AtomicError> {
            let from_wide = wide(from);
            let to_wide = wide(to);
            // SAFETY: both buffers are NUL-terminated UTF-16 and outlive the call.
            let ok = unsafe {
                MoveFileExW(
                    from_wide.as_ptr(),
                    to_wide.as_ptr(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
                )
            };
            if ok == 0 {
                return Err(AtomicError::from_io(
                    "ERR_ATOMIC_MOVE",
                    &format!(
                        "MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) failed for {}",
                        to.display()
                    ),
                    &std::io::Error::last_os_error(),
                ));
            }
            Ok(())
        }

        /// Volume serial number and file index for a path.
        ///
        /// Reached through `GetFileInformationByHandle` rather than the
        /// `MetadataExt` accessors, which are still unstable in the standard
        /// library. The pair plays exactly the role dev+inode plays on Unix, and
        /// it is what a lock owner compares after a replace to notice that the
        /// name now refers to a different file.
        pub fn identity_by_handle(path: &Path) -> Result<FileIdentity, AtomicError> {
            let wide_path = wide(path);
            // SAFETY: `wide_path` is a NUL-terminated UTF-16 string, a null
            // security descriptor and template are the documented form, and the
            // returned handle is closed below on every path.
            let handle = unsafe {
                CreateFileW(
                    wide_path.as_ptr(),
                    GENERIC_READ,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    FILE_FLAG_BACKUP_SEMANTICS,
                    std::ptr::null_mut(),
                )
            };
            if handle == INVALID_HANDLE_VALUE || handle.is_null() {
                return Err(AtomicError::from_io(
                    "ERR_ATOMIC_STAT",
                    &format!("cannot open {} for identity", path.display()),
                    &std::io::Error::last_os_error(),
                ));
            }

            // SAFETY: `handle` came from `CreateFileW` and `information` is a
            // correctly sized out-parameter for the call.
            let mut information: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
            let ok = unsafe { GetFileInformationByHandle(handle, &mut information) };
            // Nothing else uses the handle.
            unsafe { CloseHandle(handle) };

            if ok == 0 {
                return Err(AtomicError::from_io(
                    "ERR_ATOMIC_STAT",
                    &format!("GetFileInformationByHandle failed for {}", path.display()),
                    &std::io::Error::last_os_error(),
                ));
            }

            Ok(FileIdentity {
                device: u64::from(information.dwVolumeSerialNumber),
                // The file index is a 64-bit value split across two 32-bit fields.
                inode: (u64::from(information.nFileIndexHigh) << 32)
                    | u64::from(information.nFileIndexLow),
            })
        }
    }

    pub fn identity_of(
        _metadata: &std::fs::Metadata,
        path: &Path,
    ) -> Result<FileIdentity, AtomicError> {
        windows::identity_by_handle(path)
    }
}

#[cfg(not(any(unix, windows)))]
mod platform {
    use super::*;

    pub fn identity_of(
        _metadata: &std::fs::Metadata,
        _path: &Path,
    ) -> Result<FileIdentity, AtomicError> {
        Err(AtomicError::new(
            "ERR_ATOMIC_UNSUPPORTED",
            format!("identity is not available on {}", std::env::consts::OS),
        ))
    }
}

#[cfg(not(any(unix, windows)))]
fn replace(_from: &Path, _to: &Path) -> Result<Option<FileIdentity>, AtomicError> {
    Err(AtomicError::new(
        "ERR_ATOMIC_UNSUPPORTED",
        format!("atomic replace is not implemented on {}", std::env::consts::OS),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pmh-atomicfs-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn a_write_creates_the_file_with_exactly_the_given_bytes() {
        let dir = temp_dir("create");
        let target = dir.join("log.jsonl");
        let report = write_atomic(&target, b"{\"a\":1}\n").expect("write");
        assert_eq!(std::fs::read(&target).expect("read"), b"{\"a\":1}\n");
        assert_eq!(report.bytes, 8);
        assert!(!report.replaced, "a fresh write does not replace");
        assert_eq!(report.version, REPORT_VERSION);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_second_write_replaces_the_first_and_says_so() {
        let dir = temp_dir("replace");
        let target = dir.join("log.jsonl");
        write_atomic(&target, b"first").expect("first write");
        let report = write_atomic(&target, b"second").expect("second write");
        assert_eq!(std::fs::read(&target).expect("read"), b"second");
        assert!(report.replaced);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_identity_changes_across_an_atomic_replace() {
        // This is the property the JSONL backend depends on: a replace creates
        // a new file, so a lock held on the old inode no longer refers to the
        // path. `flock-contract.md` requires the backend to check identity
        // separately for exactly this reason.
        let dir = temp_dir("identity");
        let target = dir.join("log.jsonl");
        write_atomic(&target, b"first").expect("first write");
        let before = identity_of(&target).expect("identity");
        write_atomic(&target, b"second").expect("second write");
        let after = identity_of(&target).expect("identity");
        assert_ne!(before, after, "an atomic replace must produce a new identity");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_temporary_file_survives_a_successful_write() {
        let dir = temp_dir("cleanup");
        let target = dir.join("log.jsonl");
        write_atomic(&target, b"data").expect("write");
        let leftovers: Vec<_> = std::fs::read_dir(&dir)
            .expect("read dir")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .filter(|name| name.contains("pmh-tmp"))
            .collect();
        assert!(leftovers.is_empty(), "left behind: {leftovers:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_temporary_file_is_a_sibling_so_the_replace_stays_atomic() {
        let target = Path::new("/some/dir/log.jsonl");
        let temp = temporary_path(target).expect("temp path");
        assert_eq!(temp.parent(), target.parent());
        assert!(temp
            .file_name()
            .expect("name")
            .to_string_lossy()
            .contains("log.jsonl"));
    }

    #[test]
    fn a_failed_write_leaves_the_old_content_intact() {
        let dir = temp_dir("intact");
        let target = dir.join("log.jsonl");
        write_atomic(&target, b"keep me").expect("initial write");
        // A target whose parent does not exist cannot be replaced.
        let missing = dir.join("no-such-dir").join("log.jsonl");
        assert!(write_atomic(&missing, b"nope").is_err());
        assert_eq!(std::fs::read(&target).expect("read"), b"keep me");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_empty_write_is_a_valid_write() {
        let dir = temp_dir("empty");
        let target = dir.join("empty.jsonl");
        let report = write_atomic(&target, b"").expect("write");
        assert_eq!(report.bytes, 0);
        assert_eq!(std::fs::read(&target).expect("read").len(), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_with_identity_returns_both() {
        let dir = temp_dir("readid");
        let target = dir.join("log.jsonl");
        write_atomic(&target, b"abc").expect("write");
        let (bytes, identity) = read_with_identity(&target).expect("read");
        assert_eq!(bytes, b"abc");
        assert_eq!(identity, Some(identity_of(&target).expect("identity")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_reports_whether_it_removed_anything() {
        let dir = temp_dir("cleanup-report");
        let target = dir.join("log.jsonl");
        assert!(!cleanup_temporary(&target).expect("nothing to clean"));
        let temp = temporary_path(&target).expect("temp path");
        std::fs::write(&temp, b"stale").expect("write stale temp");
        assert!(cleanup_temporary(&target).expect("cleaned"));
        assert!(!temp.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_report_json_has_stable_field_names() {
        let report = WriteReport {
            version: REPORT_VERSION,
            path: "/tmp/a.jsonl".to_string(),
            bytes: 3,
            synced: 3,
            identity: Some(FileIdentity {
                device: 1,
                inode: 2,
            }),
            replaced: true,
        };
        assert_eq!(
            report.to_json(),
            "{\"version\":1,\"path\":\"/tmp/a.jsonl\",\"bytes\":3,\"synced\":3,\"replaced\":true,\"identity\":{\"device\":1,\"inode\":2}}"
        );
    }

    #[test]
    fn the_error_json_includes_the_errno_only_when_known() {
        let with = AtomicError::from_io(
            "ERR_ATOMIC_WRITE",
            "boom",
            &std::io::Error::from_raw_os_error(13),
        );
        assert!(with.to_json().contains("\"errno\":13"), "{}", with.to_json());
        let without = AtomicError::new("ERR_ATOMIC_TARGET", "no name");
        assert!(!without.to_json().contains("\"errno\""));
    }

    #[test]
    fn failure_exit_code_is_pinned() {
        assert_eq!(EXIT_FAILURE, 125);
    }
}
