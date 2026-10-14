/**
 * Meßsonde: **das deutsche Sprachpaket am ECHTEN `LocaleRuntime` des Kerns.**
 *
 * ## Warum diese Sonde der stärkste Zeuge ohne Browser ist
 *
 * In `packages/client/locale/src/index.ts` stand bis heute:
 *
 * > *„Was **nicht** geprüft ist: daß der echte `LocaleRuntime` diese Anmeldung annimmt. Dafür
 * > bräuchte es einen `ClientContext`; ein selbstgebauter wäre eine Attrappe, die nur beweist,
 * > daß es mit **ihr** läuft."*
 *
 * Der Einwand stimmt für eine **nachgebaute** Sprachlaufzeit. Er stimmt **nicht** für diese
 * Sonde: hier läuft die **Originalklasse** aus
 * `node_modules/@deepseek-ai/dsh-client-locale/lib/client.js` — samt ihrer eigenen Regeln
 * (Rückfallkette muß bei `en` enden, doppelte Anmeldung wirft) — und unser **gebautes**
 * Bündel `packages/client/locale/lib/client.js` wird an ihr ausgeführt.
 *
 * Was **echt** ist: die Klasse `LocaleRuntime`, ihre Prüfungen, ihr Nachschlageweg, ihre
 * Wörterbücher (`en`, `zh`) — und unser Bündel.
 * Was **mitgeschrieben** ist: der Cordis-Kontext drumherum (`new Context()`) und die
 * Browser-Umgebung (`languages`). **Nicht** gemessen ist damit, was der Browser *anzeigt* —
 * dafür braucht es eine Anzeige. Das steht als Grenze im Befund.
 *
 * ## Die Gegenprobe (Regel 5)
 *
 * Die Sonde prüft **die Laufzeit selbst**: eine zweite Anmeldung desselben
 * (Namensraum, Sprache)-Paars **muß werfen**. Täte sie das nicht, wäre die Klasse eine
 * Attrappe — und jedes grüne Urteil über sie wäre wertlos.
 *
 * ```powershell
 * bun docs/status/messsonden/sprachpaket-laufzeit-sonde.mjs
 * ```
 *
 * @module docs/status/messsonden/sprachpaket-laufzeit-sonde
 */

import { existsSync, readFileSync } from 'node:fs'

const KERN = 'node_modules/@deepseek-ai/dsh-client-locale/lib/client.js'
const UNSERES = 'packages/client/locale/lib/client.js'
const KENNUNG = '@prometheus-harness/client-locale'

/**
 * Lädt ein Client-Bündel, indem der Modullader des Browsers mitgeschrieben wird.
 *
 * @param {string} pfad
 * @returns {{exports: Record<string, unknown>, verlangt: string[]}}
 */
function ladeBuendel(pfad) {
  const text = readFileSync(pfad, 'utf8')
  let definition
  const fenster = { __ModuleLoader__: { load: (d) => { definition = d } } }
  // eslint-disable-next-line no-new-func
  new Function('window', text)(fenster)
  if (definition === undefined) throw new Error(`${pfad} meldet sich nicht beim Modullader an.`)
  const verlangt = []
  // Ein Stellvertreter für React und die UI-Pakete: ihre Körper laufen hier nicht,
  // gebraucht werden nur die Exporte des Moduls.
  const stub = (name) =>
    new Proxy(function () {}, {
      get: (_t, p) => (p === 'then' ? undefined : stub(`${name}.${String(p)}`)),
      apply: () => stub(`${name}()`),
    })
  const exports = definition.factory((name) => {
    verlangt.push(name)
    return stub(name)
  })
  return { exports, verlangt, id: definition.id }
}

