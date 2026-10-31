# @prometheus-harness/client-tabs

**Workspaces und Chat als zwei Ansichten unter einer Adresse** — damit jeder Chat in einem eigenen
Browser-Tab liegen kann.

| Adresse | Was erscheint |
|---|---|
| `http://127.0.0.1:3080/` | der Chat, den der Kern wiederherstellt |
| `http://127.0.0.1:3080/c/<Sitzung>` | genau dieser Chat |
| `http://127.0.0.1:3080/w` | die Workspaces |

**Die Adresse ist ein Pfad, keine Abfrage.** Bis zum 28.10.2026 war sie `?s=…`/`?w` — mit der
Begründung, der Wirt beantworte nur `/`. Das war der falsche Schluß: gemessen fehlte dem Wirt die
**Regel**, nicht die Möglichkeit. Sie steht in `packages/api/auth-http/src/huelle.ts` (Prefix `/c`,
exakt `/w`, Index durch `renderIndex`, Basis absolut, Sitzung nur über den Keks). `?s=…` und `?w`
leben als **Alias** weiter: der Client schreibt sie beim Start auf den Pfad um und **ersetzt** dabei
den Verlaufseintrag, damit ein altes Lesezeichen keinen neuen Eintrag erzeugt.

## Was das Paket einträgt

| Naht | Was |
|---|---|
| `main:workspaces` | die Fläche: jeder Arbeitsbereich mit seinen Sitzungen, **jede Sitzung ein Link** — erreichbar über `/w` |
| `sidebar.workspaces.session.menu.item` | „In neuem Tab öffnen" an jeder Sitzungszeile |
| — | der Adreßabgleich (`installAdresse`): Pfad beim Start lesen, **einmal** öffnen, danach schreiben; `popstate` wendet an |
| — | der **Rechtsklick** (`kontext.ts`, `kontextmenue.ts`): eigenes Menü auf Sitzungs- und Arbeitsbereichszeilen |

**Kein Eintrag in der Panelleiste** (bis 28.10.2026 stand dort „Workspaces", Ordnung 20). Der
Betreiber hat ihn abgelehnt: ein Eintrag neben der echten Projektliste ist ein Anbau, keine
Oberflächen-Änderung. Die Fläche bleibt über `/w` erreichbar; der Eintrag ist eine Zeile und kommt
zurück, sobald die Funktion in der echten Seitenleiste sitzt.

## Warum ein eigenes Kontextmenü

Die Sitzungszeilen und die Panel-Einträge der Seitenleiste sind **Knöpfe** — im Browser gibt es
„In neuem Tab öffnen" nur für Elemente mit Ziel. Deshalb baut das Plugin auf genau diesen Zeilen ein
kleines Menü („In neuem Tab öffnen" als echter `<a href="/c/…">`, dazu „Hier öffnen"); überall sonst
bleibt das **native** Menü. Erkannt werden die Zeilen am Merkmal des Kerns
(`data-row-key="session:…"`), unser Panel am eigenen Zeichen (`data-pmh-tabs-panel`).

**Das ist ein Behelf, kein Zustand.** Die Zeile ist ein `<div role="treeitem">`; würde sie ein
`<a href>` (gemessener Anker: `dsh-client-ui-workspace/lib/client.js`, `SessionNodeItem`, Zeile
~2249), bräuchte es dieses Menü nicht. Der Weg dahin und sein Preis stehen in
`docs/status/pfade-statt-abfragen.md`.

## Bauen und prüfen

```powershell
bun test packages/client/tabs             # 33 Prüfungen
bun packages/client/tabs/build.mjs        # baut lib/client.js und prüft die Form
node_modules/.bin/tsgo --noEmit -p packages/client/tabs/tsconfig.json
```

Der Kern lädt **kein** TypeScript: `lib/client.js` ist gebaut und muß zum Start vorliegen. Der
Bündelprüfer führt genau diese Datei aus und befragt sie (Kennung, `apply`, `inject`, `PANEL_ID`,
`chatHref`, `parseSearch`).

## Was es bewußt nicht tut

- **Kein neuer Serverweg** — und damit keine zweite Tür an der Anmeldung.
- **Keine Verwaltung der Arbeitsbereiche** (Umbenennen, Ziehen, Suchen) — das kann die Seitenleiste
  des Kerns, und zwei Wahrheiten für dieselbe Sache wären schlechter als eine.
- **Keine Adresse für andere Panels** (Welt, Git, Graphify): steht eines vorn, sagt die Adresse
  weiter den Chat. Ein `?p=<panel>` wäre der nächste Schritt.
- **Das native Menü ist auf den Listenzeilen weg** — dafür gibt es dort „In neuem Tab öffnen". Im
  Chat-Text und in Eingabefeldern bleibt der Rechtsklick beim Browser (Kopieren, Untersuchen).

Die Begründungen, die Messungen und die offenen Punkte stehen in
[`docs/status/zwei-ansichten-eine-adresse.md`](../../../docs/status/zwei-ansichten-eine-adresse.md).
