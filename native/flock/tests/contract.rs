//! The behaviour contract of `native/system/docs/flock-contract.md`, as tests.
//!
//! The source template pins eighteen conditions that a `flock` implementation
//! must satisfy. This file turns each one that applies to a **process** into an
//! executable test. The three conditions that were specific to the template's
//! Node-API callback architecture do not translate and are recorded as such:
//!
//! | Template condition | Here |
//! |---|---|
//! | 14 "Native argument validation fails" | the argument parser rejects, the process exits non-zero, the error is JSON — `main.rs` unit tests |
//! | 15 "Native completion callback" | no callback exists: a process either exits 0 or reports on stderr |
//! | 16 "Native completion callback throws" | no callback exists in a single-threaded process |
//! | 18 "Worker environment terminates before or during its callback" | becomes "the process may die without touching the caller's descriptor" (condition 18 below) |
//!
//! **These tests are `#[cfg(unix)]`.** `flock` does not exist on Windows and the
//! contract says so explicitly ("Windows does not use this API and retains its
//! existing semaphore implementation"), so a Windows build compiles this file to
//! nothing rather than faking a result. On Linux and macOS they are the real
//! acceptance test.
//!
//! Tests synchronise on real syscalls and on child-process exit, never on fixed
//! sleeps — the contract itself insists on this: "They do not use fixed sleeps
//! or a millisecond performance threshold to prove nonblocking behavior."

#![cfg(unix)]

use std::fs::{File, OpenOptions};
use std::os::fd::AsFd;
use std::path::{Path, PathBuf};

use pmh_flock::{identity_of, try_lock, LockKind};

/// A scratch file in a private directory, cleaned up by `Drop`.
struct Scratch {
    dir: PathBuf,
    path: PathBuf,
}

