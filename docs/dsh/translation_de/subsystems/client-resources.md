# Client-Ressourcen

English | [中文](client-resources.zh.md)

Das Client-Ressourcenmodell verwandelt eine Adresse in laufende Daten für jede Web-Client-Komponente. [`dsh-client-resources`](../../packages/client/resources/README.md) stellt den Service `ctx.resources` und den globalen Standard-Hook `useResource` bereit; ein Paket, das eine Art von Inhalt besitzt, registriert einen **Provider** für sein **Protokoll**, und eine Komponente liest den aktuellen Zustand des Inhalts über die **Adresse**, ohne die Laufzeit des Owners zu importieren. Die Tabs der rechten Sidebar sind der erste Consumer des Modells ([Rechte Sidebar](sidebar-right.md)); die Entscheidungsaufzeichnung ist die [Agent Note zum Client-Ressourcenmodell](../../.agents/notes/implemented/architecture/2026-09-05-client-resource-model.md).

Diese Seite ist die Entwicklerreferenz: wie man eine Adresse schreibt, wie man einen Provider registriert, wie man eine Ressource liest, was die Zustände und Fehler bedeuten und wie das Modell eine Ressource hält und freigibt.

## Adressen

Eine Ressourcenadresse ist eine URL der Form `dsh-resource://<type>/…`. Der Host benennt das Protokoll und muss ein Schlüssel von `ResourceProtocolMap` sein; der Pfad gehört dem Protokoll selbst, und sein Owner prozentkodiert jedes Segment. Ein Protokoll, das einen Scope benötigt, legt ihn in den Pfad: die Adressen des `file`-Protokolls lauten `dsh-resource://file/session/<sessionId>/<path>`, wobei der Pfad workspace-relativ oder absolut mit beibehaltenen führenden Schrägstrichen ist, gebaut mit `fileAddressFor(sessionId, cwd, path)` und zurückgelesen mit `parseFileAddress(address)` aus [`dsh-util-workspace-path`](../../packages/util/workspace-path/README.md). Das Modell selbst liest nur das Schema und den Host: `protocolOf(address)` gibt den kleingeschriebenen Host einer `dsh-resource://`-URL zurück und `undefined` für alles andere. Adressen unter einem anderen Schema — das `sidebar://guide` der Sidebar — benennen keine Ressource und lesen als `none`.

| Adresse | Protokollschlüssel | Liest als |
|---|---|---|
| `dsh-resource://file/session/s1/notes/a.md` | `file` | die Metadaten von `notes/a.md` unter dem Workspace-Root von Session `s1`, wenn der `file`-Provider registriert ist |
| `dsh-resource://file/absolute/home/me/notes.md` | `file` | parsbar, scheitert aber mit `workspace-file/unknown-workspace`: keine autorisierende Session, und weder die aktuelle noch die Tab-Session wird geliehen |
| `DSH-RESOURCE://File/session/s1/a` | `file` | ein eigener Record: Adressen werden als Zeichenketten verglichen, und `openResource` akzeptiert nur die kanonische kleingeschriebene Schreibweise, die `fileAddressFor` ausgibt |
| `dsh-resource://subagentchat/session/c1?parent=p1&mode=continuable` | `subagentchat` | eine adressierte Subagent-Conversation, deren Wert eine `SessionReference` besitzt, bis die Ressource schließt |
| `sidebar://guide` | — | `none`: eine Navigationsadresse |
| `/home/me/notes.md` | — | `none`: keine URL |

## Einen Provider registrieren

