# Conversation-Assembly

English | [中文](conversation.zh.md)

Conversation ist die zielneutrale Assembly-Schicht zwischen einem `SessionEventLikeEntry`-Fenster des Client und Browser-Views. [`ui-conversation`](../../packages/client/ui-conversation/README.md) besitzt die Event- und View-Registries, eine identitätsstabile Bindung pro `SessionBinding`, Turn-/Step-Locations, inkrementelle Context-Assembly, Zielquellen, die gemeinsame Shell und die Eingabe-Orchestrierung. Zielpakete wie [`ui-chat`](../../packages/client/ui-chat/README.md) und [`ui-trajectory`](../../packages/client/ui-trajectory/README.md) besitzen ihre Definitions, finalen Snapshots und ihr Rendering.

Diese Seite definiert das Datenmodell und den Erweiterungspfad für einen geschäftseigenen Conversation-Knoten. Die [Web-Client-Architektur](web-client.md) verortet das Subsystem zwischen Client-Modellen und Slots; die [Entscheidung zur Conversation-Node-Assembly](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md) besitzt ihre Begründung.

## Datenmodell und Eigentum

Der Session-Controller besitzt das zusammenhängende geladene Fenster logischer Events. Jeder `SessionEventLikeEntry` ist entweder `{ type: 'event', event: SessionEvent }` für ein dauerhaftes Event oder `{ type: 'transient', event: AssistantLiveChunkEvent }` für eine nur im Client existierende Präsentation von `assistant/live-chunk`. Beide inneren Events legen `type`, `seq`, `time` und `data` offen. `ui-conversation` reicht diese Einträge an den Assembler weiter, ohne einen zweiten Historienstream zu öffnen. Ein `ConversationNodeAssembler` pro Session wendet jede registrierte Definition an und veröffentlicht eine unabhängige Quelle für jedes registrierte Ziel einer View.

| Konzept | Owner und Zweck |
|---|---|
| Event Definition | Ein Geschäftspaket gleicht jeweils ein dauerhaftes oder nur im Client vorhandenes transientes Event ab, korreliert es über ein stabiles `(kind, id)`, faltet deterministischen State und materialisiert optional einen Zielknoten. |
| Context | Die engine-eigenen geordneten Matches und der aktuelle State für ein `(kind, id)`. Dauerhafte und transiente Events dürfen Starts sein. Der früheste geladene Start initialisiert den State; spätere Matches aktualisieren ihn. Nachweis, der nur aktualisiert, bleibt ausstehend, bis sein Start geladen ist. |
| Location | Die engine-eigenen Session-, Turn- oder Step-Koordinaten, abgeleitet aus dauerhaften Grenz-Events. Definitions dürfen typisierte Daten auf einen Turn oder Step veröffentlichen. |
| View Definition | Ein Zielpaket erzeugt einen inkrementellen Builder pro Session und besitzt den finalen Snapshot-Typ für dieses Ziel. |
| Group Definition | Ein Geschäftspaket leitet die Wurzelreferenzen und Gruppen-Snapshots eines Ziels aus materialisierten Nodes ab; es besitzt Mitgliedschaft, Segmentierung, Zusammenfassungen und inkrementelle Caches. |
| View | Ein Slot-Eintrag wie Chat oder Trajectory liest nur seinen Ziel-Snapshot und rendert zieleigene Knoten. |

Chat und Trajectory dürfen dieselbe dauerhafte Eventfamilie erkennen, aber jedes behält seinen eigenen Definition-State und sein eigenes finales Knoten-Payload. Gemeinsame zielneutrale Maschinerie ist begrenzt auf Identitätsrouting, geordnetes Replay, Location-Daten, Vorgängerabhängigkeiten und die Veröffentlichungskadenz.

## Zielaktivierung