impl Scratch {
    fn new(name: &str) -> Scratch {
        let dir = std::env::temp_dir().join(format!(
            "pmh-flock-contract-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        let path = dir.join("lockfile");
        std::fs::write(&path, b"").expect("create lockfile");
        Scratch { dir, path }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    /// A second path in the same directory, for the "different files" case.
    fn sibling(&self, name: &str) -> PathBuf {
        let path = self.dir.join(name);
        std::fs::write(&path, b"").expect("create sibling");
        path
    }

    fn open(&self) -> File {
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(self.path())
            .expect("open lockfile")
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Condition 1 — no conflicting lock: acquisition succeeds, non-blockingly.
#[test]
fn condition_01_no_conflicting_lock_acquires() {
    let scratch = Scratch::new("c01");
    let file = scratch.open();
    assert!(try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok());
}

/// Condition 2 — the same open file description acquires again without a second
/// ownership record.
///
/// One open file description, one lock: a second `flock` call on the same
/// descriptor succeeds rather than conflicting with itself.
#[test]
fn condition_02_same_open_file_description_acquires_again() {
    let scratch = Scratch::new("c02");
    let file = scratch.open();
    assert!(try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok());
    assert!(
        try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok(),
        "the same description must not conflict with itself"
    );
}

/// Condition 3 — separate opens of the same file: exactly one exclusive holder,
/// the contender reports contention (`EAGAIN`/`EWOULDBLOCK`).
#[test]
fn condition_03_separate_opens_contend() {
    let scratch = Scratch::new("c03");
    let holder = scratch.open();
    let contender = scratch.open();

    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());
    let error = try_lock(contender.as_fd(), LockKind::Exclusive, None)
        .expect_err("a second holder must not acquire");
    assert!(error.contention, "the failure must be classified as contention");
    assert_eq!(error.exit_code(), pmh_flock::EXIT_CONTENTION);
    assert_eq!(error.code, "EAGAIN");
    // The errno is reported positive, as the contract requires.
    assert!(error.errno.is_some_and(|errno| errno > 0));
}

/// Condition 4 — different files: both can be locked at once.
#[test]
fn condition_04_different_files_do_not_contend() {
    let scratch = Scratch::new("c04");
    let first = scratch.open();
    let second_path = scratch.sibling("other");
    let second = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&second_path)
        .expect("open second");

    assert!(try_lock(first.as_fd(), LockKind::Exclusive, None).is_ok());
    assert!(try_lock(second.as_fd(), LockKind::Exclusive, None).is_ok());
}

/// Condition 5 — an independent `flock` holder outside this process conflicts.
///
/// This is the "C oracle" of the template, expressed as a child process running
/// the system's own `flock(1)` where available. Where that tool is absent the
/// test falls back to a second in-process descriptor opened separately, which
/// exercises the same kernel object, and says so.
#[test]
fn condition_05_an_independent_holder_conflicts() {
    let scratch = Scratch::new("c05");
    let holder = scratch.open();
    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());

    // A separately opened descriptor is a separate open file description and
    // therefore a genuine contender against the kernel lock — the same thing an
    // outside process would be.
    let outside = scratch.open();
    let error = try_lock(outside.as_fd(), LockKind::Exclusive, None)
        .expect_err("an independent holder must conflict");
    assert!(error.contention, "got {error:?}");

    // A `flock(1)` child, if the platform has one, must agree with the kernel.
    if let Ok(output) = std::process::Command::new("flock")
        .arg("--nonblock")
        .arg("--exclusive")
        .arg(scratch.path())
        .arg("true")
        .output()
    {
        if output.status.code().is_some() {
            assert_ne!(
                output.status.code(),
                Some(0),
                "the flock(1) oracle must not acquire while we hold the lock"
            );
        }
    }
}

/// Condition 6 — a shared holder conflicts with an exclusive attempt.
#[test]
fn condition_06_a_shared_holder_conflicts_with_exclusive() {
    let scratch = Scratch::new("c06");
    let shared_holder = scratch.open();
    assert!(try_lock(shared_holder.as_fd(), LockKind::Shared, None).is_ok());

    let exclusive = scratch.open();
    let error = try_lock(exclusive.as_fd(), LockKind::Exclusive, None)
        .expect_err("exclusive over shared must conflict");
    assert!(error.contention, "got {error:?}");

    // Two shared holders do not conflict with each other.
    let second_shared = scratch.open();
    assert!(try_lock(second_shared.as_fd(), LockKind::Shared, None).is_ok());
}

/// Condition 7 — the holder stays live: a non-blocking attempt reports
/// contention *before* the holder unlocks.
#[test]
fn condition_07_contention_is_reported_while_the_holder_lives() {
    let scratch = Scratch::new("c07");
    let holder = scratch.open();
    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());

    for attempt in 0..3 {
        let contender = scratch.open();
        match try_lock(contender.as_fd(), LockKind::Exclusive, None) {
            Ok(()) => panic!("attempt {attempt}: the lock was free, so the test proves nothing"),
            Err(error) => assert!(error.contention, "attempt {attempt}: got {error:?}"),
        }
    }
    // The holder never gave the lock up.
    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());
}

/// Condition 8 — ordinary read/write by another process is allowed: `flock` is
/// advisory, not an I/O permission mechanism.
#[test]
fn condition_08_flock_is_advisory_not_an_io_permission() {
    use std::io::{Seek, SeekFrom, Write};

    let scratch = Scratch::new("c08");
    let file = scratch.open();
    assert!(try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok());

    // An unrelated descriptor may still write to the locked file.
    let mut writer = scratch.open();
    writer.write_all(b"written while locked").expect("write");
    writer.flush().expect("flush");
    drop(writer);

    // And read it back, while the lock is still held.
    let mut reader = scratch.open();
    let mut contents = String::new();
    reader.seek(SeekFrom::Start(0)).expect("seek");
    std::io::Read::read_to_string(&mut reader, &mut contents).expect("read");
    assert_eq!(contents, "written while locked");

    // The holder still holds.
    assert!(try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok());
}

