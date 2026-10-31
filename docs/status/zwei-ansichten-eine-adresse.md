# Zwei Ansichten, eine Adresse — Workspaces und Chat in eigenen Tabs

> ## ÜBERHOLT — die Adresse ist seit dem 28.10.2026 ein Pfad
>
> Dieses Papier begründet eine Entscheidung, die **zurückgenommen** ist: die Adresse lag hier in
> einer **Abfrage** (`?w`, `?s=…`), weil der Wirt gemessen nur `/` ausliefert. Der Schluß war falsch
> — gemessen fehlte dem Wirt die **Regel** (`Pathname routing is explicit … adding one requires an
> explicit server rule`), nicht die Möglichkeit.
>
> Es gilt **[pfade-statt-abfragen.md](pfade-statt-abfragen.md)**: Pfade `/c/<Sitzung>` und `/w`,
> ausgeliefert von `packages/api/auth-http/src/huelle.ts`, gelesen vom Client aus
> `location.pathname`; `?w`/`?s=` sind nur noch Alias.
>
> Warum der alte Weg abgelöst wurde, steht dort ebenfalls: beim Öffnen in einem neuen Tab standen
> zwei Wiederhersteller gegeneinander, und die Ansicht erschien und verschwand wieder. Dieses Papier
> bleibt als Beleg für die Messungen (Routenlage, `retainedBy.mainView`, Bau und Prüfungen des
> Pakets) und für die Begründung, die sich als Irrtum erwiesen hat.

> **Stand:** 28.10.2026 · **Auftrag:** *„erstelle mir die möglichkeit das ich beim prometheus quasi 2
> dinge enthalten: `http://127.0.0.1:3080/` workspaces & chat — damit man es auch zb in neue tab
> öffnen kann und multi task ermöglicht"* — und, auf die Rückfrage nach der Form:
> *„Workspaces-Seite + Chat + Deep-Links"*.
>
> **Was hier belegt wird:** warum die Adresse eine **Abfrage** ist und kein Pfad; was gebaut ist;
> was gemessen ist — und was **nicht**.

---

## 1. Der Befund vor dem Bau

Die Oberfläche hatte **keine Adresse für ihren Zustand**. Chat, Sitzung, Panel — alles lag im
Speicher des Tabs. Daraus folgen genau die zwei Dinge, die der Auftrag nennt:

| Was fehlte | Was daraus folgte |
|---|---|
| Eine Adresse **je Chat** | „Diesen Chat in einem zweiten Tab öffnen" war nicht möglich — es gab nichts zu öffnen. Ein neuer Tab kam immer auf dem wiederhergestellten Chat heraus. |
| Eine Fläche **neben** dem Chat | Wer Arbeitsbereiche vergleichen wollte, sah immer die Seitenleiste **und** den Chat — nie nur die Übersicht. |

Gemessen am laufenden Rechner (`Invoke-WebRequest`, 28.10.2026):

| Anfrage | Antwort |
|---|---|
| `GET /` | **303** → `/anmeldung/` (ohne Sitzungskeks) |
| `GET /anmeldung/` | **200** |
| `GET /irgendwas` | **404** |
| `GET /c/abc` | **404** |
| `GET /w/xyz` | **404** |

Der letzte Block ist der Grund für die Bauform: **der Wirt beantwortet nur `/`**. Ein Pfad wie `/w`
müßte ein eigener Weg sein — und der läge **neben** der Sperre, die
`packages/api/auth-http/src/access.ts` um `/` legt. Diese Sperre biegt die 401-Antwort des Kerns auf
die Anmeldeseite um; ein zweiter Weg hätte eine zweite Bewachung gebraucht.

---

## 2. Die Entscheidung: die Abfrage sagt, was gezeigt wird

| Adresse | Was erscheint |
|---|---|
| `http://127.0.0.1:3080/` | der Chat (wie bisher) |
| `http://127.0.0.1:3080/?s=<Sitzung>` | **genau dieser** Chat |
| `http://127.0.0.1:3080/?w` | die Workspaces |

Die Abfrage ändert den **Weg** nicht — `/` bleibt der eine Weg mit seiner einen Sperre, und der
Anmeldetricht erbt die Abfrage nicht anders als vorher. Das ist der ganze Grund für diese Form.

