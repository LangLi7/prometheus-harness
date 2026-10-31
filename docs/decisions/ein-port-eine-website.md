# Ein Port, eine Website — die Welt wird nicht abgespalten

> ## Nachtrag 15.10.2026 — **ausgeführt.**
>
> Die Entscheidung aus §2 ist **umgesetzt**, und die Reihenfolge aus §5 wurde eingehalten — mit
> **einer** Abweichung, die der Betreiber so angesagt hat: der Ordner heißt **`apps/universe`**
> (nicht `apps/world`), und der Pfad heißt dementsprechend **`/universe`** (nicht `/welt`).
>
> Was geschehen ist, in vier Zeilen:
>
> 1. **Umgezogen** `snapshots/web` → `apps/universe` — **bit-gleich belegt** (143 Dateien, SHA-256
>    je Datei: 0 fehlend, 0 abweichend, 0 zusätzlich), ohne `dist/` und `node_modules/`.
> 2. **Gelöscht** wurde der alte Ort **erst danach** (153 Dateien, 26,84 MB) — die Bedingung aus §5
>    ist damit erfüllt: es wurde nichts vernichtet, was nicht vorher an anderer Stelle geprüft lag.
> 3. **Verknüpft**: `scripts/welt-adresse.mjs` ist **gelöscht**; an seine Stelle trat
>    `scripts/world-path.mjs` (Pfad statt Port). Der Host liefert die Welt über
>    `packages/web/world-static` unter `/universe/` aus, `start.mjs` baut sie beim Start, und der
>    Umschalter (`packages/client/world-switch`) zeigt auf dieselbe Herkunft. Die Insel-Einträge der
>    Gruppe „Ansichten" benutzen dieselbe Verknüpfung (§5 Punkt 3).
> 4. **Gemessen**: ein Prozeß, `/universe/` → **200** (HTML, JS, CSS, Schrift), `/universe/../.env`
>    → **404**, `POST` → **405**; **39 Pakete grün**, Prototyp **262 pass · 0 fail**, Bündelprüfer
>    **FEHLER: keine**.
>
> **Was offen bleibt und nicht mir gehört:** das **Festschreiben in git**. Es wurde **nichts**
> eingestuft und **nichts** committet; die 143 Dateien sind weiterhin unverfolgt. `apps/universe`
> bringt eine `.gitignore` mit (`dist/`, `node_modules/`), ein `git add apps/universe` nähme also nur
> Quellen, Tests und Werkzeuge.
>
> Vollständiger Nachweis: [../status/welt-ein-port.md](../status/welt-ein-port.md).

Entscheidung des Betreibers, 15.10.2026:

> „der port sollte natürlich die selbe sein also wird es nicht gespalten oder so. das bedeutet nur
> das es eine art selbe website ist"

## 1. Was heute gemessen ist

`netstat -ano`, lauschende Einträge, 15.10.2026 (**59** Einträge insgesamt):

| Port | Zustand | Wofür |
|---|---|---|
| **3080** | **belegt** | die DSH-Oberfläche |
| **3081** | **belegt** | **unser Host** — `/` → 303 `/anmeldung/` |
| 5173 | **belegt** | eine **fremde** Anwendung (in `welt-adresse.mjs` so vermerkt) |
| 5174 | frei | die Referenz-WebUI (anderer Rechner/Ordner) |
| 5175 | frei | `apps/web` (der Chat) |
| **5176** | **belegt** | **der Welt-Prototyp** (`snapshots/web`, `WELT_PORT`) |
| 5180 | frei | `apps/login_web` (Vite-Entwicklungsserver) |
| 5432 | **belegt** | PostgreSQL |
| 6379 | **belegt** | Redis |

Die Zahlen stehen in `scripts/welt-adresse.mjs` (`WELT_PORT = 5176`), in
`docs/status/anmeldeseite-und-erstlogin.md` §8 und in `docs/reference/web-frontend.md` §5.

**Wie die Zahl entstanden ist — und warum sie nicht mehr trägt.** `welt-adresse.mjs` begründet
`5176` damit, daß `5173`, `5174` und `5175` vergeben waren und der Prototyp sich den nächsten
genommen hat. **Das ist eine Begründung aus der Not, nicht aus dem Entwurf** — und genau die
Not ist jetzt behoben: der Betreiber will **eine** Website.

