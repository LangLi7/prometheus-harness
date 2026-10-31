/**
 * `@prometheus-harness/ai-ranking` — die **Schnittstelle** zur bevorzugten Liste.
 *
 * ## Warum dieses Paket existiert
 *
 * `@prometheus-harness/ranking` **rechnet** die Reihenfolge, aber es kennt seine Quellen nicht: es
 * bekommt Familien, Katalog, Anbieter und Tarife gereicht. Bis hierher gab es niemanden, der sie
 * **zusammenträgt** — die drei Teile lagen nebeneinander, und genau das war die Lücke.
 *
 * Dieses Paket ist der Ort, an dem sie zusammenkommen: ein Dienst `ctx.aiRanking`, bei dem jeder
 * Teil **seine** Daten anmeldet, und eine lesende Fläche, die das Ergebnis ausgibt.
 *
 * ## Die Naht, und warum sie so herum liegt
 *
 * ```
 *   provider-directory ─► meldeFamilien()  ─┐
 *   directory-curator  ─► meldeKatalog()   ─┤
 *   capabilities/…     ─► meldeAnbieter()  ─┼─►  ctx.aiRanking  ─►  GET /api/ai/ranking
 *   tariffs            ─► meldeTarife()    ─┤
 *   die Sonde          ─► meldeModelle()   ─┘
 * ```
 *
 * **Warum die Teile sich anmelden und nicht dieses Paket sie aufruft.** Genau die Regel, die
 * `health` für die Bereitschaftssonden zieht: dieses Paket darf **provider-directory** nicht
 * kennen. Sonst hinge die Liste an jeder neuen Familie, und ein Fehler in der Sonde risse den
 * Endpunkt mit, der ihn melden soll. Wer etwas beizutragen hat, trägt es ein.
 *
 * ## Kein Netzzugriff
 *
 * Dieses Paket **ruft nichts auf**. Es sammelt und rechnet. Das Messen bleibt bei der Sonde, das
 * Verwalten beim Verwalter — beide werden von ihrem eigenen Anlaß gefahren.
 *
 * ## Was der Endpunkt NICHT herausgibt
 *
 * **Keine Zugangsdaten.** Der Dienst nimmt Anbieter als **Objekte**, und die tragen ihren
 * Schlüssel nicht (`Anbieter` in `capabilities`: „Der Anbieter **verwaltet** ihn; die Registratur
 * kennt nur seinen Namen"). Was hier hinausgeht, sind Kennungen, Preise und Gründe.
 *
 * ## Die Ausnahme von der Regel, und warum sie eine ist
 *
 * Der Abschnitt oben sagt: dieses Paket ruft **provider-directory** nicht auf. Genau **eine**
 * Ausnahme gibt es, und sie ist eng: {@link meldeStandardquellen} trägt beim Einhängen die
 * **Datentabellen** ein — `FAMILIEN` und `SAAT`. Beides sind **Konstanten**: kein Netz, keine
 * Datei, kein Fehlerfall.
 *
 * **Warum diese Ausnahme nötig war.** Ohne sie war der Endpunkt gebaut, verdrahtet und
 * **leer** — niemand meldete etwas an. Eine leere Liste mit Grund ist besser als ein 404, aber sie
 * ist noch keine Auskunft.
 *
 * **Was die Ausnahme NICHT umfaßt.** Die **Sonde** und der **Verwalter** werden **nicht** gerufen.
 * Sie messen und schreiben, haben ihren eigenen Anlaß (`start`, `zeitplan`, `schluessel-fehlt`)
 * und würden hier eine Last und eine Fehlerquelle einführen, die ein lesender Endpunkt nicht
 * braucht. Der Katalog kommt deshalb nur an, wenn ihn jemand **reicht**.
 *
 * @module @prometheus-harness/ai-ranking
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { FAEHIGKEITEN, type Anbieter, type Faehigkeit } from '@prometheus-harness/capabilities'
import { meldeQuellen } from '@prometheus-harness/composition'
import type { Familie, Modellangabe } from '@prometheus-harness/provider-directory'
import type { Katalog } from '@prometheus-harness/directory-curator'
import type { Tarifeintrag } from '@prometheus-harness/tariffs'
import { alsListe, baueRangliste, zaehle, type Rangliste } from '@prometheus-harness/ranking'
import { KI_STAPEL, pluginPakete, zaehleFormen, type Form } from './stapel.ts'

// ---------------------------------------------------------------------------
// Kennungen
// ---------------------------------------------------------------------------

/**
 * Stabiler Cordis-Plugin-Name.
 *
 * **Warum er nicht beliebig ist.** Der Loader führt das Plugin unter diesem Namen; die Ausgabe der
 * Entry-Prüfung, Abschaltungen und Fehlermeldungen nennen ihn. Steht hier etwas anderes als in der
 * Patch-Zeile, sucht man den Fehler an der falschen Stelle.
 */
