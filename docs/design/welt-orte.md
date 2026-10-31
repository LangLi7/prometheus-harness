# Die Orte der Welt — vom handgeschriebenen Beispiel zum echten Bestand

> **Stand:** 15.10.2026 · **Auftrag:** *„die sollte automatisch erkennen oder per harness selbst
> implementiert also eine liste erstellt wird aus dem Prometheus harness Chat Mode verlauf und sub chat
> ect yk? wie ein sub reddit stile oder thread eher. wir sollten nur noch den chat Harness von
> Prometheus api schnittstelle ect mit dem Universe verbinden nutzen … denke mal nach eine
> Professionelle lösung und industrielle design."*
>
> **Was hier steht:** der Befund (gemessen), das Datenmodell, **zwei** Wege mit einer Empfehlung, der
> Vertrag — und was davon **noch nicht gebaut** ist.

---

## 1. Der Befund: die Liste ist von Hand

`apps/universe/src/main.ts` trägt `ISLAND_GROUPS` — **elf Einträge, wörtlich im Code**:

```ts
{ icon: 'solar-system', labelKey: 'island.item.solar', query: 'Sonnensystem', … }
{ icon: 'stack',        labelKey: 'island.item.stack', query: 'projekt-stack', … }
{ icon: 'star',         labelKey: 'island.item.sun',   query: 'Sonne', … }
```

Sie zeigen auf **Beispielkörper** im Modell-Universum (`universe.ts`), nicht auf das, was im Harness
wirklich existiert. Der Betreiber hat zweimal darauf gezeigt: einmal mit dem Projektbaum im Editor,
einmal mit der Liste der **Arbeitsbereiche und Automatisierungsaufgaben** in der Harness-Oberfläche.
Sein Satz dazu: *„ich habe mal gezeigt was ich meine mit projekt stack unterschied workspaces anstatt
per hand"*.

**Und die Liste ist schon einmal aus demselben Grund korrigiert worden** — der Kommentar steht im
Code: *„Ein erster Anlauf hatte hier die Beispielnamen aus der Skizze übernommen (`btc-dqn-experiment`,
`session-alpha`) — die gehören zu einem anderen Vorhaben, und ein Eintrag, der nichts findet, ist
schlimmer als kein Eintrag."* Der Schritt, der jetzt fehlt, ist derselbe eine Schritt weiter:
**die Liste gar nicht mehr schreiben.**

---

## 2. Was gemessen ist — die drei Hindernisse

Bevor ein Vertrag entworfen wird, gehört gemessen, **was im Weg steht**. Drei Dinge, alle geprüft:

### 2.1 Die API des Kerns ist kein REST — sie ist ein RPC über einen Mux

`@deepseek-ai/dsh-api-gateway` registriert **einen** WebSocket-Pfad und **einen** RPC-Kanal:

| Konstante | Wert | Quelle |
|---|---|---|
| `REMOTE_STREAM_MUX_PATH` | **`/api/remote.mux`** | `stream-protocol.ts:7` |
| RPC-Kanal | `connection.rpc.intercept('/api', …)` | `index.ts:233-239` |

Dazu kommen **Claims** (`claimsEndpoint`), **Leases**, **Uplink/Downlink** je Aufruf und eine
Fehlertabelle mit 14 Einträgen (`gateway/arguments-invalid`, `gateway/lookup-unavailable`, …). Das ist
ein **protokolliertes Verfahren**, keine Oberfläche, die man mit `fetch('/api/workspaces')` bedient.
**Wer es nachbaut, baut einen zweiten Client** — und der driftet mit der nächsten Fassung des Kerns.

### 2.2 Die Sitzungen liegen komprimiert und versioniert auf der Platte

Gemessen im Harness-Home dieser Maschine:

```
.pmh-build/harness-home/sessions/
  --C-Users-Chang-prometheus-harness--/        ← ein Ordner je Arbeitsbereich
    session-01b6fe52-…/session.v4.jsonl.zstd   ← zstd-komprimiert, Format v4
    session-02fd48ec-…/session.v4.jsonl.zstd
```

**Zwei Gründe, das NICHT selbst zu lesen:** das Format ist **komprimiert und versioniert** (`v4`), und
es gehört dem Kern. Ein eigener Leser wäre eine zweite Wahrheit über ein Format, das der Kern
versioniert — und beim nächsten `v5` liest er Unsinn, ohne daß es auffällt.

### 2.3 Die Welt ist eine **eigene Seite**

`apps/universe` ist eine statische SPA auf **derselben Herkunft** wie der Chat (ein Port). Sie hat
also **denselben Keks-Speicher** — aber **keine** Cordis-Client-Laufzeit. Die Client-Pakete des Kerns
(`dsh-api-session-controller`, `dsh-api-workspace-controller`, …) laufen im **Chat**, nicht in der
Welt.

---

## 3. Das Datenmodell — Subreddit statt Liste

