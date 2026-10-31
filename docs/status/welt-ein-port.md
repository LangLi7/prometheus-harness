# Die Welt auf einem Port — `snapshots/web` → `apps/universe`

> **Stand:** 14.10.2026 · **Auftrag:** *„der ganze port ist mir bisschen zu piss 2 port offen zu haben
> ich möchte es als ein port haben und im folder: apps/universe anstatt in snapshoot, dann alles in
> einem port."*
>
> **Was hier belegt wird:** der Umzug des Prototyps nach `apps/universe`, der Auslieferungsweg im
> Host (ein Port, ein Pfad), was dabei gemessen ist — und was **nicht**.

---

## 1. Warum überhaupt — zwei Ports sind zwei Herkünfte

Bis hierher hatte die Welt einen **eigenen** Vite-Entwicklungsserver auf `:5176`. Zwei Ports heißen
zwei **Herkünfte**, und eine Herkunft ist im Browser die Grenze für Kekse, `localStorage` und
`fetch`. Daraus folgte eine ganze Kette von Einzelreparaturen:

| Folge | Was man reparieren musste |
|---|---|
| zwei Keks-Speicher | die Sitzung des Chats gilt nicht in der Welt |
| zwei Namen (`127.0.0.1` und `localhost`) | die Adresse musste **mitgeschickt** werden (`?chat=…`) |
| ein zweiter Port | beim Start belegt? Dann lief die Welt woanders — und der Umschalter zeigte ins Leere |
| zwei Prozesse | ein zweiter Server, der beendet werden muss, und der ein Verzeichnis festhalten kann |

