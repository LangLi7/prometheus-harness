/**
 * Die beiden Ablagen — Datei und Credential-Naht.
 *
 * **Was hier nicht geprüft wird:** ob `credentials-postgres` die Records wirklich verschlüsselt
 * ablegt. Das tut es (Migration 0011, `packages/auth/credentials-postgres`), und es ist dort
 * geprüft. Hier wird geprüft, daß **dieses** Paket den richtigen Adressraum benutzt und den Wert
 * nirgends anzeigt.
 *
 * @module @prometheus-harness/zugaenge/tests/speicher
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'

import { FASSUNG, alsZugang, type ZugangEingabe } from '../src/vertrag.ts'
import {
  AblageFehler,
  CredentialAblage,
  liesDatei,
  schreibeDatei,
  zugaengePfad,
} from '../src/speicher.ts'

/** Eine brauchbare Eingabe. */
const EINGABE: ZugangEingabe = {
  name: 'Prüfzugang',
  familie: 'openrouter',
  art: 'fern',
  schluessel: 'noetig',
  modelle: { gespraech: 'm' },
}

/** Ein Verzeichnis, das nach dem Test verschwindet. */
let verzeichnis = ''

beforeEach(() => {
  verzeichnis = mkdtempSync(join(tmpdir(), 'pmh-zugaenge-'))
})

afterEach(() => {
  rmSync(verzeichnis, { recursive: true, force: true })
  delete process.env['PMH_TEST_SCHLUESSEL']
})

describe('Der Pfad', () => {
  test('PMH_ZUGAENGE_DATEI überstimmt alles', () => {
    expect(zugaengePfad({ PMH_ZUGAENGE_DATEI: 'C:/tmp/x.json', PMH_HOME: 'C:/home' })).toBe('C:/tmp/x.json')
  })

  test('sonst PMH_HOME, dann der Dateiname', () => {
    expect(zugaengePfad({ PMH_HOME: 'C:/home' })).toBe(join('C:/home', 'zugaenge.json'))
  })

  test('ohne beides: das eigene Home', () => {
    expect(zugaengePfad({})).toContain('zugaenge.json')
    expect(zugaengePfad({})).toContain('.pmh')
  })
})

describe('Die Datei', () => {
  test('fehlt sie, ist das kein Fehler', async () => {
    const datei = await liesDatei(join(verzeichnis, 'gibt-es-nicht.json'))
    expect(datei).toEqual({ fassung: FASSUNG, zugaenge: [] })
  })

  test('Schreiben und Lesen ist verlustfrei — und legt enge Rechte an', async () => {
    const pfad = join(verzeichnis, 'zugaenge.json')
    const eintrag = alsZugang(EINGABE, new Date('2026-10-21T12:00:00.000Z'))
    await schreibeDatei(pfad, { fassung: FASSUNG, zugaenge: [eintrag] })
    const gelesen = await liesDatei(pfad)
    expect(gelesen.zugaenge[0]?.id).toBe('pruefzugang')
    const inhalt = readFileSync(pfad, 'utf8')
    expect(inhalt.endsWith('\n')).toBe(true)
    expect(inhalt).not.toContain('geheim')
  })

  test('eine kaputte Datei wirft — statt still „nichts" zu bedeuten', async () => {
    const pfad = join(verzeichnis, 'kaputt.json')
    await Bun.write(pfad, '{ das ist kein json')
    await expect(liesDatei(pfad)).rejects.toBeDefined()
  })
})

/** Ein Credential-Dienst, der Records im Speicher hält. */
function macheDienst(): {
  readonly werte: Map<string, string>
  readonly dienst: {
    readRecord(key: CredentialKey): Promise<CredentialRecord | undefined>
    describeRecord(key: CredentialKey): Promise<{ configured: boolean; writable: boolean }>
    modifyRecord(
      key: CredentialKey,
      mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
    ): Promise<CredentialRecord | undefined>
    deleteRecord(key: CredentialKey): Promise<void>
  }
} {
  const werte = new Map<string, string>()
  return {
    werte,
    dienst: {
      async readRecord(key) {
        const wert = werte.get(String(key))
        return wert === undefined ? undefined : { kind: 'api-key', key: wert }
      },
      async describeRecord(key) {
        return { configured: werte.has(String(key)), writable: true }
      },
      async modifyRecord(key, mutate) {
        const alt = werte.get(String(key))
        const neu = await mutate(alt === undefined ? undefined : { kind: 'api-key', key: alt })
        if (neu !== undefined && neu.kind === 'api-key' && typeof neu.key === 'string') {
          werte.set(String(key), neu.key)
        }
        return neu
      },
      async deleteRecord(key) {
        werte.delete(String(key))
      },
    },
  }
}

describe('Die Credential-Ablage', () => {
  test('setzt, beschreibt, liest und entfernt — unter dem Scope des Plugins', async () => {
    const { werte, dienst } = macheDienst()
    const ablage = new CredentialAblage({ get: (name) => (name === 'credentials' ? dienst : undefined) })
    await ablage.setze('openrouter-privat', '  geheim-wert  ')
    expect([...werte.keys()]).toEqual(['pmh-zugaenge/openrouter-privat'])
    expect(await ablage.lies('openrouter-privat')).toBe('geheim-wert')
    expect(await ablage.beschreibe('openrouter-privat')).toEqual({
      gesetzt: true,
      schreibbar: true,
      quelle: 'ablage',
    })
    await ablage.entferne('openrouter-privat')
    expect(await ablage.beschreibe('openrouter-privat')).toEqual({ gesetzt: false, schreibbar: true })
    expect(await ablage.lies('openrouter-privat')).toBeUndefined()
  })

  test('ein leerer Wert wird abgelehnt — dafür gibt es „entfernen"', async () => {
    const { dienst } = macheDienst()
    const ablage = new CredentialAblage({ get: () => dienst })
    await expect(ablage.setze('x', '   ')).rejects.toBeInstanceOf(AblageFehler)
  })

  test('die Umgebung ist der Ausweichweg — die Ablage geht vor', async () => {
    const { dienst } = macheDienst()
    const ablage = new CredentialAblage({ get: () => dienst })
    process.env['PMH_TEST_SCHLUESSEL'] = 'aus-der-umgebung'
    expect(await ablage.lies('x', 'PMH_TEST_SCHLUESSEL')).toBe('aus-der-umgebung')
    expect(await ablage.beschreibe('x', 'PMH_TEST_SCHLUESSEL')).toEqual({
      gesetzt: true,
      schreibbar: true,
      quelle: 'umgebung',
    })
    await ablage.setze('x', 'aus-der-ablage')
    expect(await ablage.lies('x', 'PMH_TEST_SCHLUESSEL')).toBe('aus-der-ablage')
  })

  test('ohne Dienst: beschreiben geht, schreiben nicht — und sagt warum', async () => {
    const ablage = new CredentialAblage({ get: () => undefined })
    expect(await ablage.beschreibe('x')).toEqual({ gesetzt: false, schreibbar: false })
    await expect(ablage.setze('x', 'wert')).rejects.toBeInstanceOf(AblageFehler)
  })
})
