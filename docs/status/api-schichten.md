# Die zwei API-Schichten des Kerns — und wo wir stehen

> **Stand:** 14.10.2026 · **Anlaß:** die Frage, ob unser eigener Schnittstellenbaukasten die
> *moderne* Schicht benutzt. **Antwort: nein.** Gemessen, nicht erinnert.

## 1. Der Kern hat zwei Schichten — und sie sind sauber getrennt

### Schicht 1 — der nackte Webserver

`@deepseek-ai/dsh-host-webserver` (0.2.1-alpha.2), aus seiner eigenen README:

> *„The web GUI host's HTTP server: **named-route and upgrade registration** … It **knows no
> harness concepts** and serves no files — the `/api` bridge, plugin bundles, the HMR event
> stream, and the SPA dist belong to the plugins that register them. Route matching is fixed:
> **exact over the whole table, then longest prefix**, then the fallback handler."*

Wer diese Schicht benutzt, gemessen über alle 257 Pakete (`\.webServer\s*\.\s*register\s*\(`):

| Paket | wofür |
|---|---|
| `dsh-client-connection` | die **`/api`-Brücke** selbst |
| `dsh-client-hmr` | der Ereignisstrom für die Entwicklung |
| `dsh-client-modules` | das Ausliefern der Plugin-Bündel |
| `dsh-host-open-in-app` | eine Browser-Öffnung |

**Fünf Treffer, alle Infrastruktur.** Kein Fachbereich des Kerns registriert dort einen Weg.

### Schicht 2 — Typert Remote (das Neue)

`@deepseek-ai/dsh-typert-protocol`:

> *„business packages can expose Host methods to Remote clients: **mark a method with `@Remote`**
> (or `@RemoteScope` for scoped receivers), bind the service to a **wire namespace** … Generated
> artifacts, the Host Gateway, and the Client API consume the same **invocation descriptors,
> codecs, and provider contracts**."*

`@deepseek-ai/dsh-api-gateway`:

> *„**Two-sided Typert RPC endpoint** … The Host entry provides `ctx.typertGateway`, while
> `…/client` provides **`ctx.remote`** … Connection carries unary request correlation, trust, and
> response envelopes, while Gateway owns **multiplexed Remote streams**."*

Gemessen im Kern:

| Größe | Zahl | Meßweg |
|---|---|---|
| Pakete mit `@Remote`/`@RemoteScope` | **21** | Dekorator-Suche über `lib/**` (150 Nennungen) |
| davon Fachbereiche | `dsh-api-session-controller`, `-settings-`, `-account-`, `-workspace-`, `-job-`, `-terminal-controller`, `dsh-api-workspace-files`, … | |
| erzeugte Bausteine je Paket | `typert.host.js`, `typert.remote-client.js` (+ `.d.ts`) | Verzeichnisliste z. B. `dsh-api-settings-controller/lib/` |
| Umschlag auf der Leitung | `type: 'client-request'` → `type: 'server-response'` | `dsh-client-connection/lib/types/rpc.d.ts:63,70` |
| Strom-Multiplex | `/api/remote.mux` | `dsh-api-gateway/lib/types/stream-protocol.d.ts` |

**Das ist kein Papier.** Die eigene Messung der Plugin-Inventur (191 Einträge, 163 aktiv,
0 gescheitert) lief in dieser Sitzung **über genau diesen Weg**: `POST /api/host-plugin-inventory/pluginInventory/list`
mit einem `client-request`-Umschlag, Antwort in `result.value`.

## 2. Wo wir stehen: auf Schicht 1

| unser Paket | wie es sich einhängt | Datei |
|---|---|---|
| `@prometheus-harness/auth-http` | `inject = ['webServer']`, `ctx.webServer.register(weg)` | `packages/api/auth-http/src/index.ts:132,305` |
| `@prometheus-harness/health` | dasselbe (`inject = ['webServer']`) | `packages/api/health/src/index.ts:90,781` |
| `@prometheus-harness/readiness` | Sonden ins Register, Wege über `health` | `packages/api/readiness/src/index.ts:69` |

Wir sind damit **nicht auf der Typert-Schicht**, sondern auf der darunter. Konkrete Folgen, die
im eigenen Code stehen:

