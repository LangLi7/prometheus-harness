/**
 * **API-Token je Konto — der eine Weg, an dem ein Schlüssel hereinkommt.**
 *
 * ## Warum diese Datei existiert
 *
 * `user_secrets` und die Umschlagverschlüsselung gibt es seit C1; sie hatten nur
 * **keinen Aufrufer im Betrieb**. Ein Schlüssel ließ sich bisher allein mit
 * `scripts/geheimnis.mjs` setzen — also vom Bediener, nicht vom Benutzer. Genau
 * das fehlte: *„jeder User hat sein eigenes AI-API-Token-Modell"*.
 *
 * Diese Datei hängt **drei** Wege in den Webserver:
 *
 * | Weg | Methode | Was er tut | CSRF |
 * |---|---|---|---|
 * | `/api/pmh/token` | `GET` | Anbieter und **nur** „gesetzt/nicht gesetzt" + Hinweis | nein |
 * | `/api/pmh/token` | `POST` | einen Schlüssel setzen (Klartext im Rumpf) | **ja** |
 * | `/api/pmh/token` | `DELETE` | den Schlüssel dieses Kontos entfernen | **ja** |
 *
 * ## Was **nie** zurückkommt
 *
 * Der Klartext. Nach dem Speichern antwortet der Weg mit demselben
 * `key_hint`, den `verpacke` bildet (acht Hexzeichen eines SHA-256) — genug, um
 * „ist das noch derselbe Schlüssel?" zu beantworten, und **kein** Ersatz für den
 * Schlüssel. Auch `GET` liest die Bytes **nicht**: `listeGeheimnisse` holt
 * `value_cipher` und `wrapped_key` gar nicht erst ab.
 *
 * ## Warum der Klartext im Rumpf stehen darf und nicht in der Adresse
 *
 * Ein Token in der Adresse landet im Verlauf, im Proxy-Log und im `Referer`. Im
 * Rumpf eines `POST` mit `content-type: application/json` bleibt er in der
 * Anfrage — und der Host schreibt ihn nicht ins Protokoll. Die **Oberfläche**
 * zeigt ihn nach dem Speichern nicht wieder an.
 *
 * ## Kein Hauptschlüssel ist ein **benannter** Zustand
 *
 * `holeHauptschluessel` wirft, wenn weder Datei noch Umgebungsvariable einen
 * Schlüssel haben. Das ist kein 500: der Weg antwortet mit **503
 * `kein-hauptschluessel`** und einem Satz, der den nächsten Schritt nennt
 * (`bun scripts/schluessel.mjs`). So sieht der Benutzer „noch nicht
 * eingerichtet" statt „kaputt".
 *
 * @module @prometheus-harness/auth-http/token
 */

import {
  KryptoFehler,
  VERSION_VARIABLE,
  fingerabdruck,
  holeHauptschluessel,
  standardQuellen,
  type Hauptschluessel,
} from '@prometheus-harness/secrets'
import {
  listeGeheimnisse,
  loescheGeheimnis,
  speichereGeheimnis,
  type GeheimnisAnzeige,
  type SqlZugang,
} from '@prometheus-harness/store-postgres'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { leseKoerper, macheWeg, sende, type Weg } from './http.ts'
import { gut, schlecht, type Umgebung } from './paths.ts'
import { csrfFehlt, pruefeSitzung } from './sitzung.ts'

/** Der eine Weg dieser Datei. */
export const PFAD_TOKEN = '/api/pmh/token'

/** Ein Anbieter, dessen Schlüssel hier gesetzt werden kann. */
export interface TokenAnbieter {
  /** Die Kennung des **Anbieters** (`openrouter`) — nicht die eines Modells. */
  readonly id: string
  /** Der Name für Menschen. */
  readonly name: string
  /** Der Name in `user_secrets` — in der Schreibweise der Umgebungsvariablen. */
  readonly ref: string
  /** Wo der Schlüssel herkommt, in einem Satz — für die Oberfläche. */
  readonly herkunft: string
}

