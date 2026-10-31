/**
 * Prüfungen des Prüfbaus — und des Tors, das er schließt.
 *
 * **Der Satz, um den es geht:** *bauen und prüfen frei, umschalten nur mit
 * Freigabe.* Ohne dieses Tor ist der Rückweg blind — eine ungeprüfte Generation
 * ist von einer geprüften nicht zu unterscheiden, und `rollback` rollt auf etwas
 * zurück, von dem niemand weiß, ob es trug.
 *
 * Zwei Arten von Prüfungen stehen hier nebeneinander, und die Trennung ist
 * Absicht:
 *
 *  - **mit einer Attrappe** (austauschbare Ausführung): das Verhalten des
 *    Prüfbaus und des Tors, ohne von einer echten Kommandozeile abzuhängen;
 *  - **mit echten Prozessen**: daß die Ausführung selbst trägt — Datei-Ausgabe,
 *    Exit-Code, Frist. Ohne diese zweite Art wäre „der Prüfbau läuft" nur eine
 *    Aussage über die Attrappe.
 */

import { afterEach, describe, expect, test } from 'bun:test'

import type { DeclaredCheck } from '../src/declaration.ts'
import { fingerabdruck, layoutFor, leseGeneration } from '../src/generation.ts'
import { baue, pruefeGeneration, schalte } from '../src/operations.ts'
import { STANDARD_AUSFUEHRUNG, fuehrePruefbauAus, type Schrittauffuehrung } from '../src/pruefbau.ts'
import { baueProjekt, type TestProjekt } from './fixtures.ts'

let offen: TestProjekt[] = []

afterEach(async () => {
  for (const projekt of offen) await projekt.aufraeumen()
  offen = []
})

async function projekt(optionen: Parameters<typeof baueProjekt>[1] = {}): Promise<TestProjekt> {
  const gebaut = await baueProjekt([{ name: 'a' }], optionen)
  offen.push(gebaut)
  return gebaut
}

function check(name: string, ueberschreiben: Partial<DeclaredCheck> = {}): DeclaredCheck {
  return {
    name,
    command: 'bun',
    args: ['run', name],
    timeoutMs: 5_000,
    required: true,
    ...ueberschreiben,
  }
}

/** Eine Ausführung, die je Name ein Ergebnis liefert. */
function attrappe(ergebnisse: Readonly<Record<string, { exitCode: number; ausgabe?: string; frist?: boolean }>>): Schrittauffuehrung {
  return async (schritt) => {
    const ergebnis = ergebnisse[schritt.name] ?? { exitCode: 0 }
    return {
      exitCode: ergebnis.exitCode,
      ausgabe: ergebnis.ausgabe ?? '',
      ...(ergebnis.frist === true ? { frist: true } : {}),
    }
  }
}

describe('Prüfbau — Verhalten', () => {
  test('alle verbindlichen Schritte grün ergibt grün', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus([check('typen'), check('tests')], p.root, {
      ausfuehren: attrappe({ typen: { exitCode: 0 }, tests: { exitCode: 0 } }),
    })
    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.schritte.map((schritt) => schritt.name)).toEqual(['typen', 'tests'])
    expect(ergebnis.grund).toBe('')
  })

  test('ein roter verbindlicher Schritt sperrt und wird namentlich genannt', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus([check('typen'), check('tests')], p.root, {
      ausfuehren: attrappe({ typen: { exitCode: 0 }, tests: { exitCode: 2, ausgabe: '3 Prüfungen rot' } }),
    })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.grund).toContain('tests')
    expect(ergebnis.grund).toContain('Exit 2')
    expect(ergebnis.schritte[1]?.ausgabe).toContain('3 Prüfungen rot')
  })

  test('ein roter UNVERBINDLICHER Schritt sperrt nicht, steht aber im Ergebnis', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus([check('typen'), check('lint', { required: false })], p.root, {
      ausfuehren: attrappe({ typen: { exitCode: 0 }, lint: { exitCode: 1 } }),
    })
    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.schritte[1]?.ok).toBe(false)
    expect(ergebnis.schritte[1]?.required).toBe(false)
  })

  test('eine überschrittene Frist ist ein Fehlschlag, kein Hänger', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus([check('langsam')], p.root, {
      ausfuehren: attrappe({ langsam: { exitCode: 0, frist: true } }),
    })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.schritte[0]?.frist).toBe(true)
    expect(ergebnis.grund).toContain('Frist')
  })

  test('eine leere Prüfliste ist NICHT grün — „nichts geprüft" ist keine Freigabe', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus([], p.root)
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.grund).toContain('keine Prüfschritte')
  })
})

