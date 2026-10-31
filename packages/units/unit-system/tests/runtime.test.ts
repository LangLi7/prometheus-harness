/**
 * Prüfungen der Laufzeit und des Prüfrahmens.
 *
 * **Der Satz, um den es geht.** Bis zum 18.10.2026 konnte der Plugin-Host laden,
 * prüfen, einhängen und abstecken — und **nichts rief ihn auf**. Ein scharf
 * geschalteter Zeiger war damit eine Absicht ohne Wirkung. Hier wird gemessen,
 * daß die Wirkung da ist: ein echtes Modul, echtes HTTP, ein Abstecken, das
 * seine Spuren entfernt.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { baue, schalte } from '../src/operations.ts'
import { erstelleRouten, starteRahmen, type Rahmen } from '../src/rahmen.ts'
import { UnitRuntime } from '../src/runtime.ts'
import { baueProjekt, schreibe, type TestProjekt, type TestUnit } from './fixtures.ts'

const HIER = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HIER, '../../../..')

let offen: TestProjekt[] = []
let rahmen: Rahmen[] = []

afterEach(async () => {
  for (const laufend of rahmen) await laufend.stoppe()
  rahmen = []
  for (const projekt of offen) await projekt.aufraeumen()
  offen = []
  // Rückstände der Prüf-Plugins beseitigen, damit ein Test den nächsten nicht färbt.
  delete (globalThis as Record<string, unknown>).__pmhProbe
})

async function projekt(units: readonly TestUnit[], optionen?: Parameters<typeof baueProjekt>[1]): Promise<TestProjekt> {
  const gebaut = await baueProjekt(units, optionen)
  offen.push(gebaut)
  return gebaut
}

/** Ein Plugin, das seinen Einhänge- und Absteck-Vorgang in `globalThis` bucht. */
function probePlugin(name: string): { readonly entry: string; readonly files: Readonly<Record<string, string>> } {
  return {
    entry: 'src/index.ts',
    files: {
      'src/index.ts': [
        'export function apply(host) {',
        `  const buch = (globalThis.__pmhProbe ??= { eingehaengt: [], abgesteckt: [] })`,
        `  buch.eingehaengt.push(${JSON.stringify(name)})`,
        '  buch.vertrag = host.contract',
        `  return () => { buch.abgesteckt.push(${JSON.stringify(name)}) }`,
        '}',
        '',
      ].join('\n'),
    },
  }
}

function buch(): { eingehaengt: string[]; abgesteckt: string[]; vertrag?: string } {
  return ((globalThis as Record<string, unknown>).__pmhProbe ?? { eingehaengt: [], abgesteckt: [] }) as {
    eingehaengt: string[]
    abgesteckt: string[]
    vertrag?: string
  }
}

describe('Prüfrahmen', () => {
  test('ein Weg antwortet über echtes HTTP, und ein unbekannter Weg nennt die belegten', async () => {
    const laufend = await starteRahmen()
    rahmen.push(laufend)
    laufend.routen.registriere('/probe', () => ({ status: 200, koerper: { antwort: 42 } }))

    const treffer = await fetch(`${laufend.url}/probe`)
    expect(treffer.status).toBe(200)
    expect(await treffer.json()).toEqual({ antwort: 42 })

    const daneben = await fetch(`${laufend.url}/gibtsnicht`)
    expect(daneben.status).toBe(404)
    expect(await daneben.json()).toEqual({ fehler: 'kein-weg', pfad: '/gibtsnicht', belegt: ['/probe'] })
  })

  test('zwei Einträge auf demselben Weg sind ein Konflikt, kein Überschreiben', () => {
    const routen = erstelleRouten()
    routen.registriere('/x', () => ({ status: 200 }))
    expect(() => routen.registriere('/x', () => ({ status: 200 }))).toThrow()
  })

  test('die Abmelde-Funktion räumt nur den eigenen Eintrag weg', () => {
    const routen = erstelleRouten()
    const ersterHandler = (): { status: number } => ({ status: 200 })
    const abmelden = routen.registriere('/y', ersterHandler)
    expect(routen.liste()).toEqual(['/y'])
    abmelden()
    expect(routen.liste()).toEqual([])
    // Zweimal abmelden ist kein Fehler und entfernt nichts Fremdes.
    abmelden()
    expect(routen.liste()).toEqual([])
  })

  test('ein werfender Handler ergibt 500 mit Grund statt eines Absturzes', async () => {
    const laufend = await starteRahmen()
    rahmen.push(laufend)
    laufend.routen.registriere('/kaputt', () => {
      throw new Error('absichtlich')
    })
    const antwort = await fetch(`${laufend.url}/kaputt`)
    expect(antwort.status).toBe(500)
    expect(await antwort.json()).toEqual({ fehler: 'handler', meldung: 'absichtlich' })
  })

  test('der Rahmen hört nach dem Stoppen auf und gibt den Port frei', async () => {
    const laufend = await starteRahmen()
    const port = laufend.port
    laufend.routen.registriere('/z', () => ({ status: 200, koerper: 'ok' }))
    await laufend.stoppe()
    await expect(fetch(`http://127.0.0.1:${String(port)}/z`)).rejects.toThrow()

    // Und der Port ist wieder vergebbar.
    const zweiter = await starteRahmen({ port })
    rahmen.push(zweiter)
    expect(zweiter.port).toBe(port)
  })
})