Jede Session behält eine monotone Menge aktiver Ziele. Eine Zielquelle zu erzeugen oder zu lesen, aktiviert sie nicht. Die Shell aktiviert explizit ihre persistierte oder neu gewählte View, während ein anderer Consumer ein Ziel über sein erstes Source-Abonnement aktiviert. Die erste Aktivierung erzeugt den Builder dieses Ziels und ruft `replace()` einmal aus den aktuellen zielindizierten Contexts auf. Spätere Flushes rufen `apply()` für jedes aktive Ziel auf, und ein Abmelden entfernt keines.

Die Shell besitzt die View-Auswahl und löst die registrierte bevorzugte View oder den Chat-Fallback auf, bevor gerendert wird, wenn eine Bindung erzeugt oder als aktuell gewählt wird, und nach Änderungen am View-Roster. Der Assembler erhält nur die aufgelöste Ziel-Id und wählt Chat oder ein anderes Standardziel nicht aus. Eine View eines Drittanbieters nimmt über dieselben Auswahl- und Aktivierungsoperationen teil. Eine View Definition darf `toolCallFocus(callId)` offenlegen; die Shell liefert Inspect nur für ein sichtbares Ziel, das diese Fähigkeit deklariert, und das Ziel bildet die Call-Id auf seine eigene Fokusidentität ab.

<a id="group-definitions"></a>
## Group Definitions

Der optionale Beitrag `ctx.uiConversation.groups.register(definition)` verwendet denselben effektgebundenen Registry-Lebenszyklus wie Event- und View-Registrierungen. Er erfordert ein bestehendes View-Ziel und weist doppelte Zielregistrierungen zurück, ohne einen Builder zu konstruieren. Jede Session erzeugt ihren eigenen Group-Kontext nur, wenn dieses Ziel aktiviert. Eine Registrierungsersetzung verwirft den alten Kontext und leert seine beobachteten Gruppen während des bestehenden Registry-Rebuilds.

Die [Gruppentypen](../../packages/client/ui-conversation/src/client/contract/groups.ts) definieren das vollständige Protokoll:

| Typ | Bedeutung |
|---|---|
| `ConversationGroupDefinition<Node, State, Data>` | `create()` initialisiert den sessionlokalen State; `update(context, input)` gibt seinen nächsten State zurück; `buildGroups(context)` gibt ausstehende Ausgabe oder `null` zurück. Ersetzungs-Eingabe erfordert Einträge und eine vollständige Gruppenersetzung. |
| `ConversationGroupInput<Node>` | `replace` liefert Zielreihenfolge, Timeline und synchrone Reader `readNode`, `readTurn` und `readPosition`. `apply` fügt projizierte `previous/current`-Node-Änderungen, lebenszyklische `changedTurns` und `changedTurnOrders` hinzu. Reader nicht im State behalten. |
| `GroupNodePosition` | Besitzender Turn, sofern vorhanden, und unmittelbar vorherige/nächste sichtbare Node-Schlüssel. Nachbarn bewahren Unterbrechungen, die eine nur auf Turns basierende Schlüsselliste auslässt. |
| `NodeReference` / `GroupReference` | Gebrandeter `NodeKey` oder `GroupKey`, unterschieden über `kind`. Eine Node-Referenz darf ein renderer-eigenes `groupPart` wählen; eine Auslassung wählt den ganzen Node. |
| `GroupSnapshot<Data>` | Unveränderlicher Gruppenschlüssel, Geschäftsdaten und geordnete Node-Referenzen. Gruppen können keine anderen Gruppen enthalten und keine Quell-Node-Daten besitzen. |
| `GroupUpdate<Data>` | `entries` ersetzt die vollständige Wurzelsequenz; nur Apply-Eingabe darf sie auslassen, um die Sequenz zu bewahren. Ersetzungs-Eingabe erfordert sowohl `entries` als auch `groups.replace`. `groups.replace.snapshots` ersetzt alle Gruppen; `groups.apply.upserts/removes` aktualisiert nur benannte Gruppenrecords. Eine Entfernung löscht keine Nodes. |
| `ConversationGroupDataMap` | Per Declaration Merging zusammengeführte Zuordnung von Ziel zu Daten, geteilt von Registrierung und `views.grouped(target)`. Nicht deklarierte Ziele haben keinen Gruppen-Payload-Typ. |
| `ConversationGroupedView<Data>` | Stabile Wurzel-`entries` und Reader `groupSource(key)` nach Schlüssel; eine entfernte Gruppe liest als `undefined`. |

