/**
 * Der durchgehende Nachweis: Deklaration → Abschluß → Generation → Zeiger →
 * Umschalten → Rückweg → Bündel → Import.
 *
 * **Was diese Datei beweisen soll, und was nicht.** Sie beweist, daß die Kette
 * auf einer echten Platte läuft und daß jede Verweigerung den **richtigen**
 * Grund hat. Sie beweist **nicht**, daß ein Wechsel für bestehende Verbindungen
 * unsichtbar ist — dafür fehlt der Anhängepunkt mit echtem Upstream. Diese Lücke
 * steht im README und nicht in einem grünen Häkchen.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { layoutFor, leseZeiger, listGenerationen, journalLesen } from '../src/generation.ts'
import { exportiere, importiere, pruefeBuendel } from '../src/implementierung.ts'
import { baue, liste, pruefe, raeume, rolleZurueck, schalte, zustand } from '../src/operations.ts'
import { baueProjekt, schreibe, type TestProjekt } from './fixtures.ts'

let offen: TestProjekt[] = []

afterEach(async () => {
  for (const projekt of offen) await projekt.aufraeumen()
  offen = []
})

async function projekt(units: Parameters<typeof baueProjekt>[0], optionen?: Parameters<typeof baueProjekt>[1]): Promise<TestProjekt> {
  const gebaut = await baueProjekt(units, optionen)
  offen.push(gebaut)
  return gebaut
}

describe('Prüfung und Bau', () => {
  test('eine gültige Deklaration prüft grün und nennt den Abschluß', async () => {
    const p = await projekt([{ name: 'pmh-attach' }, { name: 'pmh-nix' }])
    const bericht = await pruefe({ projectRoot: p.root })
    expect(bericht.ok).toBe(true)
    expect(bericht.closure?.units.map((unit) => unit.name)).toEqual(['pmh-attach', 'pmh-nix'])
  })

  test('ein unbekanntes Unit wird mit seinem Namen gemeldet', async () => {
    const p = await projekt([{ name: 'a' }], {
      declaration: { format: 1, core: { version: '0.2.1-alpha.2' }, roots: ['units'], units: [{ name: 'a' }, { name: 'gibtsnicht' }] },
    })
    const bericht = await pruefe({ projectRoot: p.root })
    expect(bericht.ok).toBe(false)
    expect(bericht.befunde.map((befund) => befund.code)).toContain('generation_declaration_unit_unknown')
  })

  test('eine Abhängigkeit wird mitgeschlossen, auch wenn sie nicht deklariert ist', async () => {
    const p = await projekt([{ name: 'a', requires: ['b'] }, { name: 'b' }], {
      declaration: { format: 1, core: { version: '0.2.1-alpha.2' }, roots: ['units'], units: [{ name: 'a' }] },
    })
    const bericht = await pruefe({ projectRoot: p.root })
    expect(bericht.ok).toBe(true)
    expect(bericht.closure?.units.map((unit) => unit.name)).toEqual(['a', 'b'])
    expect(bericht.closure?.units.find((unit) => unit.name === 'b')?.declared).toBe(false)
  })

  test('ein abgeschaltetes Unit, das gebraucht wird, sperrt den Bau', async () => {
    const p = await projekt([{ name: 'a', requires: ['b'] }, { name: 'b' }], {
      declaration: {
        format: 1,
        core: { version: '0.2.1-alpha.2' },
        roots: ['units'],
        units: [{ name: 'a' }, { name: 'b', enabled: false }],
      },
    })
    const bericht = await pruefe({ projectRoot: p.root })
    expect(bericht.ok).toBe(false)
    expect(bericht.befunde.map((befund) => befund.code)).toContain('generation_declaration_unit_disabled')
  })

  test('eine fehlende Pflichtdatei sperrt den Bau', async () => {
    const p = await projekt([{ name: 'a' }], {
      declaration: { format: 1, core: { version: '0.2.1-alpha.2' }, roots: ['units'], units: [{ name: 'a' }], files: ['fehlt.yml'] },
    })
    const bericht = await pruefe({ projectRoot: p.root })
    expect(bericht.ok).toBe(false)
    expect(bericht.befunde.map((befund) => befund.code)).toContain('generation_declaration_file_missing')
  })

  test('ein Bau wirkt nicht: er setzt keinen Zeiger', async () => {
    const p = await projekt([{ name: 'a' }])
    const ergebnis = await baue({ projectRoot: p.root })
    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.generation?.number).toBe(1)
    const layout = layoutFor(p.root)
    expect(await leseZeiger(layout, 'current')).toBeUndefined()
    expect(await leseZeiger(layout, 'next')).toBeUndefined()
  })

  test('derselbe Inhalt baut nicht neu — „nichts geändert" ist eine Auskunft', async () => {
    const p = await projekt([{ name: 'a' }])
    const erster = await baue({ projectRoot: p.root })
    const zweiter = await baue({ projectRoot: p.root })
    expect(zweiter.uebersprungen).toBe(true)
    expect(zweiter.generation?.number).toBe(erster.generation?.number)
    expect(await listGenerationen(layoutFor(p.root))).toEqual([1])
  })

  test('ein geänderter Dateiinhalt erzeugt eine neue Generation mit anderem Fingerabdruck', async () => {
    const p = await projekt([{ name: 'a' }])
    const erster = await baue({ projectRoot: p.root })
    await schreibe(p.root, 'units/a/index.ts', 'export const name = "geändert"\n')
    const zweiter = await baue({ projectRoot: p.root })
    expect(zweiter.generation?.number).toBe(2)
    expect(zweiter.generation?.fingerprint).not.toBe(erster.generation?.fingerprint)
  })
})

describe('Zeiger und Umschalten', () => {
  test('switch setzt beide Zeiger, boot nur "next", test nur "current"', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    const layout = layoutFor(p.root)

    await schalte({ projectRoot: p.root, art: 'boot' })
    expect(await leseZeiger(layout, 'next')).toBe(1)
    expect(await leseZeiger(layout, 'current')).toBeUndefined()

    await schalte({ projectRoot: p.root, art: 'test' })
    expect(await leseZeiger(layout, 'current')).toBe(1)

    await schalte({ projectRoot: p.root, art: 'switch' })
    expect(await leseZeiger(layout, 'current')).toBe(1)
    expect(await leseZeiger(layout, 'next')).toBe(1)
  })

  test('eine Einbahnstraße verlangt ausdrückliche Freigabe', async () => {
    const p = await projekt([{ name: 'db', irreversible: true }])
    await baue({ projectRoot: p.root })
    const ohne = await schalte({ projectRoot: p.root, art: 'switch' })
    expect(ohne.ok).toBe(false)
    expect(ohne.befunde.map((befund) => befund.code)).toContain('generation_approval_required')

    const mit = await schalte({ projectRoot: p.root, art: 'switch', freigabe: true })
    expect(mit.ok).toBe(true)
  })

  test('ein abweichendes Datenbankschema sperrt den Wechsel — es wird gemessen, nicht angenommen', async () => {
    const p = await projekt([{ name: 'a' }], {
      declaration: { format: 1, core: { version: '0.2.1-alpha.2' }, roots: ['units'], units: [{ name: 'a' }], schema: 7, policy: { requireCheck: false } },
    })
    await baue({ projectRoot: p.root })
    const abweichend = await schalte({ projectRoot: p.root, art: 'switch', schemaStand: 5 })
    expect(abweichend.ok).toBe(false)
    expect(abweichend.befunde.map((befund) => befund.code)).toContain('generation_schema_mismatch')

    const passend = await schalte({ projectRoot: p.root, art: 'switch', schemaStand: 7 })
    expect(passend.ok).toBe(true)
  })

  test('der Rückweg geht auf die vorige aufbewahrte Generation', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    await schreibe(p.root, 'units/a/index.ts', 'export const x = 2\n')
    const zweiter = await baue({ projectRoot: p.root })
    const zweiteNummer = zweiter.generation?.number
    if (zweiteNummer === undefined) throw new Error('erwartet: eine zweite Generation')
    await schalte({ projectRoot: p.root, nummer: zweiteNummer, art: 'switch' })

    const zurueck = await rolleZurueck({ projectRoot: p.root })
    expect(zurueck.ok).toBe(true)
    expect(zurueck.nach?.number).toBe(1)
    expect(await leseZeiger(layoutFor(p.root), 'current')).toBe(1)
  })

  test('ein Rückweg ohne vorige Generation wird gemeldet, nicht erfunden', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const zurueck = await rolleZurueck({ projectRoot: p.root })
    expect(zurueck.ok).toBe(false)
    expect(zurueck.befunde[0]?.code).toBe('generation_nothing_to_do')
  })
})

describe('Zustand und Drift', () => {
  test('nach dem Bau und Umschalten gibt es keinen Drift', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const bericht = await zustand({ projectRoot: p.root })
    expect(bericht.hatDrift).toBe(false)
    expect(bericht.current?.number).toBe(1)
  })

  test('eine geänderte Deklaration ohne Bau ist Drift — gemeldet, nicht geglättet', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    await schreibe(p.root, 'harness/units.json', `${JSON.stringify({
      format: 1,
      core: { version: '0.2.1-alpha.2' },
      roots: ['units'],
      units: [{ name: 'a', reload: 'hot' }],
    }, null, 2)}\n`)

    const bericht = await zustand({ projectRoot: p.root })
    expect(bericht.hatDrift).toBe(true)
    expect(bericht.drift?.aenderungen.map((aenderung) => aenderung.art)).toContain('takt')
  })
})

describe('Aufräumen', () => {
  test('prune nennt, was verschwindet', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    for (const inhalt of ['2', '3', '4']) {
      await schreibe(p.root, 'units/a/index.ts', `export const x = ${inhalt}\n`)
      await baue({ projectRoot: p.root })
    }
    const ergebnis = await raeume({ projectRoot: p.root, behalten: 0 })
    expect(ergebnis.entfernt.length).toBeGreaterThan(0)
    expect(ergebnis.behalten).toContain(1)
    expect(await liste({ projectRoot: p.root })).toHaveLength(ergebnis.behalten.length)
  })
})

describe('Bündel: weitergeben und annehmen', () => {
  test('ein Bündel mit Nutzlast kommt in einem leeren Projekt an — aber erst nach der Vertrauenshandlung', async () => {
    const sender = await projekt([{ name: 'a' }, { name: 'b', requires: ['a'] }])
    await baue({ projectRoot: sender.root })
    await schalte({ projectRoot: sender.root, art: 'switch' })
    const datei = join(sender.root, 'meine.pmhimpl')
    const exportErgebnis = await exportiere({ projectRoot: sender.root, out: datei, payload: true })
    expect(exportErgebnis.signiert).toBe(true)
    expect(exportErgebnis.nutzlast).toBeGreaterThan(0)

    const empfaenger = await projekt([])
    // Ohne Vertrauen: abgelehnt, und zwar bevor irgendetwas entpackt wird.
    const ohneVertrauen = await importiere({ projectRoot: empfaenger.root, datei })
    expect(ohneVertrauen.ok).toBe(false)
    expect(ohneVertrauen.befunde.map((befund) => befund.code)).toContain('implbundle_key_missing')
    expect(ohneVertrauen.geschrieben).toEqual([])

    // Vertrauen ist eine Handlung: der öffentliche Schlüssel wird abgelegt.
    const oeffentlich = await readFile(join(sender.root, '.pmh', 'keys', 'impl-signing.pub'), 'utf8')
    await mkdir(join(empfaenger.root, '.pmh', 'keys'), { recursive: true })
    await writeFile(join(empfaenger.root, '.pmh', 'keys', 'sender.pub'), oeffentlich, 'utf8')

    const mitVertrauen = await importiere({ projectRoot: empfaenger.root, datei })
    expect(mitVertrauen.ok).toBe(true)
    expect(mitVertrauen.zeiger).toBe('next')
    expect(mitVertrauen.geschrieben).toContain('harness/units.json')

    // Der Empfänger hat eine Generation — und sie ist NICHT scharf.
    const layout = layoutFor(empfaenger.root)
    expect(await leseZeiger(layout, 'next')).toBe(1)
    expect(await leseZeiger(layout, 'current')).toBeUndefined()
  })

  test('ein verändertes Bündel fällt durch — Digest und Signatur zugleich', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const datei = join(p.root, 'x.pmhimpl')
    await exportiere({ projectRoot: p.root, out: datei })

    const original = JSON.parse(await readFile(datei, 'utf8')) as Record<string, unknown>
    const manipuliert = { ...original, notes: ['untergeschoben'] }
    await writeFile(datei, `${JSON.stringify(manipuliert, null, 2)}\n`, 'utf8')

    const bericht = await pruefeBuendel(datei, layoutFor(p.root))
    expect(bericht.ok).toBe(false)
    expect(bericht.befunde.map((befund) => befund.code)).toContain('implbundle_digest_mismatch')
  })

  test('ein unsigniertes Bündel wird abgelehnt: Unversehrtheit ist nicht Herkunft', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const datei = join(p.root, 'ohne.pmhimpl')
    const ergebnis = await exportiere({ projectRoot: p.root, out: datei, signiere: false })
    expect(ergebnis.signiert).toBe(false)

    const bericht = await pruefeBuendel(datei, layoutFor(p.root))
    expect(bericht.ok).toBe(false)
    expect(bericht.befunde.map((befund) => befund.code)).toContain('implbundle_signature_missing')
  })

  test('der Rundlauf: Export → Import → Export ergibt denselben Inhaltsdigest der Units', async () => {
    const sender = await projekt([{ name: 'a' }])
    await baue({ projectRoot: sender.root })
    await schalte({ projectRoot: sender.root, art: 'switch' })
    const ersteDatei = join(sender.root, 'a.pmhimpl')
    const erster = await exportiere({ projectRoot: sender.root, out: ersteDatei, payload: true })
    const ersterInhalt = JSON.parse(await readFile(ersteDatei, 'utf8')) as { units: { name: string; contentDigest: string }[] }

    const empfaenger = await projekt([])
    const oeffentlich = await readFile(join(sender.root, '.pmh', 'keys', 'impl-signing.pub'), 'utf8')
    await mkdir(join(empfaenger.root, '.pmh', 'keys'), { recursive: true })
    await writeFile(join(empfaenger.root, '.pmh', 'keys', 'sender.pub'), oeffentlich, 'utf8')
    const importiert = await importiere({ projectRoot: empfaenger.root, datei: ersteDatei })
    expect(importiert.ok).toBe(true)

    const zurueckDatei = join(empfaenger.root, 'zurueck.pmhimpl')
    await exportiere({ projectRoot: empfaenger.root, out: zurueckDatei, payload: true })
    const zweiterInhalt = JSON.parse(await readFile(zurueckDatei, 'utf8')) as { units: { name: string; contentDigest: string }[] }

    expect(zweiterInhalt.units.map((unit) => [unit.name, unit.contentDigest]))
      .toEqual(ersterInhalt.units.map((unit) => [unit.name, unit.contentDigest]))
    expect(erster.digest).not.toBe('')
  })

  test('das Bündel trägt keine Sitzungen und keinen Zustand', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    await schreibe(p.root, '.pmh/sessions/x/session.v4.jsonl.zstd', 'geheim')
    const datei = join(p.root, 'pruef.pmhimpl')
    await exportiere({ projectRoot: p.root, out: datei, payload: true })
    const text = await readFile(datei, 'utf8')
    expect(text.includes('session.v4')).toBe(false)
    expect(text.includes('geheim')).toBe(false)
    expect(text.includes('journal.jsonl')).toBe(false)
  })
})

describe('Journal', () => {
  test('jede Wirkung steht im Journal, in der Reihenfolge, in der sie geschah', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const eintraege = await journalLesen(layoutFor(p.root))
    expect(eintraege.map((eintrag) => eintrag.event)).toEqual(['build', 'switch'])
  })
})

describe('Werkzeugfläche', () => {
  test('list nennt die Generationen mit ihrer Marke', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'boot' })
    const eintraege = await liste({ projectRoot: p.root })
    expect(eintraege).toHaveLength(1)
    expect(eintraege[0]?.vorgemerkt).toBe(true)
    expect(eintraege[0]?.aktiv).toBe(false)
  })

  test('das Projektverzeichnis enthält keine Streudatei von einem abgebrochenen Schreiben', async () => {
    const p = await projekt([{ name: 'a' }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const namen = await readdir(layoutFor(p.root).stateDir)
    expect(namen.filter((name) => name.includes('.tmp-'))).toEqual([])
  })
})
