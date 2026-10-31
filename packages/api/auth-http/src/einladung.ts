/**
 * `@prometheus-harness/auth-http/einladung` — die **Regeln** einer Einladung.
 *
 * ## Warum eine eigene Datei
 *
 * Dieselbe Begründung wie bei `packages/auth/claim`: eine Prüfung, die nur mit
 * laufender Datenbank läuft, wird nicht geprüft. Hier steht die gesamte
 * Entscheidung — *ist dieser Link noch gut?* — als reine Funktion über einem
 * Datensatz. `paths.ts` reicht nur durch, `invitations.ts` speichert nur.
 *
 * ## Was eine Einladung ist — und was sie nicht ist
 *
 * Ein Link mit einem **Einmal-Token und Ablauf**. Wer ihn hat, darf **ein**
 * Konto anlegen; danach ist er verbraucht. Er ist **nicht** an eine Adresse
 * gebunden (sonst könnte man ihn nicht weitergeben, und genau das ist sein
 * Zweck) und **nicht** an einen Rechner (anders als der Claim: der Admin lädt
 * Menschen ein, nicht Maschinen).
 *
 * ## Warum 32 zufällige Bytes und SHA-256
 *
 * Dasselbe Argument wie bei den Sitzungstoken: 256 Bit Zufall sind nicht zu
 * erraten, gleichgültig wie schnell das Hash-Verfahren ist. Ein langsames
 * Verfahren (Argon2id) kostete hier nur Zeit und brächte nichts — es gibt kein
 * Wörterbuch möglicher Einladungen.
 *
 * ## Die Dauer
 *
 * Der Ablauf ist **Pflicht** und wird vom Admin gewählt. Die Grenzen sind keine
 * Willkür:
 *
 * | Grenze | Warum |
 * |---|---|
 * | **mindestens 1 Minute** | kürzer ist kein Link, den man verschicken kann |
 * | **höchstens 30 Tage** | ein Link, der ein Quartal gilt, ist ein Passwort, das niemand mehr sieht |
 * | **Vorgabe 7 Tage** | lang genug für „schick das per Mail", kurz genug, daß ein vergessener Link nicht ewig offensteht |
 *
 * @module @prometheus-harness/auth-http/einladung
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { EinladungRecord } from '@prometheus-harness/store-postgres'

// ---------------------------------------------------------------------------
// Die Grenzen
// ---------------------------------------------------------------------------

/** Wie lange eine Einladung ohne Angabe gilt: sieben Tage. */
export const EINLADUNG_VORGABE_SEKUNDEN = 7 * 24 * 60 * 60

/** Die kürzeste erlaubte Gültigkeit: eine Minute. */
export const EINLADUNG_MIN_SEKUNDEN = 60

/** Die längste erlaubte Gültigkeit: dreißig Tage. */
export const EINLADUNG_MAX_SEKUNDEN = 30 * 24 * 60 * 60

/**
 * Wie viele **offene** Einladungen ein Admin gleichzeitig haben darf.
 *
 * **Warum eine Grenze.** Jede offene Einladung ist ein Schlüssel, der irgendwo
 * in einem Chatverlauf liegt. Fünfundzwanzig sind großzügig für „ich lade ein
 * paar Leute ein" und klein genug, daß niemand versehentlich einen Vorrat
 * anlegt. Die Grenze schützt nicht gegen einen Angreifer (der Admin ist
 * bereits Administrator) — sie schützt vor dem **Vergessen**.
 */
export const OFFENE_EINLADUNGEN_MAX = 25

/** Wie viele Einladungen die Liste zeigt. */
export const EINLADUNGEN_LISTE_MAX = 50

// ---------------------------------------------------------------------------
// Token und Hash
// ---------------------------------------------------------------------------

/**
 * Erzeugt ein Einladungs-Token: 32 Zufallsbytes als base64url.
 *
 * **Warum base64url und nicht hex.** Dasselbe Token in hex wäre 64 Zeichen
 * lang; in einer Adresse (`?token=…`) zählt jedes Zeichen, das man abtippen
 * oder aus einem Chat kopieren muß. base64url ist ohne Prozent-Kodierung
 * addressierbar — `+`, `/` und `=` kommen darin nicht vor.
 *
 * @returns der Klartext des Tokens
 */