export const name = 'pmh-ai-ranking'

/**
 * Dienste, die vor dem Einhängen da sein müssen.
 *
 * **Nur `webServer`.** Siehe `health`: ein Plugin, das wegen eines fehlenden Prüfdienstes gar nicht
 * erst eingehängt wird, kann nicht melden, **daß** die Prüfung fehlt. Fehlt der Verbindungsdienst
 * zur Laufzeit, antwortet der Endpunkt mit **503** — sichtbar statt still.
 */
export const inject = ['webServer']

/** Der Pfad der Liste. */
export const RANKING_PATH = '/api/ai/ranking'

/**
 * Der Pfad der Auskunft über den KI-Stapel.
 *
 * **Warum es diesen zweiten Endpunkt gibt.** Der Ranglisten-Endpunkt beantwortet „was ist zuerst zu
 * nehmen". Er beantwortet **nicht** „was ist überhaupt da" — und genau das war die Frage, aus der
 * eine leere Plugin-Liste wurde. Ein Plugin kann man abschalten und auflisten; eine Bibliothek
 * nicht. Beides als „installiert" zusammenzuwerfen hieße, eine Bibliothek in einer Plugin-Liste zu
 * suchen und sie nie zu finden.
 */
export const STACK_PATH = '/api/ai/stack'

/** Der Name, den die Antworten über sich selbst nennen. */
export const SERVICE_NAME = '@prometheus-harness/ai-ranking'

/** Die Fassung dieses Pakets — verglichen von einer Prüfung, nicht zur Laufzeit gelesen. */
export const SERVICE_VERSION = '0.1.0'

/** Der Name, unter dem der Dienst im Kontext steht. */
export const DIENST = 'aiRanking'

// ---------------------------------------------------------------------------
// Die gesammelten Quellen
// ---------------------------------------------------------------------------

/** Was zum Rechnen zusammengetragen wurde. */
export interface Rangquellen {
  readonly familien: readonly Familie[]
  readonly anbieter: readonly Anbieter[]
  readonly tarife: readonly Tarifeintrag[]
  /** Fehlt, solange kein Verwalterlauf einen Katalog hinterlassen hat. */
  readonly katalog?: Katalog
  /** Die gemessenen Modelllisten, je Familie. */
  readonly modelle: Readonly<Record<string, readonly Modellangabe[]>>
}

/** Was die Liste beim Abruf einschränken kann. */
export interface Abrufoptionen {
  /** Nur diese Fähigkeiten. */
  readonly faehigkeiten?: readonly Faehigkeit[]
  /** Der Zeitpunkt, der als „jetzt" gilt. */
  readonly jetzt?: Date
}