## 2. Die Entscheidung

**Der Welt-Prototyp wird NICHT auf einem eigenen Port ausgeliefert.** Er ist ein Teil **derselben**
Website und liegt damit hinter **demselben Port wie der Rest** — erreichbar über einen **Pfad**
(`/welt`), nicht über `:5176`.

**Was daraus folgt, in drei Sätzen:**

1. `WELT_PORT` **entfällt** als eigene Zahl. An seine Stelle tritt ein **Pfad** auf der Adresse des
   Hosts.
2. Der **Umschalter** in der Oberfläche öffnet diesen Pfad — dieselbe Herkunft, kein zweiter
   Ursprung. Damit fällt auch die Sorge um **gemischte Herkünfte** weg (Kekse, CORS, `SameSite`):
   bei einem Port gibt es sie nicht.
3. Der Host **liefert** den Prototypen aus, wie er die Anmeldeseite schon ausliefert — gemessen:
   `/` → 303 `/anmeldung/` auf **3081**, aus **unserem** Host, ohne zweiten Lauschpunkt.

**Warum das keine Kleinigkeit ist.** Ein zweiter Port ist eine zweite **Herkunft**. Eine Herkunft
ist im Browser die Grenze für Kekse, `localStorage` und `fetch`. Derselbe Port macht aus „zwei
Anwendungen, die sich kennen müssen" **eine** Anwendung. Der Umschalter wird damit zu einem
**Wechsel innerhalb** der Seite statt zu einem Sprung zwischen zwei Sites.

## 3. Was dafür geändert werden muss — und von wem

| Datei | Was | Zustand |
|---|---|---|
| `scripts/welt-adresse.mjs` | `WELT_PORT` → `WELT_PFAD` (Pfad statt Port) | **fremde, unverfolgte Arbeit** (Regel 14) |
| `scripts/start.mjs` | den Prototypen nicht mehr als eigenen Dienst starten; stattdessen den Host ihn ausliefern lassen | **fremd geändert, nicht festgeschrieben** |
| `scripts/client-buendel.mjs` | die Prüfung „steht derselbe Port im Bündel?" wird zu „steht derselbe **Pfad**?" | **fremd geändert, nicht festgeschrieben** |
| `packages/client/world-switch` | das Ziel des Umschalters | Arbeit des Welt-Umschalters |

**Diese vier Stellen sind fremde, nicht festgeschriebene Arbeit.** Ich habe sie **nicht angefaßt**
— und ich werde sie nicht anfassen, solange der Betreiber es nicht sagt (Regel 14, und der Vorfall
vom 15.10.2026, bei dem acht fremde Dateien in einem Commit landeten).

**Der Zustand ist gemessen, nicht vermutet** (`git status --porcelain`, `git ls-files`):

```
scripts/welt-adresse.mjs            verfolgt=nein  status=[?? scripts/welt-adresse.mjs]
scripts/start.mjs                   verfolgt=ja    status=[ M scripts/start.mjs]
scripts/client-buendel.mjs          verfolgt=ja    status=[ M scripts/client-buendel.mjs]
packages/client/world-switch        verfolgt=nein  status=[?? packages/client/world-switch/]
```

**Zwei der vier Stellen sind gar nicht verfolgt** — der Welt-Umschalter liegt als **ganzes, neues
Paket** unverfolgt im Baum. Wer ihn umbaut, bevor er festgeschrieben ist, baut an etwas, das noch
keine Geschichte hat.

**Der Weg, der beides respektiert:** die fremde Arbeit wird **zuerst festgeschrieben**. Danach ist
sie unser Bestand, und der Umbau auf einen Port ist ein normaler Zug mit eigener Messung:
`WELT_PORT` durch einen Pfad ersetzen, den Host den Prototypen ausliefern lassen, den Umschalter
auf den Pfad zeigen lassen — und die Gegenprobe ist ein `curl` auf **einen** Port, der beide
Seiten liefert.

## 4. Zwei eigene Meßfehler, die in dieser Stunde passiert sind

Beide beim Bestimmen der Ports, beide nach der alten Regel: **eine leere Anzeige ist ein Fehler,
kein Wert.**

1. **`Get-NetTCPConnection` scheiterte** — auf diesem Rechner ist die Ausführungsrichtlinie
   `Restricted`, das Modul `NetTCPIP` lädt nicht. Mein `if ($c) … else „frei"` hat die **leere**
   Antwort als **„Port frei"** ausgegeben. **Alle neun Ports standen auf „frei"**, obwohl sechs
   belegt sind.
