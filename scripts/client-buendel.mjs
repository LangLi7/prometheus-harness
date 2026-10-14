/**
 * Werkszeug: **die Browser-Hälfte des Sprachpakets bauen — und das Gebaute prüfen.**
 *
 * ## Warum es das gibt
 *
 * Der Kern lädt Client-Plugins **nicht** aus dem TypeScript-Quelltext. Wörtlich aus
 * `node_modules/@deepseek-ai/dsh-client-modules/README.md`, Abschnitt *Build requirements*:
 *
 * > *„The host serves **built** client bundles, so `pnpm run build` must have produced each
 * > `lib/client.js` before launch; a missing bundle fails activation **loudly** with one build
 * > instruction and a package/path list."*
 *
 * Und die Form des Bündels ist nicht frei wählbar. Gemessen an
 * `node_modules/@deepseek-ai/dsh-client-locale/lib/client.js` (Kopf und Fuß):
 *
 * ```js
 * window.__ModuleLoader__.load({
 *   id: "@deepseek-ai/dsh-client-locale",
 *   factory: (require) => {
 *     var module = { exports: {} };
 *     var exports = module.exports;
 *     Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
 *     …
 *     exports.apply = apply;
 *     exports.inject = inject;
 *     return module.exports;
 *   }
 * });
 * ```
 *
 * Dieses Werkszeug baut den Rumpf mit `Bun.build` (Browser, CommonJS) und legt **diesen**
 * Umschlag darum.
 *
 * ## Die Prüfung ist der eigentliche Zweck
 *
 * Ein Bau, der eine Datei schreibt, ist noch kein Nachweis. Deshalb wird das **Gebaute**
 * ausgeführt: der Umschlag wird mit einem mitgeschriebenen `window` ausgewertet, die Fabrik
 * aufgerufen und das zurückgegebene Plugin **befragt** —
 *
 * * hat es `inject` und ist es `['locale']`?
 * * ist `apply` eine Funktion?
 * * meldet `apply` an einem mitschreibenden `ctx` die Sprache **de** mit Rückfall **en** an?
 * * hängt es **56** Namensräume mit **2374** Texten ein?
 *
 * Die letzten beiden Zahlen sind gemessen (`docs/status/sprachquelle.json`), nicht
 * aufgeschrieben. Ein Bündel, das sie nicht trifft, ist nicht ausgeliefert.
 *
 * ```powershell
 * bun scripts/client-buendel.mjs            # bauen + prüfen + schreiben
 * bun scripts/client-buendel.mjs --pruefen  # nur die vorhandene Datei prüfen
 * ```
 *
 * @module scripts/client-buendel
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Unsere Client-Plugins — je Eintrag, was zu bauen und was zu prüfen ist.
 *
 * **Warum eine Tabelle und kein fester Pfad.** Der erste Entwurf konnte **nur** das
 * Sprachpaket bauen. Als das zweite Client-Plugin dazukam (`select-contrast`), wäre aus dem
 * Werkzeug entweder eine Kopie oder ein Sonderfall geworden. Die Tabelle hält beides
 * beisammen — und die Prüfungen bleiben **je Art** verschieden, weil ein Sprachpaket etwas
 * anderes beweisen muß als eine Stilregel.
 *
 * @type {{dir: string, kennung: string, art: 'sprachpaket'|'stil', sprache?: string, muster?: RegExp}[]}
 */
export const PAKETE = [
  {
    dir: 'packages/client/locale',
    kennung: '@prometheus-harness/client-locale',
    art: 'sprachpaket',
    sprache: 'de',
  },
  {
    dir: 'packages/client/select-contrast',
    kennung: '@prometheus-harness/client-select-contrast',
    art: 'stil',
    muster: /select option/,
  },
]

/** Die Sprache, die das Sprachpaket anmeldet. */
const SPRACHE = 'de'
/** Die gemessene Quelle der Wahrheit für den Umfang des Sprachpakets. */
const QUELLE = 'docs/status/sprachquelle.json'

/**
 * Findet einen Eintrag der Tabelle.
 *
 * @param {string} dir - Paketverzeichnis
 * @returns {typeof PAKETE[number]} der Eintrag
 * @throws {Error} wenn das Verzeichnis nicht in der Tabelle steht
 */
