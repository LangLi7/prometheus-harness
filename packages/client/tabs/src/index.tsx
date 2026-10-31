/**
 * **`@prometheus-harness/client-tabs` — Workspaces und Chat, jede Ansicht mit
 * eigener Adresse.**
 *
 * ## Der Auftrag (Betreiber, 28.10.2026)
 *
 * > *„erstelle mir die möglichkeit das ich beim prometheus quasi 2 dinge enthalten:
 * > `http://127.0.0.1:3080/` workspaces & chat — damit man es auch zb in neue tab öffnen
 * > kann und multi task ermöglicht"*
 *
 * Auf die Rückfrage, **welche Form**: *„Workspaces-Seite + Chat + Deep-Links"*.
 *
 * ## Was hier gebaut ist — drei Teile, ein Paket
 *
 * | Teil | Was es tut |
 * |---|---|
 * | **Das Panel `workspaces`** | eine eigene Fläche im Hauptbereich: jeder Arbeitsbereich mit seinen Sitzungen, jede Sitzung ein **echter Link** |
 * | **Der Adreßabgleich** | `?s=<Sitzung>` und `?w` werden beim Start gelesen und bei jedem Wechsel geschrieben — jeder Tab behält so seinen Chat |
 * | **Der Menüeintrag** | „In neuem Tab öffnen" an jeder Sitzungszeile der Seitenleiste, ebenfalls ein echter Link |
 *
 * ## Warum echte Links und keine Knöpfe
 *
 * Ein `<a href>` ist die einzige Form, die **jeder** Browser mit Strg-Klick,
 * Mittelklick und „In neuem Tab öffnen" versteht. Ein `onClick`, das
 * `history.pushState` ruft, sieht gleich aus und kann genau das **nicht**. Der
 * einfache linke Klick wird abgefangen und im selben Tab geöffnet (kein
 * Neuaufbau der Oberfläche); alle schweren Klicks bleiben dem Browser.
 *
 * ## Warum der zweite Tab wirklich unabhängig ist
 *
 * Die Auswahl einer Sitzung liegt **nicht** im `localStorage` — sie ist eine
 * Referenz im Speicher des Tabs. Zwei Tabs störten sich also nie *live*. Gestört
 * hat der **Reload**: beide kamen mit derselben wiederhergestellten Sitzung
 * zurück, und das ist der Punkt, an dem „zwei Chats nebeneinander" zerfällt.
 * Mit der Adresse kommt jeder Tab als **der** Chat zurück, der in seiner Leiste
 * steht.
 *
 * ## Was hier ausdrücklich nicht passiert
 *
 * * **Kein neuer Serverweg.** `/w` und `/c/<id>` sind gemessen `404`; die
 *   Abfrage (`?w`, `?s=…`) ändert den Weg nicht und damit auch nicht die eine
 *   Sperre vor `/` (`packages/api/auth-http/src/access.ts`). Siehe
 *   `src/adresse.ts`.
 * * **Kein Eingriff in die Seitenleiste des Kerns.** Der Menüeintrag hängt sich
 *   in die Liste, die der Kern dafür freigibt
 *   (`sidebar.workspaces.session.menu.item`); Sitzungszeilen selbst werden
 *   nicht nachgebaut.
 * * **Kein Toast.** Eine unbekannte Sitzungs-Kennung in der Adresse wird
 *   **still** hingenommen: die Oberfläche bleibt, wo sie ist, und schreibt die
 *   Adresse auf das, was sie zeigt. Ein Hinweis dafür wäre ein eigener Kanal
 *   (der Toast des Kerns gehört `ui-workspace`) — bewußt nicht gebaut.
 *
 * @module @prometheus-harness/client-tabs
 */

import { useCallback } from 'react'
import type { MouseEvent, ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import {
  aliasZiel,
  chatHref,
  gleichesZiel,
  hrefFor,
  istEinfacherKlick,
  PANEL_ID,
  parsePfad,
  PFAD_CHAT,
  PFAD_UEBERSICHT,
} from './adresse.ts'


import { mainSessionId } from './lage.ts'
import { DE, EN, NS } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    tabs: keyof typeof DE
  }
}