* **Die Methodenprüfung ist unsere.** Der Webserver gleicht nur den Pfad ab — das steht in
  `packages/api/auth-http/tests/http-schicht.test.ts:138` (*„Die Methode wird geprüft — der
  Webserver des Kerns tut es nicht"*).
* **Die Prüfung der Eingabe ist unsere.** Typert bindet **Zod-Schemata** aus erzeugten
  Artefakten (`dsh-typert-registry`: *„lazy Zod schema factories"*); wir prüfen von Hand.
* **Kein `ctx.remote`.** Ein Client kann uns nicht typisiert aufrufen, wir erscheinen in keiner
  Anwendungs-Fernliste (`dsh-api-remotes`), und es gibt für uns **keine erzeugten Deskriptoren**.
* **Kein Strom.** Der Multiplex-Weg (`/api/remote.mux`) gehört dem Gateway. Unsere Wege sind
  Frage/Antwort; für Lebendigkeit müssten wir selbst etwas bauen.

## 3. Was das **nicht** heißt

1. **Schicht 1 ist nicht abgekündigt.** Keine Abkündigung in den Typdeklarationen oder READMEs
   der beiden Pakete gefunden. Sie ist die **untere** Schicht, auf der die `/api`-Brücke selbst
   sitzt — sie verschwindet nicht.
2. **Für Sonden ist rohes HTTP richtig.** `/health`, `/ready` werden von Maschinen gerufen
   (Docker, Lastverteiler), nicht von der SPA. Ein typisierter Fernaufruf wäre hier ein
   Rückschritt.
3. **Eine Anmeldung mit Cookies und HTML-Seite ersetzt Typert nicht.** `auth-http` liefert eine
   Seite (`seite.ts`, 20 kB), setzt Cookies, verlangt CSRF — das ist ein **Browser**-Vorgang.
   Typert ist der Weg für **typisierte Aufrufe**, nicht für eine Anmeldemaske.
4. **Wir bauen den Konto-Fernaufruf des Kerns nicht nach.** `remote.account` bedient das
   **DeepSeek-Konto** (Guthaben, Anmeldecode — siehe die Texte `onboardingCredit`,
   `balanceUnavailable` aus der Sprachrunde). Unser `auth-http` bedient **lokale Benutzer** mit
   Mandantentrennung. Zwei verschiedene Dinge.

## 4. Die Entscheidung, die ansteht

Nicht „migrieren", sondern **trennen**:

| Fläche | bleibt | Begründung |
|---|---|---|
| `/api/pmh/health`, `/ready` | **HTTP, Schicht 1** | Maschinenweg, Sonden |
| Anmeldemaske, Cookies, CSRF, Weiterleitungen | **HTTP, Schicht 1** | Browserweg |
| **Datenwege** (Benutzer, Sitzungen, Schlüssel, Mandant) | **Typert prüfen** | Validierung, Abbruch, Wiederverbindung, Ströme — alles, was wir heute von Hand bauen |

**Was eine Typert-Anbindung verlangen würde — nachzulesen, nicht geraten:**

1. Methoden mit **`@Remote`** auszeichnen und den Dienst an einen **wire-Namensraum** binden
   (`dsh-typert-protocol`).
2. **Erzeugte Artefakte** (`typert.host.js`, `typert.remote-client.js`) — es gibt einen
   **Generator**; ohne ihn meldet der Lader
   *„parameter codec has no create() factory"* (genau diese Meldung stand in unserem
   Testprotokoll vom 14.10.2026, sechsmal).
3. Der Client mountet die Bausteine über **`ctx.remote.$mount()`** (`dsh-api-remotes`) — ein
   Client, den **wir** erst haben müssten. Unser `apps/web` ist ein Vite-Prototyp und **nicht**
   der DSH-Client; die lebende Oberfläche ist der Kern-Client.

**Deshalb ist die Reihenfolge:** erst den Generatorweg und die Form der erzeugten Dateien
messen, **dann** entscheiden. Eine Umstellung ohne Client hätte keinen Zeugen — und ein
Zeuge, den man selbst gebaut hat, beweist nur, daß es mit **ihm** läuft.
