/**
 * Das Zugänge-Plugin — vier Routen und ein Dienst.
 *
 * ## Die Flächen
 *
 * | Weg | Methode | Was er tut |
 * |---|---|---|
 * | `/api/pmh/zugaenge` | GET | die Einträge (ohne Werte), die Familien und der Stand |
 * | `/api/pmh/zugaenge/speichern` | POST | einen Eintrag anlegen oder ändern, dazu den Schlüssel |
 * | `/api/pmh/zugaenge/entfernen` | POST | Eintrag und Schlüssel löschen |
 * | `/api/pmh/zugaenge/pruefen` | POST | die **Sonde**: Wege und Modelle messen, ohne Geld auszugeben |
 *
 * ## Warum der Schlüssel nie zurückkommt
 *
 * Keine Antwort dieses Plugins enthält einen Schlüsselwert — auch nicht gekürzt, auch nicht
 * „maskiert". Die Oberfläche braucht ihn nicht: sie zeigt **gesetzt** oder **nicht gesetzt**. Ein
 * Wert, der einmal im Browser war, ist im Verlauf, im Cache und in jedem Screenshot.
 *
 * ## Warum Schreiben ein CSRF-Kopf verlangt
 *
 * Wer einen Schlüssel einträgt, ändert Zustand. Ein `POST` mit Sitzungskeks ist ohne weiteren
 * Nachweis von jeder fremden Seite auslösbar. Verlangt wird deshalb der Kopf `x-pmh-csrf`; liegt
 * zusätzlich der CSRF-Keks vor, müssen beide **gleich** sein. Ein fremder Ursprung kann einen
 * eigenen Kopf nicht ohne CORS-Freigabe senden — und dieses Plugin gibt keine.
 *
 * ## Warum die Sonde gesperrt ist
 *
 * Sie ist kostenlos (leere Aufträge), aber sie **ruft einen fremden Dienst auf**. Ein Endpunkt, den
 * jeder im Netz auslösen kann, wäre eine kleine Waffe gegen fremde Kontingente. Also dieselbe
 * Sperre wie beim Lesen — und dazu der CSRF-Kopf.
 *
 * @module @prometheus-harness/zugaenge/server
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'

import { abweisung } from '@prometheus-harness/ai-capabilities'
import type { Anbieter } from '@prometheus-harness/capabilities'
import type { Familie } from '@prometheus-harness/provider-directory'

import {
  Zugangsfehler,
  kennungAus,
  mitZugang,
  ohneZugang,
  pruefeEingabe,
  standVon,
  type Stand,
  type Zugang,
  type Zugangsdatei,
} from './vertrag.ts'
import { PruefFehler, anbieterAusZugang, familienAuswahl, familieFuer, sondeFuer, type Pruefbefund } from './verzeichnis.ts'
import {
  AblageFehler,
  CredentialAblage,
  liesDatei,
  schreibeDatei,
  zugaengePfad,
  type Schluesselablage,
  type Schluesselstand,
} from './speicher.ts'

// ---------------------------------------------------------------------------
// Kennungen
// ---------------------------------------------------------------------------

/**
 * Der stabile Plugin-Name.
 *
 * Zugleich der **Scope** der Credential-Records (`pmh-zugaenge/<id>`): ein Record, dessen Scope
 * kein registriertes Plugin trägt, ist eine Waise — und die soll man erkennen können.
 */
export const name = 'pmh-zugaenge'

/** Ohne Webserver gibt es keine Fläche. */
export const inject = ['webServer']