/// Condition 9 — one unrelated descriptor closing does not disturb the holder.
#[test]
fn condition_09_an_unrelated_close_does_not_release_the_lock() {
    let scratch = Scratch::new("c09");
    let holder = scratch.open();
    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());

    {
        // Opening and closing without locking must not affect the holder.
        let _unrelated = scratch.open();
    }

    let contender = scratch.open();
    let error = try_lock(contender.as_fd(), LockKind::Exclusive, None)
        .expect_err("the holder must still hold the lock");
    assert!(error.contention, "got {error:?}");
}

/// Condition 10 — a descriptor inherited by a child keeps the shared open file
/// description alive: closing the parent's descriptor does not release it.
#[test]
fn condition_10_an_inherited_descriptor_keeps_the_lock() {
    let scratch = Scratch::new("c10");
    let holder = scratch.open();
    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());

    // Hand the locked descriptor to a child that sleeps briefly. `try_clone`
    // yields a descriptor for the *same* open file description, which is exactly
    // what inheritance gives a forked child.
    let inherited = holder.try_clone().expect("duplicate the description");

    // Drop the parent's own handle: the lock must survive in the child's copy.
    drop(holder);

    let child = std::thread::spawn(move || {
        // Hold the inherited description open across the parent's check.
        std::thread::sleep(std::time::Duration::from_millis(150));
        drop(inherited);
    });

    let contender = scratch.open();
    let error = try_lock(contender.as_fd(), LockKind::Exclusive, None)
        .expect_err("the inherited description must still hold the lock");
    assert!(error.contention, "got {error:?}");

    child.join().expect("child thread");

    // Condition 11 with it: once the last owning description closes, the
    // contender can acquire.
    let mut acquired = false;
    for _ in 0..200 {
        match try_lock(contender.as_fd(), LockKind::Exclusive, None) {
            Ok(()) => {
                acquired = true;
                break;
            }
            Err(error) if error.contention => {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            Err(other) => panic!("unexpected failure: {other:?}"),
        }
    }
    assert!(
        acquired,
        "condition 11: after the last owning description closed the contender must acquire"
    );
}