Der Builder legt `groupInput()` offen, wenn Gruppierung registriert ist; fehlende Eingabe schlägt bei der ersten Aktivierung fehl. Er zeichnet die Node-Werte nach seinen eigenen Projektionen auf und bewahrt die inhaltsreine Reihenfolgeidentität. Der Assembler liefert geänderte Turns mit jedem Update; direkte Aufrufer von Builders ohne Gruppierung dürfen sie auslassen. Builder mit unabhängigen Quellen schieben ihre Benachrichtigungen auf `publish()`. Erste Aktivierung und gewöhnlicher Flush teilen dieselbe Sequenz: Location-Daten und Nodes materialisieren, den Builder aktualisieren, die Group Definition aufrufen, Gruppierung validieren und installieren, dann jede betroffene Ziel- und Location-Quelle veröffentlichen. Die Gruppenphase verwendet die bestehende Veröffentlichungskadenz erneut.

Zielpositions-Indizes liefern die Reader und identifizieren Turns, deren sichtbare Schlüssel oder Nachbarn sich geändert haben. `changedTurnOrders` enthält sowohl die Owner eines verschobenen Nodes als auch Turns, die an eingefügte oder entfernte ungescopte Nodes angrenzen; reine Lebenszyklusänderungen bleiben in `changedTurns`. Eine Geschäfts-Definition kann diese Turns neu segmentieren und nur Gruppen mit geändertem Inhalt aktualisieren. Strukturelle Ausgabe ersetzt weiterhin das vollständige Wurzelreferenz-Array, ohne dass unveränderte Node-Inhalte erneut gelesen werden müssen.

Der Group-Store validiert das gesamte eingereichte Ergebnis vor der Installation: Wurzel-Gruppenreferenzen und Records entsprechen einander eins zu eins, alle referenzierten Nodes existieren, und jedes `(NodeKey, groupPart)` besetzt höchstens eine Wurzel- oder Mitgliedsposition. Ein ganzer Node kann nicht neben einem seiner Teile bestehen. Doppelte Upserts, doppelte Entfernungen und gleichzeitiges Upsert/Remove einer Gruppe schlagen fehl. Reine Daten-Upserts behalten Wurzel- und Mitglieds-Arrays, lesen keine Nodes und benachrichtigen nur geänderte Gruppenquellen; eine vollständige Ersetzung revalidiert jede Referenz.

Renderer wechseln über die beiden Referenzarten und wählen Komponenten in der besitzenden View, nicht über ein Renderer-Feld in Gruppendaten. Wurzel-Node-Referenzen und referenzierte Gruppenmitglieder bilden die vollständige Render-Liste; nicht referenzierte Ziel-Nodes bleiben gespeichert, rendern aber nicht. Der Gruppenkörper liest Mitglieder getrennt von den Zusammenfassungsdaten. Präsentationsmodi müssen Komponententypen, Schlüssel und Mitglieds-Eltern bewahren; eine Änderung der Datenmitgliedschaft darf ein verschobenes Mitglied legitimerweise neu mounten. Das Framework interpretiert Teilvollständigkeit, Segmentierung oder Präsentations-Policies nicht.

## Replayfähige Eventfamilien

Vor dem Schreiben der Definition eine stabile Geschäfts-Id wählen. Jedes Event, das zum selben Node beiträgt, muss diese Id tragen oder sie unabhängig aus seinem eigenen Payload ableiten; der Client darf ein Update niemals „dem jüngsten unfertigen“ Context zuordnen.

Für einen Review-Job könnte der Event-Vertrag lauten:

