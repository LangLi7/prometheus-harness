/**
 * **Die Crew als Prometheus-Plugin — Wege und Host-Verdrahtung.**
 *
 * Bis zum 21.10.2026 war die Crew ein Eintrag ohne Fläche: `crew-plugin` hing Adapter,
 * Werkzeuge und Buchung ein, die Einstellung lag in `<home>/crew/config.json`, und wer sie
 * ändern wollte, öffnete einen Editor. Der Betreiber wollte sie dort, wo die anderen
 * Fähigkeiten stehen — im Plugin-Fenster, mit einem Panel, mit Wegen.
 *
 * | Weg | Methode | Was er tut |
 * |---|---|---|
 * | `/api/pmh/crew` | GET | Crews, Einstellungen, Betriebsplan **des angemeldeten Kontos** |
 * | `/api/pmh/crew` | PUT | den Stand dieses Kontos speichern (CSRF) |
 *
 * ## Warum ein Weg und nicht vier
 *
 * Der Stand ist **ein** Dokument: die Liste der Crews, die Standard-Crew, das Projekt und die
 * Frage, ob der Host sie bedient. Wer einzelne Crews anlegt und löscht, hat am Ende denselben
 * Zustand — nur mit mehr Wegen, die auseinanderlaufen können. `PUT` ersetzt den Stand des
 * Kontos in **einer** Transaktion.
 *
 * ## Wer hier antwortet
 *
 * Die Frage „ist die Anfrage angemeldet" gehört dem Verbindungsdienst und der Sitzung des
 * Kontos — hier wird sie über `pruefeSitzung` **gefragt**, nicht getroffen. Der Mandant kommt
 * aus der Sitzung, nie aus dem Rumpf.
 *
 * ## Ohne Datenbank
 *
 * Dann gibt es keine Konten und keine Sitzung: der Weg antwortet **200** mit dem Stand der
 * Datei und dem Grund, warum hier nichts geschrieben wird. Ein 503 wäre die Behauptung, das
 * Plugin sei kaputt — es ist nur die Ablage, die fehlt.
 *
 * @module @prometheus-harness/crew
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { verifyCsrf } from '@prometheus-harness/auth'
import {
  angabenAus,
  macheSqlZugang,
  pruefeSitzung,
  umgebungAus,
  type Antwort,
  type Umgebung,
} from '@prometheus-harness/auth-http'
import { homeAusUmgebung } from '@prometheus-harness/crew-plugin'
import type { Sprache } from '@prometheus-harness/crew-core-adapter'
import {
  alleAktiven,
  einzigesKonto,
  einzigesVerwalterkonto,
  fuerNutzer,
  konfigurationsdatei,
  liesDatei,
  liesEingabe,
  sichern,
  type Nutzerstand,
  type Sql,
  type TransaktionsSql,
} from '@prometheus-harness/crew-store'
import { defaultPmhHome, resolveEigenesHome } from '@prometheus-harness/home-paths'

import { haengeEin, konfigurationAus, planLesen, planwurzel, type Hostschicht, type Plansicht } from './host.ts'

/** Der stabile Plugin-Name — zugleich der Name des Cordis-Eintrags. */
export const name = 'pmh-crew'

/** Was das Plugin braucht: den Webserver für die Wege, den Seam für den Adapter, die Werkzeuge. */
export const inject = ['webServer', 'llm', 'tools'] as const

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
 * Welchen der beiden das Panel nimmt, war bisher **im Code entschieden** (`order: 14`, always
 * `sidebar.panellist`). Hier steht es jetzt als Feld: der Eintrag `pmh-crew` trägt es in seiner
 * Konfiguration, die Einstellungsseite zeigt es, und die Browser-Hälfte liest es über
 * `ctx.configForms.get('pmh-crew')`.
 *
 * ## Warum `Config` auf der Host-Hälfte steht, obwohl die Anzeige im Browser passiert
 *
 * Die Einstellungsseite eines Eintrags speist sich aus dessen **Config-Schema** — es gibt keinen
 * zweiten Anmeldeweg für Einstellungen. Ein Feld, das nur der Browser kennt, wäre in keiner
 * Einstellungsseite sichtbar. Der Host liest die Werte nicht; er hält sie nur.
 *
 * **Vorgabe `sidebar`:** das ist das Verhalten von vorher. Ein Bestand soll sich durch das
 * Hinzufügen eines Feldes nicht ändern.
 *
 * **Kein `guide`.** Dieses Plugin meldet keine Start-Kachel an; ein Feld dafür wäre eine
 * Einstellung ohne Wirkung.
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