/**
 * **Die Anbieter, deren Schlüssel die Oberfläche anbietet.**
 *
 * Die Liste ist eine Aussage über **Schlüssel**, nicht über Fähigkeiten: ein
 * OpenRouter-Schlüssel bedient Chat, TTS, Transkription, Einbetten und Bild
 * (siehe `docs/status/faehigkeiten-und-anbieter.md`). Deshalb steht der
 * Schlüssel beim Anbieter und nicht bei der Fähigkeit.
 *
 * Die `ref`-Namen sind dieselben, die `scripts/geheimnis.mjs` benutzt. Wer den
 * Schlüssel dort schon gesetzt hat, findet ihn hier als „gesetzt" vor — zwei
 * Namen für dieselbe Sache wären zwei Wahrheiten.
 */
export const TOKEN_ANBIETER: readonly TokenAnbieter[] = [
  { id: 'openrouter', name: 'OpenRouter', ref: 'OPENROUTER_API_KEY', herkunft: 'Chat, Sprache, Einbetten, Bild — ein Schlüssel' },
  { id: 'deepseek', name: 'DeepSeek', ref: 'DEEPSEEK_API_KEY', herkunft: 'Chat und Reasoning' },
  { id: 'anthropic', name: 'Anthropic', ref: 'ANTHROPIC_API_KEY', herkunft: 'Chat (Claude)' },
  { id: 'zai', name: 'Z.ai', ref: 'ZAI_API_KEY', herkunft: 'Chat und Entscheiden' },
  { id: 'zenmux', name: 'ZenMux', ref: 'ZENMUX_API_KEY', herkunft: 'Chat über einen Vermittler' },
  { id: 'nous', name: 'Nous Research', ref: 'NOUS_API_KEY', herkunft: 'Chat (Hermes)' },
  { id: 'opencode', name: 'OpenCode Zen', ref: 'OPENCODE_API_KEY', herkunft: 'Chat über OpenCode' },
]

/** Ein Anbieter nach seiner Kennung — oder `undefined`. */
export function anbieterMit(id: string): TokenAnbieter | undefined {
  return TOKEN_ANBIETER.find((anbieter) => anbieter.id === id)
}

/**
 * Prüft einen eingegebenen Schlüssel.
 *
 * **Warum eine Mindestlänge.** Ein leerer Wert oder ein einzelnes Zeichen ist
 * kein Schlüssel; ihn zu verschlüsseln und als „gesetzt" anzuzeigen wäre eine
 * Lüge über den Zustand. Acht Zeichen sind absichtlich niedrig: die Form der
 * Anbieter ist verschieden, und eine zu strenge Regel würde einen gültigen
 * Schlüssel abweisen. Die **Obergrenze** ist wichtiger: 4 KiB sind kein
 * Schlüssel, sondern ein Versehen oder ein Angriff auf den Speicher.
 *
 * @param wert - der gelesene Wert aus dem Rumpf
 * @returns der getrimmte Schlüssel oder der Grund
 */
export function alsToken(wert: unknown): { readonly ok: true; readonly token: string } | { readonly ok: false; readonly message: string } {
  if (typeof wert !== 'string') return { ok: false, message: 'Der Schlüssel fehlt oder ist kein Text.' }
  const token = wert.trim()
  if (token.length < 8) return { ok: false, message: 'Der Schlüssel ist zu kurz (mindestens 8 Zeichen).' }
  if (token.length > 4096) return { ok: false, message: 'Der Schlüssel ist zu lang (höchstens 4096 Zeichen).' }
  // **Kein Leerraum im Wert.** Ein versehentlich eingefügter Zeilenumbruch wäre
  // sonst Teil des Schlüssels — und der Anbieter antwortete mit 401, ohne daß
  // jemand sieht, warum.
  if (/\s/u.test(token)) return { ok: false, message: 'Der Schlüssel enthält Leerraum — bitte ohne Umbrüche einfügen.' }
  return { ok: true, token }
}

