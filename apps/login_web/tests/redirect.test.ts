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
import { ermittleZiel, istRelativ, VORGABE_ZIEL, ZIEL_PARAMETER } from '../src/redirect.ts'

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