Der Owner eines Protokolls deklariert seinen Werttyp auf `ResourceProtocolMap` und registriert einen Provider innerhalb seines eigenen `ctx.effect`, sodass das Protokoll genau so lange lebt wie das Plugin ([ein Protokoll bereitstellen](../../packages/client/resources/README.md#provide-a-protocol)). `open(address, { signal })` gibt einen Stream aus `RemoteResult`-Frames zurück — zuerst den aktuellen Zustand, dann einen Frame pro Änderung — und muss stoppen, wenn `signal` abbricht. Ein Fehler ist ein `ok: false`-Frame, der eine `RemoteFailure` trägt; ein Throw innerhalb des Streams ist ein Programmierfehler und wird nicht gefangen.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-resources/client'

interface NoteView { readonly title: string; readonly updatedAt: string }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources', 'remote']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }): AsyncIterable<RemoteResult<NoteView>> {
      const id = new URL(address).pathname.slice(1)
      yield await ctx.remote.notes.read(id, signal)
      for await (const change of ctx.remote.notes.follow(id, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

Ein Protokoll hat genau einen Provider; eine zweite Registrierung wirft. Eine Registrierung, während Adressen des Protokolls bereits gehalten werden, öffnet deren Streams sofort; die Entsorgung des Providers beendet diese Streams, und die Adressen lesen `none`, bis ein Provider zurückkehrt.

## Eine Ressource lesen

Jede Slot-Komponente erhält `useResource` in ihren Props, unabhängig von ihrem Scope ([Slots](slots.md)). `useResource<P>(address)` benennt das Protokoll als Typargument und gibt den aktuellen Snapshot der Adresse zurück; das Abonnieren ist es, was die Ressource offen hält, und eine Komponente, die mountet, während ein anderer Halter die Ressource am Leben hält, liest den neuesten Wert sofort, ohne den Stream erneut zu öffnen ([eine Ressource lesen](../../packages/client/resources/README.md#read-a-resource)).

| `status` | Bedeutung | `value` | `failure` |
|---|---|---|---|
| `none` | Für das Protokoll der Adresse ist kein Provider registriert, oder die Adresse ist keine Ressourcenadresse | `undefined` | `undefined` |
| `loading` | Der Stream des Providers ist offen und hat noch nichts geliefert | `undefined` | `undefined` |
| `live` | Der neueste Frame war erfolgreich | der neueste `ok`-Wert | `undefined` |
| `failed` | Der neueste Frame meldete einen Fehler | der letzte `ok`-Wert, beibehalten | die `RemoteFailure` des Frames |

```tsx ignore-check
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'

type Props = PropsRuntime<'sidebar.right.pane.tab'>

export function FileHeader({ useTabInfo, useResource, t }: Props) {
  const { tab } = useTabInfo()
  const meta = useResource<'file'>(tab.contentId)
  if (meta.status === 'failed') return <p role="alert">{t('failed', { code: meta.failure.code })}</p>
  return (
    <header>
      {tab.title}
    </header>
  )
}
```

Ein Consumer präsentiert `failed` selbst: das Modell behält den letzten Wert neben dem Fehler, damit ein Body veralteten Inhalt mit einem Hinweis statt einer Leere zeigen kann, und der nächste `ok`-Frame löscht den Fehler. Nichts im Modell erzeugt nutzersichtbaren Text.

## Halten und Freigeben

Eine Ressource ist lebendig, solange sie einen Halter hat: ein abonniertes `useResource` oder ein Pin. `ctx.resources.pin(address, signal)` hält eine Ressource offen, ohne zu abonnieren, bis `signal` abbricht, und ein bereits abgebrochenes Signal pinnt nichts; die rechte Sidebar pinnt die Adresse jedes offenen Tab-Records für die Lebensdauer des Records, sodass ein Tab-Wechsel einen Body aushängt, ohne seinen Stream zu schließen. Der erste Halter öffnet den Stream des Providers; die letzte Freigabe bricht ihn ab, verwirft den Wert und setzt den Snapshot auf `loading` (Provider vorhanden) oder `none` (abwesend) zurück. Ein Frame, den der Provider nach dieser Freigabe liefert, wird verworfen, und der Iterator wird zurückgegeben. `ctx.resources.source(address)` ist das nackte Observable hinter dem Hook, referenzstabil pro Adresse, für Aufrufer außerhalb von React; das Lesen seines Snapshots hält die Ressource nicht ([Lifecycle](../../packages/client/resources/README.md#lifecycle)).

Die meisten Streams tragen Metadaten statt Inhalt. Der Wert des `file`-Providers ist `WorkspaceFileStat { absolutePath, version, bytes? }`: der erste Frame kommt von Host-`stat`, und spätere Beobachtungen aktualisieren die Version. Ein Consumer liest Inhalt über den Remote-Namespace der Workspace Files; Preview besitzt das Aktualisieren unabhängig pro Tab ([`dsh-api-workspace-files`](../../packages/api/workspace-files/README.md)). Der `subagentchat`-Provider behält die adressierte Session und liefert ihre `SessionReference`, dann gibt er diese Referenz frei, wenn das Signal der Ressource abbricht.

## Grenzen

Records leben für die Lebensdauer der Seite: der Record einer Adresse bleibt, nachdem ihr letzter Halter gegangen ist, und hält keinen Stream und keinen Wert, sodass der Speicher mit der Anzahl je gelesener unterschiedlicher Adressen wächst. Ein Provider, der `signal` ignoriert, läuft bis zu seinem nächsten Frame weiter. Der Fehlertyp ist die `RemoteFailure` der Remote-Seite, sodass ein Provider, dessen Quelle kein Remote-Aufruf ist, eine erzeugen muss. Ein falsch geschriebenes Protokoll oder eine fehlerhafte Adresse liest als `none` ohne weitere Diagnose.
