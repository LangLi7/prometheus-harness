# Der Umschalter zwischen Chat und Welt — die Marke oben links

> **Stand:** 15.10.2026 · **Auftrag:** *„genau genommen moechte ich das man beim start den standard
> Prometheus Chat sieht … und ueber web app sollte man den andere version wechseln koennen siehe
> bild"* — und, auf die Rueckfrage **wo**: *„Eigenes Client-Plugin: die Marke selbst wird zum
> Schalter."*
>
> **Was hier belegt wird:** der Weg **vom Chat in die Welt** und **zurueck**, an der Stelle, die der
> Betreiber genannt hat; was dazu gebaut wurde; was gemessen ist — und was **nicht**.
>
> **Nachtrag am 14.10.2026: die Welt liegt jetzt auf DEMSELBEN Port.** Der Betreiber: *„der ganze
> port ist mir bisschen zu piss 2 port offen zu haben ich möchte es als ein port haben und im folder:
> apps/universe anstatt in snapshoot, dann alles in einem port."* Der Umschalter ist damit ein
> **Pfadwechsel** statt eines Sprungs zwischen zwei Herkuenften. Was sich geaendert hat, steht
> vollstaendig in [welt-ein-port.md](welt-ein-port.md).
>
> **Nachtrag am 15.10.2026: das Ziel ist wieder KURZ — `/universe/`, ohne Zusaetze.** Der Betreiber:
> *„`/?ansicht=os&chat=http%3A%2F%2F127.0.0.1%3A3081/` warum ist das so komisch? …
> `http://127.0.0.1:3081/universe` das wäre schon in ordnung habe damit kein problem der link ist nur
> zu lange so lol"*. Er hat recht, und die Zusaetze waren ohnehin nur eine **Folge** der zwei Ports:
> `?ansicht=os` sagte *„zeig die Welt"*, `?chat=<Herkunft>` sagte *„hier kam ich her"*. Mit **einer**
> Herkunft braucht es beides nicht mehr — der Ankunftswunsch liegt im `localStorage`, und der Weg
> zurueck ist die **eigene** Wurzel. Damit sind `ANSICHT_PARAMETER`, `CHAT_PARAMETER`,
> `istChatAdresse`, `merkeChatAdresse` und `geleseneChatAdresse` **ersatzlos entfallen**; was an ihre
> Stelle trat, steht in §1a und §2.

---

## 1. Der Auftrag in zwei Richtungen

| Richtung | Wo | Wie |
|---|---|---|
| **Chat → Welt** | Harness-Oberflaeche (`http://127.0.0.1:3081/`), Seitenleiste **oben links** | Klick auf die **Marke** (Logo und Text) |
| **Welt → Chat** | Welt (`http://127.0.0.1:3081/universe/`), **Kopfzeile oben links** | Klick auf **`◆ PROMETHEUS`** — und weiterhin der Eintrag `Chat` in der Dynamic Island |

Beide Wege sind **ein Pfadwechsel auf derselben Herkunft**, in beide Richtungen:

```
http://127.0.0.1:3081/            der Chat
http://127.0.0.1:3081/universe/   die Welt      ← ein Pfad daneben, beide Richtungen
```

Der Betreiber hat beide Male dieselbe Stelle genannt: *„oben links den text wo den deepseek logo und
text ist fuers wechseln"* … *„zur chat wechseln von universum zur chat ist das auch ein gute idee
ansonsten habe ich noch in dynamic illand die moeglichkeit es zu wechseln."*

**Was unveraendert bleibt:** `apps/web` (die Vorlage des Betreibers) ist **nicht** angefasst. Die
Welt bleibt in `apps/universe`; das Bild aendert sich nur dort, wo ein Bedienelement noetig war.

---

## 1a. Die Regel — und der Fehler, der sie erzwungen hat

**Die Regel in einem Satz:** *die **Marke** und der Insel-Eintrag **`▤ Chat`** fuehren zwischen Harness
und Welt; die uebrigen Insel-Eintraege fuehren innerhalb der Welt.*

**Der Fehler, der sie erzwungen hat (Betreiber, 14.10.2026, mit Bild).** Er klickte in der Welt oben
links auf die Marke — und stand danach im **Platzhalter-Chat des Prototyps**: *„Hier entsteht der
Chat"*, oben rechts *„Chat-Modus — noch nicht gebaut"*. Genau das war der Punkt: **zwei Dinge heissen
„Chat" und sind nicht dasselbe.**

