/**
 * Das Usage-Plugin — zwei Routen, sonst nichts.
 *
 * ## Warum zwei Routen und nicht eine
 *
 * Der **Stand** ist eine große Antwort: 19 287 Datensätze werden zu Summen, Tagesreihe und
 * Rangliste gerechnet, dazu kommen jetzt **lebende Salden** und der **Modellkatalog**. Die
 * **Schätzung** ist eine kleine, die sich bei jeder Auswahl im Panel ändert. Beides in einer
 * Antwort hieße: bei jeder Änderung der Auflösung alles neu holen. Getrennt bleibt jede Route so
 * billig, wie sie ist.
 *
 * ## Warum der Stand jetzt ins Netz geht
 *
 * Der Betreiber am 21.10.2026: *„beim budget stimmt es nicht mehr, openrouter ist unter 20 dollar,
 * so rund 19.77"*. Die Datei trug einen drei Tage alten Zwischenspeicher (20,01). Gemessen:
 * `total_credits 40,49 − total_usage 20,7167` = **19,7733** — er hatte recht. Ein Guthaben ist
 * eine Frage an den Anbieter, keine Erinnerung aus einer Datei.
 *
 * ## Warum die Schätzung auf dem Server rechnet
 *
 * `schaetzeBildkosten` liegt in `@prometheus-harness/usage-ansicht` — **eine** Wahrheit. Rechnete
 * das Panel die Formel nach, gäbe es zwei, und die zweite wäre irgendwann falsch.
 *
 * ## Warum beide Routen gesperrt sind
 *
 * Sie nennen Guthaben und Ausgaben. Die Entscheidung, ob eine Anfrage angemeldet ist, gehört dem
 * Verbindungsdienst des Hosts — hier wird sie über `abweisung` **gefragt**, nicht getroffen.
 *
 * ## Warum der Geltungsbereich in der Antwort steht
 *
 * Die Schlüssel-Naht des Harness ist **pro Prozess, nicht pro Anfrage**: `resolve(ref)` hat keinen
 * Nutzer-Parameter, und der Postgres-Provider arbeitet für *ein* Konto (siehe
 * `packages/auth/credentials-postgres`: „Ein Benutzer, nicht viele"). Was das Panel zeigt, ist damit
 * der Verbrauch **dieses Hosts** — nicht der eines angemeldeten Prometheus-Nutzers. Das wird
 * ausgesprochen (`geltung`) statt verschwiegen: eine Anzeige, die „mein Guthaben" suggeriert und
 * das Guthaben des Rechners meint, ist die unangenehmere Variante.
 *
 * @module @prometheus-harness/usage/server
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { abweisung } from '@prometheus-harness/ai-capabilities'
import { BILDPREISE, PIXELSTUFEN, schaetzeBildkosten } from '@prometheus-harness/usage-ansicht'

import { Katalog, type Katalogstand } from './katalog.ts'
import { holeLebendeSalden, schluesselAusContext, verfuegbarkeitAusContext } from './salden.ts'
import { kandidaten, liesStand, type Saldo, type Schluesselposten, type Stand } from './stand.ts'

/**
 * Der stabile Plugin-Name.
 *
 * **Warum nicht `pmh-usage`.** Diesen Namen trägt `@prometheus-harness/usage-ansicht` bereits —
 * und Cordis führt Einträge über den exportierten Namen. Zwei Pakete mit demselben Namen sind
 * keine Warnung, sondern ein toter Eintrag: der Loader legt für den zweiten keinen Fiber an, und
 * die Meldung lautet nur „failed to import". Gemessen am 21.10.2026 im Schattenstart auf Port 3131.
 */
export const name = 'pmh-usage-panel'

