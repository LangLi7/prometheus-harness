/**
 * **Die Adreßform — rein, ohne DOM.**
 *
 * ## Pfade, nicht Abfragen
 *
 * | Adresse | Was erscheint |
 * |---|---|
 * | `/` | der Chat, den der Kern wiederherstellt |
 * | `/c/<Sitzung>` | genau dieser Chat |
 * | `/w` | die Übersicht der Arbeitsbereiche |
 *
 * Bis zum 28.10.2026 stand hier eine **Abfrage** (`?s=…`, `?w`) mit der Begründung, der Wirt
 * beantworte nur `/`. Das war die falsche Schlußfolgerung: gemessen fehlte dem Wirt die **Regel**,
 * nicht die Möglichkeit. Sie steht jetzt in `packages/api/auth-http/src/huelle.ts` (Prefix `/c`,
 * exakt `/w`, Index durch `renderIndex`, Basis absolut). Damit ist „in neuem Tab öffnen" keine
 * Funktion mehr, sondern eine Eigenschaft der Adresse.
 *
 * ## Was hier bewusst fehlt
 *
 * Kein `pushState`, kein Lesen von `location` — das tut `index.tsx`. Diese Datei ist die **Form**
 * allein und ohne Browser prüfbar (`tests/adresse.test.ts`).
 *
 * @module @prometheus-harness/client-tabs/adresse
 */

/** Die Abfrage, die eine Sitzung nennt — **nur noch als Alias** für alte Lesezeichen. */
export const PARAM_SESSION = 's'

/** Die Abfrage der Übersicht — **nur noch als Alias**. */
export const PARAM_WORKSPACES = 'w'

/** Die Kennung des Panels im `main`-Slot. */
export const PANEL_ID = 'workspaces'

/** Unter diesem Prefix liegt ein Chat. */
export const PFAD_CHAT = '/c'

/** Die Übersicht. */
export const PFAD_UEBERSICHT = '/w'

/** Was die Adresse sagt. */
export type Adresse =
  | { readonly ansicht: 'uebersicht' }
  | { readonly ansicht: 'chat'; readonly sessionId: string | null }

/**
 * Die Adresse **einer** Sitzung.
 *
 * @param sessionId - die Sitzung
 * @returns `/c/<Sitzung>`, kodiert
 */
export function chatHref(sessionId: string): string {
  return `${PFAD_CHAT}/${encodeURIComponent(sessionId)}`
}

/**
 * Die Adresse der Übersicht.
 *
 * @returns `/w`
 */
export function workspacesHref(): string {
  return PFAD_UEBERSICHT
}

/**
 * Räumt einen Pfad auf: kein doppelter Schrägstrich, kein Schrägstrich am Ende (außer an der Wurzel).
 *
 * @param pfad - der rohe Pfad
 * @returns der aufgeräumte Pfad
 */
function normal(pfad: string): string {
  const ohneDoppelt = pfad.replace(/\/{2,}/g, '/')
  if (ohneDoppelt === '/') return '/'
  return ohneDoppelt.replace(/\/+$/, '')
}

/**
 * Liest den Pfad.
 *
 * **Unbekanntes ergibt den Chat ohne Sitzung.** Ein Pfad, den dieses Plugin nicht kennt, ist
 * entweder ein Tippfehler oder eine Seite, die der Wirt ohnehin nicht ausliefert; in beiden Fällen
 * ist „der Chat, den der Kern wiederherstellt" die harmlosere Antwort als eine Fehlermeldung.
 *
 * @param pathname - `location.pathname`
 * @returns was gezeigt werden soll
 */
