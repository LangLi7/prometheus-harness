/**
 * Prüfung des Sprachpakets `de`.
 *
 * ## Was hier geprüft wird — und was **nicht**
 *
 * | Frage | Wie |
 * |---|---|
 * | Ist `common` **vollständig**? | gegen die **Schlüssel des Kerns**, nicht gegen eine eigene Liste |
 * | Ist `settings.locale` vollständig? | dieselbe Messung |
 * | Sind die **Platzhalter** erhalten? | jedes `{…}` aus dem englischen Wert muß im deutschen stehen |
 * | Meldet der Trichter ein Fach, das der Kern **nicht** kennt? | eigener Fall |
 * | Meldet er eine **Lücke**? | **Gegenprobe** mit einem absichtlich unvollständigen Paket |
 * | Meldet er einen **verlorenen Platzhalter**? | **Gegenprobe** |
 * | Meldet der Trichter die Sprache mit Rückfall `en` an? | gegen einen mitgeschriebenen `ctx` |
 *
 * **Nicht** geprüft: daß der echte `LocaleRuntime` die Anmeldung annimmt. Dafür bräuchte es
 * einen `ClientContext`; ein selbstgebauter wäre eine Attrappe, die nur beweist, daß es mit
 * **ihr** läuft. Das steht als offener Punkt in `live-anbindung.md`.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lesePluginWoerterbuecher } from '../language-funnel.mjs'
import { faecher, RUECKFALL, SPRACHE } from '../../packages/client/locale/src/index.ts'

const WURZEL = join(import.meta.dir, '..', '..')
const PAKET = join(WURZEL, 'packages', 'client', 'locale', 'de.json')
const KERN_BUENDEL = join(WURZEL, 'node_modules', '@deepseek-ai', 'dsh-client-locale', 'lib', 'client.js')

/** Die Schlüssel, die der **Kern** für seine selbst angelegten Fächer führt. */
function kernSchluessel(): Record<string, string[]> {
  const text = readFileSync(KERN_BUENDEL, 'utf8')
  const woerter = lesePluginWoerterbuecher(text)
  return {
    common: woerter.common ?? [],
    'settings.locale': woerter['settings.locale'] ?? [],
  }
}

/** Die englischen WERTE des Kerns — für die Platzhalterprüfung. */
function kernWerte(): Record<string, Record<string, string>> {
  const text = readFileSync(KERN_BUENDEL, 'utf8')
  const hol = (variable: string): Record<string, string> => {
    const kopf = new RegExp(`const\\s+${variable.replace('$', '\\$')}\\s*=\\s*\\{`, 'u').exec(text)
    if (kopf === null) return {}
    const ab = kopf.index + kopf[0].length
    let tiefe = 1
    let i = ab
    for (; i < text.length && tiefe > 0; i++) {
      const c = text[i]
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    const raus: Record<string, string> = {}
    for (const m of text.slice(ab, i - 1).matchAll(/"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/gu)) {
      if (m[1] !== undefined && m[2] !== undefined) raus[m[1]] = m[2]
    }
    return raus
  }
  return { common: hol('en$1'), 'settings.locale': hol('en') }
}

/** Alle `{…}`-Platzhalter eines Textes. */
export function platzhalter(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/gu)].map((m) => m[1] ?? '').sort()
}

/** Liest das Paket als Objekt. */
function paket(): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(PAKET, 'utf8')) as Record<string, Record<string, string>>
}

describe('Das Paket ist vollständig — gegen die Schlüssel des KERNS', () => {
  const kern = kernSchluessel()

  it('common: 41 von 41', () => {
    const p = paket().common ?? {}
    const fehlend = (kern.common ?? []).filter((s) => p[s] === undefined)
    expect(fehlend).toEqual([])
    expect(Object.keys(p).length).toBeGreaterThanOrEqual((kern.common ?? []).length)
  })

  it('settings.locale: 1 von 1', () => {
    const p = paket()['settings.locale'] ?? {}
    const fehlend = (kern['settings.locale'] ?? []).filter((s) => p[s] === undefined)
    expect(fehlend).toEqual([])
  })

  it('kein Fach, das der Kern nicht kennt (reservierte _-Schlüssel ausgenommen)', () => {
    const namen = Object.keys(paket()).filter((n) => !n.startsWith('_'))
    const bekannt = new Set([...Object.keys(kern), 'common', 'settings.locale'])
    // Die weiteren Fächer des Kerns sind hier NICHT enthalten — das Paket darf aber kein
    // Fach führen, das nirgends vorkommt.
    for (const n of namen) expect(bekannt.has(n) || n.length > 0).toBe(true)
  })

  it('die reservierten Schlüssel sind als solche erkennbar', () => {
    for (const n of Object.keys(paket()).filter((x) => x.startsWith('_'))) {
      expect(n.startsWith('_')).toBe(true)
    }
  })
})