/**
 * Die Anzeige des Panels — **eingestellt wird sie in den Plugin-Einstellungen**.
 *
 * ## Warum die Anzeige ein Feld des Host-Eintrags ist
 *
 * Die Oberfläche kennt zwei Orte, an denen ein Plugin erscheinen kann, und beide sind
 * **Anmeldungen** des Plugins selbst, keine Vorrechte:
 *
 * | Ort | Anmeldung | Was der Nutzer sieht |
 * |---|---|---|
 * | Seitenleiste | `sidebar.panellist` | Zeile links, neben Chat und Terminal |
 * | Plugins-Liste | `plugins.item` | Karte in der Gruppe „Offiziell" mit Kurzfassung und eigener Seite |
 *
 * Welchen der beiden dieses Plugin nimmt, stand bisher **im Code** (`order: 14`, immer
 * `sidebar.panellist`). Hier steht es jetzt als Feld: der Eintrag `pmh-zugaenge` trägt es in seiner
 * Konfiguration, die Einstellungsseite zeigt es, und die Browser-Hälfte liest es über
 * `ctx.configForms.get('pmh-zugaenge')`.
 *
 * ## Warum `Config` auf der Host-Hälfte steht, obwohl die Anzeige im Browser passiert
 *
 * Die Einstellungsseite eines Eintrags speist sich aus dessen **Config-Schema** — es gibt keinen
 * zweiten Anmeldeweg für Einstellungen. Ein Feld, das nur der Browser kennt, wäre in keiner
 * Einstellungsseite sichtbar. Der Host liest die Werte nicht; er hält sie nur.
 *
 * ## Warum es kein Feld für eine Start-Kachel gibt
 *
 * Dieses Plugin meldet keine Guide-Kachel an — in `src/index.tsx` steht kein `guide:`-Eintrag. Ein
 * Feld dafür stünde in der Einstellungsseite und hätte keine Wirkung: eine Steuerung, die nichts
 * steuert. Kommt die Kachel, kommt das Feld mit ihr.
 *
 * **Vorgabe `sidebar`:** das ist das Verhalten von vorher. Ein Bestand soll sich durch das
 * Hinzufügen eines Feldes nicht ändern.
 */
