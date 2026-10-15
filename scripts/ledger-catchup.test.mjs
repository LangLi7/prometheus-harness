/**
 * `scripts/ledger-nachziehen.mjs` — die Prüfung, und sie deckt **beide Formen** ab.
 *
 * ## Warum die Formen der ganze Punkt sind
 *
 * Drei Runden lang bin ich an der **Form** des Ledgers gescheitert: die Wurzel ist
 * ein **Array**, `local_checks` ein **einelementiges Array** (das PowerShell wie ein
 * Objekt aussehen läßt). Jede Prüfung hier fährt deshalb **beide** Formen — sonst
 * deckt sie genau den Fall nicht ab, der eingetreten ist.
 *
 * **Und der wichtigste Fall ist der Trockenlauf gegen einen ECHTEN Baum:** die
 * Prüfung legt einen Wegwerf-Ledger an, fährt `--anwenden` darauf, und liest
 * **danach die Datei**. Damit ist der ganze Weg geprüft — ohne den Ledger der
 * Aufsicht anzufassen.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { B_S1_KENNUNG, alsEinheiten, fuehreAus, lcVon, zieheNach } from './ledger-nachziehen.mjs'

const HEUTE = { fassungBetrieb: 5, tabellen: 12, zusammengesetzteFk: 4, policies: 0 }

/** Ein Einheit-Objekt, wie es der echte Ledger hat. */
function einheit(id, lc) {
  const e = { coverage_id: id, attack_class: 'test', wave: 1, status: 'planned' }
  if (lc !== undefined) e.local_checks = lc
  return e
}

/** Der B-S1-Block — in der Form, die die Prüfung fahren soll. */
function bS1Block() {
  return { agent_id: B_S1_KENNUNG, result: 'Quelltext-Beleg: die Migrationen legen ausschliesslich Fremdschluessel ohne Eigentuemerbezug an' }
}

describe('Die FORM erkennen — der Fehler, der drei Runden gekostet hat', () => {
  test('die Wurzel ist ein ARRAY', () => {
    const { einheiten, form } = alsEinheiten([einheit('a'), einheit('b')])
    expect(einheiten).toHaveLength(2)
    expect(form).toContain('Array')
  })

  test('ein Objekt mit `units` wird ebenfalls angenommen', () => {
    expect(alsEinheiten({ units: [einheit('a')] }).einheiten).toHaveLength(1)
  })

  test('eine unbekannte Form gibt KEINE Einheiten — und das wird gemeldet', () => {
    // **Kein stilles Nichts.** Wer „0 Einheiten" zurückgibt, ohne die Form zu
    // nennen, baut denselben Fehler wieder ein.
    const { einheiten, form } = alsEinheiten({ irgendwas: 1 })
    expect(einheiten).toHaveLength(0)
    expect(form).toBe('UNBEKANNT')
  })

  test('lcVon nimmt OBJEKT und EINELEMENTIGES ARRAY', () => {
    // **Der Kern.** PowerShell zeigt ein einelementiges Array wie ein Objekt —
    // deshalb darf der Code sich nicht auf eine der beiden Formen verlassen.
    expect(lcVon({ local_checks: bS1Block() })?.agent_id).toBe(B_S1_KENNUNG)
    expect(lcVon({ local_checks: [bS1Block()] })?.agent_id).toBe(B_S1_KENNUNG)
    expect(lcVon({})).toBeUndefined()
    expect(lcVon({ local_checks: 'text' })).toBeUndefined()
    expect(lcVon(null)).toBeUndefined()
  })
})