/**
 * Die Adreßform noch einmal nach außen — für den Bündel-Prüfer.
 *
 * `build.mjs` führt das **Gebaute** aus und fragt es; ohne diese Zeile müßte der
 * Prüfer die Form nachbauen, statt sie zu befragen. Dieselben Funktionen, kein
 * zweiter Weg.
 */
export {
  aliasZiel,
  chatHref,
  gleichesZiel,
  hrefFor,
  PANEL_ID,
  parsePfad,
  PFAD_CHAT,
  PFAD_UEBERSICHT,
  workspacesHref,
} from './adresse.ts'

/** Kennung des Pakets. */
export const name = 'tabs'

/**
 * Die Dienste, ohne die dieses Plugin nichts tun könnte.
 *
 * `uiWorkspace` ist der Weg in eine Sitzung (`openSession`) und in einen neuen
 * Chat (`startSession`) — beides gehört dem Panel-Besitzer, nicht diesem Paket.
 */
export const inject = ['slots', 'locale', 'layout', 'sessions', 'uiWorkspace']

/** Was `apply` an die Panel-Komponente reicht. */
export interface PanelInjected {
  /** Zurück in den Chat (derselbe Weg wie `ctx.layout.selectPanel(null)`). */
  readonly close: () => void
  /** Eine Sitzung im **diesem** Tab öffnen. */
  readonly openSession: (sessionId: string) => void
  /** Einen neuen Chat in einem Arbeitsbereich beginnen. */
  readonly newChat: (workspaceId: string) => void
}

/** Die Standard-Haken, die jeder Slot-Beitrag bekommt. */
export interface StandardHaken {
  readonly useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  readonly useSessions: SnapshotSelectorHook<SessionListState>
}

/** Die Props der Workspaces-Fläche. */
export type WorkspacesProps = PanelInjected &
  StandardHaken & {
    readonly t: TranslateNS<typeof NS>
  }

/** Die Props des Menüeintrags an einer Sitzungszeile. */
export interface MenuProps {
  readonly sessionId: SessionId
  readonly useMenuOpenState: () => readonly [boolean, (offen: boolean) => void]
  readonly openSession: (sessionId: string) => void
  readonly t: TranslateNS<typeof NS>
}

/**
 * Der Titel einer Sitzungszeile.
 *
 * `title` steht zur Laufzeit an der Zeile (`SessionSummary`), aber nicht in ihrer
 * Typdeklaration — dieselbe Grenze wie bei `retainedBy` in `lage.ts`. Fehlt der
 * Titel, ist „Neue Sitzung" die richtige Auskunft: eine leere Sitzung **heißt**
 * noch nicht.
 *
 * @param zeile - die Listenzeile (darf fehlen)
 * @param t - der Übersetzer
 * @returns der anzuzeigende Titel
 */
function zeilentitel(zeile: unknown, t: TranslateNS<typeof NS>): string {
  const daten = zeile as { readonly blank?: boolean; readonly title?: string } | undefined
  if (daten === undefined) return t('blank')
  if (daten.blank === true) return t('blank')
  return daten.title !== undefined && daten.title !== '' ? daten.title : t('blank')
}

/**
 * Die Workspaces-Fläche.
 *
 * **Alle Daten kommen über die Standard-Haken** (`useWorkspaces`,
 * `useSessions`) — kein eigener Zustand, keine eigene Abfrage. Was hier steht,
 * ist eine Sicht auf das, was der Kern ohnehin hält.
 *
 * @param props - Haken, Rückwege und der Übersetzer
 * @returns die Fläche
 */