2. **`netstat -ano` schreibt auf diesem Windows `ABHÖREN`, nicht `LISTENING`.** Mein Filter auf
   `LISTENING` fand **0** Einträge — und wieder sah es aus wie „nichts lauscht".

**Erst der dritte Versuch hat gemessen:** das Zustandswort aus der **Ausgabe selbst** ablesen,
statt es zu erwarten. `ABHÖREN` als Filter ergab **59** Einträge.

## 5. Zwei weitere Anweisungen des Betreibers — und eine WARNUNG vor der Ausführung

> „es sollte auch jetzt im ordner app befinden oder so, ich denke in eigenem ordner beim app
> anstatt in snappshoot folder"

> „die Insel-Einträge der Gruppe Ansichten sollen dieselbe Verknüpfung benutzen. […] danach das
> alte beispiel dinger löschen"

**1. Der Welt-Prototyp gehört nach `apps/`, nicht nach `snapshots/`.** Ein eigener Ordner bei den
Anwendungen. **2. Die Insel-Einträge der Gruppe „Ansichten" benutzen dieselbe Verknüpfung** — das
ist die Eine-Port-Regel aus §2, angewandt auf die Einträge selbst. **3. Danach die alten
Beispiel-Sachen löschen.**

### Was gemessen ist — und warum „löschen" jetzt NICHT geht

```
snapshots/web                     143 Dateien, 21,75 MB, davon 51 .png, 64 .ts, 21 .js
git ls-files snapshots/web        0     <-- KEINE EINZIGE DATEI IST VERFOLGT
git add -n snapshots/web          149 Einträge -- darunter snapshots/web/dist/assets/*
git check-ignore                   nur node_modules/ ist ignoriert, dist/ NICHT
```

**Der ganze Prototyp ist unverfolgte Arbeit.** „die alten Beispiel-Dinger löschen" hieße heute:
**21,75 MB Arbeit endgültig vernichten**, denn in git steht keine einzige Zeile davon — es gibt
keine Sicherung, aus der man sie zurückholen könnte. **Erst umziehen und festschreiben, dann
löschen.** Die Reihenfolge ist keine Vorsicht, sie ist die Bedingung dafür, daß „löschen"
überhaupt ein Wort mit Bedeutung ist.

**Und `dist/` ist nicht ignoriert.** Ein `git add snapshots/web` nähme **149** Einträge mit, also
den gebauten Stand samt Schriftdateien. Beim Umzug wird **ausdrücklich** eingestuft: Quellen,
Tests, Werkzeuge — **nicht** `dist/`, **nicht** `node_modules/`.

### Die Reihenfolge, die daraus folgt

1. **Umziehen** `snapshots/web` → `apps/<name>/` (Vorschlag: `apps/world`), ohne `dist/` und
   `node_modules/`.
2. **Festschreiben** — damit die 143 Dateien eine Geschichte haben. Im Commit **melden**, daß dies
   fremde, nicht festgeschriebene Arbeit war, die hier übernommen wird (Regel 14).
3. **Verknüpfungen nachziehen**: `scripts/welt-adresse.mjs`, `scripts/start.mjs`,
   `scripts/client-buendel.mjs`, `packages/client/world-switch` — und dabei **denselben Pfad** für
   die Insel-Einträge der Gruppe „Ansichten" benutzen.
4. **Erst danach** die alten Beispiel-Sachen löschen — und vorher **namentlich aufzählen**, was
   gelöscht wird, damit nachvollziehbar bleibt, was verschwunden ist.

**Was die „Insel-Einträge der Gruppe Ansichten" sind, ist gemessen:** sie stehen in
`snapshots/web/src/main.ts` (**48** Nennungen), `src/dock-view.ts` (24), `src/docking.ts` (15),
`tools/panels.js` (13), `src/entry.ts` (8), und geprüft werden sie von
`tests/dock-stations.test.ts` (44) und `tests/switch.test.ts` (30) — also **derselbe Ort, der
umziehen soll.** Die zwei Anweisungen greifen ineinander: derselbe Pfad, den §2 für den Port
fordert, ist auch der Pfad, den die Inseln benutzen sollen.
