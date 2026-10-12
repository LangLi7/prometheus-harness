# Postmortems

[English](README.md) | 中文

A postmortem records a bug that appeared where it should not have (a real user, a merged PR (Pull Request), a released version) and asks not just what the one-line fix was, but *why our process let it through*.

A postmortem is not an [Agent Note](../../.agents/notes/README.zh.md) (an Agent Note records a deliberate design decision and the alternatives it rejected, or proposes future work). It is a retrospective failure record: what broke, what the mechanism was, why every safety net missed it, and which concrete guards were added so that the same class of bug fails loudly next time.

Write a postmortem when a bug is **subtle** (the mechanism is not obvious, and even a careful engineer has to work to re-derive it), **systemic** (the escape came from a gap in tests, tooling, or conventions, not from a one-off typo), and **expensive to rediscover** (it consumed real debugging time and will do so again). Link the guards the postmortem drove (tests, AGENTS.md rules, ADRs).

Every postmortem opens with an **executive summary**: a short paragraph that lets a busy reader absorb the point in thirty seconds — what broke, the root cause in plain words, why it escaped, and the lesson that lasts — followed by the detailed "Overview, Timeline, Root cause, Guards" sections.

| # | Title |
|---|---|
| [0001](0001-acp-default-export-drops-inject.zh.md) | ACP (Agent Client Protocol) server crashes on connect: `export default` drops the plugin's `inject` |
| [0002](0002-js-expression-disabled-filesystem-tools.zh.md) | Filesystem snapshot tools permanently disabled by a literal `!!js` object |
| [0003](0003-web-agent-gui-feedback-loop.zh.md) | Web agent validated a substitute server instead of the GUI hosting its session |
| [0004](0004-landlock-partial-notice-misclassified-child-failures.zh.md) | Landlock partial-enforcement notice misclassified child-process failures |