describe('Prüfbau — echte Prozesse', () => {
  test('die Ausgabe kommt über eine Datei an, und der Exit-Code ist der des Kindes', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus(
      [check('ausgabe', { command: process.execPath, args: ['-e', 'console.log("kind-sagt-hallo")'] })],
      p.root,
      { ausfuehren: STANDARD_AUSFUEHRUNG },
    )
    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.schritte[0]?.ausgabe).toContain('kind-sagt-hallo')
    expect(ergebnis.schritte[0]?.exitCode).toBe(0)
  })

  test('ein Exit-Code ungleich 0 wird gemeldet, nicht verschluckt', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus(
      [check('fehler', { command: process.execPath, args: ['-e', 'console.error("absichtlich"); process.exit(3)'] })],
      p.root,
      { ausfuehren: STANDARD_AUSFUEHRUNG },
    )
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.schritte[0]?.exitCode).toBe(3)
    expect(ergebnis.schritte[0]?.ausgabe).toContain('absichtlich')
  })

  test('ein fehlendes Programm ist ein Befund und kein Absturz', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus(
      [check('gibtsnicht', { command: 'dieses-programm-gibt-es-nicht-xyz', args: [] })],
      p.root,
      { ausfuehren: STANDARD_AUSFUEHRUNG },
    )
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.schritte[0]?.exitCode).toBe(-1)
  })

  test('die Frist beendet einen hängenden Schritt', async () => {
    const p = await projekt()
    const ergebnis = await fuehrePruefbauAus(
      [check('haengt', { command: process.execPath, args: ['-e', 'setTimeout(() => {}, 20000)'], timeoutMs: 250 })],
      p.root,
      { ausfuehren: STANDARD_AUSFUEHRUNG },
    )
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.schritte[0]?.frist).toBe(true)
  })
})