| | was es ist | wer es baut |
|---|---|---|
| der **Harness-Chat** | die Oberflaeche, in der man mit dem Agenten arbeitet | `apps/cli` + der Kern |
| der **Platzhalter-Chat** | eine Flaeche mit einem Auftragstext, **ohne** Funktion | `apps/universe/src/chat-placeholder.ts` |

Dazu kam der zweite Teil desselben Fehlers: die Welt oeffnete sich in der **zuletzt gespeicherten
Ansicht**. Stand dort `chat`, sah man nach dem Klick auf die Marke im Chat sofort den Platzhalter —
obwohl man die **Welt** sehen wollte.

**Nachgezogen am selben Tag, auf ausdrueckliche Ansage.** Der Betreiber: *„kannst du noch den neue
implementierungsverknuepfung auch hier machen: ◉ ansichten · ▤ Chat · ⟲ Ansicht zuruecksetzen"*. Der
Weg in den Chat steht an **zwei** Stellen — an der Marke und in der Insel —, und **zwei Wege mit
demselben Namen muessen dasselbe tun**. Sonst fuehrt der eine in den echten Chat und der andere in
den Platzhalter; genau diese Verwechslung war der Befund. Seither geht **beides** durch dieselbe
Funktion (`geheZumChat` in `main.ts`), und der Insel-Eintrag heisst wie die Marke nach seinem Ziel:
**„Prometheus-Chat"** statt „Chat".

**Was jetzt gilt:**

1. Der Umschalter geht auf **`/universe/`** — **ohne** Zusaetze. Kein `?ansicht=`, kein `?chat=`.
2. **Der Ankunftswunsch liegt im `localStorage`.** Vor der Navigation schreibt das Plugin
   `pmh.world.arrival = 'os'` (`packages/client/world-switch/src/index.ts`, `merkeAnkunft`); die Welt
   liest ihn beim Start mit `takeArrival` (`apps/universe/src/entry.ts`) und **nimmt ihn weg**.
   Chat und Welt liegen auf **einer** Herkunft, also teilen sie sich diesen Speicher — genau das ist
   der Grund, warum die Adreßzeile ihn nicht mehr tragen muss.
3. **Einmalig, und das ist Absicht.** Blieb der Wunsch stehen, ueberschriebe jeder spaetere Aufruf der
   Welt die gespeicherte Wahl: wer die Welt auf die Chat-Ansicht stellt und neu laedt, saehe wieder das
   Universum — ein Reload saehe aus wie ein vergessener Klick.
4. **Der Weg zurueck ist die eigene Wurzel.** `chatZiel()` = `chatUrl(location.origin)` — es gibt
   keine gemerkte Fremdadresse mehr und damit auch nichts, was aus der Zeile geprueft werden muesste.
5. **Marke und Insel-Eintrag `▤ Chat`** navigieren dann (die Welt wird verlassen) — sie blenden
   **nicht** zusaetzlich um. Ohne Herkunft (kein Webserver: `file://` hat `origin === 'null'`) bleibt
   der alte Weg: die Chat-Ansicht des Prototyps. Der Platzhalter ist damit weiter erreichbar, ueber den
   Insel-Eintrag oder `view chat`.
6. Die Beschriftung sagt, **welcher** Chat gemeint ist: `hud.toHarness` / `island.action.harness`
   („Zum Prometheus-Chat wechseln" / „Prometheus-Chat") gegenueber `hud.toChat` /
   `island.action.chat` („Zum Chat wechseln" / „Chat") — als `aria-label`, mit der Herkunft im
   Kurzhinweis.
7. **`⟲ Ansicht zuruecksetzen`** bleibt, was es ist: es setzt die Kamera zurueck und geht **in die
   Welt** — es wechselt die Ansicht (durch dieselbe Stelle, `wechsleAnsicht`) und verlaesst die
   Oberflaeche nicht.

