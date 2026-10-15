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

## 5. Nachtrag: React ist Baseline — und das Hauswerkzeug weiß es nicht

**Gemessen** in `node_modules/@deepseek-ai/dsh-client-modules/README.md`:

> *„The shell seeds a frozen module table (`PLATFORM_MODULES`: **React**, Cordis, and static UI
> libraries); every dynamic bundle resolves its externals against exactly that baseline.
> `dsh.client.external` adds only **exact non-baseline** requests."*

**Was daraus folgt:**

1. **Mein Bündel ist richtig, wie es ist.** Es verlangt `react` und `react/jsx-runtime` — beides
   **Baseline**. Es braucht **keinen** Eintrag in `dsh.client.external`.
2. **Aber unser Hauswerkzeug würde es fälschlich anmeckern.** `pruefeBuendel` (Zeile 208–212) wertet
   **jeden** `require`-Wunsch als Fehler: *„Die Fabrik verlangt Module: … — dann gehören sie in
   `dsh.client.external`"*. Für React ist das **falsch** — React ist Baseline und wird von der
   festen Modultafel beantwortet.

**Warum mein `bauen.mjs` das nicht gesehen hat.** Es reicht einen **echten** `require` durch, also
lädt React wirklich und **nichts fällt auf**. Das Hauswerkzeug reicht eine **Attrappe** durch und
sieht den Wunsch. **Beide Prüfungen sind für sich grün — und nur die schärfere findet den
Unterschied.** Das ist der Grund, warum ein zweites Werkzeug neben dem Hauswerkzeug gefährlich ist:
es sieht weniger und meldet trotzdem „bestanden".

**Die Folge für Schritt 1.** Wer mein Paket in `PAKETE` einträgt und `art: 'verhalten'` nimmt,
bekommt **einen Fehlalarm** — nicht wegen des Bündels, sondern wegen der Prüfung. Vorher muß der
Verteiler die **Baseline** kennen: `react`, `react-dom`, Cordis und die statischen UI-Bibliotheken
sind **keine** Wünsche, die gemeldet werden dürfen. Erst dann ist ein neuer Eintrag sinnvoll.

## 6. Die Ausgangslage für den Eingriff — gemessen am 15.10.2026

Wer das Hauswerkzeug ändert, braucht eine **grüne Ausgangslage**: nur dann läßt sich ein roter Lauf
**dieser** Änderung zuordnen. Vor dem Eingriff gemessen:

| Netz | Befehl | Ergebnis |
|---|---|---|
| Das Hauswerkzeug | `bun test scripts/tests/client-buendel.test.mjs` | **16 pass, 0 fail** |
| Die Eintragungstabelle | `bun test scripts/tests/profile-patch.test.mjs` | **25 pass, 0 fail** |
| Der ganze Baum | `bun run scripts/typecheck.mjs` | **37 Pakete grün, 0 rot** |

**Diese Zahlen gehören in die nächste Runde** — sie sind der Vergleichspunkt. Ein Lauf, der danach
rot ist, ist **meine** Änderung und nicht ein alter Schaden.

**Warum der Eingriff selbst noch aussteht.** Er berührt **fremdes, festgeschriebenes** Werkzeug
(drei bestehende Prüfarten) — und Schritt 3 verändert einen **laufenden Host**. Beides mache ich mit
vollem Zusammenhang und mit dem Netz oben, nicht am Ende eines erschöpften.

## 7. Die Baseline ist gefunden — und der Eingriff ist blockiert (fremde Arbeit)

### Die maßgebliche Liste, gemessen

`deepseek-harness/packages/client/web/src/platform.ts`:

```ts
PLATFORM_MODULES = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
                    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
                    '@deepseek-ai/dsh-client-ui-primitives']
PRELOADED_CLIENT_EXTERNALS = ['@deepseek-ai/dsh-client-runtime/client']
```

Laut `packages/client/AGENTS.md` ist sie *„the single source of truth for shell-seeded shared
modules"*, und der Hausbau verbraucht sie in `packages/client/tsdown.client.ts:419` als
External-Liste. **Diese sieben brauchen keinen Eintrag in `dsh.client.external`.**

**Damit ist die Änderung am Prüfer präzise möglich** — sie lautet: nur **nicht**-Baseline-Wünsche
melden, Baseline-Wünsche **berichten**. Die alte Meldung wäre an einem React-Plugin gescheitert.

### Warum sie trotzdem NICHT gemacht wurde — gemeldet nach Regel 14

Beim Versuch, sie zu schreiben, hat das Werkszeug abgebrochen:

> *„cannot edit …: file changed since it was read — re-read the file, then retry"*

Nachgesehen (15.10.2026, ~16:40):

| Datei | Zustand im Baum | Zeitstempel |
|---|---|---|
| `scripts/client-buendel.mjs` | **` M` — uncommitted** | **16:35** |
| `scripts/profile-patch.mjs` | **` M` — uncommitted** | **16:19** |

Die letzten **Commits** darauf sind alt (`1ba8951`). **Der parallele Arbeitsstrang bearbeitet genau
diese zwei Dateien — jetzt.** Beide sind Ziele meines geplanten Eingriffs (`PAKETE` und
`EIGENE_PAKETE`).

**Deshalb: nicht angefaßt, gemeldet.** Ein Eingriff in dieselben Tabellen, während jemand anders
daran schreibt, ist kein Fortschritt, sondern ein Konflikt — und ein Datenverlust wäre hier
teurer als ein späterer Schritt.

**Auch die Ausgangslage aus §6 ist damit genauer zu lesen:** die 16 und 25 grünen Prüfungen wurden
gegen den **veränderten** Arbeitsstand gemessen, nicht gegen den festgeschriebenen. Sie belegen,
daß es **jetzt** grün ist — nicht, daß es im Commit grün war.

### Was die nächste Runde tun muß — in dieser Reihenfolge

1. **Warten, bis die beiden Dateien festgeschrieben sind** (`git status` sauber) — oder mit dem
   parallelen Strang klären, wer sie bearbeitet.
2. Dann den Prüfer um die Baseline ergänzen (Liste oben, mit Fundstelle).
3. Dann `PAKETE` und `EIGENE_PAKETE` erweitern, `bun scripts/client-buendel.mjs` laufen lassen,
   `bauen.mjs` entfernen.
4. Erst danach den Host neu laden — das ist die Messung für „installiert".