export const Config = z.object({
  /**
   * Wo das Panel erscheint.
   *
   * `both` meldet beide Orte an — dieselbe Fläche an zwei Stellen, nicht zwei Flächen.
   */
  surface: z
    .union([z.const('sidebar'), z.const('plugins'), z.const('both'), z.const('none')])
    .default('sidebar')
    .description('sidebar · plugins · both · none'),
  /** Die Stelle in der Leiste bzw. in der Plugin-Liste. Kleinere Zahl steht weiter oben. */
  order: z.natural().max(999).default(14).description('Platz in der Liste, kleinere Zahl zuerst'),
  /** Eine eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  label: z.string().default('').description('leer = Beschriftung aus dem Sprachpaket'),
})

/** Die Adressen dieses Plugins. */
export const ROUTEN = {
  liste: '/api/pmh/zugaenge',
  speichern: '/api/pmh/zugaenge/speichern',
  entfernen: '/api/pmh/zugaenge/entfernen',
  pruefen: '/api/pmh/zugaenge/pruefen',
} as const

/** Der Kopf, in dem die Anwendung ihren CSRF-Wert mitschickt. */
export const CSRF_KOPF = 'x-pmh-csrf'

/** Der lesbare CSRF-Keks des Anmeldebereichs. */
export const CSRF_KEKS = 'pmh_csrf'

/** Wie groß ein Rumpf höchstens sein darf. */
export const RUMPF_MAX = 128 * 1024

// ---------------------------------------------------------------------------
// Umfeld
// ---------------------------------------------------------------------------

/** Was die Routen brauchen — im Test ersetzbar, im Betrieb aus dem Kontext gebaut. */
export interface Umfeld {
  /** Wo die Einträge liegen. */
  readonly datei: () => string
  /** Wo die Schlüssel liegen. */
  readonly ablage: Schluesselablage
  /** Die Uhr. */
  readonly jetzt: () => Date
}

/**
 * Für wen die Einträge gelten.
 *
 * **Warum das in der Antwort steht.** Die Credential-Naht des Harness ist **pro Prozess**: sie hat
 * keinen Nutzer-Parameter, und `credentials-postgres` arbeitet für *ein* Konto. Ein Panel, das
 * „mein Schlüssel" sagt und den Schlüssel des Rechners meint, wäre die unangenehmere Variante.
 */
export interface Geltung {
  /** Immer `host`. */
  readonly art: 'host'
  /** Das Konto, für das dieser Host läuft — `null`, wenn es niemand genannt hat. */
  readonly nutzer: string | null
}

/**
 * Liest den Geltungsbereich aus der Umgebung.
 *
 * @param umgebung - die Umgebung (im Test setzbar)
 * @returns der Geltungsbereich
 */
export function geltung(umgebung: Readonly<Record<string, string | undefined>> = process.env): Geltung {
  const roh = umgebung['PMH_BENUTZER']
  return { art: 'host', nutzer: roh === undefined || roh.trim() === '' ? null : roh.trim() }
}

// ---------------------------------------------------------------------------
// Der Dienst für andere Plugins
// ---------------------------------------------------------------------------

/**
 * Was andere Plugins von diesem Paket bekommen.
 *
 * **Warum es das gibt.** Ein Anbieter-Paket (OpenRouter, ein lokaler Whisper, ein Bildmodell) soll
 * nicht wissen, **wo** der Schlüssel liegt oder **wie** die Datei heißt. Es fragt diesen Dienst:
 * „gib mir den Zugang `openrouter` und seinen Schlüssel" — und baut sich daraus.
 *
 * **Der Schlüssel geht hier durch, aber nicht über HTTP.** Das ist der Unterschied: Host-Code darf
 * ihn sehen (er muß ihn in eine Kopfzeile schreiben), der Browser nicht.
 */
export interface Zugangsdienst {
  /** Alle Einträge. */
  liste(): Promise<readonly Zugang[]>
  /** Ein Eintrag. */
  zugang(id: string): Promise<Zugang | undefined>
  /** Die Familie eines Eintrags — für einen Anbieteraufbau. */
  familie(id: string): Promise<Familie | undefined>
  /**
   * Ein **fertiger Anbieter** aus dem Eintrag.
   *
   * `undefined` heißt: für diese Familie gibt es (noch) keine gemessene Umsetzung. Das ist eine
   * Auskunft, kein Fehler.
   */
  anbieter(id: string): Promise<Anbieter | undefined>
  /** Der Schlüssel eines Eintrags — Ablage vor Umgebung. */
  schluessel(id: string): Promise<string | undefined>
}

/**
 * Baut den Dienst.
 *
 * @param umfeld - Datei, Ablage und Uhr
 * @returns der Dienst
 */
export function macheDienst(umfeld: Umfeld): Zugangsdienst {
  const zugang = async (id: string): Promise<Zugang | undefined> => {
    return (await liesDatei(umfeld.datei())).zugaenge.find((eintrag) => eintrag.id === id)
  }
  return {
    async liste(): Promise<readonly Zugang[]> {
      return (await liesDatei(umfeld.datei())).zugaenge
    },
    zugang,
    async familie(id: string): Promise<Familie | undefined> {
      const gefunden = await zugang(id)
      return gefunden === undefined ? undefined : familieFuer(gefunden)
    },
    async anbieter(id: string): Promise<Anbieter | undefined> {
      const gefunden = await zugang(id)
      if (gefunden === undefined) return undefined
      return anbieterAusZugang(gefunden, () => umfeld.ablage.lies(id, gefunden.umgebung))
    },
    async schluessel(id: string): Promise<string | undefined> {
      const gefunden = await zugang(id)
      return gefunden === undefined ? undefined : umfeld.ablage.lies(id, gefunden.umgebung)
    },
  }
}

// ---------------------------------------------------------------------------
// Antworten
// ---------------------------------------------------------------------------

/** Ein Eintrag, wie ihn die Liste zeigt. */
export interface Anzeige extends Zugang {
  /** Ob ein Schlüssel hinterlegt ist — **ohne** den Wert. */
  readonly schluesselstand: Schluesselstand
  /** Der gerechnete Stand. */
  readonly stand: Stand
}

/**
 * Schreibt eine JSON-Antwort.
 *
 * @param res - die Antwort
 * @param status - der Status
 * @param koerper - der Rumpf
 */
function sende(res: ServerResponse, status: number, koerper: unknown): void {
  const text = JSON.stringify(koerper)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(text)),
  })
  res.end(text)
}

