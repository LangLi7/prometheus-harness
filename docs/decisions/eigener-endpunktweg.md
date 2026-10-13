# Entscheidung: der eigene Endpunktweg

> **Anlass.** Mein Vorschlag lautete: eigener API-Weg zuerst, *„unabhängig von
> Typert"*. Der Betreiber hat gefragt: **„why not — gute Vorschlag, die ist ja noch
> nicht vorhanden von Vorlage/Referenz-Harness."**
>
> **Diese Frage hat meine Begründung widerlegt — und den Vorschlag bestätigt.**
> Hier stehen beide, sauber getrennt.

## 1. Was die Referenz wirklich hat (gemessen)

**Die Vorlage hat keine REST-API.** Sie hat ein **typgetriebenes RPC**:

| Prüfung | Ergebnis |
|---|---|
| Pakete mit Endpunkt-Kennungen | **93** |
| Pakete mit Typert-Aufruftypen | **23** |
| Der Transportweg | **ein** WebSocket: `/api/remote.mux` (aus `dsh-api-gateway`) |
| `GET /api/…` | **gibt es nicht** — gemessen: 18 Pfade, alle 404 |

**Wie der Client arbeitet.** Es gibt keine HTTP-Routen. Der Client ruft
`<namespace>/<methode>`-Endpunkte über den Multiplexer, und die Aufruf-Stubs
werden aus den `.d.ts`-Dateien der Controller **erzeugt**. Die Fläche kommt also
**aus den Typdeklarationen**, nicht aus einer Routentabelle.

Die Controller, die diese Fläche anbieten:

```
dsh-api-account-controller · dsh-api-job-controller · dsh-api-session-controller
dsh-api-settings-controller · dsh-api-terminal-controller
dsh-api-workspace-controller · dsh-api-workspace-files · dsh-api-gateway
```

## 2. Was das für meinen Vorschlag bedeutet — die Korrektur

**Mein Satz war falsch:** *„unabhängig von Typert"* hat so getan, als gäbe es
daneben eine API, gegen die man sich entscheiden könnte. **Es gibt keine.** Es gibt
genau eine Schnittstellenfläche, und sie ist Typert.

| meine erste Begründung | was stimmt |
|---|---|
| „unabhängig von Typert" | **Typert ist die einzige Fläche.** Es gibt nichts, wovon man unabhängig wäre — man baut die Fläche **neu** |
| „nachbauen" | **Es gibt nichts nachzubauen.** 93 Pakete definieren Endpunkte; sie nachzubauen wäre kein Port, sondern ein zweites System |

**Und daraus folgt der Punkt, der meinen Vorschlag stützt statt ihn zu schwächen:**
Wenn die Vorlage **keine** erreichbare API hat — und auf diesem Rechner **ist** sie
ausgefallen (1008, Typert-Stapel) —, dann ist ein eigener Endpunktweg **kein
Fork**. Er ist **das erste Stück Schnittstelle, das dieses Projekt überhaupt hat.**

**Die richtige Begründung lautet deshalb:**

> Der eigene Endpunktweg ist nicht „statt der Vorlagen-API". Er ist **unsere
> erste API**. Er ist die Voraussetzung dafür, dass **irgendetwas** mit dem Kern
> reden kann — die Vorlagen-Oberfläche genauso wie eine eigene.

## 3. Der Befund, der die Umsetzung entscheidet (gemessen)

Der Webserver der Vorlage bietet eine **öffentliche, dokumentierte**
Routen-Anmeldung:

```
WebServer.register(route: WebRoute): () => void
WebRoute = { kind: 'exact' | 'prefix', path, handler }
WebServer.registerUpgrade(route: WebUpgradeRoute): () => void
```

Aus `node_modules/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts`:

> *„Register a named route. Duplicate (kind, path) throws — route patterns are
> **configured during startup** with 404 until its owner registers."*

**Das ändert alles.** Ich hatte in der Weisung geschrieben, ein eigener HTTP-Weg
brauche eine Änderung an `apps/cli` — das war **unnötig pessimistisch**. Der
Webserver ist ein **Cordis-Dienst** (`ctx.webServer`), und `register` ist seine
öffentliche Fläche. Damit ist der Weg:

```
ein Cordis-Plugin in packages/  →  ctx.webServer.register({kind:'prefix', path:'/api/…'})
```

**Und das erfüllt alle vier Regeln des Projekts auf einmal:**