**`?w` ohne Wert**, weil der Betreiber über lange Links schon einmal geschimpft hat
(*„der link ist nur zu lange so lol"*, 15.10.2026, siehe
[umschalter-marke.md](umschalter-marke.md)) und weil `URLSearchParams.has('w')` auch `?w=1` liest.

---

## 3. Was gebaut ist

Ein neues Client-Plugin, `packages/client/tabs` (`@prometheus-harness/client-tabs`), mit **drei
Teilen**, die zusammengehören:

| Teil | Ort | Was es tut |
|---|---|---|
| **Das Panel `workspaces`** | `src/index.tsx` (`WorkspacesPanel`), `main:workspaces` | jeder Arbeitsbereich mit seinen Sitzungen; **jede Sitzung ein echter Link** (`<a href="?s=…">`), dazu „Neuer Chat" je Bereich |
| **Der Adreßabgleich** | `src/index.tsx` (`installAdresse`), `src/adresse.ts` | liest `?w`/`?s=` beim Start, schreibt die Adresse bei jedem Wechsel, wendet sie bei `popstate` wieder an |
| **Der Menüeintrag** | `src/index.tsx` (`OpenInNewTabRow`) in `sidebar.workspaces.session.menu.item` | „In neuem Tab öffnen" an jeder Sitzungszeile der Seitenleiste — ebenfalls ein Link |
| **Der Rechtsklick** | `src/kontext.ts`, `src/kontextmenue.ts` | ein eigenes Menü auf Sitzungs- und Arbeitsbereichszeilen — der **einzige** Weg zu einem echten „In neuem Tab öffnen" auf einem Knopf (§3a) |

Eingetragen in `scripts/profile-patch.mjs` (eine Zeile, mit Begründung im Kommentar). Der
Sidebar-Eintrag `sidebar.panellist:workspaces` (Ordnung 20, hinter der Welt mit 10) macht die
Fläche auch ohne Adresse erreichbar.

**Warum Links und nicht Knöpfe.** Ein `<a href>` versteht jeder Browser mit Strg-Klick, Mittelklick
und „In neuem Tab öffnen". Ein `onClick` mit `pushState` sieht gleich aus und kann genau das nicht.
Der **einfache** linke Klick wird abgefangen (`istEinfacherKlick`, dieselbe Regel wie im
Welt-Umschalter) und im selben Tab geöffnet; alle schweren Klicks bleiben dem Browser.

**Warum der zweite Tab wirklich unabhängig ist.** Die Auswahl einer Sitzung liegt **nicht** im
`localStorage` — sie ist eine Referenz im Speicher des Tabs. Zwei Tabs störten sich also nie *live*.
Gestört hat der **Reload**: beide kamen mit derselben wiederhergestellten Sitzung zurück. Mit der
Adresse kommt jeder Tab als **der** Chat zurück, der in seiner Leiste steht.

**Die eine Ableitung, die nicht öffentlich ist.** Welche Sitzung der Hauptbereich hält, steht in
keinem Feld der Sitzungsliste; sichtbar ist nur der Haltungszähler (`retainedBy.mainView`). Dieselbe
Ableitung benutzt der Kern selbst für seine Tastenkürzel
(`node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js`, Zeile 106). Sie steht in
`src/lage.ts` — **defensiv gelesen** (fehlt der Zähler, gilt 0), damit eine künftige Fassung des
Kerns die Adresse höchstens stehenläßt, statt eine falsche zu schreiben.

---

## 3a. Der Rechtsklick — und warum er ein eigenes Menü braucht

**Der Befund (Betreiber, 28.10.2026, mit Bild):** *„problem ist mann kann es zb nicht wie im claude
code und oder andere ai agent wie Chatgpt neue tab öffnen beim rechtklick auf dem Chat &
Workspaces"*. Das Bild zeigt das **native Seitenmenü** — Zurück, Vorwärts, Neu laden, Speichern
unter…, Drucken…, Seitenquelltext anzeigen, Untersuchen. „In neuem Tab öffnen" fehlt.

