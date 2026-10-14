/**
 * Prüfung des Hauptschlüssel-Skripts `scripts/schluessel.mjs`.
 *
 * ## Warum diese Datei existiert
 *
 * Am 14.10.2026 gemessen: der wirksame Hauptschlüssel kam aus `PMH_MASTER_KEY` in
 * `.env`, weil die **Datei fehlte**. Die Sicherung des Skripts prüfte aber nur
 * `existsSync(pfad)` — **die Datei**. In diesem Zustand lief der Aufruf **ohne
 * Warnung** durch und legte einen **neuen** Schlüssel an. Jeder `wrapped_key`, der
 * mit dem Umgebungsschlüssel verschlüsselt wurde, wäre **unlesbar** geworden.
 *
 * Die wichtigste Prüfung hier ist deshalb die **Gegenprobe**: der Aufruf muß in
 * genau diesem Zustand **rot** werden — und zwar **bevor** etwas geschrieben ist.
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DOCKER_SECRET_PFAD,
  HAUPTSSCHLUESSELDATEI,
  erzeugeHauptschluesselText,
  holeHauptschluessel,
  standardQuellen,
} from '../packages/auth/secrets/src/index.ts'
import { erzeuge } from './schluessel.mjs'

/** Ein frisches Home; wird nach dem Test wieder entfernt. */
function mitHome(arbeit) {
  const home = mkdtempSync(join(tmpdir(), 'pmh-schluessel-'))
  try {
    return arbeit(home)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

/** Sammelt die Ausgabe, statt sie zu drucken. */
function sammler() {
  const zeilen = []
  return { schreibe: (t) => zeilen.push(t), text: () => zeilen.join('') }
}

/** Der Schlüssel, den eine Kette im Zustand (umgebung, home) liefert. */
function wirksamerText(umgebung, home) {
  const geholt = holeHauptschluessel(standardQuellen(umgebung, home, DOCKER_SECRET_PFAD), 1)
  return Buffer.from(geholt.schluessel).toString('base64url')
}

describe('Ohne Datei, aber mit wirksamem Umgebungsschlüssel: ABBRUCH', () => {
  it('schreibt NICHTS und gibt 1 zurück — die Gegenprobe', () => {
    mitHome((home) => {
      // Der gemessene Zustand: Datei fehlt, `PMH_MASTER_KEY` gesetzt.
      const umgebung = { PMH_MASTER_KEY: erzeugeHauptschluesselText() }
      const pfad = join(home, HAUPTSSCHLUESSELDATEI)
      const s = sammler()

      const code = erzeuge({ home, umgebung, schreibe: s.schreibe })

      expect(code).toBe(1)
      // **Das Wichtigste: es wurde nichts angelegt.** Ein Abbruch, der die Datei
      // trotzdem schreibt, wäre kein Abbruch.
      expect(existsSync(pfad)).toBe(false)
    })
  })

  it('nennt die wirksame Quelle und den verlustfreien Weg', () => {
    mitHome((home) => {
      const umgebung = { PMH_MASTER_KEY: erzeugeHauptschluesselText() }
      const s = sammler()
      erzeuge({ home, umgebung, schreibe: s.schreibe })
      const text = s.text()
      expect(text).toContain('umgebung')
      expect(text).toContain('--uebernehmen')
      expect(text).toContain('unlesbar')
    })
  })

  it('bricht AUCH ab, wenn die Umgebungsvariable gesetzt ist — nicht nur bei Datei', () => {
    // Dieselbe Prüfung, andere Formulierung: der alte Schutz hätte hier **durchgelassen**.
    mitHome((home) => {
      const umgebung = { PMH_MASTER_KEY: erzeugeHauptschluesselText() }
      const s = sammler()
      expect(erzeuge({ home, umgebung, schreibe: s.schreibe })).toBe(1)
      expect(existsSync(join(home, HAUPTSSCHLUESSELDATEI))).toBe(false)
    })
  })
})

describe('--uebernehmen schreibt DENSELBEN Schlüssel in die Datei', () => {
  it('ist verlustfrei: der wirksame Schlüssel ändert sich nicht', () => {
    mitHome((home) => {
      const umgebung = { PMH_MASTER_KEY: erzeugeHauptschluesselText() }
      const vorher = wirksamerText(umgebung, home)
      const s = sammler()

      const code = erzeuge({ home, umgebung, uebernehmen: true, schreibe: s.schreibe })

      expect(code).toBe(0)
      const pfad = join(home, HAUPTSSCHLUESSELDATEI)
      expect(existsSync(pfad)).toBe(true)
      // **Der Kern des Beweises.** Wäre ein NEUER Schlüssel entstanden, wären alle
      // bestehenden Umschläge unlesbar.
      const nachher = wirksamerText(umgebung, home)
      expect(nachher).toBe(vorher)
      // Und er liegt wirklich in der Datei — nicht mehr nur in der Umgebung.
      expect(readFileSync(pfad, 'utf8').trim()).toBe(vorher)
    })
  })

  it('sagt an, daß es derselbe Schlüssel ist', () => {
    mitHome((home) => {
      const umgebung = { PMH_MASTER_KEY: erzeugeHauptschluesselText() }
      const s = sammler()
      erzeuge({ home, umgebung, uebernehmen: true, schreibe: s.schreibe })
      expect(s.text()).toContain('ÜBERNOMMEN')
      expect(s.text()).toContain('bleiben lesbar')
    })
  })

  it('gibt den Schlüssel NICHT aus — weder ganz noch gekürzt', () => {
    mitHome((home) => {
      const echter = erzeugeHauptschluesselText()
      const umgebung = { PMH_MASTER_KEY: echter }
      const s = sammler()
      erzeuge({ home, umgebung, uebernehmen: true, schreibe: s.schreibe })
      expect(s.text()).not.toContain(echter)
      expect(s.text()).not.toContain(echter.slice(0, 8))
    })
  })

  it('bricht ab, wenn es NICHTS zu übernehmen gibt', () => {
    mitHome((home) => {
      const s = sammler()
      expect(erzeuge({ home, umgebung: {}, uebernehmen: true, schreibe: s.schreibe })).toBe(1)
      expect(existsSync(join(home, HAUPTSSCHLUESSELDATEI))).toBe(false)
      expect(s.text()).toContain('KEINEN wirksamen Hauptschlüssel')
    })
  })
})

describe('--neu bleibt ausdrücklich möglich', () => {
  it('erzeugt einen ANDEREN Schlüssel — und das ist gewollt, wenn es dasteht', () => {
    mitHome((home) => {
      const umgebung = { PMH_MASTER_KEY: erzeugeHauptschluesselText() }
      const vorher = wirksamerText(umgebung, home)
      const s = sammler()

      expect(erzeuge({ home, umgebung, neu: true, schreibe: s.schreibe })).toBe(0)

      const nachher = wirksamerText(umgebung, home)
      // Der Unterschied ist der Preis und heißt: Bestand ist ab jetzt unlesbar.
      expect(nachher).not.toBe(vorher)
    })
  })

  it('schweigt weiterhin, wenn schon eine DATEI liegt und kein Schalter gesetzt ist', () => {
    mitHome((home) => {
      const pfad = join(home, HAUPTSSCHLUESSELDATEI)
      writeFileSync(pfad, `${erzeugeHauptschluesselText()}\n`, 'utf8')
      const alt = readFileSync(pfad, 'utf8')
      const s = sammler()
      expect(erzeuge({ home, umgebung: {}, schreibe: s.schreibe })).toBe(1)
      expect(readFileSync(pfad, 'utf8')).toBe(alt)
    })
  })
})