describe('Das Tor — kein Wechsel ohne grünen Prüfbau', () => {
  const mitTor = {
    declaration: {
      format: 1,
      core: { version: '0.2.1-alpha.2', contract: '^0.2.0' },
      roots: ['units'],
      units: [{ name: 'a' }],
      checks: [{ name: 'typen', command: 'bun', args: ['run', 'typen'] }],
    },
  }

  test('eine nie geprüfte Generation läßt sich nicht schalten', async () => {
    const p = await projekt(mitTor)
    const gebaut = await baue({ projectRoot: p.root })
    expect(gebaut.generation?.requireCheck).toBe(true)
    expect(gebaut.generation?.pruefung).toBeUndefined()

    const versuch = await schalte({ projectRoot: p.root, art: 'switch' })
    expect(versuch.ok).toBe(false)
    expect(versuch.befunde.map((befund) => befund.code)).toContain('generation_check_missing')
    // Und der Zeiger bleibt, wo er ist.
    const { leseZeiger } = await import('../src/generation.ts')
    expect(await leseZeiger(layoutFor(p.root), 'current')).toBeUndefined()
  })

  test('nach grünem Prüfbau läßt sie sich schalten', async () => {
    const p = await projekt(mitTor)
    const gebaut = await baue({ projectRoot: p.root, mitPruefung: true, ausfuehren: attrappe({ typen: { exitCode: 0 } }) })
    expect(gebaut.pruefung?.ok).toBe(true)
    expect(gebaut.generation?.pruefung?.ok).toBe(true)

    const umgeschaltet = await schalte({ projectRoot: p.root, art: 'switch' })
    expect(umgeschaltet.ok).toBe(true)
  })

  test('ein roter Prüfbau sperrt den Wechsel und nennt den Grund', async () => {
    const p = await projekt(mitTor)
    await baue({ projectRoot: p.root, mitPruefung: true, ausfuehren: attrappe({ typen: { exitCode: 2, ausgabe: 'Typfehler' } }) })

    const versuch = await schalte({ projectRoot: p.root, art: 'switch' })
    expect(versuch.ok).toBe(false)
    expect(versuch.befunde.map((befund) => befund.code)).toContain('generation_check_failed')
    expect(versuch.befunde[0]?.message).toContain('rot')
  })

  test('--freigabe nimmt das Risiko ausdrücklich auf sich', async () => {
    const p = await projekt(mitTor)
    await baue({ projectRoot: p.root })
    const versuch = await schalte({ projectRoot: p.root, art: 'switch', freigabe: true })
    expect(versuch.ok).toBe(true)
  })

  test('der Prüfbau wird in der Generation abgelegt, ohne den Fingerabdruck zu ändern', async () => {
    const p = await projekt(mitTor)
    const gebaut = await baue({ projectRoot: p.root })
    const abdruckVorher = gebaut.generation?.fingerprint

    const geprueft = await pruefeGeneration({ projectRoot: p.root, ausfuehren: attrappe({ typen: { exitCode: 0 } }) })
    expect(geprueft.ok).toBe(true)
    expect(geprueft.generation?.fingerprint).toBe(abdruckVorher ?? '')
    expect(geprueft.generation?.pruefung?.ok).toBe(true)

    // Und es steht wirklich auf der Platte, nicht nur in der Antwort.
    const vonPlatte = await leseGeneration(layoutFor(p.root), 1)
    expect(vonPlatte.pruefung?.ok).toBe(true)
  })

  test('eine andere Prüfliste ist eine andere Generation', async () => {
    const p = await projekt(mitTor)
    const erste = await baue({ projectRoot: p.root })

    // Nur die Prüfliste ändert sich — der Bestand bleibt gleich.
    const { schreibe } = await import('./fixtures.ts')
    await schreibe(p.root, 'harness/units.json', `${JSON.stringify({
      format: 1,
      core: { version: '0.2.1-alpha.2', contract: '^0.2.0' },
      roots: ['units'],
      units: [{ name: 'a' }],
      checks: [{ name: 'typen', command: 'bun', args: ['run', 'typen'] }, { name: 'tests', command: 'bun', args: ['test'] }],
    }, null, 2)}\n`)
    const zweite = await baue({ projectRoot: p.root })

    expect(zweite.generation?.fingerprint).not.toBe(erste.generation?.fingerprint)
    expect(zweite.generation?.checks).toHaveLength(2)
  })

  test('eine Generation OHNE das Feld (gebaut vor dem Tor) umgeht es nicht', async () => {
    const p = await projekt()
    const gebaut = await baue({ projectRoot: p.root })
    // Den Zustand von vor der Einführung nachstellen: Feld entfernen.
    const { layoutFor, leseGeneration, schreibeGeneration } = await import('../src/generation.ts')
    const layout = layoutFor(p.root)
    const alt = await leseGeneration(layout, 1)
    const ohneFeld = { ...alt } as Record<string, unknown>
    delete ohneFeld['requireCheck']
    delete ohneFeld['checks']
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await writeFile(join(layout.generationsDir, '000001', 'generation.json'), `${JSON.stringify(ohneFeld, null, 2)}\n`, 'utf8')
    void gebaut
    void schreibeGeneration

    // Die Generation gilt jetzt als „Tor scharf, nie geprüft" — nicht als „Tor aus".
    const versuch = await schalte({ projectRoot: p.root, art: 'switch' })
    expect(versuch.ok).toBe(false)
    expect(versuch.befunde.map((befund) => befund.code)).toContain('generation_check_missing')
  })

  test('ohne Tor (`requireCheck: false`) bleibt der Wechsel frei — und der Fingerabdruck sagt es', async () => {
    const p = await projekt()
    const gebaut = await baue({ projectRoot: p.root })
    expect(gebaut.generation?.requireCheck).toBe(false)
    const versuch = await schalte({ projectRoot: p.root, art: 'switch' })
    expect(versuch.ok).toBe(true)

    // Der Unterschied steht im Fingerabdruck — zwei Generationen mit gleichem
    // Inhalt, aber verschiedener Richtlinie, sind nicht dieselbe Generation.
    const ohne = fingerabdruck({ ...(gebaut.generation ?? ({} as never)), requireCheck: true })
    expect(ohne).not.toBe(gebaut.generation?.fingerprint)
  })
})