/** Der Weg dieses Plugins. */
export const WEG = '/api/pmh/crew'

/** Wo die wählbaren Routen und Modelle stehen. */
export const WEG_KATALOG = '/api/pmh/crew/katalog'

/** Wie groß ein Rumpf höchstens sein darf. */
export const MAX_RUMPF = 64 * 1024

/** Das Präfix jeder Protokollzeile. */
const PRAEFIX = '[pmh] pmh-crew: '

/**
 * Die Sätze der Wege.
 *
 * **Englisch ist die erste Sprache, Deutsch die zweite.** Die Oberfläche schickt ihre aktuelle
 * Sprache mit (`?sprache=de|en`); ohne Angabe gilt Englisch. Die Protokollzeilen des Hosts bleiben
 * deutsch — sie gehören dem Betrieb, nicht dem Nutzer.
 */
interface Servertexte {
  readonly ohneDatenbank: string
  readonly ohneDatenbankGrund: string
  readonly rumpfZuGross: (n: number) => string
  readonly rumpfKeinJson: string
  readonly methode: (m: string) => string
  readonly gescheitert: string
  readonly abgewiesen: string
  readonly nurMitKonto: string
  readonly csrf: string
  readonly belegt: string
  readonly keinBetriebskonto: string
}

const SERVER: Readonly<Record<Sprache, Servertexte>> = {
  en: {
    ohneDatenbank: 'Without a database the crews are only read.',
    ohneDatenbankGrund:
      'DATABASE_URL is not set — the crews live in <home>/crew/config.json and are read-only here.',
    rumpfZuGross: (n) => `The body is larger than ${String(n)} bytes.`,
    rumpfKeinJson: 'The body is not JSON.',
    methode: (m) => `Method ${m} is not supported here.`,
    gescheitert: 'The request failed.',
    abgewiesen: 'not signed in',
    nurMitKonto: 'Changes need the account session. The host token is enough to read, not to write.',
    csrf: 'The CSRF value is missing or wrong.',
    belegt: 'That identifier already belongs to another account. It is also the model name, so it must be unique.',
    keinBetriebskonto: 'no operating account — the crews are available as models, the tools and the booking are not',
  },
  de: {
    ohneDatenbank: 'Ohne Datenbank werden die Crews nur gelesen.',
    ohneDatenbankGrund:
      'DATABASE_URL ist nicht gesetzt — die Crews liegen in <home>/crew/config.json und werden hier nur gelesen.',
    rumpfZuGross: (n) => `Der Rumpf ist größer als ${String(n)} Bytes.`,
    rumpfKeinJson: 'Der Rumpf ist kein JSON.',
    methode: (m) => `Methode ${m} ist hier nicht vorgesehen.`,
    gescheitert: 'Die Anfrage ist gescheitert.',
    abgewiesen: 'nicht angemeldet',
    nurMitKonto: 'Änderungen brauchen die Konto-Sitzung. Der Token des Wirts genügt zum Lesen, nicht zum Schreiben.',
    csrf: 'Der CSRF-Wert fehlt oder stimmt nicht.',
    belegt: 'Die Kennung gehört bereits einem anderen Konto. Sie ist zugleich der Modellname und muß eindeutig sein.',
    keinBetriebskonto: 'kein Betriebskonto — die Crews sind als Modelle da, Werkzeuge und Buchung nicht',
  },
}

