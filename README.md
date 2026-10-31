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

<a id="summary"></a>
## Summary

One line on Windows. It fetches the repository itself and installs:

```powershell
irm https://raw.githubusercontent.com/LangLi7/prometheus-harness/main/scripts/install.ps1 | iex
```

On Linux and macOS, clone the repository and run `./scripts/install.sh`. The
installer installs Bun and the base packages, generates `.env` with fresh secrets,
starts PostgreSQL 17 and Redis 7 (installing Docker first when it is missing on
Linux), waits for their health checks, runs the migrations, and type-checks every
package. Then `bun run start` serves the interface and prints an address carrying a
token; the interface answers **401** without it. Measured: `bun run typecheck`
reports **23 packages green, 0 red**, and `bun test packages scripts apps` reports
**1189 pass · 87 skip · 0 fail** across 55 files on Linux.

<a id="table-of-contents"></a>
## Table of Contents

- [Summary](#summary)
- [Why this exists](#why-this-exists)
- [What runs today](#what-runs-today)
- [Quickstart](#try-it)
- [Where the detail lives](#where-the-detail-lives)
- [Known Limitations](#known-limitations)
- [Licence](#licence)

<a id="why-this-exists"></a>
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

That is what makes the project worth existing rather than a fork in the dark: we
can be **judged unit by unit**, and any unit we get wrong can be swapped instead
of regretted.

<a id="what-runs-today"></a>
## What runs today

Every number below is measured, and the command that measured it is named.
Nothing here is an estimate.

| | State | Measured by |
|---|---|---|
| Type check | **23 packages green, 0 red** | `bun run typecheck` |
| Test suite | **1189 pass · 87 skip · 0 fail** across 55 files (Linux, CI) | `bun test packages scripts apps` |
| Own CI | green | [ci-nachweis.md](docs/status/ci-nachweis.md) |
| Install | one line (Windows) / one command (Linux) | `irm … install.ps1 \| iex` / `./scripts/install.sh` |
| Host start | **~1.1 s** to the first HTTP 200 (1107–1232 ms) | `bun run start` |
| Authentication | first claim creates the administrator; **Argon2id** `m=19456, t=2, p=1` | `bun test packages scripts apps` |
| Storage | PostgreSQL 17 with **pgvector**; migrations to version 7 | `bun scripts/migrate.mjs` |
| Knowledge store | documents, chunks, vector index; Obsidian vaults, notes, tags, links | `bun test packages scripts apps` |
| Secrets | AES-256-GCM envelopes, one data key per user, behind a switch | [envelope-cost.mjs](docs/status/messsonden/envelope-cost.mjs) |
| Real model | answered through the core API (`session/create`, `session/prompt`) | [api-nachweis.md](docs/status/api-nachweis.md) |

<a id="try-it"></a>
## Quickstart

```sh
# Windows: PowerShell, one line. No clone first, and no change to the
# execution policy. `iex` loads no file, so `Restricted` does not apply.
irm https://raw.githubusercontent.com/LangLi7/prometheus-harness/main/scripts/install.ps1 | iex

# Windows: fallback if you already cloned (also works from cmd.exe)
scripts\install.cmd

# Linux and macOS
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
./scripts/install.sh
```

```sh
# Start with Bun (after the Windows one-liner: cd prometheus-harness)
cd prometheus-harness
$env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
bun run start
```

Open **that** address — not a fixed one. The interface answers **401** without the
token it prints. The first visit asks for a **claim**, and the first account it
creates is the **administrator**; further accounts are created by an admin, as in a
fresh n8n instance.

Two switches matter. `--ohne-stapel` skips the database: the PostgreSQL checks then
**skip themselves and say so**, instead of passing with nothing to check against.
`bun run start --help` lists every flag and environment variable, and an unknown
flag is **rejected** rather than silently ignored.

**For a deployment**, the database addresses come from `.env` — the installer
writes them — and the port from `PMH_PORT` or `--port`. Two things are deliberately
different from a one-line installer: there is **no built-in fallback database**
(PostgreSQL 17 is required), and **Docker is not installed for you** (on Windows it
is Docker Desktop, a program with its own licence; on Linux the official script
needs root). Why there are three entry scripts, and why a `.ps1` does not load on a
default Windows machine, is in
[installations-einstiege.md](docs/status/installations-einstiege.md).

<a id="where-the-detail-lives"></a>
## Where the detail lives

This file answers *why*. Everything else is a document, and the catalog is
[docs/INDEX.md](docs/INDEX.md) — one sentence per file.

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

<a id="known-limitations"></a>
## Known Limitations

Named, measured, and not talked up. The full list, including eight earlier claims
of this project that measurement has since disproved, is in
[grenzen-und-offenes.md](docs/status/grenzen-und-offenes.md).

- **The interface is a shell** — 8 files under `apps/web/src`, and neither a chat
  nor a file tree. (Counted 14.10.2026; this line said *5* before.)
- **Sessions persist to JSONL**, not to PostgreSQL.
- **Compaction runs on demand; automatic compaction is unproven** — `/compact`
  executes and writes linked `compaction/start|summary|end` events carrying a real
  summary ([verdichtung-nachweis.md](docs/status/verdichtung-nachweis.md)). What no
  measurement shows is whether it also fires **by itself** under context pressure.
  Until 14.10.2026 this line claimed *"Compaction is absent"*; measurement disproved
  that ([plugin-inventur.md](docs/status/plugin-inventur.md)).
- **The knowledge store has no indexer** — schema and probes exist, embeddings and
  a file watcher do not.
- **Database checks run against the operational database** and ten of them fail.
- **The secret hook checks nothing** — `gitleaks` is not installed.

<a id="licence"></a>
## Licence

The DeepSeek Harness serves as the **codebase**, so its **MIT licence** applies.
The copyright notice is in [LICENSE](LICENSE) — the licence requires it.
