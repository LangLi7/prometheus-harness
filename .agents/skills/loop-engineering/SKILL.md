---
name: loop-engineering
description: Designs the loop a task runs in — trigger, objective, budget, stop conditions, verification, learning, rollback — instead of optimizing one request. Use when the user says "/loop-engineering", "make this autonomous", "design a loop", "why does the agent stall", "the agent keeps failing the same way", "set up a self-improving cycle", "how do I stop babysitting this", or when recurring work should run without a human in the middle. Pairs with prompt-engineering (one request) and retro (one session).
license: MIT
---

# Loop Engineering

Prompt engineering improves **one request**. Loop engineering improves **the cycle the request runs in**: what starts it, what counts as done, when it must stop, who checks, what it learns, and how a wrong lesson is taken back.

The output of this skill is not a better prompt. It is a **loop specification** the user can run, plus the one change that makes it survive its first failure.

## Harness note (DeepSeek Harness)

This runs inside the Prometheus Harness. Four facts are load-bearing:

- **Hooks exist and are waterfall.** `tools/pre-execute` can allow, deny, cancel or ask; `tools/post-execute` can replace a result; `llm/stream` wraps the model stream. That is where automation attaches (`packages/plugin/plugin-hooks/src/index.ts`, `packages/crew/crew-plugin/src/plugin.ts`).
- **Skills are Markdown with frontmatter**, loaded from `.agents/skills` (rank 200) and `<home>/skills`; the body is read at load time, not at catalogue time.
- **The harness already learned one lesson locally.** `packages/llm/llm-http/src/index.ts` `parseArguments` deliberately returns `{}` on invalid tool JSON so the loop can correct it — it does not throw. The stream adapter that produced "tool input is invalid JSON" did not inherit that lesson. Generalise the lesson, not the patch.
- **Evaluation must sit outside the worker.** `docs/design/harness-generationen.md` §6 is the binding text: immutable trust boundary, frozen criteria, no self-approval.

## Purpose

Turn a recurring task into a loop that:
1. starts without being asked,
2. knows when it is done **and** when to stop trying,
3. is checked by something that is not the worker,
4. gets measurably better per run, or is deleted,
5. can be taken back without archaeology.

## Operating principle

- **Design the loop, not the run.** Do not execute the task. Produce the specification, then offer to run one iteration.
- **The stop condition is the feature.** A loop without an exhaustion rule is an unbounded bill. Every loop needs four stops: success, budget, no-progress, boundary violation.
- **Cheap checks beat good rules.** A rule is a wish; a check is a fact. When a mistake is mechanical, build the check (`retro`, "default to building the check over writing the rule"). Reserve prose rules for judgement calls.
- **Learn from failure, publish on proof.** Odysseus distils *successful* runs and explicitly discards failures (`return null` on "The agent failed, gave up"). That is backwards for our purpose: failures are the signal, successes are already free. But a failure becomes a lesson only after it repeats and survives a check — two errors are not a pattern.
- **One loop, one lesson.** If a run teaches three things, the loop is doing three jobs. Split it.
- **Say what is not measured.** An unverified loop is reported as unverified, never as working (house rule: "nicht messbar ist eine zulässige Antwort").

## The seven fields

Every loop specification answers these; a missing field is a defect, not a default.

| # | Field | Question | Bad answer | Good answer |
|---|---|---|---|---|
| 1 | **Trigger** | What starts a run? | "when needed" | "on push to main, and nightly at 03:00" |
| 2 | **Objective** | What is true when done? | "the code is clean" | "`bun run check` exits 0 and the diff touches only `src/`" |
| 3 | **Budget** | What may it spend? | "reasonable" | "max 5 rounds, 20 min, 150k tokens, 2 €" |
| 4 | **Stops** | When does it end? | "when finished" | success / budget / no-progress (same signature twice) / boundary |
| 5 | **Verification** | Who checks, with what? | "the agent reviews itself" | "a script outside the worker; a second route as counter-check" |
| 6 | **Learning** | What survives this run? | "it remembers" | "one line in `.agents/skills/.../SKILL.md`, or a check in CI" |
| 7 | **Rollback** | How is a wrong lesson removed? | "git revert" | "`replaces:` names the lesson this one supersedes; delete restores the prior state" |

Field 4 is where most loops die. Field 7 is where most *systems* die: without supersession, learned rules accumulate contradictions and the loop slowly becomes unteachable.

## Autonomy levels

Pick the level explicitly; do not drift upward by accident.

| Level | Name | Human role | Requires |
|---|---|---|---|
| **L0** | Assistant | approves each step | — |
| **L1** | Checkpointed | approves once, late, with a brief | fields 1–5 |
| **L2** | Looping | sets budget and stop; reads the log | fields 1–6 |
| **L3** | Self-improving | approves published lessons only | fields 1–7 + external evaluation + rollback |