/** Der Hauptschlüssel wird **einmal** geholt und dann gehalten. */
let hauptCache: Hauptschluessel | undefined

/**
 * Holt den Hauptschlüssel — oder sagt, daß keiner eingerichtet ist.
 *
 * @param umg - die Umgebung (für das Home)
 * @returns der Schlüssel oder `undefined`
 */
function hauptschluessel(umg: Umgebung): Hauptschluessel | undefined {
  if (hauptCache !== undefined) return hauptCache
  const roh = Number(process.env[VERSION_VARIABLE] ?? '1')
  const version = Number.isInteger(roh) && roh > 0 ? roh : 1
  try {
    hauptCache = holeHauptschluessel(standardQuellen(process.env, umg.home), version)
    return hauptCache
  } catch (fehler) {
    if (fehler instanceof KryptoFehler) return undefined
    throw fehler
  }
}

/** Die Antwort auf „kein Hauptschlüssel" — ein Satz mit dem nächsten Schritt. */
function ohneHauptschluessel() {
  return schlecht(
    503,
    'kein-hauptschluessel',
    'Der Hauptschlüssel für die Geheimnisse fehlt. Einmal einrichten: `bun scripts/schluessel.mjs` — danach den Host neu starten.',
  )
}

/** Was die Oberfläche von einem Anbieter sehen darf. */
interface AnbieterStatus extends TokenAnbieter {
  readonly gesetzt: boolean
  readonly hinweis?: string
  readonly fassung?: number
  readonly aktualisiert?: string
}

/** Baut die Statusliste aus den Zeilen — **ohne** Klartext und ohne Geheimtext. */
function statusListe(zeilen: readonly GeheimnisAnzeige[]): readonly AnbieterStatus[] {
  const nachRef = new Map(zeilen.map((zeile) => [zeile.ref, zeile]))
  return TOKEN_ANBIETER.map((anbieter) => {
    const zeile = nachRef.get(anbieter.ref)
    return zeile === undefined
      ? { ...anbieter, gesetzt: false }
      : {
          ...anbieter,
          gesetzt: true,
          hinweis: zeile.keyHint,
          fassung: zeile.masterKeyVersion,
          aktualisiert: zeile.updatedAt,
        }
  })
}