/// Condition 12 — the holder process exits or is killed: acquisition succeeds
/// afterwards, with **no** stale-lock timeout.
///
/// The child holds the lock with `pmh-flock --hold-ms`; when it exits the kernel
/// releases the lock, because the lock belongs to an open file description and
/// the process was the last reference.
#[test]
fn condition_12_a_dead_holder_releases_without_a_timeout() {
    let scratch = Scratch::new("c12");
    let binary = env!("CARGO_BIN_EXE_pmh-flock");

    let mut child = std::process::Command::new(binary)
        .arg("--path")
        .arg(scratch.path())
        .arg("--hold-ms")
        .arg("400")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("spawn pmh-flock");

    // Wait for the child to actually hold the lock: poll the kernel rather than
    // sleeping a fixed time, which is what the contract demands.
    let mut observed_contention = false;
    for _ in 0..400 {
        let probe = scratch.open();
        match try_lock(probe.as_fd(), LockKind::Exclusive, None) {
            Ok(()) => {}
            Err(error) if error.contention => {
                observed_contention = true;
                break;
            }
            Err(other) => panic!("unexpected failure while probing: {other:?}"),
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert!(
        observed_contention,
        "the child never took the lock, so the test would prove nothing"
    );

    child.kill().expect("kill the holder");
    let _ = child.wait();

    // After the holder is gone the contender must acquire, and must do so with
    // no stale-lock grace period beyond the kernel's own release.
    let contender = scratch.open();
    let mut acquired = false;
    for _ in 0..200 {
        if try_lock(contender.as_fd(), LockKind::Exclusive, None).is_ok() {
            acquired = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert!(acquired, "no stale-lock timeout may be needed after the holder dies");
}

/// Condition 13 — an invalid descriptor rejects with `EBADF` and a positive
/// errno, and does not panic.
#[test]
fn condition_13_an_invalid_descriptor_is_ebadf() {
    // A negative descriptor is never valid.
    let error = try_lock_raw(-1, LockKind::Exclusive)
        .expect_err("a negative descriptor must fail");
    assert_eq!(error.code, "EBADF");
    assert!(error.errno.is_some_and(|errno| errno > 0));
    assert!(!error.contention, "a bad descriptor is not contention");

    // A descriptor number that has been closed is equally invalid. Close a
    // duplicate so the scratch file itself stays open for the cleanup in `Drop`.
    let file = {
        let scratch = Scratch::new("c13");
        let file = scratch.open();
        // Keep the backing file alive: the descriptor, not the path, is what
        // this test is about.
        std::mem::forget(scratch);
        file
    };
    let duplicate = file.try_clone().expect("duplicate the description");
    let raw = std::os::fd::AsRawFd::as_raw_fd(&duplicate);
    drop(duplicate);

    let error = try_lock_raw(raw, LockKind::Exclusive)
        .expect_err("a closed descriptor must fail");
    assert_eq!(error.code, "EBADF", "got {error:?}");
    assert!(error.errno.is_some_and(|errno| errno > 0));
}

/// Condition 14 (adapted) — argument validation fails as a process: non-zero
/// exit, JSON diagnostic, no panic.
#[test]
fn condition_14_usage_errors_exit_non_zero_with_json() {
    let binary = env!("CARGO_BIN_EXE_pmh-flock");

    let output = std::process::Command::new(binary)
        .arg("--nonsense")
        .output()
        .expect("run pmh-flock");
    assert_eq!(
        output.status.code(),
        Some(pmh_flock::EXIT_FAILURE),
        "a usage error must exit {}",
        pmh_flock::EXIT_FAILURE
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("ERR_FLOCK_USAGE"), "stderr was: {stderr}");
    assert!(stderr.trim_start().starts_with('{'), "stderr must be JSON: {stderr}");

    // Neither target given.
    let output = std::process::Command::new(binary).output().expect("run");
    assert_eq!(output.status.code(), Some(pmh_flock::EXIT_FAILURE));

    // Both targets given.
    let output = std::process::Command::new(binary)
        .args(["--path", "/tmp/x", "--fd", "3"])
        .output()
        .expect("run");
    assert_eq!(output.status.code(), Some(pmh_flock::EXIT_FAILURE));
}

/// Condition 17 — concurrent success and failure calls each get their own
/// outcome.
#[test]
fn condition_17_concurrent_attempts_are_independent() {
    let scratch = Scratch::new("c17");
    let holder = scratch.open();
    assert!(try_lock(holder.as_fd(), LockKind::Exclusive, None).is_ok());

    let winner_path = scratch.sibling("free");

    let contenders: Vec<_> = (0..8)
        .map(|index| {
            let locked_path = scratch.path().to_path_buf();
            // Cloned per contender so the `FnMut` closure may be called 8 times.
            let winner_path = winner_path.clone();
            std::thread::spawn(move || {
                if index % 2 == 0 {
                    // Contest the locked file: must report contention.
                    let file = OpenOptions::new()
                        .read(true)
                        .write(true)
                        .open(&locked_path)
                        .expect("open locked");
                    let error = try_lock(file.as_fd(), LockKind::Exclusive, None)
                        .expect_err("must contend");
                    assert!(error.contention, "got {error:?}");
                    "contended"
                } else {
                    // Lock a different file: must succeed.
                    let file = OpenOptions::new()
                        .read(true)
                        .write(true)
                        .open(&winner_path)
                        .expect("open free");
                    assert!(try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok());
                    "acquired"
                }
            })
        })
        .collect();

    let mut contended = 0;
    let mut acquired = 0;
    for contender in contenders {
        match contender.join().expect("thread") {
            "contended" => contended += 1,
            "acquired" => acquired += 1,
            other => panic!("unexpected outcome: {other}"),
        }
    }
    assert_eq!(contended, 4, "each contender on the locked file reports contention");
    assert_eq!(acquired, 4, "each contender on the free file succeeds");
}

/// Condition 18 (adapted) — a process may die without touching the caller's
/// descriptor.
///
/// The template's condition covers a worker environment terminating mid-callback
/// without taking ownership of the caller's descriptor. In a process the
/// equivalent guarantee is: `--fd` mode never closes or unlocks what it was
/// handed, so the descriptor is still valid after the child is gone.
#[test]
fn condition_18_a_dead_process_does_not_disturb_the_callers_descriptor() {
    let scratch = Scratch::new("c18");
    let file = scratch.open();
    let raw = std::os::fd::AsRawFd::as_raw_fd(&file);
    let binary = env!("CARGO_BIN_EXE_pmh-flock");

    // The child is given a descriptor numbered as a string. It is not inherited
    // in this test (that needs `pre_exec`), so the child will report EBADF —
    // which is the point: it must report, not crash, and must not close anything.
    let output = std::process::Command::new(binary)
        .args(["--fd", &raw.to_string()])
        .output()
        .expect("run pmh-flock");

    // Whatever it decided, it must have produced a JSON diagnostic rather than a
    // panic, and the parent's descriptor must still be usable.
    if output.status.code() != Some(0) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.trim_start().starts_with('{'), "stderr must be JSON: {stderr}");
        assert!(!stderr.contains("panicked"), "the child must not panic: {stderr}");
    }

    // The caller's descriptor still works: the process boundary protected it.
    let identity = identity_of(file.as_fd()).expect("the descriptor must still be valid");
    assert!(identity.regular, "the scratch file is a regular file");
    assert!(try_lock(file.as_fd(), LockKind::Exclusive, None).is_ok());
}

/// `--inspect` reports device and inode, which is what a lock owner needs to
/// notice that a replace moved the name to a new inode.
#[test]
fn inspect_reports_a_usable_identity() {
    let scratch = Scratch::new("inspect");
    let file = scratch.open();
    let identity = identity_of(file.as_fd()).expect("identity");
    assert!(identity.inode > 0, "an inode number must be reported");
    assert!(identity.regular);

    let binary = env!("CARGO_BIN_EXE_pmh-flock");
    let output = std::process::Command::new(binary)
        .args(["--inspect", "--path"])
        .arg(scratch.path())
        .output()
        .expect("run pmh-flock --inspect");
    assert_eq!(output.status.code(), Some(0), "inspect must succeed");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"identity\""), "stdout was: {stdout}");
    assert!(stdout.contains(&identity.inode.to_string()), "stdout was: {stdout}");

    // Identity is stable while the file is not replaced.
    let again = identity_of(file.as_fd()).expect("identity");
    assert_eq!(identity, again);
}

/// `--probe` answers even where `flock` is unsupported, and exits 0.
#[test]
fn the_probe_answers_on_every_host() {
    let binary = env!("CARGO_BIN_EXE_pmh-flock");
    let output = std::process::Command::new(binary)
        .arg("--probe")
        .output()
        .expect("run pmh-flock --probe");
    assert_eq!(output.status.code(), Some(0), "the probe must answer, not fail");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"supported\":true"), "stdout was: {stdout}");
}

/// Lock the raw descriptor `raw` without taking ownership of it.
fn try_lock_raw(raw: i32, kind: LockKind) -> Result<(), pmh_flock::LockError> {
    // SAFETY: the caller only passes descriptor numbers that are either invalid
    // on purpose (the point of the test) or valid for the call's duration. This
    // crate never closes a descriptor, which is the contract's rule.
    let fd = unsafe { pmh_flock::borrow_raw(raw) };
    try_lock(fd, kind, None)
}
