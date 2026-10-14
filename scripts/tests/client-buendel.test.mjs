/**
 * Test des Bündelbaus — **die Prüfung muß rot werden können**.
 *
 * Arbeitsweise Regel 5. Die Prüfung in `scripts/client-buendel.mjs` urteilt über das
 * **gebaute** Bündel. Hier wird gezeigt, daß sie bei jedem der Fehler, die sie behauptet zu
 * finden, auch wirklich anschlägt — und daß sie beim echten Bündel schweigt.
 *
 * ```powershell
 * bun test scripts/tests/client-buendel.test.mjs
 * ```
 *
 * @module scripts/tests/client-buendel.test
 */

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { paketFuer, pruefeBuendel, umschliesse } from '../client-buendel.mjs'

/** Der Eintrag der Tabelle für das Sprachpaket — die Prüfung braucht die Art. */
const SPRACHPaket = paketFuer('packages/client/locale')
/** Und der für das Kontrast-Plugin. */
const STILPaket = paketFuer('packages/client/select-contrast')

const ZIEL = 'packages/client/locale/lib/client.js'
/** Das Bündel des Kontrast-Plugins. */
const STIL_ZIEL = 'packages/client/select-contrast/lib/client.js'
const quelle = JSON.parse(readFileSync('docs/status/sprachquelle.json', 'utf8'))
const erwartet = {
  namensraeume: Object.keys(quelle.faecher).length,
  texte: Object.values(quelle.faecher).reduce((s, f) => s + Object.keys(f.englisch).length, 0),
}

/** Ein kleines, absichtlich unvollständiges Plugin als Bündeltext. */
function baue(rumpf) {
  return umschliesse(rumpf)
}

describe('Bündelprüfung', () => {
  test('das echte Bündel ist fehlerfrei', () => {
    if (!existsSync(ZIEL)) throw new Error(`${ZIEL} fehlt — erst \`bun scripts/client-buendel.mjs\` laufen lassen.`)
    const { fehler } = pruefeBuendel(readFileSync(ZIEL, 'utf8'), SPRACHPaket, erwartet)
    expect(fehler).toEqual([])
  })

  test('ohne Umschlag wird es gemeldet', () => {
    const { fehler } = pruefeBuendel('var x = 1;\n', SPRACHPaket, erwartet)
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('__ModuleLoader__')
  })

  test('ohne `inject` wird es gemeldet', () => {
    const text = baue(`
var module = { exports: {} };
var exports = module.exports;
function apply() {}
exports.apply = apply;
`)
    const { fehler } = pruefeBuendel(text, SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('`inject`'))).toBe(true)
  })

  test('mit falschem Dienst in `inject` wird es gemeldet', () => {
    const text = baue(`
var module = { exports: {} };
var exports = module.exports;
function apply() {}
exports.apply = apply;
exports.inject = ["slots"];
`)
    const { fehler } = pruefeBuendel(text, SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('`locale` fehlt'))).toBe(true)
  })

  test('ohne `apply` wird es gemeldet', () => {
    const text = baue(`
var module = { exports: {} };
var exports = module.exports;
exports.inject = ["locale"];
`)
    const { fehler } = pruefeBuendel(text, SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('fehlt `apply`'))).toBe(true)
  })

  test('falscher Rückfall wird gemeldet — die Kette muß bei `en` enden', () => {
    const text = baue(`
var module = { exports: {} };
var exports = module.exports;
function apply(ctx) { ctx.locale.addLanguage({ id: "de", label: "Deutsch", fallback: "zh" }); }
exports.apply = apply;
exports.inject = ["locale"];
`)
    const { fehler } = pruefeBuendel(text, SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('Rückfall'))).toBe(true)
  })

  test('zu wenige Namensräume werden gemeldet', () => {
    const text = baue(`
var module = { exports: {} };
var exports = module.exports;
function apply(ctx) {
  ctx.locale.addLanguage({ id: "de", label: "Deutsch", fallback: "en" });
  ctx.locale.register("common", "de", { ok: "OK" });
}
exports.apply = apply;
exports.inject = ["locale"];
`)
    const { fehler } = pruefeBuendel(text, SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('Namensräume'))).toBe(true)
    expect(fehler.some((f) => f.includes('Texte'))).toBe(true)
  })

  test('ein Modulwunsch wird gemeldet — dann gehört er in `dsh.client.external`', () => {
    const text = baue(`
var module = { exports: {} };
var exports = module.exports;
var react = require("react");
function apply() {}
exports.apply = apply;
exports.inject = ["locale"];
`)
    const { fehler } = pruefeBuendel(text, SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('dsh.client.external'))).toBe(true)
  })

  test('ein werfendes Bündel wird gemeldet, nicht verschluckt', () => {
    const { fehler } = pruefeBuendel('window.__ModuleLoader__.load({ id: "x", factory: () => { throw new Error("kaputt") } });\n', SPRACHPaket, erwartet)
    expect(fehler.some((f) => f.includes('kaputt'))).toBe(true)
  })

  test('die erwarteten Zahlen sind die der gemessenen Quelle', () => {
    expect(erwartet.namensraeume).toBe(56)
    expect(erwartet.texte).toBe(2374)
  })
})