/** Der Dienst, den dieses Paket bereitstellt. */
export interface Rangregister {
  /** Meldet eine Familie an. Mehrere Aufrufe sammeln sich. */
  meldeFamilie: (familie: Familie) => () => void
  /** Meldet eine Umsetzung an. Mehrere Aufrufe sammeln sich. */
  meldeAnbieter: (anbieter: Anbieter) => () => void
  /** Meldet Tarife an — in der Regel das Ergebnis von `verschmelze`. */
  meldeTarife: (tarife: readonly Tarifeintrag[]) => () => void
  /** Meldet einen Katalog an. Ein späterer Aufruf **ersetzt** den früheren. */
  meldeKatalog: (katalog: Katalog) => () => void
  /** Meldet die gemessene Modellliste **einer** Familie an. */
  meldeModelle: (familie: string, modelle: readonly Modellangabe[]) => () => void
  /** Was zusammengetragen ist. */
  quellen: () => Rangquellen
  /** Rechnet die Liste über das Zusammengetragene. */
  liste: (optionen?: Abrufoptionen) => Rangliste
}

/**
 * Erzeugt das Register.
 *
 * **Warum als eigene Funktion und nicht im Plugin-Kontext.** Das Register ist reine Logik:
 * anmelden, abmelden, zusammenfassen, rechnen. Als eigene Einheit läßt es sich **ohne** Host, ohne
 * HTTP und ohne Netz prüfen — und genau das braucht seine Prüfung.
 *
 * @returns das Register
 */
export function erzeugeRegister(): Rangregister {
  const familien: Familie[] = []
  const anbieter: Anbieter[] = []
  const tarife: Tarifeintrag[] = []
  const modelle = new Map<string, readonly Modellangabe[]>()
  let katalog: Katalog | undefined

  /** Nimmt einen Wert aus einer Liste und gibt den Rücknehmer zurück. */
  function ausListe<T>(liste: T[], wert: T, name: string): () => void {
    const doppelt = liste.findIndex((vorhanden) => identisch(vorhanden, wert))
    if (doppelt >= 0) {
      // **Zweimal dasselbe anmelden ist ein Fehler, kein stiller zweiter Eintrag.** Zwei gleiche
      // Familien ergäben jede Zeile doppelt — und die Liste sähe vollständig aus, obwohl sie es
      // nicht ist. Ein Wurf ist hier billiger als eine Liste, der man nicht ansieht, daß sie lügt.
      throw new Error(`${name} ist bereits angemeldet.`)
    }
    liste.push(wert)
    return () => {
      const at = liste.indexOf(wert)
      if (at >= 0) liste.splice(at, 1)
    }
  }

  /**
   * Liest den zusammengefaßten Stand.
   *
   * **Warum als benannte Funktion und nicht als Methode im Rückgabeobjekt.** Der erste Entwurf rief
   * in `liste` das eigene `quellen()` auf — ein freier Name, den es im Objektliteral nicht gibt.
   * Der Typecheck hat es gefunden, nicht der Testlauf. Eine herausgezogene Funktion ist außerdem
   * die Stelle, an der die Kopien entstehen: nach außen gibt es **Kopien** der Listen, damit ein
   * Aufrufer die Anmeldungen nicht versehentlich verändern kann.
   *
   * @returns der Stand, mit Kopien
   */
  function holeQuellen(): Rangquellen {
    const nach: Record<string, readonly Modellangabe[]> = {}
    for (const [familie, liste] of modelle) nach[familie] = liste
    return {
      familien: [...familien],
      anbieter: [...anbieter],
      tarife: [...tarife],
      ...(katalog === undefined ? {} : { katalog }),
      modelle: nach,
    }
  }

  return {
    meldeFamilie: (familie) => ausListe(familien, familie, `Die Familie „${familie.id}"`),
    meldeAnbieter: (eintrag) => ausListe(anbieter, eintrag, `Der Anbieter „${eintrag.id}"`),
    meldeTarife: (neu) => {
      const vorher = tarife.length
      tarife.push(...neu)
      return () => {
        tarife.length = vorher
      }
    },
    meldeKatalog: (neu) => {
      const alt = katalog
      katalog = neu
      return () => {
        katalog = alt
      }
    },
    meldeModelle: (familie, liste) => {
      const alt = modelle.get(familie)
      modelle.set(familie, liste)
      return () => {
        if (alt === undefined) modelle.delete(familie)
        else modelle.set(familie, alt)
      }
    },
    quellen: holeQuellen,
    liste: (optionen = {}) => {
      const q = holeQuellen()
      return baueRangliste({
        familien: q.familien,
        anbieter: q.anbieter,
        tarife: q.tarife,
        modelle: q.modelle,
        ...(q.katalog === undefined ? {} : { katalog: q.katalog }),
        ...(optionen.faehigkeiten === undefined ? {} : { faehigkeiten: optionen.faehigkeiten }),
        ...(optionen.jetzt === undefined ? {} : { jetzt: optionen.jetzt }),
      })
    },
  }
}

