//! `pmh-sandbox` — sandbox enforcement as a service.
//!
//! ```text
//! pmh-sandbox probe
//! pmh-sandbox assess [--file-access <none|read-only|read-write>]
//!                    [--read <path>]... [--write <path>]...
//!                    [--network] [--spawn]
//! ```
//!
//! `probe` reports what this host can enforce. `assess` validates a policy and
//! reports how completely it could be honoured, naming every request that cannot.
//!
//! The policy itself is decided by the TypeScript core; this service only ever
//! reports what it can do with it. See `README.md`.

use pmh_sandbox::{
    assess, capabilities, json_string, Enforcement, FileAccess, SandboxError, SandboxPolicy,
    EXIT_FAILURE, REPORT_VERSION,
};

fn fail(error: &SandboxError) -> ! {
    eprintln!("{}", error.to_json());
    std::process::exit(EXIT_FAILURE);
}

fn usage_error(message: &str) -> ! {
    fail(&SandboxError::new("ERR_SANDBOX_USAGE", message));
}

/// Render a list of names as a JSON array.
fn json_array(items: &[&str]) -> String {
    let rendered: Vec<String> = items.iter().map(|item| json_string(item)).collect();
    format!("[{}]", rendered.join(","))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        usage_error("a command is required: probe | assess");
    };

    match command {
        "probe" => {
            if args.len() != 1 {
                usage_error("probe takes no other arguments");
            }
            let capabilities = capabilities();
            println!(
                "{{\"version\":{REPORT_VERSION},\"operation\":\"probe\",\"mechanism\":{},\"filesystem\":{},\"network\":{},\"spawn\":{},\"note\":{}}}",
                json_string(capabilities.mechanism),
                capabilities.filesystem,
                capabilities.network,
                capabilities.spawn,
                json_string(capabilities.note)
            );
            std::process::exit(0);
        }

        "assess" => {
            let mut policy = SandboxPolicy::default();
            let mut index = 1usize;
            while index < args.len() {
                match args[index].as_str() {
                    "--file-access" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--file-access requires a value");
                        };
                        policy.file_access = FileAccess::parse(value).unwrap_or_else(|error| fail(&error));
                        index += 2;
                    }
                    "--read" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--read requires a path");
                        };
                        policy.read_roots.push(value.clone());
                        index += 2;
                    }
                    "--write" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--write requires a path");
                        };
                        policy.write_roots.push(value.clone());
                        index += 2;
                    }
                    "--network" => {
                        policy.network = true;
                        index += 1;
                    }
                    "--spawn" => {
                        policy.spawn = true;
                        index += 1;
                    }
                    other => usage_error(&format!("unknown argument: {other}")),
                }
            }

            let (verdict, unenforced) = assess(&policy).unwrap_or_else(|error| fail(&error));
            println!(
                "{{\"version\":{REPORT_VERSION},\"operation\":\"assess\",\"verdict\":{},\"enforced\":{},\"unenforced\":{},\"policy\":{{\"file_access\":{},\"read_roots\":{},\"write_roots\":{},\"network\":{},\"spawn\":{}}}}}",
                json_string(verdict.as_str()),
                verdict == Enforcement::Full,
                json_array(&unenforced),
                json_string(policy.file_access.as_str()),
                policy.read_roots.len(),
                policy.write_roots.len(),
                policy.network,
                policy.spawn
            );

            // An unusable verdict is a hard failure: the caller must not start
            // the confined work believing it is confined. A partial verdict is
            // a success with a warning, because the requested protection is in
            // force for everything the mechanism supports.
            match verdict {
                Enforcement::Unusable => {
                    eprintln!(
                        "pmh-sandbox: nothing could be enforced on this host; refusing to report a confined run"
                    );
                    std::process::exit(EXIT_FAILURE);
                }
                Enforcement::Partial => {
                    eprintln!(
                        "pmh-sandbox: partial enforcement — not honoured: {}",
                        unenforced.join(", ")
                    );
                    std::process::exit(0);
                }
                Enforcement::Full => std::process::exit(0),
            }
        }

        other => usage_error(&format!("unknown command: {other}")),
    }
}
