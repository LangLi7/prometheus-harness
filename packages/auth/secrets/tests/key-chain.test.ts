/**
 * Die **Leiter** der Hauptschlüssel-Quellen — Stufe 1 bis 3.
 *
 * ## Was hier bewiesen wird
 *
 * Daß die Reihenfolge **stimmt** und **wirkt**: Datei im Home vor Docker-Secret
 * vor Umgebungsvariable. Und daß ein **kaputter** Wert die nächste Stufe
 * **nicht** durchläßt — die Regel, die am leichtesten zu übersehen ist und am
 * meisten kostet: eine kaputte Schlüsseldatei, die still von der
 * Umgebungsvariablen verdeckt wird, läßt den Betreiber glauben, seine Datei
 * werde benutzt.
 *
 * ## Warum die Docker-Stufe hier nicht „durchläuft"
 *
 * Auf dieser Maschine gibt es kein `/run/secrets` — die Stufe ist deshalb
 * **inert** und wird es in dieser Prüfung auch bleiben. Das ist kein Mangel der
 * Prüfung: die Stufe wird mit einem **eigenen Pfad** geprüft, so wie
 * `dockerSecretQuelle(pfad)` sie anbietet. Und die Prüfung sagt ausdrücklich,
 * was sie über den **Vorgabepfad** feststellt: daß er hier nicht existiert.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DOCKER_SECRET_PFAD,
  HAUPTSSCHLUESSELDATEI,
  dockerSecretQuelle,
  erzeugeHauptschluesselText,
  holeHauptschluessel,
  standardQuellen,
} from '../src/index.ts'

/** Ein Wegwerf-Home mit einem frischen Hauptschlüssel darin. */
function homeMitSchluessel(): { home: string; text: string } {
  const home = mkdtempSync(join(tmpdir(), 'pmh-kette-'))
  const text = erzeugeHauptschluesselText()
  writeFileSync(join(home, HAUPTSSCHLUESSELDATEI), text, { encoding: 'utf8', mode: 0o600 })
  return { home, text }
}

/** Sammelt Hinweise ein, statt sie auf stderr zu schreiben. */
function sammler(): { texte: string[]; schreibe: (t: string) => void } {
  const texte: string[] = []
  return { texte, schreibe: (t) => texte.push(t) }
}

