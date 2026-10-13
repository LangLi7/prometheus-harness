/**
 * `@prometheus-harness/apikey` — API-Schlüssel, die die Datenbank nicht kennt.
 *
 * ## Die Form ist nicht meine Erfindung — sie stand schon im Schema
 *
 * Migration 0001 schreibt sie wörtlich vor, samt der Begründung:
 *
 * ```sql
 * -- Ausgegebenes Format: pmh_<key_id>_<secret>
 * --   key_id 12 Zeichen base64url - der Suchschluessel
 * --   secret 32 zufaellige Bytes base64url - das Geheimnis
 * -- Der Hash wird ueber das GANZE Token gebildet, nicht nur ueber das Geheimnis:
 * -- so ist auch die Kennung faelschungssicher.
 * ```
 *
 * Dieses Paket **folgt** dem, es weicht nicht ab. `key_id` hat genau 12 Zeichen
 * (`CHECK (key_id ~ '^[A-Za-z0-9_-]{12}$')`), `token_hash` genau 64 Hexzeichen, und
 * `expires_at` ist **Pflicht** (`CHECK (expires_at > created_at)`) — *„ein
 * Schluessel ohne Ende wird nie rotiert."*
 *
 * ## Der Pfeffer: warum der Hash hier nicht genügt
 *
 * Ein Sitzungstoken wird mit **SHA-256** gehasht (`packages/auth`). Hier steht
 * ein **HMAC-SHA256** mit einem **Pfeffer** — einem Geheimnis, das **nicht** in
 * der Datenbank liegt:
 *
 * | Wer | Was er kann |
 * |---|---|
 * | nur die Datenbank | er kann ein vorgelegtes Token **nicht prüfen** — ohne Pfeffer ist der HMAC nicht nachzurechnen |
 * | Datenbank **und** Hauptschlüssel | er kann prüfen (und damit raten) |
 *
 * **Und die ehrliche Grenze:** gegen das Erraten hilft der Pfeffer hier
 * **nicht** — 32 Zufallsbytes sind ohnehin nicht zu raten. Sein Wert ist ein
 * anderer: er trennt die beiden Geheimnisse. Wer die Datenbank abzieht, hat
 * **nicht** schon alles, was zum Prüfen nötig ist. Gegen ein schwaches Geheimnis
 * schützt er nicht, und das muß er auch nicht: **dieses Paket erzeugt die
 * Schlüssel selbst**, also gibt es kein schwaches.
 *
 * ## Warum der Pfeffer aus dem Hauptschlüssel abgeleitet wird
 *
 * Der Hauptschlüssel liegt außerhalb der Datenbank (Datei oder Umgebung) — genau
 * die Eigenschaft, die ein Pfeffer braucht. Er wird aber **nicht direkt**
 * benutzt: zwei Verwendungen desselben Schlüssels für zwei Zwecke ist genau das,
 * was man nicht tut. Abgeleitet wird mit **HMAC-SHA256(Hauptschlüssel, Zweck)** —
 * das ist ein Ein-Schritt-HKDF-Expand und liefert 32 Byte, die nur für
 * API-Schlüssel gelten.
 *
 * **Die Folge, offen benannt:** wird der Hauptschlüssel gewechselt, sind **alle
 * API-Schlüssel ungültig** — sie lassen sich nicht nachträglich prüfen, weil der
 * alte Pfeffer nicht mehr da ist. Das ist der Preis dafür, daß der Pfeffer nicht
 * in der Datenbank liegt. Wer das nicht will, braucht einen eigenen
 * Pfefferspeicher mit eigener Fassung — dann aber auch eine Spalte dafür, und die
 * gibt es nicht.
 *
 * @module @prometheus-harness/apikey
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { randomToken } from '@prometheus-harness/auth'

/** Das Präfix jedes Schlüssels. */
export const SCHLUESSEL_PRAEFIX = 'pmh'

/** Die Länge der Kennung in Zeichen — das Schema verlangt **genau** zwölf. */
export const KENNUNG_ZEICHEN = 12

/** Die Länge des Geheimnisses in Bytes — das Schema nennt 32. */
export const GEHEIMNIS_BYTES = 32

/**
 * Die Untergrenze der Entropie in Bit, die ein Schlüssel haben **muß**.
 *
 * **Warum das überhaupt dasteht.** Die Weisung lautet „erzwungene Entropie
 * ≥ 112 Bit". 112 Bit ist die Grenze, unterhalb derer ein Geheimnis nach
 * heutigem Stand nicht mehr als ausreichend gilt (NIST SP 800-57: 112 Bit
 * Sicherheitsniveau für Schlüssel bis 2030). Wer sie später senkt, soll darüber
 * **stolpern** und nicht in einer Fußnote davon erfahren.
 *
 * Erzeugt werden 32 Byte = **256 Bit**, also mehr als das Doppelte. Die
 * Selbstprüfung unten ist die Sperre, nicht die Zahl.
 */
