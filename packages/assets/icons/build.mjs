/**
 * `build.mjs` — **schreibt die Zeichen als Dateien.**
 *
 * ## Was hier entsteht
 *
 * ```
 * svg/prometheus.svg      ein Zeichen je Datei — die Form, in der man einen Satz weitergibt
 * svg/torch.svg           (… 30 Stück)
 * svg/sprite.svg          alle Zeichen als <symbol> — eine Datei für eine ganze Seite
 * svg/index.html          das Übersichtsblatt: alle Zeichen, groß, auf hell und dunkel
 * svg/README.md           die Tabelle: Name, Beschreibung, fertiger Einbau
 * ```
 *
 * ## Warum es diesen Schritt gibt und nicht nur das Paket
 *
 * Ein Zeichensatz ist ein **Ergebnis**, kein Quelltext. Wer ihn in Figma, in einem README oder in
 * einer anderen Anwendung braucht, will eine `.svg`-Datei öffnen — nicht eine TypeScript-Datei lesen.
 * Die Dateien entstehen deshalb aus **derselben** Quelle (`src/shapes.ts`), aus der auch die
 * Oberfläche zeichnet: es gibt keinen zweiten Stand, der veralten kann.
 *
 * **Und damit sie nicht veralten, prüft sie jemand.** `bun build.mjs --pruefen` schreibt nichts,
 * sondern rechnet die Dateien nach und vergleicht sie mit dem, was auf der Platte liegt. Driftet
 * eine, fällt der Lauf **rot** aus (`scripts/client-buendel.mjs` prüft sein Bündel genauso).
 *
 * Aufruf:
 *
 * ```
 * bun build.mjs            schreiben
 * bun build.mjs --pruefen  nur vergleichen (Exit 1 bei Abweichung)
 * ```
 *
 * @module packages/assets/icons/build
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ICONS, ICON_NAMES, RASTER, iconFile, iconId, spriteMarkup } from './src/index.ts'

const HIER = import.meta.dirname
const ZIEL = join(HIER, 'svg')
const nurPruefen = process.argv.includes('--pruefen')

/**
 * **Das Übersichtsblatt.**
 *
 * Zwei Gründe, warum es das gibt:
 *
 *   1. **Man muss die Zeichen sehen können.** Eine Form, die als Pfaddaten stimmt, kann als Bild
 *      trotzdem falsch aussehen — zu dünn, zu voll, schief. Das Blatt ist die eine Stelle, an der
 *      man alle nebeneinander sieht (und ein Bildschirmfoto davon ist der Nachweis).
 *   2. **Hell und dunkel.** Die Zeichen malen mit `currentColor`; ob sie auf hellem Grund noch
 *      stehen, sieht man nur, wenn beide Gründe da sind.
 *
 * Die Farben des Blattes sind **nicht** die der Oberfläche — es ist ein Prüfstand, keine Ansicht.
 */