/** Die Sätze in der gewählten Sprache. */
function servertexte(sprache: Sprache): Servertexte {
  return SERVER[sprache]
}

/**
 * Die Sprache einer Anfrage.
 *
 * **Englisch ist die Vorgabe.** Die Oberfläche schickt `?sprache=` mit; fehlt es, entscheidet
 * `Accept-Language`, und ohne beides gilt Englisch — die erste Sprache dieses Plugins.
 *
 * @param req - die Anfrage
 * @returns `de` oder `en`
 */
export function spracheAus(req: IncomingMessage): Sprache {
  const url = new URL(req.url ?? WEG, 'http://127.0.0.1')
  const gewuenscht = (url.searchParams.get('sprache') ?? '').trim().toLowerCase()
  if (gewuenscht.startsWith('de')) return 'de'
  if (gewuenscht.startsWith('en')) return 'en'
  const kopf = String(req.headers['accept-language'] ?? '').toLowerCase()
  if (/^\s*de\b/u.test(kopf) || /,\s*de\b/u.test(kopf)) return 'de'
  return 'en'
}

/**
 * Schreibt eine Zeile auf `stderr`.
 *
 * **Warum nicht nur `ctx.logger`.** Derselbe Befund wie in `crew-plugin`: der einzige
 * Log-Exporter des Kerns sammelt `warn`/`error` für **fehlgeschlagene** Einträge
 * (`dsh-app-boot/lib/index.js:4213`). Ein gelungenes Einhängen wäre über den Logger unsichtbar.
 *
 * @param meldung - was geschehen ist
 */
function protokoll(meldung: string): void {
  process.stderr.write(`${PRAEFIX}${meldung}\n`)
}

/** Was die Route über die Ablage weiß. */
type Ablage =
  | { readonly art: 'postgres'; readonly sql: TransaktionsSql; readonly umgebung: Umgebung }
  | { readonly art: 'datei' }

/**
 * Wählt die Ablage.
 *
 * **Warum `resolveEigenesHome` und nicht `DSH_HOME`.** Die Umgebung der Anmeldung braucht
 * Prometheus' **eigenes** Home (Claim, Gerätekennung). `resolveEigenesHome` wirft, wenn der
 * Pfad auf das DSH-Home zeigt — dann gilt der Vorgabeort, statt den Host zu verlieren.
 *
 * @param protokollArt - `http:` oder `https:` (bestimmt den Cookienamen)
 * @returns die Ablage
 */
function waehleAblage(protokollArt: string): Ablage {
  const angaben = angabenAus(process.env, protokollArt)
  if (angaben === undefined) return { art: 'datei' }
  let heim: string
  try {
    heim = resolveEigenesHome()
  } catch {
    heim = defaultPmhHome()
  }
  const sql = macheSqlZugang(angaben.adresse)
  return { art: 'postgres', sql, umgebung: umgebungAus(sql, angaben, heim) }
}

/**
 * Das Konto, dem Werkzeuge und Buchung gehören.
 *
 * **Die Reihenfolge ist die Entscheidung.** Erst die ausdrückliche Angabe
 * (`PMH_CREW_NUTZER`) — sie gilt auch dann, wenn es mehrere Konten gibt. Dann das **einzige**
 * Konto. Dann der **einzige aktive Verwalter** (die Rolle, die eine Installation führt). Sonst
 * `undefined` — dann bleiben die Modelle, Werkzeuge und Buchung entfallen.
 *
 * @param sql - der Zugang
 * @returns die Kennung oder `undefined`
 */
async function betriebskonto(sql: Sql): Promise<string | undefined> {
  const gewuenscht = (process.env['PMH_CREW_NUTZER'] ?? '').trim()
  if (gewuenscht !== '') return gewuenscht
  const einziges = await einzigesKonto(sql)
  if (einziges !== undefined) return einziges
  return await einzigesVerwalterkonto(sql)
}

/**
 * Schreibt eine JSON-Antwort.
 *
 * @param res - die Antwort
 * @param status - der Status
 * @param koerper - der Körper
 */