export function WorkspacesPanel({ useWorkspaces, useSessions, openSession, newChat, t }: WorkspacesProps): ReactElement {
  const items = useWorkspaces((snapshot) => snapshot.items)
  const byId = useSessions((snapshot) => snapshot.byId)

  const oeffne = useCallback(
    (ereignis: MouseEvent<HTMLAnchorElement>, sessionId: string): void => {
      if (!istEinfacherKlick(ereignis)) return
      ereignis.preventDefault()
      openSession(sessionId)
    },
    [openSession],
  )

  return (
    <main className="pmh-ws">
      <header className="pmh-ws__head">
        <h1 className="pmh-ws__title">{t('title')}</h1>
        <p className="pmh-ws__lead">{t('lead')}</p>
      </header>

      {items.length === 0 ? <p className="pmh-ws__empty">{t('empty')}</p> : null}

      <ul className="pmh-ws__list">
        {items.map((bereich) => (
          <li className="pmh-ws__group" key={bereich.workspaceId}>
            <div className="pmh-ws__groupHead">
              <span className="pmh-ws__name" title={bereich.path}>
                {bereich.title}
              </span>
              <button className="pmh-ws__new" type="button" onClick={() => newChat(bereich.workspaceId)}>
                {t('newChat')}
              </button>
            </div>
            <p className="pmh-ws__path" title={bereich.path}>
              {bereich.path}
            </p>
            {bereich.sessionIds.length === 0 ? (
              <p className="pmh-ws__none">{t('noSessions')}</p>
            ) : (
              <ul className="pmh-ws__sessions">
                {bereich.sessionIds.map((sessionId) => (
                  <li key={sessionId}>
                    <a
                      className="pmh-ws__session"
                      href={chatHref(sessionId)}
                      title={`${zeilentitel(byId[sessionId], t)} — ${t('openTab')}`}
                      onClick={(ereignis) => oeffne(ereignis, sessionId)}
                    >
                      {zeilentitel(byId[sessionId], t)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

/**
 * Der Menüeintrag an einer Sitzungszeile.
 *
 * Ein `<a role="menuitem">` — der Kern rendert Menüeinträge als Zeilen; die
 * Rolle sagt, was es ist, das `href` macht daraus einen Tab. Der einfache Klick
 * schließt das Menü und öffnet die Sitzung hier; alles andere geht an den
 * Browser.
 *
 * @param props - Sitzung, Menü-Zustand, Rückweg, Übersetzer
 * @returns der Eintrag
 */
export function OpenInNewTabRow({ sessionId, useMenuOpenState, openSession, t }: MenuProps): ReactElement {
  const [, setzeOffen] = useMenuOpenState()
  return (
    <a
      className="pmh-tabitem"
      role="menuitem"
      href={chatHref(sessionId)}
      title={t('openTab')}
      onClick={(ereignis) => {
        if (!istEinfacherKlick(ereignis)) return
        ereignis.preventDefault()
        setzeOffen(false)
        openSession(sessionId)
      }}
    >
      {t('openTab')}
    </a>
  )
}

/** Das Zeichen in der Seitenleiste: vier Flächen, eine davon offen. */
export function WorkspacesIcon({ size = 20 }: { readonly size?: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" strokeDasharray="2.4 2.2" />
    </svg>
  )
}

/**
 * Hängt Panel, Menüeintrag, Stil und Adreßabgleich ein.
 *
 * **Die Reihenfolge ist Absicht:** erst die Beiträge, dann die Adresse. Die
 * Adresse darf `selectPanel('workspaces')` erst rufen, wenn es das Panel gibt —
 * der Kern wirft bei einer unbekannten Kennung. Gibt es das Panel noch nicht
 * (der Slot wird später deklariert), versucht es {@link oeffnePanel} erneut.
 *
 * **Kein `t` mehr.** Die Texte des Panels und des Menüeintrags kommen über den
 * Locale-Sitz der Eintragung (`locale: NS`); einen eigenen Bind braucht es seit dem
 * Wegfall des Rechtsklick-Menüs nicht mehr.
 *
 * @param ctx - der Client-Kontext
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, 'de', DE), 'tabs: Texte de')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'tabs: Texte en')

  ctx.effect(() => {
    const stil = document.createElement('style')
    stil.dataset.pmhTabs = ''
    stil.textContent = CSS
    document.head.append(stil)
    return () => stil.remove()
  }, 'tabs: Stil')

  const close = (): void => {
    ctx.layout.selectPanel(null)
  }

  const openSession = (sessionId: string): void => {
    ctx.uiWorkspace.openSession(sessionId as unknown as SessionId)
  }

  const newChat = (workspaceId: string): void => {
    ctx.uiWorkspace.startSession(workspaceId as unknown as WorkspaceId)
    close()
  }

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: (): PanelInjected => ({ close, openSession, newChat }),
      },
      WorkspacesPanel,
    )
  })

  /*
   * **Kein Eintrag in `sidebar.panellist` mehr.**
   *
   * Bis zum 28.10.2026 stand hier ein Eintrag „Workspaces" (Ordnung 20) mit
   * {@link WorkspacesIcon}. Der Betreiber hat ihn mit einem Bild abgelehnt:
   * *„wtf ist das???? es sollte kein plugin sein sondern ein komplett harness oberfläche
   * changes"* — zu Recht: der Eintrag war ein **Anbau** in der Leiste, nicht die Oberfläche
   * des Harness. Der Kern bietet für Aktionen an der Projektzeile keine Naht an
   * (`ui-workspace` verdrahtet sein „…"-Menü selbst), also wurde die Funktion daneben
   * gebaut — und das sieht man.
   *
   * Die Fläche bleibt über ihre **Adresse** erreichbar (`?w`), und das Rechtsklick-Menü an
   * den Sitzungszeilen bleibt bestehen. Der Eintrag ist eine Zeile; er kommt zurück, sobald
   * die Funktion in der echten Seitenleiste sitzt.
   */

  ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces.session.menu.item',
        id: 'pmh.open-in-new-tab',
        order: 600,
        locale: NS,
        inject: () => ({ openSession }),
      },
      OpenInNewTabRow,
    ),
  )

  ctx.effect(() => installAdresse(ctx), 'tabs: Adresse und Verlauf')
}

/**
 * Hält Adresse und Oberfläche zusammen.
 *
 * **Genau ein Wiederhersteller.** Beim Start liest diese Funktion den Pfad und öffnet, was er
 * nennt; danach folgt die Adresse der Oberfläche. Kein Nachfassen, keine Zeitgeber mehr: der
 * frühere Nachlauf hat dieselbe Sitzung dreimal geöffnet und dabei mit der Wiederherstellung des
 * Kerns gekämpft — im Browser sah das aus wie „die Ansicht kommt und verschwindet wieder".
 *
 * **Der Alias.** Eine alte Abfrage (`?s=…`, `?w`) wird auf den Pfad umgeschrieben und dabei
 * **ersetzt**, nicht geschoben: ein Lesezeichen soll keinen Verlaufseintrag erzeugen.
 *
 * @param ctx - der Client-Kontext
 * @returns die Aufräumfunktion
 */
function installAdresse(ctx: Context): () => void {
  const ort = globalThis.location as Location | undefined
  const verlauf = globalThis.history as History | undefined
  if (ort === undefined || verlauf === undefined) return () => {}

  /*
   * **Nur die Pfade, die dieses Plugin besitzt.** Anmeldung (`/anmeldung`), Welt (`/universe/…`)
   * und alles andere gehen unberührt weiter — sie haben keine Adresse von uns.
   */
  const eigen =
    ort.pathname === '/' ||
    ort.pathname === PFAD_UEBERSICHT ||
    ort.pathname === PFAD_CHAT ||
    ort.pathname.startsWith(`${PFAD_CHAT}/`)
  if (!eigen) return () => {}

  const liste = ctx.sessions.list
  let entsorgt = false
  /** Der erste echte Schreibvorgang ersetzt, jeder weitere schiebt in den Verlauf. */
  let naechsterSchreibvorgang: 'replace' | 'push' = 'replace'
  /** Die Sitzung aus der Adresse, solange sie noch nicht gehalten wird. */
  let gewuenscht: string | null = null
  /** Ob `openSession` für die gewünschte Sitzung schon lief — höchstens einmal. */
  let geoeffnet = false
  /** Vor dem entschiedenen Start wird nichts geschrieben. */
  let bewaffnet = false
  /** Die Sitzung, die beim **ersten fertigen** Katalog gehalten wurde — die Wiederherstellung des Kerns. */
  let startGehalten: SessionId | null = null
  /** Wie oft die Sitzung aus der Adresse schon geöffnet wurde — gedeckelt, damit es nicht läuft. */
  let versuche = 0
  /** Wie oft ein fertiger Katalog gesehen wurde — ein einzelner ist kein Beweis. */
  let fertigGesehen = 0

  const lebt = (): boolean => !entsorgt

  /** Was die Adresse jetzt sagen müßte. */
  const adresse = (): string =>
    hrefFor({
      panelId: ctx.layout.panelInfo.getSnapshot().activePanelId,
      sessionId: gewuenscht ?? mainSessionId(liste.getSnapshot().byId),
    })

  /** Schreibt die Adresse — **nur wenn sie sich wirklich ändert** und erst nach dem Bewaffnen. */
  const schreibe = (): void => {
    if (!bewaffnet || entsorgt) return
    const neu = adresse()
    if (gleichesZiel(ort.pathname, neu)) return
    try {
      if (naechsterSchreibvorgang === 'replace') verlauf.replaceState({}, '', neu)
      else verlauf.pushState({}, '', neu)
    } catch {
      /* Verlauf gesperrt: die Adresse ist Komfort, nicht Bedingung. */
    }
    naechsterSchreibvorgang = 'push'
  }

  /**
   * Öffnet die Sitzung aus der Adresse — **einmal**, sobald der Katalog sie kennt.
   *
   * **Die Wiederherstellung des Kerns ist keine Wahl des Nutzers.** Beim Start stellt der
   * Hauptbereich die zuletzt gehaltene Sitzung her; sie steht also schon da, bevor wir etwas tun.
   * Früher galt „hält der Hauptbereich eine andere Sitzung, war das eine Handlung des Nutzers" —
   * damit hat die Wiederherstellung den Pfad jedes Mal überstimmt, und ein neuer Tab landete im
   * Chat, in dem man ohnehin war. Deshalb wird die Sitzung, die beim **ersten fertigen Katalog**
   * gehalten wird, als `startGehalten` gemerkt: sie zählt nicht als Wahl.
   *
   * **Unbekannt ist nicht dasselbe wie noch nicht geladen.** Der Katalog meldet `ready` auch,
   * bevor alle Sitzungen darin stehen (erste Seite, anderer Arbeitsbereich). Ein einzelnes
   * `ready`, das die Kennung nicht kennt, ist deshalb **kein** Beweis — erst nach mehreren
   * fertigen Ständen wird aufgegeben.
   */
  const oeffneAusAdresse = (): void => {
    if (gewuenscht === null) return
    const id = gewuenscht
    const stand = liste.getSnapshot()
    if (stand.phase !== 'ready') return
    const gehalten = mainSessionId(stand.byId)
    fertigGesehen += 1
    if (startGehalten === null && gehalten !== null) startGehalten = gehalten as SessionId
    if (stand.byId[id as unknown as SessionId] === undefined) {
      if (fertigGesehen >= 3) {
        gewuenscht = null
        bewaffnet = true
        schreibe()
      }
      return
    }
    const nutzerwahl = geoeffnet && gehalten !== id && gehalten !== startGehalten
    if (gehalten === id || nutzerwahl) {
      gewuenscht = null
      bewaffnet = true
      schreibe()
      return
    }
    /*
     * **Mehr als ein Versuch, aber gedeckelt.** Die Wiederherstellung des Kerns kann **nach** unserem
     * `openSession` eintreffen und die Sitzung wieder überschreiben — dann sähe es aus, als hätte der
     * Pfad verloren, und der neue Tab zeigte den Chat, in dem man ohnehin war. Deshalb bis zu drei
     * Versuche; wer selbst klickt, setzt `gewuenscht` vorher auf `null` und beendet das hier sofort.
     */
    if (versuche < 3) {
      versuche += 1
      geoeffnet = true
      ctx.uiWorkspace.openSession(id as unknown as SessionId)
    }
  }

  const abPanel = ctx.layout.panelInfo.subscribe(() => {
    oeffneAusAdresse()
    schreibe()
  })
  const abListe = liste.subscribe(() => {
    oeffneAusAdresse()
    schreibe()
  })

  /** Zurück und vorwärts: die Adresse gewinnt, sie ist der Auslöser. */
  const zurueck = (): void => {
    if (entsorgt) return
    const neu = parsePfad(ort.pathname)
    if (neu.ansicht === 'uebersicht') {
      oeffnePanel(ctx, lebt)
      return
    }
    ctx.layout.selectPanel(null)
    if (neu.sessionId !== null && neu.sessionId !== '') {
      gewuenscht = neu.sessionId
      geoeffnet = false
      oeffneAusAdresse()
    }
  }
  globalThis.addEventListener('popstate', zurueck)

  // **Der Alias zuerst** — er ändert, was unten gelesen wird, und ersetzt den Verlaufseintrag.
  let start = parsePfad(ort.pathname)
  const alias = aliasZiel(ort.search)
  if (alias !== undefined) {
    try {
      verlauf.replaceState({}, '', alias)
    } catch {
      /* Ohne Verlauf gilt der Pfad trotzdem. */
    }
    start = parsePfad(alias)
  }

  /*
   * **Auch ein Start auf `/` bewaffnet den Schreiber.** Vorher blieb `bewaffnet` falsch, wenn keine
   * Sitzung in der Adresse stand — dann schrieb diese Seite **nie** eine Adresse, und ein Klick auf
   * eine Zeile änderte die Leiste nicht. Genau das war zu sehen: Chat wechselt, Adresse bleibt `/`.
   */
  if (start.ansicht === 'chat' && start.sessionId === null) {
    bewaffnet = true
    schreibe()
  }

  if (start.ansicht === 'uebersicht') {
    oeffnePanel(ctx, lebt)
    bewaffnet = true
    schreibe()
  } else if (start.sessionId !== null && start.sessionId !== '') {
    /*
     * **Kein `selectPanel(null)` vorweg.** Der Chat ist ohnehin die Vorgabe, und eine Panel-Wahl
     * bricht eine laufende Navigation des Kerns ab — hier wäre das die Wiederherstellung der
     * zuletzt gehaltenen Sitzung. Der Deep-Link setzt sich durch `openSession` durch.
     */
    gewuenscht = start.sessionId
    oeffneAusAdresse()
  } else {
    // Die Wurzel: der Chat, so wie der Kern ihn wiederherstellt.
    bewaffnet = true
    schreibe()
  }

  return () => {
    entsorgt = true
    abPanel()
    abListe()
    globalThis.removeEventListener('popstate', zurueck)
  }
}

/**
 * Wählt das Panel — **mit Nachfassen**.
 *
 * `ctx.layout.selectPanel` wirft, wenn die Kennung im Haupt-Slot nicht
 * eingehängt ist. Beim Start ist das möglich: die Slot-Deklaration des Kerns und
 * dieser Beitrag treffen in beliebiger Reihenfolge ein. Zwanzig Versuche à 50 ms
 * sind eine Sekunde — danach steht die Zeile im Protokoll, statt still zu
 * scheitern.
 *
 * @param ctx - der Client-Kontext
 * @param lebt - ob das Plugin noch lebt
 * @param rest - verbleibende Versuche
 */
function oeffnePanel(ctx: Context, lebt: () => boolean, rest = 20): void {
  try {
    ctx.layout.selectPanel(PANEL_ID as unknown as MainPanelId)
  } catch {
    if (rest <= 0 || !lebt()) {
      console.warn(`[tabs] Das Panel "${PANEL_ID}" ist nicht eingehängt — "?w" bleibt ohne Wirkung.`)
      return
    }
    setTimeout(() => {
      if (lebt()) oeffnePanel(ctx, lebt, rest - 1)
    }, 50)
  }
}

/**
 * Der Stil — **nur Flächen und Abstände**, keine Farben aus zweiter Hand.
 *
 * Gelesen werden ausschließlich `currentColor` und `color-mix`, damit die Fläche
 * in heller wie dunkler Darstellung des Kerns lesbar bleibt, ohne die Palette zu
 * verdoppeln.
 */
const CSS = `
.pmh-ws{
  box-sizing:border-box;height:100%;min-height:0;overflow:auto;
  padding:28px 32px 48px;color:inherit;font:inherit;
}
.pmh-ws__head{max-width:920px;margin:0 auto 20px}
.pmh-ws__title{margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em}
.pmh-ws__lead{margin:0;max-width:64ch;font-size:13px;line-height:1.55;opacity:.62}
.pmh-ws__empty{max-width:920px;margin:16px auto;font-size:13px;opacity:.62}
.pmh-ws__list{list-style:none;max-width:920px;margin:0 auto;padding:0;display:flex;flex-direction:column;gap:14px}
.pmh-ws__group{
  border:1px solid rgba(128,128,128,.22);border-radius:12px;padding:14px 16px;
  border-color:color-mix(in srgb, currentColor 16%, transparent);
  background:color-mix(in srgb, currentColor 3%, transparent);
}
.pmh-ws__groupHead{display:flex;align-items:baseline;gap:12px;justify-content:space-between}
.pmh-ws__name{font-size:14px;font-weight:600;letter-spacing:-.005em}
.pmh-ws__path{
  margin:4px 0 10px;font-size:11px;line-height:1.4;opacity:.5;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.pmh-ws__new{
  flex:none;border:1px solid rgba(128,128,128,.3);border-radius:8px;background:transparent;
  color:inherit;font:inherit;font-size:11px;line-height:1;padding:7px 10px;cursor:pointer;
  border-color:color-mix(in srgb, currentColor 22%, transparent);
}
.pmh-ws__new:hover{border-color:color-mix(in srgb, currentColor 45%, transparent)}
.pmh-ws__none{margin:0;font-size:12px;opacity:.5}
.pmh-ws__sessions{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.pmh-ws__session{
  display:block;padding:6px 8px;margin:0 -8px;border-radius:7px;
  color:inherit;text-decoration:none;font-size:13px;line-height:1.45;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.pmh-ws__session:hover{background:color-mix(in srgb, currentColor 8%, transparent)}
.pmh-tabitem{
  display:block;width:100%;box-sizing:border-box;padding:6px 10px;border-radius:6px;
  color:inherit;text-decoration:none;font:inherit;font-size:13px;line-height:1.4;
  cursor:pointer;white-space:nowrap;
}
.pmh-tabitem:hover,.pmh-tabitem:focus-visible{background:color-mix(in srgb, currentColor 8%, transparent)}
/*
 * **Die Sitzungszeile ist ein Link — sie soll nicht wie einer aussehen.**
 *
 * Seit dem 28.10.2026 trägt sie ein a-Tag mit href auf /c/… (Patch auf
 * dsh-client-ui-workspace, SessionNodeItem: div wird a). Ein Anker bringt die
 * Standardfarbe und den Strich des Browsers mit; beides gehört hier nicht hin, weil
 * die Zeile weiter aussieht wie die Zeilen des Kerns. Der Selektor greift nur auf
 * Zeilen mit Adresse — ein späterer eigener Browser braucht diese Regel nicht mehr.
 */
a[data-row-key^="session:"]{color:inherit;text-decoration:none}
a[data-row-key^="session:"]:hover,a[data-row-key^="session:"]:focus-visible{text-decoration:none}
`
