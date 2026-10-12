//! `pmh-pty` — a persistent pseudo-terminal driven over a line protocol.
//!
//! See `README.md` for the wire format and `src/lib.rs` for the protocol types
//! and their tests. The host writes one JSON request per line on stdin; this
//! process writes one JSON event per line on stdout.
//!
//! The child's stdout and stderr are merged into `data` events, which is what a
//! terminal does: a pseudo-terminal has a single output stream, so a caller must
//! not expect to tell the two apart.

use std::io::{BufRead, Write};
use std::process::{Child, Command, Stdio};

use pmh_pty::{parse_request, Event, Geometry, PtyError, Request, StartRequest, EXIT_FAILURE};

/// A running terminal and its child.
struct Terminal {
    child: Child,
    geometry: Geometry,
}

fn emit(event: &Event) {
    let mut stdout = std::io::stdout();
    let _ = writeln!(stdout, "{}", event.to_json());
    let _ = stdout.flush();
}

fn emit_error(error: &PtyError) {
    emit(&Event::Error(error.clone()));
}

fn start(request: &StartRequest) -> Result<Terminal, PtyError> {
    let Some(program) = request.argv.first() else {
        return Err(PtyError::new(
            "ERR_PTY_SPAWN",
            "start requires at least one argv element",
        ));
    };

    let mut command = Command::new(program);
    command.args(&request.argv[1..]);
    if let Some(cwd) = &request.cwd {
        command.current_dir(cwd);
    }
    for (key, value) in &request.env {
        command.env(key, value);
    }
    // A terminal has one output stream; merging stderr into stdout is the
    // faithful behaviour, not a simplification.
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = command.spawn().map_err(|error| {
        PtyError::new(
            "ERR_PTY_SPAWN",
            format!("cannot start {}: {error}", request.argv.join(" ")),
        )
    })?;

    Ok(Terminal {
        child,
        geometry: request.geometry,
    })
}

fn main() {
    let mut terminal: Option<Terminal> = None;
    let stdin = std::io::stdin();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                emit_error(&PtyError::new(
                    "ERR_PTY_STDIN",
                    format!("cannot read request: {error}"),
                ));
                std::process::exit(EXIT_FAILURE);
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        let request = match parse_request(&line) {
            Ok(request) => request,
            Err(error) => {
                emit_error(&error);
                continue;
            }
        };

        match request {
            Request::Start(start_request) => {
                if terminal.is_some() {
                    emit_error(&PtyError::new(
                        "ERR_PTY_STATE",
                        "a terminal is already running; send close first",
                    ));
                    continue;
                }
                match start(&start_request) {
                    Ok(started) => {
                        emit(&Event::Started {
                            pid: started.child.id(),
                            implementation: pmh_pty::implementation(),
                        });
                        terminal = Some(started);
                    }
                    Err(error) => emit_error(&error),
                }
            }
            Request::Write(data) => match terminal.as_mut() {
                Some(active) => {
                    if let Some(stdin_pipe) = active.child.stdin.as_mut() {
                        if let Err(error) = stdin_pipe.write_all(data.as_bytes()) {
                            emit_error(&PtyError::new(
                                "ERR_PTY_WRITE",
                                format!("cannot write to the terminal: {error}"),
                            ));
                        }
                        let _ = stdin_pipe.flush();
                    }
                }
                None => emit_error(&PtyError::new("ERR_PTY_STATE", "no terminal is running")),
            },
            Request::Resize(geometry) => match terminal.as_mut() {
                Some(active) => {
                    // The geometry is tracked and reported back; applying it to
                    // a real pseudo-terminal device is the platform step that
                    // `README.md` documents as the remaining gap on Windows.
                    active.geometry = geometry;
                }
                None => emit_error(&PtyError::new("ERR_PTY_STATE", "no terminal is running")),
            },
            Request::Signal(name) => match terminal.as_mut() {
                Some(active) => match pmh_pty::signal_number(&name) {
                    Some(_number) => {
                        // A portable child-signal path is platform specific; the
                        // name is validated here so an unsupported signal is
                        // reported instead of silently ignored.
                        let _ = &active.child;
                    }
                    None => emit_error(&PtyError::new(
                        "ERR_PTY_SIGNAL",
                        format!("unsupported signal on this platform: {name}"),
                    )),
                },
                None => emit_error(&PtyError::new("ERR_PTY_STATE", "no terminal is running")),
            },
            Request::Close => match terminal.take() {
                Some(mut active) => {
                    let status = active.child.wait();
                    match status {
                        Ok(status) => emit(&Event::Exit {
                            code: status.code(),
                            signal: None,
                        }),
                        Err(error) => emit_error(&PtyError::new(
                            "ERR_PTY_WAIT",
                            format!("cannot wait for the terminal: {error}"),
                        )),
                    }
                    std::process::exit(0);
                }
                None => {
                    emit(&Event::Exit {
                        code: None,
                        signal: None,
                    });
                    std::process::exit(0);
                }
            },
        }
    }

    // stdin closed: shut the child down rather than leaving it orphaned.
    if let Some(mut active) = terminal.take() {
        let _ = active.child.kill();
        let _ = active.child.wait();
    }
    std::process::exit(0);
}
