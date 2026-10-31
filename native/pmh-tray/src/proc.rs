//! Starting, watching and stopping the harness as a child process.
//!
//! The rule of this repository (`native/README.md`): the JS core stays the kernel,
//! every other language is a **service it calls**. The tray is the reverse
//! direction — a native process that calls the core — and it keeps the same
//! boundary: it spawns a process and reads its output. No addon, no ABI question.
//!
//! ## Why a job object on Windows
//!
//! `scripts/start.mjs` spawns the host **and** the Go services; killing only the
//! Bun process would leave them behind, holding ports. A job object with
//! `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` kills the whole tree — and does it even when
//! the tray itself is killed, because the handle closing *is* the kill.
//!
//! **The residual race is named, not hidden:** the child is assigned to the job a
//! few microseconds after it is created. Anything the child spawns before that
//! assignment would escape the job. In practice the first thing it spawns is the
//! world build (`vite build`, ~220 ms measured), so the window is three orders of
//! magnitude smaller than the first child — but it is a window, not zero.

use crate::token::AddressWatcher;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

/// How many output lines are kept for `--status` and the log tail.
const KEEP_LINES: usize = 40;

/// Shared state filled by the output reader thread.
#[derive(Debug, Default)]
struct Feed {
    address: Option<String>,
    lines: Vec<String>,
}

/// A running harness: the child process, its job object and its output.
pub struct Harness {
    child: Child,
    #[cfg(windows)]
    job: Option<Job>,
    feed: Arc<Mutex<Feed>>,
    reader: Option<JoinHandle<()>>,
    log: PathBuf,
}