export function erzeugeEinladungToken(): string {
  return randomBytes(32).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * Bildet den SHA-256-Hash eines Tokens — **das Einzige, was gespeichert wird**.
 *
 * @param token - der Klartext
 * @returns 64 hexadezimale Zeichen
 */
export function einladungHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Vergleicht zwei Hex-Werte in **konstanter Zeit**.
 *
 * **Warum nicht `===`.** Ein Vergleich, der beim ersten unterschiedlichen
 * Zeichen abbricht, verrät über die Laufzeit, wie viele führende Zeichen
 * stimmten. Bei 64 Hex-Zeichen ist das praktisch kein Angriff — aber die
 * teurere Variante kostet hier nichts, und eine Ausnahme von der Regel müßte
 * begründet werden.
 *
 * @param a - der erste Wert
 * @param b - der zweite Wert
 * @returns ob sie gleich sind
 */
export function gleicherHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

// ---------------------------------------------------------------------------
// Das Urteil
// ---------------------------------------------------------------------------

/** Warum eine Einladung abgewiesen wurde. */
export type EinladungRegel = 'gueltig' | 'unbekannt' | 'abgelaufen' | 'eingeloest' | 'zurueckgezogen'

/** Ein Urteil über eine Einladung. */
export type EinladungUrteil =
  | { readonly gueltig: true }
  | { readonly gueltig: false; readonly regel: EinladungRegel; readonly grund: string }

/**
 * Prüft eine Einladung.
 *
 * **Die Reihenfolge der Abweisungen ist Absicht.** „Zurückgezogen" vor
 * „eingelöst" vor „abgelaufen": wer den Link zurückgezogen hat, soll das als
 * Grund hören — nicht „abgelaufen", was nach Zufall klingt. Und „eingelöst"
 * vor „abgelaufen": eine Einladung, die gestern eingelöst wurde und heute
 * abgelaufen wäre, ist **benutzt**, nicht **verfallen**.
 *
 * **Warum die Abweisungen unterscheidbar sind.** Anders als bei einer Anmeldung
 * (dort wäre eine unterscheidbare Meldung eine Auskunft über fremde Konten) gibt
 * es hier genau **einen** Berechtigten: den, der den Link bekommen hat. Ihm zu
 * sagen, *warum* es nicht geht, ist die einzige Auskunft, die ihm hilft.
 *
 * @param eintrag - der gefundene Datensatz, oder `undefined`
 * @param jetzt - die Prüfzeit
 * @returns das Urteil
 */
export function pruefeEinladung(eintrag: EinladungRecord | undefined, jetzt: Date): EinladungUrteil {
  if (eintrag === undefined) {
    return {
      gueltig: false,
      regel: 'unbekannt',
      grund: 'Dieser Einladungslink ist unbekannt. Bitte laß dir einen neuen schicken.',
    }
  }
  if (eintrag.revokedAt !== undefined) {
    return {
      gueltig: false,
      regel: 'zurueckgezogen',
      grund: 'Diese Einladung wurde zurückgezogen.',
    }
  }
  if (eintrag.consumedAt !== undefined) {
    return {
      gueltig: false,
      regel: 'eingeloest',
      grund: `Diese Einladung wurde bereits eingelöst (${eintrag.consumedAt}). Bitte laß dir einen neuen Link schicken.`,
    }
  }
  const ablauf = new Date(eintrag.expiresAt)
  if (Number.isNaN(ablauf.getTime())) {
    // **Kein stilles „gültig".** Ein unlesbarer Ablauf ist ein Fehler in der
    // Ablage, und die sichere Richtung ist: nicht einlösen.
    return {
      gueltig: false,
      regel: 'unbekannt',
      grund: 'Der Ablauf dieser Einladung ist unlesbar. Bitte laß dir einen neuen Link schicken.',
    }
  }
  if (!(jetzt < ablauf)) {
    return {
      gueltig: false,
      regel: 'abgelaufen',
      grund: `Diese Einladung lief am ${ablauf.toISOString()} ab. Bitte laß dir einen neuen Link schicken.`,
    }
  }
  return { gueltig: true }
}

// ---------------------------------------------------------------------------
// Die Dauer, die ein Admin wählt
// ---------------------------------------------------------------------------

/**
 * Prüft und begrenzt die gewünschte Gültigkeit.
 *
 * **Warum `undefined` und nicht ein geklemmter Wert.** Ein Aufrufer, der
 * `999999` schickt, hat sich vertan. Still auf 30 Tage zu klemmen sähe wie
 * Erfolg aus — und der Admin wüßte nie, daß seine Angabe nicht genommen wurde.
 * Ein Fehler ist hier die ehrlichere Antwort.
 *
 * @param roh - die Angabe aus dem Körper (Zahl in Sekunden)
 * @returns die Dauer oder `undefined`, wenn sie unbrauchbar ist
 */
export function waehleDauer(roh: unknown): number | undefined {
  if (typeof roh !== 'number' || !Number.isInteger(roh)) return undefined
  if (roh < EINLADUNG_MIN_SEKUNDEN || roh > EINLADUNG_MAX_SEKUNDEN) return undefined
  return roh
}