**Und die Pruefung der Adresse aus der Zeile ist damit gegenstandslos geworden — aber nicht die
Sorgfalt dahinter.** `?chat=` war Eingabe von aussen (`javascript:…` waere ein Ausfuehrer fremden
Codes), und `istChatAdresse` liess nur `http` und `https` durch, am **auseinandergesetzten** Wert
(`new URL`) statt an einer Zeichenkette, die mit „http" anfaengt. Diesen Wert gibt es nicht mehr: was
an `location.assign` geht, ist die **eigene** Herkunft (`location.origin`) plus ein Pfad aus
`scripts/world-path.mjs`. Eine fremde Adresse kann niemand mehr unterschieben. Die beiden Faelle, die
bleiben, sind `''` und `'null'` — und beide sind geprueft (`tests/entry.test.ts`).

---

## 2. Was gebaut ist — vier Teile

| Teil | Ort | Was es tut |
|---|---|---|
| **Die Marke der Welt** | `apps/universe/src/main.ts` (`hudMarke`, `geheZumChat`), `src/app.css` (`.hud .wm`) | `◆ PROMETHEUS` wird ein Bedienelement (`role="button"`, `tabindex="0"`, Enter/Leertaste): **navigiert** in den Harness-Chat oder blendet in die eigene Chat-Ansicht um |
| **Der Insel-Eintrag `▤ Chat`** | `apps/universe/src/main.ts` (`choose`, `buildIslandFull`) | **dieselbe Funktion** wie die Marke — und eine Beschriftung, die das Ziel nennt („Prometheus-Chat" / „Chat") |
| **Der Ankunftswunsch** | `apps/universe/src/entry.ts` (neu) | `ARRIVAL_KEY = 'pmh.world.arrival'` und `takeArrival` (liest **und entfernt**); entscheidet mit `markeZiel`, was ein Klick auf die Marke tut; liefert die Beschriftungen (`markeTextKey`, `inselChatTextKey`) |
| **Der Ansichtswechsel** | `apps/universe/src/view-switch.ts` (neu) | **eine** Stelle, an der ein Wechsel vollstaendig ist: `merken` (Einstellung `interface.mode`) **und** `setzen` (`setMode`) |
| **Die Marke des Chats** | `packages/client/world-switch/` (neu), eingetragen in `scripts/profile-patch.mjs` | faengt den Klick auf die Marke der Seitenleiste ab (`capture`), hinterlegt den Ankunftswunsch und oeffnet `/universe/` — **ohne** neues Element, nur zwei Beschriftungen |
| **Die Adresse** | `scripts/world-path.mjs` (neu; vorher `scripts/welt-adresse.mjs` mit `WELT_PORT`) | `WORLD_PATH` und `WORLD_APP_DIR` an **einer** Stelle; `scripts/start.mjs` **baut** die Welt beim Start (`--no-welt` schaltet das ab), der Host liefert sie aus (`packages/web/world-static`) |

### 2.1 Wie der Abfang im Chat funktioniert

Der Kern malt die Marke als `<button>` mit dem Klassenteil `_brandIdentity`
(`@deepseek-ai/dsh-client-ui-sidebar`, gemessen in `lib/client.js` Zeilen 102–104 und 311–317). Der
Kern haengt seine eigenen Zuhoerer an die **React-Wurzel**; ein Zuhoerer am **Dokument in der
Faengstufe** laeuft davor und kann den Klick anhalten. Deshalb:

```
document.addEventListener('click', klick, true)   ← faengt ab, bevor React es sieht
  ├─ ist es ein einfacher Linksklick?             nein → durchlassen (Rechtsklick, Strg, Mittel)
  ├─ steckt die Marke in der Trefferkette?        nein → durchlassen
  ├─ stopPropagation() + preventDefault()         ← keine neue Sitzung
  ├─ localStorage.setItem('pmh.world.arrival', 'os')   ← „ich will die Welt sehen"
  └─ location.assign('http://127.0.0.1:3081/universe/')
```

**Warum der Wunsch VOR der Navigation geschrieben wird.** Danach ist dieses Dokument weg — ein
Schreiben nach `assign` gibt es nicht. Und warum das Schreiben **nicht scheitern darf**: manche
Browser verbieten den Zugriff (strenger Datenschutzmodus) oder der Speicher ist voll. Dann bleibt der
Umschalter trotzdem ein Umschalter — die Welt erscheint in der zuletzt gespeicherten Ansicht, und der
Nutzer kann sie in der Insel umstellen. Ein Wurf dort waere ein Klick, der **gar nichts** tut,
schlimmer als die kleine Unbequemlichkeit, die er verhindern soll.

