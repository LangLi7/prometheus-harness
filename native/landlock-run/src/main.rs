//! `pmh-landlock-run` — self-restrict-then-exec Landlock launcher.
//!
//! Rust successor to `native/system/packages/entry/src/main.c` of the source
//! template. The **CLI contract is reproduced verbatim** from that template's
//! `native/system/docs/cli-contract.md`; the implementation is new.
//!
//! ```text
//! pmh-landlock-run [--ro <path>]... [--rw <path>]... -- <argv>...
//! pmh-landlock-run --probe
//! ```
//!
//! `--ro` grants read + execute beneath the path; `--rw` grants full filesystem
//! access beneath the path. Everything else is denied — Landlock is an
//! allow-list. `--probe` builds a maximal ruleset and reports whether the
//! running kernel actually enforces it.
//!
//! Fail-closed: if the ruleset cannot be created or is not enforced by the
//! kernel, the launcher exits non-zero **without** exec'ing the command. Partial
//! (best-effort) enforcement on an older ABI is accepted and reported on stderr.
//!
//! There are no environment-variable inputs anywhere in this binary: which
//! binary confines a process must never be decidable by the ambient environment.

use pmh_landlock_run::{report_fatal, report_usage_error, Invocation};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let invocation = match Invocation::parse(args) {
        Ok(invocation) => invocation,
        Err(error) => std::process::exit(report_usage_error(&error)),
    };

    match invocation {
        Invocation::Probe => match pmh_landlock_run::probe() {
            // The probe's report line is written by `probe()`; a partial verdict
            // is a success (the run is still confined for everything the
            // kernel supports) and still exits 0.
            Ok(_) => std::process::exit(0),
            Err(error) => std::process::exit(report_fatal(&error)),
        },
        Invocation::Confine { grants, command } => {
            let enforcement = match pmh_landlock_run::restrict_self(&grants) {
                Ok(enforcement) => enforcement,
                Err(error) => std::process::exit(report_fatal(&error)),
            };
            if enforcement.partial {
                // Older ABI: some handled accesses are not governed (for
                // example truncate before ABI 3). Still confined for everything
                // the kernel supports — report, do not refuse.
                eprintln!("landlock-run: partial enforcement (older Landlock ABI)");
            }
            let error = pmh_landlock_run::exec(&command);
            std::process::exit(report_fatal(&error));
        }
    }
}

/// Keeps the contract's exit code referenced from the binary's own tests.
#[cfg(test)]
mod tests {
    #[test]
    fn fatal_exit_code_matches_the_contract() {
        assert_eq!(pmh_landlock_run::LAUNCHER_FAILURE_EXIT, 125);
    }
}