L3 without L2's stop conditions is not autonomy, it is an unattended bill. L3 without field 7 is a system that cannot unlearn.

## Workflow (5 phases)

### Phase 1 — Read the loop that exists
Before designing, extract from the request and the conversation:
- **What recurs** — the actual repetition (a task, a review, a report, a test-fix cycle).
- **Where the human sits today** — the checkpoint that costs the most attention.
- **What already fails** — ask for the last three failures, not the average. If the user has no failures to name, the loop is not ready to be automated; it is ready to be observed.
- **What is already automated** — do not redesign a working check into prose.

### Phase 2 — Fill the seven fields
Draft all seven. Where you must assume, mark it `assumed` and state it. A loop spec with three silent assumptions is a trap.

### Phase 3 — Choose the lesson channel
For the failure this loop is meant to survive, pick the **cheapest channel that can hold it** (see the ladder below). State the channel and the artefact path.

### Phase 4 — Design the check
Name the verifier, its authority, and the exact command. If the only verifier is the worker's own prose, the loop is L1 at best and must say so.

### Phase 5 — Deliver
Output format below. Include one **first iteration** proposal: the smallest run that produces evidence the loop works, and what would falsify it.

## Failure is not failure

Before writing a rule, classify the failure. The channel depends on the class, not on the symptom.

| Class | Typical signal | First move |
|---|---|---|
| **Mechanical** | lint, type, format, banned API | deterministic check — never prose |
| **Model** | invalid tool JSON, ignored instruction, context loss | shrink the payload / restate the contract / add an example |
| **Environment** | missing binary, sandbox denial, flaky network | fix the environment, not the agent |
| **Flake** | same input, different result | measure twice before diagnosing; a single red run is not a finding |
| **Judgement** | style, scope, "matches surrounding code" | prose rule + reviewer, no guardrail can substitute |

The house already names three causes for a red run — **code, environment, flake** — and requires classifying before repairing. This table adds the model class, because a bad tool call is not a code defect.

## The channel ladder

Cheapest first. Stop at the first channel that can hold the lesson.

1. **Deterministic check** — a test, lint rule, schema validation. Prevents recurrence outright.
2. **Guard** — `tools/pre-execute` denies, cancels or asks. Blocks the act.
3. **Contract in the prompt** — the tool description or system text says what "done" means. Prevents the misunderstanding.
4. **Prose rule** — `AGENTS.md` or a skill. Reminds; does not enforce.
5. **Payload change** — smaller input, simpler pattern, chunked work. Removes the trigger.

Rule of thumb: a mechanical violation that reaches channel 4 is a defect in the loop design.

## The trust boundary

Whatever the loop learns, it may not touch:

| Immutable | Why |
|---|---|
| verification scripts and their criteria | the agent that can edit its detector will edit it |
| test files | test manipulation is the cheapest cheat |
| policy (levels, approvals, locks) | otherwise it approves itself |
| tool list and tool descriptions | they define what is allowed |
| sandbox and network configuration | that is the boundary |
| budget (deadlines, round caps) | "edit the code to extend the time limit" is documented |
| the watchdog and the kill switch | a learned agent avoids interruptions |
| the CI definition | it decides what "green" means |

Everything else — skills, units, prompts, order of work — is the **inner scaffold**, and that is exactly what may improve.

## Output format

```
## Loop: <name>

| Field | Value |
|---|---|
| Trigger | ... |
| Objective | ... |
| Budget | ... |
| Stops | ... |
| Verification | ... (authority: script / second route / human) |
| Learning | channel <n>, artefact <path> |
| Rollback | ... |

## Level
L<n> — <one sentence why not higher>

## The lesson this loop is built to survive
<class> — <the failure> — channel <n>, because <reason>

## First iteration (smallest falsifiable run)
- run: <command or action>
- evidence: <what a good run leaves behind>
- falsified if: <the observation that would say the loop does not work>

## Assumptions
- <each one marked assumed>
```

## When to load the references

- `references/failure-taxonomy.md` — the failure classes with concrete DSH signals, what each one does *not* mean, and the first countermeasure. Load in Phase 3.
- `references/self-improvement.md` — what Odysseus actually implements (with files), why "learn from errors" is the gap, the five-step circle, the candidate format, supersession and rollback. Load when the loop is meant to reach L3.
- `references/automation.md` — the exact DSH docking points, what a `post-execute` hook can and cannot see, and the phase-2 build plan with test cases. Load when the user wants the capture automated.
- `references/sources.md` — primary sources for every claim above. Load when the loop feeds a written document or a decision record.

## Scope note

This skill designs **agent loops and their learning channel**. It does not build the Cordis plugin, does not run the audit, and does not publish skills. It stops at the specification plus the first falsifiable iteration; building is a separate, reviewed step.
