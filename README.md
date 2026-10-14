---
description: "Prometheus Harness — an agent harness built on the DSH core: the core stays the core, everything else is a unit (plugin or skill)."
kind: "project"
---

# Prometheus Harness

English | [Deutsch](README.de.md)

[![PMH CI](https://github.com/LangLi7/prometheus-harness/actions/workflows/pmh-ci.yml/badge.svg)](https://github.com/LangLi7/prometheus-harness/actions/workflows/pmh-ci.yml)

> ### Base core: `deepseek-harness` upstream — **everything else is a unit**.
> A unit is a plugin or a skill. That is not a slogan, it is the build rule: the
> core is **composed**, never rewritten. Whatever we add is a unit that can be
> loaded, replaced, or left out.

## Why this exists

A harness is not one program. It is an agent loop, a model seam, a session store,
an interface, a sandbox, and the rules that hold them together — and most of that
is already written, tested, and maintained upstream. Rewriting it would be the
expensive way to obtain a worse version of it.

So this project takes the opposite route. **The core is the codebase, not a
reference.** We read its interfaces through `node_modules/@deepseek-ai/`, we
compose our own parts into it, and we keep one hard rule: what the core supplies
is **never rewritten, only composed**. Everything we add — authentication, the
knowledge store, the sandbox, the endpoints, the language packs to come — is a
**unit** with a manifest, a declared contract, and its own tests.

That is what makes the project worth existing rather than a fork in the dark:
we can be **judged unit by unit**, and any unit we get wrong can be swapped
instead of regretted.

## What runs today

Every number below is measured, and the command that measured it is named in the
linked document. Nothing here is an estimate.

| | State |
|---|---|
| Type check | **25 packages green, 0 red** |
| Test suite | **1189 pass · 87 skip · 0 fail** across 55 files — on Linux, in CI |
| Own CI | green — [ci-nachweis.md](docs/status/ci-nachweis.md) |
| Install | one command, seven reported steps, secrets generated locally |
| Host start | **~1.1 s** to the first HTTP 200 (measured: 1107–1232 ms) |
| Authentication | first claim creates the administrator; passwords hashed with **Argon2id** (`m=19456, t=2, p=1` — the first OWASP configuration) |
| Storage | PostgreSQL 17 with **pgvector**; migrations to version 7 |
| Knowledge store | documents, chunks and vector index; Obsidian vaults, notes, tags and links — each with a probe |
| Secrets | AES-256-GCM envelopes, one data key per user, behind a switch |
| Real model | answered through the core API (`session/create`, `session/prompt`) — [api-nachweis.md](docs/status/api-nachweis.md) |

**And what is not there yet** is listed just as plainly, including the four claims
this project made earlier that measurement has since disproved:
[grenzen-und-offenes.md](docs/status/grenzen-und-offenes.md).

## Try it

```sh
# Windows — Command Prompt, PowerShell, or double-click the file
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
scripts\install.cmd

# Linux and macOS
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
./scripts/install.sh
```

```sh
bun run start
```

It installs Bun and the base packages, generates `.env` with fresh secrets, starts
PostgreSQL and Redis, waits for their health checks, runs the migrations, and type
checks every package. `bun run start` then serves the interface and prints an
address carrying a launch token — **without that token the interface answers 401**.

Run the installer with `--ohne-stapel` to skip the database; the PostgreSQL checks
then **skip themselves and say so**, rather than passing with nothing to check
against. Why there are three entry scripts, and why a `.ps1` does not load on a
default Windows machine, is in
[installations-einstiege.md](docs/status/installations-einstiege.md).

## Where the detail lives

This file answers *why*. Everything else is a document, and the catalog is
[docs/INDEX.md](docs/INDEX.md) — one sentence per file, 98 of them.

| Question | Document |
|---|---|
| How do I install, and why three entry scripts? | [installations-einstiege.md](docs/status/installations-einstiege.md) |
| What exactly is working — and what is not? | [grenzen-und-offenes.md](docs/status/grenzen-und-offenes.md) |
| Which HTTP surface exists, with real responses? | [api-nachweis.md](docs/status/api-nachweis.md) |
| Is the suite green, and how do I know? | [ci-nachweis.md](docs/status/ci-nachweis.md) |
| How large is it, and what does a start cost? | [groesse-und-ressourcen.md](docs/status/groesse-und-ressourcen.md) |
| How is the knowledge store encrypted? | [schluessel-je-stueck-oder-je-benutzer.md](docs/decisions/schluessel-je-stueck-oder-je-benutzer.md) |
| Every document, one sentence each | [INDEX.md](docs/INDEX.md) |

**Planned, not built:** a web app and a mobile web browser format for the same
interface — one HTTP surface, several shapes. A screenshot of the interface will
appear here once it is worth photographing.

## Licence

The DeepSeek Harness serves as the **codebase**, so its **MIT licence** applies.
The copyright notice is in [LICENSE](LICENSE) — the licence requires it.
