# Post-mortems

English | [中文](README.zh.md)

Vorfallberichte: Ein Bug hat einen Ort erreicht, den er nicht hätte erreichen dürfen (eine echte Nutzerin, ein zusammengeführter PR, ein Release), und das Interessante daran ist, *warum unser Prozess ihn durchgelassen hat*, nicht nur der einzeilige Fix.

Ein Post-mortem ist KEINE [Agent Note](../../.agents/notes/README.md) (die eine bewusste Design-Entscheidung und ihre verworfenen Alternativen festhält oder künftige Arbeit vorschlägt). Es ist ein rückblickender Datensatz eines Fehlers: was kaputtging, der Mechanismus, warum jedes Sicherheitsnetz ihn übersehen hat, und die konkret ergänzten Leitplanken, damit dieselbe Bug-Klasse beim nächsten Mal laut fehlschlägt.

Eines schreiben, wenn ein Bug **subtil** ist (der Mechanismus ist nicht offensichtlich, und ein sorgfältiger Ingenieur würde ihn mühsam neu herleiten), **systemisch** (der Grund für sein Entkommen ist eine Lücke in Tests, Tooling oder Konventionen, kein einmaliger Tippfehler) und **kostspielig neu zu entdecken** (er hat echte Debugging-Zeit gekostet und würde es wieder). Die Leitplanken (Tests, AGENTS.md-Regeln, ADRs) verlinken, die das Post-mortem motiviert hat.

Jedes Post-mortem beginnt mit einer **Executive summary**: ein kurzer Absatz, den eine beschäftigte Leserschaft in dreißig Sekunden aufnehmen kann — was kaputtging, die Grundursache in klaren Worten, warum sie entkam und die dauerhafte Lehre —, bevor die detaillierten Abschnitte Summary / Timeline / Root cause / Guardrails folgen.

| # | Titel |
|---|---|
| [0001](0001-acp-default-export-drops-inject.md) | ACP server crashed on connect: `export default` dropped the plugin's `inject` |
| [0002](0002-js-expression-disabled-filesystem-tools.md) | Filesystem snapshot tools were permanently disabled by a literal `!!js` object |
| [0003](0003-web-agent-gui-feedback-loop.md) | Web agent validated a replacement server instead of the GUI hosting its session |
| [0004](0004-landlock-partial-notice-misclassified-child-failures.md) | Landlock partial-enforcement notice misclassified child failures |
