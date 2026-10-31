/**
 * Die Kette — Einstellungen + Schlüssel + OpenRouter, **ohne Host und ohne Netz**.
 *
 * Geprüft wird hier das, was schiefgehen kann, bevor ein einziger Aufruf hinausgeht: eine
 * fehlende Datei, eine unbrauchbare Datei, eine Wahl auf einen Anbieter, den es nicht gibt, und
 * die Frage, ob der Schlüssel wirklich erst **beim Aufruf** gelesen wird.
 *
 * @module @prometheus-harness/ai-capabilities/tests/kette
 */

import { describe, expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { baueKette } from '../src/kette.ts'

/** Ein eigenes Verzeichnis je Prüfung — kein Test schreibt in ein anderes. */
async function verzeichnis(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pmh-ki-'))
}

/** Eine Einstellungsdatei mit einer Wahl je Fähigkeit. */
async function schreibe(einstellungen: unknown): Promise<string> {
  const ordner = await verzeichnis()
  const pfad = join(ordner, 'einstellungen.json')
  await writeFile(pfad, JSON.stringify(einstellungen), 'utf8')
  return pfad
}

describe('Die Kette', () => {
  test('ohne Datei: keine Wahl, also kein Anbieter — und der Grund steht dabei', async () => {
    const pfad = join(await verzeichnis(), 'gibtsnicht.json')
    const kette = await baueKette({ einstellungenPfad: pfad, schluessel: () => 'sk-test' })
    expect(kette.aufbau.eingetragen).toEqual([])
    expect(kette.aufbau.hinweise.join('\n')).toContain('KEINE Fähigkeit')
  })

  test('mit einer Wahl: OpenRouter ist eingetragen — mit dem gewählten Modell', async () => {
    const pfad = await schreibe({
      fassung: 1,
      wahl: {
        bild: { anbieter: 'openrouter', modell: 'google/gemini-2.5-flash-image' },
        entscheiden: { anbieter: 'openrouter', modell: 'openai/gpt-oss-20b' },
      },
      stufen: { automatisch: 0.9, rueckfrage: 0.5 },
    })
    const kette = await baueKette({ einstellungenPfad: pfad, schluessel: () => 'sk-test' })
    expect(kette.aufbau.eingetragen).toEqual(['openrouter'])
    expect(kette.anbieter.id).toBe('openrouter')
    expect(kette.anbieter.modelle('bild')[0]).toBe('google/gemini-2.5-flash-image')
    expect(await kette.hatSchluessel()).toBe(true)
  })

  test('ein leerer Schlüssel zählt nicht als Schlüssel', async () => {
    const pfad = await schreibe({ fassung: 1, wahl: {}, stufen: { automatisch: 0.9, rueckfrage: 0.5 } })
    const kette = await baueKette({ einstellungenPfad: pfad, schluessel: () => '   ' })
    expect(await kette.hatSchluessel()).toBe(false)
  })

  test('eine Wahl auf einen fremden Anbieter wird GEMELDET, nicht still verschluckt', async () => {
    const pfad = await schreibe({
      fassung: 1,
      wahl: { bild: { anbieter: 'gibtsnicht', modell: 'x' } },
      stufen: { automatisch: 0.9, rueckfrage: 0.5 },
    })
    const kette = await baueKette({ einstellungenPfad: pfad, schluessel: () => 'sk-test' })
    expect(kette.aufbau.eingetragen).toEqual([])
    expect(kette.aufbau.hinweise.join('\n')).toContain('KEINEN Anbieter')
  })

  test('eine kaputte Datei fliegt auf — kein stiller Rückfall auf die Vorgabe', async () => {
    const ordner = await verzeichnis()
    const pfad = join(ordner, 'einstellungen.json')
    await writeFile(pfad, '{ das ist kein json', 'utf8')
    const fehler = await baueKette({ einstellungenPfad: pfad, schluessel: () => 'sk-test' }).catch(
      (e: unknown) => e,
    )
    expect(fehler).toBeInstanceOf(Error)
  })
})
