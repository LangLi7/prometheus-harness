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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORLD_PATH, worldUrl } from './world-path.mjs'

/**
 * Die Wurzel des Projekts — aus dem Modulpfad, **nie** aus dem Aufrufort.
 *
 * Gebraucht wird sie fuer **eine** Pruefung: die Zusatznamen des Umschalters muessen mit denen
 * uebereinstimmen, die die **Welt** liest (`apps/universe/src/entry.ts`). Zwei Namen fuer dieselbe
 * Sache, in zwei Baeumen, in zwei Sprachen geschrieben — das driftet still, wenn niemand nachsieht.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Unsere Client-Plugins — je Eintrag, was zu bauen und was zu prüfen ist.
 *
 * **Warum eine Tabelle und kein fester Pfad.** Der erste Entwurf konnte **nur** das
 * Sprachpaket bauen. Als das zweite Client-Plugin dazukam (`select-contrast`), wäre aus dem
 * Werkzeug entweder eine Kopie oder ein Sonderfall geworden. Die Tabelle hält beides
 * beisammen — und die Prüfungen bleiben **je Art** verschieden, weil ein Sprachpaket etwas
 * anderes beweisen muß als eine Stilregel.
 *
 * @type {{dir: string, kennung: string, art: 'sprachpaket'|'stil'|'verhalten', sprache?: string, muster?: RegExp, anker?: string}[]}
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
  {
    /*
     * **Der Welt-Umschalter — das erste Plugin mit VERHALTEN.**
     *
     * Eine Stilregel ist eingehängt oder nicht; ein Verhalten kann **fast richtig** sein: der
     * Zuhoerer hängt, und der Klick führt trotzdem nicht ans Ziel. Deshalb hat diese Art ihre eigene
     * Prüfung: das gebaute Bündel wird **ausgeführt**, es bekommt ein mitgeschriebenes Dokument, und
     * danach wird **geklickt** — einmal auf die Marke (muß wechseln) und einmal daneben (darf nicht).
     *
     * `anker` ist der Klassen-Teil, an dem die Marke des Kerns erkannt wird. Er steht **hier** und
     * im Quelltext (`MARKE`) — der Prüfer vergleicht, dass beide dieselbe Auswahl nennen.
     */
    dir: 'packages/client/world-switch',
    kennung: '@prometheus-harness/client-world-switch',
    art: 'verhalten',
    anker: '[class*="_brandIdentity"]',
  },
  {
    /*
     * **Der Medien-Renderer — die erste Browser-Hälfte mit JSX.**
     *
     * Deshalb stehen hier `einstieg` und `erlaubt`: die anderen Pakete kommen ohne
     * React aus, dieses braucht `react` und `react/jsx-runtime` (beides stellt der
     * Modullader im Browser bereit, wie für `@prometheus-harness/rich-ui`).
     *
     * Geprüft wird die **Anmeldung**, nicht das Aussehen: welche Endungen der
     * Renderer beansprucht, ob sie als binär gelten (sonst böte der Kern „Reiner
     * Text" für eine MP4 an), mit welchem Lademodus er arbeitet und unter welchem
     * Schlüssel sein Körper im Dokument-Platz steht.
     */
    dir: 'packages/client/media-preview',
    kennung: '@prometheus-harness/client-media-preview',
    art: 'dokument',
    einstieg: 'src/index.tsx',
    erlaubt: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    endungen: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a'],
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
export function umschliesse(
  rumpf,
  kennung = '@prometheus-harness/client-locale',
  dir = 'packages/client/locale',
  einstieg = 'src/index.ts',
) {
  return `/**
 * Browser-Hälfte. ERZEUGT von \`scripts/client-buendel.mjs\`.
 * Nicht von Hand ändern: die Quelle ist \`${dir}/${einstieg}\`.
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
  // Module, die der Lader im Browser selbst bereitstellt, sind kein Befund: für
  // `react` gilt das nachweislich (`@prometheus-harness/rich-ui` verlangt es
  // genauso). Alles andere gehört in `dsh.client.external`.
  const erlaubt = new Set(paket.erlaubt ?? [])
  const unerlaubt = verlangt.filter((name) => !erlaubt.has(name))
  if (unerlaubt.length > 0) {
    fehler.push(
      `Die Fabrik verlangt Module: ${unerlaubt.join(', ')} — dann gehören sie in \`dsh.client.external\` (sonst findet der Browser sie nicht).`,
    )
  }
  if (verlangt.length > 0) befund.push(`Module: ${verlangt.join(', ')}`)

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

  if (paket.art === 'verhalten') {
    return pruefeVerhalten(plugin, paket, fehler, befund)
  }

  if (paket.art === 'dokument') {
    return pruefeDokument(plugin, paket, fehler, befund)
  }

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
        // **Die Zahl der Texte je Anmeldung mitführen.** Ein Sprachpaket meldet seit den
        // Plugin-Fächern **zwei** Sprachen an (`de` und `en`); eine globale Summe würde die
        // englischen Texte mitzählen und dann gegen die deutsche Messung stehen.
        registrierungen.push({ ns, sprache, texte: Object.keys(woerterbuch).length })
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

  const falscheSprache = registrierungen.filter(
    (r) => r.sprache !== SPRACHE && !(r.sprache === 'en' && (erwartet.englisch?.has(r.ns) ?? false)),
  )
  if (falscheSprache.length > 0) {
    fehler.push(`${String(falscheSprache.length)} Wörterbücher wurden für eine andere Sprache angemeldet als ${JSON.stringify(SPRACHE)}.`)
  }
  // **Gemessen wird die Sprache des Pakets**, nicht jede Anmeldung: die englischen Fächer der
  // Plugins gehören dazu, sind aber nicht der Auftrag dieses Pakets (der Kern bringt Englisch mit).
  const eigene = registrierungen.filter((r) => r.sprache === SPRACHE)
  const texteEigen = eigene.reduce((summe, r) => summe + r.texte, 0)
  if (eigene.length !== erwartet.namensraeume) {
    fehler.push(`Angemeldet wurden ${String(eigene.length)} Namensräume, gemessen sind ${String(erwartet.namensraeume)}.`)
  }
  if (texteEigen !== erwartet.texte) {
    fehler.push(`Eingehängt wurden ${String(texteEigen)} Texte, gemessen sind ${String(erwartet.texte)}.`)
  }
  befund.push(`Namensräume: ${String(eigene.length)}   Texte: ${String(texteEigen)}   (erwartet ${String(erwartet.namensraeume)} / ${String(erwartet.texte)})`)

  return { fehler, befund }
}