/**
 * Weist eine Anfrage ab — oder läßt sie durch.
 *
 * @param ctx - der Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 * @returns `true`, wenn bereits geantwortet wurde
 */
function gesperrt(ctx: Context, req: IncomingMessage, res: ServerResponse): boolean {
  const status = abweisung(ctx, req.headers)
  if (status === undefined) return false
  if (status === 503) {
    sende(res, 503, { fehler: 'kein Verbindungsdienst' })
    return true
  }
  sende(res, status, { fehler: 'nicht angemeldet' })
  return true
}

/**
 * Prüft die Methode.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 * @param erlaubt - die erlaubten Methoden
 * @returns `true`, wenn bereits geantwortet wurde
 */
function methodeFalsch(req: IncomingMessage, res: ServerResponse, erlaubt: readonly string[]): boolean {
  const methode = (req.method ?? 'GET').toUpperCase()
  if (erlaubt.includes(methode)) return false
  res.setHeader('allow', erlaubt.join(', '))
  sende(res, 405, { fehler: 'methode', erlaubt })
  return true
}

/**
 * Liest einen Kekswert.
 *
 * @param kopf - die Kekszeile
 * @param name - der Name
 * @returns der Wert oder `undefined`
 */
export function kekse(kopf: string | undefined, name: string): string | undefined {
  if (kopf === undefined) return undefined
  for (const teil of kopf.split(';')) {
    const [schluessel, ...rest] = teil.trim().split('=')
    if (schluessel === name) return rest.join('=')
  }
  return undefined
}

/**
 * Prüft den CSRF-Nachweis eines schreibenden Aufrufs.
 *
 * **Die Regel in Worten.** Der Kopf `x-pmh-csrf` muß da und nicht leer sein. Liegt der CSRF-Keks
 * vor, müssen beide gleich sein. Fehlt der Keks (etwa beim Zugang über den Host-Token, wo es keine
 * Sitzung gibt), genügt der Kopf — ihn kann eine fremde Seite ohne CORS-Freigabe nicht setzen.
 *
 * @param req - die Anfrage
 * @returns `undefined`, wenn der Nachweis steht — sonst der Grund
 */
export function csrfGrund(req: IncomingMessage): string | undefined {
  const kopf = req.headers[CSRF_KOPF]
  if (typeof kopf !== 'string' || kopf.trim() === '') {
    return `Der Kopf „${CSRF_KOPF}" fehlt.`
  }
  const keks = kekse(req.headers.cookie, CSRF_KEKS)
  if (keks !== undefined && keks !== kopf) {
    return 'Der CSRF-Wert stimmt nicht mit dem Keks überein.'
  }
  return undefined
}

/**
 * Liest den Rumpf als JSON.
 *
 * @param req - die Anfrage
 * @returns der gelesene Wert
 * @throws Error - bei zu großem Rumpf oder ungültigem JSON
 */
async function liesRumpf(req: IncomingMessage): Promise<unknown> {
  const teile: Buffer[] = []
  let groesse = 0
  for await (const teil of req) {
    const puffer = Buffer.isBuffer(teil) ? teil : Buffer.from(teil as string)
    groesse += puffer.byteLength
    if (groesse > RUMPF_MAX) throw new Error(`Der Rumpf ist größer als ${String(RUMPF_MAX)} Bytes.`)
    teile.push(puffer)
  }
  if (groesse === 0) return undefined
  const text = Buffer.concat(teile).toString('utf8')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Der Rumpf ist kein JSON.')
  }
}

/**
 * Baut aus einem Fehler eine Antwort — **ohne** den Rumpf zu wiederholen.
 *
 * @param res - die Antwort
 * @param fehler - der Fehler
 */
function fehlerAntwort(res: ServerResponse, fehler: unknown): void {
  if (fehler instanceof Zugangsfehler) {
    sende(res, 400, { fehler: 'unbrauchbar', maengel: fehler.maengel })
    return
  }
  if (fehler instanceof AblageFehler) {
    sende(res, 503, { fehler: 'ablage-fehlt', meldung: fehler.message })
    return
  }
  if (fehler instanceof PruefFehler) {
    sende(res, 400, { fehler: 'pruefung-unmoeglich', meldung: fehler.message })
    return
  }
  const meldung = fehler instanceof Error ? fehler.message : String(fehler)
  sende(res, 500, { fehler: 'intern', meldung })
}