export function paketFuer(dir) {
  const sauber = dir.replace(/\\/gu, '/').replace(/\/+$/u, '')
  const treffer = PAKETE.find((p) => p.dir === sauber)
  if (treffer === undefined) {
    throw new Error(
      `client-buendel: \`${sauber}\` steht nicht in der Tabelle PAKETE. Ein neues Client-Plugin ` +
        'wird dort eingetragen — sonst wüßte das Werkzeug nicht, was zu prüfen ist.',
    )
  }
  return treffer
}

/**
 * Der Umschlag des Modulladers um einen CommonJS-Rumpf.
 *
 * @param {string} rumpf - der gebaute CommonJS-Rumpf
 * @returns {string} die vollständige Bündeldatei
 */
export function umschliesse(rumpf, kennung = '@prometheus-harness/client-locale', dir = 'packages/client/locale') {
  return `/**
 * Browser-Hälfte. ERZEUGT von \`scripts/client-buendel.mjs\`.
 * Nicht von Hand ändern: die Quelle ist \`${dir}/src/index.ts\`.
 *
 * Der Umschlag ist die Form des Kerns (\`window.__ModuleLoader__.load\`), gemessen an
 * \`@deepseek-ai/dsh-client-locale/lib/client.js\`.
 */
window.__ModuleLoader__.load({
\tid: ${JSON.stringify(kennung)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${rumpf
  .split('\n')
  .map((z) => (z.length > 0 ? `\t\t${z}` : z))
  .join('\n')}
\t\treturn module.exports;
\t}
});
`
}

/**
 * Führt ein gebautes Bündel aus und **befragt das Ergebnis**.
 *
 * @param {string} text - der Inhalt der Bündeldatei
 * @param {typeof PAKETE[number]} paket - der Eintrag der Tabelle (Kennung und Art)
 * @param {{namensraeume: number, texte: number}} erwartet - die gemessenen Zahlen (Sprachpaket)
 * @returns {{fehler: string[], befund: string[]}}
 */