/**
 * Prüft einen **Dokument-Renderer** — die Anmeldung, ausgeführt statt gelesen.
 *
 * ## Warum die Anmeldung der Prüfgegenstand ist
 *
 * Ein Renderer, der sich unter einem anderen Schlüssel anmeldet, als sein Körper
 * im Dokument-Platz steht, ist im Browser **unsichtbar**: der Kern findet eine
 * Definition, ruft `renderSlot('sidebar.right.tab.document', …, { entryKey: id })`
 * und bekommt nichts — statt des Players erscheint „Die Vorschau für … ist nicht
 * verfügbar." Genau diese Kopplung (id ↔ Schlüssel) prüft niemand beim Lesen.
 *
 * Dazu die drei Angaben, die den Unterschied zwischen „Vorschau" und „Editor voller
 * Steuerzeichen" machen:
 *
 * | Angabe | Erwartung | Warum |
 * |---|---|---|
 * | `loading` | `bytes-complete` | ein Player braucht die ganzen Bytes, keine Textseiten |
 * | `binaryExtensions` | deckt **alle** `extensions` | sonst bietet der Kern „Reiner Text" für eine MP4 an |
 * | `wrap` | `false` | ein Video wird nicht umbrochen |
 *
 * @param {object} plugin - das aus dem Bündel gewonnene Plugin
 * @param {typeof PAKETE[number]} paket - der Eintrag der Tabelle (Kennung, Art, Endungen)
 * @param {string[]} fehler - wird gefuellt
 * @param {string[]} befund - wird gefuellt
 * @returns {{fehler: string[], befund: string[]}}
 */