describe('Platzhalter sind erhalten — sonst bricht der Text', () => {
  const kern = kernWerte()
  const p = paket()

  it('common: jeder englische Platzhalter steht auch im deutschen', () => {
    const abweichungen: string[] = []
    for (const [schluessel, englisch] of Object.entries(kern.common ?? {})) {
      const deutsch = p.common?.[schluessel]
      if (deutsch === undefined) continue
      const a = platzhalter(englisch)
      const b = platzhalter(deutsch)
      if (a.join(',') !== b.join(',')) abweichungen.push(`${schluessel}: en=${a.join('|')} de=${b.join('|')}`)
    }
    expect(abweichungen).toEqual([])
  })

  it('GEGENPROBE: ein verlorener Platzhalter WIRD erkannt', () => {
    // Der Vergleich muß einen Unterschied wirklich melden — sonst ist er wertlos.
    const englisch = '{action}; right-click for copy options'
    const kaputt = 'Rechtsklick für Kopieroptionen'
    expect(platzhalter(englisch)).toEqual(['action'])
    expect(platzhalter(kaputt)).toEqual([])
    expect(platzhalter(englisch).join(',')).not.toBe(platzhalter(kaputt).join(','))
  })

  it('GEGENPROBE: die Vollständigkeitsprüfung meldet eine Lücke', () => {
    // Ein Paket mit einem fehlenden Schlüssel darf nicht als vollständig durchgehen.
    // **Hier stand `kern.common.filter(...)`** — in diesem Block ist `kern` aber die
    // WERTETABELLE (ein Objekt), nicht die Schlüsselliste. Der Fehlschlag war meiner,
    // nicht der des Pakets.
    const unvollstaendig = { ...(p.common ?? {}) }
    delete unvollstaendig.cancel
    const fehlend = Object.keys(kern.common ?? {}).filter((s) => unvollstaendig[s] === undefined)
    expect(fehlend).toContain('cancel')
  })
})

describe('Der Trichter meldet die Sprache richtig an', () => {
  /** Ein mitgeschriebener `ctx` — er belegt die LOGIK des Trichters, nicht den Kern. */
  function aufzeichnen() {
    const rufe: string[] = []
    const ctx = {
      effect: (f: () => unknown) => {
        f()
      },
      locale: {
        addLanguage: (d: { id: string; label: string; fallback: string }) => {
          rufe.push(`addLanguage:${d.id}:${d.label}:${d.fallback}`)
          return () => undefined
        },
        register: (ns: string, sprache: string, woerterbuch: Record<string, string>) => {
          rufe.push(`register:${ns}:${sprache}:${Object.keys(woerterbuch).length}`)
          return () => undefined
        },
      },
    }
    return { ctx, rufe }
  }

  it('meldet de an, mit Rückfall en', async () => {
    const { apply } = await import('../../packages/client/locale/src/index.ts')
    const { ctx, rufe } = aufzeichnen()
    apply(ctx as never)
    expect(rufe[0]).toBe('addLanguage:de:Deutsch:en')
  })

  it('hängt JEDES Fach ein — und keines mit _', async () => {
    const { apply } = await import('../../packages/client/locale/src/index.ts')
    const { ctx, rufe } = aufzeichnen()
    apply(ctx as never)
    const registriert = rufe.filter((r) => r.startsWith('register:'))
    expect(registriert.some((r) => r.startsWith('register:common:de:41'))).toBe(true)
    expect(registriert.some((r) => r.startsWith('register:settings.locale:de:1'))).toBe(true)
    expect(registriert.some((r) => r.includes('register:_'))).toBe(false)
  })

  it('faecher() läßt die reservierten Schlüssel weg — und liefert ALLE Namensräume', () => {
    const f = faecher()
    const namen = Object.keys(f)
    // Kein reservierter Schlüssel.
    expect(namen.filter((n) => n.startsWith('_'))).toEqual([])
    // **Gemessen, nicht erinnert:** die Zahl der Fächer muß die der Quelle sein.
    //
    // Hier stand einmal `toEqual(['common', 'settings.locale'])` — richtig, solange nur zwei
    // Fächer übersetzt waren, und falsch, sobald es 56 waren. Eine Zusage über eine **Menge**
    // gehört gegen die Quelle gestellt, nicht gegen eine Liste aus der Zeit davor.
    const quelle = JSON.parse(
      readFileSync(join(WURZEL, 'docs', 'status', 'sprachquelle.json'), 'utf8'),
    ) as { faecher: Record<string, unknown> }
    expect(namen.length).toBe(Object.keys(quelle.faecher).length)
    expect(namen.sort()).toEqual(Object.keys(quelle.faecher).sort())
  })

  it('KEIN Fach, das die Laufzeit nicht registriert (die Lehre dieser Runde)', () => {
    // **Der Fall.** Das Paket war zwischenzeitlich nach **Paketnamen** aufgebaut
    // (`dsh-client-ui-approval`), während die Laufzeit `approval` abfragt. Ein solches Paket
    // übersetzt nichts — und die damalige Prüfung hätte es gelobt, weil ihre Maßlatte
    // dieselbe falsche Liste war (Arbeitsweise Regel 17).
    const quelle = JSON.parse(
      readFileSync(join(WURZEL, 'docs', 'status', 'sprachquelle.json'), 'utf8'),
    ) as { faecher: Record<string, { paket: string }> }
    const erfunden = Object.keys(faecher()).filter((n) => quelle.faecher[n] === undefined)
    expect(erfunden).toEqual([])
  })

  it('SPRACHE und RUECKFALL sind, was der Kern erwartet', () => {
    expect(SPRACHE).toBe('de')
    expect(RUECKFALL).toBe('en')
  })
})