impl Harness {
    /// Starts `bun <root>/scripts/start.mjs --port <port>`.
    ///
    /// The port is passed as an argument although `start.mjs` also reads
    /// `PMH_PORT`: an argument is what the tray decided, and `start.mjs` itself
    /// documents that an argument beats the environment.
    pub fn start(bun: &Path, paths: &crate::config::Paths, port: u16) -> std::io::Result<Self> {
        let mut command = Command::new(bun);
        command
            .arg(&paths.start_script)
            .arg("--port")
            .arg(port.to_string())
            .current_dir(&paths.root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // No console window may flash when the tray starts the harness: the log has
        // every line the console would have shown.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn()?;

        // Assign before reading: the earlier the child is in the job, the smaller
        // the window in which a grandchild could escape it.
        #[cfg(windows)]
        let job = Job::create().map(|job| {
            job.assign(&child);
            job
        });

        let feed = Arc::new(Mutex::new(Feed::default()));
        let reader = {
            let feed = Arc::clone(&feed);
            let log = paths.log.clone();
            let mut sources: Vec<Box<dyn Read + Send>> = Vec::new();
            if let Some(stdout) = child.stdout.take() {
                sources.push(Box::new(stdout));
            }
            if let Some(stderr) = child.stderr.take() {
                sources.push(Box::new(stderr));
            }
            let handle = std::thread::Builder::new()
                .name("pmh-tray-output".into())
                .spawn(move || pump(sources, feed, log))?;
            handle
        };

        Ok(Self {
            child,
            #[cfg(windows)]
            job,
            feed,
            reader: Some(reader),
            log: paths.log.clone(),
        })
    }

    /// The address the host reported, once it has.
    pub fn address(&self) -> Option<String> {
        locked(&self.feed).address.clone()
    }

    /// Whether the harness process is still alive.
    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// The exit code, if the process already ended.
    pub fn exit_code(&mut self) -> Option<i32> {
        match self.child.try_wait() {
            Ok(Some(status)) => status.code(),
            _ => None,
        }
    }

    /// The process id.
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// The last [`KEEP_LINES`] lines of output.
    pub fn tail(&self) -> Vec<String> {
        locked(&self.feed).lines.clone()
    }

    /// The log file the output is written to.
    pub fn log_path(&self) -> &Path {
        &self.log
    }

    /// Stops the whole process tree.
    ///
    /// On Windows through the job object, so the host and the Go services die with
    /// it. Elsewhere (only to keep `cargo test` green on other platforms) only the
    /// direct child is stopped, and that limitation is real: this program is a
    /// Windows tray.
    pub fn stop(&mut self) {
        #[cfg(windows)]
        if let Some(job) = &self.job {
            job.terminate();
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        // The reader threads end when the pipes close; join so no line is lost.
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        // Dropping the job closes its handle, and closing the handle is the kill
        // signal for `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. Dropping a harness is
        // therefore never a silent orphan factory.
        #[cfg(windows)]
        {
            drop(self.job.take());
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Reads both pipes of the child and feeds the address watcher.
fn pump(sources: Vec<Box<dyn Read + Send>>, feed: Arc<Mutex<Feed>>, log: PathBuf) {
    let mut watcher = AddressWatcher::new();
    let mut log_file = open_log(&log);
    for mut source in sources {
        let mut buffer = [0u8; 2048];
        loop {
            match source.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    // Lossy on purpose: a chunk can end in the middle of a UTF-8
                    // sequence, and the only thing this code must never get wrong is
                    // an ASCII token. A replacement character in a German line of
                    // commentary is a cosmetic cost, refusing the chunk would be a
                    // deadlock.
                    let chunk = String::from_utf8_lossy(&buffer[..count]).to_string();
                    if let Some(file) = log_file.as_mut() {
                        let _ = file.write_all(chunk.as_bytes());
                        let _ = file.flush();
                    }
                    {
                        let mut state = locked(&feed);
                        for line in chunk.lines() {
                            state.lines.push(line.to_string());
                        }
                        if state.lines.len() > KEEP_LINES {
                            let excess = state.lines.len() - KEEP_LINES;
                            state.lines.drain(..excess);
                        }
                    }
                    if let Some(address) = watcher.feed(&chunk) {
                        locked(&feed).address = Some(address);
                    }
                }
                Err(_) => break,
            }
        }
    }
    // No further output: this is the path that rescues an address the host wrote
    // without a trailing newline.
    if let Some(address) = watcher.flush() {
        locked(&feed).address = Some(address);
    }
}

fn open_log(path: &Path) -> Option<std::fs::File> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .ok()
}

/// Locks a shared cell without letting a poisoned lock end the tray.
fn locked<T>(cell: &Arc<Mutex<T>>) -> std::sync::MutexGuard<'_, T> {
    cell.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A Windows job object that kills its members when closed.
///
/// The handle is stored as `isize`, not as a raw pointer: a raw pointer is not
/// `Send`, and the tray keeps this inside one shared cell. The number is the same
/// handle — only the type changed, so the state can cross a thread boundary.
#[cfg(windows)]
struct Job(isize);

#[cfg(windows)]
impl Job {
    /// Creates a job with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
    fn create() -> Option<Self> {
        use std::mem::size_of;
        use windows_sys::Win32::System::JobObjects::{
            CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        // SAFETY: both calls take plain pointers/values; no borrow outlives them.
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return None;
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const core::ffi::c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if set == 0 {
                windows_sys::Win32::Foundation::CloseHandle(handle);
                return None;
            }
            Some(Job(handle as isize))
        }
    }

    /// The win32 handle.
    fn handle(&self) -> windows_sys::Win32::Foundation::HANDLE {
        self.0 as windows_sys::Win32::Foundation::HANDLE
    }

    /// Puts the child process into the job.
    ///
    /// Returns whether the assignment worked. It is deliberately not fatal: a child
    /// that is not in the job still runs, it is only `stop()` that would then miss
    /// the grandchildren. Refusing to start would be a worse answer.
    fn assign(&self, child: &Child) -> bool {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        // SAFETY: the raw handle belongs to `child`, which outlives this call.
        unsafe { AssignProcessToJobObject(self.handle(), child.as_raw_handle() as _) != 0 }
    }

    /// Kills every process in the job.
    fn terminate(&self) {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;
        // SAFETY: the stored handle is live for as long as `self` lives.
        unsafe {
            TerminateJobObject(self.handle(), 1);
        }
    }
}

#[cfg(windows)]
impl Drop for Job {
    fn drop(&mut self) {
        // SAFETY: the stored handle is live and is closed exactly once, here.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.handle());
        }
    }
}