/** Vergleicht zwei Anmeldungen auf dieselbe Kennung. */
function identisch<T>(a: T, b: T): boolean {
  const links = (a as { readonly id?: unknown }).id
  return typeof links === 'string' && links === (b as { readonly id?: unknown }).id
}

/**
 * Trägt Verzeichnis und Saat ein — **die Datentabellen, nichts weiter**.
 *
 * **Warum das hier stehen darf.** `Rangregister` erfüllt `Quellenmelder` **strukturell**; das
 * Paket `composition` kennt dieses Paket also nicht, und dieses Paket kennt von `composition` nur
 * diese eine Funktion. Kein Zyklus, keine zweite Wahrheit über die Form.
 *
 * **Was NICHT eingetragen wird:** der Katalog (er kommt aus einem Verwalterlauf und wird
 * **gereicht**), die gemessenen Modelllisten (sie kommen von der Sonde) und die Anbieter (sie
 * melden sich selbst — sie sind Umsetzungen, keine Daten).
 *
 * @param register - das Register
 * @param optionen - was abweichend eingetragen wird
 * @returns die Abmeldung und der Bericht — der Bericht steht in jeder Antwort
 */
export function meldeStandardquellen(
  register: Rangregister,
  optionen: Parameters<typeof meldeQuellen>[1] = {},
): ReturnType<typeof meldeQuellen> {
  return meldeQuellen(register, optionen)
}

// ---------------------------------------------------------------------------
// Die Fläche
// ---------------------------------------------------------------------------

/** Was der Endpunkt ausgibt. */
export interface Rangantwort {
  readonly status: 'ok'
  readonly service: string
  readonly version: string
  /** Die Zahlen, die eine Anzeige braucht. */
  readonly zahlen: ReturnType<typeof zaehle>
  readonly rangliste: Rangliste
  /** Was zusammengetragen war — damit ein leeres Ergebnis erklärbar ist. */
  readonly quellen: {
    readonly familien: number
    readonly anbieter: number
    readonly tarife: number
    readonly hatKatalog: boolean
    readonly familienMitModellen: number
  }
  /**
   * Was beim Start angemeldet wurde, Zeile für Zeile.
   *
   * **Warum das in jeder Antwort steht.** Es ist die einzige Auskunft, die „die Liste ist leer"
   * von „niemand hat etwas angemeldet" **und** von „beim Start ging etwas schief" unterscheidet.
   * Ohne sie müßte der Betreiber im Protokoll des Hosts suchen.
   */
  readonly quellenbericht: readonly string[]
}

/**
 * Baut die Antwort.
 *
 * **Warum die Quellenzahlen mitgeliefert werden.** Eine leere Liste hat zwei sehr verschiedene
 * Ursachen: „es gibt nichts" oder „niemand hat etwas angemeldet". Ohne diese Zahlen sähen beide
 * gleich aus — und der Betreiber suchte den Fehler bei den Anbietern statt bei der Verdrahtung.
 *
 * @param register - das Register
 * @param optionen - Einschränkung und Zeitpunkt
 * @returns die Antwort
 */