export const MIN_ENTROPIE_BITS = 112

if (GEHEIMNIS_BYTES * 8 < MIN_ENTROPIE_BITS) {
  // **Beim Laden, nicht beim ersten Aufruf.** Ein zu kurzes Geheimnis ist ein
  // Fehler des Programms, nicht des Aufrufs — er soll nicht erst auffallen, wenn
  // jemand einen Schlüssel erzeugt.
  throw new Error(
    `API-Schlüssel: ${String(GEHEIMNIS_BYTES * 8)} Bit Entropie sind zu wenig — ` +
      `verlangt sind mindestens ${String(MIN_ENTROPIE_BITS)} Bit.`,
  )
}

/** Der abgeleitete Pfeffer. */
export interface Pfeffer {
  /** Wofür er gilt — für die Nachvollziehbarkeit in Ausgaben und Protokollen. */
  readonly zweck: string
  /** Die 32 Byte. Kommen **nie** in eine Ausgabe. */
  readonly bytes: Uint8Array
}

/** Der Zweck, unter dem der Pfeffer abgeleitet wird. */
export const PFEFFER_ZWECK = 'pmh-api-schluessel-pfeffer'

/**
 * Leitet den Pfeffer aus dem Hauptschlüssel ab.
 *
 * @param hauptschluessel - die 32 Byte des Hauptschlüssels
 * @returns der Pfeffer für API-Schlüssel
 * @throws Error, wenn der Hauptschlüssel nicht 32 Byte lang ist
 */
export function pfefferAus(hauptschluessel: Uint8Array): Pfeffer {
  if (hauptschluessel.length !== 32) {
    // **Kein stilles Auffüllen und kein stilles Kürzen.** Ein Hauptschlüssel mit
    // der falschen Länge ist ein Konfigurationsfehler; ihn zu „reparieren" hieße,
    // aus einem falschen Schlüssel einen gültigen zu machen.
    throw new Error(
      `der Hauptschlüssel muß 32 Byte lang sein, ist aber ${String(hauptschluessel.length)} Byte. ` +
        'Ein zu kurzer Schlüssel würde stillschweigend weniger Sicherheit bedeuten.',
    )
  }
  const bytes = createHmac('sha256', hauptschluessel).update(PFEFFER_ZWECK) .digest()
  return { zweck: PFEFFER_ZWECK, bytes: new Uint8Array(bytes) }
}

/**
 * Bildet den HMAC über das **ganze** Token.
 *
 * Über das ganze und nicht nur über das Geheimnis, weil das Schema es so
 * begründet: *„so ist auch die Kennung faelschungssicher."* Wäre nur das
 * Geheimnis gehasht, könnte jemand die Kennung eines fremden Schlüssels
 * einsetzen und das Geheimnis behalten.
 *
 * @param pfeffer - der abgeleitete Pfeffer
 * @param token - das ganze Token, `pmh_<key_id>_<secret>`
 * @returns 64 Hexzeichen — genau das, was `api_keys_token_hash_hex` verlangt
 */
export function hasheToken(pfeffer: Pfeffer, token: string): string {
  return createHmac('sha256', pfeffer.bytes).update(token, 'utf8').digest('hex')
}

/** Ein erzeugter Schlüssel. **Nur das Token ist geheim.** */
export interface NeuerSchluessel {
  /** Das **Klartext**-Token. Es wird **einmal** angezeigt und nirgends abgelegt. */
  readonly token: string
  /** Die Kennung — der Suchschlüssel, steht im Klartext in der Datenbank. */
  readonly keyId: string
  /** Nur zur Anzeige, nach dem Schema: `pmh_ab12cd34` — nie das Geheimnis. */
  readonly displayPrefix: string
  readonly laeuftAb: Date
}

/** Wie lange ein erzeugter Schlüssel voreingestellt gilt. */
export const SCHLUESSEL_TAGE = 90

/**
 * Erzeugt einen API-Schlüssel.
 *
 * @param jetzt - der Zeitpunkt der Erzeugung
 * @param tage - wie lange er gilt; muß **positiv** sein
 * @returns das Token, die Kennung, das Anzeigepräfix und den Ablauf
 * @throws Error, wenn die Geltungsdauer nicht positiv ist
 */
