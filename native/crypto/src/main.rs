//! `pmh-crypto` — cryptographic primitives as a process.
//!
//! ```text
//! pmh-crypto sha256  [--file <path> | --text <value> | --stdin] [--raw]
//! pmh-crypto hmac    --key <value|@file> [--file <path> | --text <value> | --stdin]
//! pmh-crypto compare --a <hex|@file> --b <hex|@file>
//! pmh-crypto random  [--bytes <n>]
//! pmh-crypto probe
//! ```
//!
//! Digests print lowercase hex on stdout, one line, with no decoration, so the
//! output can be compared or piped directly. `--raw` writes the raw digest bytes
//! instead, for a caller that needs them binary.
//!
//! Every failure prints one JSON object on stderr and exits [`EXIT_FAILURE`].

use std::io::Read;

use pmh_crypto::{
    constant_time_eq, from_hex, hmac_sha256, random_hex, sha256, to_hex, CryptoError, EXIT_FAILURE,
    REPORT_VERSION,
};

fn fail(error: &CryptoError) -> ! {
    eprintln!("{}", error.to_json());
    std::process::exit(EXIT_FAILURE);
}

fn usage_error(message: &str) -> ! {
    fail(&CryptoError::new("ERR_CRYPTO_USAGE", message));
}

/// Where the input bytes come from.
enum Input {
    Text(String),
    File(String),
    Stdin,
}

/// Read the input described by the common `--text` / `--file` / `--stdin`
/// options out of an argument list, returning it and leaving the rest alone.
fn take_input(args: &[String], start: usize) -> (Option<Input>, Vec<String>) {
    let mut input: Option<Input> = None;
    let mut rest: Vec<String> = Vec::new();
    let mut index = start;
    while index < args.len() {
        match args[index].as_str() {
            "--text" => {
                let Some(value) = args.get(index + 1) else {
                    usage_error("--text requires a value");
                };
                input = Some(Input::Text(value.clone()));
                index += 2;
            }
            "--file" => {
                let Some(value) = args.get(index + 1) else {
                    usage_error("--file requires a path");
                };
                input = Some(Input::File(value.clone()));
                index += 2;
            }
            "--stdin" => {
                input = Some(Input::Stdin);
                index += 1;
            }
            other => {
                rest.push(other.to_string());
                index += 1;
            }
        }
    }
    (input, rest)
}