| Regel (`docs/concept.md`) | Erfüllt, weil |
|---|---|
| 1 · Der Core ist unantastbar | nur `register` wird **benutzt**, nichts geändert |
| 2 · Kein Unit importiert Interna | `ctx.webServer` ist ein **deklarierter Steckplatz**, kein Internum |
| 3 · Dienste starten mit der Harness | das Plugin lädt mit dem Profil |
| — · absteckbar | eine Zeile in der Profil-Konfiguration nimmt es wieder heraus |

## 4. Warum HTTP und nicht Typert-RPC

Der Client der Vorlage spricht RPC über einen WebSocket. **Für unser eigenes
Angebot ist HTTP der bessere Weg**, und zwar aus drei Gründen, die zählen:

| | HTTP (unser Weg) | Typert-RPC (der Weg der Vorlage) |
|---|---|---|
| **Prüfbar ohne Client** | `curl` und ein Browser genügen | ein erzeugter Codec-Stub ist nötig |
| **Fehlersuche** | Status-Code, Kopfzeilen, Körper — alles lesbar | binäre Rahmen in einem Multiplexer |
| **Abhängigkeit** | keine | der Typert-Stapel (der hier **ausgefallen** ist) |

**Und der Punkt, der den Ausschlag gibt:** ein Endpunkt, den man mit `curl`
prüfen kann, lässt sich **belegen**. Ein RPC-Endpunkt, der einen erzeugten Stub
braucht, lässt sich nur mit dem eigenen Client belegen — und dann prüft man den
Client mit.

**Was wir dafür aufgeben:** Streaming über einen Kanal und die automatische
Typabbildung. Beides kommt später dazu, wenn es gebraucht wird — nicht vorab.

## 5. Die Fläche, mit der wir anfangen (klein, aber echt)

| Pfad | Was er beantwortet | Woher |
|---|---|---|
| `GET /api/health` | lebt der Dienst, welche Fassung, welche Dienste | nichts — nur der Prozess |
| `GET /api/auth/me` | wer bin ich (aus dem Cookie der Vorlage) | n/a |
| `POST /api/auth/login` | anmelden | `packages/auth` (108 Tests) |
| `POST /api/auth/logout` | abmelden | `packages/auth` |
| `GET /api/sessions` | Sitzungsliste (Keyset-Paginierung) | `session-format` + `db-schema` |
| `GET /api/chats/:id/messages` | Nachrichten, **seitenweise** | `session-format` |

**Der erste Endpunkt ist `GET /api/health`** — und zwar aus einem Grund: er ist
in **zehn Zeilen** fertig, er braucht **keine Datenbank** und **keine Anmeldung**,
und er beweist die ganze Kette: Plugin lädt → Route ist angemeldet → Antwort kommt
mit 200. Wenn **das** nicht läuft, läuft nichts anderes.

## 6. Was das für den Re(fork) bedeutet

**Die Vorlagen-Oberfläche wird weiterhin gesichert** (Kopie + Git-Tag), aber der
Grund ist ein anderer als ich zuerst geschrieben habe:

| meine erste Begründung | was stimmt |
|---|---|
| „sie ist der einzige laufende Anzeigeteil" | **richtig** — sie liefert 200 und 35.664 Zeichen |
| „Vergleichsmaßstab" | **richtig, aber wichtiger:** sie ist die **Vorlage für die eigene Oberfläche**, nicht ihr Ersatz. Sie zeigt, was die API können muss |

**Und der Re(fork) beginnt nicht mit der Oberfläche, sondern mit der Route.** Eine
Oberfläche ohne Route ist eine Hülle; eine Route ohne Oberfläche ist prüfbar.

## 7. Was offen bleibt

| Offen | Warum |
|---|---|
| Ob unser Endpunktweg die **Vorlagen-Oberfläche** bedienen soll | sie spricht Typert-RPC; das hieße, Typert nachzubauen. **Empfehlung: nein** — eigener Client, eigene Oberfläche |
| Ob RPC/Streaming später dazukommt | ja, wenn Live-Updates gebraucht werden; dann **zusätzlich**, nicht statt |
| Ob `ctx.webServer` auch unter Bun zuverlässig ist | gemessen ist nur, dass die Vorlage ihre eigene Route dort anmeldet (Grundgerüst antwortet mit 1008, also **ist** die Route da). Ein **eigenes** Plugin hat noch keine Route angemeldet — das ist der erste Test |
| Wie die eigenen Routen **authentifiziert** werden | das Cookie der Vorlage ist der Ausgangspunkt; ob unser `packages/auth` daneben oder darin arbeitet, ist die nächste Entscheidung |