**Die Ursache, am Code gemessen:**

| Fläche | Was sie im DOM ist | Wo |
|---|---|---|
| Panel-Eintrag der Seitenleiste | `<button type="button">` mit `onClick: () => selectPanel(id)` | `dsh-client-ui-sidebar/lib/client.js:186` |
| Sitzungszeile | `<div role="treeitem">` mit `onClick` | `dsh-client-ui-workspace/lib/client.js:2248` |

Ein Browser bietet „In neuem Tab öffnen" **nur für Elemente mit Ziel** (`<a href>`). Ein Knopf hat
keins. Deshalb gibt es auf diesen Zeilen keinen Weg dorthin — außer einem eigenen Menü.

**Die Naht, an der es hängt.** Die Zeilen tragen ein Merkmal, das der Kern selbst setzt:
`data-row-key="session:<Sitzung>"` und `workspace:<Schlüssel>` — er benutzt es für Ziehen und
Wiederherstellen. Unser Panelsymbol trägt `data-pmh-tabs-panel="workspaces"`. Daraus baut
`src/kontext.ts` die Entscheidung und `src/kontextmenue.ts` das Menü:

| Rechtsklick auf | Einträge |
|---|---|
| eine Sitzungszeile | **In neuem Tab öffnen** (`?s=<Sitzung>`, `target="_blank"`) · Hier öffnen |
| eine Arbeitsbereichszeile | **In neuem Tab öffnen** (`?w`) · Hier öffnen |
| unser Workspaces-Zeichen in der Panelleiste | **In neuem Tab öffnen** (`?w`) · Hier öffnen |
| alles andere — Text, Eingabefelder, fremde Menüs | das **native** Menü, unangetastet |

Der erste Eintrag ist ein echtes `<a href>`; deshalb bietet auch das Menü selbst noch einmal „Link
in neuem Tab öffnen" an — der Weg führt also doppelt ans Ziel.

**Grenzen, offen benannt:** auf genau diesen Zeilen ist das native Menü weg („Untersuchen" gibt es
dort nicht mehr); einen Tastaturweg (`Shift+F10`) gibt es nicht, weil der Fokus beim Knopf des
Kerns bleibt; Eingabefelder sind ausgenommen, damit Einfügen und Rechtschreibprüfung bleiben.

---

## 4. Was gemessen ist

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Prüfungen des Pakets | `bun test packages/client/tabs` | **29 pass · 0 fail**, 77 Zusicherungen, 5 Dateien |
| Typlauf | `node_modules/.bin/tsgo --noEmit -p packages/client/tabs/tsconfig.json` | **exit 0** (im Projektlauf: **92 Pakete grün, 0 rot**) |
| Bau + Formprüfung | `bun packages/client/tabs/build.mjs` | **exit 0**, `lib/client.js` **24 690 B**; Befund: Kennung `@prometheus-harness/client-tabs`, `inject: ["slots","locale","layout","sessions","uiWorkspace"]`, `PANEL_ID = workspaces`, `chatHref('a b') = ?s=a%20b`, `parseSearch('?w')` → Workspaces, dazu **Rechtsklick** (Zuhörer, Merkmal und Menüregel im Bündel) |
| Profilprüfung | `bun test scripts/tests/profile-patch.test.mjs` | **39 pass · 0 fail** (die neue Zeile bricht die Liste nicht) |
| Verknüpfung | `bun install` | **exit 0**, `node_modules/@prometheus-harness/client-tabs` vorhanden |

Die Prüfungen decken **fünf** Dinge ab, die jeweils einzeln hätten schiefgehen können:

1. **Die Form der Adresse** (`tests/adresse.test.ts`): Kodierung, `?w`, `?w=1`, `?s=`, leere Abfrage,
   beides gleichzeitig (die Übersicht gewinnt), und die Klickregel.
2. **Die Ableitung der gehaltenen Sitzung** (`tests/lage.test.ts`): fehlender Zähler, Zähler 0,
   kaputte Zeilen.