/** Ohne Webserver gibt es keine Fläche zu bedienen. */
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
 * Welchen der beiden ein Plugin nimmt, war bisher **im Code entschieden** (`order: 13`, always
 * `sidebar.panellist`). Hier steht es jetzt als Feld: der Eintrag `pmh-usage` trägt es in seiner
 * Konfiguration, die Einstellungsseite zeigt es, und die Browser-Hälfte liest es über
 * `ctx.configForms.get('pmh-usage')`.
 *
 * ## Warum `Config` auf der Host-Hälfte steht, obwohl die Anzeige im Browser passiert
 *
 * Die Einstellungsseite eines Eintrags speist sich aus dessen **Config-Schema** — es gibt keinen
 * zweiten Anmeldeweg für Einstellungen. Ein Feld, das nur der Browser kennt, wäre in keiner
 * Einstellungsseite sichtbar. Der Host liest die Werte nicht; er hält sie nur.
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
  order: z.natural().max(999).default(13).description('Platz in der Liste, kleinere Zahl zuerst'),
  /** Eine eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  label: z.string().default('').description('leer = Beschriftung aus dem Sprachpaket'),
  /** Ob die Kachel auf dem Startbildschirm erscheint. */
  guide: z.boolean().default(true).description('Kachel auf dem Startbildschirm'),
})

/** Wo der Stand steht. */
export const WEG_STAND = '/api/pmh/usage/status'

/** Wo die Schätzung steht. */
export const WEG_SCHAETZUNG = '/api/pmh/usage/schaetzung'

/** Wie viele Bilder eine Schätzung höchstens umfaßt. */
export const ANZAHL_MAX = 10

/**
 * Für wen diese Zahlen gelten.
 *
 * **`art: 'host'` ist keine Ausrede, sondern die Messung der Naht.** Solange der Host mit *einem*
 * Konto läuft (`benutzer` in der Credential-Config), sind seine Schlüssel die dieses Kontos — und
 * `nutzer` nennt es, wenn die Umgebung es hergibt. Fehlt es, bleibt nur „dieser Rechner", und das
 * Panel sagt genau das.
 */
export interface Geltung {
  /** Immer `host`: die Zahlen gehören dem Prozess, nicht einer Anfrage. */
  readonly art: 'host'
  /** Das Konto, für das dieser Host läuft — `null`, wenn es niemand genannt hat. */
  readonly nutzer: string | null
}

/**
 * Liest den Geltungsbereich aus der Umgebung.
 *
 * **Warum `PMH_BENUTZER`.** Der Harness führt den Nutzer nicht im Modellaufruf; wer einen Host für
 * ein Konto startet, sagt es beim Start. Genau dieser Name ist die einzige Stelle, an der es
 * ankommt, ohne die Auth von innen anzufassen.
 *
 * @param umgebung - die Umgebung (im Test setzbar)
 * @returns der Geltungsbereich
 */
export function geltung(umgebung: Readonly<Record<string, string | undefined>> = process.env): Geltung {
  const roh = umgebung['PMH_BENUTZER']
  const nutzer = roh === undefined || roh.trim() === '' ? null : roh.trim()
  return { art: 'host', nutzer }
}

/** Ein Handler, wie ihn der Webserver erwartet. */
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Ein Modell, das der Schätzer zur Auswahl stellt. */
export interface Angebot {
  /** Die Modellkennung. */
  readonly modell: string
  /** Der Preis je Bild in USD — **nur**, wenn er gemessen oder abgeleitet ist. */
  readonly usd?: number
  /** `gemessen`, `abgeleitet` oder `katalog` (gelistet, ohne Preis). */
  readonly herkunft: string
  /** Der Anzeigename aus dem Katalog, wenn es einen gibt. */
  readonly name?: string
}

/** Was aus der Datei kam. */
export interface Quelle {
  /** Der gelesene Pfad oder `null`. */
  readonly datei: string | null
  /** Der Rohbestand; `undefined`, wenn nichts lesbar war. */
  readonly roh: unknown
  /** Warum nichts oder nur teilweise etwas kam. */
  readonly hinweis?: string
}

