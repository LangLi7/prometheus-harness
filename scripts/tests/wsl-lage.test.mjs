/**
 * Prüfungen für `wslLage()` — die WSL2-Erkennung des Installers.
 *
 * **Der wichtigste Fall steht zuerst.** `wsl.exe` schreibt UTF-16; gemessen am
 * 14.10.2026 kommt `WSL-Version: 2.6.3.0` als
 * `W\0S\0L\0-\0V\0e\0r\0s\0i\0o\0n\0:\0 \02\0.\06\0.\03\0.\00\0` heraus. Ein
 * gewöhnliches Muster findet darin **nichts** — eine Prüfung ohne diesen Schritt
 * meldet „WSL2 fehlt" auf einem Rechner, auf dem es läuft.
 *
 * Diese Datei hält **beide** Seiten fest: daß ein naives Muster scheitert, und
 * daß `wslLage()` trotzdem liest.
 */

import { describe, expect, test } from 'bun:test'

import { wslLage } from '../install-teile.mjs'

/** Macht aus Text die UTF-16-Form, die `wsl.exe` wirklich liefert. */
function alsUtf16(text) {
  return [...text].map((zeichen) => `${zeichen}\u0000`).join('')
}

const VERSION_ECHT = alsUtf16(
  'WSL-Version: 2.6.3.0\r\nKernelversion: 6.6.87.2-1\r\nStandarddistribution: Ubuntu\r\nStandardversion: 2\r\n',
)
const LISTE_ECHT = alsUtf16('  NAME      STATE           VERSION\r\n* Ubuntu    Running         2\r\n')

describe('Die UTF-16-Falle ist festgehalten', () => {
  test('ein naives Muster findet in der Rohausgabe NICHTS', () => {
    // Das ist die Falle selbst — nicht die Prüfung des Lesers, sondern der Beweis,
    // warum der Leser so gebaut ist, wie er ist.
    expect(/WSL-Version/u.test(VERSION_ECHT)).toBe(false)
    expect(VERSION_ECHT.includes('\u0000')).toBe(true)
  })

  test('wslLage liest dieselbe Ausgabe trotzdem', () => {
    const lage = wslLage(VERSION_ECHT, LISTE_ECHT)
    expect(lage.vorhanden).toBe(true)
    expect(lage.wslFassung).toBe('2.6.3.0')
    expect(lage.distribution).toBe('Ubuntu')
    expect(lage.standard).toBe(2)
    expect(lage.bereit).toBe(true)
    expect(lage.laufend).toBe(true)
  })
})

describe('Wann WSL2 als eingerichtet gilt', () => {
  test('WSL1 ist NICHT bereit', () => {
    const lage = wslLage(alsUtf16('WSL-Version: 1.0.0\r\nStandarddistribution: Ubuntu\r\nStandardversion: 1\r\n'))
    expect(lage.vorhanden).toBe(true)
    expect(lage.bereit).toBe(false)
  })

  test('WSL ohne Distribution ist NICHT eingerichtet', () => {
    const lage = wslLage(alsUtf16('WSL-Version: 2.6.3.0\r\nStandardversion: 2\r\n'))
    expect(lage.vorhanden).toBe(true)
    expect(lage.bereit).toBe(false)
  })

  test('gar kein WSL: nichts vorhanden, nichts bereit', () => {
    const lage = wslLage('', '')
    expect(lage.vorhanden).toBe(false)
    expect(lage.bereit).toBe(false)
    expect(lage.wslFassung).toBeUndefined()
  })

  test('die Distribution ist auch dann lesbar, wenn keine laeuft', () => {
    const lage = wslLage(
      alsUtf16('WSL-Version: 2.6.3.0\r\nStandarddistribution: Ubuntu\r\nStandardversion: 2\r\n'),
      alsUtf16('  NAME      STATE           VERSION\r\n* Ubuntu    Stopped         2\r\n'),
    )
    expect(lage.bereit).toBe(true)
    expect(lage.laufend).toBe(false)
  })
})