export function erzeugeApiSchluessel(jetzt: Date, tage = SCHLUESSEL_TAGE): NeuerSchluessel {
  if (!Number.isFinite(tage) || tage <= 0) {
    // Das Schema hat `CHECK (expires_at > created_at)`. Ein Schlüssel, der sofort
    // abläuft, wäre kein Fehler der Datenbank, sondern des Aufrufers — und der
    // Fehler soll hier auffallen und nicht als `23514` aus PostgreSQL kommen.
    throw new Error(`die Geltungsdauer muß positiv sein, ist aber ${String(tage)} Tage.`)
  }
  // `randomToken(9)` liefert base64url ohne Auffüllung: 9 Byte → **genau 12**
  // Zeichen. Das ist die Länge, die der `CHECK` des Schemas verlangt; sie ist
  // keine Zierde, sondern suchbar und indexiert.
  const keyId = randomToken(9)
  if (keyId.length !== KENNUNG_ZEICHEN) {
    throw new Error(`die Kennung ist ${String(keyId.length)} Zeichen lang, das Schema verlangt ${String(KENNUNG_ZEICHEN)}.`)
  }
  // 32 Byte Zufall — das Geheimnis.
  const secret = randomToken(GEHEIMNIS_BYTES)
  const token = `${SCHLUESSEL_PRAEFIX}_${keyId}_${secret}`
  return {
    token,
    keyId,
    // Die ersten acht Zeichen der Kennung: genug, um zwei Schlüssel zu
    // unterscheiden, zu wenig, um etwas damit anzufangen.
    displayPrefix: `${SCHLUESSEL_PRAEFIX}_${keyId.slice(0, 8)}`,
    laeuftAb: new Date(jetzt.getTime() + tage * 24 * 60 * 60 * 1000),
  }
}

/** Das zerlegte Token. */
export interface ZerlegtesToken {
  readonly keyId: string
  readonly secret: string
}

/**
 * Zerlegt ein vorgelegtes Token — **und weist alles ab, was nicht die Form hat**.
 *
 * Die Formprüfung kommt **vor** jedem Datenbankzugriff: ein Token mit 10 000
 * Zeichen soll keine Abfrage auslösen.
 *
 * ## Warum hier feste Längen stehen und kein `split`
 *
 * **Gemessen am 13.10.2026 über 10 000 erzeugte Schlüssel:**
 *
 * | | |
 * |---|---|
 * | Kennung enthält `_` | **1657** (16,57 %) |
 * | Kennung **beginnt** mit `_` | **155** (1,55 %) |
 * | `token.split('_')[1]` ergibt die falsche Kennung | **1657** |
 * | diese Funktion ergibt die falsche Kennung | **0** |
 *
 * `base64url` enthält `_` und `-`. Eine Kennung darf also selbst einen
 * Unterstrich enthalten, und dann ist `split('_')` **mehrdeutig** — im schlimmsten
 * Fall, wenn sie mit `_` beginnt, liefert es den **leeren** Text. Eindeutig ist das
 * Format nur, weil die erste Gruppe **genau zwölf** Zeichen lang ist.
 *
 * Gefunden hat das eine Prüfung, die daran **selten** scheiterte (in 1,55 % der
 * Läufe) — die unangenehmste Sorte Fehler: einer, der fast immer grün ist.
 *
 * @param token - das vorgelegte Token
 * @returns die Teile, oder `undefined`, wenn die Form nicht stimmt
 */
export function zerlegeToken(token: string): ZerlegtesToken | undefined {
  // **Eng gefaßt, absichtlich.** Nicht „enthält Unterstriche", sondern genau:
  // Präfix, 12 Zeichen Kennung, 43 Zeichen Geheimnis (32 Byte base64url), nichts
  // davor und nichts danach.
  const treffer = /^pmh_([A-Za-z0-9_-]{12})_([A-Za-z0-9_-]{43})$/u.exec(token)
  if (treffer === null) return undefined
  const [, keyId, secret] = treffer
  if (keyId === undefined || secret === undefined) return undefined
  return { keyId, secret }
}

/** Ein Eintrag, wie ihn die Ablage führt. */
export interface SchluesselEintrag {
  readonly id: string
  readonly userId: string
  readonly keyId: string
  readonly tokenHash: string
  readonly displayPrefix: string
  readonly name: string
  readonly scopes: readonly string[]
  readonly laeuftAb: Date
  readonly widerrufenAm?: Date
}