/**
 * Sucht und liest die Verbrauchsdatei.
 *
 * **Warum der erste Treffer gewinnt.** Die Kandidaten stehen in einer Reihenfolge (siehe
 * `kandidaten`); wer sie alle läse, hätte zwei Wahrheiten und müßte sie mischen. Der erste, der
 * existiert, ist die Antwort — und der Pfad wird mitgeliefert, damit man sieht, welche.
 *
 * @returns Pfad, Rohbestand und ein etwaiger Hinweis
 */
export async function liesQuelle(): Promise<Quelle> {
  for (const pfad of kandidaten()) {
    if (!existsSync(pfad)) continue
    try {
      return { datei: pfad, roh: JSON.parse(await readFile(pfad, 'utf8')) as unknown }
    } catch {
      return { datei: pfad, roh: undefined, hinweis: `Die Datei ${pfad} ließ sich nicht als JSON lesen.` }
    }
  }
  return { datei: null, roh: undefined, hinweis: 'Keine Verbrauchsdatei gefunden.' }
}

/**
 * Rechnet den Stand zum Zeitpunkt `jetzt`.
 *
 * @param jetzt - der Bezugspunkt (im Test setzbar)
 * @returns der Stand
 */
export async function standJetzt(jetzt: Date = new Date()): Promise<Stand> {
  const quelle = await liesQuelle()
  return liesStand(quelle.roh, {
    datei: quelle.datei,
    jetzt,
    ...(quelle.hinweis === undefined ? {} : { hinweis: quelle.hinweis }),
  })
}

/**
 * Der erste Wert, der dasteht.
 *
 * **Warum nicht `??`.** Bei `0` wäre `??` richtig, bei „kein Guthaben genannt" auch — aber die
 * Reihenfolge muß **lesbar** bleiben: lebend vor Datei, und je Feld. Eine Kette von `??` über
 * sieben Felder ist genau die Stelle, an der man später das falsche Feld nimmt.
 *
 * @param kandidaten - die Werte in Vorzugsreihenfolge
 * @returns der erste definierte Wert
 */
function erster<T>(...kandidaten: (T | undefined)[]): T | undefined {
  for (const wert of kandidaten) if (wert !== undefined) return wert
  return undefined
}

/**
 * Verschmilzt einen lebenden Saldo mit dem aus der Datei.
 *
 * **Feldweise, nicht ganz oder gar nicht.** Antwortet der Anbieter nur halb (Guthaben ja, Limit
 * nein), dann gilt das Guthaben lebend und das Limit aus der Datei — und der Ursprung sagt
 * `live`, weil die Zahl, um die es geht, lebend ist.
 *
 * @param datei - der Wert aus der Datei
 * @param live - der lebende Wert
 * @returns der verschmolzene Saldo
 */
