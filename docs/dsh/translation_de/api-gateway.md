# API-Gateway

English | [中文](api-gateway.zh.md)

Dies ist die Referenz zum aktuellen Stand des Typert API Gateway. Sie beschreibt, wie Business-Services unäre und Stream-Remote-Methoden deklarieren, wie der Build Host- und Client-Contracts generiert und wie Aufrufe die Connection-RPC und die Route `/api` wiederverwenden. Session-Events, inkrementelle Daten und andere Streaming-Protokolle liegen außerhalb des Geltungsbereichs dieses Dokuments; sie können dieselbe Connection verwenden, nutzen aber keine Remote-Method-Deskriptoren.

## Programmiermodell

Business-Services verwenden `@Remote` oder `@RemoteScope`, um die für den Client exponierten Methoden auszuwählen. Nicht markierte Methoden gehen weder in die generierten Client-Typen noch in Runtime-Beiträge ein und können nicht über `ctx.remote` aufgerufen werden.

`@Remote` bezeichnet den Aufruf eines Cordis-Service, der auf dem Root-Host-Context registriert ist. Komplexe Host-Objekte können nicht direkt über die Leitung gehen; das Business-Paket muss ihre Zuordnung zu einer Wire-Identität über `TypertLookupMap` deklarieren und zur Laufzeit einen Standard-Auflösungs-Provider mit `ctx.typert.lookups` registrieren. Beispielsweise erzeugt ein Parameter `Agent` mit dem Namen `agent` in der Host-Signatur ein Wire-Feld `agentId`, und das Gateway löst diese Id zu einem Host-Objekt auf, bevor es die Business-Methode aufruft. Die Host-Komposition kann `ctx.typert.lookups.configure()` verwenden, um die Auflösungs-Policy für einen Lookup-Key zu überschreiben, ohne den Parameternamen, das Wire-Feld oder das kanonische Typ-Symbol zu ändern, die dem Business-Paket gehören.

`@RemoteScope(key)` löst zunächst eine Identität über `ctx.typert.contexts` zu einem gescopten Context auf, holt dann den Service aus diesem Context und ruft die Methode auf. Das gilt, wenn die Methode selbst von gescopter Komposition abhängt und keine Objekte wie `Agent` explizit erhalten muss.

Services erweitern normalerweise `TypertRemoteService`, damit der Konstruktor den Cordis-Service-Key und den Standard-Remote-Namespace explizit bindet. Ein Service, der bereits eine andere Basisklasse hat, kann stattdessen `readonly typertRemote = bindTypertRemote(this, serviceKey)` deklarieren; beide Formen hinterlassen eine inspizierbare öffentliche Bindung und hängen nicht davon ab, dass der Compiler ein Symbol in den Konstruktor injiziert.

```ts
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TypertRemoteService, Remote, RemoteScope } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

export interface CreateGoalRequest {
  objective: string
}

export interface CreateGoalResult {
  accepted: boolean
}

export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @Remote('create')
  createForClient(
    agent: Agent,
    request: CreateGoalRequest,
    signal: AbortSignal,
  ): CreateGoalResult {
    signal.throwIfAborted()
    return this.create(agent, request)
  }

  @RemoteScope('agent', 'current')
  currentForClient(): CreateGoalResult {
    return { accepted: true }
  }

  private create(_agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    return { accepted: request.objective.length > 0 }
  }
}
```

Remote-Methoden können einen Wert synchron zurückgeben oder ein Promise zurückgeben. Für kooperative Cancellation muss der letzte Parameter der Host-Signatur `signal: AbortSignal` sein und den globalen Typ verwenden; er wird im Deskriptor aufgezeichnet statt in `args` einzugehen, während die generierte Client-Methode einen optionalen abschließenden `AbortSignal` akzeptiert.

