# Die Plugin-Installationsliste — was aus dem DeepSeek Harness nach Prometheus kommt

Stand: **19.10.2026.** Alle Zahlen dieses Blattes sind gemessen; jede Zeile nennt die Datei und die
Zeile, an der sie steht. Was nicht gemessen ist, steht unter „Offen" und **nicht** im Befund.

**Der Gegenstand in einem Satz:** fünf Fähigkeiten, die in der laufenden DSH-Oberfläche sichtbar
sind — Kosten/Budget, Crew, Bildbrücke, Suche und Abruf, dazu die Nutzertrennung — und für jede:
was Prometheus **schon hat**, was **fehlt**, an welcher Stelle sie eingetragen wird, und mit welchem
Befehl man das Ergebnis nachprüft.

---

## 1. Die fünf Fähigkeiten auf einen Blick

| # | Fähigkeit | Quelle (gemessen) | In Prometheus | Nächster Zug |
|---|---|---|---|---|
| 1 | **Kosten & Budget** | `dsh-usage-budget` 1.0.0, privates Paket im Profil | **Token** ja, **Preise** ja — Multiplikation (`usage-budget`) und Zuordnung/Kasse (`usage-recorder`) **gebaut** | Haken im Modellstrom + Anzeige |
| 2 | **Crew** (Planen, Ausführen, Prüfen, Bild, Suche) | `dsh-llm-crew` 0.1.1-rc.2 (5 517 Z. Quelle) + `dsh-client-ui-settings-crew` (1 430 Z.) | **Vier Pakete gebaut:** `crew/plan` (58), `crew/crew-provider` (32), `crew/crew-core-adapter` (10, **Kern-Seam mit Bildrouting**), `crew/crew-plugin` (19, **im Host eingehängt und gemessen**) | Einstellung für Crews/Nutzer (heute Datei), dann Karte |
| 3 | **Bildbrücke** (modlens) | `@liustack/modlens` 3.20.0 | **Werkzeug gebaut** (`packages/vision/modlens`, 14 Prüfungen grün); doctor meldet `openai` bereit | Anmeldung im Host braucht einen Runner im Code (§6) |
| 4 | **Suche & Abruf** | `dsh-web-search-deepseek` 0.1.1-rc.2 + neue `/v1/tools/`-API | **Direkter Weg gebaut** (`packages/web/deepseek-search-tools`, 19 Prüfungen grün) und mit **zwei** Anfragen (0,0015 USD) gemessen | Betreiber entscheidet die Umstellung; einschalten per `suche` in der Konfiguration (§7) |
| 5 | **Nutzertrennung** | DSH: pro Rechner; Prometheus: `user_id` in der Datenbank | Datenbank ja, Planung **jetzt** über den Pfad | Nutzer in **jede** Ablage |

---

## 2. Woher die Zahlen kommen — drei Orte, nicht einer

| Ort | Was dort liegt | Beleg |
|---|---|---|
| `C:\Users\Chang\.dsh\profiles\web\package.json` | die **laufende** Zusammensetzung: Bündel `dsh-base`, `dsh-web-app`, `@liustack/modlens` | Datei, `dsh.profile.bundles` |
| `C:\Users\Chang\.dsh\profiles\web\cordis.patch.yml` | drei **eingehängte** Zeilen: `dsh-i18n-de`, `dsh-usage-budget` (`:48-50`), `dsh-ponytail` | `:41-50` |
| `C:\Users\Chang\deepseek-harness` | der **Quelltext** von Crew und Netzsuche (Crew fehlt im laufenden Profil, ist dort aber gebaut) | `packages\llm\crew`, `packages\client\ui-settings-crew`, `packages\web\web-search-deepseek` |
| `C:\Users\Chang\prometheus-harness\node_modules\@deepseek-ai` | **265** Kernpakete, alle `0.2.1-alpha.2`, vorgebaut (257 ohne `src/`) | gemessen: `lib/` in 261 Paketen |
| `C:\Users\Chang\.dsh\usage-budget\usage.json` | **17 812** Datensätze, **5 835 545 B**, **108,8858 USD** | ausgewertet |

**Die Lehre aus dem Plugin-Vertrag gilt hier weiter:** die Nullen dieses Blattes sind Nullen über
einen **Suchraum**. Deshalb steht bei jedem „fehlt" der Befehl, der es gezeigt hat.

---

## 3. Was Prometheus schon hat (gemessen)

| Baustein | Paket | Beleg |
|---|---|---|
| Token-Zählung je Aufruf, mit Herkunft `reported`/`estimated`/`mixed` | `packages/llm/token-meter` | `src/index.ts:14-17`, `:281-297` |
| Preise je Familie und Modell, mit **Kostenart** (`kostenlos`/`kostenpflichtig`/`unbekannt`) | `packages/ai/tariffs` | `src/preis.ts:22`, `src/tarif.ts:13-18` |
| Rangfolge (unbekannter Preis sortiert **nach hinten**) | `packages/ai/ranking` | `src/index.ts:13-14` |
| Anbieter-Verzeichnis, das Preise **liest** | `packages/ai/provider-directory` | `packages/ai/provider-directory/tests/preise.test.ts:58-65` |
| Anbieter-Auswahl `waehle` (erst Mensch, dann Rang) | `packages/ai/router` | `src/index.ts` |
| OpenRouter-Zugang, `GET /api/ai/ranking` | `packages/ai/openrouter`, `packages/api/ai-ranking` | `profile-patch.mjs:556` |
| API-Schlüssel `pmh_<key_id>_<secret>`, HMAC, Pfeffer | `packages/auth/apikey` | `docs/status/api-schluessel.md` |
| Nutzer, Sitzungen, Mandantentrennung in der Datenbank | `packages/auth/*`, Migration 0004 | `docs/status/mandantentrennung.md` |
| Geheimnisse je Benutzer (Umschlag, AES-256-GCM) | `packages/auth/secrets` | `docs/decisions/schluessel-je-stueck-oder-je-benutzer.md` |

**Die eine Lücke, die zählt:** Token-Zahlen und Preis-Daten existieren, aber es gab **keine
Multiplikation**. Gemessen: `tokenMeter` kommt in **45** Stellen unter `packages/` vor — in
`token-meter`, `core/agent-loop`, `llm`, `llm-retry`, **keine** in `ai/tariffs`, `ai/ranking` oder
`api/ai-ranking`. Ein Geldbudget gab es nicht; `budget` heißt heute **Input-Token-Budget**.

**Seit dem 18.10.2026 geschlossen:** `packages/usage/usage-budget` rechnet Token × Tarif, führt
Budget und Warnschwellen **je Nutzer und je Schlüssel** und legt den Verbrauch unter
`<verzeichnis>/<nutzer>/usage.json` ab. **38 Prüfungen grün, 0 rot, 96 `expect`; Typprüfung
exit 0.** Was fehlt, ist die Naht (der Waterfall, der die Aufrufe meldet) und die Anzeige.

---

## 4. Fähigkeit 1 — Kosten & Budget (`dsh-usage-budget`)