Der Betreiber hat die Form selbst genannt: *„wie ein sub reddit stile oder thread eher"*. Das ist eine
**drei-stufige** Ordnung, und sie paßt auf das, was der Harness wirklich hat:

```
ORT (ein Arbeitsbereich)            ← die „Community"
  └─ Faden (eine Sitzung)           ← der „Thread"
       └─ Beitrag (ein Auftrag/Turn) ← der „Post"
```

| Welt-Ebene | Harness-Begriff | Was der Betreiber darin sieht | Beispiel aus seinem Bild |
|---|---|---|---|
| **Ort** | Arbeitsbereich (`prometheus-harness`, `Standard-Arbeitsbereich`) | „wo ich arbeite" | `prometheus-harness` |
| **Faden** | Sitzung / Automatisierungsaufgabe | „woran ich arbeite" | „Harness-Checkup erstellen", „Fünf Werkzeugproben ausführen" |
| **Beitrag** | Auftrag (Turn) in einer Sitzung | „was daraus wurde" | der letzte Auftrag mit Ergebnis |

**Und was in der Insel daraus folgt** (die heutige Form bleibt, der Inhalt wechselt):

```
◉ ORTE          ← Arbeitsbereiche (echte), je mit Anzahl Fäden
  ▤ prometheus-harness        12 Fäden · zuletzt vor 2 T.
  ▤ Standard-Arbeitsbereich    3 Fäden · zuletzt vor 1 T.
◉ FÄDEN (je Ort) ← die Sitzungen des Ortes, die letzte zuerst
  ▪ Harness-Checkup erstellen  live · 2 T.
  ▪ Fünf Werkzeugproben …      fertig · 2 T.
◉ OBJEKTE        ← was IN einem Faden liegt: Dateien, Panels, Berichte
```

**Subreddit-Stil heißt hier:** die **Orte** sind stabil und wenige, die **Fäden** sind viele und
sortiert (zuletzt oben), und man geht **durch** einen Ort hinein — nicht in eine flache Liste von
allem.

---

## 4. Zwei Wege — und eine klare Empfehlung

### Weg A — **eine kleine Lese-Fläche, die der Host ausliefert** (Empfehlung)

Ein **Host-Plugin** (Bauart wie `packages/web/world-static`) liest die Daten **serverseitig** — nicht
aus Dateien, sondern über die **Dienste des Kerns** (`workspace`, `session`) — und liefert sie als
**einfaches JSON** unter einem eigenen Pfad aus:

```
GET /universe/api/places          → application/json
{
  "stand": "2026-10-15T18:04:11.402Z",
  "orte": [
    { "id": "prometheus-harness", "name": "prometheus-harness", "fadenAnzahl": 12,
      "zuletzt": "2026-10-13T…",
      "faeden": [ { "id": "…", "titel": "Harness-Checkup erstellen", "stand": "laeuft", "zuletzt": "…" } ] }
  ]
}
```

| | |
|---|---|
| **Warum das der richtige Weg ist** | Der Kern bleibt die **einzige** Quelle (er liest die `v4.zstd`, er kennt die Version). Die Welt bekommt **eine** Form, die sie versteht. Der Vertrag ist **klein und versionierbar** (`/api/places?v=1`), **cachebar** und **prüfbar** — ohne Keks, ohne Kanal, ohne Lease. |
| **Was er kostet** | Eine zweite Fläche, die gepflegt werden muß. Und: die Daten sind **so frisch wie der Aufruf** — für eine Navigation ist das genug. |
| **Was er NICHT tut** | Er gibt **nichts** vom RPC-Kanal preis (keine Claims, keine Fähigkeiten, kein Schreiben). Er ist **lesend** — und das steht als Eigenschaft im Code, nicht nur in dieser Datei. |

### Weg B — **die Welt nimmt am RPC teil**

Die Welt startet eine eigene Cordis-Client-Laufzeit und benutzt dieselben `dsh-api-*`-Clients wie der
Chat.