export function verschmelzeSaldo(datei: Saldo, live: Saldo): Saldo {
  const guthabenUsd = erster(live.guthabenUsd, datei.guthabenUsd)
  const eingezahltUsd = erster(live.eingezahltUsd, datei.eingezahltUsd)
  const verbrauchtGesamtUsd = erster(live.verbrauchtGesamtUsd, datei.verbrauchtGesamtUsd)
  const limitUsd = erster(live.limitUsd, datei.limitUsd)
  const limitRestUsd = erster(live.limitRestUsd, datei.limitRestUsd)
  const verbrauchtUsd = erster(live.verbrauchtUsd, datei.verbrauchtUsd)
  const limitZeitraum = erster(live.limitZeitraum, datei.limitZeitraum)
  const detail = erster(live.detail, datei.detail)
  const fehler = erster(live.fehler, datei.fehler)
  const fehlerTechnisch = erster(live.fehlerTechnisch, datei.fehlerTechnisch)
  const waehrung = erster(live.waehrung, datei.waehrung)
  const lebend = guthabenUsd !== undefined && live.guthabenUsd !== undefined
  const quelle = lebend || (limitUsd !== undefined && live.limitUsd !== undefined) ? 'live' : 'datei'
  // **Der Stand gehört zur Zahl, nicht zum Versuch.** `holeLebendeSalden` setzt `stand` auch dann auf
  // „jetzt", wenn der Abruf scheitert — die Zahl kommt dann aus der Datei, und ein Datum von heute
  // darüber behauptet, sie sei frisch. Am 28.10.2026 stand so ein Datum über einem 6,8 Tage alten
  // Wert. Bei lebender Quelle gilt der lebende Stand, sonst der der Datei.
  const stand = quelle === 'live' ? erster(live.stand, datei.stand) : erster(datei.stand, live.stand)
  return {
    schluessel: datei.schluessel,
    quelle,
    ...(guthabenUsd === undefined ? {} : { guthabenUsd }),
    ...(waehrung === undefined ? {} : { waehrung }),
    ...(detail === undefined ? {} : { detail }),
    ...(eingezahltUsd === undefined ? {} : { eingezahltUsd }),
    ...(verbrauchtGesamtUsd === undefined ? {} : { verbrauchtGesamtUsd }),
    ...(limitUsd === undefined ? {} : { limitUsd }),
    ...(limitRestUsd === undefined ? {} : { limitRestUsd }),
    ...(verbrauchtUsd === undefined ? {} : { verbrauchtUsd }),
    ...(limitZeitraum === undefined ? {} : { limitZeitraum }),
    ...(stand === undefined ? {} : { stand }),
    ...(fehler === undefined ? {} : { fehler }),
    ...(fehlerTechnisch === undefined ? {} : { fehlerTechnisch }),
  }
}

/**
 * Stellt die Auswahl des Schätzers zusammen: Anker zuerst, dann der Katalog.
 *
 * @param katalog - der geholte Katalog
 * @returns die Angebote, ohne Doppelte
 */
export function stelleAngebote(katalog: Katalogstand): Angebot[] {
  const aus: Angebot[] = BILDPREISE.map((eintrag) => ({
    modell: eintrag.modell,
    usd: eintrag.usd,
    herkunft: eintrag.herkunft,
  }))
  const bekannt = new Set(aus.map((eintrag) => eintrag.modell))
  for (const modell of katalog.modelle) {
    if (bekannt.has(modell.modell)) continue
    bekannt.add(modell.modell)
    aus.push({
      modell: modell.modell,
      herkunft: 'katalog',
      ...(modell.name === undefined ? {} : { name: modell.name }),
    })
  }
  return aus
}

/**
 * Schreibt eine JSON-Antwort.
 *
 * @param res - die Antwort
 * @param status - der Status
 * @param koerper - der Körper
 */
function antworte(res: ServerResponse, status: number, koerper: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(koerper))
}

/**
 * Die Absage, wenn die Anfrage nicht angemeldet ist.
 *
 * @param ctx - der Plugin-Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 * @returns `true`, wenn schon geantwortet wurde
 */
function weiseAb(ctx: Context, req: IncomingMessage, res: ServerResponse): boolean {
  const status = abweisung(ctx, req.headers)
  if (status === undefined) return false
  antworte(res, status, {
    fehler: status === 401 ? 'nicht angemeldet' : 'kein Verbindungsdienst',
  })
  return true
}

/**
 * Liest die ausdrücklich als geteilt markierten Schlüssel.
 *
 * **Warum es das braucht.** Ein Team-Schlüssel ist erst dann als geteilt erkennbar, wenn die Datei
 * schon `REF:eigner`-Buchungen hat. Ein frisch geteilter Schlüssel hätte keine — und sähe wie ein
 * eigener aus. `PMH_GETEILT=OPENROUTER_API_KEY,FREELMAPI_API_KEY` sagt es vorher.
 *
 * @param umgebung - die Umgebung (im Test setzbar)
 * @returns die Namen, kleingeschrieben verglichen
 */