export function pruefeBuendel(text, paket, erwartet) {
  const fehler = []
  const befund = []

  // ---- 1. Der Umschlag muß da sein, sonst lädt der Kern nichts. ----
  let erfasst
  const fenster = {
    __ModuleLoader__: {
      load: (definition) => {
        erfasst = definition
      },
    },
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', text)(fenster)
  } catch (f) {
    return { fehler: [`Das Bündel ließ sich nicht auswerten: ${f instanceof Error ? f.message : String(f)}`], befund }
  }
  if (erfasst === undefined) {
    return { fehler: ['Kein `window.__ModuleLoader__.load(...)` im Bündel — der Kern würde nichts laden.'], befund }
  }
  if (erfasst.id !== paket.kennung) fehler.push(`Die Kennung im Bündel ist ${JSON.stringify(erfasst.id)}, erwartet ${JSON.stringify(paket.kennung)}.`)
  befund.push(`Kennung: ${String(erfasst.id)}`)

  // ---- 2. Die Fabrik aufrufen. Ein `require` darf dabei nicht nötig sein. ----
  let plugin
  const verlangt = []
  try {
    // **Der Modulwunsch wird gemeldet, nicht bestraft.** Der erste Entwurf ließ den
    // `require`-Stellvertreter werfen — dann brach die Fabrik ab, und die Meldung
    // „gehört in `dsh.client.external`" wurde **nie erreicht**. Gefunden hat das der Test
    // `ein Modulwunsch wird gemeldet` (Arbeitsweise Regel 5: der Wächter muß rot werden
    // können). Jetzt gibt der Stellvertreter ein leeres Objekt zurück und der Wunsch wird
    // nach dem Aufruf berichtet.
    plugin = erfasst.factory((name) => {
      verlangt.push(name)
      return {}
    })
  } catch (f) {
    fehler.push(`Die Fabrik warf: ${f instanceof Error ? f.message : String(f)}`)
    return { fehler, befund }
  }
  if (verlangt.length > 0) {
    fehler.push(
      `Die Fabrik verlangt Module: ${verlangt.join(', ')} — dann gehören sie in \`dsh.client.external\` (sonst findet der Browser sie nicht).`,
    )
  }

  // ---- 3. Die Plugin-Form: `apply` und `inject`. ----
  if (plugin === null || typeof plugin !== 'object') {
    return { fehler: [...fehler, `Die Fabrik gab ${typeof plugin} zurück, kein Plugin-Objekt.`], befund }
  }
  if (typeof plugin.apply !== 'function') fehler.push('Dem Plugin fehlt `apply` — der Kern verlangt eine Funktion oder ein Objekt mit `apply(ctx)`.')
  if (!Array.isArray(plugin.inject)) {
    fehler.push('Dem Plugin fehlt `inject` — der Kern weiß dann nicht, welchen Dienst es braucht.')
  } else if (paket.art === 'sprachpaket' && !plugin.inject.includes('locale')) {
    fehler.push(`\`inject\` ist ${JSON.stringify(plugin.inject)} — der Dienst \`locale\` fehlt.`)
  } else {
    befund.push(`inject: ${JSON.stringify(plugin.inject)}`)
  }
  if (fehler.length > 0) return { fehler, befund }

  // ---- 4. Verhalten. Was zu beweisen ist, hängt an der ART des Plugins. ----

  if (paket.art === 'stil') {
    // Eine Stilregel ist erst dann etwas wert, wenn sie **wirklich** eingehängt wird und die
    // Variablen des Themes nennt. Beides wird hier ausgeführt, nicht gelesen: das Bündel
    // bekommt ein mitgeschriebenes `document`, und danach wird das Ergebnis befragt.
    const angehaengt = []
    const vorher = globalThis.document
    globalThis.document = {
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '', remove: () => undefined }),
      head: { append: (el) => angehaengt.push(el) },
    }
    try {
      plugin.apply({ effect: (f) => f() })
    } catch (f) {
      fehler.push(`\`apply\` warf: ${f instanceof Error ? f.message : String(f)}`)
      return { fehler, befund }
    } finally {
      globalThis.document = vorher
    }
    if (angehaengt.length !== 1) {
      fehler.push(`\`apply\` hat ${String(angehaengt.length)} Stilelemente eingehängt, erwartet genau 1.`)
      return { fehler, befund }
    }
    const regel = String(angehaengt[0]?.textContent ?? '')
    if (paket.muster !== undefined && !paket.muster.test(regel)) {
      fehler.push(`Die eingehängte Regel nennt ${String(paket.muster)} nicht.`)
    }
    if (!regel.includes('--dsw-')) {
      fehler.push('Die Regel benutzt keine Theme-Variable (`--dsw-…`) — der Kontrast hinge dann an festen Farben und wäre in einem anderen Theme falsch.')
    }
    befund.push(`Regel eingehängt: ${regel.split('\n')[0] ?? ''} …`)
    befund.push(`Länge der Regel: ${String(regel.length)} Zeichen`)
    return { fehler, befund }
  }

  // ---- Verhalten eines Sprachpakets: an einem mitschreibenden ctx. ----
  const sprachen = []
  const registrierungen = []
  let texte = 0
  const ctx = {
    effect: (f) => {
      f()
    },
    locale: {
      addLanguage: (d) => {
        sprachen.push(d)
        return () => undefined
      },
      register: (ns, sprache, woerterbuch) => {
        registrierungen.push({ ns, sprache })
        texte += Object.keys(woerterbuch).length
        return () => undefined
      },
    },
  }
  try {
    plugin.apply(ctx)
  } catch (f) {
    fehler.push(`\`apply\` warf: ${f instanceof Error ? f.message : String(f)}`)
    return { fehler, befund }
  }

  const sprache = sprachen[0]
  if (sprache === undefined) fehler.push('`apply` hat keine Sprache angemeldet.')
  else {
    if (sprache.id !== SPRACHE) fehler.push(`Angemeldet wurde ${JSON.stringify(sprache.id)}, erwartet ${JSON.stringify(SPRACHE)}.`)
    if (sprache.fallback !== 'en') fehler.push(`Der Rückfall ist ${JSON.stringify(sprache.fallback)} — der Kern verlangt, daß die Kette bei \`en\` endet.`)
    befund.push(`Sprache: ${String(sprache.id)} (Rückfall ${String(sprache.fallback)}, Beschriftung ${String(sprache.label)})`)
  }

  const falscheSprache = registrierungen.filter((r) => r.sprache !== SPRACHE)
  if (falscheSprache.length > 0) {
    fehler.push(`${String(falscheSprache.length)} Wörterbücher wurden für eine andere Sprache angemeldet als ${JSON.stringify(SPRACHE)}.`)
  }
  if (registrierungen.length !== erwartet.namensraeume) {
    fehler.push(`Angemeldet wurden ${String(registrierungen.length)} Namensräume, gemessen sind ${String(erwartet.namensraeume)}.`)
  }
  if (texte !== erwartet.texte) {
    fehler.push(`Eingehängt wurden ${String(texte)} Texte, gemessen sind ${String(erwartet.texte)}.`)
  }
  befund.push(`Namensräume: ${String(registrierungen.length)}   Texte: ${String(texte)}   (erwartet ${String(erwartet.namensraeume)} / ${String(erwartet.texte)})`)

  return { fehler, befund }
}

