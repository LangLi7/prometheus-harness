# Der Umbenennungsplan — Regel 42 zu Ende bringen

Stand: 15.10.2026. **Regel 42:** Ordnernamen und Dateinamen englisch; Kommentare und Dokumente
deutsch. **Sieben der acht Umbenennungen sind vollzogen**, jede mit Commit belegt (§5). **Offen ist
genau eine: `ai/faehigkeiten` → `ai/capabilities`** — absichtlich zuletzt, weil **sechs** Pakete
daran hängen.

Diese Datei ist der **Plan** — mit den Zielnamen, damit die nächste Runde mechanisch ist und nicht
nachdenken muß.

## 1. Die Pakete

| heute | englisch | Zustand | warum dieser Name |
|---|---|---|---|
| `ai/local` | *(war schon englisch)* | vollzogen | — |
| `ai/composition` | *(war schon englisch)* | vollzogen | — |
| `ai/waechter` | `ai/guard` | vollzogen | Er prüft **vor** der Tat — „Wächter" heißt im Sicherheitsbau `guard` |
| `ai/verwalter` | `ai/directory-curator` | vollzogen | Der **Vorgang**, der die Tabelle nachführt. `curator`, weil er sie pflegt und nicht besitzt |
| `client/quellordner` | `client/source-folders` | vollzogen | Der Dialog für die Quellordner |
| `ai/einstellungen` | `ai/settings` | vollzogen | Die Wahl des Endnutzers |
| `ai/verzeichnis` | `ai/provider-directory` | vollzogen | Die **Tabelle** der Anbieter als Daten |
| `ai/faehigkeiten` | `ai/capabilities` | **OFFEN** | Der Vertrag: was ein Modell tun kann |

**`verzeichnis` und `verwalter` bekommen ABSICHTLICH verschiedene Wörter:** das eine ist die
**Tabelle**, das andere der **Vorgang**. Auf Deutsch war das „Verzeichnis" gegen „Verwalter" —
übersetzt wäre „directory" gegen „directory-manager" zu ähnlich und verwischte den Unterschied,
der die beiden Pakete trennt.

## 2. Die Dateien

| Paket | heute | englisch | Zustand |
|---|---|---|---|
| `openrouter` | `schema.ts`, `index.ts` | *(schon englisch)* | — |
| `guard` | `regeln.ts` | `rules.ts` | vollzogen |
| `provider-directory` | `familien.ts`, `sonde.ts` | `families.ts`, `probe.ts` | vollzogen |
| `settings` | `einstellungen.ts`, `datei.ts` | `settings.ts`, `file.ts` | vollzogen |
| `directory-curator` | `katalog.ts`, `ausleger.ts`, `verwalter.ts` | `catalog.ts`, `interpreter.ts`, `curator.ts` | vollzogen |
| `source-folders` | `wege.ts`, `stand.ts`, `bauen.mjs` | `paths.ts`, `state.ts`, `build.mjs` | vollzogen |
| `source-folders` | `dialog.tsx`, `client.tsx` | *(schon englisch)* | — |
| `capabilities` | `faehigkeiten.ts`, `eskalation.ts` | *(offen, siehe §4)* | **OFFEN** |

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

## 5. Der Nachweis je Umbenennung

**Die siebte: `ai/verzeichnis` → `ai/provider-directory`** (neben `familien.ts` → `families.ts`,
`sonde.ts` → `probe.ts`, `verzeichnis.test.ts` → `provider-directory.test.ts`).

| Schritt | Befehl | Ergebnis |
|---|---|---|
| Wer hängt daran? | `grep 'prometheus-harness/verzeichnis'` über `packages` | **13 Zeilen** in 9 Dateien (4 Importe, 5 Prosa-Nennungen, 4 eigene Modulköpfe) |
| Umbenennen | `git mv` ×4 | `R` für 6 Pfade |
| Ersetzen | 11 Dateien, 16 Vorkommen | `SUMME=16` — und zwar **nach** dem `git mv` eingesammelt, nicht davor |
| Gegenprobe | `grep 'prometheus-harness/verzeichnis\|\./familien\.ts\|\./sonde\.ts'` | **kein Treffer** |
| Tote Verknüpfung | `Get-Item node_modules/@prometheus-harness/verzeichnis` | Junction → `packages\ai\verzeichnis` (**zeigt ins Leere**) |
| Sperrung lösen | `bun install` | exit **0**, *„1 package installed · Removed: 1 · Saved lockfile"*, neue Junction → `packages\ai\provider-directory` |
| Tests | `bun test` je Paket | `provider-directory` **32/0**, `directory-curator` **42/0**, `local` **20/0** — dieselben Zahlen wie vor der Umbenennung |
| Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot**, exit 0 |
| Commit ansehen | `git show --stat` | 13 Dateien, 22 Einfügungen, 22 Löschungen — **nachgesehen, nicht geglaubt** |

**Warum die 16 und nicht die 13.** `grep` zählt **Zeilen**, das Ersetzen zählt **Vorkommen**:
`curator.ts` und `curator.test.ts` nennen den Paketnamen je **zweimal** (Import **und** Prosa), und
drei Modulköpfe tragen zugleich den Paket- **und** den Dateinamen. Die Differenz ist die Regel, nicht
der Fehler — sie ist nur dann ein Fehler, wenn sie **unbegründet** bleibt.

**Die Datei-Ebene ist mitgezogen, die Bezeichner-Ebene nicht.** `Familie`, `Sonde`, `sonde()`,
`VerzeichnisFehler`, `FAMILIEN` bleiben deutsch: Regel 42 verlangt englische **Ordner- und
Dateinamen**, und ein deutscher Bezeichner in deutschem Kommentarwerk ist Hausstil, kein Verstoß.
Wer das anders will, sagt es — dann ist es ein eigener Zug mit eigener Messung.
