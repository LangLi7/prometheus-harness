/**
 * Tests für den Plugin-Host — laden, prüfen, einhängen, abstecken.
 *
 * **Warum diese Datei nötig war.** `src/plugin-host.ts` trägt die zweite Hälfte
 * von t14 und stuetzte sich ausdrücklich **nicht** auf den unter Bun unbrauchbaren
 * `node-addon-require-builtin`-Interzeptor (docs/risks.md §6). Ein Host, der
 * nirgends ausgeführt wird, ist aber nur eine Behauptung: `bun run typecheck`
 * beweist, dass er uebersetzt, nicht dass er trägt. Genau das war beim ersten
 * Lauf die Luecke — das Modul war typgeprüft, aber nie geladen, nie eingehängt,
 * nie abgesteckt.
 *
 * Geprüft wird deshalb der **ganze** Ablauf: Manifest lesen, Vertrag prüfen,
 * natives Addon abweisen, Einstiegspunkt gegen die Whitelist auflösen, Modul
 * laden (über einen ersetzbaren Loader, damit kein echter dynamic import nötig
 * ist), `apply` ausführen und in umgekehrter Reihenfolge wieder abstecken.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UnitFailure } from '../src/errors.ts'
import { MANIFEST_FILE } from '../src/manifest.ts'
import {
  checkNativeAddons,
  createHostApi,
  ERROR_CONTRACT,
  ERROR_DEPENDENCY,
  ERROR_ENTRY,
  ERROR_LIFECYCLE,
  ERROR_MANIFEST,
  ERROR_NATIVE_ADDON,
  ERROR_NOT_A_PLUGIN,
  isInside,
  PluginHost,
  prepare,
  splitEntry,
  type Loader,
  type PluginModule,
} from '../src/plugin-host.ts'

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

const HOST_CONTRACT = '0.2.1-alpha.2'
const roots: string[] = []

afterEach(async () => {
  while (roots.length > 0) {
    const dir = roots.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

/** Legt ein Unit-Verzeichnis mit Manifest an (und optional weiteren Dateien). */
async function unitDir(manifest: Record<string, unknown>, files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pmh-pluginhost-'))
  roots.push(root)
  const dir = join(root, String(manifest.name))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), 'utf8')
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf8')
  }
  return dir
}

/** Ein Manifest, das die Prüfungen besteht: Vertrag passend, Einstieg vorhanden. */
function gutesManifest(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    version: '0.1.0',
    kind: 'plugin',
    language: 'typescript',
    description: 'Ein Plugin für den Test.',
    core: 'optional',
    contract: '^0.2.0',
    provides: [name],
    requires: [],
    platforms: ['windows', 'linux', 'darwin'],
    notes: [],
    entry: { command: 'plugin.js', args: [] },
    ...extra,
  }
}

/** Ein Loader, der ein festes Modul liefert und die Aufrufe mitschreibt. */
function festerLoader(modul: PluginModule | unknown): { loader: Loader; aufrufe: string[] } {
  const aufrufe: string[] = []
  const loader: Loader = async (entryUrl: string) => {
    aufrufe.push(entryUrl)
    return modul
  }
  return { loader, aufrufe }
}

// ---------------------------------------------------------------------------
// Reine Prüfungen
// ---------------------------------------------------------------------------

describe('splitEntry', () => {
  test('trennt Datei und Argumente', () => {
    expect(splitEntry('plugin.js --port 1')).toEqual({ file: 'plugin.js', args: ['--port', '1'] })
  })

  test('kommt ohne Argumente aus', () => {
    expect(splitEntry('  plugin.js  ')).toEqual({ file: 'plugin.js', args: [] })
  })

  test('leerer Einstieg ergibt eine leere Datei', () => {
    expect(splitEntry('').file).toBe('')
  })
})