describe('Bündelprüfung — Stilregel (select-contrast)', () => {
  test('das echte Bündel ist fehlerfrei', () => {
    if (!existsSync(STIL_ZIEL)) throw new Error(`${STIL_ZIEL} fehlt — erst \`bun scripts/client-buendel.mjs\` laufen lassen.`)
    const { fehler } = pruefeBuendel(readFileSync(STIL_ZIEL, 'utf8'), STILPaket, erwartet)
    expect(fehler).toEqual([])
  })

  test('ein Bündel ohne `inject` wird auch hier gemeldet', () => {
    const text = umschliesse(
      `var module = { exports: {} };\nvar exports = module.exports;\nfunction apply() {}\nexports.apply = apply;\n`,
      STILPaket.kennung,
      STILPaket.dir,
    )
    const { fehler } = pruefeBuendel(text, STILPaket, erwartet)
    expect(fehler.some((f) => f.includes('`inject`'))).toBe(true)
  })

  test('GEGENPROBE: ein Bündel, das NICHTS einhängt, wird gemeldet', () => {
    const text = umschliesse(
      `var module = { exports: {} };\nvar exports = module.exports;\nfunction apply() {}\nexports.apply = apply;\nexports.inject = [];\n`,
      STILPaket.kennung,
      STILPaket.dir,
    )
    const { fehler } = pruefeBuendel(text, STILPaket, erwartet)
    expect(fehler.some((f) => f.includes('Stilelemente'))).toBe(true)
  })

  test('GEGENPROBE: feste Farben statt Theme-Variablen werden gemeldet', () => {
    const text = umschliesse(
      `var module = { exports: {} };\nvar exports = module.exports;\n` +
        `function apply(ctx) { ctx.effect(() => { var s = document.createElement('style'); s.textContent = 'select option { color: #fff; }'; document.head.append(s); return () => {} }) }\n` +
        `exports.apply = apply;\nexports.inject = [];\n`,
      STILPaket.kennung,
      STILPaket.dir,
    )
    const { fehler } = pruefeBuendel(text, STILPaket, erwartet)
    expect(fehler.some((f) => f.includes('Theme-Variable'))).toBe(true)
  })

  test('GEGENPROBE: eine Regel ohne den erwarteten Selektor wird gemeldet', () => {
    const text = umschliesse(
      `var module = { exports: {} };\nvar exports = module.exports;\n` +
        `function apply(ctx) { ctx.effect(() => { var s = document.createElement('style'); s.textContent = 'div { color: var(--dsw-alias-label-primary); }'; document.head.append(s); return () => {} }) }\n` +
        `exports.apply = apply;\nexports.inject = [];\n`,
      STILPaket.kennung,
      STILPaket.dir,
    )
    const { fehler } = pruefeBuendel(text, STILPaket, erwartet)
    expect(fehler.some((f) => f.includes('select option'))).toBe(true)
  })

  test('ein unbekanntes Paketverzeichnis wird laut abgelehnt', () => {
    expect(() => paketFuer('packages/client/gibt-es-nicht')).toThrow(/PAKETE/)
  })
})