describe('Nachziehen — beide Formen, gleiches Ergebnis', () => {
  for (const form of ['Objekt', 'einelementiges Array']) {
    test(`B-S1 wird berichtigt (${form}) — und NUR B-S1`, () => {
      const a = einheit('a.ts', form === 'Objekt' ? bS1Block() : [bS1Block()])
      const b = einheit('b.ts', { agent_id: 'irgendwas', result: 'unberuehrt' })
      const c = einheit('c.ts')
      const { einheiten, aenderungen } = zieheNach([a, b, c], HEUTE)

      expect(aenderungen.join(' ')).toContain('B-S1 berichtigt')
      expect(lcVon(einheiten[0])?.result).toStartWith('NACHGEZOGEN 14.10.2026')
      expect(lcVon(einheiten[0])?.nachgezogen_am).toBe('2026-10-14')
      // **Die anderen bleiben unberührt** — genau das war der Fehler (apps/cli).
      expect(lcVon(einheiten[1])?.result).toBe('unberuehrt')
      expect(einheiten[2].local_checks).toBeUndefined()
      // Und die Form bleibt erhalten.
      expect(Array.isArray(einheiten[0].local_checks)).toBe(form !== 'Objekt')
    })
  }

  test('ein ZWEITER Lauf ändert nichts mehr (wiederholbar)', () => {
    const a = [einheit('a.ts', [bS1Block()])]
    const einmal = zieheNach(a, HEUTE)
    const zweimal = zieheNach(einmal.einheiten, HEUTE)
    expect(zweimal.aenderungen.join(' ')).toContain('bereits berichtigt')
    expect(JSON.stringify(zweimal.einheiten)).toBe(JSON.stringify(einmal.einheiten))
  })

  test('fehlt der Träger, wird das GESAGT', () => {
    const { aenderungen } = zieheNach([einheit('a.ts', { agent_id: 'x' })], HEUTE)
    expect(aenderungen.join(' ')).toContain('NICHT berichtigt')
  })

  test('der Nachzieh-Block nennt die neuen Tabellengruppen und die DB-Warnung', () => {
    const { nachziehen } = zieheNach([einheit('a.ts', [bS1Block()])], HEUTE)
    expect(nachziehen.neue_migrationen).toHaveLength(4)
    expect(nachziehen.neue_tabellengruppen).toHaveLength(2)
    expect(nachziehen.neue_angriffsflaechen).toHaveLength(5)
    expect(nachziehen.offene_entscheidungen).toHaveLength(6)
    expect(nachziehen.ACHTUNG).toContain('schema-stand')
    // **Und die 61 Einheiten werden nicht umgeschrieben** — steht ausdrücklich drin.
    expect(nachziehen.nicht_getan).toContain('NICHT umgeschrieben')
  })
})

describe('Der ganze Weg — an einem Wegwerf-Ledger', () => {
  test('Trockenlauf schreibt nichts, --anwenden schreibt und bestätigt', () => {
    // **Der Test, der den echten Ledger NICHT anfaßt.** Ein Wegwerf-Baum mit
    // derselben Struktur; danach wird die Datei gelesen — der Beweis ist die
    // Datei, nicht die Meldung.
    const dir = mkdtempSync(join(tmpdir(), 'pmh-ledger-'))
    const unter = join(dir, '.pmh-build', 'security-audit', 'run-1')
    mkdirSync(unter, { recursive: true })
    const ledgerPfad = join(unter, 'coverage-ledger.json')
    const blockPfad = join(unter, 'NACHZIEHEN.json')
    writeFileSync(ledgerPfad, JSON.stringify([einheit('a.ts', [bS1Block()]), einheit('b.ts', { agent_id: 'y' })]), 'utf8')
    const vorher = readFileSync(ledgerPfad, 'utf8')
    try {
      // 1. Trockenlauf: Exit 0, Datei UNVERÄNDERT.
      const aus1 = []
      expect(fuehreAus(['pruefen'], { PMH_VERZEICHNIS: dir }, (t) => aus1.push(t))).toBe(0)
      expect(aus1.join('')).toContain('TROCKENLAUF')
      expect(readFileSync(ledgerPfad, 'utf8')).toBe(vorher)
      expect(existsSync(blockPfad)).toBe(false)

      // 2. Anwenden: Exit 0, Datei geändert, Block da — und alles NACHGELESEN.
      const aus2 = []
      const code = fuehreAus(
        ['pruefen', '--anwenden'],
        { PMH_VERZEICHNIS: dir, PMH_FASSUNG_BETRIEB: '5', PMH_TABELLEN: '12', PMH_ZUSAMMENGESETZTE_FK: '4', PMH_POLICIES: '0' },
        (t) => aus2.push(t),
      )
      const text2 = aus2.join('')
      expect(code).toBe(0)
      expect(text2).toContain('NACHGELESEN')
      expect(text2).toContain('B-S1 berichtigt                  JA')
      expect(text2).toContain('BESTÄTIGT')

      // 3. Die DATEI ist der Beweis, nicht die Meldung.
      const danach = JSON.parse(readFileSync(ledgerPfad, 'utf8'))
      expect(Array.isArray(danach)).toBe(true)
      expect(danach).toHaveLength(2)
      expect(lcVon(danach[0])?.result).toStartWith('NACHGEZOGEN')
      expect(lcVon(danach[1])?.result).toBeUndefined()
      const block = JSON.parse(readFileSync(blockPfad, 'utf8'))
      expect(block.am).toBe('2026-10-14')
      expect(block.neue_migrationen).toHaveLength(4)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('ein unlesbarer Ledger gibt Exit 2, keinen Absturz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmh-ledger-'))
    try {
      const aus = []
      expect(fuehreAus(['pruefen'], { PMH_VERZEICHNIS: dir }, (t) => aus.push(t))).toBe(2)
      expect(aus.join('')).toContain('laesst sich nicht lesen')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
