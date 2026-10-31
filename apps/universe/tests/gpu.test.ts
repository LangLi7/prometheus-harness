/**
 * **Die Gerätestufe — reine Rechnung, ohne Browser.**
 *
 * Der Betreiber hat iGPU- und CPU-Betrieb verlangt. Ob eine Maschine das eine oder das andere ist,
 * entscheidet sich an **Zeichenketten** (dem Namen des Zeichners) und an einer **Zahl** (der Bildzeit).
 * Beides läßt sich hier prüfen — ohne Grafikkarte, ohne Browser, ohne Warten.
 */
import { expect, test } from 'bun:test'
import {
  BUDGET_MS,
  STERN_ANTEIL,
  STUFEN,
  energieVorliebe,
  mitAdditiv,
  mitKantenglaettung,
  naechsteStufe,
  stufeAusBildzeiten,
  stufeAusKennung,
} from '../src/gpu'

test('ein Softwarezeichner ist eine CPU — auch wenn ein Kartenname davorsteht', () => {
  /*
   * **Der Fall, der diese Reihenfolge erzwingt.** Chromium meldet unter Windows und Linux gern
   * `ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 …, SwiftShader Device (Subzero))` — ein
   * **Softwarezeichner hinter einem Kartennamen**. Wer zuerst auf „Intel" prüft, hält ihn für eine
   * integrierte Karte und legt 45 % der Sterne auf einen Rechner, der in Software rastert.
   */
  expect(stufeAusKennung('ANGLE (Intel, Intel(R) UHD Graphics 630, SwiftShader Device (Subzero))')).toBe('cpu')
  expect(stufeAusKennung('Google SwiftShader')).toBe('cpu')
  expect(stufeAusKennung('Mesa/X.org, llvmpipe (LLVM 15.0.6, 256 bits)')).toBe('cpu')
  expect(stufeAusKennung('irgendwas', true)).toBe('cpu')
})

test('integrierte Karten werden als solche erkannt', () => {
  expect(stufeAusKennung('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5)')).toBe('igpu')
  expect(stufeAusKennung('ANGLE (AMD, AMD Radeon Graphics (0x00001638), Vulkan)')).toBe('igpu')
  expect(stufeAusKennung('Apple M2')).toBe('igpu')
  expect(stufeAusKennung('Mali-G78 MP14')).toBe('igpu')
})

test('eigene Karten bekommen die volle Stufe', () => {
  expect(stufeAusKennung('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11, 1.0)')).toBe('gpu')
  expect(stufeAusKennung('AMD Radeon RX 7900 XTX')).toBe('gpu')
})

test('ein unbekannter Name fällt auf die vorsichtige Stufe — nicht auf die beste', () => {
  /*
   * **Warum das die richtige Richtung ist.** Eine zu niedrige Stufe kostet ein paar Sterne; eine zu
   * hohe kostet **Bilder**. Wer den Namen nicht kennt, hat keine Auskunft — und dann ist die
   * vorsichtige Annahme die einzige, die niemandem schadet.
   */
  expect(stufeAusKennung('')).toBe('igpu')
  expect(stufeAusKennung('Etwas ganz Neues von 2031')).toBe('gpu')
})

test('die Sterne werden je Stufe weniger — und keine Stufe hat null Punkte außer „kein WebGL"', () => {
  expect(STERN_ANTEIL.gpu).toBe(1)
  expect(STERN_ANTEIL.igpu).toBeLessThan(STERN_ANTEIL.gpu)
  expect(STERN_ANTEIL.cpu).toBeLessThan(STERN_ANTEIL.igpu)
  expect(STERN_ANTEIL.cpu).toBeGreaterThan(0)
  for (const stufe of STUFEN) {
    expect(STERN_ANTEIL[stufe]).toBeGreaterThanOrEqual(0)
    expect(STERN_ANTEIL[stufe]).toBeLessThanOrEqual(1)
  }
})

test('Kantenglättung, additives Licht und die Bitte um die schnelle Karte folgen der Stufe', () => {
  expect(mitKantenglaettung('gpu')).toBe(true)
  expect(mitKantenglaettung('igpu')).toBe(false)
  expect(mitKantenglaettung('cpu')).toBe(false)
  expect(mitAdditiv('cpu')).toBe(false)
  expect(energieVorliebe('gpu')).toBe('high-performance')
  expect(energieVorliebe('cpu')).toBe('low-power')
  // **Die Bitte um die schnelle Karte muß für eine CPU verschwinden** — sonst fordert die Seite eine
  // Karte, die es nicht gibt, und auf manchen Rechnern scheitert die Kontexterzeugung daran.
  expect(energieVorliebe('cpu')).not.toBe('high-performance')
})

test('die Stufe fällt, wenn die Bilder zu langsam sind — und bleibt sonst', () => {
  const schnell = Array.from({ length: 60 }, () => 8)
  const langsam = Array.from({ length: 60 }, () => BUDGET_MS + 12)
  expect(stufeAusBildzeiten(schnell, 'gpu')).toBe('gpu')
  expect(stufeAusBildzeiten(langsam, 'gpu')).toBe('igpu')
  expect(stufeAusBildzeiten(langsam, 'igpu')).toBe('cpu')
  // **Die unterste Stufe bleibt stehen** — es gibt nichts Tieferes als „kein WebGL", und das ist kein
  // Leistungszustand, sondern eine Tatsache.
  expect(stufeAusBildzeiten(langsam, 'cpu')).toBe('cpu')
  expect(naechsteStufe('kein-webgl')).toBe('kein-webgl')
})

test('die ersten Bilder zählen nicht — sie tragen den Aufbau', () => {
  /*
   * **Der Fehler, den diese Prüfung verhindert.** Der Aufbau kostet (Katalog erzeugen, Punkte
   * hochladen, Panels bauen). Zählten die ersten Bilder mit, fiele die Stufe auf **jedem** Rechner —
   * und die Welt zeigte überall die sparsame Fassung, auch auf einer guten Karte.
   */
  const aufbau = Array.from({ length: 12 }, () => 200)
  const betrieb = Array.from({ length: 50 }, () => 6)
  expect(stufeAusBildzeiten([...aufbau, ...betrieb], 'gpu')).toBe('gpu')
  // Und ohne Meßwerte wird nichts geändert.
  expect(stufeAusBildzeiten([], 'gpu')).toBe('gpu')
})