async function haupt() {
  const nurPruefen = process.argv.includes('--pruefen')
  const args = process.argv.slice(2)
  // `--paket <dir>` baut eines; ohne Angabe **alle** aus der Tabelle (ein vergessenes Plugin
  // wäre sonst still nicht gebaut).
  const gewaehlt = args.includes('--paket') ? [args[args.indexOf('--paket') + 1] ?? ''] : PAKETE.map((p) => p.dir)
  const quelle = JSON.parse(readFileSync(QUELLE, 'utf8'))
  const erwartet = {
    namensraeume: Object.keys(quelle.faecher).length,
    texte: Object.values(quelle.faecher).reduce((s, f) => s + Object.keys(f.englisch).length, 0),
  }

  let fehlerGesamt = 0
  for (const dir of gewaehlt) {
    const paket = paketFuer(dir)
    const ziel = join(paket.dir, 'lib', 'client.js')
    console.log(`===== ${paket.kennung}  (${paket.art}) =====`)

    if (!nurPruefen) {
      const ergebnis = await Bun.build({
        entrypoints: [join(paket.dir, 'src', 'index.ts')],
        target: 'browser',
        format: 'cjs',
        minify: false,
        sourcemap: false,
      })
      if (!ergebnis.success) {
        console.log('BEFUND: der Bau ist gescheitert.')
        for (const m of ergebnis.logs) console.log(`   ${String(m)}`)
        process.exitCode = 1
        return
      }
      const ausgabe = ergebnis.outputs[0]
      if (ausgabe === undefined) {
        console.log('BEFUND: der Bau lieferte keine Ausgabe.')
        process.exitCode = 1
        return
      }
      const rumpf = await ausgabe.text()
      mkdirSync(dirname(ziel), { recursive: true })
      writeFileSync(ziel, umschliesse(rumpf, paket.kennung, paket.dir), 'utf8')
      console.log(`Gebaut: ${ziel}  (${String(Buffer.byteLength(readFileSync(ziel)))} B)`)
    } else if (!existsSync(ziel)) {
      console.log(`BEFUND: ${ziel} fehlt — erst bauen (\`bun scripts/client-buendel.mjs\`).`)
      process.exitCode = 1
      return
    } else {
      console.log(`Geprüft wird die vorhandene Datei: ${ziel}`)
    }

    const { fehler, befund } = pruefeBuendel(readFileSync(ziel, 'utf8'), paket, erwartet)
    console.log('')
    console.log('== Befund am gebauten Bündel ==')
    for (const b of befund) console.log(`   ${b}`)
    console.log('')
    if (fehler.length > 0) {
      console.log(`FEHLER: ${String(fehler.length)}`)
      for (const f of fehler) console.log(`   ${f}`)
      console.log('')
      console.log('BEFUND: das gebaute Bündel erfüllt die Form des Kerns NICHT.')
      fehlerGesamt += fehler.length
    } else {
      console.log('FEHLER: keine')
    }
    console.log('')
  }

  if (fehlerGesamt > 0) process.exit(1)
  console.log('BEFUND: Form und Verhalten aller gebauten Bündel stimmen mit der Messung überein.')
  process.exit(0)
}

if (import.meta.main === true) await haupt()
