/**
 * `@prometheus-harness/client-world-switch` — **die Marke oben links wechselt in die Welt.**
 *
 * ## Der Auftrag (Betreiber, 14.10.2026)
 *
 * > *„genau genommen moechte ich das man beim start den standard Prometheus Chat sieht … und ueber
 * > web app sollte man den andere version wechseln koennen siehe bild."*
 *
 * Und auf die Rueckfrage, **wo** der Weg aus dem Chat in die Welt sitzen soll:
 *
 * > *„Eigenes Client-Plugin: die Marke selbst wird zum Schalter."*
 *
 * ## Was hier geschieht — und was ausdruecklich nicht
 *
 * Die Marke oben links in der Seitenleiste (Logo und Text) ist im Kern ein `<button>`, der eine
 * **neue Sitzung** oeffnet. Dieses Plugin faengt den Klick **ab** und wechselt stattdessen in die
 * Welt (den Prototyp unter `/universe/`).
 *
 * * **Kein neues Element, kein neues Aussehen.** Es wird **nichts** in den Baum geschrieben ausser
 *   zwei Beschriftungen (`aria-label`, `title`); die Marke selbst bleibt, wie der Kern sie malt.
 *   Damit kann dieses Plugin das Aussehen der Oberflaeche nicht verändern — und genau das war die
 *   Auflage: *„nichts anpassen an dem neue bild design."*
 * * **Der Klick wird in der Faengstufe abgefangen** (`capture: true`). Der Kern haengt seine
 *   React-Zuhoerer an die Wurzel; ein `stopPropagation` **oberhalb** davon erreicht sie nicht mehr.
 *   Das ist der Unterschied zwischen „ich weiss es besser" und „ich komme gar nicht erst an".
 * * **Die neue Sitzung geht nicht verloren.** Sie hat einen eigenen Knopf direkt unter der Marke
 *   (`session.new` in `ui-sidebar`) und ein Tastenkürzel. Deshalb ist der Tausch vertretbar.
 *
 * ## Was hier **nicht** bedient wird — offen benannt
 *
 * * **Die eingeklappte Leiste.** Ist die Seitenleiste zum Streifen geschrumpft, ist die Marke der
 *   **Ausklapp-Knopf** (Symbol `railMark`, nicht `brandIdentity`). Den stillzulegen waere ein Fehler:
 *   man kaeme nicht mehr an die Leiste. Der Anker unten trifft ihn deshalb **nicht**.
 * * **Rechtsklick, Mitteltaste, Strg/Klick.** Wer „in neuem Tab oeffnen" will, bekommt weiter die
 *   alte Handlung (neue Sitzung) statt einer Navigation, die seine Absicht ignoriert.
 * * **Die Sprache kommt aus dem Dokument**, nicht aus dem Sprachdienst des Kerns
 *   (`ctx.locale`). Fuer zwei Woerter waere ein eigener Namensraum mehr Aufwand als Nutzen; die
 *   Grenze steht hier, damit sie niemand fuer Vollstaendigkeit haelt.
 *
 * ## Und der Rueckweg — die zweite Haelfte des Umschalters
 *
 * Der Klick fuehrt nicht nur „irgendwohin in die Welt": er hinterlegt den **Ankunftswunsch**
 * ({@link ARRIVAL_KEY}) und geht nach `/universe/` ({@link weltZiel}). Ohne den Wunsch kam der
 * Betreiber nach seinem Klick in der Welt oben links im **Platzhalter-Chat** des Prototyps heraus
 * statt im echten Prometheus-Chat — gemessen am 14.10.2026, mit Bild.
 *
 * **Warum der Wunsch im Speicher liegt und nicht in der Adresse.** Zuerst stand er in der Adreßzeile
 * (`?ansicht=os`, dazu `?chat=<Herkunft>`) — seit beide auf **einem** Port liegen, teilen sie sich
 * den Speicher, und der Betreiber bekam eine Adresse zu sehen, die er zu Recht lang fand:
 * *„der link ist nur zu lange so lol"*.
 *
 * @module @prometheus-harness/client-world-switch
 */