function pruefeDokument(plugin, paket, fehler, befund) {
  /** Die Sprach-Anmeldungen. */
  const sprachen = []
  /** Die Renderer-Anmeldungen. */
  const definitionen = []
  /** Die Körper-Anmeldungen. */
  const eintraege = []
  /** Die eingehängten Stilelemente. */
  const stile = []

  const ctx = {
    effect: (f) => {
      f()
    },
    locale: {
      register: (ns, sprache, woerterbuch) => {
        sprachen.push({ ns, sprache, woerterbuch })
        return () => undefined
      },
      // Der Übersetzer nennt den Namensraum mit: so fällt auf, wenn der Renderer
      // seinen Titel aus einer fremden Sprache holt.
      bind: (ns) => (key) => `${ns}.${key}`,
    },
    documentPreviews: {
      register: (definition) => {
        definitionen.push(definition)
        return () => undefined
      },
    },
    slots: {
      inject: (_name, callback) => {
        callback()
      },
      register: (spec, component) => {
        eintraege.push({ spec, component })
        return () => undefined
      },
    },
  }

  const vorher = globalThis.document
  globalThis.document = {
    createElement: () => ({ dataset: {}, textContent: '', remove: () => undefined }),
    head: { append: (element) => stile.push(element) },
  }
  try {
    plugin.apply(ctx)
  } catch (f) {
    fehler.push(`\`apply\` warf: ${f instanceof Error ? f.message : String(f)}`)
    return { fehler, befund }
  } finally {
    globalThis.document = vorher
  }

  // ---- 1. Texte: deutsch und englisch, im eigenen Namensraum. ----
  const namensraeume = new Map(sprachen.map((s) => [s.sprache, s.ns]))
  if (!namensraeume.has('de')) fehler.push('`apply` hat keine deutschen Texte angemeldet.')
  if (!namensraeume.has('en')) fehler.push('`apply` hat keine englischen Texte angemeldet.')
  if (namensraeume.size > 0) befund.push(`Texte: ${[...namensraeume].map(([s, ns]) => `${s} (${ns})`).join(', ')}`)

  // ---- 2. Stil: genau einer, und aus Theme-Variablen. ----
  if (stile.length !== 1) fehler.push(`\`apply\` hat ${String(stile.length)} Stilelemente eingehängt, erwartet genau 1.`)
  else if (!String(stile[0]?.textContent ?? '').includes('--dsw-')) {
    fehler.push('Die eingehängte Regel benutzt keine Theme-Variable (`--dsw-…`).')
  }

  // ---- 3. Die Renderer-Anmeldung. ----
  if (definitionen.length !== 1) {
    fehler.push(`\`apply\` hat ${String(definitionen.length)} Renderer angemeldet, erwartet genau 1.`)
    return { fehler, befund }
  }
  const definition = definitionen[0]
  befund.push(`Renderer: ${String(definition.id)} (${String(definition.loading)})`)

  const extensions = new Set((definition.extensions ?? []).map((e) => String(e).toLowerCase()))
  for (const endung of paket.endungen ?? []) {
    if (!extensions.has(endung)) fehler.push(`Der Renderer nennt die Endung "${endung}" nicht.`)
  }
  if (definition.loading !== 'bytes-complete') {
    fehler.push(`Der Lademodus ist ${JSON.stringify(definition.loading)} — ein Player braucht "bytes-complete".`)
  }
  if (definition.wrap !== false) fehler.push('`wrap` muß `false` sein — ein Video wird nicht umbrochen.')
  if (definition.priority !== undefined && definition.priority !== 'extension') {
    fehler.push(`\`priority\` ist ${JSON.stringify(definition.priority)} — erwartet "extension" (die Vorgabe).`)
  }

  // **Der eigentliche Fehler, den diese Prüfung fängt.** Eine Endung, die in
  // `extensions` steht, aber nicht in `binaryExtensions`, bekommt vom Kern den
  // Klartext-Renderer angeboten: der Nutzer sieht dann bei einer MP4 einen
  // Editor voller Steuerzeichen — und „die Vorschau" ist es nicht.
  const binaer = new Set((definition.binaryExtensions ?? []).map((e) => String(e).toLowerCase()))
  const nichtBinaer = [...extensions].filter((e) => !binaer.has(e))
  if (nichtBinaer.length > 0) {
    fehler.push(`Diese Endungen stehen in \`extensions\`, aber nicht in \`binaryExtensions\`: ${nichtBinaer.join(', ')} — der Kern böte dafür „Reiner Text" an.`)
  }
  const fremd = [...binaer].filter((e) => !extensions.has(e))
  if (fremd.length > 0) fehler.push(`Diese Endungen stehen in \`binaryExtensions\`, aber nicht in \`extensions\`: ${fremd.join(', ')}.`)
  befund.push(`Endungen: ${[...extensions].join(', ')}`)

  // ---- 4. Der Titel kommt aus dem eigenen Wörterbuch. ----
  let titel
  try {
    titel = definition.title()
  } catch (f) {
    fehler.push(`\`title\` warf: ${f instanceof Error ? f.message : String(f)}`)
  }
  if (typeof titel !== 'string' || titel === '') fehler.push('`title` liefert keinen Text.')
  else if (!titel.startsWith(`${namensraeume.get('de') ?? ''}.`)) {
    fehler.push(`Der Titel ${JSON.stringify(titel)} kommt nicht aus dem eigenen Namensraum — er würde je nach Sprache des Kerns anders lauten.`)
  } else befund.push(`Titel (de): ${JSON.stringify(titel)}`)

  // ---- 5. Der Körper steht unter **demselben** Schlüssel. ----
  if (eintraege.length !== 1) {
    fehler.push(`\`apply\` hat ${String(eintraege.length)} Slot-Einträge angemeldet, erwartet genau 1.`)
    return { fehler, befund }
  }
  const { spec, component } = eintraege[0]
  if (spec.name !== 'sidebar.right.tab.document') {
    fehler.push(`Der Slot heißt ${JSON.stringify(spec.name)} — erwartet ist "sidebar.right.tab.document".`)
  }
  if (spec.key !== definition.id) {
    fehler.push(`Der Körper steht unter ${JSON.stringify(spec.key)}, die Anmeldung nennt ${JSON.stringify(definition.id)} — im Browser bliebe der Platz leer.`)
  }
  if (spec.locale !== namensraeume.get('de')) {
    fehler.push(`Der Eintrag nennt den Namensraum ${JSON.stringify(spec.locale)} — erwartet ist der eigene.`)
  }
  if (typeof component !== 'function') fehler.push('Der Eintrag bringt keine Komponente mit.')
  if (fehler.length === 0) befund.push('Körper: sidebar.right.tab.document unter der Renderer-Kennung')

  return { fehler, befund }
}