describe('Laufzeit — die Generation wirklich einhängen', () => {
  test('hängt ein Plugin ein, reicht den Vertrag durch und steckt es wieder ab', async () => {
    const p = await projekt([{ name: 'probe', ...probePlugin('probe') }])
    const gebaut = await baue({ projectRoot: p.root })
    expect(gebaut.ok).toBe(true)
    await schalte({ projectRoot: p.root, art: 'switch' })

    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    expect(laufzeit.zustand.ok).toBe(true)
    expect(laufzeit.zustand.eingehaengt.map((unit) => unit.name)).toEqual(['probe'])
    expect(laufzeit.zustand.generation).toBe(1)
    expect(buch().eingehaengt).toEqual(['probe'])
    expect(buch().vertrag).toBe('0.2.1-alpha.2')

    await laufzeit.stoppe()
    expect(buch().abgesteckt).toEqual(['probe'])
    expect(laufzeit.mounted).toEqual([])
  })

  test('Abhängigkeiten werden vor ihren Verbrauchern eingehängt, abgesteckt wird umgekehrt', async () => {
    const p = await projekt([
      { name: 'unten', ...probePlugin('unten') },
      { name: 'oben', requires: ['unten'], ...probePlugin('oben') },
    ])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })

    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    expect(laufzeit.zustand.eingehaengt.map((unit) => unit.name)).toEqual(['unten', 'oben'])
    await laufzeit.stoppe()
    expect(buch().abgesteckt).toEqual(['oben', 'unten'])
  })

  test('Dienste, Skills und Patches werden nicht eingehängt — und der Grund wird genannt', async () => {
    const p = await projekt([
      { name: 'ein-dienst', kind: 'service', ...probePlugin('ein-dienst') },
      { name: 'ein-plugin', ...probePlugin('ein-plugin') },
    ])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })

    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    expect(laufzeit.zustand.eingehaengt.map((unit) => unit.name)).toEqual(['ein-plugin'])
    expect(laufzeit.zustand.uebersprungen.map((eintrag) => eintrag.name)).toEqual(['ein-dienst'])
    expect(laufzeit.zustand.uebersprungen[0]?.grund).toContain('kind "service"')
    await laufzeit.stoppe()
  })

  test('ein defektes Plugin wird abgewiesen, die übrigen hängen trotzdem', async () => {
    const p = await projekt([
      { name: 'gut', ...probePlugin('gut') },
      // Ein Plugin ohne `apply` — der klassische Fall: Datei da, Plugin nein.
      { name: 'kaputt', entry: 'src/index.ts', files: { 'src/index.ts': 'export const nichts = 1\n' } },
    ])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })

    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    expect(laufzeit.zustand.eingehaengt.map((unit) => unit.name)).toEqual(['gut'])
    expect(laufzeit.zustand.ok).toBe(false)
    expect(laufzeit.zustand.abgewiesen.map((befund) => befund.code)).toContain('plugin-kein-plugin')
    expect(laufzeit.zustand.abgewiesen[0]?.unit).toBe('kaputt')
    await laufzeit.stoppe()
  })

  test('eine fehlende Generation ist eine Auskunft, kein Wurf', async () => {
    const p = await projekt([{ name: 'probe', ...probePlugin('probe') }])
    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    expect(laufzeit.zustand.ok).toBe(false)
    expect(laufzeit.zustand.abgewiesen[0]?.message).toContain('Keine Generation')
    await laufzeit.stoppe()
  })

  test('ein zweites Stoppen ist kein Fehler', async () => {
    const p = await projekt([{ name: 'probe', ...probePlugin('probe') }])
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })
    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    await laufzeit.stoppe()
    expect(await laufzeit.stoppe()).toEqual([])
    expect(buch().abgesteckt).toEqual(['probe'])
  })
})