import type { Context } from '@deepseek-ai/cordis'

/** Kennung des Pakets. */
export const name = 'world-switch'

/**
 * Keine Dienste nötig: dieses Plugin haengt einen Zuhoerer an das Dokument.
 *
 * **Warum der Eintrag trotzdem da ist.** Der Client-Kern liest `inject` aus dem Buendel
 * (`exports.inject`); fehlt es ganz, gilt das Plugin als unvollstaendig. Eine leere Liste sagt
 * ausdruecklich: *ich brauche nichts.*
 */
export const inject: readonly string[] = []

/**
 * **Wo die Welt liegt: ein PFAD, kein zweiter Port.**
 *
 * Bis zum 14.10.2026 stand hier `WELT_URL = 'http://127.0.0.1:5176/'` — ein eigener
 * Vite-Entwicklungsserver. Der Betreiber: *„der ganze port ist mir bisschen zu piss 2 port offen zu
 * haben ich möchte es als ein port haben … und im folder: apps/universe anstatt in snapshot, dann
 * alles in einem port."*
 *
 * Jetzt liefert der **Host** die gebaute Welt unter diesem Pfad aus
 * (`packages/web/world-static`) — auf demselben Port wie der Chat. Damit ist der Umschalter ein
 * **Pfadwechsel** auf derselben Herkunft: kein zweiter Keks-Speicher, kein zweiter Name
 * (`127.0.0.1` gegen `localhost`), kein Port, der belegt sein kann.
 *
 * Derselbe Wert steht in `scripts/world-path.mjs` und in `packages/web/world-static`. Der
 * Buendel-Pruefer (`scripts/client-buendel.mjs`) **vergleicht** die drei: driftet eine, faellt der
 * Bau rot aus, statt dass der Umschalter ins Leere zeigt.
 */
export const WORLD_PATH = '/universe'

/**
 * **Der Ankunftswunsch — der kurze Weg statt eines langen Links.**
 *
 * Wer den Umschalter drueckt, will die **Welt** sehen — nicht die Ansicht, die in diesem Browser
 * zuletzt eingestellt war. Stand dort `chat`, kam der Betreiber genau im Platzhalter-Chat des
 * Prototyps heraus („Hier entsteht der Chat", Bild vom 14.10.2026).
 *
 * Das wurde zuerst über einen Zusatz in der **Adreßzeile** gelöst (`?ansicht=os`) — zusammen mit
 * `?chat=<Herkunft>`, weil die Welt damals auf einem **eigenen** Port lag. Der Betreiber:
 * *„der link ist nur zu lange so lol"*. Mit **einem** Port braucht es beides nicht mehr: Chat und
 * Welt liegen auf derselben Herkunft und teilen sich denselben `localStorage`. Der Chat hinterlegt
 * den Wunsch hier, die Welt liest ihn beim Start und **nimmt ihn weg** (`takeArrival` in
 * `apps/universe/src/entry.ts`) — einmalig, sonst sähe ein Reload wie ein vergessener Klick aus.
 *
 * Derselbe Schlüssel steht dort; der Bündel-Prüfer (`scripts/client-buendel.mjs`) **vergleicht**
 * beide: driftet einer, fällt der Bau rot aus, statt daß der Umschalter in die zuletzt gespeicherte
 * Ansicht führt.
 */
export const ARRIVAL_KEY = 'pmh.world.arrival'

/** Was hier hinterlegt wird: die Ansicht, die erscheinen soll. */
export const ARRIVAL_VALUE = 'os'

/**
 * **Das Ziel des Umschalters — kurz.**
 *
 * ```
 * http://127.0.0.1:3081/universe/
 * ```
 *
 * **Was hier stand und warum es weg ist.** Ein Zusatz `?ansicht=os` und ein Zusatz
 * `?chat=<Herkunft>`; die Adresse des Chats wurde mitgeschickt, weil die Welt auf einer **anderen**
 * Herkunft lag (eigener Vite-Server, Port 5176). Seit dem 14.10.2026 liegen beide auf **einem**
 * Port: der Chat an `/`, die Welt an `/universe/`. Damit braucht die Welt keine Adresse mehr — die
 * Wurzel ihrer **eigenen** Herkunft ist der Chat.
 *
 * **Und ohne Herkunft?** Dann bleibt das Ziel ein **relativer** Pfad (`/universe/`). Ein Browser
 * loest ihn gegen die aktuelle Seite auf — also gegen den Chat. Das ist richtig, ohne dass hier eine
 * Adresse erfunden werden muss.
 *
 * @param herkunft - `location.origin` der Chat-Seite (darf fehlen)
 * @returns das Ziel des Umschalters
 */