/**
 * Prüft ein Plugin mit **Verhalten** — ausgeführt, nicht gelesen.
 *
 * ## Warum diese Prüfung mehr ist als „`apply` ist eine Funktion"
 *
 * Ein Verhalten kann **fast richtig** sein: der Zuhoerer haengt am Dokument, die Klasse stimmt, und
 * der Klick fuehrt trotzdem nicht ans Ziel — weil die Faengstufe fehlt, weil der Anker nicht trifft
 * oder weil die Adresse ins Leere zeigt. Nichts davon sieht man einer Zeichenkette an.
 *
 * Deshalb bekommt das **gebaute** Buendel hier ein mitgeschriebenes Dokument, einen Ort
 * (`location.assign`) und einen Knopf — und danach wird **geklickt**:
 *
 * | Schritt | Erwartung |
 * |---|---|
 * | Zuhoerer | genau **einer**, Typ `click`, **in der Faengstufe** |
 * | Beschriftung | `aria-label` und `title` stehen am Knopf, in der Sprache des Dokuments |
 * | Klick auf die Marke | **genau eine** Navigation, und zwar auf `worldUrl(HERKUNFT)` — **ohne** Zusaetze |
 * | Klick auf die Marke | der **Ankunftswunsch** liegt danach im Speicher (`localStorage`) |
 * | Klick daneben | **keine** Navigation und **kein** Wunsch im Speicher |
 * | Rechtsklick auf die Marke | **keine** Navigation (wer ein neues Fenster will, bekommt es) |
 * | zweiter Lauf, `lang="en"` | die Beschriftung wechselt mit — `apply` ist wiederholbar |
 *
 * **Das Ziel ist der eigentliche Wächter.** Es steht im Quelltext des Plugins, in
 * `scripts/world-path.mjs` **und** im Auslieferer (`packages/web/world-static`); hier werden alle
 * drei verglichen. Driftet eine Seite, zeigt der Umschalter auf einen Pfad, unter dem nichts liegt —
 * und das faellt hier **rot** aus, statt im Browser still zu bleiben.
 *
 * @param {object} plugin - das aus dem Buendel gewonnene Plugin
 * @param {typeof PAKETE[number]} paket - der Eintrag der Tabelle (Kennung, Art, Anker)
 * @param {string[]} fehler - wird gefuellt
 * @param {string[]} befund - wird gefuellt
 * @returns {{fehler: string[], befund: string[]}}
 */