**Was es kann.** Es hängt sich in den Waterfall `llm/stream` und liest den `usage`-Chunk jedes
Modellaufrufs (`lib/index.js:858`), preist ihn über models.dev (`lib/pricing.js`), ordnet ihn einer
**Credential-Ref** zu (`DEEPSEEK_API_KEY`, nie dem Schlüsselwert, `lib/usage.js:97-135`), holt
Guthaben bei DeepSeek und OpenRouter (`/user/balance`, `/api/v1/credits`) und zeigt alles als
Hover-Anzeige plus Seite „Usage".

| Größe | Zahl |
|---|---|
| Dateien / Bytes | **42** / **333 268** |
| Host-Kern (portabel) | `usage.js` 740, `pricing.js` 290, `import-export.js` 366 Z. |
| Klebeschicht (nicht portabel) | `index.js` 999, `client.js` 1 336 Z. |
| Abhängige Dienste | `llm/stream`, Settings-Namespace, `credentials.resolve`, `connection.rpc.handle` |
| Prüfungen | 3 `node:test`-Dateien, **63** Fälle |

**Was Prometheus hat:** siehe §3. **Was fehlt:** Nur noch die Naht und die Anzeige — der Rechenkern
ist gebaut (siehe unten).

**Gebaut am 18.10.2026 — `packages/usage/usage-budget`.** Token × Tarif über
`@prometheus-harness/tariffs`, Kostenart aus dem Tarif (`kostenlos`/`freibetrag`/`kostenpflichtig`/
`unbekannt`), Budget und Warnschwellen **je Gesamt, je Schlüssel und je Modell**, Ablage
`<verzeichnis>/<nutzer>/usage.json` (Grenze 20 000, älteste fallen), Zeitfenster und
Zusammenfassung. **38 Prüfungen grün, 0 rot, 96 `expect`; Typprüfung exit 0.** Zwei Entscheidungen
sind darin festgehalten: ein Aufruf **ohne** Tarif trägt `kosten: undefined` (nicht `0`), und eine
Grenze **meldet** (`ueberschritten`/`warnschwelle`), sie sperrt nicht — die Totstelle des Harness
(`budgetCheck` nie aufgerufen) wird nicht nachgebaut.

**Gebaut am 18.10.2026, zweiter Zug — `packages/usage/usage-recorder`.** Die **Zuordnung** fehlte
noch: welcher Nutzer, welcher Schlüsselname, welcher Zweck. Dieses Paket bildet aus einem Aufruf
einen `Verbrauch` (Route → Credential-Ref-Name, `reported`/`estimated`/`mixed` → Herkunft), preist
ihn und legt ihn ab — und liest das Konto eines Nutzers zurück (Stand je Schlüssel und Modell,
Zeitfenster, Zusammenfassung). **Damals 18 Prüfungen grün, 0 rot, 53 `expect`, Typprüfung exit 0**
— nach dem Zuwachs des messenden Anbieters sind es heute **26** (§12). Zwei
Grenzen sind darin benannt: ein unbekannter Routenname wird **nicht erfunden** (die Route ist dann
die Kennung), und ein Tarif, der später dazukommt, wirkt **rückwirkend** — weil `konto` die Token
neu preist und nicht die gespeicherten Kosten liest.

**Und der Haken ist da — `messenderAnbieter`.** Prometheus' Seam ist **nicht streamend**: eine
Methode, `LlmProvider.complete(request) → CompletionResult`, und die Antwort trägt ihre Token. Damit
braucht die Abrechnung **keinen** Eingriff in den Kern: eine Hülle ruft den echten Anbieter, liest
`usage`, preist und bucht. Drei Fälle sind geprüft: die Token kommen aus der **Antwort**, eine
Antwort **ohne** Token wird nicht gebucht und nicht verschwiegen (Meldung), und ein **Buchungsfehler
verhindert die Antwort nicht** (er geht an `melde`). Der Haken ist der einzige Teil dieser Fähigkeit,
der ohne Host **wirkt** — alles andere ist Rechnung.

**Die Reihenfolge der Hüllen ist bindend — gemessen am 18.10.2026 in der Zusammensetzungsprüfung.**
Der messende Anbieter gehört **um den echten Anbieter der Rolle**, nicht um die Crew-Hülle: außen
gebucht, steht als Route `crew:crew-1` im Datensatz, dafür gibt es keinen Tarif — vier Aufrufe, alle
**unbepreist**, und die Anzeige meldete 0 USD. Genau dieses Doppelzählen entfernt der Harness aus
seinen Daten (`dropCrewShells`, `index.js:233-236`). Der Fehler war **mein** Testaufbau; die Prüfung
hat ihn gefunden, nicht ich.

**Was noch fehlt (nächster Zug):** die **Host-Verdrahtung** von `messenderAnbieter` — welcher
Anbieter je Anfrage umhüllt wird, und wie die Sitzung zu `conversation_sessions.user_id` kommt. Der
Nutzer wird heute **hereingereicht**; das ist die offene Frage, nicht die Antwort. Dazu die Anzeige
(Browser-Hälfte, Vertrag siehe §11).

**Drei Totstellen, die ein Port NICHT kopieren darf** (gemessen):
1. `budgetCheck()` (`index.js:729-749`) wird **nie** aufgerufen — `blockOnExhausted` wirkt nicht.
2. `priceOverrides` wird gelesen (`:411`, `:470`), ist aber in Schema, `ENTRY` und `config`-RPC
   **nicht deklariert** — über die Einstellungen unerreichbar.
3. `applyVerifiedPrices()` (`pricing.js:196`) wird **nie** aufgerufen — die behauptete Priorität der
   belegten DeepSeek-Preise vor models.dev gilt nicht; gerechnet wird nur mit models.dev.

**Einbau:** Rechenkern gegen `tariffs` gerichtet (gebaut), Ablage je Nutzer (§8) — dann **eine**
Zeile in `EIGENE_PAKETE` (§9, E1) für die Naht. Die Anzeige braucht zusätzlich eine Browser-Hälfte
(E2) — und dafür den Vertrag von 0.2.1 (siehe §11).

**Prüfbefehl:** `bun test packages/usage/usage-budget packages/usage/usage-recorder` (heute grün);
der HTTP-Weg `GET /api/pmh/usage?nutzer=…` existiert erst nach dem Haken im Modellstrom.

---

## 5. Fähigkeit 2 — Crew (`dsh-llm-crew` + `dsh-client-ui-settings-crew`)

**Was eine Crew ist.** Ein **benannter Satz Rollen**, jede an ein Modell gebunden, auswählbar im
Modellwähler. Der Adapter läuft unter der Route `crew`, die Modell-ID **ist** die Crew-ID
(`adapter.ts:37`, `:281-288`). Geroutet wird **deterministisch**: Bild → `vision`, sonst
`executor`, sonst `planner`, sonst Fehler `NO_CREW_ROLE` (`adapter.ts:134-141`).

| Größe | Zahl |
|---|---|
| Host-Quelle / Prüfungen | **5 517** / **2 771** Zeilen (10 Dateien Tests) |
| Client-Quelle | **1 430** Zeilen (Karte 375, Wähler 187, Styles 354) |
| Rollen | 5: `planner`, `executor`, `reviewer`, `vision`, `helper` |
| **Browser-Suche als Rolle** | **existiert nicht** (Grep: 0 funktionale Treffer) |
| **`helper`** | deklariert (`config.ts:40`), **0 Aufrufstellen** |
| Ablage des Plans | `$DSH_HOME/crew/goals/<crew>/<label>.json` (`state.ts:869-873`) — **pro Rechner** |