export function weltZiel(herkunft: string | undefined): string {
  const basis = herkunft !== undefined && herkunft !== '' ? herkunft.replace(/\/+$/u, '') : ''
  return `${basis}${WORLD_PATH}/`
}

/**
 * Der Anker im Baum des Kerns.
 *
 * **Warum ein Teil-Klassenname und keine Kennung.** Die Seitenleiste des Kerns ist ein CSS-Modul:
 * die Klassen heissen `hHd-Xa_brand`, `hHd-Xa_brandIdentity` — der Praefix ist ein Streuwert und
 * wechselt mit jeder Fassung, das **Ende** bleibt. `[class*="_brandIdentity"]` trifft genau den
 * Knoten, den `SidebarRoot` als Marke malt, und **nicht** den Ausklapp-Knopf (`_railMark`).
 *
 * Gemessen, nicht geraten: `node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js`
 * (Zeilen 102–104 und 311–317) — dort stehen die vier Namen `brand`, `brandIdentity`, `brandMark`,
 * `brandName` als Klassentabelle des Buendels.
 */
export const MARKE = '[class*="_brandIdentity"]'

/** Die Beschriftungen — Deutsch und Englisch, weil die Oberflaeche beides kennt. */
export const ETIKETT: Readonly<Record<'de' | 'en', string>> = {
  de: 'Zur Welt',
  en: 'To the world',
}

/** Die Kennung des gesetzten Merkmals — damit ein zweiter Lauf nichts doppelt setzt. */
export const MERKMAL = 'data-pmh-welt-schalter'

/**
 * **Wie lange nach der Marke gesucht wird** — 30 Sekunden.
 *
 * Der Kern baut seine Oberflaeche erst nach dem Laden der Module, deshalb wird gewartet. Aber nicht
 * **unbegrenzt**: im Chat aendert sich bei jedem Token Text im Baum, und ein Beobachter, der dann
 * bei jeder Aenderung nachfragt, waere eine Last ohne Nutzen — eine Marke, die nach 30 Sekunden
 * nicht da ist, kommt auch spaeter nicht. Was dann noch fehlt, holt der **erste Klick** nach
 * ({@link apply} ruft `beschrifte`), und die drei Klickpruefungen haengen ohnehin am Dokument.
 */
export const FRIST_MS = 30_000

/**
 * Welche Sprache gilt?
 *
 * **Warum nicht der Sprachdienst des Kerns.** Der waere richtig und ist hier zu viel: dieses Plugin
 * haengt keinen Namensraum ein. Gelesen wird, was das Dokument selbst sagt (`<html lang>`), sonst die
 * Sprache des Browsers. Beides ist eine **Naeherung** — sie steht hier als solche.
 *
 * @returns `'de'` oder `'en'`
 */
export function sprache(dokument: Document | undefined, browser: string | undefined): 'de' | 'en' {
  const ausDokument = dokument?.documentElement?.lang
  const quelle = (ausDokument && ausDokument !== '' ? ausDokument : browser ?? '').toLowerCase()
  return quelle.startsWith('de') ? 'de' : 'en'
}

/** Ist das ein **einfacher** Klick — links, ohne Zusatztaste? */
interface Klickartig {
  readonly button?: number
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly defaultPrevented?: boolean
}

/**
 * Soll **dieser** Klick in die Welt fuehren?
 *
 * Rechtsklick, Mitteltaste und die Zusatztasten bleiben ausgenommen: wer mit Strg klickt, will ein
 * neues Fenster — eine Navigation, die das uebergeht, nimmt dem Nutzer die Wahl.
 */
