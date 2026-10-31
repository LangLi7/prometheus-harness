# Pfade statt Abfragen — warum `?w` scheitert und was stattdessen gilt

Stand: 28.10.2026.

## Der Anlaß

Der Betreiber hat zwei Dinge gemeldet, die dieselbe Ursache haben:

> „ist kapput mit tab versuchen zu öffnen, es kommt und verschwindet sich wieder"

> „was ich da sehe ist eine tonne: `http://127.0.0.1:3080/?w`?"

Beides betrifft `packages/client/tabs` — die Fläche „Workspaces", die ich über eine **Abfrage**
adressiert habe (`?w`, `?s=<Sitzung>`).

## Gemessen

| Prüfung | Ergebnis |
|---|---|
| `GET /` | **303** nach `/anmeldung/` (ohne Sitzung), mit Sitzung **200** |
| `GET /c/abc`, `GET /w/xyz`, `GET /irgendwas` | **404** |
| Die Anmeldeschranke | umschließt in `packages/api/auth-http/src/access.ts` genau **einen** Pfad |

Daraus hatte ich geschlossen: „mehr Pfad geht nicht, also Query". **Das war der falsche Schluß.**
Richtig ist, den Wirt die Pfade ausliefern zu lassen — die Abfrage verbiegt die Adresse, statt sie
zu benutzen.

## Was am Öffnen im neuen Tab kaputtgeht

**Nicht im Browser gemessen** (die Oberfläche verlangt eine Anmeldung, die ich nicht angelegt habe).
Was aus dem Code folgt:

Beim Start eines Tabs stellen **zwei** Stellen dieselbe Fläche her: der Kern stellt seine gemerkte
Ansicht wieder her (`retainedBy.mainView`), und `installAdresse` in `src/index.tsx` stellt
`?w`/`?s` her, mit einem Nachlauf (`nachsehen`), der ein paar Mal nachfaßt. Beide schreiben in
denselben Zustand; wer zuletzt schreibt, gewinnt. Für den Menschen sieht das aus wie: die Ansicht
kommt und verschwindet wieder.

**Das ist kein Fehler, den man an einer Zeile reparieren kann** — es ist der Beweis, daß die
Adresse nicht die Wahrheit ist. Solange zwei Wiederhersteller existieren, gibt es kein
„zurückkommen in genau diesen Chat".

## Was gilt

1. **`client-tabs` ist aus dem Profil ausgetragen** (`scripts/profile-patch.mjs`). Die Fläche
   erscheint nicht mehr; nichts flackert. Der Code bleibt im Baum, samt Prüfungen und dieser
   Begründung.
2. **Die Adresse ist ein Pfad, kein Anhängsel.** Der Wirt liefert die gebaute Hülle für
   `/c/<Sitzung>` und `/w` aus — hinter derselben Sitzungsprüfung wie `/`. Jede Zeile wird ein
   echtes `<a href="/c/…">`. Der Client liest `location.pathname`; es gibt **einen** Wiederhersteller.
3. **Die Abfrage bleibt höchstens als Alias** für alte Lesezeichen, und sie schreibt auf den Pfad um.

## Abnahmekriterien für den nächsten Schnitt

- `GET /c/<Sitzung>` liefert die Hülle (kein 404), auch nach einem Neustart des Wirts.
- Ein Chat ist in **zwei** Tabs gleichzeitig offen, jeder mit **seinem** Chat; ein Reload bringt
  denselben Chat zurück, ohne Flackern.
- Jede Sitzungszeile ist ein `<a href>`, damit das Kontextmenü des Browsers „In neuem Tab öffnen"
  anbietet — ohne eigenes Menü.
- `?w`/`?s=` leiten auf `/w` bzw. `/c/…` um (ein Alias, kein zweiter Weg).

## Was gemessen wurde — und was daraus gebaut ist

Die offene Frage ist beantwortet, und zwar an der Quelle:

| Frage | Antwort (gemessen) |
|---|---|
| Wer hält den Fallback? | `dsh-host-frontend-static` — **ein** Sitz, vergeben |
| Gibt er unbekannten Pfaden die Hülle? | **Nein.** „missing or non-file paths return 404", und ausdrücklich: *„Pathname routing is explicit … no History API pathname routes. Adding one requires an explicit server rule."* |
| Wie löst der Wirt Routen auf? | exakt → **längster Prefix** → Fallback; ein Prefix `/c` trifft `/c` und `/c/<Sitzung>`, aber **nicht** `/config` (`lib/index.js:472`) |
| Wie entsteht der Index-Body? | `renderIndex(html)` am Dienst `WebServer` (`renderIndex(html: string): string`) — ohne ihn fehlt der Boot-Manifest |
| Warum reicht `serveStatic` nicht? | Es liefert **nur** Wurzel und `distIndex`; jeder andere Pfad ist bei ihm 404 |
| Wo liegt der Bau? | `join(dirname(require.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist', 'index.html')` — im Baum `apps/web/dist/index.html` |
| Was lädt die Hülle? | relativ: `<link href="./assets/…">` — deshalb setzt der SPA-Server `<base href="./">`; unter `/c/x` **muß** es `<base href="/">` sein, sonst sucht der Browser `/c/assets/…` |

**Gebaut** (`packages/api/auth-http/src/huelle.ts`):

- Prefix-Weg `/c`, exakter Weg `/w`; sie gewinnen vor dem Fallback.
- Anmeldung: **nur** eine echte Sitzung (der Sitzungskeks, geprüft über `verifySession`) — die
  zweite Tür (Loopback, nur lesend) gilt hier **nicht**, weil die Hülle die ganze Anwendung ist.
- Index durch `renderIndex`, Basis absolut eingesetzt (`mitWurzelBasis`, ein vorhandenes `<base>`
  bleibt unangetastet).

**Geprüft** (`tests/huelle.test.ts`, 7 Prüfungen): die Wege existieren als `prefix:/c` und
`exact:/w`; ohne Sitzung **303** auf `PFAD_ANMELDUNG` (nicht 404, kein Körper); das Basis-Tag sitzt
absolut hinter `<head>`; ein vorhandenes Basis-Tag wird nicht verdoppelt; der Bau ist auflösbar und
lädt `./assets/…`. Dazu Typlauf des Pakets und **94 Pakete grün** im Projekt.

## Die Client-Hälfte (Runde 2)

`packages/client/tabs/src/adresse.ts` ist **neu geschrieben** — Pfade statt Abfragen:

| Adresse | Was erscheint |
|---|---|
| `/` | der Chat, den der Kern wiederherstellt |
| `/c/<Sitzung>` | genau dieser Chat |
| `/w` | die Übersicht |
| `?s=…`, `?w` | **Alias**: beim Start auf den Pfad umgeschrieben und dabei `replaceState` |

`installAdresse` in `src/index.tsx` ist dabei **kürzer** geworden: kein `nachsehen`-Nachlauf, keine
Zeitgeber, kein dreifaches `openSession` mehr. Es gibt jetzt genau einen Weg: Pfad lesen → einmal
öffnen → danach folgt die Adresse der Oberfläche. Genau der Nachlauf war der Kandidat für „kommt
und verschwindet wieder" (nicht im Browser gemessen, aber der Verdacht ist damit aus dem Code).

**Geprüft** (`bun test packages/client/tabs`): **33 pass · 0 fail**, darunter acht neue Fälle der
Adreßform: Kodierung im Pfad, `/w` und `/w/`, `/c/x` und `/c/` und `/c`, fremde Pfade
(`/anmeldung`, `/universe/…`), kaputte Prozentkodierung, Alias-Übersetzung inklusive „`w` gewinnt",
`hrefFor`, `gleichesZiel`. Dazu der Bündelprüfer (`chatHref('a b') = /c/a%20b`, `parsePfad`,
`aliasZiel`) und **94 Pakete grün**.

**Nicht geprüft:** der Weg im **laufenden** Wirt (der Prozeß trägt diese Sitzung; ein Neustart ist
nötig, und beide Hälften müssen zusammen starten — das neue Bündel schreibt `/c/…`, der alte Prozeß
antwortet dort mit 404), der glückliche Aufruf **mit** Sitzung (bräuchte ein Konto) und das
Verhalten im echten Browser. Die Sitzungszeilen sind weiterhin Knöpfe des Kerns — echte `<a href>`
an jeder Zeile kommen erst mit der übernommenen Seitenleiste; bis dahin bietet der Rechtsklick des
Pakets den Link an.

## Der Riegel gegen das stille Wegfallen