| | |
|---|---|
| **Was er könnte** | **Live** — Ereignisse im Augenblick („Faden läuft gerade"), ohne Abfragen. |
| **Was er kostet** | Die **zweite** Client-Laufzeit auf einer Seite, die heute **keine** hat: Bündel, Verbindung, Wiederaufbau, Sitzungszustand. Dazu die Frage, ob zwei Laufzeiten auf einer Herkunft denselben Kanal friedlich teilen — **ungemessen**, und damit zur Zeit **unverantwortlich** zu bauen. |

### **Empfehlung: A zuerst, B später — mit demselben Vertrag**

Die Insel liest **immer** `{ orte: [ { faeden: […] } ] }`. Woher die Form kommt, ist ihr gleich. Damit
ist ein späterer Wechsel auf Live-Daten **kein Umbau der Oberfläche**, sondern ein Wechsel der Quelle
— und die Prüfungen der Insel bleiben dieselben.

---

## 5. Was **gebaut** ist — und was nicht

**Gebaut in dieser Runde:**

* **Der Befund ist festgehalten** (§1–§3) — mit den drei gemessenen Hindernissen.
* **Ein kleiner Anzeigefehler ist behoben**, der im Bild des Betreibers stand: die Kopfzeile der Insel
  brach um („Übersicht" über „öffnen"). Seit die Marke ein **Zeichen** trägt, ist der Kopf 15 px
  breiter — jetzt steht `white-space: nowrap` auf der Überschrift, und der **Zusatz** daneben (der
  Raum) wird bei Platzmangel **gekürzt** statt umgebrochen.

**NICHT gebaut — und der Grund:**

* **Die Lese-Fläche (§4 Weg A).** Sie muß die **Dienste des Kerns** benutzen (`workspace`, `session`),
  und dafür braucht es deren **tatsächliche** Fassade — welche Methoden, welche Felder, welcher
  Rückgabetyp. Das habe ich **nicht** recherchiert, und ich baue es **nicht** auf Verdacht: ein
  Vertrag, der auf geratenen Feldnamen steht, ist genau die zweite Wahrheit, die dieses Dokument
  vermeiden soll. Der erste Schritt der Umsetzung ist deshalb: **die Fassade nachsehen** (in
  `@deepseek-ai/dsh-api-workspace-controller` und `…-session-controller`, serverseitig) und daraus
  `places.ts` schreiben.
* **Die Sitzungen selbst lesen.** Siehe §2.2 — komprimiert, versioniert, dem Kern gehörend.
* **Ein Schreibweg.** Die Welt **zeigt**; sie legt keine Sitzungen an. Alles andere wäre eine
  Berechtigungsfrage, die noch niemand gestellt hat.

---

## 6. Der Weg dahin — vier Schritte, jeder prüfbar

| # | Schritt | Fertig, wenn |
|---|---|---|
| 1 | **Die Fassade nachsehen**: welche Methoden bieten `workspace` und `session` serverseitig, um Arbeitsbereiche und Sitzungen **aufzulisten**? | es steht mit Quelle im Repo (Paket, Datei, Zeile) — wie `docs/reference/inventory-*.md` es für andere Dienste tut |
| 2 | **Der Auslieferer**: `packages/web/world-places`, eine Route `GET /universe/api/places`, lesend, mit `--pruefen`-barem Vertrag und Prüfungen ohne Kern (Attrappen der Fassade) | die Prüfungen laufen **ohne** laufenden Harness, und ein fehlender Dienst antwortet **503 mit Grund** statt leer |
| 3 | **Die Insel liest**: `apps/universe/src/places.ts` holt die Liste, `ISLAND_GROUPS` wird daraus **gebaut**; die Beispielorte bleiben als **Rückfall** (und sind als solcher benannt) | ohne Harness sieht die Insel aus wie heute; mit Harness zeigt sie die **echten** Orte, und ein Test belegt beide Wege |
| 4 | **Der Raum-Zusatz**: ein Ort öffnet die Welt **in seinem Raum** (`?room=`), damit „wo ich arbeite" auch „wo ich hinsehe" bedeutet | ein Klick auf einen Ort wechselt den Raum — sichtbar in der Adresse **und** im Bild |

**Und die Reihenfolge ist keine Bequemlichkeit:** Schritt 2 ohne Schritt 1 wäre geraten, Schritt 3 ohne
Schritt 2 hätte keine Quelle, und Schritt 4 ohne Schritt 3 hätte keine Orte.

---

## 7. Offen und benannt

1. **Der Vertrag ist entworfen, nicht vereinbart.** Feldnamen wie `fadenAnzahl` sind ein Vorschlag;
   verbindlich wird er mit Schritt 1.
2. **Aktualität.** Weg A liest beim Aufruf. Ob die Insel **von selbst** nachlädt (alle 30 s? beim
   Öffnen?), ist nicht entschieden — beim Öffnen ist die ehrliche Antwort, und mehr ist für eine
   Navigation nicht nötig.
3. **Berechtigung.** Die Route liegt hinter derselben Anmeldung wie der Chat (gleiche Herkunft, Keks).
   Ob **jeder** angemeldete Nutzer **alle** Arbeitsbereiche sehen darf, ist eine Frage an die
   Auth-Schicht — und sie ist **nicht** von dieser Seite zu beantworten.
4. **Was ein „Faden" genau ist.** Eine Sitzung, eine Automatisierungsaufgabe und ein Subagent sind
   heute **drei** Dinge mit ähnlicher Form. Welche davon in die Insel gehören (alle drei?) ist eine
   Produktentscheidung — der Vertrag kann sie alle tragen, die Insel sollte **wenige** zeigen.
5. **Die Beispielorte verschwinden nicht.** Sie bleiben als **Rückfall**, wenn kein Harness läuft —
   aber sie müssen als solcher **erkennbar** sein (eine Marke „Beispiel"), sonst hält sie jemand für
   echte Daten. Das ist eine Anforderung an den nächsten Schritt, kein offener Punkt.