describe('isInside', () => {
  test('erkennt einen Pfad innerhalb der Wurzel', () => {
    expect(isInside('/a/b', '/a/b/c/d.js')).toBe(true)
  })

  test('erkennt die Wurzel selbst', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true)
  })

  test('lehnt einen Ausbruch mit .. ab', () => {
    expect(isInside('/a/b', '/a/b/../c')).toBe(false)
  })

  test('lehnt einen ganz anderen Zweig ab', () => {
    expect(isInside('/a/b', '/a/c/d.js')).toBe(false)
  })

  test('lehnt einen Präfix-Zwilling ab (kein stiller Treffer)', () => {
    // `/a/bc` beginnt mit `/a/b`, liegt aber NICHT darin. Ein Vergleich mit
    // startsWith würde hier fälschlich zustimmen.
    expect(isInside('/a/b', '/a/bc/d.js')).toBe(false)
  })
})

describe('checkNativeAddons', () => {
  test('lässt ein Unit ohne Addon durch', () => {
    expect(checkNativeAddons({ name: 'x' } as never, '{"name":"x"}')).toEqual([])
  })

  test('weist den Interzeptor ab, der unter Bun nicht trägt', () => {
    const errors = checkNativeAddons({ name: 'x' } as never, '{"dependencies":{"node-addon-require-builtin":"1"}}')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe(ERROR_NATIVE_ADDON)
  })

  test('weist node-pty ab (zweites belegtes Addon)', () => {
    const errors = checkNativeAddons({ name: 'x' } as never, '{"dependencies":{"node-pty":"^1"}}')
    expect(errors[0]?.code).toBe(ERROR_NATIVE_ADDON)
  })

  test('weist eine .node-Datei ab', () => {
    const errors = checkNativeAddons({ name: 'x' } as never, '{"entry":{"command":"build/nativ.node"}}')
    expect(errors[0]?.code).toBe(ERROR_NATIVE_ADDON)
  })

  test('findet das Addon auch bei anderer Schreibweise', () => {
    const errors = checkNativeAddons({ name: 'x' } as never, '{"x":"NODE-PTY"}')
    expect(errors[0]?.code).toBe(ERROR_NATIVE_ADDON)
  })
})

// ---------------------------------------------------------------------------
// prepare — prüfen, ohne auszuführen
// ---------------------------------------------------------------------------

