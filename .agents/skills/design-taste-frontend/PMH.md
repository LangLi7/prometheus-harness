# design-taste-frontend — Prometheus Harness install

Upstream: <https://github.com/Leonxlnx/taste-skill> (MIT), commit `6010f91a9935f1c167dfc500fb1a475681892e6b`,
2026-10-20. Installed as a project skill, so every session in this repository sees it; the local provider
scans `<projectRoot>/.agents/skills` at rank 200 and picked the bundle up without a restart.

`references/`, `library/`, `assets/`, `evals/` and the scripts are upstream. Three files are local
additions, listed under "Updating":

- `PMH.md` (this note)
- `scripts/pmh-run.cmd` (sandbox launcher)
- a closing section in `SKILL.md`, so an agent that loads the skill sees the two constraints below

`LICENSE` is the upstream MIT notice. The directory is named after the frontmatter name
(`design-taste-frontend`), not after the upstream directory (`taste-skill`).

## Running the scripts here

The DSH sandbox captures a child process's stdout through a named pipe, and under `workspace-write` the
child cannot open that pipe. `node scripts/draw.mjs …` therefore fails with
`Access to the path '\\.\pipe\LOCAL\dotnet_…' is denied`, which reads like a missing binary but is a
stdio constraint. Redirecting the child's output into a file removes the pipe.

`scripts/pmh-run.cmd` does the redirect and the argument quoting:

```
cmd /c .agents\skills\design-taste-frontend\scripts\pmh-run.cmd draw --list sectors
read .taste-skill\run-draw.txt
```

The output file is `<cwd>\.taste-skill\run-<script>.txt`; its last line is `exit=<code>`, because the
process exit code does not survive the redirect. `TASTE_SKILL_OUT` moves the directory. A bare script
name (`draw`, `lint`, `inspect`, `assets`, `scenes`) resolves inside `scripts/`; a path ending in `.mjs`
is used as given.

| Script | Sandboxed | Evidence |
|---|---|---|
| `draw.mjs` | works | `--list sectors`, `--options --sector restaurant` write a full sheet |
| `lint.mjs` | works | flags monospace, gradient, eyebrow, shadow and 01/02/03; `exit=1` |
| `assets.mjs` | works, network included | Openverse hits with licence, credit and size |
| `inspect.mjs`, `scenes.mjs` | cannot run | Chrome dies before the first navigation |

`inspect.mjs` is out of reach because Chromium needs named pipes for its Mojo channels and its crash
handler, and the sandbox denies both: it logs `crash server failed to launch`, reaches
`DevTools listening on ws://127.0.0.1:…`, then stops at
`FATAL:mojo\public\cpp\platform\platform_channel.cc: Check failed: Zugriff verweigert`. `--single-process`,
`--no-sandbox` and `--disable-crash-reporter` change which step fails, not the outcome. Run the browser
gate from a normal terminal (there, `node scripts/inspect.mjs <target>` works directly) and paste the
`RUN`/`FAIL` output into the session.

`scripts/pmh-run.cmd` sets `CHROME_PATH` when it is unset and a Playwright Chromium exists under
`%LOCALAPPDATA%\ms-playwright`: `lib/cdp.mjs` only knows Chrome, Edge and Brave in their default install
locations, so a machine with Chromium through Playwright would otherwise report no browser.

## Updating

Copy `skills/taste-skill/*` from a fresh clone over this directory, then restore `PMH.md`,
`scripts/pmh-run.cmd`, `LICENSE` and the `## Prometheus Harness (this checkout only)` section at the end
of `SKILL.md`. The frontmatter name must stay `design-taste-frontend`, and the directory name must match
it.