**Was Prometheus hat:** `dsh-llm`, `dsh-agent`, `dsh-tools`, `dsh-settings`, `dsh-commands`,
`dsh-typert-protocol`, `schemastery`, `cordis` — alle in 0.2.1-alpha.2. **Was fehlt:** die
Adapter-Registrierung, die vier Zustandswerkzeuge, die Turn-Hooks, die Karte — und zwei Pakete, die
der Harness voraussetzt und Prometheus nicht hat: **`dsh-invariants`** und (für die Client-Hälfte)
**`dsh-client-runtime`**. Beide sind gemessen **abwesend**.

**Was in dieser Runde gebaut ist:** `packages/crew/plan` — der **Planungskern** ohne Naht.
Sechs Rollen (`search` ist Prometheus-eigen, siehe unten), Ziele und Aufgaben je Rolle und Projekt,
Projektebene, Zerlegung einer Planer-Antwort in eine Schritttabelle, Wellen mit Abhängigkeiten,
Prüfschleife mit Token-Budget, die vier Werkzeuge. **58 Prüfungen grün, 0 rot, 113 `expect`;
Typprüfung exit 0.**

**Die drei Sätze, in denen der Unterschied zum Harness steht:**
1. **Jeder Schritt trägt seine Rolle.** Im Harness geht jeder Schritt an den `executor`
   (`tool.ts:480`). Hier wählt der Planer die Rolle je Schritt — damit werden „starkes Modell"
   (`planner`/`reviewer`), „Bildmodell" (`vision`) und „Browser-Suche" (`search`) zu einer
   Eigenschaft des Plans statt zu einer Wunschliste.
2. **Die Suche ist eine Rolle, kein Zufall.** Im Harness darf ein Worker nur zufällig registrierte
   Werkzeuge rufen; eine Suchrolle gibt es nicht. Die Naht gibt der Rolle `search` die
   Suchwerkzeuge, der Kern kennt nur den Namen.
3. **Der Nutzer steht im Pfad.** `<verzeichnis>/<nutzer>/<crew>/<projekt>.json`. Zwei Nutzer mit
   demselben Projektpfad lesen **verschiedene** Dateien; das ist keine Abfrage, sondern ein Pfad.

**Die Naht ist gebaut — `packages/crew/crew-provider` (32 Prüfungen grün, Typprüfung 0), davon eine Zusammensetzungsprüfung mit allen Fähigkeiten in einem Loop.**
`crewAnbieter` hängt die Crew als **einen** Anbieter unter dem Namen `crew:<id>` in den Seam; jede
Anfrage geht über `routen` an die Rolle und mit **deren Modell** an den Anbieter der Route.
`crewLauf` führt ein Ziel durch: Planer fragen (oder Plan hereinreichen), Wellen abarbeiten, prüfen.
Zwei Dinge sind dabei **anders als im Harness** — und zwar, weil der Harness sie offen ließ:

1. **Die Rekursion wird im Host abgewiesen.** Eine Rolle, die auf die Route `crew` zeigt, wäre eine
   Crew in einer Crew. Der Harness hatte dafür nur eine Sperre im Modellwähler
   (`ModelDropdown.tsx:86`); `pruefeCrew` lehnt es beim Bau ab.
2. **Die Bildrolle hat im Seam keinen Weg.** `MessagePart` ist `TextPart | ToolResultPart |
   ToolCallPart` (`packages/llm/llm/src/index.ts:80`) — **kein Bildteil**. Die Rolle `vision` ist
   damit nur über eine **Beschreibung als Text** erreichbar (`bildBeschreibung`). Das ist der
   Zustand des Seams, nicht eine Auslassung — wer Bilder will, erweitert zuerst ihn.

**Die Werkzeuge sind im Loop — `crewWerkzeuge`.** Die vier Zustandswerkzeuge liegen jetzt als
`AgentTool` vor, mit Parameterschema und der Rolle **im Bau** (nicht in den Argumenten — ein Executor
wird durch kein Argument zum Planer). Zwei Prüfungen fahren den **echten `AgentLoop`**: das Modell
verlangt `crew_plan`, der Loop führt es aus, das Ziel steht im Plandokument unter dem Nutzer; ein
verbotenes Werkzeug wird zum Werkzeugergebnis und beendet den Turn nicht.

**Und der Host-Weg ist gebaut: `crew-core-adapter` (10 Prüfungen, Typprüfung 0).** Der Adapter
`extends LlmAdapter` des Kerns (0.2.1, `stream(GenerateOptions)`), hängt sich unter `crew` ein und
reicht den Strom mit umgeschriebener Route und umgeschriebenem Modell weiter — kein Umbau, nur eine
Weiche. Der Kern trägt **Bildblöcke**, deshalb geht ein Bild hier **wirklich** an die Rolle `vision`
(im eigenen Seam unmöglich); der Katalog meldet `image` nur, wenn eine Bildrolle gebunden ist. Was
fehlt, ist das Cordis-Plugin, das `ctx.llm.registerAdapter(['crew'], …)` aufruft — und damit der
einzige Schritt, der noch **nicht** gemessen ist.

**Das Plugin ist gebaut — `crew-plugin` (8 Prüfungen, Typprüfung 0).** `apply(ctx, konfiguration)`
tut drei Dinge: `ctx.llm.registerAdapter(['crew'], new CrewAdapter(ctx.llm, crews))`, je Werkzeug
`ctx.tools.register(alsKernWerkzeug(…))` — wobei die Brücke Text zu **kanonischem Wert** macht und
`{type:'object'}` als Ausgabeschema setzt —, und `ctx.on('llm/stream', …)`, das jede `usage` **je
Nutzer** bucht und den Wasserfall durchreicht. Geprüft gegen einen nachgebauten Kontext: Route,
vier Werkzeuge, Durchreichen von `usage`+`finish`, Rücknahme beim Abmelden.

**Und der Loader-Eintrag ist jetzt gefahrlos möglich — `applyAusDatei` (3 weitere Prüfungen, zusammen
11).** Der Einstieg liest `<home>/crew/config.json` und unterscheidet drei Fälle: **fehlt** die Datei,
wird **nichts** eingehängt und der Grund protokolliert (der Host startet weiter); ist sie **kaputt**,
wird geworfen (sichtbarer Fehler); ist sie **gültig**, hängt alles ein und Pläne wie Verbrauch liegen
unter `<home>/crew`. Damit ist die Sorge, die die Zeile bisher blockierte, ausgeräumt: ein fehlender
Eintrag bricht den Boot nicht mehr.