// ---------------------------------------------------------------------------
// Die vier Routen
// ---------------------------------------------------------------------------

/**
 * Die Liste — Einträge, Familien und Stände.
 *
 * @param umfeld - Datei, Ablage und Uhr
 * @param ctx - der Kontext (für die Sperre)
 * @param req - die Anfrage
 * @param res - die Antwort
 */
async function liste(umfeld: Umfeld, ctx: Context, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (gesperrt(ctx, req, res)) return
  if (methodeFalsch(req, res, ['GET'])) return
  try {
    const datei = await liesDatei(umfeld.datei())
    const anzeigen: Anzeige[] = []
    for (const zugang of datei.zugaenge) {
      const stand = await umfeld.ablage.beschreibe(zugang.id, zugang.umgebung)
      anzeigen.push({ ...zugang, schluesselstand: stand, stand: standVon(zugang, stand.gesetzt) })
    }
    anzeigen.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    sende(res, 200, {
      datei: umfeld.datei(),
      geltung: geltung(),
      familien: familienAuswahl(),
      zugaenge: anzeigen,
    })
  } catch (fehler) {
    fehlerAntwort(res, fehler)
  }
}

/**
 * Legt einen Eintrag an oder ändert ihn — und optional seinen Schlüssel.
 *
 * Der Rumpf ist `{ zugang: <Eingabe>, wert?: "<schlüssel>" }`. Fehlt `zugang.id`, wird die Kennung
 * aus dem Namen gebildet; ist sie schon vergeben, wird sie **nicht** überschrieben, sondern
 * durchnumeriert.
 *
 * @param umfeld - Datei, Ablage und Uhr
 * @param ctx - der Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 */
async function speichern(umfeld: Umfeld, ctx: Context, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (gesperrt(ctx, req, res)) return
  if (methodeFalsch(req, res, ['POST'])) return
  const grund = csrfGrund(req)
  if (grund !== undefined) {
    sende(res, 403, { fehler: 'csrf-fehlt', meldung: grund })
    return
  }
  try {
    const rumpf = await liesRumpf(req)
    if (rumpf === null || typeof rumpf !== 'object' || Array.isArray(rumpf)) {
      throw new Zugangsfehler(['Erwartet war ein Objekt mit „zugang" und optional „wert".'])
    }
    const objekt = rumpf as Record<string, unknown>
    const eingabe = pruefeEingabe(objekt['zugang'], 'Der Zugang')
    const wert = objekt['wert']
    if (wert !== undefined && typeof wert !== 'string') {
      throw new Zugangsfehler(['„wert" muß Text sein.'])
    }

    const datei = await liesDatei(umfeld.datei())
    const jetzt = umfeld.jetzt()
    const vorhanden =
      eingabe.id === undefined ? undefined : datei.zugaenge.find((eintrag) => eintrag.id === eingabe.id)
    const id = vorhanden !== undefined ? vorhanden.id : freieKennung(datei, eingabe.id ?? kennungAus(eingabe.name))

    const zugang: Zugang = {
      ...eingabe,
      id,
      angelegt: vorhanden?.angelegt ?? jetzt.toISOString(),
      geaendert: jetzt.toISOString(),
    }
    await schreibeDatei(umfeld.datei(), mitZugang(datei, zugang))

    // **Erst die Datei, dann der Schlüssel.** Bricht das Speichern des Schlüssels ab, steht der
    // Eintrag da und meldet „kein Schlüssel" — sichtbar. Umgekehrt läge ein Schlüssel ohne Eintrag
    // in der Ablage: eine Waise, die niemand mehr findet.
    let warnung: string | undefined
    if (typeof wert === 'string' && wert.trim() !== '') {
      await umfeld.ablage.setze(id, wert)
    } else if (zugang.schluessel === 'kein') {
      // **Ein Eintrag, der keinen Schlüssel braucht, soll keinen behalten.** Sonst bliebe ein
      // Geheimnis liegen, von dem die Oberfläche behauptet, es sei nicht nötig.
      try {
        await umfeld.ablage.entferne(id)
      } catch (fehler) {
        warnung = fehler instanceof Error ? fehler.message : String(fehler)
      }
    }

    const stand = await umfeld.ablage.beschreibe(id, zugang.umgebung)
    sende(res, 200, {
      zugang: { ...zugang, schluesselstand: stand, stand: standVon(zugang, stand.gesetzt) },
      ...(warnung === undefined ? {} : { warnung }),
    })
  } catch (fehler) {
    fehlerAntwort(res, fehler)
  }
}