function antworte(res: ServerResponse, status: number, koerper: unknown): void {
  const text = JSON.stringify(koerper)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(text)),
  })
  res.end(text)
}

/**
 * Schreibt die Antwort der Sitzungsprüfung.
 *
 * @param res - die Antwort
 * @param antwort - was `pruefeSitzung` statt eines Aufrufers liefert
 */
function sendeAntwort(res: ServerResponse, antwort: Antwort, texte: Servertexte): void {
  for (const [name2, wert] of Object.entries(antwort.koepfe)) res.setHeader(name2, wert)
  // **Der Text kommt von hier, nicht aus der Anmeldung.** `pruefeSitzung` antwortet deutsch (so
  // sind seine Wege geschrieben); dieser Weg antwortet in der Sprache der Oberfläche.
  if (antwort.status === 401 || antwort.status === 403) {
    antworte(res, antwort.status, { fehler: `http-${String(antwort.status)}`, text: texte.abgewiesen })
    return
  }
  antworte(res, antwort.status, antwort.koerper ?? { fehler: 'abgewiesen', text: texte.abgewiesen })
}

/** Ein Fehler, den der Aufrufer verschuldet hat. */
class Rumpffehler extends Error {
  readonly status: number

  constructor(status: number, meldung: string) {
    super(meldung)
    this.status = status
  }
}

/**
 * Liest den Rumpf als JSON — mit Grenze.
 *
 * @param req - die Anfrage
 * @param texte - die Sätze der gewählten Sprache
 * @returns der geparste Rumpf
 * @throws Rumpffehler wenn der Rumpf zu groß oder kein JSON ist
 */
async function leseRumpf(req: IncomingMessage, texte: Servertexte): Promise<unknown> {
  const teile: Buffer[] = []
  let groesse = 0
  for await (const teil of req) {
    const puffer = Buffer.isBuffer(teil) ? teil : Buffer.from(String(teil))
    groesse += puffer.length
    if (groesse > MAX_RUMPF) throw new Rumpffehler(413, texte.rumpfZuGross(MAX_RUMPF))
    teile.push(puffer)
  }
  const text = Buffer.concat(teile).toString('utf8')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Rumpffehler(400, texte.rumpfKeinJson)
  }
}

/** Was die Route über den Betrieb sagen kann. */
interface Betrieb {
  /** Das Konto, dem Werkzeuge und Buchung gehören; `null`, wenn es keines gibt. */
  readonly nutzer: string | null
  /** Die Wurzel der Plandokumente. */
  readonly verzeichnis: string
  /** Ob der Host die Crews gerade bedient. */
  readonly werkzeuge: boolean
  /** Warum nicht, wenn nicht. */
  readonly grund?: string
}

/** Der Stand, wie ihn `GET` liefert. */
interface Sicht {
  readonly art: 'postgres' | 'datei'
  readonly crews: Nutzerstand['crews']
  readonly standard: string | null
  readonly projekt: string | null
  readonly aktiv: boolean
  readonly betrieb: Betrieb
  readonly plan: Plansicht | null
  readonly hinweis?: string
}

/**
 * Baut den Stand eines Kontos.
 *
 * @param sql - der Zugang
 * @param nutzerId - das Konto aus der Sitzung
 * @param verzeichnis - die Wurzel der Pläne
 * @param betrieb - der Betriebsnutzer und sein Zustand
 * @param crewWunsch - die gewünschte Crew (`?crew=`), sonst die Standard-Crew
 * @returns die Sicht
 */
async function sichtFuer(
  sql: Sql,
  nutzerId: string,
  verzeichnis: string,
  betrieb: Betrieb,
  crewWunsch: string | null,
): Promise<Sicht> {
  const stand = await fuerNutzer(sql, nutzerId)
  const crew = crewWunsch ?? stand.standard ?? stand.crews[0]?.id ?? null
  const plan = crew === null ? null : await planLesen(verzeichnis, nutzerId, crew, stand.projekt)
  return {
    art: 'postgres',
    crews: stand.crews,
    standard: stand.standard,
    projekt: stand.projekt,
    aktiv: stand.aktiv,
    betrieb,
    plan,
  }
}