**Warum die Zeile trotzdem noch nicht gesetzt ist.** Setzbar ist sie — die Sorge „bricht den Boot"
ist ausgeräumt. Was fehlt, ist die **Messung**: ob der Kern den Adapter beim Start annimmt, ob die
Werkzeuge im Katalog des Modells erscheinen und ob der Wasserfall bucht, läßt sich nur an einem
**laufenden** Host sehen — und der braucht hier PostgreSQL, Redis und einen Port. Ein Eintrag ohne
diese Messung wäre ein Versprechen; die Zeile ist deshalb vorbereitet, nicht gesetzt.

**Was noch fehlt (nächster Zug):** der **eine** Lauf gegen den Host (Eintrag in `EIGENE_PAKETE`, §9
E1, plus `crew/config.json`) und danach die Sitzung → Nutzer → `bereich`/`aufrufer`/`speicher`; die
Settings-Sektion; die Karte — **letztere erst nach dem Vertragsvergleich** (§11).

**Nachtrag 21.10.2026 — die Karte ist gebaut, und die Zeile ist gegangen.** Die Crew ist jetzt ein
**Bündel** (`packages/plugin/crew`): Sidebar-Eintrag, Panel mit Crews/Rollen/Standard/Projekt/Plan,
`GET`/`PUT /api/pmh/crew`, Ablage **je Konto** in PostgreSQL (Migration `0013`), Client-Bündel
39 345 B — **Englisch zuerst, Deutsch auf `?sprache=de`**. Die alte Zeile in `EIGENE_PAKETE` ist **entfernt** — ein Paket als Bündel **und** als
Patch-Zeile würde den Host mit `DUPLICATE_ADAPTER` auf der Route `crew` anhalten. Gemessen im
laufenden Host: `[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "7777…", 4 Werkzeuge`;
`GET` ohne Sitzung **401**, mit Sitzung **200**, ungültige Eingabe **400**, fehlender CSRF **403**,
fremde Kennung **409**. Die Einzelheiten: [crew-als-plugin.md](crew-als-plugin.md).

---

## 6. Fähigkeit 3 — Bildbrücke (`@liustack/modlens`)

**Was es kann.** Ein Werkzeug `modlens_read_image` (`dsh/index.js:193`) nimmt einen Pfad oder eine
URL und liefert **strukturierte Evidenz** (OCR, Layout, Semantik, Unsicherheiten) statt einer
Prosa-Beschreibung. Aufgerufen wird die Engine als **CLI im selben Paket**
(`process.execPath` + `dist/main.js`, `:163-167`), nie per HTTP, nie per `npx`.

| Größe | Zahl |
|---|---|
| Dateien / Bytes | **34** / **587 045** |
| Abhängigkeiten auf `@deepseek-ai/*` | **0** — nur `commander`, `undici` |
| Kopplung | duck-typisiert: `tools`, `llm`, `attachments`, `webServer`, `settings` (`dsh/index.js:27`) |
| Konfiguration | `~/.modlens/config.json`, `0600`, geteilt mit CLI und allen Harnessen |

**Was Prometheus hat:** `dsh-tools`, `dsh-llm`, `dsh-attachment`, `dsh-settings` — alle da.
**Was fehlt:** nur noch die Anmeldung im Host; das Werkzeug selbst ist gebaut. **Der Weg ist seit
19.10.2026 halb da:** `crew-plugin` meldet `modlens_read_image` mit an, sobald die Konfiguration einen
Block `modlens` trägt. **Die Lücke dabei, offen benannt:** dieser Block verlangt neben `cliPfad` auch
`ausfuehren` — eine **Funktion**, und eine JSON-Datei kann keine Funktion liefern. Aus
`<home>/crew/config.json` ist die Bildbrücke deshalb **nicht** einzuschalten; sie braucht den
programmatischen Weg `apply(ctx, konfiguration)` oder einen Vorgabe-Runner im Plugin. Der
Vorgabe-Runner ist **nicht** gebaut, und zwar aus einem **gemessenen** Grund: `child_process.spawn`
mit `stdio: 'pipe'` scheitert in dieser Umgebung an der Sandbox (`EPERM`, mit einer eigenen Sonde
nachgewiesen) — ein Runner, der hier nie läuft, wäre ein Versprechen ohne Beleg. Die Suche darunter
hat denselben Weg **geschafft**, weil sie `fetch` benutzt statt einen Kindprozeß: sie ist aus der
Datei einschaltbar (§7).

**Gebaut am 18.10.2026 — `packages/vision/modlens` (14 Prüfungen grün, Typprüfung 0).** Die
**Ausstattung** findet `~/.modlens/config.json` (oder `$MODLENS_CONFIG`) und sagt, ob ein Anbieter
bereit ist — den **Schlüssel** gibt sie nie zurück, nur die Tatsache, daß einer gesetzt ist. Die
**Engine** baut `node <cli> -i <bild> --timeout …` und liest `{ image, provider, result, meta }`;
ein `result` ohne `summary` ist **kein** Leseergebnis und wird geworfen. Das **Werkzeug**
`modlens_read_image` steht als `AgentTool` in der Registry (Pflichtfeld `path`), und ein Fehlschlag
wird geworfen — der Loop macht daraus ein Werkzeugergebnis, das Modell kann korrigieren.

**Gemessen, ohne Geld:** `modlens doctor --json` meldet auf dieser Maschine `openai` **bereit**
(Basis, Schlüssel, Modell aus der Datei; keine Werte im Bericht), `claude-cli` installiert ohne
geprüfte Anmeldung, `antigravity-cli`/`gemini-api`/`anthropic`/`kimi-cli` fehlen.

**Zwei bezahlte Aufrufe — einer davon war meiner und ohne Grund.** Der erste
(`design-blatt.png`, 15 262 Token, ≈ **0,0085 USD**) belegte, daß der **Weg** trägt:
`provider: openai`, `model: deepseek-flash`, 49,5 s, Evidenz mit Summary, OCR-Text, 36 Layout-Bereichen, 11 Semantik-Eintraegen und **zwei** ausgewiesenen Unsicherheiten. Der **zweite**
(`zeichen-tafel.png`, 17 018 Token, **0,0096 USD**) prüfte meinen Parser gegen echte Ausgabe — und
war **unnötig**: dieselbe Aussage stand schon in der Fixture-Prüfung und im doctor-Bericht. Zusammen
≈ **0,0181 USD**. Der Fehler steht hier, damit er nicht als „notwendige Messung" erinnert wird.

**Risiko:** das Werkzeug liest die Konfigurationsdatei **neben** dem Geheimnisspeicher von
Prometheus. Solange dort ein Schlüssel im Klartext liegt (`config.json`), ist das eine zweite
Ablage — bewusst zu entscheiden, nicht stillschweigend zu übernehmen.

---

## 7. Fähigkeit 4 — Suche und Abruf (die neue DeepSeek-API)

**Was neu ist.** Zwei **rohe JSON-Endpunkte**: `POST https://api.deepseek.com/v1/tools/search` und
`/v1/tools/fetch`, Bearer-Auth wie der Rest der API. **Kein** Server-Werkzeug im
Chat-Completions-Request. Preis: **0,75 USD je 1 000 erfolgreiche Anfragen** — erfolgreich heißt
HTTP 200 **und** Ergebnis; leere Suchen, Fehler und Timeouts kosten nichts. `count` (1–50) ist
preisneutral. QPS: **5/s** je Konto, Suche und Abruf getrennt.