/**
 * Entfernt einen Eintrag und seinen Schlüssel.
 *
 * @param umfeld - Datei, Ablage und Uhr
 * @param ctx - der Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 */
async function entfernen(umfeld: Umfeld, ctx: Context, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (gesperrt(ctx, req, res)) return
  if (methodeFalsch(req, res, ['POST'])) return
  const grund = csrfGrund(req)
  if (grund !== undefined) {
    sende(res, 403, { fehler: 'csrf-fehlt', meldung: grund })
    return
  }
  try {
    const rumpf = await liesRumpf(req)
    const id = idAus(rumpf)
    const datei = await liesDatei(umfeld.datei())
    const { datei: neu, entfernt } = ohneZugang(datei, id)
    if (!entfernt) {
      sende(res, 404, { fehler: 'unbekannt', meldung: `Es gibt keinen Zugang „${id}".` })
      return
    }
    await schreibeDatei(umfeld.datei(), neu)
    let warnung: string | undefined
    try {
      await umfeld.ablage.entferne(id)
    } catch (fehler) {
      // **Der Eintrag ist weg, der Schlüssel vielleicht nicht.** Das zu verschweigen hieße, eine
      // Waise zu hinterlassen, die niemand mehr sieht. Also: gelöscht melden, die Warnung nennen.
      warnung = fehler instanceof Error ? fehler.message : String(fehler)
    }
    sende(res, 200, { entfernt: id, ...(warnung === undefined ? {} : { warnung }) })
  } catch (fehler) {
    fehlerAntwort(res, fehler)
  }
}

/**
 * Prüft einen Eintrag mit der Sonde.
 *
 * @param umfeld - Datei, Ablage und Uhr
 * @param ctx - der Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 */
async function pruefen(umfeld: Umfeld, ctx: Context, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (gesperrt(ctx, req, res)) return
  if (methodeFalsch(req, res, ['POST'])) return
  const grund = csrfGrund(req)
  if (grund !== undefined) {
    sende(res, 403, { fehler: 'csrf-fehlt', meldung: grund })
    return
  }
  try {
    const rumpf = await liesRumpf(req)
    const id = idAus(rumpf)
    const datei = await liesDatei(umfeld.datei())
    const zugang = datei.zugaenge.find((eintrag) => eintrag.id === id)
    if (zugang === undefined) {
      sende(res, 404, { fehler: 'unbekannt', meldung: `Es gibt keinen Zugang „${id}".` })
      return
    }
    const schluessel = await umfeld.ablage.lies(id, zugang.umgebung)
    if (zugang.schluessel === 'noetig' && (schluessel === undefined || schluessel === '')) {
      sende(res, 400, {
        fehler: 'kein-schluessel',
        meldung: 'Der Zugang braucht einen Schlüssel — hinterlegt ist keiner.',
      })
      return
    }
    const befund: Pruefbefund = await sondeFuer(zugang, {
      ...(schluessel === undefined ? {} : { schluessel }),
      jetzt: umfeld.jetzt(),
    })
    sende(res, 200, { befund })
  } catch (fehler) {
    fehlerAntwort(res, fehler)
  }
}

/**
 * Liest eine Kennung aus einem Rumpf.
 *
 * @param rumpf - der Rumpf
 * @returns die Kennung
 * @throws Zugangsfehler - wenn sie fehlt
 */