export function parsePfad(pathname: string): Adresse {
  const pfad = normal(pathname)
  if (pfad === PFAD_UEBERSICHT) return { ansicht: 'uebersicht' }
  if (pfad === PFAD_CHAT) return { ansicht: 'chat', sessionId: null }
  const praefix = `${PFAD_CHAT}/`
  if (!pfad.startsWith(praefix)) return { ansicht: 'chat', sessionId: null }
  const roh = pfad.slice(praefix.length)
  if (roh === '') return { ansicht: 'chat', sessionId: null }
  let sitzung: string
  try {
    sitzung = decodeURIComponent(roh)
  } catch {
    // Eine kaputte Kodierung ist kein Grund, die Seite zu verlieren.
    sitzung = roh
  }
  return { ansicht: 'chat', sessionId: sitzung }
}

/**
 * Übersetzt eine **alte** Abfrage in einen Pfad.
 *
 * Die Abfrage lebte bis zum 28.10.2026 und steht in Lesezeichen und in Links, die jemand kopiert
 * hat. Sie wird nicht weiter benutzt, aber auch nicht weggeworfen: der Client schreibt sie beim
 * Start auf den Pfad um und ersetzt den Verlaufseintrag.
 *
 * @param search - die Abfrage, mit oder ohne führendes `?`
 * @returns der Zielpfad, oder `undefined`, wenn nichts zu übersetzen ist
 */
export function aliasZiel(search: string): string | undefined {
  const abfrage = search.startsWith('?') ? search.slice(1) : search
  if (abfrage === '') return undefined
  const werte = new URLSearchParams(abfrage)
  // **`w` gewinnt gegen `s`** — wie zuvor: die Übersicht führt zu jeder Sitzung.
  if (werte.has(PARAM_WORKSPACES)) return workspacesHref()
  const sitzung = werte.get(PARAM_SESSION)
  if (sitzung === null || sitzung === '') return undefined
  return chatHref(sitzung)
}

/**
 * Die Adresse zu einem Zustand — die **eine** Stelle, die sie bildet.
 *
 * @param lage - Panel-Kennung (oder `null`) und gehaltene Sitzung (oder `null`)
 * @returns der Pfad
 */
export function hrefFor(lage: {
  readonly panelId: string | null
  readonly sessionId: string | null
}): string {
  if (lage.panelId === PANEL_ID) return workspacesHref()
  if (lage.sessionId !== null && lage.sessionId !== '') return chatHref(lage.sessionId)
  return '/'
}

/**
 * Nennen zwei Pfade dasselbe Ziel?
 *
 * Verglichen wird der **aufgeräumte** Pfad; `/c/x/` und `/c/x` sind dasselbe. Der Anmeldefluß hängt
 * außerdem gelegentlich eine Abfrage an (`?weiter=…`) — die zählt hier nicht, sonst löschte der
 * erste Schreibvorgang den Parameter, der die Seite gerade hergebracht hat.
 *
 * @param a - ein Pfad
 * @param b - der andere
 * @returns ob beide dasselbe Ziel nennen
 */
export function gleichesZiel(a: string, b: string): boolean {
  return normal(a) === normal(b)
}

/** Ein Klick, so wie ihn ein Bedienelement meldet. */
export interface Klickartig {
  readonly button?: number
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly defaultPrevented?: boolean
}

/**
 * Ist das ein **einfacher** Klick — links, ohne Zusatztaste?
 *
 * Wer mit Strg, Cmd, Shift oder Alt klickt oder die Mitteltaste nimmt, will den **zweiten Tab**.
 * Dieses Plugin fängt nur den einfachen Klick ab und läßt den schweren dem Browser — die Absicht
 * des Nutzers zu überschreiben wäre genau das Gegenteil dessen, was „in neuem Tab öffnen" bedeutet.
 *
 * @param ereignis - das Klick-Ereignis (darf unvollständig sein)
 * @returns ob der einfache Klick vorliegt
 */
export function istEinfacherKlick(ereignis: Klickartig): boolean {
  if (ereignis.defaultPrevented === true) return false
  if ((ereignis.button ?? 0) !== 0) return false
  return (
    ereignis.ctrlKey !== true &&
    ereignis.metaKey !== true &&
    ereignis.shiftKey !== true &&
    ereignis.altKey !== true
  )
}