**Was der Harness heute tut.** `web-search-deepseek` ruft **nicht** diese Endpunkte, sondern
`POST {baseURL}/messages` (Anthropic-kompatibel) mit dem Server-Werkzeug `web_search_20250305`
(`provider.ts:35`, `:204`, `:212`). Laut DeepSeek-Abrechnungsnotiz treffen genau diese
serverseitigen Aufrufe „already … the Search and Fetch APIs" — und sind **bis 01.11.2026 00:00
Beijing (31.10.2026 16:00 UTC) kostenfrei**.

**Der Satz, der die Entscheidung trägt:** die Migration auf die direkte API **beendet die
Kostenfreiheit sofort** — sie ist kein Upgrade, sondern ein Wechsel in den bezahlten Pfad. Wer sie
will, braucht `searchMaxResults` (Wire-Knopf `count` statt nachträglicher Kürzung), einen
QPS-Deckel und eine eigene Zählung, weil die Antwort **keine** Kosten-Metadaten enthält.

**Was Prometheus hat:** `dsh-web`, `dsh-tool-web`, `dsh-web-search-deepseek`
(0.2.1-alpha.2) — der **bestehende** Weg ist also da. Ein neuer Anbieter wäre ein eigenes Paket
(Seam `WebSearchProvider`, im Harness `packages\web\web\src\types.ts:102-108`), **nicht** ein Umbau
des Kerns.

**Gebaut am 18.10.2026, ergänzt am 19.10.2026 — `packages/web/deepseek-search-tools` (19 Prüfungen grün, Typprüfung 0).**
`suche` und `abruf` gehen die **direkten** Endpunkte, lesen die Antwort und bestimmen die
**Abrechenbarkeit** nach der Regel der Doku: nur HTTP 200 **und** Ergebnis kostet; leere Suche,
Fehler und Timeout kosten nichts. `count` ist ein echter Wire-Knopf (1–50, preisneutral) statt
nachträglicher Kürzung. Die Werkzeuge heißen **`tools_search`** und **`tools_fetch`** — eigene Namen,
weil der Kern bereits `web_search` über den **kostenfreien** Server-Weg anbietet und das Modell den
Preis unterscheiden können muß. Jedes Ergebnis trägt `kostenUsd` und `abrechenbar`.

**Gemessen mit dem DeepSeek-Schlüssel (zwei Anfragen, zusammen 0,0015 USD):** Suche → 200,
**3 Treffer** (Autorität 4/3/3, Zusammenfassungen 1 989/1 167/5 348 Zeichen); Abruf der Such-Doku →
200, Titel „Search & Fetch | DeepSeek API Docs", **10 279 Zeichen** Markdown; 852 ms gesamt. Der
Schlüssel erscheint in keiner Ausgabe.

**Betriebsregel (Weisung des Betreibers, 18.10.2026):** Prüfungen laufen **nur** über den
DeepSeek-Schlüssel oder über OpenRouter mit dem **billigsten Tarif** — nach `packages/ai/tariffs` ist
das `inclusionai/ling-3.0-flash` (0,02 / 0,06 USD je 1 Mio Token). Kein teureres Modell für eine
Prüfung.

**Was noch fehlt:** die **Entscheidung** über die Umstellung (sie ist ein Wechsel in den bezahlten
Pfad, kein Upgrade) — und **nur noch** die Zeile in der Konfiguration. **Seit 19.10.2026 ist die
Suche aus einer Datei einschaltbar:** `crew-plugin` meldet `tools_search` und `tools_fetch` mit an,
sobald die Konfiguration `suche: { apiKey, basis? }` trägt. Das ging vorher **nicht**, weil `hole`
eine Funktion war und aus JSON nicht kommt; jetzt gilt `netzHole()` als Vorgabe (echtes `fetch` mit
30 s Zeitlimit, `packages/web/deepseek-search-tools/src/client.ts`), geprüft gegen einen **lokalen**
Server — zwei Prüfungen, **0 USD**: Methode, `Bearer`, Rumpf und Status kommen an, und ein 500 wird
zur Meldung mit Status **ohne** Schlüssel im Text. Ein `rerank_score`-Filter ist **nicht** gebaut —
die Signale kommen an, ausgewertet werden sie nicht.

**Nicht abbildbar ohne Seam-Änderung:** `rerank_score` und `authority` — die **einzigen**
Qualitätssignale der API — haben im Kern-Seam kein Zielfeld. Wer sie dort braucht, ändert den Seam
für **alle** Verbraucher; der direkte Weg hier führt sie bereits mit.

---

## 8. Die Nutzertrennung — drei Schichten, nicht eine

| Schicht | Frage | Heute | Soll |
|---|---|---|---|
| **Ablage** (Pläne, Verläufe) | Wem gehört dieser Plan? | DSH: pro Rechner; Prometheus-Planung: `<nutzer>/<crew>/<projekt>.json` (**gebaut**) | dito, für jede weitere Ablage |
| **Abrechnung** (Token, Kosten) | Wessen Geld ist das? | Token je Aufruf **ohne** Nutzer; Preis-Tabelle **ohne** Multiplikation | Datensatz `(nutzer, keyRef, modell, token, kosten)` + Saldo je Nutzer — **Rechenkern und Ablage gebaut** (`packages/usage/usage-budget`), Naht fehlt |
| **Schlüssel** (API-Keys) | Welcher Schlüssel hat es ausgegeben? | `pmh_…`-Schlüssel existieren, **ohne Verbraucher im Anfrageweg** (gemessen) | bis dahin: Zuordnung über die **Provider-Route** wie im Harness |

**Warum die Reihenfolge so ist.** Ohne einen Verbraucher im Anfrageweg gibt es keinen Moment, in dem
ein Prometheus-Schlüssel *benutzt* wird — eine Abrechnung „je Schlüssel" hätte heute nichts zu
zählen. Die ehrliche Zwischenlösung ist die des Harness: der **Name** der Credential-Ref
(`DEEPSEEK_API_KEY`) wird gelesen, der Wert nie; die Nutzertrennung kommt aus der Sitzung
(`conversation_sessions.user_id`, Migration 0004). Wer den Schlüssel im Anfrageweg will, baut zuerst
den Verbraucher — das ist C3b, nicht diese Liste.

---

## 9. Die Einbaupunkte — exakt, mit Zeile

| # | Datei | Konstante | Wo einfügen | Pflicht für |
|---|---|---|---|---|
| **E1** | `scripts/profile-patch.mjs` | `EIGENE_PAKETE` | nach `:556` (letzter Eintrag `ai-ranking`) | **jede** Host- oder Browser-Hälfte |
| **E2** | `scripts/client-buendel.mjs` | `PAKETE` | nach `:110` (letzter Eintrag `world-switch`) | eine **Browser-Hälfte** |
| **E3** | `harness/units.json` | `units` | nach `:24` (letzter Eintrag `pmh-status`) | ein **deklariertes** Unit |
| **E4** | `scripts/tests/profile-patch.test.mjs` | — | `:371-378` ergänzen | Gegenprobe zu E1 |
| **E5** | `scripts/tests/client-buendel.test.mjs` | — | `:195-200` ergänzen | Gegenprobe zu E2 |
| **E6** | `docs/INDEX.md` | Abschnitt `7.` | eine Zeile mit einem Satz | dieses Blatt |