**Warum das die neue Sitzung nicht kostet.** Die Marke ist im Kern ein **zweiter** Weg zu „neue
Sitzung"; direkt darunter sitzt der eigene Knopf (`session.new`) samt Tastenkürzel. Der Tausch ist
deshalb vertretbar — und er war die ausdrueckliche Wahl des Betreibers.

### 2.2 Nebenher behoben: ein Wechsel, der den Reload nicht ueberlebte

Beim Verdrahten fiel auf: die Eintraege der **Insel** riefen nur `setMode(...)`, der Befehl `view`
dagegen schrieb **zusaetzlich** die Einstellung `interface.mode` — und **die Einstellung gewinnt beim
naechsten Laden** gegen den Raum-Speicher. Wer ueber die Insel in den Chat wechselte und die Seite
neu lud, stand also **wieder im Universum**.

Jetzt gehen **alle** Wechsel durch `wechsleAnsicht` (`view-switch.ts`): Marke, Insel-Eintraege
(`Chat`, `Universe`, `Ansicht zuruecksetzen`, Kanal-Sprung) und der Befehl `view`. Das ist eine
Verhaltensaenderung an **vorhandenem** Code — sie ist hier benannt, damit sie niemand fuer Zufall
haelt.

**Und die Ansicht beim Ankommen** liest jetzt `alsAnsicht` statt eines Vergleichs mit `'chat'`: hier
stand `… === 'chat' ? 'chat' : 'os'`, und das verschluckte `web` **still** — wer die Vorlagen-Ansicht
eingestellt hatte, fand nach dem Neuladen die Welt.

---

## 3. Nachweise — gemessen, nicht behauptet

| Pruefung | Befehl | Ergebnis |
|---|---|---|
| Pruefungen des Prototyps | `bun test` in `apps/universe` | **260 pass · 0 fail**, 4015 Zusicherungen, 24 Dateien |
| Typlauf des Prototyps | `bun run typecheck` (tsgo) in `apps/universe` | **0 Fehler** |
| Bau des Prototyps | `vite build` | **exit 0**, `dist/assets/index-mm0Xl017.js` 697,23 kB (15.10.2026, **mit** den gezeichneten Zeichen — vorher 688,10 kB) |
| Tests des Auslieferers | `bun test` in `packages/web/world-static` | **7 pass · 0 fail** |
| Tests der Skripte | `bun test scripts/tests` | **286 pass · 0 fail**, 3624 Zusicherungen, 18 Dateien |
| Buendel des Umschalters | `bun scripts/client-buendel.mjs` | gebaut **5980 B**; Pruefung siehe unten |

**Die Pruefung des gebauten Buendels** (sie fuehrt es aus und klickt — `scripts/client-buendel.mjs`,
Art `verhalten`):

```
Zuhoerer: 1 × click, Faengstufe
Beschriftung am Knopf: "Zur Welt"
Beobachter gebraucht: nein (Marke sofort gefunden)
Klick auf die Marke → http://127.0.0.1:3081/universe/
Ankunftswunsch hinterlegt: pmh.world.arrival = "os"
Bremsen: stopPropagation 1× · preventDefault 1×
Gegenprobe: Klick daneben, Rechtsklick und Strg+Klick loesen nichts aus — auch kein Wunsch im Speicher
Beschriftung auf englischer Seite: "To the world"
Abbau: 1 Zuhoerer abgemeldet
Spaete Marke: Beobachter angemeldet, nach dem Beschriften abgemeldet
Pfad und Ankunftswunsch wie in den anderen Quellen: /universe, pmh.world.arrival
FEHLER: keine
```

Vier Zeilen darin sind Pruefungen, die es **nur** wegen eines gemeldeten Fehlers gibt: das **Ziel**
muss genau stimmen (Herkunft **und** Pfad — und **kein** Abfrageteil, seit der Betreiber den langen
Link bemaengelt hat), der **Ankunftswunsch** muss danach im Speicher liegen (sonst zeigt die Welt die
zuletzt gespeicherte Ansicht — der Bild-Befund), der **Pfad** wird gegengeprueft gegen die Quelle des
Auslieferers (`packages/web/world-static`), und der **Name des Wunsches** muss mit der Quelle der Welt
uebereinstimmen (`apps/universe/src/entry.ts` wird dafuer **gelesen** — eine Umbenennung dort faellt
hier rot aus). Und die letzte Zeile ist die, die im Betrieb zaehlt: beim Aufruf von `apply` steht die
Seitenleiste des Kerns meist **noch nicht** — die Pruefung stellt das her, sieht nach, dass **nichts**
beschriftet wird und der Beobachter angemeldet ist, laesst die Marke erscheinen und verlangt, dass die
Beschriftung **nachkommt** und der Beobachter sich **abmeldet**.