function uebersichtsblatt() {
  const karten = ICON_NAMES.map((name) => {
    const zeichen = ICONS[name]
    return `      <figure class="karte">
        <svg viewBox="0 0 ${RASTER} ${RASTER}" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${zeichen.koerper}</svg>
        <figcaption><code>${name}</code><span>${zeichen.was}</span></figcaption>
      </figure>`
  }).join('\n')

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Prometheus — Zeichensatz (${String(ICON_NAMES.length)} Zeichen)</title>
    <!--
      Erzeugt von build.mjs aus src/shapes.ts. Nicht von Hand ändern — die Quelle ist der Code.
    -->
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 32px;
        font: 14px/1.5 "Segoe UI", system-ui, sans-serif;
        background: #0d0d0f; color: #e8e6e3;
      }
      h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; letter-spacing: .04em; }
      h1 span { color: #ff9d3f; }
      p.hinweis { margin: 0 0 28px; color: #8b8781; }
      h2 { margin: 36px 0 12px; font-size: 12px; font-weight: 600; letter-spacing: .18em;
           text-transform: uppercase; color: #8b8781; }
      .reihe { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
      .karte { margin: 0; display: flex; gap: 14px; align-items: center; padding: 12px 14px;
               border: 1px solid #232326; border-radius: 10px; background: #141417; }
      .karte svg { flex: none; }
      .karte figcaption { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .karte code { font: 12px/1.4 ui-monospace, "Cascadia Mono", monospace; color: #ff9d3f; }
      .karte span { font-size: 12px; color: #a9a5a0; }
      /* Der Prüfstand: derselbe Satz auf hellem Grund. Die **Farbe** muss dort mitgesetzt werden —
         currentColor bliebe sonst hell auf hell, und die Zeile wäre leer (gemessen im ersten Blatt:
         die Zeichen waren praktisch unsichtbar, und das lag nicht an den Zeichen).
         ACHTUNG: in diesem Template-String dürfen **keine Backticks** stehen — sie beenden die
         Zeichenkette, und der Fehler zeigt dann auf eine ganz andere Stelle. */
      .hell { background: #f4f2ef; border-color: #ddd8d2; color: #2a2724; }
      .hell code { color: #a8551a; }
      .hell span { color: #5d5852; }
      .leiste { display: flex; flex-wrap: wrap; gap: 26px; margin-top: 10px; }
      .leiste div { display: flex; gap: 10px; align-items: center; }
      .leiste small { color: #8b8781; font-size: 11px; }
      .groessen { display: flex; gap: 18px; align-items: flex-end; margin-top: 12px; }
      .groessen svg { color: #e8e6e3; }
    </style>
  </head>
  <body>
    <h1><span>Prometheus</span> — Zeichensatz</h1>
    <p class="hinweis">${String(ICON_NAMES.length)} Zeichen, ${String(RASTER)}×${String(RASTER)} Raster, Strichlinie, <code>currentColor</code>. Erzeugt aus <code>src/shapes.ts</code>.</p>

    <h2>Alle Zeichen — dunkler Grund</h2>
    <div class="reihe">
${karten}
    </div>

    <h2>Alle Zeichen — heller Grund</h2>
    <div class="reihe">
${ICON_NAMES.map((name) => `      <figure class="karte hell"><svg viewBox="0 0 ${RASTER} ${RASTER}" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].koerper}</svg><figcaption><code>${name}</code></figcaption></figure>`).join('\n')}
    </div>

    <h2>Die Größen, in denen sie wirklich stehen</h2>
    <div class="groessen">
${[12, 14, 16, 18, 22, 32]
  .map(
    (px) =>
      `      <div style="text-align:center"><svg viewBox="0 0 ${RASTER} ${RASTER}" width="${String(px)}" height="${String(px)}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS.orbit.koerper}</svg><br><small style="color:#8b8781;font-size:10px">${String(px)}px</small></div>`,
  )
  .join('\n')}
    </div>

    <h2>Das Thema — Prometheus</h2>
    <div class="leiste">
${['prometheus', 'torch', 'vessel', 'chain', 'anvil']
  .map(
    (name) =>
      `      <div><svg viewBox="0 0 ${RASTER} ${RASTER}" width="34" height="34" fill="none" stroke="#ff9d3f" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name].koerper}</svg><small>${name}</small></div>`,
  )
  .join('\n')}
    </div>
  </body>
</html>
`
}

/** Der Name, an dem das README den `<use>`-Aufruf vorführt — eines, das jeder wiedererkennt. */
const BEISPIEL = iconId('chat')

/** Die Tabelle für das README des Ordners — aus derselben Quelle wie alles andere. */
function uebersicht() {
  const zeilen = ICON_NAMES.map((name) => `| \`${name}\` | ${ICONS[name].was} |`).join('\n')
  return `# Prometheus — Zeichensatz

**Erzeugt aus \`../src/shapes.ts\`** (\`bun build.mjs\`). Nicht von Hand ändern: die Quelle ist der Code.

| Datei | Was |
|---|---|
| \`<name>.svg\` | ein Zeichen je Datei, ${String(RASTER)}×${String(RASTER)}, ohne Größe (skalierbar) |
| \`sprite.svg\` | alle Zeichen als \`<symbol>\` — einmal einbinden, danach \`<use href="#${BEISPIEL}"/>\` |
| \`index.html\` | das Übersichtsblatt: alle Zeichen groß, auf hellem und dunklem Grund |

Die Farbe kommt **immer** von außen (\`currentColor\`); die Größe setzt der Aufrufer.

## Die Zeichen

| Name | Was es zeigt |
|---|---|
${zeilen}
`
}

/** Was geschrieben werden soll — als Liste aus Pfad und Inhalt. */
function dateien() {
  const liste = ICON_NAMES.map((name) => ({ pfad: join(ZIEL, `${name}.svg`), inhalt: iconFile(name) }))
  liste.push({ pfad: join(ZIEL, 'sprite.svg'), inhalt: `${spriteMarkup()}\n` })
  liste.push({ pfad: join(ZIEL, 'index.html'), inhalt: uebersichtsblatt() })
  liste.push({ pfad: join(ZIEL, 'README.md'), inhalt: uebersicht() })
  return liste
}

const alle = dateien()

if (nurPruefen) {
  const fehler = []
  for (const datei of alle) {
    let vorhanden = null
    try {
      vorhanden = readFileSync(datei.pfad, 'utf8')
    } catch {
      fehler.push(`fehlt: ${datei.pfad}`)
      continue
    }
    if (vorhanden !== datei.inhalt) fehler.push(`abweichend: ${datei.pfad}`)
  }
  // Und die Gegenrichtung: eine Datei im Ordner, die niemand mehr erzeugt, ist ein Rest.
  const erwartet = new Set(alle.map((d) => d.pfad))
  let imOrdner = []
  try {
    imOrdner = readdirSync(ZIEL).map((name) => join(ZIEL, name))
  } catch {
    /* Der Ordner fehlt — das steht schon oben als Fehler. */
  }
  for (const pfad of imOrdner) {
    if (!erwartet.has(pfad)) fehler.push(`ueberzaehlig (erzeugt niemand mehr): ${pfad}`)
  }

  if (fehler.length > 0) {
    console.log(`FEHLER: ${String(fehler.length)}`)
    for (const f of fehler) console.log(`   ${f}`)
    console.log('')
    console.log('BEFUND: die Dateien in svg/ stimmen nicht mit src/shapes.ts überein.')
    console.log('        In Ordnung bringen: bun build.mjs')
    process.exit(1)
  }
  console.log(`Geprueft: ${String(alle.length)} Dateien stimmen mit src/shapes.ts ueberein.`)
  process.exit(0)
}

mkdirSync(ZIEL, { recursive: true })
for (const datei of alle) writeFileSync(datei.pfad, datei.inhalt, 'utf8')
console.log(`Geschrieben: ${String(alle.length)} Dateien nach ${ZIEL}`)
for (const name of ICON_NAMES) console.log(`   ${name}.svg`)
console.log('   sprite.svg   (alle Zeichen als <symbol>)')
console.log('   index.html   (Uebersichtsblatt)')
console.log('   README.md    (Tabelle)')