`@Remote({ mode: 'stream' })` markiert eine Methode, die `Iterable`, `AsyncIterable` oder `RemoteStream<Out, In>` zurückgibt: Das Gateway liefert jedes yielded Item — einen Wert, den die Host-Methode erzeugt hat — über seinen gemultiplexten WebSocket `/api/remote.mux` oder einen In-Process-Carrier aus, und die generierte Client-Methode gibt einen `RemoteStreamHandle<Out, In>` zurück, der die Items durchläuft und `send`, `end` und `dispose` für den Client-zu-Host-Uplink desselben logischen Streams exponiert. Das zweite Typ-Argument von `RemoteStream<Out, In>` deklariert den Uplink-Item-Typ; das Gateway validiert jedes Item, das der Client sendet, weil es aus dem Browser kommt, mit dem generierten `In`-Codec, bevor die Host-Methode es über `this.ctx.invocation.uplink<In>()` liest. Der Uplink geht weder in `args` noch in die Parameterliste ein; die [Gateway-README](../packages/api/gateway/README.md) besitzt die Verträge zu Frame, Half-Close, Cancellation und Inbox-Bound.

Der Client verwendet konkrete Funktionen auf gewöhnlichen Objekten, keinen JavaScript-Proxy. Direkte und gescopte Aufrufe erscheinen unter `ctx.remote.<namespace>` und `agentCtx.remote.<namespace>`. Jeder Namespace ist ein getracter Cordis-Child-Service, registriert als `remote.<namespace>`; die Client-Assembly mountet Beiträge über `ctx.remote.$mount()`, und der Namespace wird entladen, nachdem seine letzte Methode zurückgezogen wurde. Abhängigkeitsdeklarationen gehören dem tatsächlichen Aufrufer: Nur ein Business-Paket, das `ctx.remote.<namespace>` oder `agentCtx.remote.<namespace>` liest, deklariert sowohl `remote` als auch `remote.<namespace>` in seinem eigenen `inject`; Assemblies, die nur Beiträge mounten, und höherstufige Runtimes, die diesen Namespace nicht aufrufen, deklarieren die Namespace-Abhängigkeit nicht im Namen des Business-Pakets. Wenn eine `@Remote`-Methode genau einen Lookup-Parameter hat und eine gleichnamige `TypertContextMap` dieselbe Wire-Identität verwendet, lässt die generierte gescopte Signatur diesen Identitätsparameter weg. `@RemoteScope` generiert nur die gescopte Aufrufschnittstelle.

```ts ignore-check
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.goals']

declare const ctx: Context
declare const agentCtx: AgentContext
declare const agentId: SessionId

await ctx.remote.goals.create(agentId, { objective: 'ship it' })
await agentCtx.remote.goals.create({ objective: 'ship it' })
```

Client-Anwendungen assemblieren nur `@deepseek-ai/dsh-api-remotes`. Dieses Paket importiert die Subpfade `/remote` ausgewählter Business-Pakete als Runtime-Werte, mountet ihre Beiträge über `ctx.remote.$mount()` und re-exportiert die Declaration Merges aus denselben Dateien. Das Hinzufügen eines Host-Remote-Pakets ist eine explizite Entscheidung des Owners der Client-Komposition; Business-Komponenten müssen das Typert Gateway oder das Remote-JS des Business-Pakets nicht separat laden.

Die Assembly `api-remotes` und der Vertrag `ctx.remote` sind React-unabhängig; die für eine beliebige Client-Assembly sichtbaren Host-Methoden sind auf die zur Generierungszeit ausgewählten Remote-Methoden begrenzt.

## Zuständigkeiten der Komponenten