| Event | Rolle | Erforderliche dauerhafte Fakten |
|---|---|---|
| `review/start` | eindeutiger Start | `reviewId`, Turn-/Step-Koordinaten, Titel |
| `review/progress` | Update | dieselbe `reviewId`, Koordinaten, replaybarer Fortschritt |
| `review/end` | Update | dieselbe `reviewId`, Koordinaten, finale Zusammenfassung |

Den producereigenen gebrandeten Id-Typ über die Prozessgrenze hinweg verwenden. Die `SessionEventMap`-Zusammenführung und die Payload-Typen in den reinen Typ-Export des Producers legen und diesen Export dann wegen seiner Seiteneffekte aus dem Client-Paket importieren. Jedes `(kind, id)` darf höchstens ein Start-Event haben. Ein Geschäft mit einem einzigen Event kann die stabile Identität des Events, etwa `event.seq`, als seine definitionslokale Id verwenden.

Inkrementelle Events werden unterstützt. Ganzwert-Checkpoints sind zu bevorzugen, wenn der Producer sie günstig emittieren kann, weil sie nützlich bleiben, wenn der Start außerhalb des geladenen Fensters liegt. Jedes Delta muss die stabile Id tragen und deterministischen State erzeugen, wenn es in aufsteigender Log-`seq` erneut abgespielt wird; es darf nicht von nur laufzeitlichem Speicher abhängen. Enthält das aktuelle Historienfenster nur Updates, behält der Assembler einen ausstehenden Context und baut keinen State, bis eine ältere Seite den Start liefert. Muss das Produkt rendern, bevor der Start geladen ist, muss ein terminales oder Checkpoint-Event genug vollständigen Fallback-State tragen, damit die Definition dieses Ergebnis direkt bauen kann; ihn nicht durch das Durchsuchen unzusammenhängender Events rekonstruieren.

Live-Assistant-Deltas treffen als nur im Client vorhandene `assistant/live-chunk`-Events ein. Reconnect-Baselines erweitern den aktiven prozesslokalen kompakten Stream zu denselben transienten Events, während dauerhafte `assistant/message`- und `assistant/attempt`-Events vollständige kompakte Streams für das Historienreplay einbetten. Ein transienten Event darf einen Context initialisieren. Jedes Tool-Delta und sein späteres `tool/call` können unter derselben callId als Start übereinstimmen, selbst bevor der Name eintrifft; nur das früheste ruft `start()` auf, und spätere Matches rufen `update()` auf. Ein vorbereitender Tool-Knoten wird erst sichtbar, wenn sein Name verfügbar ist. Historische Seiten erweitern abgeschlossene Nachrichten nicht zu Live-Deltas. Eine Definition, die Assistant-Ausgabe konsumiert, behandelt Live-Chunks und dauerhafte Abschlüsse über dieselben Matching- und Update-Schnittstellen, während unzusammenhängende Definitions `null` zurückgeben, ohne einen Stream zu erweitern.

## Definition und typisiertes Chat-Payload

Das Beispiel hält die Producer-Deklarationen und den Client-Beitrag in einem Block, damit die vollständige Beziehung sichtbar ist. In einer Paketfamilie die gebrandete Id und die `SessionEventMap`-Deklaration beim Event-Producer halten und die Definition, die Chat-Datenzusammenführung und den Renderer im Client-Plugin.

```ts ignore-check
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['uiConversation', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` ist ein Identitätsextraktor, kein Fold: er erhält nur das aktuelle `SessionEventLike` und gibt die definitionslokale Id und die Lebenszyklusrolle zurück. Nach einem Match lokalisiert der Assembler den Context über `(kind, id)` und initialisiert ihn aus seinem frühesten geladenen Start, ob dauerhaft oder transient. Jeder spätere Match ruft `update` auf, auch ein weiterer Start. Das Entfernen transienter Matches wählt den Start aus den verbleibenden Nachweisen neu und berechnet den State neu; kein verbleibender Start lässt den State undefined. Beide Funktionen geben den State zurück, den die Engine übernimmt; ein neuer unveränderlicher Wert wird bevorzugt, aber eine Funktion, die dasselbe Objekt mutiert und zurückgibt, hat dieselbe Übernahmesemantik.