**Ein Pfad auf derselben Herkunft macht daraus einen Wechsel innerhalb einer Seite.** Der Umschalter
schickt seither nur noch **den Pfad** — keine Ansicht, keine fremde Adresse. Der Betreiber hat den
Zwischenstand mit den Zusaetzen zu Recht bemaengelt (*„der link ist nur zu lange so lol"*); was an
ihre Stelle trat, steht in [umschalter-marke.md](umschalter-marke.md) §1a.

---

## 2. Was gebaut ist

| Teil | Ort | Rolle |
|---|---|---|
| **Der Prototyp** | `apps/universe/` (vorher `snapshots/web/`) | die Welt: `src/`, `tests/`, `tools/`, `index.html`, `vite.config.ts` |
| **Der Bau** | `apps/universe/vite.config.ts` → `dist/` | `base: './'` — **relativ**, weil die Welt unter einem **Pfad** liegt; sonst zeigten ihre Dateien auf die Wurzel (den Chat) |
| **Der Auslieferer** | `packages/web/world-static/` (neu) | eine Route am Webserver des Kerns: liefert `apps/universe/dist` unter `/universe/` aus |
| **Der Pfad** | `scripts/world-path.mjs` (neu) | `WORLD_PATH`, `WORLD_APP_DIR`, `worldUrl(herkunft)` — **eine** Angabe, drei Leser |
| **Der Start** | `scripts/start.mjs` | baut die Welt beim Start (`vite build`, ~150 ms) statt einen zweiten Server zu starten |
| **Der Umschalter** | `packages/client/world-switch` | Ziel ist `${location.origin}/universe/` — dieselbe Herkunft, **ohne Zusaetze** (der Ankunftswunsch liegt im `localStorage`, siehe [umschalter-marke.md](umschalter-marke.md) §1a) |

**Der alte `WELT_PORT` ist gelöscht, nicht umbenannt.** `scripts/welt-adresse.mjs` gibt es nicht
mehr; an seine Stelle trat `scripts/world-path.mjs` (Pfad statt Port). Eine Zahl, die niemand mehr
braucht, ist eine zweite Wahrheit über einen Ort, den es nicht mehr gibt.

### 2.1 Warum der Host ausliefert — und nicht Vite im Betrieb

Der Vite-Entwicklungsserver kann HMR und braucht dafür einen eigenen Port. Der Betreiber wollte
**einen** Port; also wird die Welt **gebaut** und als statische Datei ausgeliefert. Der Preis ist
offen benannt: **Änderungen an der Welt wirken erst nach einem Bau.** Deshalb baut `start.mjs` bei
**jedem** Start (statt nur, wenn `dist/` fehlt) — ein Vorhandensein-Test ist keine Frischeprüfung,
und ein alter Bau unter dem Pfad kostet mehr Zeit als 150 ms.

### 2.2 Die Prüfung der Adresse — `zieldatei`

Der Auslieferer macht aus einer **Adresse aus dem Netz** einen **Dateipfad**. Das ist die
gefährlichste Zeile des Pakets, und sie steht an **einer** Stelle (`zieldatei`). Abgewiesen werden:
`..` in jeder Form (auch `%2e%2e`, auch `..%2f`), Steuerzeichen, kaputte Prozentfolgen und alles, was
nach dem **Auflösen** nicht unter dem Zielbaum liegt. Ein Vergleich zweier Zeichenketten genügt dafür
nicht — `…/dist-anderes/x` beginnt mit `…/dist` und liegt trotzdem daneben.

**Und die Präfix-Grenze war zu lose, gemessen:** `startsWith('/universe')` ließ
`/universeX/index.html` durch. Ein Präfix ist eine **Verzeichnisgrenze**, keine Zeichenkette — die
Prüfung verlangt jetzt „gleich" **oder** „mit Schrägstrich danach". Gefunden hat das die eigene
Prüfung (`packages/web/world-static/tests/world-static.test.ts`), nicht das Nachdenken.

---

## 3. Nachweise — gemessen, nicht behauptet

### 3.1 Der Umzug: bit-gleich, mit Prüfsummen

Weil **keine einzige** Datei des Prototyps in git lag (`git ls-files snapshots/web` → **0**), wurde
der Umzug nicht „verschoben", sondern **kopiert und verglichen**:

```
Quelle: 143 Dateien   Ziel: 143 Dateien
fehlend: 0   abweichend: 0   zusaetzlich: 0        (SHA-256 je Datei)
Summe: 21,24 MB (ohne dist/ und node_modules/)
```

Danach wurde `snapshots/web` **gelöscht** (153 Dateien, 26,84 MB inklusive Bau und Abhängigkeiten).
Der erste Löschversuch scheiterte an einem **laufenden Vite-Server auf `5177`**, der das Verzeichnis
festhielt — genau der zweite Port, um den es hier geht; er wurde beendet, danach war der Ordner weg.
Bemerkenswert: dieser Server war **nach** meinem ersten Aufräumen neu gestartet worden — *ein
Verzeichnis, das ein laufender Prozeß hält, läßt sich nicht löschen, und „Datei in Benutzung" ist
eine Auskunft, keine Panne.*

### 3.2 Der eine Port — am laufenden Rechner gemessen

`bun scripts/start.mjs --no-go --port 3081`:

```
[pmh] Welt: baue apps/universe (vite build) …
✓ built in 156ms
[pmh] Welt: /universe/ auf DEMSELBEN Port — kein zweiter Server, keine zweite Adresse.
[pmh] Oberfläche: http://127.0.0.1:3081/
[pmh] Welt: http://127.0.0.1:3081/universe/  — dieselbe Adresse, anderer Pfad.
[pmh] 1 Prozess(e) laufen. Beenden mit Ctrl+C.
```

**Ein Prozess.** Und die Anfragen:

| Anfrage | Antwort |
|---|---|
| `GET /` ohne Token | **303** → `/anmeldung/` |
| `GET /universe/` | **200**, `text/html`, Titel *Prometheus — Welt-Prototyp* |
| `GET /universe` (ohne Schlußstrich) | **301** → `/universe/` |
| `GET /universe/assets/index-mm0Xl017.js` | **200**, `text/javascript`, 697,2 kB |
| `GET /universe/assets/index-BZBSQyWc.css` | **200**, `text/css`, 46,3 kB |
| `GET /universe/assets/montserrat-light-Cvd2VjE_.woff2` | **200**, `font/woff2`, 61,5 kB |
| `GET /universe/../.env` | **404** |
| `GET /universeX/index.html` | **404** |
| `POST /universe/` | **405**, `Allow: GET, HEAD` |
| Buendel des Umschalters (aus dem Chat) | **200**, 6076 B: `WORLD_PATH = "/universe"`, `ARRIVAL_KEY = "pmh.world.arrival"` — **kein** `ansicht`, **kein** `searchParams` |

### 3.3 Der Fehler, den erst die Messung zeigte: eine Ebene zu wenig

Der erste Lauf antwortete auf **jede** Anfrage an die Welt mit **503**:

```
Die Welt ist nicht gebaut.
Erwartet: C:\Users\Chang\prometheus-harness\packages\apps\universe\dist
```

Der Pfad stieg **drei** Ebenen auf (`src` → `world-static` → `web` → …) und landete in `packages/`.
Richtig sind **vier**. Bemerkenswert ist nicht der Zählfehler, sondern die **Antwort**: der
Auslieferer sagt, was er sucht, warum nichts kommt und wie man es baut — statt eines leeren 404. Ein
fehlender Bau sieht damit aus wie ein fehlender Bau.

### 3.4 Die Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `bun test` in `apps/universe` | **262 pass · 0 fail**, 4022 Zusicherungen, 24 Dateien (unverändert nach dem Umzug); nach dem **gekürzten Ziel** (15.10.2026) **260 pass · 0 fail** — die beiden abgezogenen Fälle prüften die entfallenen Adreß-Zusätze |
| `tsgo --noEmit` in `apps/universe` | **0 Fehler** |
| `bun test` in `packages/web/world-static` | **7 pass · 0 fail** (davon 4 über `zieldatei`) |
| `bun scripts/typecheck.mjs` | **39 Pakete grün, 0 rot** (vorher 37 — `apps/universe` und `world-static` sind dazugekommen) |
| `bun test scripts/tests` | **286 pass · 0 fail** |
| `bun scripts/client-buendel.mjs` | **FEHLER: keine** — Klick → `http://127.0.0.1:3081/universe/` **plus** `Ankunftswunsch hinterlegt: pmh.world.arrival = "os"`; „Pfad und Ankunftswunsch wie in den anderen Quellen: /universe, pmh.world.arrival" |

**Der Buendel-Pruefer ist der Wächter gegen Drift.** Der Pfad steht an drei Stellen (Umschalter,
Auslieferer, Skript) — er liest die **Quellen** der beiden anderen und vergleicht sie mit dem, was
das gebaute Buendel wirklich ansteuert.

### 3.5 Die Namen — Regel 42 auf die Welt angewandt

**Der Anlaß war ein Befund der Aufsicht, nicht meiner:** der Namenswächter
(`scripts/naming-guard.mjs`, Regel 42: *Ordner- und Dateinamen englisch*) zählte **26 neue Dateien
unter `apps/universe/`** und fragte, wem sie gehören. Sie gehören zur Welt — also wurden sie
englisch benannt.

**Gemessen: der Wächter kannte nur vier dieser Namen.** Er meldete

```
apps\universe\tests\umschalter.test.ts   deutsches Segment "umschalter"
apps\universe\tools\aufbau.js / aufbau.png   "aufbau"
apps\universe\tools\boot-mit-zustand.js / zustand.js   "zustand"
```

Tatsächlich deutsch benannt waren **rund vierzig** Dateien. Der Wortvorrat des Wächters kennt
`umschalter`, `aufbau`, `zustand` — **nicht** aber `eingang`, `ansicht`, `wechsel`, `ebene`,
`ebenen`, `bild`, `himmel`, `objekte`, `andockstellen`, `massstab`, `skala`, `zentrum`, `schrift`,
`fokus`, `messen`, `seiten`, `steuerung`, `uebergang`, `ueberlappung`, `groessenordnungen`,
`diag-vorbelegung`, `herauszoomen`, `haengt`, `raumgroesse`, `oberflaeche`, `zoomtakt`, `neu`,
`_ueb`, `_himmel`. **Das ist ein Befund für den Wächter, nicht für die Welt** — und er steht hier,
damit er nicht verlorengeht: ein Wächter, dessen Wortliste die halbe Sprache nicht kennt, meldet
„sauber", wo nichts sauber ist.

**Umbenannt wurden 69 Dateien** (Skript `.pmh-build/welt-namen-englisch.mjs`, jede Umbenennung
protokolliert):

| Ordner | Beispiele |
|---|---|
| `src/` | `ansicht-wechsel.ts` → `view-switch.ts`, `eingang.ts` → `entry.ts` |
| `tests/` | `umschalter.test.ts` → `switch.test.ts`, `andockstellen.test.ts` → `dock-stations.test.ts`, `massstab-pixel.test.ts` → `scale-pixel.test.ts`, `typo-skala.test.ts` → `typo-scale.test.ts` |
| `tools/` | `aufbau.js` → `build-up.js`, `himmel.js` → `sky.js`, `ebene.js` → `level.js`, `bild.js` → `shot.js`, `zustand.js` → `state.js`, `uebergang.js` → `transition.js`, `zentrum.ts` → `center.ts`, `oberflaeche.ts` → `ui-surface.ts` — und die 51 Bilder mit ihnen (`_himmel_01.png` → `_sky_01.png`, `ueberlappung3.png` → `overlap3.png`, …) |

**56 Dateien bekamen nachgezogene Verweise** (Importe, Pfadnennungen in Kommentaren, Doku). Ersetzt
wurde **nur, was eindeutig ein Dateiname ist** — `ebene.js`, `./eingang'` —, denn ein nacktes
`ebene` kommt in der deutschen Prosa dieses Projekts hundertfach vor. Geschont wurden die
**append-only**-Protokolle der Aufsicht (`docs/protokoll/**`), die kopierte Kern-Doku (`docs/dsh/**`)
und die Umzugsliste des anderen Agenten (sie ist eine historische Aufzählung).

**Und der Beweis, daß die Umbenennung nichts verändert hat:** der gebaute Stand heißt **vorher wie
nachher** `dist/assets/index-CzSo_cfn.js` (688,58 kB) — derselbe Inhalt, dieselbe Prüfsumme im
Dateinamen. Ein Umbenennen, das die Ausgabe ändert, wäre kein Umbenennen. *(Der Name hat sich
**später** geändert — heute `index-mm0Xl017.js`, 697,23 kB —, aber nicht wegen der Namen: am
15.10.2026 ist der Umschalter auf das kurze Ziel und den Ankunftswunsch umgebaut und die Oberfläche
auf gezeichnete Zeichen umgestellt worden, siehe [umschalter-marke.md](umschalter-marke.md) und
[zeichen.md](zeichen.md).)*

**Was die Werkzeuge anging, war der Umzug ein Fund — nicht nur eine Umbenennung.** Sie navigierten
auf `http://127.0.0.1:5177/` (den **abgeschafften** Vite-Server) und schrieben ihre Bilder nach
`C:\…\snapshots\web\tools\…` (den **alten** Ort, fest auf einen Rechner). Beides war schon vorher
falsch: der feste Rechnerpfad ist genau das, was `scripts/maschinenpfade.mjs` sucht. Jetzt:

* Adresse: `http://127.0.0.1:3081/universe/`
* Zielort: `import.meta.dirname` (bzw. `$PSScriptRoot` in den beiden PowerShell-Werkzeugen) — der
  eigene Ordner, nach **jedem** Umzug richtig
* Vorlagen: `` `_himmel_${…}.png` `` → `` `_sky_${…}.png` ``, `ebene-…` → `level-…`, `neu-…` → `new-…`
* Räume der Meßläufe: `uebergang-…` → `transition-…`, `zoomtakt-…` → `zoom-rate-…`

**Geprüft wurde dabei auch die Syntax** — die Werkzeuge liegen **nicht** in `src/` und werden von
`tsgo` nicht erfaßt: alle `.js`/`.ts`-Werkzeuge durch den Transpiler von Bun gelesen → *„Alle
Werkzeuge sind syntaktisch lesbar."* Ob sie **laufen**, ist damit nicht gesagt: sie brauchen einen
Browser mit DevTools-Protokoll, und auf diesem Rechner ist keiner installiert.

---

## 4. Was **nicht** gemacht ist — offen und benannt

1. **Festschreiben in git. Nichts wurde eingestuft oder festgeschrieben.** Der Umzug ist ein
   Dateizugriff, kein Commit: die 143 Dateien liegen jetzt in `apps/universe/` und sind **weiterhin
   unverfolgt**. `apps/universe/.gitignore` schließt `dist/` und `node_modules/` aus — ein
   `git add apps/universe` nähme also **nur** Quellen, Tests und Werkzeuge. Der Commit selbst
   gehört dem, der in diesem Baum das Sagen über die Geschichte hat; in dieser Arbeitskopie
   arbeitet ein **zweiter Agent**, und ein Commit, der fremde Änderungen mitnimmt, ist hier schon
   einmal passiert.
2. **Die Werkzeuge sind nachgezogen und syntaktisch geprüft — aber nicht gelaufen.** Sie schreiben
   jetzt neben sich selbst (`import.meta.dirname` statt eines festen Rechnerpfads) und navigieren auf
   `http://127.0.0.1:3081/universe/` statt auf den abgeschafften Vite-Server. **Nicht** nachgemessen
   ist, ob sie im Ganzen durchlaufen: sie brauchen einen **Browser mit DevTools-Protokoll**, und auf
   diesem Rechner ist keiner installiert.
3. **Die deutschen Namen im CODE sind noch da.** Der Wächter prüft **Ordner- und Dateinamen** (Regel
   42) — die Bezeichner *innerhalb* sind voller Deutsch: `hudMarke`, `wechsleAnsicht`, `geheZumChat`,
   `markeZiel`, `takeArrival`, `waehleAnsicht`, `markeTextKey`, `inselChatTextKey`, `holeKamera`,
   `setzeEbene` …
   Der Betreiber hat dazu eine eigene Ansage hinterlassen (*„„uebergang" naming sollte schon englisch
   sein ;D das könnte probleme verursachen"*), und `window.__prometheusCanvas.objekte()` ist eine
   **Schnittstelle**, die die Werkzeuge aufrufen. Eine Umbenennung der Bezeichner ist deshalb ein
   eigener Zug mit eigenen Folgen — **nicht** gemacht und hier als offen benannt.
4. **Der Pfad heißt `/universe`, nicht `/welt`.** Der Betreiber hat den Ordner `apps/universe`
   genannt; der Pfad folgt dem Ordnernamen, damit ein Name nicht zwei Schreibweisen hat
   (`docs/decisions/ein-port-eine-website.md` hatte `/welt` vorgeschlagen).
5. **Kein Browser auf diesem Rechner — bis zum 15.10.2026.** Daß die Welt im Browser **läuft**, war
   über HTTP belegt (HTML, JS, CSS, Schrift — alle 200), nicht über einen gezeichneten Rahmen.
   **Nachtrag:** *Chrome* gibt es hier nicht, **Brave** schon — ein Chromium, das
   `apps/universe/tools/shot.js` ohne Änderung annimmt (`--headless=new
   --remote-debugging-port=9223`). Die Welt **zeichnet** darin: Canvas 1440 × 900, WebGL 2.0, die
   Beschriftungen und das Achsenkreuz sind da — **die Körper der 3D-Welt nicht** (ein schwarzes Bild
   mit Bedienelementen). Das ist ein eigener Befund, nicht untersucht, und steht in
   [zeichen.md](zeichen.md) §5.
6. **`snapshots/` bleibt bestehen** — mit den drei leeren Ordnern `acp`, `sdk`, `session` aus dem
   Namensskelett. Sie gehören dem Kern (sessiongetriebene Erwartungen), nicht dieser Welt; sie
   anzufassen wäre eine Aussage über fremde Arbeit.
7. **Zwei fremde Dateien tragen noch den alten Ort bzw. alte Namen — ich habe sie nicht angefaßt:**
   * `scripts/tests/language-guard.test.mjs` nennt in einer Beispielliste `'snapshots/web/src/rotation.ts'`.
   * Die Sprachbasis (`docs/status/sprachbasis.json`) und die Namen des Wächters selbst sind Arbeit
     des anderen Agenten; meine Umbenennung **erhöht** seine Zahlen nicht mehr, aber seine
     Wortliste ist zu kurz (§3.5).
8. **Zwei Skripte dieses Umzugs liegen als Werkzeug in `.pmh-build/`** (nicht versioniert):
   `welt-namen-englisch.mjs` und `welt-werkzeuge-nachziehen.mjs`. Sie sind **einmalig** gedacht und
   wiederholbar angelegt (ein zweiter Lauf meldet „schon vorhanden" und tut nichts). Wer sie
   dauerhaft behalten will, verschiebt sie nach `scripts/` — dann gehören sie geprüft.

---

## 5. Wie man es nachfaehrt

```powershell
# Der laufende Bun. Auf diesem Rechner stehen zwei defekte bun-Eintraege im PATH
# (siehe den Dateikopf von `scripts/start.mjs`) — deshalb der Weg ueber die Umgebung.
$BUN = "$env:USERPROFILE\.bun\bin\bun.exe"

# 1. Alles starten: baut die Welt und liefert sie MIT dem Chat auf einem Port aus.
& $BUN scripts/start.mjs --no-go --port 3081
#    → http://127.0.0.1:3081/            der Chat (mit Token aus der Ausgabe)
#    → http://127.0.0.1:3081/universe/   die Welt, dieselbe Adresse

# 2. Die Welt allein prüfen
cd apps\universe ; & $BUN test ; & $BUN run typecheck

# 3. Den Auslieferer prüfen (Adressen, Ausbruch, Inhaltstypen)
& $BUN test packages/web/world-static/tests

# 4. Den Typlauf ueber alle Pakete
& $BUN scripts/typecheck.mjs
```