fn read_input(input: &Input) -> Vec<u8> {
    match input {
        Input::Text(value) => value.as_bytes().to_vec(),
        Input::File(path) => std::fs::read(path).unwrap_or_else(|error| {
            fail(&CryptoError::new(
                "ERR_CRYPTO_READ",
                format!("cannot read {path}: {error}"),
            ))
        }),
        Input::Stdin => {
            let mut buffer = Vec::new();
            std::io::stdin()
                .read_to_end(&mut buffer)
                .unwrap_or_else(|error| {
                    fail(&CryptoError::new(
                        "ERR_CRYPTO_READ",
                        format!("cannot read standard input: {error}"),
                    ))
                });
            buffer
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = args.first().map(String::as_str) else {
        usage_error("a command is required: sha256 | hmac | compare | random | probe");
    };

    match command {
        "probe" => {
            if args.len() != 1 {
                usage_error("probe takes no other arguments");
            }
            let random_ok = random_hex(1).is_ok();
            println!(
                "{{\"version\":{REPORT_VERSION},\"operation\":\"probe\",\"sha256\":true,\"hmac_sha256\":true,\"constant_time_compare\":true,\"random\":{random_ok},\"aead\":false,\"kdf\":false}}"
            );
            std::process::exit(0);
        }

        "sha256" => {
            let raw = args.iter().any(|arg| arg == "--raw");
            let (input, _rest) = take_input(&args, 1);
            let Some(input) = input else {
                usage_error("sha256 needs --text, --file or --stdin");
            };
            let digest = sha256(&read_input(&input));
            if raw {
                use std::io::Write;
                let _ = std::io::stdout().write_all(&digest);
                let _ = std::io::stdout().flush();
            } else {
                println!("{}", to_hex(&digest));
            }
            std::process::exit(0);
        }

        "hmac" => {
            let raw = args.iter().any(|arg| arg == "--raw");
            let mut key: Option<String> = None;
            let mut index = 1usize;
            // Pull the key out first so `take_input` sees only input options.
            let mut remaining: Vec<String> = Vec::new();
            while index < args.len() {
                if args[index] == "--key" {
                    let Some(value) = args.get(index + 1) else {
                        usage_error("--key requires a value");
                    };
                    key = Some(value.clone());
                    index += 2;
                } else {
                    remaining.push(args[index].clone());
                    index += 1;
                }
            }
            let Some(key) = key else {
                usage_error("hmac requires --key <value|@file>");
            };
            let key_bytes = if let Some(path) = key.strip_prefix('@') {
                std::fs::read(path).unwrap_or_else(|error| {
                    fail(&CryptoError::new(
                        "ERR_CRYPTO_READ",
                        format!("cannot read key file {path}: {error}"),
                    ))
                })
            } else {
                key.into_bytes()
            };
            let (input, _rest) = take_input(&remaining, 0);
            let Some(input) = input else {
                usage_error("hmac needs --text, --file or --stdin");
            };
            let digest = hmac_sha256(&key_bytes, &read_input(&input));
            if raw {
                use std::io::Write;
                let _ = std::io::stdout().write_all(&digest);
                let _ = std::io::stdout().flush();
            } else {
                println!("{}", to_hex(&digest));
            }
            std::process::exit(0);
        }

        "compare" => {
            let (input, rest) = take_input(&args, 1);
            let _ = input;
            // `compare` takes hex (or @file) operands rather than plain input.
            let mut a: Option<String> = None;
            let mut b: Option<String> = None;
            let mut index = 0usize;
            while index < rest.len() {
                match rest[index].as_str() {
                    "--a" => {
                        a = rest.get(index + 1).cloned();
                        index += 2;
                    }
                    "--b" => {
                        b = rest.get(index + 1).cloned();
                        index += 2;
                    }
                    _ => index += 1,
                }
            }
            let (Some(a), Some(b)) = (a, b) else {
                usage_error("compare requires --a and --b");
            };
            let left = decode_operand(&a);
            let right = decode_operand(&b);
            let equal = constant_time_eq(&left, &right);
            println!(
                "{{\"version\":{REPORT_VERSION},\"operation\":\"compare\",\"equal\":{equal},\"left_bytes\":{},\"right_bytes\":{}}}",
                left.len(),
                right.len()
            );
            // A mismatch is a legitimate answer, not a failure — but the exit
            // code distinguishes it so the command can be used in a shell test.
            std::process::exit(if equal { 0 } else { 1 });
        }

        "random" => {
            let mut bytes = 32usize;
            let mut index = 1usize;
            while index < args.len() {
                match args[index].as_str() {
                    "--bytes" => {
                        let Some(value) = args.get(index + 1) else {
                            usage_error("--bytes requires a value");
                        };
                        match value.parse::<usize>() {
                            Ok(value) => bytes = value,
                            Err(_) => usage_error("--bytes must be a positive integer"),
                        }
                        index += 2;
                    }
                    other => usage_error(&format!("unknown argument: {other}")),
                }
            }
            match random_hex(bytes) {
                Ok(token) => {
                    println!("{token}");
                    std::process::exit(0);
                }
                Err(error) => fail(&error),
            }
        }

        other => usage_error(&format!("unknown command: {other}")),
    }
}

/// A `compare` operand: raw hex, or `@file` whose bytes are compared directly.
fn decode_operand(operand: &str) -> Vec<u8> {
    if let Some(path) = operand.strip_prefix('@') {
        return std::fs::read(path).unwrap_or_else(|error| {
            fail(&CryptoError::new(
                "ERR_CRYPTO_READ",
                format!("cannot read {path}: {error}"),
            ))
        });
    }
    from_hex(operand).unwrap_or_else(|_| {
        // Not hex: treat it as literal text so a caller can compare plain
        // strings without encoding them first.
        operand.as_bytes().to_vec()
    })
}