function pruefeVerhalten(plugin, paket, fehler, befund) {
  /**
   * **Die Herkunft des Chats, aus dem der Umschalter kommt.**
   *
   * Seit dem 14.10.2026 liegt die Welt auf **derselben** Herkunft — der Umschalter wechselt nur den
   * Pfad. Die Attrappe nennt trotzdem eine **vollstaendige** Adresse: so faellt auf, wenn das Plugin
   * statt „Herkunft + Pfad" etwas anderes baut (etwa eine feste Adresse oder einen relativen Pfad,
   * obwohl die Herkunft bekannt ist).
   */
  const HERKUNFT = 'http://127.0.0.1:3081'

  /*
   * **Der Ankunftswunsch — hier nur zum PRUEFEN.**
   *
   * Das Plugin **schreibt** ihn (in den Speicher der Seite), die Welt **liest** ihn. Zwei Nennungen
   * derselben Sache in zwei Baeumen; Schritt 8 haelt den Namen gegen die Quelle der Welt. Hier steht,
   * was das Buendel tatsaechlich hinterlegt — den Namen selbst liest dieses Skript aus der Welt
   * (`apps/universe/src/entry.ts`), damit eine Umbenennung nicht an zwei Stellen nachgezogen werden
   * muss.
   */
  const ARRIVAL_KEY = 'pmh.world.arrival'
  const ARRIVAL_VALUE = 'os'

  /** Die angesteuerten Adressen — jede Navigation landet hier. */
  const ziele = []
  /** Was im Speicher der Seite landet — `localStorage.setItem` schreibt hierher. */
  const gespeichert = new Map()
  /** Die Zuhoerer, die das Plugin am Dokument anmeldet. */
  const zuhoerer = []
  /** Die Zuhoerer, die es wieder abmeldet. */
  const abgemeldet = []
  /** Wie oft die beiden Bremsen gezogen wurden. */
  const gebremst = { propagation: 0, standard: 0 }

  /**
   * Der Knopf des Kerns — hier nur ein Attributspeicher.
   *
   * Er ist **kein** `FakeElement`: geprueft wird, was das Plugin mit ihm tut (zwei Attribute), nicht
   * wie er aussieht.
   */
  const knopf = {
    attribute: new Map(),
    setAttribute(name, wert) {
      this.attribute.set(name, wert)
    },
    getAttribute(name) {
      return this.attribute.get(name) ?? null
    },
  }

  /** Die Marke — sie erkennt sich an der Auswahl, die das Plugin nennt. */
  const marke = {
    matches: (auswahl) => auswahl === paket.anker,
  }
  /** Irgendein Knoten daneben — er darf **nicht** treffen. */
  const fremd = {
    matches: () => false,
    closest: () => null,
  }

  const dokument = {
    documentElement: { lang: 'de' },
    /**
     * **Die Marke ist nicht immer sofort da.**
     *
     * Der Kern baut die Seitenleiste erst nach dem Laden der Module. Steht `markeDa` auf `false`,
     * verhaelt sich diese Attrappe wie eine Oberflaeche, die noch nichts gemalt hat — genau der
     * Zustand, in dem `apply` laeuft. Ohne diesen Schalter waere der **spaete** Zweig des Plugins
     * (Beobachter + Frist) ungeprueft, und ungepruefte Zweige sind die, die im Betrieb ausfallen.
     */
    markeDa: true,
    querySelector: (auswahl) =>
      auswahl === paket.anker && dokument.markeDa
        ? { ...marke, closest: (a) => (a === 'button' ? knopf : null) }
        : null,
    addEventListener: (typ, fn, capture) => {
      zuhoerer.push({ typ, fn, capture })
    },
    removeEventListener: (typ, fn, capture) => {
      abgemeldet.push({ typ, fn, capture })
    },
  }

  /**
   * Ein Beobachter, der nichts beobachtet — aber sagt, **ob** er gebraucht wurde.
   *
   * Er merkt sich Rückruf und Zustand, damit der spaete Zweig ausgeloest werden kann. Ein Stub, der
   * Aenderungen erfindet, waere hier falsch; einer, der sie auf Ansage ausloest, ist eine Sonde.
   */
  const beobachterListe = []
  class FakeMutationObserver {
    constructor(rueckruf) {
      this.rueckruf = rueckruf
      this.beobachtet = 0
      this.abgemeldet = false
      beobachterListe.push(this)
    }
    observe() {
      this.beobachtet += 1
    }
    disconnect() {
      this.abgemeldet = true
    }
    /** Die Sonde: den Rueckruf von Hand ausloesen, wie es eine Aenderung im Baum taete. */
    ausloesen() {
      this.rueckruf()
    }
  }
  /**
   * **Nur die Beobachter, die wirklich beobachten.**
   *
   * `new MutationObserver(...)` entsteht bei **jedem** `apply` — auch dann, wenn die Marke sofort
   * dasteht und gar nicht beobachtet wird. Wer die Anzahl der **erzeugten** zaehlt, meldet „gebraucht"
   * fuer einen Beobachter, der nie angemeldet wurde; das waere ein Befund ueber den Pruefer, nicht
   * ueber die Sache. Gezaehlt wird deshalb, wer `observe()` gerufen hat.
   */
  const beobachtet = () => beobachterListe.filter((b) => b.beobachtet > 0).length

  const vorher = {
    document: globalThis.document,
    navigator: globalThis.navigator,
    location: globalThis.location,
    MutationObserver: globalThis.MutationObserver,
    localStorage: globalThis.localStorage,
  }
  globalThis.document = dokument
  globalThis.navigator = { language: 'de-CH' }
  /**
   * **Der Ort des Chats — mit Herkunft.**
   *
   * `origin` ist die Herkunft, unter der **Chat und Welt** liegen (seit dem 14.10.2026: ein Port).
   * Hier steht nicht die Welt, sondern die Herkunft des Chats — und der Pfad kommt aus
   * `scripts/world-path.mjs`: nur so faellt auf, wenn das Plugin seine eigene Adresse statt
   * „Herkunft + Pfad" nimmt.
   */
  globalThis.location = { origin: HERKUNFT, assign: (adresse) => ziele.push(adresse) }
  /**
   * **Der Speicher der Seite — der zweite Teil des Weges.**
   *
   * Die Adresse traegt den Ankunftswunsch nicht mehr; er liegt hier (`localStorage`). Ohne diese
   * Attrappe waere der Weg in die Welt nur **halb** geprueft: die Navigation stimmte, und die Welt
   * zeigte trotzdem die zuletzt gespeicherte Ansicht — genau der gemeldete Fehler.
   */
  globalThis.localStorage = {
    getItem: (schluessel) => gespeichert.get(schluessel) ?? null,
    setItem: (schluessel, wert) => gespeichert.set(schluessel, String(wert)),
    removeItem: (schluessel) => gespeichert.delete(schluessel),
    clear: () => gespeichert.clear(),
    key: () => null,
    length: 0,
  }
  globalThis.MutationObserver = FakeMutationObserver

  /** Ein Klick — mit Trefferkette, wie ihn ein Browser liefert. */
  function klicke(auf, extra = {}) {
    const ereignis = {
      target: auf,
      composedPath: () => [auf, knopf, dokument],
      button: 0,
      stopPropagation: () => {
        gebremst.propagation += 1
      },
      preventDefault: () => {
        gebremst.standard += 1
      },
      ...extra,
    }
    for (const eintrag of zuhoerer) eintrag.fn(ereignis)
    return ereignis
  }

  try {
    // ---- 1. Aufhaengen. `effect` laeuft sofort, wie im Kern. ----
    const abbauen = []
    plugin.apply({
      effect: (f) => {
        const ab = f()
        if (typeof ab === 'function') abbauen.push(ab)
      },
    })

    const klickZuhoerer = zuhoerer.filter((e) => e.typ === 'click')
    if (klickZuhoerer.length !== 1) {
      fehler.push(`Das Plugin meldet ${String(klickZuhoerer.length)} Klick-Zuhoerer an, erwartet genau 1.`)
      return { fehler, befund }
    }
    if (klickZuhoerer[0].capture !== true) {
      fehler.push(
        'Der Klick-Zuhoerer haengt NICHT in der Faengstufe (`capture: true`) — der Kern haengt seine ' +
          'eigenen Zuhoerer an die React-Wurzel und wuerde zuerst laufen: die neue Sitzung entstuende trotzdem.',
      )
    }
    befund.push('Zuhoerer: 1 × click, Faengstufe')

    // ---- 2. Die Beschriftung. ----
    const etikett = knopf.getAttribute('aria-label')
    if (etikett === null || etikett === '') fehler.push('Die Marke wurde nicht beschriftet (`aria-label` fehlt) — der Knopf sagt weiter „neue Sitzung".')
    else befund.push(`Beschriftung am Knopf: ${JSON.stringify(etikett)}`)
    if (knopf.getAttribute('title') !== etikett) fehler.push('`title` und `aria-label` stimmen nicht ueberein — der Hinweis im Bild sagt etwas anderes als der fuer Vorleser.')
    befund.push(`Beobachter gebraucht: ${beobachtet() === 0 ? 'nein (Marke sofort gefunden)' : `ja (${String(beobachtet())}×)`}`)

    // ---- 3. Der Klick auf die Marke fuehrt ans Ziel. ----
    klicke({ ...marke, closest: () => knopf })
    if (ziele.length !== 1) {
      fehler.push(`Ein Klick auf die Marke hat ${String(ziele.length)} mal navigiert, erwartet genau 1.`)
    } else {
      const adresse = String(ziele[0])
      /*
       * **Das Ziel, in drei Teilen geprueft.** Jeder Teil hat einen eigenen Grund, und jeder ist
       * schon einmal falsch gewesen:
       *
       *   1. die **Herkunft** — dieselbe wie die des Chats (seit dem 14.10.2026: ein Port),
       *   2. der **Pfad** — aus `scripts/world-path.mjs`, hier gegen den Auslieferer gehalten,
       *   3. **kein Abfrageteil** — der Betreiber: *„der link ist nur zu lange so lol"*. Frueher
       *      standen hier `?ansicht=os` und `?chat=<Herkunft>`; beides ist ersatzlos weg, weil
       *      Chat und Welt auf **einer** Herkunft liegen. Der Ankunftswunsch liegt jetzt im
       *      `localStorage` und wird unten geprueft.
       */
      const erwartet = worldUrl(HERKUNFT)
      if (adresse !== erwartet) {
        fehler.push(
          `Der Umschalter zeigt auf ${JSON.stringify(adresse)}, erwartet ist ${JSON.stringify(erwartet)} — ` +
            'Herkunft, Pfad oder Zusaetze sind auseinandergelaufen.',
        )
      }
      const teile = new URL(adresse)
      if (teile.pathname !== `${WORLD_PATH}/`) {
        fehler.push(`Der Pfad ist ${JSON.stringify(teile.pathname)}, erwartet ${JSON.stringify(`${WORLD_PATH}/`)}.`)
      }
      if (teile.search !== '' || teile.hash !== '') {
        fehler.push(
          `Die Adresse traegt ${JSON.stringify(teile.search + teile.hash)} — erwartet ist eine Adresse ` +
            'OHNE Zusaetze: die Welt braucht weder die Ansicht noch die Adresse des Chats, seit beide auf ' +
            'einer Herkunft liegen (`localStorage` statt Adreßzeile).',
        )
      }
      /*
       * **Und der Ankunftswunsch — die Haelfte, die die Adresse nicht mehr traegt.**
       *
       * Ohne ihn kommt der Nutzer in der **zuletzt gespeicherten** Ansicht heraus; stand dort `chat`,
       * landet er im Platzhalter des Prototyps statt in der Welt. Genau das war der gemeldete Fehler
       * (Bild vom 14.10.2026). Geprueft wird **wer** ihn hinterlegt (das Plugin) und **mit welchem
       * Wert** (der Ansicht `os`) — den Namen selbst haelt Schritt 8 gegen die Quelle der Welt.
       */
      const hinterlegt = gespeichert.get(ARRIVAL_KEY)
      if (hinterlegt !== ARRIVAL_VALUE) {
        fehler.push(
          `Der Klick hat den Ankunftswunsch nicht hinterlegt: ${JSON.stringify(ARRIVAL_KEY)} = ` +
            `${JSON.stringify(hinterlegt)}, erwartet ${JSON.stringify(ARRIVAL_VALUE)} — die Welt zeigt dann die ` +
            'zuletzt gespeicherte Ansicht statt sich selbst, und der Nutzer landet im Platzhalter-Chat.',
        )
      }
      if (fehler.length === 0) {
        befund.push(`Klick auf die Marke → ${adresse}`)
        befund.push(`Ankunftswunsch hinterlegt: ${ARRIVAL_KEY} = ${JSON.stringify(hinterlegt)}`)
      }
    }
    if (gebremst.propagation === 0) fehler.push('Der Klick wurde nicht angehalten (`stopPropagation` fehlt) — der Kern oeffnet zusaetzlich eine neue Sitzung.')
    if (gebremst.standard === 0) fehler.push('Der Klick wurde nicht gebremst (`preventDefault` fehlt).')
    befund.push(`Bremsen: stopPropagation ${String(gebremst.propagation)}× · preventDefault ${String(gebremst.standard)}×`)

    // ---- 4. Und die Gegenprobe: daneben darf nichts geschehen. ----
    const vorherZiele = ziele.length
    const wunschVorher = gespeichert.get(ARRIVAL_KEY)
    gespeichert.delete(ARRIVAL_KEY)
    klicke(fremd)
    if (ziele.length !== vorherZiele) {
      fehler.push('Ein Klick NEBEN der Marke hat ebenfalls in die Welt gefuehrt — der Umschalter greift zu weit.')
    }
    klicke({ ...marke, closest: () => knopf }, { button: 2 })
    klicke({ ...marke, closest: () => knopf }, { ctrlKey: true })
    if (ziele.length !== vorherZiele) {
      fehler.push('Rechtsklick oder Strg+Klick wurden abgefangen — wer ein neues Fenster will, bekommt es nicht mehr.')
    }
    /*
     * **Und die Gegenprobe gilt auch fuer den Speicher.** Ein Klick, der nichts tun soll, darf auch
     * keinen Ankunftswunsch hinterlassen: wer mit Strg klickt, oeffnet ein neues Fenster — bliebe der
     * Wunsch zurueck, zeigte der **naechste** Aufruf der Welt das Universum, obwohl niemand den
     * Umschalter gedrueckt hat.
     */
    if (gespeichert.get(ARRIVAL_KEY) !== undefined) {
      fehler.push(
        'Ein Klick, der NICHT in die Welt fuehrt (daneben, Rechtsklick, Strg+Klick), hat trotzdem einen ' +
          'Ankunftswunsch hinterlegt — der naechste Aufruf der Welt zeigte dann die falsche Ansicht.',
      )
    }
    gespeichert.set(ARRIVAL_KEY, wunschVorher)
    befund.push('Gegenprobe: Klick daneben, Rechtsklick und Strg+Klick loesen nichts aus — auch kein Wunsch im Speicher')
    // ---- 5. Ein zweiter Lauf mit englischer Seite. ----
    knopf.attribute.clear()
    dokument.documentElement.lang = 'en'
    plugin.apply({ effect: (f) => f() })
    const englisch = knopf.getAttribute('aria-label')
    if (englisch === etikett) {
      fehler.push('Nach `lang="en"` steht dieselbe Beschriftung wie auf Deutsch — die Sprache des Dokuments wird nicht gelesen.')
    } else {
      befund.push(`Beschriftung auf englischer Seite: ${JSON.stringify(englisch)}`)
    }

    // ---- 6. Der Abbau nimmt den Zuhoerer wieder mit. ----
    for (const ab of abbauen) ab()
    if (zuhoerer.length > 0 && abgemeldet.length === 0) {
      fehler.push('Der Abbau meldet den Klick-Zuhoerer nicht ab — nach dem Entladen bliebe er am Dokument haengen.')
    } else {
      befund.push(`Abbau: ${String(abgemeldet.length)} Zuhoerer abgemeldet`)
    }

    // ---- 7. Die SPAETE Marke: der Kern malt die Seitenleiste erst nach dem Laden. ----
    // Das ist der Zweig, der im Betrieb zaehlt — beim Aufruf von `apply` steht die Marke meist noch
    // nicht. Geprueft wird die ganze Kette: kein Treffer → Beobachter angemeldet und **nichts**
    // beschriftet; Baum aendert sich → beschriftet **und** Beobachter abgemeldet.
    knopf.attribute.clear()
    dokument.markeDa = false
    const vorherBeobachter = beobachterListe.length
    plugin.apply({ effect: (f) => f() })
    const spaet = beobachterListe[beobachterListe.length - 1]
    if (beobachterListe.length !== vorherBeobachter + 1 || (spaet?.beobachtet ?? 0) !== 1) {
      fehler.push('Ohne Marke im Baum wurde NICHT beobachtet — die Beschriftung kaeme nie nach.')
    } else if (knopf.getAttribute('aria-label') !== null) {
      fehler.push('Ohne Marke im Baum wurde trotzdem beschriftet — das kann nur geraten sein.')
    } else {
      dokument.markeDa = true
      spaet.ausloesen()
      if (knopf.getAttribute('aria-label') === null) {
        fehler.push('Die Marke ist erschienen, und die Beschriftung kam nicht nach.')
      } else if (spaet.abgemeldet !== true) {
        fehler.push('Nach dem Beschriften wurde der Beobachter NICHT abgemeldet — er liefe im Chat weiter.')
      } else {
        befund.push('Spaete Marke: Beobachter angemeldet, nach dem Beschriften abgemeldet')
      }
    }

    // ---- 8. Pfad und Ankunftswunsch stimmen mit den anderen Quellen ueberein. ----
    //
    // Das Plugin schreibt einen **Pfad** (`/universe/`) und, vor der Navigation, einen **Vermerk in
    // den Speicher** (`pmh.world.arrival = 'os'`). Der Auslieferer (`packages/web/world-static`)
    // liefert genau diesen Pfad aus, und die Welt **liest** den Vermerk
    // (`apps/universe/src/entry.ts`). Drei Nennungen derselben Sache, in drei Baeumen — genau die
    // Kopplung, die still driftet: wer hier umbenennt, merkt es dort nicht, und der Umschalter zeigt
    // ins Leere oder fuehrt in die falsche Ansicht.
    //
    // Gelesen werden deshalb die **Quellen** der beiden anderen Seiten, nicht Kopien in diesem
    // Skript. Der Pfad **im Buendel** ist ohnehin schon geprueft (Schritt 3, die angesteuerte
    // Adresse) — hier kommt die Gegenprobe fuer die beiden anderen.
    const quellen = [
      {
        datei: join(ROOT, 'packages', 'web', 'world-static', 'src', 'index.ts'),
        was: `den Pfad (\`WORLD_PATH = '${WORLD_PATH}'\`)`,
        muster: new RegExp(`\\bWORLD_PATH\\s*=\\s*'${WORLD_PATH}'`, 'u'),
        name: 'Der Auslieferer der Welt (packages/web/world-static)',
      },
      {
        datei: join(ROOT, 'apps', 'universe', 'src', 'entry.ts'),
        was: `den Ankunftswunsch (\`ARRIVAL_KEY = '${ARRIVAL_KEY}'\`)`,
        muster: new RegExp(`\\bARRIVAL_KEY\\s*=\\s*'${ARRIVAL_KEY.replace(/\./gu, '\\.')}'`, 'u'),
        name: 'Die Welt (apps/universe)',
      },
      /*
       * **Und der WERT, nicht nur der Name.** Ein gemeinsamer Schluessel mit verschiedenen Werten ist
       * genauso kaputt wie zwei Schluessel: das Plugin schriebe `os`, die Welt erwartete `web`,
       * `takeArrival` verwuerfe den Wunsch — und der Nutzer landete wieder im Platzhalter, ohne dass
       * eine Zeile Code „falsch" aussieht. Der Wert hat in der Welt einen eigenen Namen
       * (`ARRIVAL_VALUE: Ansicht`), deshalb wird er eigens gelesen.
       */
      {
        datei: join(ROOT, 'apps', 'universe', 'src', 'entry.ts'),
        was: `den Ankunftswert (\`ARRIVAL_VALUE: Ansicht = '${ARRIVAL_VALUE}'\`)`,
        muster: new RegExp(`\\bARRIVAL_VALUE\\s*:\\s*Ansicht\\s*=\\s*'${ARRIVAL_VALUE}'`, 'u'),
        name: 'Die Welt (apps/universe)',
      },
    ]
    for (const quelle of quellen) {
      if (!existsSync(quelle.datei)) {
        fehler.push(`${quelle.name} fehlt (${quelle.datei}) — ${quelle.was} ist damit ungeprueft.`)
        continue
      }
      if (!quelle.muster.test(readFileSync(quelle.datei, 'utf8'))) {
        fehler.push(`${quelle.name} kennt ${quelle.was} nicht — die Angaben sind auseinandergelaufen.`)
      }
    }
    if (fehler.length === 0) befund.push(`Pfad und Ankunftswunsch wie in den anderen Quellen: ${WORLD_PATH}, ${ARRIVAL_KEY}`)
  } catch (f) {
    fehler.push(`\`apply\` warf: ${f instanceof Error ? f.message : String(f)}`)
  } finally {
    globalThis.document = vorher.document
    globalThis.navigator = vorher.navigator
    globalThis.location = vorher.location
    globalThis.MutationObserver = vorher.MutationObserver
    globalThis.localStorage = vorher.localStorage
  }

  return { fehler, befund }
}