describe('Das ausgelieferte Unit `pmh-status`', () => {
  /**
   * Kopiert das **echte** Unit aus `units/pmh-status` in ein Wegwerf-Projekt.
   *
   * Warum kopieren und nicht importieren: die Laufzeit lädt über einen
   * absoluten Dateipfad aus dem Projekt, und genau dieser Weg soll geprüft
   * werden — nicht ein Import, den die Prüfung selbst zusammengebaut hat.
   */
  async function mitEchtemUnit(): Promise<TestProjekt> {
    const quelle = join(REPO, 'units', 'pmh-status')
    const manifestText = await readFile(join(quelle, 'unit.json'), 'utf8')
    const quelleText = await readFile(join(quelle, 'src', 'index.ts'), 'utf8')
    const p = await projekt([])
    await schreibe(p.root, 'units/pmh-status/unit.json', manifestText)
    await schreibe(p.root, 'units/pmh-status/src/index.ts', quelleText)
    await schreibe(p.root, 'harness/units.json', `${JSON.stringify({
      format: 1,
      core: { version: '0.2.1-alpha.2', contract: '^0.2.0' },
      roots: ['units'],
      units: [{ name: 'pmh-status' }],
    }, null, 2)}\n`)
    return p
  }

  test('hängt sich ein, legt seine Wege an und meldet sie beim Abstecken wieder ab', async () => {
    const p = await mitEchtemUnit()
    const gebaut = await baue({ projectRoot: p.root })
    expect(gebaut.ok).toBe(true)
    expect(gebaut.generation?.units.map((unit) => unit.name)).toEqual(['pmh-status'])
    await schalte({ projectRoot: p.root, art: 'switch' })

    const laufend = await starteRahmen()
    rahmen.push(laufend)

    const laufzeit = await UnitRuntime.starte({
      projectRoot: p.root,
      hostContract: '0.2.1-alpha.2',
      services: {
        routen: laufend.routen,
        zustand: () => ({ generation: 1, fingerprint: 'sha256:probe' }),
      },
    })
    expect(laufzeit.zustand.ok).toBe(true)
    expect(laufzeit.zustand.eingehaengt).toEqual([{ name: 'pmh-status', version: '0.1.0' }])
    expect(laufend.routen.liste()).toEqual(['/api/pmh/gen/status', '/api/pmh/plugin/info'])

    const zustand = await fetch(`${laufend.url}/api/pmh/gen/status`)
    expect(zustand.status).toBe(200)
    expect(await zustand.json()).toEqual({
      plugin: 'pmh-status',
      generation: { generation: 1, fingerprint: 'sha256:probe' },
    })

    const auskunft = await fetch(`${laufend.url}/api/pmh/plugin/info`)
    expect(await auskunft.json()).toEqual({
      plugin: 'pmh-status',
      version: '0.1.0',
      vertrag: '0.2.1-alpha.2',
      wege: ['/api/pmh/gen/status', '/api/pmh/plugin/info'],
    })

    // Abstecken entfernt die Wege wirklich — das ist der Beleg für `reload: hot`.
    await laufzeit.stoppe()
    expect(laufend.routen.liste()).toEqual([])
    const danach = await fetch(`${laufend.url}/api/pmh/gen/status`)
    expect(danach.status).toBe(404)
  })

  test('ohne Register im Host wird es abgewiesen statt still nichts zu tun', async () => {
    const p = await mitEchtemUnit()
    await baue({ projectRoot: p.root })
    await schalte({ projectRoot: p.root, art: 'switch' })

    const laufzeit = await UnitRuntime.starte({ projectRoot: p.root, hostContract: '0.2.1-alpha.2' })
    expect(laufzeit.zustand.ok).toBe(false)
    expect(laufzeit.zustand.eingehaengt).toEqual([])
    expect(laufzeit.zustand.abgewiesen.map((befund) => befund.code)).toContain('plugin-lebenszyklus')
    expect(laufzeit.zustand.abgewiesen[0]?.message).toContain('routen')
    await laufzeit.stoppe()
  })
})