export function rangantwort(
  register: Rangregister,
  optionen: Abrufoptionen = {},
  quellenbericht: readonly string[] = [],
): Rangantwort {
  const quellen = register.quellen()
  // **Einmal rechnen, nicht zweimal.** Der erste Entwurf rechnete die Liste je einmal für `zahlen`
  // und für `rangliste`. Das war nicht nur doppelte Arbeit: ohne gereichten Zeitpunkt nimmt
  // `baueRangliste` die Uhr — und zwei Aufrufe können damit **zwei verschiedene** `erstelltAm`
  // tragen. Die Zahlen hätten sich dann auf eine andere Rechnung bezogen als die Liste daneben.
  const rangliste = register.liste(optionen)
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    zahlen: zaehle(rangliste),
    rangliste,
    quellen: {
      familien: quellen.familien.length,
      anbieter: quellen.anbieter.length,
      tarife: quellen.tarife.length,
      hatKatalog: quellen.katalog !== undefined,
      familienMitModellen: Object.keys(quellen.modelle).length,
    },
    quellenbericht: [...quellenbericht],
  }
}

/** Was in der Adresse an Fähigkeit verlangt wurde. */
export type Faehigkeitswunsch =
  /** Es war keine genannt. */
  | { readonly art: 'keine' }
  /** Eine gültige. */
  | { readonly art: 'gueltig'; readonly faehigkeit: Faehigkeit }
  /** Es war eine genannt, die es nicht gibt. */
  | { readonly art: 'ungueltig'; readonly roh: string }

/**
 * Liest die verlangte Fähigkeit aus der Adresse.
 *
 * **Warum ein ungültiger Wert ein eigener Ausgang ist und nicht „keine Angabe".** Der erste
 * Entwurf gab bei `?faehigkeit=quatsch` einfach `undefined` zurück — und der Endpunkt antwortete
 * mit der **vollen** Liste. Wer sich vertippt, bekäme also mehr, als er verlangt hat, und hielte es
 * für seine Auswahl. Ein Tippfehler muß **400** ergeben, mit der Liste der gültigen Werte.
 *
 * @param url - die angefragte Adresse
 * @returns was verlangt wurde
 */
export function faehigkeitswunsch(url: string | undefined): Faehigkeitswunsch {
  if (url === undefined) return { art: 'keine' }
  const frage = url.indexOf('?')
  if (frage < 0) return { art: 'keine' }
  const roh = new URLSearchParams(url.slice(frage + 1)).get('faehigkeit')
  if (roh === null || roh.trim() === '') return { art: 'keine' }
  return (FAEHIGKEITEN as readonly string[]).includes(roh)
    ? { art: 'gueltig', faehigkeit: roh as Faehigkeit }
    : { art: 'ungueltig', roh }
}

/** Ob die Textform verlangt wird. */
function willText(url: string | undefined): boolean {
  if (url === undefined) return false
  const frage = url.indexOf('?')
  if (frage < 0) return false
  const wert = new URLSearchParams(url.slice(frage + 1)).get('text')
  return wert !== null && wert !== '0' && wert !== 'false'
}

/**
 * Schreibt eine Antwort und beendet sie ausdrücklich.
 *
 * **Warum `Content-Length`.** Der Webserver des Cores verdichtet ab 1.024 Byte. Eine Antwort ohne
 * Längenangabe gilt dort als „unbekannte Länge" und wird verdichtet — für ein paar Dutzend Byte
 * unnötige Arbeit und ein `Content-Encoding`, das ein Aufrufer ohne gzip nicht lesen kann.
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param koerper - der Text
 * @param typ - der Inhaltstyp
 * @param head - ob nur die Kopfdaten gesendet werden
 */
