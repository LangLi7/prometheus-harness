---
description: "Prometheus Harness — an agent harness on Bun with Cordis units, a pluggable LLM seam, and own HTTP endpoints, built on the DeepSeek Harness core."
kind: "project"
---

# Prometheus Harness

English | [Deutsch](README.de.md)

A self-hosted agent harness being built on top of the DeepSeek Harness core. The
core is **used and adapted** — it is the codebase, not just a reference. What we
add lives in `packages/`, `services/`, and `native/`; what the core supplies is
never rewritten, only composed.

## Summary

Clone the repository and run one command — `scripts\install.cmd` on Windows,
`./scripts/install.sh` on Linux and macOS. It installs Bun and the base packages
it needs, generates `.env` with fresh secrets (adopting the running container's
passwords when a stack already exists), starts PostgreSQL 17 and Redis 7, waits
for their health checks, runs the database migrations, and type-checks every
package. `bun run start` then serves the Web GUI and prints an authenticated URL;
that URL carries a launch token and the interface answers **401** without it.
Sixteen packages make up our own code — a provider-agnostic LLM seam with a
DeepSeek adapter, retry and token accounting, an agent loop with a tool registry,
a session format with JSONL persistence, authentication primitives, and the first
own HTTP endpoints. **826 tests pass and 18 packages type-check clean.** The
smallest chain — adapter → agent loop → session — is built and measured, but not
yet reachable through any interface; that is the next step, and the sections
below state exactly where that boundary sits.

## Table of Contents