| Ort | Paket oder Entry | Zuständigkeit |
|---|---|---|
| Gemeinsam | `@deepseek-ai/dsh-typert-protocol` | Deklariert Decorators, Gateway-Bindings, merge-erweiterbare Protocol-Maps, Invocation-Deskriptoren und Provider-Typen; startet keine TypeScript-Analyse und registriert keine Cordis-Services |
| Build | `@deepseek-ai/dsh-typert-generator` | Analysiert streng Remote-Signaturen, den Typgraphen, Lookups, Contexts und Quellorte aus dem Host-`ts.Program` und generiert dann Host- und Host-für-Client-Artefakte |
| Host | `@deepseek-ai/dsh-typert-registry` und Loader | Legt generierte Host-Deskriptoren, Schemas und Business-Paket-Registrierungen in `ctx.typert` ab und hält Lookup- und Context-Provider |
| Host | `@deepseek-ai/dsh-api-session-controller` | Besitzt die Identitäts-Policy für Anwendungs-Agent/Session und konfiguriert die entsprechenden Typert-Lookups |
| Host | `@deepseek-ai/dsh-api-gateway` | Stellt `ctx.typertGateway` bereit, beansprucht Remote-Endpunkte, validiert Request-Werte, löst Objekte oder Contexts auf und ruft Live-Cordis-Services auf |
| Client | `@deepseek-ai/dsh-api-gateway/client` | Stellt `ctx.remote` und Child-Services `remote.<namespace>` bereit, mountet generierte Deskriptoren als konkrete Methoden und initiiert und storniert Aufrufe über die Connection |
| Client | `@deepseek-ai/dsh-api-remotes/client` | Wählt und mountet explizit die von der Anwendung erlaubten Beiträge `/remote` und bringt die entsprechenden Declaration Merges in den Business-Code |
| Beide | `@deepseek-ai/dsh-client-connection` | Stellt den RPC-Carrier, Request-Korrelation, die Trust-Grenze, Cancellation, den Response-Envelope und die HTTP-Brücke `/api` bereit |

Das API-Gateway-Paket besitzt den Host-Dispatcher und den Client-Remote-Endpunkt als gleichrangige Entries, doch die beiden Builds gelangen nie in dasselbe `ts.Program`. Der Host-Entry importiert nicht den Cordis-`Context`-Merge des Client, und der Client-Entry importiert nicht den Host-Gateway-Service.

## Strikte Generierungs-Pipeline

Der Root-Build führt `build:lib:host`, `build:lib:client` und `build:web` der Reihe nach aus. Die Host-Lib-Phase führt zuerst `tsc -b tsconfig.host.json` aus, dann `tsdown --env.DSH_BUILD_FACE host`; der normale Host-Project-Reference-Graph kompiliert den Typert-Generator, der während dieses tsdown-Durchlaufs mit dem Host-Aggregat als einzigem `ts.Program`-Seed läuft. Die Client-Lib-Phase führt dann `tsc -b tsconfig.client.json` und `tsdown --env.DSH_BUILD_FACE client` aus und konsumiert die neu generierten Remote-Client-Deklarationen und Runtime-Beiträge, ohne Typert erneut zu starten.