export function geteilteSchluessel(
  umgebung: Readonly<Record<string, string | undefined>> = process.env,
): ReadonlySet<string> {
  const roh = umgebung['PMH_GETEILT']
  if (roh === undefined) return new Set()
  return new Set(
    roh
      .split(',')
      .map((eintrag) => eintrag.trim())
      .filter((eintrag) => eintrag !== ''),
  )
}

/**
 * Hängt den eigenen Anteil und die Eigner an die Salden.
 *
 * **Warum am Saldo und nicht im Panel.** Der Anteil kommt aus denselben Datensätzen wie die
 * Summen; ihn im Browser zu suchen hieße, die Zuordnung ein zweites Mal zu schreiben.
 *
 * @param salden - die sichtbaren Salden
 * @param jeSchluessel - der Verbrauch je Schlüssel
 * @param ausdruecklich - ausdrücklich als geteilt markierte Namen
 * @returns die Salden mit Anteil und Eignern
 */
export function haengeAnteile(
  salden: readonly Saldo[],
  jeSchluessel: readonly Schluesselposten[],
  ausdruecklich: ReadonlySet<string>,
): Saldo[] {
  const nach = new Map(jeSchluessel.map((posten) => [posten.schluessel, posten]))
  return salden.map((saldo) => {
    const geteilt = ausdruecklich.has(saldo.schluessel)
    const posten = nach.get(saldo.schluessel)
    if (posten === undefined) return geteilt ? { ...saldo, geteilt: true } : saldo
    return {
      ...saldo,
      ...(geteilt ? { geteilt: true } : {}),
      ...(posten.anfragen === 0 ? {} : { hier30Usd: posten.usd30 }),
    }
  })
}

/**
 * Macht den Handler für den Stand.
 *
 * **`?frisch=1` übergeht den Katalog-Zwischenspeicher.** Der Knopf „Neu lesen" im Panel schickt
 * ihn mit — sonst hieße „neu lesen", daß neu aus der Datei gelesen wird, während der Nutzer einen
 * neuen Abruf meint.
 *
 * @param ctx - der Plugin-Kontext
 * @param katalog - der Katalog dieses Plugins
 * @returns der Handler
 */
function macheStand(ctx: Context, katalog: Katalog): Handler {
  return async (req, res) => {
    if (weiseAb(ctx, req, res)) return
    const url = new URL(req.url ?? WEG_STAND, 'http://127.0.0.1')
    const frisch = url.searchParams.get('frisch') === '1'

    const stand = await standJetzt()
    const [katalogstand, lebend] = await Promise.all([
      katalog.hole(frisch),
      holeLebendeSalden({ schluessel: schluesselAusContext(ctx), jetzt: new Date() }),
    ])

    // **Nur was hinterlegt ist.** Die Datei nennt jeden Namen, der je benutzt wurde; „was habe ich"
    // beantwortet der Speicher. Ein lebender Wert zählt ebenfalls als vorhanden — dann gibt es ihn
    // offensichtlich.
    const vorhanden = verfuegbarkeitAusContext(ctx)
    const sichtbar = await Promise.all(
      stand.salden.map(async (saldo) => ({
        saldo,
        da: lebend.has(saldo.schluessel) || (await vorhanden(saldo.schluessel)),
      })),
    )

    // Lebend gewinnt feldweise; was kein Anbieter beantwortet, bleibt der Stand der Datei.
    const salden: Saldo[] = sichtbar
      .filter((eintrag) => eintrag.da)
      .map((eintrag) => {
        const frisch2 = lebend.get(eintrag.saldo.schluessel)
        return frisch2 === undefined ? eintrag.saldo : verschmelzeSaldo(eintrag.saldo, frisch2)
      })
    for (const [schluessel, saldo] of lebend) {
      if (!salden.some((eintrag) => eintrag.schluessel === schluessel)) salden.push(saldo)
    }

    antworte(res, 200, {
      ...stand,
      // Geteilter Schlüssel: Guthaben gemeinsam, Anteil dieses Rechners aus denselben Datensätzen.
      salden: haengeAnteile(salden, stand.jeSchluessel, geteilteSchluessel()),
      // Wie viele Namen die Datei nannte, für die es hier keinen Schlüssel gibt — eine Zahl, keine
      // Zeile. Wer sie sieht, weiß, daß nichts verschwindet.
      ausgeblendet: stand.salden.length - salden.length,
      // **Der Geltungsbereich steht vor den Zahlen.** Wer „mein Guthaben" liest, soll sehen, wessen
      // Guthaben gemeint ist — das des Hosts, nicht das einer Prometheus-Sitzung.
      geltung: geltung(),
      schaetzung: { modelle: stelleAngebote(katalogstand), stufen: PIXELSTUFEN },
      katalog: {
        geholtAm: katalogstand.geholtAm,
        ...(katalogstand.fehler === undefined ? {} : { fehler: katalogstand.fehler }),
      },
    })
  }
}

