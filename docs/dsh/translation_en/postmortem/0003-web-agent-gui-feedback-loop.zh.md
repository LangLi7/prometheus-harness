# Postmortem 0003: web agent accepted a substitute server instead of its current GUI

[English](0003-web-agent-gui-feedback-loop.md) | 中文

Status: resolved

## Summary

The web agent edited GUI source without knowing which URL the current session corresponded to or which process hosted it. It handed acceptance back to the user, then treated the HTTP 200 returned by bare Vite as success even though `window.__DSH_BOOT__` was missing and the page was blank; finally, it validated a substitute `dsh web` server on another port even though the original page had in fact loaded the rebuilt artifact. The fix makes the current URL and run mode visible to the model and queryable from the shell, refuses to start before a standalone Vite begins listening, and validates production-mode refresh and development-mode HMR (hot module replacement) against external state.

## Overview

The session ran in the DeepSeek Harness Web GUI on port 3081, while the Workspace the user selected was an empty `test/` directory. The model's request named neither that GUI nor its source checkout directory, URL, process, or update mode. The repository offers Vite development scripts in `apps/web`, while `dsh web` provides the complete browser composition.

Each resulting action was reasonable on its own, yet none pointed at the same acceptance target. Source edits, a successful build, HTTP 200, an injected boot manifest (metadata manifest), and the page the user already had open were treated as interchangeable facts.

The evidence source is the persisted event log of `session-3eb796c2-5159-4686-affe-df8719f6f987`, whose header records a cwd of `/Users/tn.shen/Documents/deepseek-harness-gui-master/test`. The initial request header is at sequence 6; the user-facing handoff, the bare Vite start, the substitute host start, the boot-manifest probe, and the first probe of the 3081 process are at sequences 30939, 31865, 34309, 34441, and 34681 respectively. The timeline below is grounded in those events rather than reconstructed from later reports.

## Impact

The user had to point out three errors in a row: the agent handed acceptance back to the user; the page it suggested previewing was blank; and the URL it reported as successful was not the page the user was using. An unmanaged substitute server also kept running into the next round, until the user questioned it.

This investigation neither restarted nor modified the read-only trial services on 3081 and 3082.

## Timeline

- In round 2, after editing the theme, the agent told the user in the message at sequence 30939 to run `pnpm run demo:tui` or open an unspecified web application. It performed no acceptance on the assembled web application.
- In round 3, the agent read `apps/web/package.json`, started bare Vite on port 5173 at sequence 31865, observed HTTP 200, and declared success. The browser instead threw `client-modules: window.__DSH_BOOT__ is missing or not an object` and showed a blank page.
- In round 4, the agent found the full `dsh web` startup path, rebuilt the shell, started an unmanaged process on port 3334 at sequence 34309, and checked only at sequence 34441 whether this substitute service returned 200 and a boot manifest. It never probed port 3081.
- In round 5, the user reported at sequence 34556 that 3081 already showed the new theme. Only at sequence 34681 did the agent inspect the existing process and remove the redundant server.

## Root cause

The web composition gave the model no identity information about the current GUI, its canonical URL, or its run mode. The session cwd correctly identified the Workspace the user selected, but the model treated that project directory as the application directory. The system also kept no durable record linking the GUI source checkout directory, the build artifact, the serving process, the target origin, and browser acceptance.

Bare Vite returned HTTP 200, which made the wrong startup path look plausible. `window.__DSH_BOOT__` is injected only by the full host, so transport readiness does not mean application readiness. The first regression test repeated the same mistake in another form: after the timeout mechanism killed Vite, the non-zero-exit assertion still passed. A real reproduction exposed that false positive.

The agent also bypassed background-process semantics with a shell `&`, so task identity, completion notification, result collection, and cleanup all failed to take effect. Validating port 3334 could only prove that the second service worked.

## Guards added

- The web launcher publishes the canonical loopback URL in the logged `app:web-surface` prompt section and in the managed `$DSH_WEB_URL` environment variable.
- The production guide requires rebuilding artifacts and validating the existing URL after a refresh. The development guide states that the HMR receiver is always on; `pnpm run dev:web` in the same source checkout directory rebuilds the client plugin bundles for refresh-free reloading, while changes to the web shell and ordinary packages still require a page refresh.
- The standalone Vite serving mode in `apps/web` refuses to start during configuration. Its subprocess test verifies that the process exits on its own and instruments `Server.listen()`, so even a brief port binding cannot slip through.
- Layered real-path tests cover the CLI (command-line interface) request, the exact production/development-mode prompts, shell runtime facts, static artifact replacement on the same port, source-watcher rebuilds, host stat polling, and browser HMR with an unchanged page identity.
- The PR (Pull Request) evidence retains screenshots of the original 3081 session and a before-and-after comparison of the real model-driven GUI edit; acceptance rests on observations from the external browser, HTTP, processes, and session logs.

## Lessons

- An agent must know hidden runtime preconditions before it can guide the user; the startup mode is part of the application context and must not depend on team folklore.
- HTTP readiness, a successful build, and a boot manifest are different facts. Acceptance must name the exact origin and observe externally whether the requested change took effect at that origin.
- A substitute service cannot prove that the existing page changed. When a request really does ask for a long-running process to be started, use the managed task lifecycle.
- A regression test must be able to fail against the reported mechanism. A process timeout is not the same as a fast failure, and a port being available after the process exits does not prove the port was never bound.
