# Sources

Every claim in this skill traces to one of these. Where a claim was taken from an existing project document rather than re-verified here, that is said explicitly.

## Odysseus (primary, verified 2026-10-28)

| Claim | Source |
|---|---|
| Repository, default branch, size | <https://api.github.com/repos/odysseus-dev/odysseus> |
| Complete file tree, 2.817 paths, `truncated: false` | <https://api.github.com/repos/odysseus-dev/odysseus/git/trees/main?recursive=1> |
| Self-description "self-hosted AI workspace" | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/README.md> |
| Skill extraction, success-only, `draft` start | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/services/memory/skill_extractor.py> |
| Two-arm audit, repair stages, publication threshold | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/skills-audit-architecture.md> |
| Lifecycle, eight records, daily/weekly re-audit | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/services/memory/skill_lifecycle.py> |
| Memory/skill layout, untrusted source data | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/specs/memory-skills.md> |
| Persistence, SQLite + effects JSONL | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/specs/persistence.md> |
| "No model weights or training settings change" | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/AGENT_TURN_CONTRACT.md> |
| No self-improvement goal; prompt bloat open | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/ROADMAP.md> |
| Hermes-integration request, implying the gap | <https://api.github.com/repos/odysseus-dev/odysseus/issues/55> |
| Read-back verification as a procedure | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/resources/skills/agent/verified-state-change/SKILL.md> |
| Hermes named as template | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/skills-lifecycle.md> |

The full evidence table (27 claims: 22 supported, 5 refuted/unproven) is in `docs/research/2026-10-28-selbstverbesserung-odysseus.md`.

## Prometheus Harness (local, read directly)

| Claim | File |
|---|---|
| `tools/pre-execute` / `tools/post-execute` waterfall; non-blocking failure | `packages/plugin/plugin-hooks/src/index.ts` |
| `llm/stream` wraps the provider stream; usage accounting there | `packages/crew/crew-plugin/src/plugin.ts` |
| Invalid tool JSON deliberately becomes `{}` rather than throwing | `packages/llm/llm-http/src/index.ts` (`parseArguments`) |
| Skill roots and rank order; body read at load time | `packages/skill/skill-filesystem/src/index.ts` |
| Immutable trust boundary, five-step circle, §7 approval table | `docs/design/harness-generationen.md` §6–§7 |
| Three causes for a red run; "not measurable" is an allowed answer | `AGENTS.md` |
| Build the check over writing the rule; retro categories | `.agents/skills/retro/SKILL.md` |
| Session logs are `session.v4.jsonl.zstd` | `.pmh-build/harness-home/sessions/<workspace>/<uuid>/` |
| Prompt-engineering skill as the structural template | `units/skills/prompt-engineering-skill/skills/prompt-engineering/SKILL.md` |

## Safety evidence (cited in the project research, not re-verified here)

These are used for the trust-boundary section. The URLs are as they appear in `docs/research/selbstverbesserung-und-live-umschalten-2026.md`; the quotations there are verbatim.

| Mechanism | Source |
|---|---|
| Agent removed its own hallucination detector | <https://sakana.ai/dgm/> (Sakana AI, Darwin Gödel Machine) |
| Agent extended its own time limit | <https://arstechnica.com/information-technology/2024/08/research-ai-model-unexpectedly-modified-its-own-code-to-extend-runtime/> |
| Specification gaming: the objective is a manipulable object | <https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/> |
| Outer trust boundary, frozen judge as veto | <https://ornith.ai/ornith_1_0.html> |
| Disabling the red button | <https://intelligence.org/2016/06/01/new-paper-safely-interruptible-agents/> (Orseau & Armstrong, 2016) |
| Escalation channel reduces reward hacking (23,6 % → 5,3 %) | <https://arxiv.org/abs/2608.29460> |
| Monitorability tax, obfuscated reward hacking | <https://arxiv.org/abs/2503.11926> (OpenAI, 2025) |

## What this skill does not claim

- That Odysseus is self-improving. The repository does not say so and does not do so.
- That the phase-2 plugin exists. It is specified in `automation.md`, not built.
- That any loop designed with this skill works. The specification is a hypothesis until its first falsifiable run.
- That the numbers in the trust-boundary table are measurements. They are the project's existing design decisions, carried over unchanged.