/**
 * Macht den Handler für die Schätzung.
 *
 * **Unbekannte Auflösungen sind ein Fehler, kein stiller Rückfall.** Die Funktion selbst würde für
 * einen unbekannten Namen die Ankerfläche nehmen — das wäre eine Zahl, die niemand bestellt hat.
 *
 * @param ctx - der Plugin-Kontext
 * @returns der Handler
 */
function macheSchaetzung(ctx: Context): Handler {
  return async (req, res) => {
    if (weiseAb(ctx, req, res)) return
    const url = new URL(req.url ?? WEG_SCHAETZUNG, 'http://127.0.0.1')
    const modell = (url.searchParams.get('modell') ?? '').trim()
    if (modell === '') {
      antworte(res, 400, { fehler: 'der Parameter modell fehlt' })
      return
    }
    const stufe = url.searchParams.get('aufloesung')
    const aufloesung = stufe === null || stufe === '' ? undefined : stufe
    if (aufloesung !== undefined && !PIXELSTUFEN.includes(aufloesung)) {
      antworte(res, 400, {
        fehler: `unbekannte Auflösung „${aufloesung}" — erlaubt: ${PIXELSTUFEN.join(', ')}`,
      })
      return
    }
    const rohAnzahl = url.searchParams.get('anzahl')
    let anzahl = 1
    if (rohAnzahl !== null && rohAnzahl !== '') {
      anzahl = Number(rohAnzahl)
      if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > ANZAHL_MAX) {
        antworte(res, 400, { fehler: `anzahl muss eine ganze Zahl von 1 bis ${String(ANZAHL_MAX)} sein` })
        return
      }
    }
    const schaetzung = schaetzeBildkosten(modell, {
      anzahl,
      ...(aufloesung === undefined ? {} : { aufloesung }),
    })
    antworte(res, 200, {
      modell,
      anzahl,
      ...(aufloesung === undefined ? {} : { aufloesung }),
      schaetzung,
    })
  }
}

/**
 * Hängt die beiden Routen ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  // **Der Katalog ist übersteuerbar.** Ein Rechner ohne Netz (oder ein Test) soll nicht bei jedem
  // Öffnen des Panels acht Sekunden auf openrouter.ai warten.
  const katalogWeg = process.env['PMH_KATALOG_URL']
  const katalog = new Katalog(katalogWeg === undefined ? {} : { weg: katalogWeg })
  ctx.effect(() => {
    const abgemeldet: (() => void)[] = [
      ctx.webServer.register({ kind: 'exact', path: WEG_STAND, handler: macheStand(ctx, katalog) }),
      ctx.webServer.register({ kind: 'exact', path: WEG_SCHAETZUNG, handler: macheSchaetzung(ctx) }),
    ]
    return () => {
      for (const ab of abgemeldet) ab()
    }
  }, `${name} Routen`)
}

export default apply