export function istEinfacherKlick(ereignis: Klickartig): boolean {
  if (ereignis.defaultPrevented === true) return false
  if ((ereignis.button ?? 0) !== 0) return false
  return ereignis.ctrlKey !== true && ereignis.metaKey !== true && ereignis.shiftKey !== true && ereignis.altKey !== true
}

/** Ein Knoten, wie er in der Trefferkette steht — nur das, was hier gebraucht wird. */
interface Knoten {
  readonly matches?: (auswahl: string) => boolean
  readonly closest?: (auswahl: string) => Knoten | null
}

/**
 * Steckt dieser Klick in der Marke?
 *
 * **Zuerst die Trefferkette (`composedPath`), dann der Weg nach oben.** Die Trefferkette ist der
 * genauere Weg: sie nennt **alle** Knoten, die der Browser durchlaufen hat, in der Reihenfolge — auch
 * die in einem Schattenbaum. `closest` am Ziel ist der Rueckfall fuer Browser ohne `composedPath`.
 *
 * @param pfad - die Trefferkette (darf leer sein)
 * @param ziel - das Ziel des Ereignisses
 * @returns ob die Marke getroffen wurde
 */
export function trifftMarke(pfad: readonly unknown[], ziel: unknown): boolean {
  for (const knoten of pfad) {
    const k = knoten as Knoten
    if (typeof k?.matches === 'function' && k.matches(MARKE)) return true
  }
  const z = ziel as Knoten | null
  return typeof z?.closest === 'function' && z.closest(MARKE) !== null
}

/**
 * **Den Ankunftswunsch hinterlegen** — vor der Navigation, denn danach ist dieses Dokument weg.
 *
 * **Warum ueberhaupt ein Speicher und nicht die Adreßzeile.** Der Wunsch stand zuerst in der Adresse
 * (`?ansicht=os`) — das kostete einen langen Link und war der einzige Grund, weshalb die Adresse des
 * Chats mitgeschickt werden musste. Chat und Welt teilen sich auf **einem** Port die Herkunft, also
 * teilen sie sich auch den `localStorage`. Der Wunsch ist damit ein Vermerk **an die naechste Seite**,
 * nicht ein Teil der Adresse.
 *
 * **Warum das Schreiben nicht scheitern darf.** Manche Browser verbieten den Zugriff (strenger
 * Datenschutzmodus) oder er ist voll. Dann bleibt der Umschalter trotzdem ein Umschalter: die Welt
 * erscheint in der zuletzt gespeicherten Ansicht, und der Nutzer kann sie in der Insel umstellen.
 * Ein Wurf hier waere ein Klick, der **gar nichts** tut — schlimmer als die kleine Unbequemlichkeit,
 * die er verhindern soll.
 *
 * @param speicher - der Speicher der Seite (darf fehlen)
 */
function merkeAnkunft(speicher: Storage | undefined): void {
  try {
    speicher?.setItem(ARRIVAL_KEY, ARRIVAL_VALUE)
  } catch {
    /* Der Speicher ist gesperrt oder voll — siehe oben: die Navigation bleibt richtige Arbeit. */
  }
}

/** Geht in die Welt — **die eine Stelle**, an der navigiert wird. */
function geheInDieWelt(ort: Location | undefined, speicher: Storage | undefined): void {
  if (ort === undefined) return
  const ziel = weltZiel(ort.origin)
  merkeAnkunft(speicher)
  if (typeof ort.assign === 'function') ort.assign(ziel)
  else ort.href = ziel
}

/**
 * **Die Marke zum Schalter machen.**
 *
 * Der Zuhoerer haengt am **Dokument** und nicht an der Marke selbst — aus zwei Gruenden: der Kern
 * baut die Seitenleiste nach jedem Wechsel neu (ein Zuhoerer am alten Knoten waere dann weg), und
 * `capture: true` ist nur am Dokument **oberhalb** der React-Wurzel wirksam. Damit ist der Abfang
 * unabhaengig davon, wann und wie oft der Kern die Marke neu malt.
 *
 * @param ctx - Client-Kontext des Kerns
 */
