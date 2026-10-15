# Der Umbenennungsplan — Regel 42 zu Ende bringen

Stand: 15.10.2026. **Regel 42:** Ordnernamen und Dateinamen englisch; Kommentare und Dokumente
deutsch. Zwei Verstöße sind behoben (`lokal` → `local`, `aufbau` → `composition`). **Sieben Pakete
und elf Dateien fehlen noch.**

Diese Datei ist der **Plan** — mit den Zielnamen, damit die nächste Runde mechanisch ist und nicht
nachdenken muß.

## 1. Die Pakete

| heute | englisch | warum dieser Name |
|---|---|---|
| `ai/faehigkeiten` | `ai/capabilities` | Der Vertrag: was ein Modell tun kann |
| `ai/waechter` | `ai/guard` | Er prüft **vor** der Tat — „Wächter" heißt im Sicherheitsbau `guard` |
| `ai/verzeichnis` | `ai/provider-directory` | Die **Tabelle** der Anbieter als Daten |
| `ai/verwalter` | `ai/directory-curator` | Der **Vorgang**, der die Tabelle nachführt. `curator`, weil er sie pflegt und nicht besitzt |
| `ai/einstellungen` | `ai/settings` | Die Wahl des Endnutzers |
| `client/quellordner` | `client/source-folders` | Der Dialog für die Quellordner |
| *(erledigt)* | `ai/local`, `ai/composition` | |

**`verzeichnis` und `verwalter` bekommen ABSICHTLICH verschiedene Wörter:** das eine ist die
**Tabelle**, das andere der **Vorgang**. Auf Deutsch war das „Verzeichnis" gegen „Verwalter" —
übersetzt wäre „directory" gegen „directory-manager" zu ähnlich und verwischte den Unterschied,
der die beiden Pakete trennt.

## 2. Die Dateien

| Paket | heute | englisch |
|---|---|---|
| `openrouter` | `schema.ts`, `index.ts` | *(schon englisch)* |
| `guard` | `regeln.ts` | `rules.ts` |
| `provider-directory` | `familien.ts`, `sonde.ts` | `families.ts`, `probe.ts` |
| `settings` | `einstellungen.ts`, `datei.ts` | `settings.ts`, `file.ts` |
| `directory-curator` | `katalog.ts`, `ausleger.ts`, `verwalter.ts` | `catalog.ts`, `interpreter.ts`, `curator.ts` |
| `source-folders` | `wege.ts`, `stand.ts`, `bauen.mjs` | `paths.ts`, `state.ts`, `build.mjs` |
| `source-folders` | `dialog.tsx`, `client.tsx` | *(schon englisch)* |

**Die Prüfdateien heißen wie ihr Paket** — `capabilities.test.ts`, `rules.test.ts`,
`provider-directory.test.ts`, `settings.test.ts`, `curator.test.ts`, `paths.test.ts`,
`state.test.ts`. `faehigkeiten.test.ts` und `eskalation.test.ts` werden zu
`capabilities.test.ts` und `escalation.test.ts`.

**Die Dokumentnamen** unter `docs/status/` bleiben vorerst deutsch: sie sind **Dokumente**, und
Regel 42 trennt Name und Inhalt nur für **Ordner und Dateien des Codes**. Ein Name wie
`arbeitsweise.md` ist der Titel eines Aufsatzes, nicht die Adresse eines Moduls. **Wer das anders
möchte, sagt es — dann wird auch das gezogen.**

## 3. Der Ablauf — je Paket, in dieser Reihenfolge

1. **Wer hängt daran?** `Select-String` über `packages,apps,scripts,docs` (ohne `node_modules`)
   nach dem **Paketnamen** — vor der Umbenennung, nicht danach.
2. `git mv` für **Ordner** und für **jede Datei**.
3. **Die Importe**: dieses Projekt benutzt **ausdrückliche `.ts`-Endungen** (`./regeln.ts`). Jede
   Umbenennung einer Datei zieht ihre Importe mit — auch die in `tests/`.
4. **`package.json`**: `name`, `exports` (die Untersichten!), `files`, `scripts`.
5. **`bun install`** — sonst zeigt die Verknüpfung im Verbund auf den alten Ordner.
6. **Die toten Verknüpfungen prüfen und entfernen.** Gemessen am 15.10.2026: `bun install` legt die
   **neue** Verknüpfung an und **läßt die alte liegen**. Nach zwei Umbenennungen zeigten
   `@prometheus-harness/aufbau` und `@prometheus-harness/lokal` ins Leere. Sie sind **unsere**
   (sie zeigen auf Pfade, die wir umbenannt haben) und dürfen weg.
7. **`bun test`** im Paket und **`bun run scripts/typecheck.mjs`** über den Baum.
8. **Commit, und dann `git show --stat` ansehen.** Gemessen: `git add` mit **einem nicht
   existierenden Pfad stuft NICHTS ein** und bricht ab — der Commit `271095b` enthielt deshalb nur
   die Umbenennung und **keine** Namensänderung. Ein Commit wird **nachgesehen**, nicht geglaubt.

## 4. Warum das nicht in der letzten Runde geschah

Sieben Pakete mit Querabhängigkeiten (`capabilities` wird von **sechs** Paketen importiert) sind
**ein Zug, kein Häppchen**. Eine halb gezogene Umbenennung — Ordner englisch, Import noch deutsch —
läßt den Baum **rot** zurück. Das ist schlechter als ein deutscher Name, der funktioniert.

**Reihenfolge mit dem größten Nutzen bei kleinstem Risiko:** erst die Pakete **ohne** abhängige
(`guard`, `directory-curator`, `source-folders`), dann `provider-directory` und `settings`, und
**`capabilities` zuletzt** — es ist das Fundament, auf dem sechs andere stehen.
