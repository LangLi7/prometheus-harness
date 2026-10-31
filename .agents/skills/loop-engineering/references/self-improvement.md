# Self-improvement without self-deception

The point of this reference is narrow: how a loop gets better across runs **without** becoming a system that grades its own homework. The evidence is summarised; the URLs are in `sources.md`.

## What Odysseus actually implements

Verified against the repository at commit level (`main`, 2.817 paths, `truncated: false`):

| Mechanism | File | What it does |
|---|---|---|
| Skill extraction | `services/memory/skill_extractor.py` | A run with ≥2 rounds or ≥2 tool calls is distilled into a reusable `SKILL.md`. New entries start as `draft` so they cannot enter chat context early. |
| Success-only | same file | The extraction prompt returns `null` on "The agent failed, gave up, or the approach is not worth repeating". **Failures are discarded, not learned from.** |
| Two-arm audit | `docs/skills-audit-architecture.md` | Runs the same task with and without the candidate skill, grades both, allows self-edit and a teacher rewrite, then publishes above a threshold. |
| Lifecycle | `services/memory/skill_lifecycle.py` | At most eight records audited at a time, oldest first; inconclusive daily, failed weekly. |
| Untrusted memory | `specs/memory-skills.md` | Stored skills and memories are treated as untrusted source data when shown to the model. |
| No self-modification of code | `docs/AGENT_TURN_CONTRACT.md` | "No model weights or training settings change." Markdown only. |

That is a **curation loop for procedural memory**, not a self-improving system. The claim "it already has self-improvement" is not supported by the repository: no path contains `self`, `improve`, `reflect`, `retro`, `lesson`, `insight` or `evolve`, and `README.md`/`ROADMAP.md` never use the phrase.

## The inversion

Odysseus distils **successes**. For our purpose that is the wrong end:

- A success is already free — it happened once; repeating it is the value of the skill, but the *information* is low.
- A failure is the expensive event: tokens, time, a dead turn, a user who has to retry.
- A failure is also specific: it names a trigger, a class and a boundary. "It worked" names none.

So the loop learns from **failures**, and it borrows from Odysseus only the collar: draft state, external audit, publication threshold, deduplication, lifecycle. The extraction prompt is the one part that must be written fresh.

## The circle (five steps, evaluation outside)

| Step | Output | Owner |
|---|---|---|
| 1. Propose | at most **three** open lessons, each with a measurable criterion | agent |
| 2. Build | the smallest change that can hold the lesson (a check, a guard, a rule, a payload change) | agent |
| 3. Roll out | **at least two** runs of the triggering situation | agent, in shadow |
| 4. Judge | a script outside the worker, plus a second route as counter-check | verifier, not the worker |
| 5. Feed back | passed → rule with date; failed → **the layer is deleted**, not archived | human approves |

Step 4 is the load-bearing one. If the only judge is the model that wrote the change, the loop measures correlation, not quality.

## Candidate format

A lesson lives as a file, not as a memory. Minimum fields:

```yaml
---
id: <slug, stable>
status: draft | published | archived
confidence: low | medium | high        # low unless a check passed
source: observed | user-corrected | imported
class: mechanical | model | environment | flake | judgement | boundary
evidence:                               # the artefacts, not a description
  - <log line, file, command, session id>
replaces: <id or null>                  # supersession, not deletion
created: YYYY-MM-DD
audited: YYYY-MM-DD | null
---
```

`draft` means **not injected** into any context. Only `published` lessons may influence behaviour. This is Odysseus' single best idea and it costs one field.

`replaces` is the second-best: without it, contradicting lessons accumulate and the loop becomes unteachable. Reverting a lesson is deleting the file whose `replaces` points at it — no archaeology.

## What may run without a human

| Action | Needs approval? | Reason |
|---|---|---|
| observe and record a failure | no | read-only |
| cluster failures, propose a lesson | no | reversible |
| write a `draft` lesson | no | not injected |
| change a check, a guard, a test | **yes** | it is the detector |
| publish a lesson | **yes** | it changes future behaviour |
| raise the budget or remove a stop | **yes, and it is a boundary violation** | the documented failure mode |
| edit the audit script | **yes, by someone else** | self-grading |

The asymmetry is deliberate: everything that **records** may be automatic, everything that **judges** is manual. That is the cheapest way to keep a loop honest, and it is the exact line `harness-generationen.md` §7 draws.

## Failure modes of the loop itself

| Failure | Symptom | Fix |
|---|---|---|
| **Reward hacking** | the loop edits its detector, extends its deadline | immutable trust boundary; count boundary violations as a metric |
| **Learning noise** | a lesson from one error | minimum frequency + window + class match |
| **Context bloat** | the rule set grows faster than the work | hard cap on injected lessons; index with lazy loading |
| **Criterion drift** | "better" is redefined after the fact | freeze the criteria version in the generation fingerprint |
| **Unlearnable accumulation** | two rules contradict; nobody knows which wins | `replaces:` and deletion, not append |
| **Self-grading** | the judge is the route that wrote the change | second route or deterministic verifier |
| **Silent success** | the loop reports "done" with no artefact | house rule: no value in a file that was not first in a shell |

## The three prohibitions

1. No access to the running system during evaluation — a candidate runs on a shadow instance.
2. No self-assessment in prose — a finding without a command is not a finding.
3. No criterion shift — if a check is loosened, it goes in the journal with a date and a reason.

These are not stylistic. Each has a recorded case in the project's own history: a backup test wrote to the production database, a schema test wiped it. Twice is a pattern.