**Der Lauf des Rechners** (`bun scripts/start.mjs --no-go --port 3081`, Host und Welt zusammen):

| Anfrage | Antwort |
|---|---|
| `GET /` ohne Token | **303** → `/anmeldung/` — die Anmeldung kommt also **zuerst** |
| `GET /anmeldung/` | **200** — ohne Keks fuehrt `GET /` **303** dorthin |
| `GET /?token=…` | **303**, setzt **1** Keks |
| `GET /` mit Keks | **200**, 37 290 B, `__DSH_BOOT__` enthalten |
| Startliste des Browsers | enthaelt `@prometheus-harness/client-world-switch/client.js` (rev `4844855b46e9`) |
| Buendel des Umschalters | `plugins/??…/client.js` → **200**, 6076 B: `WORLD_PATH = "/universe"`, `ARRIVAL_KEY = "pmh.world.arrival"` — **kein** `ansicht`, **kein** `searchParams` |
| Welt unter dem kurzen Ziel | `GET /universe/` → **200** (HTML 0,87 kB, JS 688,1 kB, CSS 45,7 kB) — siehe [welt-ein-port.md](welt-ein-port.md) |
| Gebaute Welt | `dist/assets/index-W-NWrDuT.js` enthaelt `pmh.world.arrival` **1×** und **kein** `ansicht=` |

### 3.1 Der Fehler, den erst der Start zeigte

Der erste Lauf meldete:

```
pmh: warning: 1 entry did not activate
pmh-client-world-switch (@prometheus-harness/client-world-switch): failed to import
```

**Ursache, gemessen:** das neue Arbeitsbereichs-Paket war noch **nicht verlinkt** —
`node_modules/@prometheus-harness/` enthielt keinen Eintrag `client-world-switch`. Ein
`bun install` legt ihn an (`bun.lock` 233 403 → **233 663** B und fuehrt
`packages/client/world-switch`), danach startet der Host ohne Warnung. **Das ist kein Fehler der
Sache, sondern eine Stufe der Einrichtung** — sie steht hier, weil ein neues Paket in diesem
Arbeitsbereich **immer** einen `bun install` braucht und die Meldung sonst wie ein Codefehler
aussieht.