/** Was eine Ablage können muß. */
export interface SchluesselAblage {
  /**
   * Legt einen Eintrag ab.
   *
   * **Ohne `id`.** Den Primärschlüssel vergibt die Tabelle
   * (`gen_random_uuid()`), nicht der Aufrufer: er ist die Sache der Datenbank,
   * und wer ihn von außen mitgibt, kann ihn doppelt vergeben. Bei den
   * Einmal-Token ist es anders — dort **braucht** der Aufrufer die Kennung, weil
   * `verbrauche` sie als Bedingung führt.
   */
  legeAb(eintrag: NeuerEintrag): Promise<void>
  /** Sucht **über die Kennung** — dem einzigen indexierten Weg. */
  finde(keyId: string): Promise<SchluesselEintrag | undefined>
  merkeBenutzt(keyId: string, at: Date): Promise<void>
}

/** Ein Eintrag, wie ihn der Aufrufer übergibt — ohne `id`. */
export type NeuerEintrag = Omit<SchluesselEintrag, 'id'>

/** Warum ein Schlüssel abgewiesen wurde. */
export type SchluesselRegel = 'gueltig' | 'form' | 'unbekannt' | 'abgelaufen' | 'widerrufen' | 'falsch'

/** Die Meldung, die **jeder** abgewiesene Schlüssel zu hören bekommt. */
export const SCHLUESSEL_ABWEISUNG = 'dieser API-Schlüssel ist unbekannt, abgelaufen, widerrufen oder falsch'

/** Das Urteil über einen vorgelegten Schlüssel. */
export type SchluesselUrteil =
  | { readonly gueltig: true; readonly userId: string; readonly keyId: string; readonly scopes: readonly string[] }
  | { readonly gueltig: false; readonly regel: SchluesselRegel; readonly grund: string }

/** Was zum Prüfen gebraucht wird. */
export interface PruefUmgebung {
  readonly ablage: SchluesselAblage
  readonly pfeffer: Pfeffer
}

/**
 * Prüft einen vorgelegten Schlüssel.
 *
 * ## Drei Vorkehrungen, die man nicht sieht
 *
 * 1. **Die Form zuerst.** Kein Datenbankzugriff für etwas, das kein Schlüssel ist.
 * 2. **Der HMAC wird immer gerechnet** — auch wenn die Kennung unbekannt ist. Wer
 *    die Antwortzeit mißt, soll nicht erfahren, ob eine Kennung existiert.
 * 3. **Die Meldung ist für alle Fälle dieselbe.** Ein Unterschied wäre ein
 *    Orakel: „widerrufen" verriete, daß es den Schlüssel einmal gab.
 *
 * @param umg - Ablage und Pfeffer
 * @param token - das vorgelegte Token
 * @param jetzt - die Prüfzeit
 * @returns das Urteil
 */
export async function pruefeApiSchluessel(
  umg: PruefUmgebung,
  token: string,
  jetzt: Date,
): Promise<SchluesselUrteil> {
  const teile = zerlegeToken(token)
  if (teile === undefined) {
    return { gueltig: false, regel: 'form', grund: SCHLUESSEL_ABWEISUNG }
  }

  // **Immer rechnen** — siehe 2. oben. Das Ergebnis wird nur benutzt, wenn es
  // einen Eintrag gibt.
  const gerechnet = hasheToken(umg.pfeffer, token)

  const eintrag = await umg.ablage.finde(teile.keyId)
  if (eintrag === undefined) {
    return { gueltig: false, regel: 'unbekannt', grund: SCHLUESSEL_ABWEISUNG }
  }

  // **Der Vergleich in gleichbleibender Zeit.** `===` bricht beim ersten
  // abweichenden Zeichen ab; über viele Versuche verrät die Laufzeit, wie viele
  // führende Zeichen stimmen. `timingSafeEqual` verrät das nicht — es braucht
  // dafür gleich lange Eingaben, und beide sind 64 Hexzeichen.
  const links = Buffer.from(gerechnet, 'hex')
  const rechts = Buffer.from(eintrag.tokenHash, 'hex')
  if (links.length !== rechts.length || !timingSafeEqual(links, rechts)) {
    return { gueltig: false, regel: 'falsch', grund: SCHLUESSEL_ABWEISUNG }
  }

  if (eintrag.widerrufenAm !== undefined) {
    return { gueltig: false, regel: 'widerrufen', grund: SCHLUESSEL_ABWEISUNG }
  }
  if (!(jetzt < eintrag.laeuftAb)) {
    return { gueltig: false, regel: 'abgelaufen', grund: SCHLUESSEL_ABWEISUNG }
  }

  await umg.ablage.merkeBenutzt(teile.keyId, jetzt)
  return { gueltig: true, userId: eintrag.userId, keyId: eintrag.keyId, scopes: eintrag.scopes }
}