describe('prepare', () => {
  test('bereitet ein gültiges Unit vor und nennt eine file://-URL', async () => {
    const dir = await unitDir(gutesManifest('gut'), { 'plugin.js': 'export const apply = () => {}\n' })
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.prepared?.manifest.name).toBe('gut')
    expect(result.prepared?.entryUrl.startsWith('file://')).toBe(true)
  })

  test('führt beim Vorbereiten nichts aus (kein Loader im Spiel)', async () => {
    // Der Beweis: das Einstiegsmodul würde beim Import werfen. prepare darf es
    // trotzdem annehmen, weil es nur liest.
    const dir = await unitDir(gutesManifest('wirft'), { 'plugin.js': 'throw new Error("haette geworfen")\n' })
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.ok).toBe(true)
  })

  test('meldet ein fehlendes Manifest als plugin-manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pmh-pluginhost-'))
    roots.push(root)
    const result = await prepare(join(root, 'gibtsnicht'), { hostContract: HOST_CONTRACT })
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe(ERROR_MANIFEST)
  })

  test('weist ein Unit mit unverträglichem Vertrag ab und nennt Soll und Ist', async () => {
    const dir = await unitDir(gutesManifest('alt', { contract: '^9.0.0' }), { 'plugin.js': '' })
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.ok).toBe(false)
    const vertrag = result.errors.find((error) => error.code === ERROR_CONTRACT)
    expect(vertrag).toBeDefined()
    expect(vertrag?.message).toContain('^9.0.0')
    expect(vertrag?.message).toContain(HOST_CONTRACT)
  })

  test('ein Host-Default ersetzt eine fehlende Vertragsangabe', async () => {
    const dir = await unitDir(gutesManifest('ohne', { contract: undefined }), { 'plugin.js': '' })
    const ohneDefault = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(ohneDefault.errors.some((error) => error.code === ERROR_CONTRACT)).toBe(false)

    const mitDefault = await prepare(dir, { hostContract: HOST_CONTRACT, defaultContract: '^9.0.0' })
    expect(mitDefault.errors.some((error) => error.code === ERROR_CONTRACT)).toBe(true)
  })

  test('verlangt der Core-Vertrag eine Spanne, die der Host nicht bietet, wird abgewiesen', async () => {
    const dir = await unitDir(gutesManifest('brauchtcore', { core: 'required_core', contract: '^0.9.0' }), { 'plugin.js': '' })
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.errors.some((error) => error.code === ERROR_CONTRACT)).toBe(true)
  })

  test('weist ein Unit mit nativem Addon ab (fail-closed)', async () => {
    // Geprüft wird der ROHE Manifest-Text (so ist `checkNativeAddons` gebaut und
    // dokumentiert). Nennt das Manifest ein natives Addon — hier in `notes`,
    // weil das Manifest keine Abhängigkeitsliste führt —, wird das Unit schon
    // beim Vorbereiten abgewiesen, bevor irgendetwas lädt.
    const dir = await unitDir(
      gutesManifest('nativ', { notes: ['Braucht node-addon-require-builtin zum Umbiegen von Modulnamen.'] }),
      { 'plugin.js': 'export const apply = () => {}\n' },
    )
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === ERROR_NATIVE_ADDON)).toBe(true)
  })

  test('Grenze: ein Addon, das NUR im Quelltext steht, sieht prepare nicht', async () => {
    // Ehrlich festgehalten, damit die Grenze nicht als Zusage gelesen wird:
    // `checkNativeAddons` liest den Manifest-Text, nicht den Quellbaum. Diese
    // Prüfung fängt also Deklarationen, nicht versteckte requires. Das ist
    // bewusst so — den ganzen Baum zu durchsuchen wäre teuer und würde bei
    // jedem Vorkommen des Wortes in einer Notiz fälschlich abweisen.
    const dir = await unitDir(gutesManifest('versteckt'), { 'plugin.js': 'require("node-pty")\n' })
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.errors.some((error) => error.code === ERROR_NATIVE_ADDON)).toBe(false)
  })

  test('weist einen Einstiegspunkt außerhalb der Wurzel ab', async () => {
    const dir = await unitDir(gutesManifest('ausbruch', { entry: { command: '../../aussen.js', args: [] } }), { 'plugin.js': '' })
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.code === ERROR_ENTRY)).toBe(true)
  })

  test('weist einen Einstiegspunkt ab, der nicht existiert', async () => {
    const dir = await unitDir(gutesManifest('fehlt', { entry: { command: 'gibtsnicht.js', args: [] } }))
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.errors.some((error) => error.code === ERROR_ENTRY)).toBe(true)
  })

  test('weist ein Unit ohne Einstiegspunkt ab', async () => {
    const dir = await unitDir(gutesManifest('ohneeinstieg', { entry: undefined }))
    const result = await prepare(dir, { hostContract: HOST_CONTRACT })
    expect(result.errors.some((error) => error.code === ERROR_ENTRY)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PluginHost — einhängen und abstecken
// ---------------------------------------------------------------------------

/** Bereitet ein Unit vor und liefert Host plus vorbereitetes Plugin. */
async function hostMitUnit(
  name: string,
  modul: unknown,
  extra: Record<string, unknown> = {},
): Promise<{ host: PluginHost; vorbereitet: NonNullable<Awaited<ReturnType<typeof prepare>>['prepared']>; aufrufe: string[] }> {
  const dir = await unitDir(gutesManifest(name, extra), { 'plugin.js': 'export const apply = () => {}\n' })
  const ergebnis = await prepare(dir, { hostContract: HOST_CONTRACT })
  if (!ergebnis.ok || ergebnis.prepared === undefined) {
    throw new Error(`Vorbereitung fehlgeschlagen: ${JSON.stringify(ergebnis.errors)}`)
  }
  const { loader, aufrufe } = festerLoader(modul)
  return { host: new PluginHost(createHostApi(HOST_CONTRACT), loader), vorbereitet: ergebnis.prepared, aufrufe }
}

describe('PluginHost.mount', () => {
  test('hängt ein Plugin ein und ruft apply mit der Host-Fläche', async () => {
    const gesehen: unknown[] = []
    const { host, vorbereitet } = await hostMitUnit('p1', {
      apply: (api: unknown) => {
        gesehen.push(api)
      },
    })
    const mounted = await host.mount(vorbereitet)
    expect(mounted.name).toBe('p1')
    expect(mounted.version).toBe('0.1.0')
    expect(mounted.state).toBe('eingehaengt')
    expect(gesehen).toHaveLength(1)
    expect((gesehen[0] as { contract: string }).contract).toBe(HOST_CONTRACT)
    expect(host.ledger.mounted).toEqual(['p1'])
    expect(host.ledger.rejected).toEqual([])
  })

  test('reicht die Konfiguration an apply durch', async () => {
    let gesehen: unknown
    const { host, vorbereitet } = await hostMitUnit('p2', {
      apply: (_api: unknown, config: unknown) => {
        gesehen = config
      },
    })
    await host.mount(vorbereitet, { modus: 'test' })
    expect(gesehen).toEqual({ modus: 'test' })
  })

  test('weist ein Modul ohne apply ab und bucht es als Ablehnung', async () => {
    const { host, vorbereitet } = await hostMitUnit('keinplugin', { etwas: true })
    let gefangen: unknown
    try {
      await host.mount(vorbereitet)
    } catch (error) {
      gefangen = error
    }
    expect(gefangen).toBeInstanceOf(UnitFailure)
    expect((gefangen as UnitFailure).error.code).toBe(ERROR_NOT_A_PLUGIN)
    expect(host.ledger.rejected).toHaveLength(1)
    expect(host.ledger.rejected[0]?.unit).toBe('keinplugin')
    expect(host.ledger.mounted).toEqual([])
  })

  test('meldet einen Ladefehler als plugin-lebenszyklus', async () => {
    const dir = await unitDir(gutesManifest('ladefehler'), { 'plugin.js': '' })
    const vorbereitet = (await prepare(dir, { hostContract: HOST_CONTRACT })).prepared
    const host = new PluginHost(createHostApi(HOST_CONTRACT), async () => {
      throw new Error('Modul kaputt')
    })
    let gefangen: unknown
    try {
      await host.mount(vorbereitet as never)
    } catch (error) {
      gefangen = error
    }
    expect((gefangen as UnitFailure).error.code).toBe(ERROR_LIFECYCLE)
    expect(host.ledger.rejected[0]?.message).toContain('Modul kaputt')
  })

  test('meldet einen werfenden apply als plugin-lebenszyklus', async () => {
    const { host, vorbereitet } = await hostMitUnit('wirft', {
      apply: () => {
        throw new Error('apply kaputt')
      },
    })
    let gefangen: unknown
    try {
      await host.mount(vorbereitet)
    } catch (error) {
      gefangen = error
    }
    expect((gefangen as UnitFailure).error.code).toBe(ERROR_LIFECYCLE)
    expect(host.ledger.mounted).toEqual([])
  })

  test('verweigert das Einhängen, wenn eine Abhängigkeit fehlt — vor dem Laden', async () => {
    const { host, vorbereitet, aufrufe } = await hostMitUnit('braucht', { apply: () => {} }, { requires: ['fehlt'] })
    let gefangen: unknown
    try {
      await host.mount(vorbereitet)
    } catch (error) {
      gefangen = error
    }
    expect((gefangen as UnitFailure).error.code).toBe(ERROR_DEPENDENCY)
    // Der Kern der Reihenfolge: es wurde gar nicht erst geladen.
    expect(aufrufe).toEqual([])
  })

  test('hängt ein Unit ein, wenn seine Abhängigkeit bereits eingehängt ist', async () => {
    const { host, vorbereitet: basis } = await hostMitUnit('basis', { apply: () => {} })
    await host.mount(basis)

    const { vorbereitet: darauf } = await hostMitUnit('darauf', { apply: () => {} }, { requires: ['basis'] })
    const mounted = await host.mount(darauf)
    expect(mounted.name).toBe('darauf')
    expect(host.ledger.mounted).toEqual(['basis', 'darauf'])
  })
})

describe('PluginHost.unmount', () => {
  test('steckt ab und ruft die zurückgegebene Absteck-Funktion', async () => {
    let abgesteckt = 0
    const { host, vorbereitet } = await hostMitUnit('m1', {
      apply: () => () => {
        abgesteckt += 1
      },
    })
    await host.mount(vorbereitet)
    const weg = await host.unmount('m1')
    expect(abgesteckt).toBe(1)
    expect(weg.state).toBe('abgesteckt')
    expect(host.ledger.mounted).toEqual([])
  })

  test('steckt ohne Namen das zuletzt eingehängte ab (LIFO)', async () => {
    const reihenfolge: string[] = []
    // EIN Host mit zwei Plugins: genau darum geht es beim Abstecken — die
    // Reihenfolge innerhalb eines Hosts, nicht über zwei Hosts hinweg.
    const host = new PluginHost(createHostApi(HOST_CONTRACT), async (entryUrl: string) => {
      if (entryUrl.includes('unit-a')) return { apply: () => () => void reihenfolge.push('a') }
      return { apply: () => () => void reihenfolge.push('b') }
    })
    const a = (await prepare(await unitDir(gutesManifest('unit-a'), { 'plugin.js': '' }), { hostContract: HOST_CONTRACT })).prepared
    const b = (await prepare(await unitDir(gutesManifest('unit-b'), { 'plugin.js': '' }), { hostContract: HOST_CONTRACT })).prepared
    await host.mount(a as never)
    await host.mount(b as never)
    expect(host.ledger.mounted).toEqual(['unit-a', 'unit-b'])

    await host.unmountAll()
    // Umgekehrte Einhänge-Reihenfolge: b vor a. Genau das schützt ein Plugin,
    // das auf dem vorher eingehängten aufbaut.
    expect(reihenfolge).toEqual(['b', 'a'])
    expect(host.ledger.mounted).toEqual([])
  })

  test('ein Plugin ohne Absteck-Funktion ist kein Fehler', async () => {
    const { host, vorbereitet } = await hostMitUnit('ohnecleanup', { apply: () => {} })
    await host.mount(vorbereitet)
    const weg = await host.unmount()
    expect(weg.state).toBe('abgesteckt')
    expect(weg.unmount).toBeUndefined()
  })

  test('meldet ein Abstecken ohne Ziel als plugin-lebenszyklus', async () => {
    const host = new PluginHost(createHostApi(HOST_CONTRACT), async () => ({}))
    let gefangen: unknown
    try {
      await host.unmount()
    } catch (error) {
      gefangen = error
    }
    expect((gefangen as UnitFailure).error.code).toBe(ERROR_LIFECYCLE)
  })

  test('meldet einen unbekannten Namen', async () => {
    const { host, vorbereitet } = await hostMitUnit('da', { apply: () => {} })
    await host.mount(vorbereitet)
    let gefangen: unknown
    try {
      await host.unmount('nichtda')
    } catch (error) {
      gefangen = error
    }
    expect((gefangen as UnitFailure).error.code).toBe(ERROR_LIFECYCLE)
    expect(host.ledger.mounted).toEqual(['da'])
  })

  test('unmountAll auf einem leeren Host ist kein Fehler', async () => {
    const host = new PluginHost(createHostApi(HOST_CONTRACT), async () => ({}))
    expect(await host.unmountAll()).toEqual([])
  })
})