export function apply(ctx: Context): void {
  const dokument = globalThis.document
  if (dokument === undefined) return

  ctx.effect(() => {
    /**
     * Der Klick, der abgefangen wird.
     *
     * **Warum beide Bremsen.** `stopPropagation` verhindert die neue Sitzung des Kerns;
     * `preventDefault` schuetzt davor, dass ein spaeterer Zuhoerer noch etwas anderes ausloest. Ein
     * Abfang ohne die erste Bremse waere ein Umschalter, der nebenbei eine Sitzung anlegt.
     */
    const klick = (ereignis: Event): void => {
      if (!istEinfacherKlick(ereignis as unknown as Klickartig)) return
      const pfad = typeof ereignis.composedPath === 'function' ? ereignis.composedPath() : []
      if (!trifftMarke(pfad, ereignis.target)) return
      beschrifte(dokument)
      ereignis.stopPropagation()
      ereignis.preventDefault()
      geheInDieWelt(globalThis.location, globalThis.localStorage)
    }

    dokument.addEventListener('click', klick, true)
    /*
     * **Und die Beschriftung, sobald es die Marke gibt.**
     *
     * Der Kern baut seine Oberflaeche erst nach dem Laden der Module — beim Aufruf von `apply` ist
     * die Seitenleiste oft noch nicht da. Deshalb wird beobachtet, bis die Marke steht, und **dann
     * aufgehoert**. Zusaetzlich laeuft eine **Frist** ({@link FRIST_MS}): im Chat aendert sich der
     * Baum bei jedem Token, und ein Beobachter ueber alles waere eine Last ohne Nutzen, wenn die
     * Marke gar nicht mehr kommt (schmale Leiste, andere Fassung des Kerns).
     */
    let frist: ReturnType<typeof setTimeout> | undefined
    const beobachter = new MutationObserver(() => {
      if (!beschrifte(dokument)) return
      beobachter.disconnect()
      if (frist !== undefined) clearTimeout(frist)
      frist = undefined
    })
    if (!beschrifte(dokument)) {
      beobachter.observe(dokument.documentElement ?? dokument, { childList: true, subtree: true })
      frist = setTimeout(() => {
        beobachter.disconnect()
        frist = undefined
      }, FRIST_MS)
    }

    return () => {
      dokument.removeEventListener('click', klick, true)
      beobachter.disconnect()
      if (frist !== undefined) clearTimeout(frist)
      frist = undefined
    }
  }, 'world-switch: die Marke oben links wechselt in die Welt')
}

/**
 * Beschriftet die Marke — **und sagt, ob es etwas zu beschriften gab.**
 *
 * **Warum ueberhaupt.** Der Kern beschriftet den Knopf mit „Neue Sitzung". Wer ihn mit der Tastatur
 * erreicht oder sich vorlesen laesst, bekaeme sonst eine Auskunft, die **falsch** ist: das
 * Bedienelement wechselt in die Welt. `title` ist zugleich der einzige Hinweis im Bild — ohne ihn
 * findet den Umschalter nur, wer davon weiss.
 *
 * **Warum kein Beobachter auf die Attribute.** Wird gesetzt, was schon dasteht, ist nichts zu tun
 * (siehe {@link MERKMAL}) — damit kann auch ein Beobachter keine Schleife ausloesen.
 *
 * @param dokument - das Dokument der Oberflaeche
 * @returns ob die Marke gefunden wurde
 */
function beschrifte(dokument: Document): boolean {
  const marke = dokument.querySelector(MARKE) as (Element & { closest?: (a: string) => Element | null }) | null
  const knopf = marke?.closest?.('button') as (Element & { setAttribute: (n: string, v: string) => void }) | null
  if (!knopf) return false
  const text = ETIKETT[sprache(dokument, globalThis.navigator?.language)]
  if (knopf.getAttribute(MERKMAL) === text) return true
  knopf.setAttribute(MERKMAL, text)
  knopf.setAttribute('aria-label', text)
  knopf.setAttribute('title', text)
  return true
}
