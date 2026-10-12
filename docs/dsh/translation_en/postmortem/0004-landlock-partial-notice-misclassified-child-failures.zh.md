# Postmortem 0004: Landlock partial-enforcement notice misclassified child-process failures

[English](0004-landlock-partial-notice-misclassified-child-failures.md) | 中文

Status: resolved

## Summary

On kernels with an older Landlock ABI, the launcher prints a harmless partial-enforcement notice before executing every child process. The harness combined the shared `landlock-run:` prefix with any non-zero child exit and judged it a launcher failure, so ordinary results such as ripgrep exiting 1 on no matches surfaced as `SANDBOX_UNAVAILABLE`; the bash-backed filesystem search of the time then masked that structured error with `SEARCH_FAILED`. An over-broad signature rule and the absence of composed test coverage for partial enforcement on older ABIs let the defect through. Runner classification now excludes informational lines precisely first and then requires fatal evidence gated by exit status, and an assembled key-free scenario pins the bash path that still exists. Filesystem search runs bundled ripgrep through the subprocess seam, outside sandboxed bash.

## Overview

The native launcher convention distinguishes two kinds of stderr line. When the kernel can enforce only partially, it prints exactly `landlock-run: partial enforcement (older Landlock ABI)` and then continues executing the child. A launcher failure prints a different `landlock-run:` diagnostic and exits 125 without executing the child.

The harness represented both cases with a case-insensitive `landlock-run: ` substring. Any consumer that saw a non-zero exit carrying that substring classified it as a runner failure. The child's exit status was therefore tied to the launcher's informational line by mistake: `false`, ripgrep's exit code 1 on no match, exit code 2 for an invalid pattern, and even exit code 125 chosen by the child itself could all be misattributed to a sandbox fault while constraint and execution had both succeeded.

At the time of the incident, filesystem search caused a second misattribution. The then bash-backed `runRipgrep()` caught every error the bash executor threw except aborts and replaced it with a generic `SEARCH_FAILED` about the cwd or shell startup — including the structured `SandboxUnavailableError` produced by the sandbox executor.

## Impact

On hosts where the Landlock ABI enforces only partially, legitimate non-zero child results could present as sandbox infrastructure failures. `glob` and `grep` were especially exposed, because ripgrep uses exit code 1 for a successful empty search. When a sandbox fault really did occur during a filesystem search, the caller also lost its `SANDBOX_UNAVAILABLE` error code and received a wrong startup diagnostic instead.

The defect weakened no constraint and never ran a command unconstrained. Its security effect is on availability and diagnostic integrity: valid constrained results were rejected or mislabeled.

## Timeline

- The native launcher convention specifies that launcher failures use exit code 125, that every such failure prints one fatal `landlock-run:` diagnostic line, and that a successful child execution prints the exact partial-enforcement notice.
- The sandbox provider reduced that convention to `runnerFailureSignatures: ['landlock-run: ']`; the bash consumer combined that prefix with any non-zero exit and reported the first line of stderr.
- Unit tests covered success without diagnostics, a refusal diagnostic, and the fatal runner prefix. The real runner test skips itself when no kernel support is available, and nothing forced the case of a partial-enforcement notice followed by a non-zero child exit.
- A minimal POSIX wrapper script printed the notice and `exec`'d its payload; it reproduced the failure through `false` and through a ripgrep no-match scenario.
- Structured rules, classification logic shared between foreground and background, and assembled replay coverage together closed the remaining sandbox misattribution gap. Filesystem search runs bundled ripgrep through `ctx.subprocess`; this fix keeps that path outside sandboxed bash.

## Root cause

The public sandbox result type could express only a set of substrings. It could not express that a Landlock failure must use exit code 125, that evidence must appear within a single fatal diagnostic line, or that one exact line under the same prefix is an informational notice. The consumer's boolean decision logic therefore combined unrelated facts from different processes; and even when the fatal evidence was on a later line, it still chose the first line of stderr as the detail.

The test matrix matched that representation. The simulated providers either emitted no runner line or emitted an unambiguously fatal prefix, never a harmless runner line before a child-controlled non-zero exit. Real Landlock coverage depends on the host ABI, so a host with full ABI cannot cover the notice. In the search implementation of the time, the filesystem search tests simulated raw spawn errors but never covered the structured error thrown by the real sandboxed bash composition.

stderr remains an in-band attribution channel. A constrained child can deliberately reproduce the runner's gated fatal diagnostic line and exit status, causing availability or diagnostic misattribution. A stricter conjunction of several pieces of evidence avoids the accidental collision in this incident but cannot verify the writer's identity; an out-of-band status protocol remains separate hardening work, not a sandbox-bypass fix.

## Guards added

- [`RunnerFailureRule`](../subsystems/sandbox.zh.md#wrapped-argv-and-classification-dialects) carries an optional allowed exit code, case-insensitive per-line fatal signatures, and informational lines excluded by case-insensitive exact whole-line matching.
- [`dsh-sandbox-local`](../../packages/sandbox/sandbox-local/) maps Landlock to exit code 125 plus one non-notice `landlock-run:` diagnostic, while bwrap, Seatbelt, and custom runners still rely on signatures alone.
- [`dsh-bash-sandbox`](../../packages/shell/bash-sandbox/) spawns the provider argv directly, so a refusal before launch uses the spawn error channel instead of a localized shell diagnostic. Settled foreground and background executions share one classifier that returns evidence; fatal evidence takes precedence over refusal, and foreground errors report the matched fatal line while leaving the captured stderr unchanged.
- [`dsh-tool-fs-search`](../../packages/fs/tool-fs-search/) runs bundled ripgrep through `ctx.subprocess` and stays outside the sandboxed bash seam.
- Native-boundary regression cases live in [`partial-landlock.spec.ts`](../../packages/shell/bash-sandbox/tests/partial-landlock.spec.ts), covering the informational notice, fatal evidence, and foreground/background classification.
- The assembled product path is pinned by the [`partial-landlock` snapshot composition](../../snapshots/session/partial-landlock-child-failure/cordis.snapshot.yml), independent of the filesystem search implementation choice.

## Lessons

- Process attribution needs several independent pieces of evidence to hold at once; a shared prefix is not a protocol.
- Informational and fatal diagnostics may share one namespace, so exclusion rules must be exact and narrowly scoped while staying fail-closed on unknown fatal lines.
- An adapter must preserve the structured failure owned by the seam below it rather than replacing it with its own nearest generic category.
- Platform-dependent behavior needs deterministic simulations at the native boundary plus coverage of one assembled product path; a real-kernel test that skips itself cannot pin that regression on its own.