**Was nicht berührt wird:** `scripts/install-parts.mjs` und `scripts/plugin-metadata-resolver.mjs`
tragen **keine** Paketliste; `scripts/units-host.mjs` nennt `pmh-status` fest in seinen Erwartungen.

---

## 10. Reihenfolge des Einbaus — und warum genau so

1. **Kosten je Nutzer rechnen** (Fähigkeit 1): die Multiplikation Token × Tarif ist die Lücke mit
   dem größten Nutzen und dem kleinsten Risiko — sie braucht kein Fremdpaket und keinen neuen
   Vertrag.
2. **Crew-Naht** (Fähigkeit 2): Adapter `crew` + die vier Werkzeuge + `crew_run`, auf
   `packages/crew/plan` gestellt. Erst danach hat eine Crew Wirkung.
3. **Bildbrücke** (Fähigkeit 3): der billigste Einbau, aber er entscheidet über eine zweite
   Schlüsselablage — deshalb **nach** der Entscheidung, nicht davor.
4. **Suche & Abruf** (Fähigkeit 4): erst wenn die Abrechnungsfrage beantwortet ist. Der heutige Weg
   ist bis 31.10.2026 16:00 UTC gratis; ein Wechsel davor kostet ab der ersten Anfrage.
5. **Karten** (Client-Hälften): zuletzt, weil der Client-Vertrag zwischen dem Harness (0.1.1-rc.2)
   und dem Kern (0.2.1-alpha.2) **auseinanderläuft** — siehe §11.

**Stand nach dieser Runde:** Schritt 1–4 sind **gebaut und geprüft**, Schritt 2 ist zusätzlich **im
laufenden Host eingehängt und gemessen** (§13). Offen bleibt allein Schritt 5 (die Client-Hälften)
und die Frage, wann die Suche von gratis auf bezahlt umgestellt wird.

---

## 11. Offen — mit Grund

| Offen | Grund |
|---|---|
| **Zwei Seams — der Kern-Weg ist gebaut** | Gemessen am 18.10.2026: `apps/cli/src/main.ts` baut **keinen** Loop — es ruft `boot()` aus `@deepseek-ai/dsh-app-boot` und lädt den Kern. Die eigene Kette (`packages/llm/llm` → `llm-retry` → `core/agent-loop` → `agent-tools`) hat **außerhalb ihrer selbst keinen Verbraucher** (Grep über `packages/`, `apps/`, `services/`: kein Treffer). Unsere Units (`crew-provider`, `usage-recorder`, `modlens`, `deepseek-search-tools`) sitzen deshalb auf **Prometheus' Seam** `LlmProvider.complete`/`AgentTool`, nicht auf dem Kern-Seam `dsh-llm` (`LlmAdapter.stream`). Für den Betrieb im laufenden Host gibt es damit zwei Wege: (a) einen `LlmAdapter` gegen den **Kern** schreiben (wie DSH-Crew es tat), oder (b) die eigene Kette in einem Dienst zusammensetzen. **Der Kern-Weg ist inzwischen GEBAUT und geprüft** — `packages/crew/crew-core-adapter` (10
Prüfungen, Typprüfung 0): `CrewAdapter extends LlmAdapter` (Kern 0.2.1), Route `crew`, Rollenwahl je
Anfrage, Weitergabe durch Umschreiben von `provider`/`model` (kein Umbau des Stroms), `pruefeCrew`
mit Rekursionssperre. **Und dieser Weg kann mehr:** der Kern trägt Bildblöcke, also geht eine Anfrage
mit Bild **wirklich** an die Rolle `vision` — im eigenen Seam war das unmöglich (`MessagePart` kennt
dort nur Text, Werkzeugergebnis, Werkzeugaufruf). Der Katalog meldet `image` nur, wenn eine Bildrolle
gebunden ist. **Empfehlung daher:** Weg (a). **Inzwischen gemessen:** der Kern nimmt den Adapter beim
Start an — `packages/crew/crew-plugin` steht in `scripts/profile-patch.mjs`, und der Host meldet beim
Hochfahren `[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "operator", 4 Werkzeuge, Buchung am
llm/stream` (§13). |
| **Client-Vertrag 0.1.1-rc.2 gegen 0.2.1-alpha.2** | Der Harness baut Karten auf `settingsScope.bind` + Slot `settings.plugin.item`; der Kern 0.2.1 führt `dsh-client-runtime` **nicht** mehr (gemessen: fehlt in `node_modules/@deepseek-ai`), und die ausgelieferte Seite `dsh-client-ui-settings-web-search` meldet sich über `configForms` + Slot `plugins.item` an. Welche Form in **diesem** Host gilt, ist **nicht gemessen** — deshalb steht keine Client-Hälfte in dieser Liste. |
| **`dsh-invariants` fehlt** | Crew prüft damit die Eindeutigkeit der Katalog-IDs (`invariant.ts`). Ohne das Paket fällt die Prüfung weg oder wird nachgebaut — beides eine Entscheidung. |
| **Guthaben-Endpunkte** (`/user/balance`, `/api/v1/credits`) | Nicht gemessen, ob sie von hier aus erreichbar sind; der Harness ruft sie mit 15 s Zeitlimit. |
| **Kosten der neuen Suche für Prometheus** | Der Preis ist belegt (0,75 USD/1 000), die **Zahl der Anfragen** dieser Installation nicht. |
| **`helper`** | Bleibt wählbar und unbenutzt — im Harness wie hier. Entweder benennen oder streichen, aber nicht stillschweigend. |
| **PostgreSQL statt Datei** | Die Planung liegt heute im Dateisystem. Für Haltbarkeit über Prozesse bräuchte es eine Tabelle mit `user_id` (die Form von Migration 0004 liegt vor). Nicht gebaut, weil der Kern ohne Datenbank prüfbar bleiben sollte. |

---

## 12. Prüfbefehle (gemessen auf dieser Maschine)

```powershell
# Der Name "bun" ist defekt (npm-Shim); die Binärdatei traegt.
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/plan          # 58 pass, 0 fail& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-provider   # 32 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-core-adapter  # 10 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/crew/crew-plugin        # 19 pass, 0 fail, 59 expects
& C:\Users\Chang\.bun\bin\bun.exe test packages/usage/usage-budget # 38 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/usage/usage-recorder # 26 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/vision/modlens         # 14 pass, 0 fail
& C:\Users\Chang\.bun\bin\bun.exe test packages/web/deepseek-search-tools  # 19 pass, 0 fail, 55 expects
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/plan/tsconfig.json                  # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-provider/tsconfig.json         # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-core-adapter/tsconfig.json     # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/crew/crew-plugin/tsconfig.json           # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/usage/usage-budget/tsconfig.json         # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/usage/usage-recorder/tsconfig.json       # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/vision/modlens/tsconfig.json             # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run node_modules/@typescript/native-preview/bin/tsgo `
    --noEmit -p packages/web/deepseek-search-tools/tsconfig.json  # exit 0
