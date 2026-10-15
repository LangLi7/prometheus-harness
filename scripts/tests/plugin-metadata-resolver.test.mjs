/**
 * Prüfung der Metadaten-Ergänzung (`scripts/plugin-metadata-resolver.mjs`).
 *
 * **Die Gegenprobe ist hier das Wichtigste** (Arbeitsweise Regel 5): die Ergänzung greift in
 * **fremden** Code. Sie muß (a) den echten Anker finden, (b) ein **lauffähiges** Ergebnis
 * liefern und (c) **laut scheitern**, wenn der Kern die Datei umbaut.
 *
 * Der stärkste Fall ist der vorletzte: der ergänzte Auflöser wird **wirklich ausgewertet** und
 * auf ein echtes Paket angesetzt. Ein Text, der nur wie eine Funktion aussieht, wäre wertlos.
 *
 * **Der Fall ganz unten hält den eigenen Fehler fest** — den ersten Versuch, der den
 * `fromInternal()`-Lader selbst ersetzte und damit den Host zerbrach.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { ANKER, ZIELDATEI, ergaenzeAufloeser, ergaenzungNoetig } from '../plugin-metadata-resolver.mjs'

const ZIELDATEI_PFAD = 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'

describe('Metadaten-Auflöser', () => {
  test('die Ergänzung zielt auf dsh-app-boot, NICHT auf den Lader', () => {
    expect(ZIELDATEI.test('C:/x/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js')).toBe(true)
    expect(ZIELDATEI.test('C:/x/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js')).toBe(false)
  })

  test('die echte Datei trägt den Anker', () => {
    expect(readFileSync(ZIELDATEI_PFAD, 'utf8').includes(ANKER)).toBe(true)
  })

  test('die Ergänzung fügt den öffentlichen Zweig ein und läßt den Rest stehen', () => {
    const alt = readFileSync(ZIELDATEI_PFAD, 'utf8')
    const neu = ergaenzeAufloeser(alt)
    expect(neu).not.toBe(alt)
    expect(neu.includes('createRequire(alsPfad).resolve(specifier)')).toBe(true)
    // Der ursprüngliche Lader-Weg bleibt erhalten (Node unberührt).
    expect(neu.includes('loader.resolveSync(parentURL, {')).toBe(true)
    // 3 Zeilen (Anker) werden durch 10 ersetzt: die beiden ersten bleiben, der Wurf wird zu
    // einem Block mit drei Kommentarzeilen, zwei Zuweisungen und der Rückgabe. +7.
    expect(neu.split('\n').length).toBe(alt.split('\n').length + 7)
  })

  test('GEGENPROBE: ein fehlender Anker wirft — lieber laut als ins Leere', () => {
    expect(() => ergaenzeAufloeser('// ganz andere datei\n')).toThrow(/Anker/)
  })

  test('die Ergänzung ist unter Bun nötig', () => {
    expect(ergaenzungNoetig()).toBe(true)
  })

  test('der eingehängte Auflöser FUNKTIONIERT — er löst ein echtes Paket auf', () => {
    const alt = readFileSync(ZIELDATEI_PFAD, 'utf8')
    const neu = ergaenzeAufloeser(alt)
    const start = neu.indexOf('function resolvePluginResource')
    const ende = neu.indexOf('function missingResource')
    const quelle = neu.slice(start, ende)
    // Die beiden Einführungen, die die Zieldatei oben hat, werden hier mitgegeben.
    // eslint-disable-next-line no-new-func
    const baue = new Function('createRequire', 'fileURLToPath', 'ModuleLoader', `${quelle}\nreturn resolvePluginResource`)
    // `ModuleLoader.fromInternal()` gibt unter Bun `undefined` — genau der Fall, um den es geht.
    const aufloesen = baue(createRequire, fileURLToPath, { fromInternal: () => undefined })

    const basis = new URL(
      `file:///${process.cwd().replace(/\\/g, '/')}/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js`,
    ).href
    const treffer = aufloesen('@deepseek-ai/dsh-experimental-client-ui-voice-input/package.json', basis)
    expect(typeof treffer).toBe('string')
    expect(treffer).toContain('experimental-client-ui-voice-input')
  })

  test('DER EIGENE FEHLER: der Lader selbst darf NICHT ersetzt werden', () => {
    // Der erste Versuch bestückte `ModuleLoader.fromInternal()` mit einem Teilersatz
    // ({ version: "v2", resolveSync }). Gemessen: der Host startete danach nicht mehr,
    // 167 × "failed to import" — weil der LADER des Kerns diesen Auflöser ebenfalls benutzt
    // und mit einem Teilersatz nicht weiterkommt.
    //
    // Diese Prüfung hält fest, daß die Ergänzung **keinen Ersatz am Lader** anbringt. Der
    // Dateiname darf in der Dokumentation vorkommen — eine Zuweisung nicht.
    const text = readFileSync('scripts/plugin-metadata-resolver.mjs', 'utf8')
    expect(text.includes('ModuleLoader.fromInternal =')).toBe(false)
    expect(text.includes('resolveSync:')).toBe(false)
    // Und die Zieldatei ist der Verbraucher, nicht der Lader.
    expect(ZIELDATEI.test('C:/x/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js')).toBe(false)
  })
})