3. **Die Registrierungen und der Adreßabgleich** (`tests/plugin.test.ts`) an einem Kern, der
   mitschreibt: `?w` wählt das Panel, `?s=…` öffnet die Sitzung, ein Panelwechsel schreibt `?w`
   (erster Schreibvorgang **ersetzt**, jeder weitere **schiebt**), der Rückweg schreibt `?s=…`, und
   eine Seite außerhalb von `/` bleibt unberührt.
4. **Die Fläche selbst** (`tests/panel.test.tsx`, gerendert über `react-dom/server`): die
   Sitzungszeilen tragen `href="?s=ses_1"` und `href="?s=ses_2"`, der Titel steht da, eine leere
   Sitzung heißt „Neue Sitzung", ein leerer Bereich sagt das, und der Pfad steht als Kurzhinweis.
5. **Der Rechtsklick** (`tests/kontext.test.ts`): `liestZeile` liest `session:…` und `workspace:…`
   und läßt `empty`, `overflow:…` und Leeres liegen; `menue` baut für eine Sitzung `?s=…` und für
   einen Arbeitsbereich `?w`, mit „In neuem Tab öffnen" als **erstem**, einem **Link**; `deute`
   erkennt die Sitzungszeile am Merkmal des Kerns, die Panelleiste am eigenen Zeichen im Knopf — und
   gibt sonst `null` zurück, damit das native Menü bleibt.

---

## 5. Was **nicht** gemessen ist — und warum

| Nicht geprüft | Grund |
|---|---|
| **Der Klick im echten Browser** | Die Oberfläche verlangt eine Anmeldung (`GET /` → **303** nach `/anmeldung/`). Ein Konto anzulegen wäre eine Änderung an der Instanz des Betreibers, die niemand aufgetragen hat. Geprüft sind Bau, Typlauf, Tests und der Bündelprüfer — der letzte Griff am Bildschirm steht aus. |
| **Der laufende Host** | Der Host setzt sein Profil beim **Start** zusammen. Das neue Paket liegt bereit, aber der laufende Prozeß auf `:3080` kennt es nicht — bis zum Neustart von Prometheus erscheint weder der Sidebar-Eintrag noch `?w`. |
| **Das Aussehen des Menüeintrags** | Er ist ein `<a role="menuitem">` mit eigenem Stil (`.pmh-tabitem`), nicht der `MenuItemButton` des Kerns (der ein `<button>` ist). Der Strich, die Einrückung und der Abstand im Menü sind **angenähert**, nicht abgemessen. |
| **Das Kontextmenü im Betrieb** | Getestet ist die **Entscheidung** (`deute`, `liestZeile`, `menue`), nicht das Aufziehen: Position, Klemmen am Fensterrand, Schließen bei Klick/Escape/Scroll. Diese Wege brauchen ein echtes DOM; im Testbaum gibt es keins (kein `happy-dom`, kein `jsdom`). Sie sind der erste Punkt, den ein Blick im Browser prüfen sollte. |

---

## 6. Grenzen, offen benannt

- **Nur die zwei Ansichten haben eine Adresse.** Steht ein anderes Panel vorn (Welt, Git, Graphify),
  sagt die Adresse weiter `?s=<Sitzung>`; ein Reload landet dann im Chat statt im Panel. Ein
  `?p=<panel>` für alle Panels wäre der nächste Schritt — er ist **nicht** gebaut.
- **Eine unbekannte Sitzung in der Adresse bleibt still.** Kennt der Katalog die Kennung nicht,
  bleibt die Oberfläche, wo sie ist, und die Adresse schreibt sich auf das, was zu sehen ist. Ein
  Hinweis bräuchte einen eigenen Kanal (der Toast gehört `ui-workspace`) — bewußt nicht gebaut.
- **Die Workspaces-Fläche ist eine Liste, keine Verwaltung.** Kein Umbenennen, kein Ziehen, keine
  Suche, kein Ausblenden leerer Bereiche — das alles kann die Seitenleiste des Kerns schon, und zwei
  Wahrheiten für dieselbe Sache wären schlechter als eine.
- **Die Abfrage ist kein Lesezeichen für „mein Tab".** Zwei Tabs mit derselben Adresse sind derselbe
  Chat; die Unabhängigkeit entsteht dadurch, daß jeder Tab **seine** Adresse schreibt.
