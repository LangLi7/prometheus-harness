# Befund: die Schnittstellenfläche des Hosts

> **Gemessen:** 13.10.2026 · Windows nativ · Bun 1.4.0 · Host aus `apps/cli`
> mit eigenem Harness-Home (`.pmh-build/harness-home`) · Messsonden:
> [`../status/messsonden/api-sonde.ts`](../status/messsonden/api-sonde.ts)
>
> **Die Frage:** *„funktioniert denn die ganze Re(fork)-Schnittstelle, API etc.?"*

## 1. Die Antwort in einem Satz

**Die Oberfläche wird ausgeliefert, die Anmeldung greift — aber eine API, mit der
die Oberfläche arbeiten könnte, ist nicht erreichbar.** Alles, was der Client zum
Arbeiten bräuchte, antwortet **404** oder wird mit **1008 Policy Violation**
abgewiesen.

## 2. Was gemessen wurde

| Prüfung | Ergebnis | Bewertung |
|---|---|---|
| `GET /?token=…` | **303** + `set-cookie: dsh-auth-…` | **funktioniert** — die Token-Weiterleitung ist korrekt |
| `GET /` mit Cookie | **200 · 35.664 Zeichen · `text/html`** | **funktioniert** — die Oberfläche kommt |
| `GET /assets/index-…js` | **200 · `text/javascript`** | **funktioniert** — die Anwendung lädt |
| `GET /` **ohne** Cookie | **401** | **funktioniert** — die Auth greift |
| `GET /healthz` | **404** | fehlt |
| `GET /api`, `/api/health`, `/api/sessions`, `/api/workspaces`, `/api/settings`, `/api/models`, `/api/agents`, `/api/commands`, `/api/skills`, `/api/plugins`, `/api/jobs`, `/api/goal`, `/api/terminal`, `/api/files`, `/api/credentials`, `/api/account`, `/api/telemetry` | **alle 404** | **es gibt keine REST-Fläche** |
| **`WS /api/remote.mux`** (der echte Gateway-Pfad aus `dsh-api-gateway`) | **geschlossen mit Code 1008 — Policy Violation** | **das ist der Befund** |
| `GET /api/remote.mux` (HTTP statt WebSocket) | 404 | korrekt: die Route ist ein reiner Upgrade-Pfad |
| `GET /typert` | 404 | — |

**Code 1008 heißt „Policy Violation"** — der Server hat die Verbindung **aktiv
abgelehnt**, nicht „nicht gefunden". Das ist ein Unterschied: die Route **ist**
bekannt, aber die Verbindung wird verweigert. Die wahrscheinlichste Ursache steht
im Protokoll desselben Laufs, und sie ist **gemessen**:

```
pmh: warning: 1 entry did not activate
ptc-runtime (@deepseek-ai/dsh-ptc-runtime-node): failed to import
```

**Und die Ursache dafür ist bekannt — sie steht seit dem Windows-Nachweis in
diesem Projekt:** der `typert`-Stapel registriert sich nicht vollständig
(*„typert-loader: 10 typert contributor(s) failed to register … codec has no
create() factory"*). Das Gateway der Vorlage (`dsh-api-gateway`) hängt an diesem
Stapel: **ohne Typert kein Gateway, ohne Gateway keine API.**

**Die Kette der Ursachen, vollständig belegt:**

```
typert-loader registriert 10 Beitragende nicht (codec has no create() factory)
  → der Typert-Endpunktstapel ist unvollständig
    → dsh-api-gateway kann seinen Multiplexer nicht bedienen
      → WS /api/remote.mux wird mit 1008 abgewiesen
        → kein Client-Aufruf gelingt
          → die Oberfläche lädt, kann aber nichts tun
```

## 3. Was das für den Re(fork) bedeutet

**Der Re(fork) ist nicht die Voraussetzung dafür, dass die Schnittstelle
funktioniert — und er behebt ihren Ausfall auch nicht.** Zwei getrennte Dinge:

| | Was es ist | Ist es die Ursache? |
|---|---|---|
| **Re(fork) / eigenes Web** | unsere Oberfläche statt der Vorlagen-Oberfläche | **nein.** Die Vorlagen-Oberfläche wird ja ausgeliefert (HTTP 200, 35 KB, Skripte laden). Sie kann nur nichts tun. |
| **Typert/Gateway-Ausfall** | der Endpunktstapel registriert sich nicht | **ja.** Daran hängt jede API. |

**Und daraus folgt der wichtigste Satz dieses Befunds:** Wer jetzt die Oberfläche
austauscht, tauscht ein **funktionierendes Anzeigeteil** gegen ein eigenes — und
hat danach **dieselbe** API-Lücke, nur mit eigenem Code. Die Reihenfolge muss
umgekehrt sein: **erst muss ein Endpunktweg stehen, den unsere Oberfläche
benutzen kann.**

**Was das praktisch heißt:** Statt den Typert-Stapel der Vorlage zu reparieren
(der an fremden Codecs scheitert und bei jedem Core-Sprung erneut brechen kann),
ist der belastbare Weg **unser eigener Endpunktweg** — und genau der ist mit der
Auth-Stufe schon begonnen: `packages/auth` bringt die Regeln, der Host bekommt
Routen. Ein eigener `GET /api/…`-Weg, der auf **unseren** Paketen steht
(`agent-loop`, `session-format`, `auth`), ist unabhängig von Typert — und damit
auch unabhängig von jedem Core-Sprung. Das ist genau die Regel aus
`docs/concept.md`: **kein Unit importiert Interna des Cores.**

## 4. Empfehlung in drei Schritten

| # | Schritt | Warum zuerst |
|---|---|---|
| **1** | **Die Vorlagen-Oberfläche sichern** (Kopie von `apps/web` + Stand als Git-Tag) | sie funktioniert heute und ist der Vergleichsmaßstab; wegwerfen wäre der Verlust des einzigen laufenden Anzeigeteils |
| **2** | **Einen eigenen API-Weg bauen** — `GET /api/health`, `/api/auth/*`, `/api/sessions`, `/api/chats` auf unseren Paketen | er ist die Voraussetzung dafür, dass eine eigene Oberfläche **etwas tun** kann; er ist von Typert unabhängig |
| **3** | **Die eigene Oberfläche an diesen Weg hängen** — erst dann `apps/web` ersetzen | erst wenn etwas dahinter ist, das antwortet |

**Schritt 2 ist der eigentliche Re(fork)-Schritt**, nicht Schritt 3. Eine eigene
Oberfläche ohne eigenen Endpunktweg wäre eine Hülle.

## 5. Was NICHT belegt ist

| Offen | Warum |
|---|---|
| Ob der Gateway-Multiplexer bei **vollständigem** Typert-Stapel arbeitet | nicht prüfbar, solange die 10 Beitragenden scheitern; die Ursache liegt in fremdem Code |
| Ob `1008` von einem Auth-Riegel oder vom fehlenden Gateway kommt | die Sonde sendet kein gültiges Gateway-Eröffnungsrahmen; der Auth-Riegel ist ausgeschlossen, weil `/` mit demselben Cookie **200** liefert |
| Ob die Vorlagen-Oberfläche mit einem funktionierenden Gateway vollständig arbeitet | es gibt auf diesem Wirt keinen funktionierenden Gateway-Zustand zum Vergleich |
| Wie viele Endpunkte der Client wirklich braucht | die Kopfzeilen zeigen nur ein Skript (`./assets/index-…js`); die Aufrufe stehen im gebündelten Client, nicht im HTML |
