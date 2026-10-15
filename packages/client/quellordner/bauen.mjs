/**
 * Werkszeug: **die Browser-Hälfte eines Client-Plugins bauen — und das Gebaute prüfen.**
 *
 * ## Warum es das gibt, und warum es NICHT `scripts/client-buendel.mjs` ist
 *
 * Der Kern lädt Client-Plugins **nicht** aus dem TypeScript-Quelltext, sondern aus einem
 * **gebauten** `lib/client.js` — in der Form, die `window.__ModuleLoader__.load({id, factory})`
 * verlangt.
 *
 * `scripts/client-buendel.mjs` tut das für das **Sprachpaket** — und prüft dabei Dinge, die nur
 * für das Sprachpaket gelten (`inject === ['locale']`, 56 Namensräume, 2374 Texte). Es ist damit
 * **kein** allgemeiner Bündler. Dieses Werkszeug ist die allgemeine Fassung: es baut **ein**
 * Paket und prüft, was für **jedes** Client-Plugin gilt.
 *
 * ## Die Prüfung ist der eigentliche Zweck
 *
 * Ein Bau, der eine Datei schreibt, ist noch kein Nachweis. Deshalb wird das **Gebaute wirklich
 * ausgeführt**: der Umschlag wird mit einem mitgeschriebenen `window` ausgewertet, die Fabrik mit
 * einem echten `require` aufgerufen, und das Plugin **befragt**:
 *
 * 1. Hat es `name`, `inject` und `apply`?
 * 2. Ruft `apply` an einem mitschreibenden `ctx` den **richtigen** Erweiterungspunkt?
 * 3. Trägt die Eintragung die Pflichtfelder (`name`, `id` — ein Listeneintrag ohne `id` **wirft**)?
 * 4. Ist die Komponente eine **Funktion** — und **rendert** sie? (`react-dom/server`)
 *
 * **Was das nicht beweist:** wie es im Browser **aussieht**. Hier ist kein Browser installiert.
 *
 * ```powershell
 * bun run packages/client/quellordner/bauen.mjs            # bauen + prüfen + schreiben
 * bun run packages/client/quellordner/bauen.mjs --pruefen  # nur die vorhandene Datei prüfen
 * ```
 *
 * @module @prometheus-harness/client-quellordner/bauen
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/** Das Verzeichnis dieses Pakets. */
const HIER = dirname(fileURLToPath(import.meta.url))

/** Die Kennung, unter der der Kern das Bündel lädt — sie MUSS dem Paketnamen entsprechen. */
const KENNUNG = '@prometheus-harness/client-quellordner'

/** Was der Browser nicht mitgeliefert bekommt, sondern vom Kern erfragt. */
const FREMD = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/server']

/** Die Zieldatei. */
const ZIEL = join(HIER, 'lib', 'client.js')

/**
 * Baut den Rumpf.
 *
 * @returns der Rumpf als CommonJS
 */
async function baueRumpf() {
  const ergebnis = await Bun.build({
    entrypoints: [join(HIER, 'src', 'client.tsx')],
    target: 'browser',
    format: 'cjs',
    external: FREMD,
    minify: false,
  })
  if (!ergebnis.success || ergebnis.outputs.length === 0) {
    throw new Error(`Der Bau scheiterte: ${ergebnis.logs.map((l) => String(l)).join(' ')}`)
  }
  return await ergebnis.outputs[0].text()
}

/**
 * Legt den Umschlag um den Rumpf, den der Kern erwartet.
 *
 * @param rumpf - das gebaute CommonJS
 * @returns die auszuliefernde Datei
 */
function umschliesse(rumpf) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(KENNUNG)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${rumpf}
    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