async function haupt() {
  const nurPruefen = process.argv.includes('--pruefen')
  const args = process.argv.slice(2)
  // `--paket <dir>` baut eines; ohne Angabe **alle** aus der Tabelle (ein vergessenes Plugin
  // wäre sonst still nicht gebaut).
  const gewaehlt = args.includes('--paket') ? [args[args.indexOf('--paket') + 1] ?? ''] : PAKETE.map((p) => p.dir)
  const quelle = JSON.parse(readFileSync(QUELLE, 'utf8'))
  /*
   * **Die Fächer der Plugins zählen mit.**
   *
   * `scripts/language-merge.mjs` schreibt sie aus den `locale`-Dateien der Plugins nach
   * `plugins.de.json`/`plugins.en.json`; das Sprachpaket hängt **beide** ein. Ohne sie in der
   * Erwartung wäre jedes neue Plugin-Fach ein Befund — und der Befund wäre richtig, nur läge der
   * Fehler nicht im Bündel, sondern in dieser Zeile.
   *
   * Fehlt eine der Dateien, zählt sie als leer: ein frisches Paket ohne Plugin-Fächer ist gültig.
   */
  const liesPluginFaecher = (name) => {
    try {
      return JSON.parse(readFileSync(join('packages', 'client', 'locale', name), 'utf8'))
    } catch {
      return {}
    }
  }
  const pluginsDe = liesPluginFaecher('plugins.de.json')
  const pluginsEn = liesPluginFaecher('plugins.en.json')
  const erwartet = {
    namensraeume: Object.keys(quelle.faecher).length + Object.keys(pluginsDe).length,
    texte:
      Object.values(quelle.faecher).reduce((s, f) => s + Object.keys(f.englisch).length, 0) +
      Object.values(pluginsDe).reduce((s, f) => s + Object.keys(f).length, 0),
    englisch: new Set(Object.keys(pluginsEn)),
  }

  let fehlerGesamt = 0
  for (const dir of gewaehlt) {
    const paket = paketFuer(dir)
    const ziel = join(paket.dir, 'lib', 'client.js')
    console.log(`===== ${paket.kennung}  (${paket.art}) =====`)

    if (!nurPruefen) {
      const einstieg = paket.einstieg ?? 'src/index.ts'
      const mitJsx = einstieg.endsWith('.tsx')
      const ergebnis = await Bun.build({
        entrypoints: [join(paket.dir, einstieg)],
        target: 'browser',
        format: 'cjs',
        minify: false,
        sourcemap: false,
        // Nur für die Browser-Hälften mit JSX: React bleibt extern, damit der
        // Modullader im Browser **eine** React-Instanz liefert.
        ...(mitJsx
          ? {
              jsx: { runtime: 'automatic', importSource: 'react', development: false },
              external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
            }
          : {}),
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
      writeFileSync(ziel, umschliesse(rumpf, paket.kennung, paket.dir, einstieg), 'utf8')
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