`huelleInhalt` ist aus dem Weg **ausgelagert**, damit genau eine Reihenfolge prüfbar ist:
`readFile` → `renderIndex` → `<base href="/">`. Zwei Prüfungen halten sie: der Renderer bekommt den
**rohen** Index (nicht den schon basierten) und seine Ausgabe steht im Körper; ohne Dienst bleibt
der Index unverändert, die Basis kommt trotzdem. Fällt `renderIndex` bei einem Paket-Update weg,
wird eine der beiden Prüfungen rot — und nicht die Seite still leer.

## Der Anker für echte Zeilen-Links (gemessen, noch nicht gebaut)

Die Sitzungszeile liegt in `node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js`,
Funktion `SessionNodeItem`:

- **Zeile ~2249:** `anchor: jsxs("div", { ref, "data-row-key": "session:<id>", role: "treeitem", onClick: … })`
  — **hier** müßte ein `<a href="/c/<id>">` stehen (ein `div` hat kein Ziel, deshalb bietet der
  Browser dort kein „In neuem Tab öffnen" an).
- **Zeile ~2319:** `renderSlot("sidebar.workspaces.session.menu.item", …, { hookContext: menuOpenState })`
  — die Sitzungsmenüs werden **in diesem Bauteil** gerendert. Wer den Browser-Eintrag ersetzt,
  verliert sie samt Anpinnen, Umbenennen, Fork und Archivieren; ihre Handlungen sind Verschlüsse
  dieses Pakets und nicht von außen erreichbar.

Damit ist die Wahl klar umrissen: ein Eingriff in **eine** Zeile dieser Fremddatei (mit
`bun patch` und einem Wächtertest) oder ein Neubau des Browsers, der die vier Aktionen zuerst
verliert. Bis dahin bleiben die Zeilen Knöpfe, und der Rechtsklick dieses Pakets ist der Behelf.

## Der Patch an der Seitenleiste (28.10.2026)

Der Kern bietet für die Projektzeile keine Naht („Workspace row menus are visual-only except
Rename/Delete"), und eine Sitzungszeile ist ein `<div role="treeitem">` — ein `div` hat im Browser
kein Ziel, deshalb gab es dort kein „In neuem Tab öffnen". Deshalb wird
`node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` gepatcht, an **drei** Stellen in
**einer** Datei:

| Stelle | Vorher | Nachher |
|---|---|---|
| `SessionNodeItem`, Anker der Zeile | `<div role="treeitem">` | `<a href="/c/<Sitzung>">` |
| `SessionNodeItem`, `onClick` | `() => { onOpen(...) }` | `(e) => { if (Zusatztaste) return; e.preventDefault(); onOpen(...) }` |
| Projektmenü | „Umbenennen", „Löschen" | dazu „Quellordner…" → Ereignis `pmh:quellordner` |

**Der Menüposten navigiert nicht.** Er löst `pmh:quellordner` mit `{ workspaceId }` aus; der Dialog
in `packages/client/source-folders` hört darauf und öffnet sich für diesen Arbeitsbereich. Ein Weg
über die Adresse hinge an einer Seite, die der Wirt erst nach einem Neustart ausliefert.

**Warum genau so und nicht als Neubau des Browsers:** ein eigener Eintrag in
`sidebar.workspaces` ersetzt das Bauteil — und mit ihm Suche, Ziehen, Archiv-Filter, Hover-Karten
und die Sitzungsmenüs, deren Handlungen Verschlüsse dieses Pakets sind. Der Patch ändert drei
Zeilen und läßt alles andere stehen.

**Der Riegel:** `scripts/tests/zeilen-patch.test.mjs` liest den **installierten** Stand und bricht,
wenn der Anker fehlt, der Menüposten fehlt, der Patch mehr als drei Hunkes hat oder die Fassung in
`patchedDependencies` nicht mehr stimmt. Der Patch wird **erzeugt**, nicht getippt:
`.pmh-build/mache-patch.mjs` leitet die Hunkes aus der Datei ab (Einrückung ist Tabulator-genau).

**Rückweg:** `patchedDependencies` aus `package.json` entfernen, `patches/…patch` löschen,
`bun install`.

**Was der Patch ändert, ohne daß man es erwartet:** Sitzungszeilen sind fokussierbar (Tab) — `div`s
waren es nicht; ein Anker ist von Haus aus ziehbar, deshalb kann Ziehen einer Zeile als Link-Zug
beginnen; das frühere eigene Rechtsklick-Menü dieses Pakets ist entfallen, weil der Browser sein
eigenes mit „In neuem Tab öffnen" anbietet.