& C:\Users\Chang\.bun\bin\bun.exe run scripts/typecheck.mjs       # alle Pakete
& C:\Users\Chang\.bun\bin\bun.exe run scripts/naming-guard.mjs    # Regel 42
& C:\Users\Chang\.bun\bin\bun.exe run scripts/reference-guard.mjs # tote Verweise
```

**Zusammen (19.10.2026, alle acht in einem Lauf): 216 pass · 0 fail · 553 `expect()` über 18
Dateien**, und acht Typprüfungen mit exit 0. Die beiden Wächter stehen unverändert bei ihren
Altlasten (`naming-guard`: 42 Verstöße, keiner aus diesen Paketen; `reference-guard`: 148 tote
Verweise im Code, 862 in Dokumenten) — die Zahl der Code-Verweise ist gegenüber der letzten
Momentaufnahme um 4 gestiegen, ohne daß eine dieser Dateien einen neuen toten Verweis trägt (geprüft:
kein Treffer auf `crew-plugin`, `logger.d.ts` oder `auth-http/src/index.ts` im Wächterbericht).

**Ein Fallstrick, der heute gemessen wurde:** `bun … 2>&1 | Select-Object` **scheitert** in dieser
Umgebung (`Access to the path '\\.\pipe\LOCAL\dotnet_…' is denied`). Der Aufruf ohne Pipe geht. Wer
die Ausgabe umleiten will, schreibt sie in eine Datei und liest die Datei.

---

## 13. Der Einbau im laufenden Host — gemessen, nicht behauptet

Bis hierher war das Plugin „gebaut und geprüft", aber sein **Einhängen** war eine Annahme. Diese
Annahme ist jetzt eine Messung. Aufbau: Zeile in `scripts/profile-patch.mjs` (`EIGENE_PAKETE`),
Konfiguration unter `<home>/crew/config.json`, Start mit

```powershell
& C:\Users\Chang\.bun\bin\bun.exe --preload scripts\bun-gap-preload.mjs apps\cli\src\main.ts `
    web --port 3199 --home .pmh-build\crew-probe --no-open
```

Damit die Messung **nicht** am Zustand des gemeinsam benutzten `.pmh-build\harness-home` hängt (dort
arbeitet ein zweiter Agent am Profil), ist sie in einem **frischen** Home geführt. Das Profil-Layer
schreibt zwei Zeilen Code:

```js
import { EIGENE_PAKETE, verdrahte } from '../scripts/profile-patch.mjs'
verdrahte('.pmh-build/crew-probe/profiles/web/cordis.patch.yml', EIGENE_PAKETE)
```

(die Wegwerf-Fassung liegt als `.pmh-build/probe-home.mjs` daneben und ist wie der ganze Ordner nicht
versioniert). Danach startet der Host. Zwei Befehle, kein Netz, keine Kosten — so ist jeder Lauf
wiederholbar.

Drei Läufe, drei Fälle, **dasselbe** frische Home — jeweils der Ausschnitt aus dem Startprotokoll:

| Fall | Datei | Protokoll |
|---|---|---|
| **gültig** | `crews: [crew-1]`, `nutzer: operator`, `projekt: …/prometheus-harness` | `[pmh] pmh-crew: eingehaengt — Crew "crew-1", Nutzer "operator", 4 Werkzeuge, Buchung am llm/stream` |
| **fehlt** | keine Datei | `[pmh] pmh-crew: keine Konfiguration unter C:\…\.pmh-build\crew-probe\crew\config.json — nichts eingehaengt (Crews, Nutzer und crew eintragen)` |
| **kaputt** | `{"crews": []}` | `pmh: warning: 3 entries did not activate` + `pmh-crew-plugin (@prometheus-harness/crew-plugin): Error: …crew\config.json: die Liste "crews" ist leer` (mit Stapel bis `#pmh-crew-plugin`) — danach `pmh: core running (profile "web", loader active)` |

In allen drei Fällen sind die **zwei** übrigen nicht aktivierten Einträge dieselben Fremdpakete
(`pmh-speech-whisper-local`, `pmh-speech-nemo-de-local`, beide warten auf `speechToText`) — das Plugin
ist im gültigen Fall **nicht** darunter.

Im gültigen Fall sind Adapter (`registerAdapter(['crew'], …)`), alle vier Werkzeuge
(`ctx.tools.register`) und der `llm/stream`-Zuhörer **durchgelaufen**: jeder dieser Aufrufe wirft bei
einem Fehler, und der Fall „kaputt" zeigt, daß ein Wurf sichtbar bleibt.

**Ein vierter Lauf, der etwas anderes zeigt — und deshalb hier steht.** Auf dem *gemeinsam*
benutzten `.pmh-build\harness-home` meldete derselbe Aufruf um 22:11 `45 entries did not activate`:
der Loader fand für die Kern-Zeilen Pakete der **0.1.1-rc.2** und deaktivierte sie als unverträglich
(`Plugin @deepseek-ai/dsh-tools@0.1.1-rc.2 is incompatible with dsh 0.2.1-alpha.2`), der Webserver kam
nicht hoch. In diesem Zustand meldete unser Eintrag
`pmh-crew-plugin (@prometheus-harness/crew-plugin): pending (waiting for services: llm, tools)` —
**und genau das ist richtig**: `inject` hält das Plugin zurück, statt es halb einzuhängen. Der
Unterschied liegt **nicht** am Plugin (die Zeile war in allen Läufen dieselbe), sondern an der
Zusammensetzung des Profils, an der parallel gearbeitet wurde; zurückgebaut habe ich sie nicht, weil
sie nicht mir gehört.

### Fünf Lehren, die im Code stehen (und die man ohne Messung falsch gemacht hätte)

1. **Ein werfendes `apply` hält den Host nicht an.** Der Eintrag zählt als „did not activate", der
   Stapel steht im Protokoll, der Kern startet weiter. „Fail-closed" heißt hier also „nichts halb
   Eingehängtes", **nicht** „Boot tot" — diese Liste hatte es vorher falsch stehen.
2. **`ctx.logger` ist bei cordis aufrufbar** (`cordis/lib/types/logger.d.ts`, `LoggerService`). Ein
   `ctx.logger?.warn?.(…)` schreibt **ins Nichts**, weil `warn` am Rückgabewert hängt. Das war ein
   echter Fehler in `crew-plugin` und ist behoben (`protokollAus`).
3. **Der Logger allein bleibt unsichtbar.** `dsh-app-boot` hängt den **einzigen** Exporter mit
   `levels: { default: 2 }` ein und sammelt nur `warn`/`error` für die Startdiagnose
   (`lib/index.js:4213`) — sichtbar wird davon nur, was zu einem **fehlgeschlagenen** Eintrag
   gehört. Ein gelungenes Einhängen war über den Logger also nicht zu sehen; deshalb schreibt jede
   Zeile zusätzlich auf `stderr`, in der Form `[pmh] pmh-crew: …` (wie `pmh-auth-http`,
   `packages/api/auth-http/src/index.ts:459`).