/**
 * Hängt das Plugin ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const protokollArt = (ctx.webServer as { readonly protocol?: string }).protocol ?? 'http:'
  const ablage = waehleAblage(protokollArt)
  // **Die Pläne liegen dort, wo die Werkzeuge sie ablegen** — im Harness-Home. Das Home der
  // Anmeldung (Prometheus' eigenes) ist ein anderer Ort und bliebe für die Werkzeuge unsichtbar.
  const verzeichnis = planwurzel(homeAusUmgebung())

  /** Die zuletzt eingehängte Verdrahtung. */
  let abmelden: (() => void) | undefined
  /** Der Betriebsnutzer, sofern es genau einen gibt. */
  let betriebsnutzer: string | undefined
  /** Ob Werkzeuge und Buchung hängen (nicht nur die Modelle). */
  let werkzeugeAn = false

  /**
   * Baut die Verdrahtung aus dem gespeicherten Stand — und ersetzt die alte.
   *
   * **Warum neu gebaut und nicht nur ergänzt.** Der Adapter wird mit der Crew-Liste gebaut;
   * eine geänderte Liste braucht einen neuen. `applyMitKonfiguration` nimmt Adapter, Werkzeuge
   * und Buchung zusammen zurück — die Reihenfolge (erst abmelden, dann neu) ist deshalb bindend.
   *
   * @returns nichts; Fehler gehen ins Protokoll
   */
  const verdrahte = async (): Promise<void> => {
    const melde = (meldung: string): void => protokoll(`warn: ${meldung}`)
    let konfiguration
    let grund: string | undefined

    if (ablage.art === 'datei') {
      const lesung = liesDatei(konfigurationsdatei(homeAusUmgebung()))
      if (lesung.art !== 'da') {
        grund = lesung.art === 'kaputt' ? `die Datei ist unbrauchbar: ${lesung.grund}` : 'keine Konfigurationsdatei'
        protokoll(`nicht verdrahtet — ${grund}`)
        abmelden?.()
        abmelden = undefined
        werkzeugeAn = false
        return
      }
      konfiguration = konfigurationAus({
        nutzer: lesung.nutzer,
        verzeichnis,
        crews: lesung.crews,
        stand: {
          crews: lesung.crews,
          standard: lesung.standard,
          projekt: lesung.projekt,
          aktiv: true,
        },
      })
      betriebsnutzer = lesung.nutzer
      werkzeugeAn = false
    } else {
      const alle = await alleAktiven(ablage.sql)
      if (alle.length === 0) {
        grund = 'keine aktive Crew'
        protokoll(`nicht verdrahtet — ${grund}`)
        abmelden?.()
        abmelden = undefined
        werkzeugeAn = false
        return
      }
      const konto = await betriebskonto(ablage.sql)
      betriebsnutzer = konto
      const stand = konto === undefined
        ? { crews: [], standard: null, projekt: null, aktiv: true }
        : await fuerNutzer(ablage.sql, konto)
      konfiguration = konfigurationAus({
        nutzer: konto ?? null,
        verzeichnis,
        crews: alle.map((eintrag) => eintrag.crew),
        stand,
      })
    }

    if (konfiguration === undefined) {
      protokoll('nicht verdrahtet — keine Crew mit einem Modell')
      abmelden?.()
      abmelden = undefined
      werkzeugeAn = false
      return
    }
    abmelden?.()
    abmelden = haengeEin(ctx as unknown as Hostschicht, konfiguration, melde)
    werkzeugeAn = abmelden !== undefined && konfiguration.nurAdapter !== true
    if (konfiguration.nurAdapter === true) {
      protokoll(
        `nur Modelle — ${String(konfiguration.crews.length)} Crews; Werkzeuge und Buchung brauchen ein `
        + 'Betriebskonto (PMH_CREW_NUTZER, oder genau ein aktives Verwalterkonto)',
      )
    }
  }

  ctx.effect(() => {
    void verdrahte().catch((fehler: unknown) => {
      protokoll(`die Verdrahtung scheiterte: ${fehler instanceof Error ? fehler.message : String(fehler)}`)
    })
    return () => {
      abmelden?.()
      abmelden = undefined
    }
  }, `${name}: Verdrahtung`)

  /**
   * Der Handler beider Methoden.
   *
   * @param req - die Anfrage
   * @param res - die Antwort
   */
  const weg = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const texte = servertexte(spracheAus(req))
    try {
      const methode = (req.method ?? 'GET').toUpperCase()
      if (methode === 'GET' || methode === 'HEAD') {
        await liesWeg(req, res, texte)
        return
      }
      if (methode === 'PUT') {
        await schreibeWeg(req, res, texte)
        return
      }
      antworte(res, 405, { fehler: 'methode', text: texte.methode(methode) })
    } catch (fehler) {
      if (fehler instanceof Rumpffehler) {
        antworte(res, fehler.status, { fehler: 'rumpf', text: fehler.message })
        return
      }
      protokoll(`ein Weg scheiterte: ${fehler instanceof Error ? fehler.message : String(fehler)}`)
      antworte(res, 500, { fehler: 'gescheitert', text: texte.gescheitert })
    }
  }

  /** Liest den Stand — je nach Ablage aus der Datenbank oder aus der Datei. */
  const liesWeg = async (req: IncomingMessage, res: ServerResponse, texte: Servertexte): Promise<void> => {
    const sprache = spracheAus(req)
    if (ablage.art === 'datei') {
      const lesung = liesDatei(konfigurationsdatei(homeAusUmgebung()), sprache)
      const crews = lesung.art === 'da' ? lesung.crews : []
      const standard = lesung.art === 'da' ? lesung.standard : null
      const plan = lesung.art === 'da' && standard !== null && lesung.nutzer !== ''
        ? await planLesen(verzeichnis, lesung.nutzer, standard, lesung.projekt)
        : null
      antworte(res, 200, {
        art: 'datei',
        crews,
        standard,
        projekt: lesung.art === 'da' ? lesung.projekt : null,
        aktiv: true,
        betrieb: {
          nutzer: betriebsnutzer ?? null,
          verzeichnis,
          werkzeuge: werkzeugeAn,
          ...(lesung.art === 'kaputt' ? { grund: lesung.grund } : {}),
        },
        plan,
        hinweis: texte.ohneDatenbankGrund,
      } satisfies Sicht)
      return
    }

    const geprueft = await pruefeSitzung(ablage.umgebung, req)
    if (!geprueft.ok) {
      sendeAntwort(res, geprueft.antwort, texte)
      return
    }
    const url = new URL(req.url ?? WEG, 'http://127.0.0.1')
    const crewWunsch = url.searchParams.get('crew')
    const betrieb: Betrieb = {
      nutzer: betriebsnutzer ?? null,
      verzeichnis,
      werkzeuge: werkzeugeAn,
      ...(betriebsnutzer === undefined ? { grund: texte.keinBetriebskonto } : {}),
    }
    const sicht = await sichtFuer(ablage.sql, geprueft.wer.userId, verzeichnis, betrieb, crewWunsch)
    antworte(res, 200, sicht)
  }

  /** Schreibt den Stand des Kontos. */
  const schreibeWeg = async (
    req: IncomingMessage,
    res: ServerResponse,
    texte: Servertexte,
  ): Promise<void> => {
    const sprache = spracheAus(req)
    if (ablage.art === 'datei') {
      antworte(res, 409, {
        fehler: 'ohne-datenbank',
        text: texte.ohneDatenbank,
        datei: konfigurationsdatei(homeAusUmgebung()),
      })
      return
    }
    const geprueft = await pruefeSitzung(ablage.umgebung, req)
    if (!geprueft.ok) {
      sendeAntwort(res, geprueft.antwort, texte)
      return
    }
    if (geprueft.wer.session === undefined) {
      antworte(res, 403, { fehler: 'nur-mit-konto', text: texte.nurMitKonto })
      return
    }
    if (!verifyCsrf(geprueft.wer.session, geprueft.wer.csrfKopf ?? '')) {
      antworte(res, 403, { fehler: 'csrf-fehlt', text: texte.csrf })
      return
    }
    const roh = await leseRumpf(req, texte)
    const lesung = liesEingabe(roh, sprache)
    if (!lesung.ok) {
      antworte(res, 400, { fehler: 'eingabe', befunde: lesung.befunde })
      return
    }
    const gang = await sichern(ablage.sql, geprueft.wer.userId, lesung.wert)
    if (!gang.ok) {
      antworte(res, 409, {
        fehler: 'belegt',
        crewId: gang.crewId,
        text: texte.belegt,
      })
      return
    }
    await verdrahte()
    const sicht = await sichtFuer(ablage.sql, geprueft.wer.userId, verzeichnis, {
      nutzer: betriebsnutzer ?? null,
      verzeichnis,
      werkzeuge: werkzeugeAn,
    }, null)
    antworte(res, 200, sicht)
  }

  /**
   * Der Katalog der wählbaren Routen und Modelle.
   *
   * **Warum eine eigene Route.** Die Sicht ist ein Dokument des Kontos; der Katalog ist eine
   * Eigenschaft des Hosts und ändert sich, wenn ein Anbieter dazukommt. Getrennt bleibt das Panel
   * schnell, und die Auswahlliste kann nachladen, ohne den Entwurf zu blockieren.
   */
  const katalogWeg = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const texte = servertexte(spracheAus(req))
    const methode = (req.method ?? 'GET').toUpperCase()
    if (methode !== 'GET' && methode !== 'HEAD') {
      antworte(res, 405, { fehler: 'methode', text: texte.methode(methode) })
      return
    }
    // **Dieselbe Tür wie die Sicht.** In der Datei-Ablage gibt es kein Konto; mit Datenbank schon.
    if (ablage.art !== 'datei') {
      const geprueft = await pruefeSitzung(ablage.umgebung, req)
      if (!geprueft.ok) {
        sendeAntwort(res, geprueft.antwort, texte)
        return
      }
    }
    try {
      const wege = await Promise.all(
        ctx.llm.listProviders().map(async (anbieter) => {
          const modelle = await ctx.llm.listModels(anbieter.id).catch(() => [])
          return {
            id: anbieter.id,
            name: anbieter.name,
            modelle: modelle.map((modell) => ({
              id: modell.id,
              name: modell.name,
              ...(modell.description === undefined ? {} : { beschreibung: modell.description }),
            })),
          }
        }),
      )
      antworte(res, 200, { wege })
    } catch (fehler) {
      // **Ein Katalog, der scheitert, ist kein Grund für ein leeres Formular.** Die Oberfläche
      // fällt auf freie Eingabe zurück und sagt, warum.
      protokoll(`der Modellkatalog scheiterte: ${fehler instanceof Error ? fehler.message : String(fehler)}`)
      antworte(res, 200, { wege: [], hinweis: texte.gescheitert })
    }
  }

  ctx.effect(() => {
    const abgemeldet = ctx.webServer.register({ kind: 'exact', path: WEG, handler: weg })
    const abgemeldetKatalog = ctx.webServer.register({ kind: 'exact', path: WEG_KATALOG, handler: katalogWeg })
    return () => {
      abgemeldet()
      abgemeldetKatalog()
    }
  }, `${name}: Wege`)

  protokoll(
    ablage.art === 'datei'
      ? 'gestartet — ohne Datenbank: die Crews werden aus <home>/crew/config.json gelesen'
      : `gestartet — Crews je Konto in PostgreSQL, Pläne unter ${verzeichnis}`,
  )
}

export default apply