function sende(
  res: ServerResponse,
  status: number,
  koerper: string,
  typ: string,
  head = false,
): void {
  const raw = Buffer.from(koerper, 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', typ)
  res.setHeader('Content-Length', String(raw.byteLength))
  // Eine zwischengespeicherte Preisliste ist eine falsche Preisliste — auf der Ebene des Browsers.
  res.setHeader('Cache-Control', 'no-store')
  if (head) res.end()
  else res.end(raw)
}

/**
 * Fragt die Anmelde- und Zaunprüfung des Hosts.
 *
 * **Warum verweigert wird, wenn die Prüfung fehlt.** Fehlt der Verbindungsdienst, ist die sichere
 * Annahme „nicht erlaubt": die Liste nennt Preise, Modellkennungen und die Verdrahtung des Hauses.
 * Ein ungeschützter Endpunkt wäre der teurere Fehler.
 *
 * @param ctx - der Plugin-Kontext
 * @param headers - die Kopfdaten
 * @returns `undefined`, wenn erlaubt — sonst der Status der Verweigerung
 */
export function abweisung(
  ctx: Context,
  headers: IncomingMessage['headers'],
): number | undefined {
  const verbindung = ctx.get('connection') as
    | { requestRejection?: (request: { headers: IncomingMessage['headers'] }) => number | undefined }
    | undefined
  if (verbindung === undefined || typeof verbindung.requestRejection !== 'function') return 503
  return verbindung.requestRejection({ headers })
}

/**
 * Der Handler der Liste.
 *
 * **Die Reihenfolge ist eine Entscheidung:** erst die Sperre, dann die Methode, dann die Arbeit.
 * Wer nicht angemeldet ist, erfährt nicht, welche Methoden die Adresse kennt.
 *
 * @param ctx - der Plugin-Kontext
 * @param register - das Register
 * @returns der Handler
 */
export function macheRangHandler(
  ctx: Context,
  register: Rangregister,
  quellenbericht: readonly string[] = [],
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const abgelehnt = abweisung(ctx, req.headers)
    if (abgelehnt !== undefined) {
      sende(
        res,
        abgelehnt,
        JSON.stringify({
          status: 'error',
          error:
            abgelehnt === 401 ? 'unauthenticated' : abgelehnt === 403 ? 'untrusted_origin' : 'unavailable',
        }),
        'application/json; charset=utf-8',
      )
      return
    }

    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      sende(res, 405, JSON.stringify({ status: 'error', error: 'method_not_allowed', allow: ['GET', 'HEAD'] }), 'application/json; charset=utf-8')
      return
    }

    const wunsch = faehigkeitswunsch(req.url)
    if (wunsch.art === 'ungueltig') {
      // **Ein Tippfehler ist 400, nicht „alles".** Siehe {@link faehigkeitswunsch}.
      sende(
        res,
        400,
        JSON.stringify({
          status: 'error',
          error: 'unknown_capability',
          unbekannt: wunsch.roh,
          erlaubt: FAEHIGKEITEN,
        }),
        'application/json; charset=utf-8',
      )
      return
    }
    const optionen: Abrufoptionen = wunsch.art === 'gueltig' ? { faehigkeiten: [wunsch.faehigkeit] } : {}

    if (willText(req.url)) {
      sende(res, 200, alsListe(register.liste(optionen)), 'text/plain; charset=utf-8', method === 'HEAD')
      return
    }
    sende(res, 200, JSON.stringify(rangantwort(register, optionen, quellenbericht), null, 2), 'application/json; charset=utf-8', method === 'HEAD')
  }
}

/** Was der Stapel-Endpunkt ausgibt. */
export interface Stapelantwort {
  readonly status: 'ok'
  readonly service: string
  readonly version: string
  /** Wie viele Teile je Form — die Zahl, die eine Anzeige braucht. */
  readonly formen: Readonly<Record<Form, number>>
  /** Die Pakete, die der Host **lädt** — muß mit `scripts/profile-patch.mjs` übereinstimmen. */
  readonly geladen: readonly string[]
  readonly eintraege: readonly unknown[]
}

/**
 * Baut die Auskunft über den Stapel.
 *
 * **Warum `geladen` getrennt steht.** Ein Eintrag mit `form: 'plugin'` behauptet, der Host lädt
 * ihn. Diese Behauptung ist an einer anderen Stelle geprüft (`scripts/profile-patch.mjs`) — sie
 * hier noch einmal auszugeben macht sie in der Antwort sichtbar, statt sie behaupten zu lassen.
 *
 * @returns die Antwort
 */
