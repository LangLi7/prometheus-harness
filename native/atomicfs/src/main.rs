//! `pmh-atomicfs` — durable atomic file operations as a process.
//!
//! ```text
//! pmh-atomicfs write  <path> [--from <file>] [--stdin] [--json]
//! pmh-atomicfs read   <path>
//! pmh-atomicfs identity <path>
//! pmh-atomicfs cleanup  <path>
//! pmh-atomicfs probe
//! ```
//!
//! `write` reads the new content from `--from <file>` or, with `--stdin`, from
//! standard input, writes it atomically and durably, and prints one line of
//! JSON on stdout. `read` writes the file's bytes to stdout unchanged so it can
//! be piped. `identity` prints the file's device/inode (or Windows volume/file
//! index) as JSON. `cleanup` removes a stale temporary file.
//!
//! Every failure prints one JSON object on stderr and exits
//! [`EXIT_FAILURE`].

use std::io::{Read, Write};
use std::path::PathBuf;

use pmh_atomicfs::{
    cleanup_temporary, identity_of, read_with_identity, write_atomic, AtomicError, EXIT_FAILURE,
};

fn fail(error: &AtomicError) -> ! {
    eprintln!("{}", error.to_json());
    std::process::exit(EXIT_FAILURE);
}

fn usage_error(message: &str) -> ! {
    fail(&AtomicError::new("ERR_ATOMIC_USAGE", message));
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        usage_error("a command is required: write | read | identity | cleanup | probe");
    };

    match command {
        "probe" => {
            if args.len() != 1 {
                usage_error("probe takes no other arguments");
            }
            // Report the capabilities this build actually has, so a caller can
            // decide whether it needs a fallback instead of guessing.
            println!(
                "{{\"version\":1,\"operation\":\"probe\",\"platform\":\"{}-{}\",\"write_through\":{},\"directory_sync\":{},\"identity\":true}}",
                std::env::consts::OS,
                std::env::consts::ARCH,
                cfg!(windows),
                cfg!(unix)
            );
            std::process::exit(0);
        }
        "write" => {
            let mut path: Option<PathBuf> = None;
            let mut from: Option<PathBuf> = None;
            let mut stdin = false;
            let mut index = 1usize;
            while index < args.len() {
                match args[index].as_str() {
                    "--from" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--from requires a file path");
                        };
                        from = Some(PathBuf::from(value));
                        index += 2;
                    }
                    "--stdin" => {
                        stdin = true;
                        index += 1;
                    }
                    "--json" => {
                        // The report is always JSON; the flag is accepted so a
                        // caller can state its expectation explicitly.
                        index += 1;
                    }
                    other if path.is_none() && !other.starts_with("--") => {
                        path = Some(PathBuf::from(other));
                        index += 1;
                    }
                    other => usage_error(&format!("unknown argument: {other}")),
                }
            }
            let Some(path) = path else {
                usage_error("write requires a target path");
            };
            if from.is_some() && stdin {
                usage_error("--from and --stdin are mutually exclusive");
            }
            let contents = match (from, stdin) {
                (Some(file), false) => std::fs::read(&file).unwrap_or_else(|error| {
                    fail(&AtomicError::from_io(
                        "ERR_ATOMIC_READ",
                        &format!("cannot read {}", file.display()),
                        &error,
                    ))
                }),
                (None, true) => {
                    let mut buffer = Vec::new();
                    std::io::stdin()
                        .read_to_end(&mut buffer)
                        .unwrap_or_else(|error| {
                            fail(&AtomicError::from_io(
                                "ERR_ATOMIC_READ",
                                "cannot read standard input",
                                &error,
                            ))
                        });
                    buffer
                }
                (None, false) => usage_error("write needs --from <file> or --stdin"),
                (Some(_), true) => unreachable!("rejected above"),
            };
            match write_atomic(&path, &contents) {
                Ok(report) => {
                    println!("{}", report.to_json());
                    std::process::exit(0);
                }
                Err(error) => fail(&error),
            }
        }
        "read" => {
            let Some(path) = args.get(1) else {
                usage_error("read requires a path");
            };
            match read_with_identity(&PathBuf::from(path)) {
                Ok((bytes, _identity)) => {
                    // Raw bytes on stdout so the output can be piped unchanged.
                    let _ = std::io::stdout().write_all(&bytes);
                    let _ = std::io::stdout().flush();
                    std::process::exit(0);
                }
                Err(error) => fail(&error),
            }
        }
        "identity" => {
            let Some(path) = args.get(1) else {
                usage_error("identity requires a path");
            };
            match identity_of(&PathBuf::from(path)) {
                Ok(identity) => {
                    println!(
                        "{{\"version\":1,\"operation\":\"identity\",\"path\":{},\"identity\":{}}}",
                        pmh_atomicfs::json_string(path),
                        identity.to_json()
                    );
                    std::process::exit(0);
                }
                Err(error) => fail(&error),
            }
        }
        "cleanup" => {
            let Some(path) = args.get(1) else {
                usage_error("cleanup requires a path");
            };
            match cleanup_temporary(&PathBuf::from(path)) {
                Ok(removed) => {
                    println!(
                        "{{\"version\":1,\"operation\":\"cleanup\",\"path\":{},\"removed\":{removed}}}",
                        pmh_atomicfs::json_string(path)
                    );
                    std::process::exit(0);
                }
                Err(error) => fail(&error),
            }
        }
        other => usage_error(&format!("unknown command: {other}")),
    }
}
