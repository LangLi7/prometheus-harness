/**
 * Prüfung des Sprachtrichters `scripts/language-funnel.mjs`.
 *
 * ## Warum die Gegenprobe hier das Wichtigste ist
 *
 * Der Trichter meldet „Selbstprüfung: grün", wenn `en` und `zh` je Fach dieselbe
 * Schlüsselmenge tragen. Ein solcher Satz ist **wertlos**, wenn er auch bei einer kaputten
 * Extraktion grün bliebe. Diese Datei legt deshalb Wörterbücher vor, die **absichtlich**
 * abweichen — und verlangt, daß der Trichter das **meldet**.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findeSprachdateien,
  lesePluginWoerterbuecher,
  leseSchluessel,
  pruefeWoerterbuchPaarung,
} from '../language-funnel.mjs'

describe('leseSchluessel — beide Formen', () => {
  it('Form A: das Wörterbuch als Objekttyp', () => {
    const text = [
      'export declare const NS = "conversation";',
      'export declare const zh: {',
      "    'shortcut.newline': string;",
      "    'hint.plan': string;",
      '};',
      'export type ConversationKey = keyof typeof zh;',
    ].join('\n')
    const { namespace, schluessel, form } = leseSchluessel(text)
    expect(namespace).toBe('conversation')
    expect(form).toBe('objekt')
    expect(schluessel.sort()).toEqual(['hint.plan', 'shortcut.newline'])
  })

  it('Form B: die Union', () => {
    const text = [
      "export type AgentPresetSettingsKey = 'builtInGroup' | 'customGroup' | 'seatHint'",
      'export declare const en: Record<AgentPresetSettingsKey, string>',
    ].join('\n')
    const { schluessel, form } = leseSchluessel(text)
    expect(form).toBe('union')
    expect(schluessel.sort()).toEqual(['builtInGroup', 'customGroup', 'seatHint'])
  })

  it('ohne erkennbare Form kommt NICHTS heraus — nicht irgendetwas', () => {
    const { schluessel, form } = leseSchluessel('export declare const x: number;')
    expect(form).toBe('keine')
    expect(schluessel).toEqual([])
  })

  it('verschachtelte Schlüssel zählen als EIN Schlüssel — die Untergrenze', () => {
    const text = ['export declare const NS = "x";', 'export declare const zh: {', '    a: { b: string; };', '};'].join('\n')
    const { schluessel } = leseSchluessel(text)
    expect(schluessel).toEqual(['a'])
  })
})

describe('Die Selbstprüfung: en und zh MÜSSEN gleich sein', () => {
  const gleich = [
    'const en$1 = {',
    '  "ok": "OK",',
    '  "cancel": "Cancel"',
    '};',
    'const zh$1 = {',
    '  "ok": "确定",',
    '  "cancel": "取消"',
    '};',
  ].join('\n')

  it('gleiche Schlüssel -> keine Abweichung', () => {
    expect(pruefeWoerterbuchPaarung(gleich)).toEqual([])
  })

  it('GEGENPROBE: ein Schlüssel nur in en MUSS gemeldet werden', () => {
    const schief = [
      'const en$1 = {',
      '  "ok": "OK",',
      '  "extra": "Extra"',
      '};',
      'const zh$1 = {',
      '  "ok": "确定"',
      '};',
    ].join('\n')
    const befund = pruefeWoerterbuchPaarung(schief)
    expect(befund).toHaveLength(1)
    expect(befund[0]?.fach).toBe('common')
    expect(befund[0]?.nurEn).toBe(1)
    expect(befund[0]?.nurZh).toBe(0)
  })

  it('GEGENPROBE: ein Schlüssel nur in zh MUSS gemeldet werden', () => {
    const schief = [
      'const en$1 = {',
      '  "ok": "OK"',
      '};',
      'const zh$1 = {',
      '  "ok": "确定",',
      '  "nurzh": "只此"',
      '};',
    ].join('\n')
    const befund = pruefeWoerterbuchPaarung(schief)
    expect(befund).toHaveLength(1)
    expect(befund[0]?.nurZh).toBe(1)
  })

  it('fehlt ein Wörterbuch, wird NICHT gemeldet (nichts zu vergleichen)', () => {
    expect(pruefeWoerterbuchPaarung('const en$1 = { "ok": "OK" };')).toEqual([])
  })
})

describe('Die Wörterbücher des Sprach-Plugins', () => {
  it('findet common und settings.locale', () => {
    const text = [
      'const en$1 = {',
      '  "ok": "OK",',
      '  "cancel": "Cancel"',
      '};',
      'const zh$1 = {',
      '  "ok": "确定",',
      '  "cancel": "取消"',
      '};',
      'const en = {',
      '  "language.title": "Language"',
      '};',
      'const zh = {',
      '  "language.title": "语言"',
      '};',
    ].join('\n')
    const woerter = lesePluginWoerterbuecher(text)
    expect(woerter.common?.sort()).toEqual(['cancel', 'ok'])
    expect(woerter['settings.locale']).toEqual(['language.title'])
  })

  it('liest auch einen Wert über MEHRERE Zeilen — der Fehler, der 14 statt 41 fand', () => {
    // Der Wert von `lang` läuft über zwei Zeilen. Ein Muster wie /"([^"]+)":\s*"([^"]*)"/
    // findet ihn nicht — die Klammerntiefe-Zählung schon.
    const text = ['const en$1 = {', '  "ok": "OK",', '  "lang": "eine lange', '     Beschreibung"', '};'].join('\n')
    const woerter = lesePluginWoerterbuecher(text)
    expect(woerter.common?.sort()).toEqual(['lang', 'ok'])
  })
})

describe('findeSprachdateien', () => {
  it('findet locales.d.ts und *-locales.d.ts, aber nichts anderes', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-trichter-'))
    try {
      writeFileSync(join(ordner, 'locales.d.ts'), 'x', 'utf8')
      writeFileSync(join(ordner, 'guide-locales.d.ts'), 'x', 'utf8')
      writeFileSync(join(ordner, 'andere.d.ts'), 'x', 'utf8')
      writeFileSync(join(ordner, 'locales.js'), 'x', 'utf8')
      const gefunden = findeSprachdateien(ordner).map((p) => p.split(/[\\/]/u).pop()).sort()
      expect(gefunden).toEqual(['guide-locales.d.ts', 'locales.d.ts'])
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})