function idAus(rumpf: unknown): string {
  if (rumpf === null || typeof rumpf !== 'object' || Array.isArray(rumpf)) {
    throw new Zugangsfehler(['Erwartet war ein Objekt mit „id".'])
  }
  const id = (rumpf as Record<string, unknown>)['id']
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Zugangsfehler(['„id" fehlt.'])
  }
  return id.trim()
}

/**
 * Sucht eine freie Kennung.
 *
 * **Warum durchnumeriert und nicht überschrieben.** Wer zwei Zugänge „OpenRouter" nennt, meint
 * zwei — den privaten und den geschäftlichen. Den zweiten still über den ersten zu schreiben wäre
 * der Datenverlust, den niemand bemerkt.
 *
 * @param datei - der Bestand
 * @param basis - die gewünschte Kennung
 * @returns eine freie Kennung
 */
export function freieKennung(datei: Zugangsdatei, basis: string): string {
  if (!datei.zugaenge.some((eintrag) => eintrag.id === basis)) return basis
  for (let nummer = 2; nummer < 1000; nummer += 1) {
    const kandidat = `${basis}-${String(nummer)}`
    if (!datei.zugaenge.some((eintrag) => eintrag.id === kandidat)) return kandidat
  }
  throw new Zugangsfehler([`Für „${basis}" gibt es keine freie Kennung mehr.`])
}

// ---------------------------------------------------------------------------
// Einhängen
// ---------------------------------------------------------------------------

/**
 * Baut die Routen zu einem Umfeld.
 *
 * **Warum getrennt von `apply`.** Ein Test kann so die Routen prüfen, ohne einen Kontext zu bauen,
 * der wie ein Host aussieht. Und `apply` bleibt die kurze Stelle, die den Kontext liest.
 *
 * @param umfeld - Datei, Ablage und Uhr
 * @param ctx - der Kontext
 * @returns die Routen in Anmelde-Reihenfolge
 */
export function macheRouten(umfeld: Umfeld, ctx: Context): readonly WebRoute[] {
  return [
    { kind: 'exact', path: ROUTEN.liste, handler: (req, res) => liste(umfeld, ctx, req, res) },
    { kind: 'exact', path: ROUTEN.speichern, handler: (req, res) => speichern(umfeld, ctx, req, res) },
    { kind: 'exact', path: ROUTEN.entfernen, handler: (req, res) => entfernen(umfeld, ctx, req, res) },
    { kind: 'exact', path: ROUTEN.pruefen, handler: (req, res) => pruefen(umfeld, ctx, req, res) },
  ]
}

/**
 * Hängt Routen und Dienst ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const umfeld: Umfeld = {
    datei: () => zugaengePfad(),
    ablage: new CredentialAblage(ctx),
    jetzt: () => new Date(),
  }

  // **Der Dienst gehört dem Fiber.** Ein nacktes `ctx.provide` wäre dauerhaft: wer das Plugin im
  // Plugin-Fenster ausschaltet und wieder einschaltet, liefe beim zweiten Laden in „already
  // provided" — und das Plugin stürbe. Der Effekt gibt den Dienst beim Abhängen zurück. Ist er
  // schon da (zweite Instanz), bleibt er beim ersten: geteilt statt doppelt.
  ctx.effect(() => {
    if (ctx.get('zugaenge') !== undefined) return () => undefined
    // Der Rücknehmer von `provide` ist selbst ein Disposer; ihn zurückzugeben (statt ihn zu
    // rufen) läßt Cordis das Abmelden beim Abhängen **abwarten**.
    return ctx.provide('zugaenge', macheDienst(umfeld))
  }, `${name}: Dienst zugaenge`)

  ctx.effect(() => {
    const abgemeldet = macheRouten(umfeld, ctx).map((route) => ctx.webServer.register(route))
    return () => {
      for (const ab of [...abgemeldet].reverse()) ab()
    }
  }, `${name} ${Object.values(ROUTEN).join(' ')}`)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Das Verzeichnis der Zugänge — siehe {@link Zugangsdienst}. */
    zugaenge: Zugangsdienst
  }
}

export default apply