export function stapelantwort(): Stapelantwort {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    formen: zaehleFormen(),
    geladen: pluginPakete(),
    eintraege: KI_STAPEL,
  }
}

/**
 * Der Handler der Stapel-Auskunft.
 *
 * ## Warum dieser Endpunkt **offen** ist — und der Ranglisten-Endpunkt nicht
 *
 * Dieselbe Regel wie bei `GET /api/health`: eine Erreichbarkeitsauskunft, die eine Anmeldung
 * verlangt, kann nicht melden, daß die Anmeldung kaputt ist. Wer eine frische Installation
 * ansieht, hat noch **keine Sitzung** (die erste ist ein Claim) — er sähe eine Verweigerung und
 * nicht die Auskunft.
 *
 * **Was hier drinsteht, ist kein Geheimnis:** Paketnamen und je ein Satz Zweck. **Kein Preis,
 * keine Modellkennung, keine Zugangsdaten, keine Verdrahtungsstrategie.** Genau diese drei stehen
 * im Ranglisten-Endpunkt, und der bleibt geschützt.
 *
 * Die Welt (`/universe/`) wird ohnehin **ohne** Sitzung ausgeliefert — ein offener Bestand paßt zu
 * einer offenen Seite. Wer die Auskunft doch schützen will, hängt die Route in eine Schicht mit
 * `requestRejection`; die Form dafür steht im Ranglisten-Handler.
 *
 * @returns der Handler
 */
export function macheStapelHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      sende(res, 405, JSON.stringify({ status: 'error', error: 'method_not_allowed', allow: ['GET', 'HEAD'] }), 'application/json; charset=utf-8')
      return
    }
    sende(res, 200, JSON.stringify(stapelantwort(), null, 2), 'application/json; charset=utf-8', method === 'HEAD')
  }
}

/**
 * Hängt den Endpunkt ein und stellt das Register als Dienst bereit.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const register = erzeugeRegister()
  // `provide` und nicht `set`: `provide` meldet einen Dienst an, der **diesem Fiber gehört**, und
  // nimmt ihn beim Abhängen mit. Mit `set` bliebe ein Register stehen, dessen Quellen zu einem
  // toten Kontext gehören — genau die Sorte Rest, die eine spätere Neuladung unerklärlich
  // scheitern läßt.
  ctx.provide(DIENST, register)

  ctx.effect(() => {
    // **Die Datentabellen, und nur sie.** Verzeichnis und Saat sind Konstanten; die Sonde und der
    // Verwalter bleiben bei ihrem eigenen Anlaß. Ohne diese Zeile wäre der Endpunkt erreichbar und
    // **leer** — siehe den Dateikopf.
    const gemeldet = meldeStandardquellen(register)
    const rangliste: WebRoute = {
      kind: 'exact',
      path: RANKING_PATH,
      handler: macheRangHandler(ctx, register, gemeldet.bericht),
    }
    // **Der zweite Endpunkt im selben Plugin.** Er braucht kein Register und keine Quelle: er
    // berichtet über den Stapel selbst. Zwei Routen in einem Plugin statt zweier Plugins — weil
    // beide dieselbe Anmeldung, dieselbe Herkunft und dieselbe Abschaltung teilen.
    const stapel: WebRoute = {
      kind: 'exact',
      path: STACK_PATH,
      handler: macheStapelHandler(),
    }
    const ab = [ctx.webServer.register(rangliste), ctx.webServer.register(stapel)]
    return () => {
      for (const einer of ab.reverse()) einer()
      gemeldet.abmelden()
    }
  }, `${name} ${RANKING_PATH} ${STACK_PATH}`)
}

// --- Der KI-Stapel: was da ist, in welcher Form und wofür -------------------
export {
  KI_STAPEL,
  pluginPakete,
  zaehleFormen,
  type Form,
  type Stapeleintrag,
} from './stapel.ts'

export default apply