describe('Die Leiter der Hauptschlüssel-Quellen', () => {
  test('die Reihenfolge ist Datei → Docker-Secret → Umgebung', () => {
    // **Die Reihenfolge ist eine Sicherheitsaussage.** Die schwächste Stufe
    // (Umgebung) steht zuletzt; die stärkste (Datei im Home, 0600) zuerst.
    const quellen = standardQuellen({ PMH_MASTER_KEY: 'egal' }, 'C:/tmp/home')
    expect(quellen.map((q) => q.art)).toEqual(['datei', 'docker-secret', 'umgebung'])
    expect(quellen[0]?.name).toContain(HAUPTSSCHLUESSELDATEI)
    expect(quellen[1]?.name).toContain(DOCKER_SECRET_PFAD)
    expect(quellen[2]?.name).toContain('PMH_MASTER_KEY')
  })

  test('die DATEI gewinnt gegen die Umgebungsvariable', () => {
    const { home, text } = homeMitSchluessel()
    try {
      const anders = erzeugeHauptschluesselText()
      expect(anders).not.toBe(text)
      const haupt = holeHauptschluessel(
        standardQuellen({ PMH_MASTER_KEY: anders }, home, join(home, 'kein-secret')),
        1,
      )
      expect(haupt.herkunft).toContain('Datei')
      // **Und es ist wirklich der Schlüssel AUS DER DATEI**, nicht der bequemere
      // aus der Umgebung. Das ist der Kern der Reihenfolge.
      expect(Buffer.from(haupt.schluessel).toString('base64url')).toBe(text)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('das DOCKER-SECRET gewinnt gegen die Umgebungsvariable', () => {
    const home = mkdtempSync(join(tmpdir(), 'pmh-kette-'))
    const secretPfad = join(home, 'secret')
    const text = erzeugeHauptschluesselText()
    writeFileSync(secretPfad, text, 'utf8')
    try {
      const anders = erzeugeHauptschluesselText()
      // Keine Datei im Home — also greift die zweite Stufe.
      const haupt = holeHauptschluessel(standardQuellen({ PMH_MASTER_KEY: anders }, home, secretPfad), 1)
      expect(haupt.herkunft).toContain('Docker-Secret')
      expect(Buffer.from(haupt.schluessel).toString('base64url')).toBe(text)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('ohne Datei und ohne Secret greift die Umgebungsvariable — wie bisher', () => {
    // **Die Gegenprobe zur Neuerung.** Eine zusätzliche Stufe darf die bestehende
    // nicht verdrängen: wer heute `PMH_MASTER_KEY` setzt, muß weiter durchkommen.
    const home = mkdtempSync(join(tmpdir(), 'pmh-kette-'))
    try {
      const text = erzeugeHauptschluesselText()
      const haupt = holeHauptschluessel(
        standardQuellen({ PMH_MASTER_KEY: text }, home, join(home, 'kein-secret')),
        1,
      )
      expect(haupt.herkunft).toContain('Umgebungsvariable')
      expect(Buffer.from(haupt.schluessel).toString('base64url')).toBe(text)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('ein KAPUTTES Secret fällt NICHT durch zur Umgebungsvariable', () => {
    // **Die Regel, die am meisten kostet.** Fiele sie durch, verdeckte ein
    // Tippfehler im Secret still die Umgebungsvariable — und der Betreiber
    // glaubte, das Secret werde benutzt.
    const home = mkdtempSync(join(tmpdir(), 'pmh-kette-'))
    const secretPfad = join(home, 'secret')
    writeFileSync(secretPfad, 'das-ist-kein-schluessel', 'utf8')
    try {
      const text = erzeugeHauptschluesselText()
      expect(() =>
        holeHauptschluessel(standardQuellen({ PMH_MASTER_KEY: text }, home, secretPfad), 1),
      ).toThrow()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('die Docker-Quelle nennt ihre Art — sie ist nicht als Datei getarnt', () => {
    // Der Unterschied ist nicht kosmetisch: `art` steht in Meldungen und
    // entscheidet, ob die Rechteprüfung greift. Wäre sie `'datei'`, würde sie auf
    // POSIX an Dockers `0444` scheitern.
    expect(dockerSecretQuelle().art).toBe('docker-secret')
    expect(dockerSecretQuelle().art).not.toBe('datei')
  })

  test('der Vorgabepfad /run/secrets/… existiert auf dieser Maschine nicht', () => {
    // **Ausdrücklich festgehalten**, damit niemand glaubt, diese Stufe sei hier
    // schon erprobt. Sie ist inert — und das ist auf Windows der Normalfall.
    expect(DOCKER_SECRET_PFAD).toBe('/run/secrets/pmh_master_key')
    if (process.platform === 'win32') {
      expect(existsSync(DOCKER_SECRET_PFAD)).toBe(false)
      expect(dockerSecretQuelle().versuche()).toBeUndefined()
    }
  })

  test('der Hinweis zum Modus kommt EINMAL, nicht bei jedem Zugriff', () => {
    const home = mkdtempSync(join(tmpdir(), 'pmh-kette-'))
    const secretPfad = join(home, 'secret')
    writeFileSync(secretPfad, erzeugeHauptschluesselText(), 'utf8')
    try {
      const s = sammler()
      const quelle = dockerSecretQuelle(secretPfad, s.schreibe)
      expect(quelle.versuche()).toBeDefined()
      expect(quelle.versuche()).toBeDefined()
      expect(quelle.versuche()).toBeDefined()
      // Genau **eine** Meldung — sonst würde jeder Start und jeder Zugriff sie
      // wiederholen, und eine Meldung, die immer kommt, wird nicht gelesen.
      expect(s.texte).toHaveLength(1)
      expect(s.texte[0]).toContain('NICHT geprüft')
      expect(s.texte[0]).toContain('0444')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