/**
 * `GET /api/pmh/token` — welche Anbieter haben einen Schlüssel?
 *
 * Liest **nur** die Anzeige-Zeilen (`ref`, `key_hint`, `master_key_version`,
 * `updated_at`). Der Geheimtext wird nicht abgefragt; es gibt also keinen Pfad,
 * auf dem diese Antwort den Schlüssel tragen könnte.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegTokenListe(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await pruefeSitzung(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    try {
      const zeilen = await listeGeheimnisse(sql, wer.wer.userId)
      sende(res, gut({ anbieter: statusListe(zeilen) }))
    } catch {
      sende(res, schlecht(500, 'speicher-fehler', 'Die Ablage konnte nicht gelesen werden.'))
    }
  }
}

/**
 * `POST /api/pmh/token` — einen Schlüssel setzen.
 *
 * **Die Reihenfolge ist Absicht:** Sitzung, dann CSRF, dann Rumpf, dann
 * Hauptschlüssel. Ohne Sitzung ist der CSRF-Wert bedeutungslos; ohne CSRF darf
 * kein Schreibweg beginnen; und der Hauptschlüssel wird erst geholt, wenn die
 * Anfrage überhaupt schreiben darf.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegTokenSetzen(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await pruefeSitzung(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }
    const koerper = await leseKoerper(req)
    if (!koerper.ok) {
      sende(res, schlecht(koerper.status, koerper.code, koerper.message))
      return
    }
    const daten = koerper.wert as { readonly provider?: unknown; readonly token?: unknown }
    const anbieter = anbieterMit(typeof daten.provider === 'string' ? daten.provider : '')
    if (anbieter === undefined) {
      sende(res, schlecht(400, 'anbieter-unbekannt', 'Diesen Anbieter gibt es nicht.'))
      return
    }
    const geprueft = alsToken(daten.token)
    if (!geprueft.ok) {
      sende(res, schlecht(400, 'token-unbrauchbar', geprueft.message))
      return
    }
    const haupt = hauptschluessel(umg)
    if (haupt === undefined) {
      sende(res, ohneHauptschluessel())
      return
    }
    const bytes = new TextEncoder().encode(geprueft.token)
    try {
      await speichereGeheimnis(sql, haupt, {
        userId: wer.wer.userId,
        ref: anbieter.ref,
        klartext: bytes,
      })
      sende(
        res,
        gut({
          anbieter: {
            ...anbieter,
            gesetzt: true,
            hinweis: fingerabdruck(bytes),
            fassung: haupt.version,
            aktualisiert: new Date().toISOString(),
          } satisfies AnbieterStatus,
        }),
      )
    } catch {
      sende(res, schlecht(500, 'speicher-fehler', 'Der Schlüssel konnte nicht gespeichert werden.'))
    }
  }
}

/**
 * `DELETE /api/pmh/token?provider=…` — einen Schlüssel entfernen.
 *
 * Löschen ist **kein** stiller Erfolg: die Antwort sagt, ob wirklich eine Zeile
 * weggefallen ist. Ein zweiter Aufruf ist damit kein Fehler — er sagt „war schon
 * weg" (`entfernt: false`).
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegTokenEntfernen(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await pruefeSitzung(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }
    const adresse = new URL(req.url ?? '/', 'http://127.0.0.1')
    const anbieter = anbieterMit(adresse.searchParams.get('provider') ?? '')
    if (anbieter === undefined) {
      sende(res, schlecht(400, 'anbieter-unbekannt', 'Diesen Anbieter gibt es nicht.'))
      return
    }
    try {
      const entfernt = await loescheGeheimnis(sql, wer.wer.userId, anbieter.ref)
      sende(res, gut({ anbieter: { ...anbieter, gesetzt: false }, entfernt }))
    } catch {
      sende(res, schlecht(500, 'speicher-fehler', 'Der Schlüssel konnte nicht entfernt werden.'))
    }
  }
}

/**
 * **Ein Weg, drei Methoden.**
 *
 * Der Webserver schlüsselt seine Wege über `(kind, path)` — drei Einträge mit
 * demselben Pfad würden beim Start **werfen** („duplicate exact route"). Deshalb
 * gibt es einen Eintrag und diese Verteilung; `macheWeg` prüft vorher, welche
 * Methode erlaubt ist.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegToken(umg: Umgebung, sql: SqlZugang): Weg {
  const liste = wegTokenListe(umg, sql)
  const setzen = wegTokenSetzen(umg, sql)
  const entfernen = wegTokenEntfernen(umg, sql)
  return async (req, res) => {
    const methode = (req.method ?? 'GET').toUpperCase()
    if (methode === 'GET' || methode === 'HEAD') return await liste(req, res)
    if (methode === 'POST') return await setzen(req, res)
    return await entfernen(req, res)
  }
}

/**
 * Alle Wege dieses Moduls, fertig für `ctx.webServer.register`.
 *
 * **Ein Eintrag, nicht drei.** Der Webserver kennt `(kind, path)` als Schlüssel;
 * drei Einträge für denselben Pfad wären ein Startfehler, kein Routing.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns die Wege
 */
export function tokenWege(umg: Umgebung, sql: SqlZugang): readonly WebRoute[] {
  return [
    {
      kind: 'exact',
      path: PFAD_TOKEN,
      handler: macheWeg(['GET', 'POST', 'DELETE'], wegToken(umg, sql), 'token'),
    },
  ]
}