`ConversationNodeDefinitionInput` akzeptiert entweder diese Funktion oder eine schreibgeschützte Tabelle von Event-Typ zu Matching-Funktion. Registrierungen in Funktionsform erhalten jedes Event; Tabellenregistrierungen erhalten nur ihre aufgelisteten Typen. Die Registry kopiert Tabelleneinträge und berechnet geordnete Kandidaten-Sets vor, wenn sich Registrierungen ändern, sodass die Kandidatenkonstruktion aus dem Dispatch pro Event herausbleibt. Eine Tabelle wird ersetzt, indem abgemeldet und erneut registriert wird. Aufgelöste `ConversationNodeDefinition`-Werte behalten in beiden Fällen ein aufrufbares `match(event)`.

`buildLocationData(context, scope)` veröffentlicht optional definitions-eigene Daten auf einem engine-eigenen Turn oder Step. Declaration Merging verwenden, um jedem Schlüssel einen präzisen Werttyp zu geben. Ein anderer Node in derselben Location kann diesen Wert über seinen eingeschränkten Slot-Hook konsumieren, etwa `useTurnData(key)`, ohne die Session zu erhalten oder `snapshot.chat.nodes` zu durchsuchen.

`target` und `buildViewNode(context)` deklarieren einen zieleigenen Rendering-Beitrag und müssen zusammen auftreten. `context.key` als React-seitige Identität bewahren, `anchorSeq` aus der Reihenfolge der abgeglichenen Events wählen und nur renderer-fertige Daten zurückgeben. Sobald ein Ziel-Node veröffentlicht wurde, weiterhin denselben Schlüssel zurückgeben; `visibility: 'hidden'` verwenden, wenn er den sichtbaren Fluss vorübergehend verlassen soll, statt ihn mit `null` zurückzuziehen.

## Vorgänger-Reads

Einige Definitions benötigen den jüngsten früheren State einer anderen Geschäftsart. `start` erhält einen `ConversationContextReader`; dort `reader.previous<State>(kind)` aufrufen, statt eine Context-Sammlung zu akzeptieren oder Events zu durchsuchen. Der Reader gibt den nächstgelegenen gestarteten Context vor der `seq` des aktuellen Starts als schreibgeschützte Daten zurück.

Der Assembler zeichnet diese Abhängigkeit auf. Liefert ein älteres Prepend später einen näheren Vorgänger, schließt es eine zuvor unbekannte Lücke im Fenster oder revidiert es den Vorgänger-State, führt er den abhängigen Context von `start` neu aus und spielt seine Updates in aufsteigender `seq` erneut ab. Die abgefragte Definition bleibt dafür verantwortlich, nützlichen State zu schreiben; der Reader legt keine geschäftsspezifischen Abfragemethoden offen und gewährt keine Mutationsbefugnis über einen anderen Context.

## Pfade für Fensteraktualisierungen

Historie darf vom Ende rückwärts seitenweise angefordert werden. Das Session-Journal validiert zuerst nicht überlappende logische Sequenzbereiche; der Assembler ordnet akzeptierte Eingaben dann nach ihrer ersten `seq`, bevor der State erneut abgespielt wird.

