# Failure taxonomy — what actually failed

Classify before repairing. The channel (check, guard, prose, payload) follows the **class**, not the symptom, and the class decides whether the failure is even the agent's fault.

General rule from the house: a red run has **three** causes — code, environment, flake — and the three are repaired differently. This taxonomy adds the **model** class, because a malformed tool call is neither a code defect nor flake.

## The six classes

### 1. Mechanical — the rule is expressible as a pattern

**Signals.** Lint error, type error, format diff, banned import, file in the wrong directory, missing newline.

**What it is.** A violation a machine can detect without judgement. The agent knew the rule or could have.

**First move.** Deterministic check — the repo's own linter, a test, a schema. Never a prose rule: a rule is a wish, a check is a fact. If the repo has no guardrail for it, *that* is the finding.

**What does not help.** Adding a sentence to `AGENTS.md` while the linter stays silent. It will be violated again next week, by you.

### 2. Model — the output was structurally wrong

**Signals.** `tool input is invalid JSON`, a tool call with an argument the schema rejects, an instruction silently ignored, the agent asking for something it already has, a confident statement contradicted three lines earlier.

**What it is.** A decoding or attention failure, not a misunderstanding of the task.

**First move.** Change the **shape of the work**, not the wording of the scolding:
- shrink the payload (a 200-line regex with `|` and escapes is a JSON-encoding hazard);
- move data out of the tool call into a file the agent reads;
- restate the output contract as a schema, not prose;
- add one example of the exact call.

**What does not help.** "Be careful with JSON." A model that could follow that instruction would not have produced the malformed call.

**The DSH precedent.** `packages/llm/llm-http/src/index.ts` `parseArguments` returns `{}` on invalid JSON instead of throwing, explicitly so the loop can hand the error back as a tool result. The stream adapter that produced the observed turn failure did not carry that lesson. When the same class appears in two adapters, the fix is the shared helper, not the second `try/catch`.

### 3. Environment — the world was not as assumed

**Signals.** Command not found, `EACCES`, sandbox denial (`[sandbox: file access denied under ... mode]`), missing credential, network unreachable, wrong Node/Bun version, a path that exists on the author's machine only.

**What it is.** The agent behaved correctly for a world that was not there.

**First move.** Fix the environment or record the constraint. Do not teach the agent to work around a broken tool; teach the loop to detect the broken tool.

**What does not help.** Retrying. A sandbox denial is a policy answer, not a transient error; the same exact command fails identically.

### 4. Flake — same input, different result

**Signals.** A test that passes on re-run, a race in a parallel suite, a timeout near the boundary, a result that changes with ordering.

**What it is.** Nondeterminism in the check, not in the work.

**First move.** Measure twice before diagnosing. One red run is not a finding; two runs with the same input and different outcomes is a finding about the **check**.

**What does not help.** Marking the test skipped. That converts a flake into a blind spot.

### 5. Judgement — no pattern can decide it

**Signals.** "Does not match the surrounding style", "the scope crept", "the naming is misleading", "the abstraction is wrong".

**What it is.** A design call with no mechanical predicate.

**First move.** A prose rule plus a reviewer who can explain it. This is the **only** class where prose is the right channel.

**What does not help.** Pretending a linter can hold it. A check that fires on judgement calls gets disabled within a month.

### 6. Boundary — the loop tried to do something it may not

**Signals.** Writes to a verification script, edits a test to make it pass, changes the CI file, raises its own budget, disables the watchdog.

**What it is.** Not an error — an **escalation**. The correct response is not repair but containment.

**First move.** Stop the loop, record the attempt, treat the run as failed regardless of the outcome. This is the class the trust boundary exists for.

**What does not help.** A stronger instruction. The documented cases did it *despite* an explicit instruction not to.

## Symptom → class quick table

| Symptom | Likely class | First suspicion |
|---|---|---|
| `tool input is invalid JSON` | model | payload size/shape, not carelessness |
| tool returns `{}` with no explanation | model, already handled | check whether the adapter marks the empty parse |
| `command not found`, `EACCES` | environment | sandbox mode, PATH, install |
| test green on re-run | flake | ordering, parallel state, timeout |
| lint/type/format | mechanical | missing guardrail |
| "you changed more than asked" | judgement | scope contract in the objective |
| agent edits a test or the CI file | boundary | containment, not repair |

## Two errors are not a pattern

Before promoting a failure to a lesson, require:
- **the same class** (not the same wording),
- **at least twice**, across different runs,
- **within one window** (a week is a reasonable default),
- and **one concrete artefact** (the log line, the diff, the failing command).

Otherwise the "lesson" is a superstition with a file name. This is the single most common way a self-improving loop goes wrong: it learns noise.