`
}

/**
 * Führt das Gebaute aus und befragt es.
 *
 * @param text - der Inhalt von `lib/client.js`
 * @returns die Befunde; leer heißt „bestanden"
 */
function pruefe(text) {
  const befunde = []
  let geladen
  const fenster = {
    __ModuleLoader__: {
      load: (eintrag) => {
        geladen = eintrag
      },
    },
  }

  // **Wirklich auswerten.** Kein Nachsehen im Text, sondern ein Lauf.
  // eslint-disable-next-line no-new-func
  new Function('window', text)(fenster)

  if (geladen === undefined) return ['Der Umschlag ruft window.__ModuleLoader__.load NICHT auf.']
  if (geladen.id !== KENNUNG) befunde.push(`Die Kennung ist „${String(geladen.id)}" statt „${KENNUNG}".`)

  const require = createRequire(join(HIER, 'package.json'))
  const plugin = geladen.factory(require)

  if (plugin.name !== 'quellordner') befunde.push(`name ist „${String(plugin.name)}".`)
  if (!Array.isArray(plugin.inject)) befunde.push('inject ist keine Liste.')
  if (typeof plugin.apply !== 'function') befunde.push('apply ist keine Funktion.')
  if (befunde.length > 0) return befunde

  // Den Erweiterungspunkt mitschreiben.
  //
  // **Die Dienste werden nachgebildet, nicht erfunden:** `workspaces.list.getSnapshot().items`
  // und `sessions.list.getSnapshot().current` stehen so in `ui-git/src/client/index.ts:205-206`.
  // Ohne sie ließe sich die `inject`-Fabrik nicht aufrufen — und die Prüfung liefe an dem Weg
  // vorbei, den der Kern geht.
  const gerufen = []
  let eintragung
  const ctx = {
    slots: {
      inject: (schluessel, f) => {
        gerufen.push(schluessel)
        f()
      },
      register: (optionen, komponente) => {
        eintragung = { optionen, komponente }
        return () => undefined
      },
    },
    workspaces: {
      list: { getSnapshot: () => ({ items: [] }) },
      // Gemessen: `ctx.workspaces.pickDirectory(): Promise<string | null>` (dsh-client-runtime).
      pickDirectory: () => Promise.resolve(null),
    },
    sessions: { list: { getSnapshot: () => ({ current: undefined }) } },
  }
  plugin.apply(ctx)

  if (gerufen.length !== 1 || gerufen[0] !== 'shell.overlay') {
    befunde.push(`apply hängt sich in ${JSON.stringify(gerufen)} ein — erwartet: ["shell.overlay"].`)
    return befunde
  }
  if (eintragung === undefined) return ['apply registriert NICHTS.']

  const o = eintragung.optionen
  if (o.name !== 'shell.overlay') befunde.push(`Die Eintragung zielt auf „${String(o.name)}".`)
  // **Ein Listeneintrag ohne `id` WIRFT** (Vertrag von `dsh-client-ui-slots`).
  if (typeof o.id !== 'string' || o.id.trim() === '') {
    befunde.push('Die Eintragung hat keine `id` — die Registratur würde werfen.')
  }
  if (typeof o.inject !== 'function') {
    befunde.push('Die Eintragung hat keine `inject`-Fabrik.')
  }
  if (typeof eintragung.komponente !== 'function') {
    befunde.push('Die Komponente ist keine Funktion.')
  }
  if (befunde.length > 0) return befunde

  // **Und rendern.** Die Komponente bekommt ihre Dienste von der `inject`-Fabrik — genau wie im
  // Kern. Damit läuft der ganze Weg: Gebautes ausgeführt, Fabrik gerufen, Komponente gerendert.
  //
  // **Nicht `komponente(dienste)` aufrufen.** Der erste Lauf tat das und fiel durch:
  // *„Invalid hook call … resolveDispatcher().useState"*. Eine Komponente, die `useState`
  // benutzt, läßt sich **nur** von React aufrufen — React setzt den Zustandshalter, und ein
  // direkter Aufruf umgeht ihn. Der Fehler lag im Werkszeug, nicht im Gebauten.
  try {
    const dienste = o.inject()
    if (typeof dienste.arbeitsbereich !== 'function') {
      befunde.push('Die inject-Fabrik liefert keine `arbeitsbereich`-Funktion.')
    } else if (dienste.arbeitsbereich() !== undefined) {
      // Ohne Bereiche im Stand muß `undefined` herauskommen — nicht ein leerer Text, der wie eine
      // Kennung aussähe.
      befunde.push('Ohne Arbeitsbereiche liefert `arbeitsbereich()` etwas anderes als undefined.')
    }
    if (typeof dienste.waehleVerzeichnis !== 'function') {
      // Der Verzeichniswähler ist der Weg, den ein echtes Plugin geht
      // (ui-directory-picker-native/src/client/index.ts:27).
      befunde.push('Die inject-Fabrik liefert keinen `waehleVerzeichnis`-Weg.')
    }
    const html = renderToStaticMarkup(createElement(eintragung.komponente, dienste))
    if (html.trim() === '') befunde.push('Die Komponente rendert NICHTS.')
    if (!html.includes('pmh-quellordner-knopf')) {
      befunde.push(`Die Komponente rendert den Knopf nicht. Sie lieferte: ${html.slice(0, 120)}`)
    }
  } catch (fehler) {
    befunde.push(`Die Komponente warf beim Rendern: ${String(fehler && fehler.message)}`)
  }
  return befunde
}

const nurPruefen = process.argv.includes('--pruefen')

if (!nurPruefen) {
  const text = umschliesse(await baueRumpf())
  mkdirSync(dirname(ZIEL), { recursive: true })
  writeFileSync(ZIEL, text, 'utf8')
  process.stdout.write(`Geschrieben: ${resolve(ZIEL)} (${String(text.length)} Zeichen)\n`)
}

const befunde = pruefe(readFileSync(ZIEL, 'utf8'))
if (befunde.length === 0) {
  process.stdout.write('Bestanden: Umschlag, name, inject, apply, Eintragung, Rendering.\n')
  process.exitCode = 0
} else {
  process.stdout.write(`DURCHGEFALLEN (${String(befunde.length)}):\n`)
  for (const b of befunde) process.stdout.write(`  - ${b}\n`)
  process.exitCode = 1
}