**Und ein Windows-Fallstrick, der schon im Dateikopf von `start.mjs` steht:** `bun run start`
scheitert auf diesem Rechner, weil der aeussere Aufruf `bun` ueber den PATH aufloest und dort ein
fremdarchigtes Paket trifft (*„ist mit der ausgeführten Windows-Version nicht kompatibel"*).
Verlaesslich ist der direkte Aufruf der **laufenden** Bun-Binaerdatei:

```powershell
# Der Pfad kommt aus der Umgebung, nicht aus diesem Dokument — er gilt auf jedem Rechner.
$BUN = "$env:USERPROFILE\.bun\bin\bun.exe"
& $BUN scripts/start.mjs --no-go --port 3081
```

### 3.2 Die Falle im Pruefstand, die drei Anlaeufe gekostet hat

**Gemessen:** alle Testdateien des Prototyps teilen sich **eine** Ausgabe des Moduls `dom-stub.ts`
(die Kennung ist in jeder Datei dieselbe). Es gibt also **ein** `document_`, **einen** Ort und
**einen** Import von `main.ts` — naemlich in der Datei, die zuerst bootet.

Folge: der Fall „die Huelle wird **mit** Herkunft geladen" und der Fall „**ohne**" lassen sich nicht
als zwei Testdateien bauen; die eine faerbt die andere. Genau das passierte (fuenf rote Pruefungen,
dreimal identisch, jede Datei **allein** gruen).

**Die Antwort darauf** ist keine Kruecke im Test, sondern eine Eigenschaft des Codes: die Marke liest
das Ziel **beim Klick** (`chatZiel()` in `main.ts` → `chatUrl(location.origin)`) statt beim Laden.
Damit ist der Fall im Test herstellbar — `switch.test.ts` setzt `location.origin` unmittelbar vor dem
Klick, `aktiviereGeruest()` setzt ihn zu Beginn jeder Pruefung auf `''` zurueck —, und im Betrieb ist
es dasselbe Verhalten, weil sich die Herkunft ohne Neuladen nicht aendert. *Eine Pruefung, die eine
zweite Modulausgabe braucht, ist ein Hinweis auf den Code, nicht auf den Test.*

**Und der Ankunftswunsch ist genau deshalb im `localStorage` statt in der Adresse.** Die Ansicht, die
beim Ankommen gilt, wird **im Chat** entschieden (beim Klick) und **in der Welt** gelesen (beim Start)
— zwei Dokumente, zwei Zeitpunkte. Eine Adresse haette das getragen und den Link lang gemacht; ein
**einmalig verbrauchter** Vermerk im gemeinsamen Speicher traegt es genauso und bleibt unsichtbar
(`takeArrival`, siehe §1a).

### 3.3 Zwei Attrappen im Stub, die Logik verdeckt haben

Beim Nachziehen der Insel-Verknuepfung fielen **zwei** Stellen auf, an denen der Test-Stub nicht
dasselbe tat wie ein Browser — beide sind jetzt behoben, und beide waren echte Befunde:

| Attrappe | Wirkung im Test | Behebung |
|---|---|---|
| `remove()` setzte nur ein Kennzeichen; der Knoten blieb im Baum | Die Insel baut sich bei jedem Oeffnen und jedem Ansichtswechsel neu (`isl.querySelector('.full')?.remove()` und danach anhaengen). **Zwanzig Aufbauten = zwanzig Staende im Baum**, und eine Suche fand den **ersten**, also den veralteten — der Test las „Chat", obwohl der Aufbau „Prometheus-Chat" gebaut hatte | `remove()` traegt sich beim Elternteil aus (wie das DOM). Der Beleg: die Zahl der `.full`-Knoten ist danach **1** statt **13** |
| `className` und `classList` waren **zwei** Felder | `element.className = 'full'` aenderte die `classList` **nicht** — und `querySelector('.full')` fand nichts. Damit lief die **Aufraeum-Logik der Insel im Test ins Leere**, obwohl sie im Browser aufraeumt | `className` ist jetzt ein Zugriff auf dieselbe Klassenmenge (`get`/`set` ueber `classList`) |

*Merksatz:* **ein Stub, der zwei Wahrheiten ueber dieselbe Sache fuehrt, verdeckt genau die Logik,
die man pruefen will.** Beide Faelle sahen zunaechst wie Fehler im Test aus — sie waren Fehler im
Pruefstand.

---

## 4. Was **nicht** gemessen ist — offen und benannt

1. **Kein *Chrome* auf diesem Rechner.** `chrome-devtools` meldet *„Could not find Google Chrome
   executable"*. Der Weg **aus** der Welt heraus ist deshalb an ausgeführten Modulen mit
   mitgeschriebenem Dokument geprueft (Abschnitt 3) — nicht an einer echten Seite mit echtem
   Mauszeiger.
   **Nachtrag 15.10.2026: ein Browser ist trotzdem da — Brave.** Er ist ein Chromium, und
   `apps/universe/tools/shot.js` nimmt ihn **ohne eine Zeile Änderung**, wenn man ihn mit
   `--headless=new --remote-debugging-port=9223` startet. Damit gibt es echte Bildschirmfotos der Welt
   und der Insel (siehe [zeichen.md](zeichen.md), samt der Messungen, die daraus entstanden sind:
   Zeilenhöhen, Zellbreiten, Textknoten). **Was weiter fehlt, ist der Klick auf die Marke im
   Harness-Chat** — dafür braucht es ein angemeldetes Fenster mit dem Token, und das ist eine eigene
   Messung (und steht noch aus).
2. **Die eingeklappte Seitenleiste.** Ist sie zum Streifen geschrumpft, ist das Logo dort der
   **Ausklapp-Knopf** (Klassenteil `_railMark`, **nicht** `_brandIdentity`). Der Umschalter greift
   dort absichtlich **nicht** — sonst kaeme man nicht mehr an die Leiste.
3. **Die Kopfzeile ist abschaltbar.** Die Einstellung `interface.hud` blendet sie aus — mit ihr den
   Umschalter der Welt. Der Insel-Eintrag `Chat` bleibt dann der einzige Weg.
4. **Der Umschalter kennt keinen Raum.** Er schickt in den **Standardraum** der Welt (`?room=`
   fehlt). Wer je Raum arbeitet, braucht einen Raum-Zusatz — der Ankunftswunsch ist davon
   **unabhaengig** (er gehoert dem naechsten Oeffnen, nicht einem Raum, und wird beim Lesen
   verbraucht). Ein offener Punkt, kein Versehen.
5. **Die Beschriftung folgt dem Dokument, nicht dem Sprachdienst des Kerns.**
   `packages/client/world-switch/src/index.ts` liest `<html lang>` mit Rueckfall auf
   `navigator.language`; `ctx.locale` waere genauer und ist hier bewusst nicht benutzt.
6. **Die Welt ist ein Bauergebnis, kein Entwicklungsserver.** Seit dem Umzug auf **einen** Port gibt
   es keinen Vite-Server mehr im Betrieb: `scripts/start.mjs` baut die Welt, der Host liefert
   `apps/universe/dist` aus. Der Preis, offen benannt: **Änderungen wirken erst nach einem Bau** —
   deshalb wird bei jedem Start gebaut. Wer den Vite-Entwicklungsserver zurückwill, bekommt einen
   zweiten Port zurück, also genau das, was hier abgeschafft wurde.
7. **Der Chat der Welt ist weiter ein Platzhalter.** Der Betreiber hat das so gewollt: *„Der chat
   funktion ect ist noch nicht angebunden vom Bild. das mach ich spaeter."* Seit dem 14.10.2026
   fuehrt die Marke deshalb **am** Platzhalter vorbei in den echten Chat — und der Platzhalter bleibt
   ueber die Insel erreichbar.
8. **`apps/web` bleibt unveraendert.** Kein Pixel daran wurde angefasst; der Umschalter der Welt
   sitzt in `apps/universe`.
9. **Der Ankunftswunsch ist nicht gemessen — nur berechnet und ausgefuehrt.** Ohne Browser gibt es
   keinen Klick mit echter Maus und keinen echten `localStorage`. Gemessen ist die **Kette** in zwei
   Teilen: das gebaute Buendel des Chats **schreibt** `pmh.world.arrival = 'os'` (ausgefuehrt, siehe
   §3), und `takeArrival` **liest und entfernt** ihn (9 Faelle in `tests/entry.test.ts`, darunter ein
   gesperrter Speicher). Beide nennen denselben Schluessel — gegengeprueft **gegen die Quelle**, nicht
   gegen eine Kopie. Was fehlt, ist der Griff dazwischen: ein echter Klick im Browser, der beides
   verbindet.

---

## 5. Wie man es nachfaehrt

```powershell
# Der laufende Bun. Auf diesem Rechner stehen zwei defekte bun-Eintraege im PATH
# (siehe den Dateikopf von `scripts/start.mjs`) — deshalb der Weg ueber die Umgebung.
$BUN = "$env:USERPROFILE\.bun\bin\bun.exe"

# 1. Alles starten (Host + Welt). Ohne --no-go kommen die Go-Dienste dazu.
#    → gibt zwei Adressen aus: die Oberflaeche (mit Token) und die Welt.
& $BUN scripts/start.mjs --no-go --port 3081

# 2. Die Welt pruefen (sie liegt in apps/universe)
cd apps\universe ; & $BUN test
cd apps\universe ; & $BUN run typecheck

# 3. Das Buendel des Chats pruefen (baut und fuehrt es aus)
& $BUN scripts/client-buendel.mjs --paket packages/client/world-switch

# 4. Den Auslieferer der Welt pruefen
cd packages\web\world-static ; & $BUN test

# 5. Den Typlauf ueber alle Pakete
& $BUN scripts/typecheck.mjs
```

**Und der Griff, den nur ein Browser zeigen kann:** die Adresse mit Token oeffnen, dann im Chat
**oben links** auf die Marke klicken. Erwartet: die Adreßzeile zeigt `http://127.0.0.1:3081/universe/`
— **kurz, ohne Zusaetze** — und die Welt erscheint (nicht der Platzhalter). Dort dann `◆ PROMETHEUS`
oder der Insel-Eintrag `▤ Prometheus-Chat`: zurueck im echten Chat. `⟲ Ansicht zuruecksetzen` setzt
die **Kamera** zurueck und bleibt in der Welt.

