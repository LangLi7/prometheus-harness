# Die Eintragung des Ordnerdialogs — gemessen, noch nicht getan

Stand: 15.10.2026. Der Dialog ist **gebaut und sein Bündel ist geprüft** — aber er ist **nirgends
eingetragen**. Nach Regel 2 ist damit die Stufe **„installiert"** *nicht* erreicht: er lädt beim
Start des Hosts nicht. Diese Datei hält fest, was gemessen ist und was fehlt.

## 1. Der Weg ist gemessen — und er ist hausgemacht

| Schritt | Datei | Was dort steht |
|---|---|---|
| 1 | `scripts/client-buendel.mjs` | die Tabelle **`PAKETE`**: `{dir, kennung, art}` — je Client-Plugin ein Eintrag, mit **eigener Prüfart** (`sprachpaket`, `stil`, `verhalten`) |
| 2 | `scripts/profile-patch.mjs` | die Tabelle **`EIGENE_PAKETE`** (Zeilen 398, 404, 415): die Pakete, die ins Profil kommen |
| 3 | `scripts/start.mjs:438` | ruft beim Start `verdrahte(patchPfad(home, profil), EIGENE_PAKETE)` — schreibt sie in `cordis.patch.yml` |
| 4 | `~/.pmh/profiles/pmh/cordis.patch.yml` | **das Ziel** — *„Your patch layer for this dsh profile"*, der vorgesehene Ort |

**Das Profil liegt in `~/.pmh`** — in unserem erlaubten Bereich, nicht in `.dsh`. `cordis.yml`
daneben sagt ausdrücklich *„Diese Datei nicht von Hand bearbeiten"*; der Patch ist der Weg.

## 2. Und eine Korrektur: es GIBT längst einen allgemeinen Bündler

Ich habe `scripts/client-buendel.mjs` für ein Werkzeug **nur für das Sprachpaket** gehalten — nach
seinem Dateikopf geurteilt — und deshalb ein eigenes `bauen.mjs` geschrieben.

**Der Dateikopf täuscht.** In der Tabelle stehen **drei** Pakete, und die Datei sagt selbst, warum:

> *„**Warum eine Tabelle und kein fester Pfad.** Der erste Entwurf konnte **nur** das Sprachpaket
> bauen. Als das zweite Client-Plugin dazukam (`select-contrast`), wäre aus dem Werkzeug entweder
> eine Kopie oder ein Sonderfall geworden. Die Tabelle hält beides beisammen — und die Prüfungen
> bleiben **je Art** verschieden, weil ein Sprachpaket etwas anderes beweisen muß als eine
> Stilregel."*

**Der Hausbau hatte also genau das Problem gelöst, das ich mit `bauen.mjs` noch einmal gelöst
habe.** Das ist der **vierte** Fall desselben Fehlers an einem Tag (Regel 40): nach einer Stelle
urteilen statt nach allen.

**Was daraus folgt.** `packages/client/quellordner/bauen.mjs` ist eine **zweite Wahrheit** und
gehört **weg** — sobald der Eintrag in `PAKETE` steht. Die Prüfung, die es zusätzlich kann (das
Gebaute ausführen und die Komponente **rendern**), gehört als **neue Art** in das Hauswerkzeug,
nicht in ein Nebenwerkzeug.

## 3. Was zu tun ist — drei Schritte, in dieser Reihenfolge

1. **`PAKETE` erweitern** um `{dir: 'packages/client/quellordner', kennung:
   '@prometheus-harness/client-quellordner', art: <neu>}` und die Prüfart im Werkzeug ergänzen
   (das Gebaute ausführen, `name`/`inject`/`apply` befragen, die Eintragung prüfen, die Komponente
   **rendern** — genau das, was `bauen.mjs` heute tut).
2. **`EIGENE_PAKETE` erweitern** in `scripts/profile-patch.mjs`.
3. **`bun scripts/client-buendel.mjs`** laufen lassen und danach den **Host neu laden** — erst dann
   ist „installiert" gemessen und nicht behauptet.

**Warum ich das nicht mehr in dieser Runde getan habe.** Schritt 1 ändert das **Hauswerkzeug**, und
Schritt 3 verändert einen **laufenden Host**. Beides mache ich nicht am Ende eines erschöpften
Zusammenhangs, sondern mit voller Aufmerksamkeit und einer Prüfung danach.

## 4. Der Stand des Dialogs, ehrlich

| Stufe (Regel 2) | Zustand | Beleg |
|---|---|---|
| komponiert | **ja** | 47 Prüfungen im Paket |
| Bündel geprüft | **ja** | `bauen.mjs`: Umschlag, `name`, `inject`, `apply`, Eintragung, Rendering |
| **installiert** | **NEIN** | steht in keiner der drei Tabellen |
| aktiv | nein | folgt aus „installiert" |
| wirkt | nein | kein Browser auf diesem Rechner |