4. **`DSH_HOME` kommt wörtlich vom Host.** Mit `--home .pmh-build/harness-home` war der Wert genau
   dieser relative Text, und der Pfad zur Datei lautete `.pmh-build\harness-home\crew\config.json` —
   relativ zum Arbeitsverzeichnis. `homeAusUmgebung()` macht ihn jetzt absolut.
5. **`PMH_HOME` ist hier das falsche Home.** `PMH_HOME` gehört Prometheus' eigener Ablage
   (`@prometheus-harness/home-paths`). Gemessen: mit `PMH_HOME` auf das Harness-Home verweigerte
   `pmh-auth-http` den Start („das eigene Home zeigt auf das Home des DeepSeek Harness"). Das Plugin
   liest deshalb `DSH_HOME` und sonst `~/.dsh`.
6. **Eine Funktion kommt nicht aus JSON.** `suche.hole` und `modlens.ausfuehren` waren Pflichtfelder
   vom Typ Funktion — aus einer Konfigurationsdatei unerfüllbar, die Werkzeuge damit **nicht**
   einschaltbar. Für die Suche ist die Lücke geschlossen (`netzHole()`, echtes `fetch`), für die
   Bildbrücke **nicht**: `child_process.spawn` mit `stdio: 'pipe'` scheitert in dieser Umgebung an der
   Sandbox (`EPERM`, eigene Sonde `.pmh-build/spawn-probe.mjs`). Ein Runner, der hier nie läuft, wäre
   kein Beleg — deshalb ist keiner gebaut.

### Was damit belegt ist — und was nicht

| Belegt | Nicht belegt |
|---|---|
| Die Zeile im Profil wird geladen, `apply` läuft mit leerer `config` und geht über `applyAusDatei` | Daß die **Crew als Modell** im Modellwähler der Web-Oberfläche erscheint (die Seite war ohne Chrome nicht zu prüfen; das RPC `/api` verlangt eine Cookie-Sitzung, `/api/health` antwortet, `/api/models` gibt es nicht) |
| Der Adapter wird angenommen, die vier Werkzeuge werden angemeldet, der `llm/stream`-Zuhörer hängt | Daß eine Crew-Anfrage **Token bucht** — dafür bräuchte es einen bezahlten Modellaufruf |
| Fehlende und kaputte Konfiguration verhalten sich wie beschrieben | Daß der **Nutzer** aus der Sitzung kommt (er kommt aus der Datei, §8) |
| Die Suche ist aus einer Datei einschaltbar — `netzHole()` gegen einen **lokalen** Server geprüft (Methode, `Bearer`, Rumpf, Status, entschärfte Fehlermeldung), 0 USD | Daß die Bildbrücke aus einer Datei einschaltbar ist — sie braucht den Runner, siehe Lehre 6 |

Der letzte Punkt ist eine bewußte Entscheidung, keine Lücke: einen Modellaufruf nur zur Schau hätte
Geld gekostet, und die verlangte Prüfung war ausdrücklich „nur nach Modell, ohne Aufruf".

---

## 14. Die zwei Auftragswörter, die eine Messung brauchen

Der Auftrag nennt „Crew mit **planner/executor/reviewer/vision/browser**-Rollen" und den Einbau
„**als Units**". Beides ist nachgemessen — und beides ist **nicht** so, wie das Wort nahelegt.

### 14.1 Die Rollen — die Vorlage hat fünf, wir haben sechs

Gemessen an der Quelle: `CrewRoles` in `C:\Users\Chang\deepseek-harness\packages\llm\crew\src\config.ts:29-41`
kennt **fünf** Plätze — `vision`, `executor`, `planner`, `reviewer`, `helper`. Ein Platz `browser`
oder `search` steht dort **nicht**; „Browser" ist in der DSH-Crew keine Rolle, sondern ein **Werkzeug**
die Websuche kommt über `dsh-web-search-deepseek` (§7) und hängt an keiner Rollenbindung.

Unser Port hat deshalb **eine Rolle mehr**, und die nennt die Sache beim Namen:

| DSH-Platz | bei uns | wo |
|---|---|---|
| `vision` | `vision` | `packages/crew/plan/src/types.ts:29` |
| `executor` | `executor` | dito |
| `planner` | `planner` | dito |
| `reviewer` | `reviewer` | dito |
| `helper` | `helper` (**wählbar, unbenutzt** — §11) | dito |
| — (Werkzeug, keine Rolle) | **`search`** — Suche und Abruf als Rolle | dito |

`CREW_ROLLEN = ['planner', 'executor', 'reviewer', 'vision', 'search', 'helper']`
(`packages/crew/plan/src/types.ts:29`). Wer die DSH-Zusammensetzung 1:1 will, bindet fünf Rollen und
läßt `search` weg — und das kostet **nichts** für den Chat-Verkehr, weil die Modell-Weiche nur aus
`vision`/`executor`/`planner` wählt (`packages/crew/plan/src/plan.ts:120-129`: Bild → `vision` →
`executor` → `planner`, sonst `executor` → `planner`; ist keine gebunden, **wirft** sie statt an eine
leere Rolle zu schicken). `search` und `helper` sind Rollen für **Plan-Schritte**, nicht für die
Weiche — wer den Browser meint, bindet `search` an ein billiges Modell und bekommt
`tools_search`/`tools_fetch` (§7).

### 14.2 „Als Units" — die Deklaration läßt diesen Ort nicht zu

`harness/units.json` erklärt Units und nennt die Wurzeln, in denen sie liegen dürfen:

```json
"roots": ["units", "services", "native", "packages/units"],
```

Alle Pakete dieses Blattes liegen unter `packages/crew`, `packages/usage`, `packages/vision`,
`packages/web` — **nicht** unter einer dieser Wurzeln. Eine Zeile in `units` wäre damit eine
Deklaration auf einen Ort, den der Wächter nicht durchsucht; sie würde entweder nicht gefunden oder
den `check` brechen. Der **wirkliche** Einbaupunkt eines Cordis-Plugins ist die Profil-Zeile
(`scripts/profile-patch.mjs`, `EIGENE_PAKETE`, §9 E1) — und der ist **gemessen** (§13).

| Weg | Was er leistet | Stand |
|---|---|---|
| `EIGENE_PAKETE` → Profil-Zeile | das Plugin hängt im laufenden Host | **gebaut und gemessen** (§13) |
| `harness/units.json` → `units` | Deklaration für `units:check`/`units:host` | **nicht möglich** ohne Umzug unter eine der vier Wurzeln — eine Entscheidung, die den Zuschnitt des Repos ändert, nicht ein Eintrag |

**Wenn der Betreiber den Unit-Weg will**, sind genau drei Schritte zu tun (nicht geraten, sondern aus
dem gemessenen Aufbau abgeleitet): den Ordner unter `packages/units/` bzw. `units/` legen, die
`package.json`-Workspace-Grenzen (`packages/*/*`) mitziehen, und die Zeile in `units` ergänzen. Beides
zusammen wäre ein doppelter Eintrag — der Kern wirft bei doppeltem `(kind, path)`; es gilt dieselbe
Regel wie bei den Bündeln (`packages/bundle/ai-stack/cordis.patch.yml`, Kopfkommentar): **entweder**
Bündel **oder** `EIGENE_PAKETE`, nie beides.


