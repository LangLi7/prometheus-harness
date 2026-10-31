/**
 * Prüfung der Weiterleitung nach der Anmeldung (`src/redirect.ts`).
 *
 * ## Warum diese Datei wichtig ist
 *
 * `?weiter=…` kommt **aus der Adresse** — also von dem, der den Link geschickt hat. Wird das
 * Ziel ungeprüft übernommen, entsteht ein **offener Weiterleiter**: ein Link auf die echte
 * Anmeldeseite, der nach erfolgreicher Anmeldung auf eine **fremde** Seite schickt — genau in
 * dem Moment, in dem jemand sein Kennwort eingegeben hat. Die Prüfung ist deshalb **streng**,
 * und jeder abgelehnte Fall steht hier als eigener Test.
 *
 * ```powershell
 * bun test apps/login_web/tests/redirect.test.ts
 * ```
 *
 * @module @prometheus-harness/login-web/tests/weiter
 */

import { describe, expect, test } from 'bun:test'
import { einladungsToken, ermittleZiel, istRelativ, TOKEN_PARAMETER, VORGABE_ZIEL, ZIEL_PARAMETER } from '../src/redirect.ts'

describe('Ziel nach der Anmeldung', () => {
  test('ohne Angabe gilt die Vorgabe', () => {
    expect(ermittleZiel('')).toBe(VORGABE_ZIEL)
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=`)).toBe(VORGABE_ZIEL)
  })

  test('ein relativer Pfad wird übernommen', () => {
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=/harness`)).toBe('/harness')
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=/a/b?c=d`)).toBe('/a/b?c=d')
  })

  test('eine fremde Herkunft wird ABGELEHNT', () => {
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=https://boese.example`)).toBe(VORGABE_ZIEL)
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=http://127.0.0.1:9999/`)).toBe(VORGABE_ZIEL)
  })

  test('protokollrelativ `//host` wird ABGELEHNT — es sieht relativ aus', () => {
    expect(istRelativ('//boese.example')).toBe(false)
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=//boese.example`)).toBe(VORGABE_ZIEL)
  })

  test('die Umgehung mit Rückstrich wird ABGELEHNT', () => {
    expect(istRelativ('/\\boese.example')).toBe(false)
    expect(istRelativ('/a\\b')).toBe(false)
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=/%5Cboese`)).toBe(VORGABE_ZIEL)
  })

  test('ohne führenden Schrägstrich wird ABGELEHNT', () => {
    expect(ermittleZiel(`?${ZIEL_PARAMETER}=harness`)).toBe(VORGABE_ZIEL)
  })

  test('Steuerzeichen werden ABGELEHNT (Kopfzeilen-Spaltung, Umbrüche)', () => {
    expect(istRelativ('/a\nb')).toBe(false)
    expect(istRelativ('/a\u0000b')).toBe(false)
  })

  test('GEGENPROBE: die Prüfung läßt nicht alles durch und nicht alles fallen', () => {
    // Ein Wächter, der immer `false` sagt, wäre so falsch wie einer, der immer `true` sagt.
    expect(istRelativ('/ok')).toBe(true)
    expect(istRelativ('//nicht-ok')).toBe(false)
  })
})

/**
 * Das Einladungs-Token aus der Adresse.
 *
 * **Warum hier streng gelesen wird.** Ein Token, das nicht wie ein Token
 * aussieht, ist ein alter Link oder ein Tippfehler — beides soll die Seite als
 * „kein Link" behandeln und nicht als Einladung zeigen. Der Server prüft
 * ohnehin; diese Prüfung verhindert nur, daß Unsinn wie eine Einladung aussieht.
 */
describe('Einladungs-Token aus der Adresse', () => {
  const TOKEN = 'g30zj5d2BSDdmHZa-ZwAWR_riKQGbAa9BK078r_lysA'

  test('ein Token im base64url-Alphabet wird gelesen', () => {
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${TOKEN}`)).toBe(TOKEN)
    // Auch mit weiteren Parametern davor und danach.
    expect(einladungsToken(`?weiter=/start&${TOKEN_PARAMETER}=${TOKEN}`)).toBe(TOKEN)
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${TOKEN}&weiter=/start`)).toBe(TOKEN)
  })

  test('ohne Token: nichts', () => {
    expect(einladungsToken('')).toBeUndefined()
    expect(einladungsToken('?weiter=/start')).toBeUndefined()
    expect(einladungsToken(`?${TOKEN_PARAMETER}=`)).toBeUndefined()
  })

  test('zu kurz oder mit fremden Zeichen wird ABGELEHNT', () => {
    expect(einladungsToken(`?${TOKEN_PARAMETER}=kurz`)).toBeUndefined()
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${'a'.repeat(31)}`)).toBeUndefined()
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${'a'.repeat(129)}`)).toBeUndefined()
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${TOKEN}%3Cscript%3E`)).toBeUndefined()
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${'a'.repeat(20)}%20${'b'.repeat(20)}`)).toBeUndefined()
  })

  test('Leerzeichen außen werden abgeschnitten — innen nicht', () => {
    expect(einladungsToken(`?${TOKEN_PARAMETER}=%20${TOKEN}%20`)).toBe(TOKEN)
    expect(einladungsToken(`?${TOKEN_PARAMETER}=${'a'.repeat(20)}%20${'b'.repeat(20)}`)).toBeUndefined()
  })
})