- [Use this project](#use-this-project)
- [Architecture](#architecture)
- [Endpoints](#endpoints)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-project"></a>
## Use this project

### Installing

**Windows** — from Command Prompt, PowerShell, or by double-clicking the file:

```bat
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
scripts\install.cmd
```

**Linux and macOS:**

```sh
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
./scripts/install.sh
```

The installer reports seven steps and ends with the command to start. Run it
without a database by adding `--ohne-stapel`; the fourteen PostgreSQL checks are
then **skipped and say so**, rather than passing without a database to check
against.

You know it worked when `bun run start` prints an address with a token and that
address loads the interface in a browser. Two failures are worth recognising: a
password mismatch between `.env` and a **running** PostgreSQL container, which the
installer names together with both ways out; and a missing or unreachable Docker
daemon, which the installer reports with the platform-specific command that fixes
it.

### Why there are three entry scripts

| File | For | Requires |
|---|---|---|
| `scripts/install.cmd` | Windows, always | nothing |
| `scripts/install.ps1` | Windows, from PowerShell | execution policy allows scripts |
| `scripts/install.sh` | Linux, macOS | `sh` |

The execution policy on a default Windows machine is `Restricted`, so a `.ps1`
**does not load**:

```
& : Die Datei …\install.ps1 kann nicht geladen werden, weil das Ausführen
    von Skripten auf diesem System deaktiviert ist.
```

A `.cmd` file is not affected by that policy, so it is the entry the instructions
name. It calls `install.ps1` with `-ExecutionPolicy Bypass` for that one
invocation and changes nothing about the machine.

The logic itself is **one** file, `scripts/install.mjs`, written for Bun. A shell
implementation would have no interpreter on the target machines: `sh` is absent
on Windows, `bash` arrives only through WSL and cannot read `C:\` paths, and
`unzip` is missing. On a fresh Alpine container even `bash` is absent.

### What the installer does not install

Docker. On Windows the supported path is Docker Desktop — a program with its own
licence — and on Linux the official script needs root. The installer prints the
command for the platform and stops visibly instead of deciding on your behalf.

### Starting

```sh
bun run start
```

The port defaults to **3080**, the same port the reference harness uses. When it
is taken, the launcher binds the next free port and says which one; `--strict-port`
makes it stop instead, `--port <n>` moves the starting point, and `PMH_PORT` sets
it from the environment.

### The address carries a token

The interface answers **401** without a token, so the startup prints the usable
address, token included:

```
[pmh] Anmeldung nötig — diese Adresse öffnen (enthält den Token):
[pmh]   http://127.0.0.1:3081/?token=TWyrTSWfD3BBmIGzLgc5Hjm2klR5eSFqaw1D0wzdhz8
```

| Request | Response |
|---|---|
| with the token from the output | **200**, 35,664 bytes |
| without a token | **401** |
| with a wrong 43-character token | **401** |

The address **is** the credential. Treat a copied URL the way you would treat a
password; the launcher writes it to the console only — never to a file,
never into the environment.

### Database addresses

The application reads `DATABASE_URL` and `REDIS_URL` from the environment, and
the migration runner reads `MIGRATION_DATABASE_URL`. All three are written to
`.env` by the installer; loading them is the shell's job:

```sh
# Linux
set -a; . ./.env; set +a; bun run start
```

```powershell
# Windows
Get-Content .env | ForEach-Object { if ($_ -match "^(\w+)=([^\r\n]*)") { Set-Item "env:$($matches[1])" $matches[2] } }
bun run start
```

The three addresses are deliberately different roles: `pmh_app` reads and writes
data, `pmh_owner` may alter structure and is used only by migrations, and neither
is the superuser.

### Checking

```sh
bun run typecheck                 # 18 packages, ~2 s, nothing is written
bun test packages scripts apps    # 826 tests, 27 files
```

Bun runs TypeScript directly, so there is no build step. `bun run build` is an
alias for the type check, matching the step a familiar workflow expects at that
point.

Fourteen of those tests exercise migrations and schema properties against a **real**
PostgreSQL. They are skipped when `PMH_TEST_DATABASE_URL` is absent or
unreachable, and the run reports the skip with its reason instead of showing a
green pass that checked nothing.

-----

<a id="architecture"></a>
## Architecture

Five rules shape every decision here. They are stated first because the rest of
the repository is a consequence of them.

1. **The core is untouched.** A change we need becomes a unit, never an edit in a
   foreign file.
2. **No unit imports core internals** — only public slots such as `ctx.*` and
   service interfaces, so a core upgrade costs no unit work.
3. **Services start with the harness, and a failed start is a visible error.**
4. **Language boundaries are process boundaries.** Every other language runs as a
   process behind a defined interface.
5. **Nothing is ticked off without evidence.** Every number in this repository
   names the command that measured it; anything unverified appears as a stated
   gap.

### Layout

```
apps/cli            the host: loads the profile, composes the Cordis tree, serves the interface
apps/web            the interface (from the template) — the basis for our own
packages/api        health (endpoints + probe registry) · readiness (PostgreSQL, Redis probes)
packages/llm        the LLM seam · llm-deepseek · llm-retry · token-meter
packages/core       agent-tools · agent-loop · scope
packages/agent      session-format · session-persistence-jsonl
packages/auth       auth (Argon2id, sessions, CSRF) · db-schema (SQL migrations)
packages/units      unit-export (plugin export with a proven round trip)
packages/util       atomic-write · home-paths
services/           pmh-attach · pmh-nix · pmh-supervisor (Go) · pmh-sandbox (Rust)
native/             6 Rust crates (locks, PTY, atomic writes, Landlock) — currently unused
docker/             stack setup: extensions, roles, privileges
scripts/            start · port choice · auth address · profile wiring · installer · checks
docs/               concept, decisions, evidence, research
```

### The chain

The smallest complete path runs from a request to a stored session:

```
LLM seam → DeepSeek adapter → retry → token meter
    ↓
agent loop → tool registry → session format → JSONL persistence → resume
```

Each link is a package with its own tests, and the whole chain has a single
end-to-end test. What it does **not** have yet is a call site in a running
application — see [Known Limitations](#known-limitations-and-deferred-work).

### Repository size

| | This project | Reference (upstream fork) |
|---|---:|---:|
| Source (`packages/`, `services/`, `native/`, `apps/cli/src`) | **120 files · 1.5 MB** | 5,205 files · 49 MB |
| Application packages | **16** | 245 |

Our source is roughly **43 times smaller** than the reference application code.
That is a measure of progress, not of size; the decomposition is recorded in
[groessenvergleich-zur-referenz.md](docs/review/groessenvergleich-zur-referenz.md).

-----

<a id="endpoints"></a>
## Endpoints

Our own HTTP surface is deliberately small: two **reading** endpoints. The core
supplies a much larger one, and it is not REST.

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/health` | GET, HEAD | none | reports that the process serves routes |
| `/api/ready` | GET, HEAD | session cookie | queries the registered probes |

```sh
curl -s http://127.0.0.1:3081/api/health
# {"status":"ok","service":"@prometheus-harness/health","version":"0.3.0",…}

curl -s -b cookies.txt http://127.0.0.1:3081/api/ready
# {"bereit":true,"zustand":"ok",
#  "sonden":[{"name":"postgres","zustand":"ok","dauerMs":35},
#            {"name":"redis","zustand":"ok","dauerMs":6}]}
```

The response field names are German — `bereit` (ready), `zustand` (state),
`sonden` (probes), `dauerMs` (duration in ms) — because the service is built that
way. They are shown as returned rather than translated, so the example can be
compared against a live response unchanged.

`/api/health` stays open on purpose: a liveness check that requires a login
cannot report that the login is broken. `/api/ready` is protected and answers
more. The two differ in exactly one situation, and it is measurable:

| | `/api/ready` | `/api/health` |
|---|---|---|
| everything healthy | 200 `ok` | 200 `ok` |
| no probe registered | **503** `ungeprueft` | 200 |
| Redis unreachable | **503** `eingeschraenkt` | 200 |

The probes live in `packages/api/readiness`, not in `health`. `health` offers the
contract `ctx.readyness.register(probe)`; PostgreSQL and Redis are registered
through it, and `health` never learns what it is checking. A readiness endpoint
that itself depends on the things it reports on would fail with them.

`/api/ready` calls the core's own `ctx.connection.requestRejection` rather than
implementing a second opinion of what a valid session is. A registered route
bypasses the fallback handler and therefore the authentication gate, so every
further endpoint needs this guard explicitly.

### The core's interface, for contrast

The core talks **Typert Remote**, over two carriers. A `client-request` envelope
goes to `POST /api/<namespace>/<method>`; logical streams go over the WebSocket
at `/api/remote.mux`. Both were measured on a running host:

```jsonc
// POST /api/goals/create, authenticated
{type:'client-request', rpcId, method, payload}
  → {"type":"server-response","rpcId":"invalid-request",
     "result":{"ok":false,"error":{"code":"gateway/bad-request",…}}}

// WS /api/remote.mux
{type:'open', streamId, endpoint:'session/getState', payload:{args:{}}}
  → {"type":"error","error":{"code":"gateway/invocation-unavailable",
     "message":"typert gateway: session/getState: no active Remote method exports this endpoint"}}
```

Eight controllers are loaded by the core — session, job, terminal, workspace
files, account, settings, workspace, and remotes. Tools such as file access,
shell, jobs, and web search are a third mechanism: LLM function calls the model
makes, not an HTTP surface at all. The full inventory, including what is absent
from this composition, is in
[schnittstellen-bestand.md](docs/review/schnittstellen-bestand.md).

-----

<a id="further-exploration"></a>
## Further Exploration

- [docs/INDEX.md](docs/INDEX.md) — the catalogue: every document with one line.
- [docs/concept.md](docs/concept.md) — the unit model and the four rules.
- [docs/decisions/](docs/decisions/) — decisions taken and decisions open.
- [docs/review/](docs/review/) — findings: interface inventory, Rust inventory, size comparison.
- [docs/status/](docs/status/) — evidence with command and result, the work register, the push audit.
- [docs/research/](docs/research/) — research: authentication standards, language choice.
- [docs/status/beleg-installation.md](docs/status/beleg-installation.md) — the installation evidence, with its own gaps named.
- [docs/status/beleg-eigener-endpunkt.md](docs/status/beleg-eigener-endpunkt.md) — how the own endpoint path was built, and the six errors on the way.

-----

<a id="model-experience"></a>
## Model Experience

### Web-surface context

The core registers a `app:web-surface` prompt section that orients the model to
the interface: the advertised URL, what "this page" refers to, and the rule that
a replacement server does not update the running GUI. `DSH_WEB_URL` is exposed to
shell commands for the same purpose.

### Readiness

`GET /api/ready` is the machine-readable signal. A supervisor reads the status
code — **503** means not ready, and the body says which probe failed and why.
Probe results are reused for five seconds, and concurrent callers share one run,
so a supervisor polling frequently does not multiply database load.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

These are current constraints, measured and named rather than estimated.

- **The chain is not reachable.** The adapter, agent loop, and session are built
  and covered by 300+ tests; no interface exposes them yet. A session belongs on
  the core's RPC channel, where streams, cancellation, and deadlines already
  exist — not on a hand-rolled HTTP endpoint.
- **Our own endpoint surface is two reading endpoints.** Nothing accepts input,
  starts work, or talks to a model.
- **The persistence layer has no production package.** `db-schema` defines the
  migration target interface, and the driver is attached by callers. A
  `session-persistence-postgres` package does not exist; sessions persist to JSONL
  files today.
- **Session format is v1.** The template's format v4 and its four migrations are
  not implemented.
- **Compaction is absent.** `token-meter` counts tokens; it does not shorten.
- **No call against a real provider is recorded.** The DeepSeek adapter is
  exercised against a mock; no key was used in this environment.
- **Envelope encryption exists as a schema, not as code.** The
  `value_cipher`/`wrapped_key` columns and `PMH_MASTER_KEY` exist; no code reads
  the key.
- **The Rust inventory is unused.** 6,569 lines across six crates, and nothing
  invokes them; no script builds them.
- **Two long-standing service gaps.** `pmh-supervisor` has two failing tests, also
  at `HEAD`, and `pmh-nix`/`pmh-attach` carry uncommitted work from another
  session that this line of work does not push.
- **The Linux installation path is partially measured.** `install.sh` is syntax-
  checked in `sh`, `dash`, and `bash`, and its WSL2 environment detection was
  verified; the full seven steps have not run on a Linux filesystem, because
  Docker is unreachable in WSL and a private-repository clone there lacks
  credentials.
- **One defect is unresolved, not fixed.** The database driver import by the
  installer failed reproducibly in a clean clone while the same file ran correctly
  from the same directory; the migration now runs as its own process, which works
  in every measured case. The diagnosis stays in the code. Recorded in
  [beleg-installation.md](docs/status/beleg-installation.md).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The reference harness is checked out at `C:\Users\Chang\deepseek-harness` and is
**not** to be modified; findings there are reported, not acted on. Its installed
packages are read for their interfaces through `node_modules/@deepseek-ai/`.

Pushes follow a four-hour cadence and each one is recorded in
[docs/status/git-audit.md](docs/status/git-audit.md) with the agreement between
local `HEAD` and `origin/main`.

</details>

## Licence

The DeepSeek Harness serves as the **codebase**, so its **MIT licence** applies.
The copyright notice is in [LICENSE](LICENSE) — the licence requires it.