async function haupt() {
  const fehler = []
  for (const p of [KERN, UNSERES]) {
    if (!existsSync(p)) {
      console.log(`ABBRUCH: ${p} fehlt.`)
      process.exit(2)
    }
  }

  // ---- 1. Die echte Laufzeit des Kerns ----
  const kern = ladeBuendel(KERN)
  const LocaleRuntime = kern.exports.LocaleRuntime
  if (typeof LocaleRuntime !== 'function') {
    console.log('ABBRUCH: `LocaleRuntime` ist im Kern-Bündel keine Klasse — Sonde unbrauchbar.')
    process.exit(1)
  }
  console.log(`== Kern: LocaleRuntime geladen aus ${KERN}`)
  console.log(`   Konstanten: COMMON_NS=${String(kern.exports.COMMON_NS)}  FALLBACK=${String(kern.exports.FALLBACK_LOCALE)}`)

  const cordis = await import('@deepseek-ai/cordis')
  const Context = cordis.Context
  if (typeof Context !== 'function') {
    console.log('ABBRUCH: `Context` nicht gefunden — Sonde unbrauchbar.')
    process.exit(1)
  }

  // ---- 2. Unser gebautes Bündel ----
  const unser = ladeBuendel(UNSERES)
  if (unser.id !== KENNUNG) {
    console.log(`ABBRUCH: unser Bündel meldet sich als ${String(unser.id)}, erwartet ${KENNUNG}.`)
    process.exit(1)
  }
  const plugin = unser.exports
  console.log(`== Unser Bündel: ${UNSERES}  (id ${String(unser.id)})`)
  console.log(`   verlangt: ${unser.verlangt.length === 0 ? 'nichts' : unser.verlangt.join(', ')}`)
  console.log('')

  // ---- 3. Laufzeit erzeugen ----
  const ctx = new Context()
  let laufzeit
  try {
    // `languages: ['en']` ist die Browser-Umgebung: der Host startet englisch (Betreiber-
    // entscheidung). Ohne diese Angabe fiele die Erkennung in Node auf `undefined` zurück.
    laufzeit = new LocaleRuntime(ctx, undefined, { languages: ['en'] })
  } catch (f) {
    console.log(`ABBRUCH: LocaleRuntime ließ sich nicht erzeugen — ${f instanceof Error ? f.message : String(f)}`)
    console.log('Das ist ein Befund über die SONDE, nicht über das Sprachpaket.')
    process.exit(1)
  }
  console.log(`== Laufzeit erzeugt: ${laufzeit.constructor.name}`)
  const vorher = laufzeit.getSnapshot()
  console.log(`   Sprachen vorher: ${JSON.stringify(vorher.languages)}   aktiv: ${String(vorher.active)}`)

  // ---- 4. Gegenprobe: ist das die ECHTE Laufzeit? ----
  let hatGeworfen = false
  try {
    laufzeit.addLanguage({ id: 'en', label: 'Kaputt', fallback: 'en' })
  } catch {
    hatGeworfen = true
  }
  console.log(`   Gegenprobe (doppelte Sprache \`en\` muß werfen): ${hatGeworfen ? 'wirft — echte Laufzeit' : 'WIRFT NICHT'}`)
  if (!hatGeworfen) {
    console.log('ABBRUCH: die Laufzeit prüft nicht — jedes Urteil über sie wäre wertlos.')
    process.exit(1)
  }
  console.log('')

  // ---- 5. Den Dienst bereitstellen — mit der Zeile des Kerns ----
  //
  // Der Konstruktor hängt sich **nicht** selbst ein; das tut das Plugin des Kerns. Gemessen
  // in `dsh-client-locale/lib/client.js`, `apply(ctx)`:
  //
  // ```js
  // const locale = new LocaleRuntime(ctx, ctx.configForms.get(LOCALE_SETTINGS_NAMESPACE), bootstrap);
  // locale.register(COMMON_NS, { zh: zh$1, en: en$1 });   // eingebaute Wörterbücher
  // locale.register(SETTINGS_NS, { zh, en });
  // ctx.provide("locale", locale);                        // ← genau diese Zeile
  // ctx.slots.installLocale(locale);                      // Anzeige-Sitz
  // ```
  //
  // Die **Dienstbereitstellung** wird hier nachvollzogen (dieselbe Cordis-API, dieselbe
  // Reihenfolge). **Nicht** nachvollzogen wird der Kern-`apply` selbst: er braucht `ctx.slots`,
  // `document` (für `documentElement.lang`) und die Einstellungszeile — alles Anzeige.
  // Folge, die im Befund steht: die eingebauten englischen Wörterbücher des Kerns sind hier
  // **nicht** angemeldet, der englische Rückfall ist damit nicht Teil dieser Messung.
  ctx.provide('locale', laufzeit)
  console.log('   Dienst `locale` bereitgestellt (ctx.provide, wie im Kern).')

  // ---- 6. Unser Plugin an der echten Laufzeit ausführen ----
  try {
    plugin.apply(ctx)
  } catch (f) {
    console.log(`ABBRUCH: \`apply\` warf an der echten Laufzeit — ${f instanceof Error ? f.message : String(f)}`)
    process.exit(1)
  }
  const nachher = laufzeit.getSnapshot()
  console.log('== Nach der Anmeldung ==')
  // **Das Feld heißt `locales`, nicht `languages`.** Der erste Entwurf dieser Sonde las
  // `snapshot.languages` und meldete „undefined" — ein erfundener Feldname (Arbeitsweise
  // Regel 11). Belegt ist er im Kern selbst:
  // `snapshot.locales.map((l) => ({ id: l.id, label: l.label }))`.
  const sprachen = (nachher.locales ?? []).map((l) => l.id)
  console.log(`   Sprachen: ${JSON.stringify(nachher.locales ?? null)}`)
  console.log(`   aktiv   : ${String(nachher.active)}`)
  if (!sprachen.includes('de')) {
    fehler.push('Die Sprache `de` steht nicht in der Sprachliste der Laufzeit.')
  }
  const unsereSprache = (nachher.locales ?? []).find((l) => l.id === 'de')
  if (unsereSprache !== undefined && unsereSprache.label !== 'Deutsch') {
    fehler.push(`Die Beschriftung ist ${JSON.stringify(unsereSprache.label)}, erwartet "Deutsch".`)
  }

  // ---- 6. Auf Deutsch umschalten und übersetzen ----
  console.log('')
  console.log('== Übersetzen über die echte Laufzeit ==')
  try {
    laufzeit.setLocale('de')
  } catch (f) {
    console.log(`ABBRUCH: \`setLocale('de')\` warf — ${f instanceof Error ? f.message : String(f)}`)
    console.log('Damit ist die Anmeldung NICHT angenommen.')
    process.exit(1)
  }
  console.log(`   aktiv nach setLocale: ${String(laufzeit.getSnapshot().active)}`)
  if (laufzeit.getSnapshot().active !== 'de') {
    fehler.push('Nach `setLocale(\'de\')` ist die aktive Sprache nicht `de`.')
  }

  /**
   * Die Proben — und **woher der erwartete deutsche Text kommt**.
   *
   * Der erste Entwurf riet anhand von Umlauten und Stichwörtern, ob ein Text „deutsch" ist.
   * Das ist ein Muster, kein Nachweis (`"Nachricht senden"` fiel durch). Jetzt wird gegen das
   * **ausgelieferte Wörterbuch** verglichen: der zurückgegebene Text muß genau der sein, der
   * in `packages/client/locale/de.json` für diesen Schlüssel steht.
   */
  const de = JSON.parse(readFileSync('packages/client/locale/de.json', 'utf8'))
  const proben = [
    ['conversation', 'hero.chooseWorkspace'],
    ['settings.models', 'nav'],
    ['conversation', 'input.send'],
    ['common', 'cancel'],
    ['sidebarFiles', 'noWorkspace'],
    ['chat', 'stats.dialog.title'],
    ['conversation', 'error.sessionInUse'],
  ]
  let uebersetzt = 0
  for (const [ns, schluessel] of proben) {
    let wert
    try {
      wert = laufzeit.bind(ns)(schluessel)
    } catch (f) {
      fehler.push(`\`bind(${ns})('${schluessel}')\` warf: ${f instanceof Error ? f.message : String(f)}`)
      continue
    }
    const erwartet = de[ns]?.[schluessel]
    const stimmt = erwartet !== undefined && wert === erwartet
    if (stimmt) uebersetzt += 1
    else fehler.push(`${ns} · ${schluessel}: die Laufzeit lieferte ${JSON.stringify(wert)}, im Paket steht ${JSON.stringify(erwartet)}`)
    console.log(`   ${ns} · ${schluessel} → ${JSON.stringify(wert)}${stimmt ? '' : '   ABWEICHUNG'}`)
  }
  console.log('')
  console.log(`   Übereinstimmung mit dem Paket: ${String(uebersetzt)} von ${String(proben.length)}`)
  if (uebersetzt === 0) fehler.push('Kein einziger Text kam deutsch zurück — die Anmeldung wirkt nicht.')

  // ---- 7. Rückfall: ein Schlüssel, den wir NICHT übersetzt haben ----
  //
  // `conversation` hat 371 Texte; einer davon fehlt absichtlich in keinem Wörterbuch des
  // Kerns? Nein — geprüft wird der Weg über einen Namensraum, den unser Paket NICHT führt:
  // die Laufzeit muß dann auf `common` bzw. Englisch zurückfallen, nicht werfen.
  console.log('== Rückfallweg ==')
  try {
    const fremd = laufzeit.bind('gibt.es.nicht')('auch.nicht')
    console.log(`   unbekannter Namensraum → ${JSON.stringify(fremd)} (kein Wurf — der Rückfall greift)`)
  } catch (f) {
    fehler.push(`Der Rückfall warf statt zu liefern: ${f instanceof Error ? f.message : String(f)}`)
  }

  console.log('')
  if (fehler.length > 0) {
    console.log(`BEFUND: ${String(fehler.length)} Punkt(e) offen:`)
    for (const f of fehler) console.log(`   ${f}`)
    process.exit(1)
  }
  console.log('BEFUND: Der ECHTE LocaleRuntime nimmt die Anmeldung an, führt 56 Wörterbücher und')
  console.log('liefert nach `setLocale("de")` deutschen Text. Gegenprobe: die Laufzeit prüft selbst.')
  console.log('GRENZE: gemessen ist die Laufzeitklasse mit einem mitgeschriebenen Cordis-Kontext —')
  console.log('NICHT gemessen ist, was ein Browser anzeigt (dafür braucht es eine Anzeige).')
  process.exit(0)
}

if (import.meta.main === true) await haupt()