Beide tsdown-Durchläufe matchen `vendor/*`, `packages/*/*` und `apps/cli`, der Host-Durchlauf zusätzlich `apps/desktop-host` ([Build-Reihenfolge](development.md#typescript-project-layout)), und beide bündeln nur JavaScript, das von der entsprechenden tsc-Phase nach `lib/types` emittiert wurde. Die Root-Konfiguration scannt keine Client-Artefakte, klassifiziert keine Paketnamen und übergibt keinen gepflegten Filter an tsdown; paketlokale Konfigurationen geben Entries für die aktuelle Phase auf Basis von `DSH_BUILD_FACE` zurück. Ein gewöhnliches Client-Plugin erzeugt während der Client-Phase sowohl seinen Node-Loader-Entry als auch sein Browser-Bundle.

`api/remotes`, `api/gateway`, `api/session-controller` und `api/workspace-controller` (plus `client/connection`) teilen die TypeScript-Faces auf. Das Client-Projekt von `api/remotes` hängt von den Deklarationen `/remote` ab, die für Business-Pakete während des Host-tsdown generiert wurden; Root-Aggregate und direkte Konsumenten müssen jeweils `tsconfig.host.json` oder `tsconfig.client.json` des aufgeteilten Pakets referenzieren. `clientBundle(..., { hostPhase: true })` von `api-remotes` erzeugt seinen Host-Entry während des Host-tsdown und überlässt dem Client-tsdown nur den Browser-Entry. Die Lookup-Policy für Agent/Session liegt in `@deepseek-ai/dsh-api-session-controller`, nicht in `api-remotes`.

Jedes beitragende Business-Paket schreibt generierte Dateien in sein eigenes `lib/`-Verzeichnis, nicht in sein Quellverzeichnis:

| Datei | Konsument | Inhalt |
|---|---|---|
| `typert.host.js` | Host-Loader | Runtime-Reflexion für das Host-Face, strikte Invocation-Deskriptoren und Schema-Registrierungswerte |
| `typert.host.d.ts` | Host-Typsystem | Generierte Deklarationen für das Host-Face |
| `typert.remote-client.js` | `api-remotes` | Ein mountbarer `TypertRemoteContribution` mit strikten Deskriptoren und Runtime-Codecs |
| `typert.remote-client.d.ts` | Client-Typsystem | Declaration Merges für `TypertRemoteNamespaceMap` und `TypertRemoteScopeMap` sowie Client-sichere Typreferenzen |
| `typert.remote-client.d.ts.map` | Editor | Mappt generierte Methoden-Properties zurück auf Remote-Method-Deklarationen im Host-Paket |

Business-Pakete exponieren den Host-Loader-Entry über `./typert` und den Host-für-Client-Entry über `./remote`. Der Generator validiert außerdem diese Paket-Exports und die Listen veröffentlichter Dateien; er generiert Artefakte nur für explizite Beitragspakete, die den entsprechenden Entry bereitstellen.

Parameternamen in Remote-Client-Deklarationen stammen aus Wire-Feldern, während Parameter- und Rückgabetypen Client-sichere Typen referenzieren, die das ursprüngliche Business-Paket exportiert. Die Declaration Map löst die generierte Property hinter `ctx.remote.goals.create` zurück auf die Host-Quellmethode auf, die mit `@Remote` markiert ist, sodass Editoren mit Unterstützung für Declaration Maps von einem Client-Aufruf zur echten Implementierung navigieren können, statt bei der generierten `.d.ts` zu stoppen.

Die strikte Analyse verlangt, dass ein Remote eine öffentliche, nicht-statische Instanzmethode mit konkreter Implementierung ist. Die Methode darf nicht generisch sein; Parameter müssen erforderlich, benannte einfache Identifier sein und dürfen keine Destrukturierung, Default-Werte, Rest-Parameter oder optionale Parameter verwenden. Typert generiert strikte Schemas für gewöhnliche JSON-repräsentierbare Typen; komplexe Objekte wie Workspace-Klassen müssen eine eindeutige `TypertLookupMap`-Deklaration haben. Lookup- und Context-Pakete sind sowohl für statische Declaration Merges als auch für die Runtime-Provider-Registrierung verantwortlich; fehlt eine der beiden Seiten, schlägt der Build fehl oder der erste Aufruf, der den Provider benötigt, schlägt fehl.

## Runtime-Aufruf

Remote-Aufrufe verwenden die Route `/api` der Connection. Das Client-Remote ruft `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)` auf; der HTTP-Carrier mappt dies auf `POST /api/<namespace>/<method>` mit einer Payload, die nur ein benanntes `args`-Objekt enthält.

Die Connection führt die vereinheitlichte Trust-Prüfung für `/api` vor der HTTP-Brücke durch und dispatcht dann innerhalb des gemeinsamen FetchHandler. Das Typert Gateway beansprucht nur zweisegmentige Endpunkte, die einen strikten Deskriptor oder einen aktiven SRC-Marker haben; es projiziert binäre Remote-Felder in JSON-kompatible Metadaten und ergebnisrelative Byte-Anhänge, die die Connection als Multipart-Responses framed. Feature-eigene exakte Fetch-Routen behandeln Responses außerhalb des RPC-Envelope, und andere Requests geben 404 zurück. Die Connection besitzt Transport, RPC-Ids, Response-Envelopes und Request-Cancellation, während das Gateway das Remote-Datenprotokoll und den Business-Dispatch besitzt. Der Austausch des Connection-Carriers erfordert keine Änderungen an Remote-Deskriptoren oder der Client-Programmierschnittstelle.

Für jeden Aufruf löst das Gateway den Deskriptor und den Live-Service aus den aktuellen Registries auf, statt Business-Objekte zu cachen. Es verlangt, dass die Felder in `args` exakt zum Deskriptor passen, validiert Wire-Werte mit Codecs, löst Objekte oder Receiver über registrierte Lookup- oder Context-Provider auf und ruft die vom Binding adressierte Service-Methode auf. Das Client-Gateway validiert dekodierte binäre Ergebnisse mit dem generierten Ergebnis-Codec; gewöhnliche JSON-Ergebnisse behalten ihre bestehende Behandlung. Ein fehlender Provider, eine unbekannte Identität, ein Binding-Mismatch, ein fehlendes oder zusätzliches Argument, ein Schema-Fehler oder eine fehlende Methode schlägt fehl, bevor der Business-Code betreten wird oder nachdem er verlassen wurde.

`register()` des Lookup-Providers liefert sowohl die stabile Deklaration als auch den Standard-Resolver; `configure()` liefert einen Resolver, der der Host-Komposition gehört, asynchron ausgeführt werden darf und auf eine Effect-Lebensdauer gescopt ist. Die Konfiguration darf dem Mounten des Providers vorausgehen; ohne Provider schlägt der Aufruf weiterhin mit `gateway/lookup-unavailable` fehl, und das Entladen der Konfiguration stellt die Standard-Policy des Providers wieder her. Der Session Controller besitzt die Standard-Resolver-Semantik für `agent` und `session`: Er verwendet einen Live-Agent wieder, setzt gewöhnliche kalte Sessions automatisch fort, dedupliziert nebenläufige Resumes und weist Identitäten zurück, die dem Subagent-Routing gehören; der Lookup `session` gibt die Session dieses Agent zurück. Ein Resume-Fehler und ein Ownership-Fence lösen einen `RemoteError` mit eigenem Code aus, `session/not-found` oder `session/agent-busy`, den das Gateway unverändert auf die Leitung kodiert; nur ein nicht klassifizierter Throw faltet sich in `gateway/internal`.

Das Entladen eines Client-Beitrags entfernt seine Deskriptoren und konkreten Methoden zusammen, bricht seine laufenden Aufrufe ab und lässt veraltete Methoden-Handles, die externer Code behält, weitere Aufrufe zurückweisen. Ein auf dem Host zurückgezogener strikter Endpunkt degradiert ebenfalls nicht zu SRC-Inferenz, wodurch verhindert wird, dass ein Hot-Unload die Validierung still schwächt.

## SRC-Entwicklungs-Fallback

Wenn der Host über `node --import tsx/esm` aus dem Quellcode startet, führt er das Typert-Compiler-Plugin nicht aus. Standard-Decorator-Initializer zeichnen den Methodennamen und den Invocation-Modus weiterhin in einem versionierten Deskriptor auf dem Service-Prototyp auf, während `TypertRemoteService` oder `bindTypertRemote()` das explizite Service-Binding liefern; das Gateway kann daher einen schwächeren temporären Deskriptor konstruieren, ohne ein `ts.Program` zu starten. Der stabile String-Property-Name des Deskriptors erlaubt es `remoteMethods()`, Marker zu lesen, die eine andere installierte Kopie des Protocol-Pakets geschrieben hat.

Der SRC-Fallback parst einfache Parameternamen aus der Live-Funktion. Wenn ein Parametername zum `parameter` eines registrierten Lookups passt, etwa `agent` oder `session`, verwendet er das Wire-Feld `agentId` oder `sessionId` des Lookups und löst das Objekt auf dem Host auf; andere Parameter werden nur auf zyklusfreie, JSON-sichere Daten ohne speziellen Prototyp geprüft. `@RemoteScope` verwendet direkt das Wire-Feld eines registrierten Host-Context-Providers. SRC liest keine TypeScript-Typen, generiert keine Zod-Schemas, inferiert keine optionalen Parameter und unterstützt keine Destrukturierung, Default-Werte, Rest-Parameter oder doppelte Parameternamen.

SRC löst nur den Dispatch für einen aus dem Quellcode laufenden Host-Prozess. Der Client entdeckt keine Decorators aus dem laufenden Host, und das Client-Remote weigert sich, SRC-Deskriptoren zu mounten, denen strikte Codecs fehlen; seine Typen, Codecs und Remote-Registrierungswerte stammen immer aus den zuletzt generierten Artefakten `lib/typert.remote-client.*`.

## Entwicklungsmodus

Die Web-Entwicklung läuft mit einem Befehl, der aktuelle Host-, Client- und Web-Artefakte baut, den Source-Host startet und Client-Bundles neu gebaut hält:

```sh
pnpm run dev:web
```

`dsh` startet den Host-Quellcode über tsx, sodass der Host den SRC-Fallback nutzen kann; die Watcher von `dev:web` bauen den Type-Emit des Client-Face, die Client-Plugin- und Library-Bundles sowie die Web-Shell bei Quelländerungen neu. Sie analysieren keine Host-Decorators und generieren kein Remote-Client-DTS; das tut nur der vollständige Build, den `dev:web` zuerst ausführt (oder `pnpm run build`).

Wird nur der Implementierungsrumpf einer Remote-Methode geändert, ohne ihren Vertrag zu ändern, ist keine Neugenerierung der Typert-Dateien erforderlich. Nach dem Hinzufügen oder Entfernen eines Decorators oder nach einer Änderung von Export-Name, Namespace, Parameter, Rückgabewert, Lookup, Context oder Cancellation-Signatur muss der geordnete Lib-Build erneut ausgeführt werden, damit der Host den strikten Vertrag generiert, bevor der Client den neuen Beitrag kompiliert und bündelt:

```sh
pnpm run build:lib
```

Der laufende Client-Watcher konsumiert diese generierten Dateien, wenn er neu bündelt. Wenn `pnpm run build:lib:host` den Host-Vertrag bereits aktualisiert hat, kann `pnpm run build:lib:client` die Client-Seite abschließen; ein sauberer Worktree kann die Host-Phase nicht überspringen. Das alleinige Neukompilieren des Frontend-Quellcodes kann keine neuen Typen aus Host-Decorators inferieren. `pnpm run typecheck` führt die Host-Lib-Phase vor dem Client-tsc aus, und CI- und Release-Builds verwenden dieselbe Reihenfolge.

## Grenzen

Remote behandelt unäre Methodenaufrufe mit einem Request und einem Ergebnis sowie Stream-Methoden, deren Items von Host → Client fließen, während die Items des Client über `this.ctx.invocation.uplink()` zur laufenden Host-Methode gelangen. Session-Event-Streams, Pagination, inkrementelles Reduce, Projektion und Entity-Substreams erfordern weiterhin ein eigenes Datenprotokoll und Registrierungsmodell; selbst wenn sie die Connection wiederverwenden, dürfen sie sich nicht als Remote-Methoden ausgeben oder in Invocation-Deskriptoren eingehen.

Die API-Schichten sind als `remotes → gateway → connection → webserver` organisiert. Die BFF- und Typert-RPC-Schichten liegen unter `packages/api`; Connection und WebServer liegen in `packages/client/connection` und `packages/host/webserver`. Unäre Ergebnisse, die `Uint8Array` enthalten — einschließlich verschachtelter Felder und Array-Einträge — verwenden [binären Remote-Transfer](../.agents/notes/implemented/architecture/2026-09-17-workspace-file-binary-transfer.md). Ein Feature, das eine Response außerhalb des RPC-Envelope benötigt, registriert eine exakte Connection-Fetch-Route.

Die Lookup-Policy wird pro Key konfiguriert, sodass alle Parameter `agent` oder `session` das Cold-Resume-Verhalten teilen. Nur Live-Objekte zu akzeptieren würde eine explizite Policy pro Parameter oder pro Endpunkt erfordern, die nicht existiert; die Business-Methode darf nicht vermuten, ob das Objekt aus einer Wiederherstellung stammt.