| Pfad | Engine-Arbeit | Für Definitions sichtbares Verhalten |
|---|---|---|
| Ersetzen beim Öffnen, Resync oder Lückenschluss | Das geladene Fenster neu aufbauen, jedes Standard-Event oder jeden gepackten Lauf einmal pro Definition abgleichen, dann jeden gestarteten Context erneut abspielen | `start`, gefolgt von seinen Updates in aufsteigender logischer `seq`; ausstehende Contexts mit nur Updates bleiben ohne State |
| Eine ältere Seite voranstellen | Nur frische ältere Eingaben abgleichen, sie über `(kind, id)` in Contexts zusammenführen, bestehende Knoten mit Schlüssel bewahren und nur betroffene Contexts und Abhängigkeiten erneut abspielen | Ein neu gefundener skalarer Start aktiviert seinen gesammelten skalaren und gepackten Updates; eine geänderte Location oder ein geänderter Vorgänger darf den Context neu ausführen |
| Ein Live-Event anhängen | `match` jeder Definition einmal aufrufen, den abgeglichenen Context über den Schlüssel nachschlagen und nur diesen Context aktualisieren | Ein skalares `update` und eine angeforderte Veröffentlichung für ein passendes Event nach dem Start; kein Scan bestehender Contexts |

Mit `D` registrierten Definitions führt ein eingehendes skalares Event oder ein gepackter Lauf `D` Matches auf der aktuellen Eingabe und nach einem Match einen Context-Schlüssel-Lookup in konstanter Zeit aus. Definition-Code muss diese Eigenschaft bewahren: auf dem normalen Append-Pfad nicht das vollständige Event-Fenster, jeden Context, `context.matches` oder die gerenderte Node-Sammlung durchlaufen. State für angesammelte Fakten verwenden, Location-Daten für gemeinsame Nutzung innerhalb eines Turns oder Steps und `reader.previous()` für indizierte Vorgängerabhängigkeiten.

`publication` steuert, wann geänderter State materialisiert wird. `immediate` für strukturelle oder terminale Änderungen verwenden, `animation-frame` für hochfrequente sichtbare Deltas und `none`, wenn die State-Änderung nur eine spätere Veröffentlichung speist. Die Engine wendet jedes skalare Update in Log-Reihenfolge an und jeden gepackten Lauf in einem Batch-Update; die Kadenz coalesced nur die View-Veröffentlichung.

## Verifikationspflichten

Fokussierte Tests hinzufügen, die diese Ergebnisse belegen:

1. Ein vollständiges Fenster, das durch Replace läuft, erzeugt den erwarteten finalen State, die Location-Daten, das Node-Payload und `anchorSeq`.
2. Ein nur aus Updates bestehender Schwanz bleibt ausstehend; das Voranstellen seines Starts erzeugt dasselbe Ergebnis wie ein vollständiges Replace.
3. Anfängliche Historie, gefolgt von einem Live-Append, erzeugt dasselbe Ergebnis wie das erneute Abspielen des kombinierten Fensters.
4. Das Voranstellen einer älteren Seite fügt frühere Zeilen hinzu, ohne bestehende Node-Werte mit Schlüssel zu ersetzen, deren Daten sich nicht geändert haben.
5. Wiederholte sichtbare Deltas bewahren `context.key` und veröffentlichen, wenn angefordert, höchstens einmal pro Animationsframe.
6. Der Renderer mit Schlüssel konsumiert nur `node.data` und eingeschränkte Location-Hooks; er durchsucht nicht das Event-Fenster der Session, die Contexts oder die Chat-Nodes.
7. Skalare und gepackte Assistant-Historie erzeugen denselben finalen State, dieselben Timing-Grenzen und denselben Ziel-Snapshot, während ein gepackter Lauf über Replace, Prepend, Location-Replay und Registry-Rebuild ein Match bleibt.
8. Eine Zielquelle zu erzeugen, leistet keine Builder-Arbeit; explizite Auswahl oder das erste Abonnement führt eine vollständige Ersetzung aus, spätere Updates erreichen jedes aktive Ziel, und wiederholte Aktivierung führt keine Ersetzung aus.

[`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/assistant.ts) für Streaming und Unterbrechung verwenden, [`inbox.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/inbox.ts) plus [`message.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/message.ts) für Vorgängerabfragen und [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables) für eine Definition, die Turn-Daten veröffentlicht, ohne einen eigenen Node anzulegen.
