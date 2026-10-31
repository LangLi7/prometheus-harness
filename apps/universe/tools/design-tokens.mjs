/**
 * **Die Gestaltung als Datei und als Blatt** — erzeugt aus `src/app.css`.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Ein Token-Satz lebt in **einer** Quelle (`:root` in `app.css`), und alles andere liest ihn. Eine von
 * Hand gepflegte `design-tokens.json` wäre eine **zweite** Quelle derselben Zahlen — und die driftet.
 * Deshalb entstehen hier beide Ergebnisse **aus dem Blatt**:
 *
 * ```
 * docs/design/world-design-tokens.json    die Zahlen, maschinenlesbar (für Werkzeuge, Fremdsprachen)
 * docs/design/world-design-preview.html   das Blatt zum Ansehen: Farben, Schrift, Formen, Bewegung
 * ```
 *
 * **Und damit sie nicht veralten, prüft sie jemand.** `--pruefen` schreibt nichts, sondern rechnet
 * beide nach und vergleicht sie mit dem, was auf der Platte liegt — dieselbe Bauweise wie
 * `packages/assets/icons/build.mjs` und `scripts/client-buendel.mjs`.
 *
 * ## Was das Blatt zeigt, und warum
 *
 * **Nicht die Werte — die Wirkung.** Ein Farbwert kann man ablesen; ob er auf dem Grund **lesbar**
 * ist, sieht man nur mit dem Grund daneben. Ob eine Bewegung **weich** ist, sieht man nur, wenn sie
 * läuft. Das Blatt zeigt deshalb jede Farbe auf ihrem echten Untergrund, jede Schrift in ihrer
 * wirklichen Größe, jeden Radius an einer wirklichen Fläche — und die vier Bewegungsdauern als
 * Knopf, den man drücken kann.
 *
 * Aufruf:
 *
 * ```
 * bun tools/design-tokens.mjs            schreiben
 * bun tools/design-tokens.mjs --pruefen  nur vergleichen (Exit 1 bei Abweichung)
 * ```
 *
 * @module tools/design-tokens
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const HIER = import.meta.dirname
const CSS_PFAD = join(HIER, '..', 'src', 'app.css')
const ZIEL = join(HIER, '..', '..', '..', 'docs', 'design')
const nurPruefen = process.argv.includes('--pruefen')

const CSS = readFileSync(CSS_PFAD, 'utf8')

/**
 * **Ein Token aus dem `:root`-Block** — gelesen, nicht abgeschrieben.
 *
 * @param name - der Name ohne `--`
 * @returns der Wert
 */
function token(name) {
  const treffer = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS)
  if (!treffer?.[1]) throw new Error(`Das Token --${name} steht nicht in app.css`)
  return treffer[1].trim()
}

/** Ein Token, das es geben **kann** — für die, die noch nicht da sind. */
function vielleicht(name) {
  const treffer = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS)
  return treffer?.[1]?.trim()
}

/** Die Reihenfolge, in der die Farben gezeigt werden — und was sie bedeuten. */
const FARBEN = [
  ['bg', 'Der Grund der Welt'],
  ['s', 'Fläche, eine Stufe über dem Grund'],
  ['glas', 'Glas: Insel und Panel (durchscheinend)'],
  ['b', 'Rahmen, sichtbar'],
  ['b2', 'Rahmen, leise'],
  ['t', 'Haupttext'],
  ['t2', 'Nebentext'],
  ['t3', 'gedämpft: Etiketten, Zusätze, Marken'],
  ['a', 'Akzent: Zeichen, aktive Zeile'],
  ['a2', 'Akzent, hell: Marke, Überschriften'],
  ['blue', 'Information, Auswahl'],
  ['g', 'Zustand „an" (Punkt, live)'],
]

/** Die Bewegungsdauern in der Reihenfolge ihrer Bedeutung. */
const DAUERN = [
  ['t-schnell', 'Ein Zustand wechselt', 'Farbe, Rahmen, Sichtbarkeit einer Marke'],
  ['t-mittel', 'Eine Fläche antwortet', 'Hover, Fokus, ein Knopf drückt sich'],
  ['t-gross', 'Eine Sache erscheint', 'Panel, Dialog, Ansicht, Zeile in der Liste'],
  ['t-feder', 'Der große Übergang', 'die Insel klappt auf'],
]

/** Die Formen. */
const RADIEN = [
  ['r-fein', 'Der Strich selbst', 'Griff und Ticks der Ansichtsleiste'],
  ['r-xs', 'Chips, kleine Schalter', 'Zahlenfelder, Reset'],
  ['r-sm', 'Felder, Etiketten', 'Suchtreffer, Marke der Kopfzeile'],
  ['r', 'Die Norm', 'Karten, Knöpfe, Zeilen der Insel'],
  ['r-lg', 'Große Flächen', 'aufgeklappte Insel, Dialog'],
  ['r-rund', 'Keine Ecke', 'Pillen und Punkte'],
]

/** Die Höhen. */
const SCHATTEN = [
  ['sch-1', 'Auf der Fläche', 'Felder, Karten, Zeilen'],
  ['sch-2', 'Schwebt', 'Insel, Panel, Leiste'],
  ['sch-3', 'Über allem', 'Dialog, Schleier'],
]

/** Relative Helligkeit nach WCAG 2.1 — für den Kontrast auf dem Blatt. */
function helligkeit(hex) {
  const s = hex.replace('#', '')
  const voll = s.length === 3 ? [...s].map((c) => c + c).join('') : s.slice(0, 6)
  const kanaele = [0, 2, 4].map((i) => Number.parseInt(voll.slice(i, i + 2), 16) / 255)
  const linear = kanaele.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** Der Kontrast zweier Farben (1 … 21) — die Zahl, die über Lesbarkeit entscheidet. */
function kontrast(a, b) {
  const [hell, dunkel] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x)
  return (hell + 0.05) / (dunkel + 0.05)
}

/** Macht aus einem Wert eine Zahl in Millisekunden — für die Anzeige. */
function ms(wert) {
  const n = Number.parseFloat(wert)
  return wert.endsWith('ms') ? n : n * 1000
}

// ── Die JSON-Datei ──────────────────────────────────────────────────────────────────────────

const daten = {
  $hinweis:
    'Erzeugt aus apps/universe/src/app.css von tools/design-tokens.mjs. Nicht von Hand ändern — die Quelle ist das Blatt.',
  farben: Object.fromEntries(FARBEN.map(([name, was]) => [name, { wert: token(name), was }])),
  schrift: {
    titel: { wert: token('f-titel'), was: 'Überschrift' },
    text: { wert: token('f-text'), was: 'Fließtext' },
    klein: { wert: token('f-klein'), was: 'Etiketten und Marken — die untere Grenze' },
    mono: { wert: token('mono'), was: 'Zahlen, Kennungen, Terminal' },
    sans: { wert: token('sans'), was: 'Text — aus dem Harness, nicht gewünscht' },
  },
  form: Object.fromEntries(RADIEN.map(([name, was, wofuer]) => [name, { wert: token(name), was, wofuer }])),
  hoehe: Object.fromEntries(SCHATTEN.map(([name, was, wofuer]) => [name, { wert: token(name), was, wofuer }])),
  bewegung: {
    dauer: Object.fromEntries(DAUERN.map(([name, was, wofuer]) => [name, { wert: token(name), ms: ms(token(name)), was, wofuer }])),
    kurve: {
      standard: { wert: token('e-standard'), was: 'Die ruhige: schnell los, sanft ankommen' },
      ein: { wert: token('e-ein'), was: 'Etwas verschwindet' },
      aus: { wert: token('e-aus'), was: 'Etwas kommt herein' },
      feder: { wert: token('e-feder'), was: 'Der große Übergang — mit kleinem Überschwingen' },
    },
    puls: { wert: token('puls-dauer'), was: 'Anzeige, kein Übergang: der Ring um die Insel beim Ziehen' },
  },
}

// ── Das Blatt ───────────────────────────────────────────────────────────────────────────────

const grund = token('bg')
const farbkarten = FARBEN.map(([name, was]) => {
  const wert = token(name)
  const istGlas = wert.length > 7
  const quote = kontrast(wert.slice(0, 7), grund)
  return `      <figure class="karte">
        <div class="probe" style="background:${wert}"></div>
        <figcaption>
          <code>--${name}</code>
          <span>${was}</span>
          <small>${wert} · ${quote.toFixed(2)} : 1 auf dem Grund</small>
        </figcaption>
      </figure>`
}).join('\n')

const schriftproben = ['f-titel', 'f-text', 'f-klein']
  .map(
    (name) =>
      `      <div class="zeile"><code>--${name}</code><span class="muster" style="font-size:${token(name)}">Prometheus — Ebene Sonnensystem · 80 AE · 280 fps</span><small>${token(name)}</small></div>`,
  )
  .join('\n')

const radiusproben = RADIEN.map(
  ([name, was, wofuer]) =>
    `      <figure class="karte">
        <div class="flaeche" style="border-radius:${token(name)}"></div>
        <figcaption><code>--${name}</code><span>${was}</span><small>${token(name)} · ${wofuer}</small></figcaption>
      </figure>`,
).join('\n')

const schattenproben = SCHATTEN.map(
  ([name, was, wofuer]) =>
    `      <figure class="karte dunkel">
        <div class="schweb" style="box-shadow:${token(name)}"></div>
        <figcaption><code>--${name}</code><span>${was}</span><small>${wofuer}</small></figcaption>
      </figure>`,
).join('\n')

const dauerproben = DAUERN.map(
  ([name, was, wofuer]) =>
    `      <button class="lauf" data-dauer="${token(name)}" data-kurve="${token('e-feder')}" style="--d:${token(name)}">
        <span class="punkt"></span>
        <code>--${name}</code>
        <small>${String(ms(token(name)))} ms · ${was} — ${wofuer}</small>
      </button>`,
).join('\n')

const blatt = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Prometheus — Gestaltung der Welt</title>
    <!--
      Erzeugt von tools/design-tokens.mjs aus src/app.css. Nicht von Hand ändern.
      Das Blatt ist ein PRÜFSTAND, keine Ansicht: es zeigt jeden Wert auf seinem echten Untergrund.
    -->
    <style>
      :root {
        color-scheme: dark;
        --grund: ${grund};
        --t: ${token('t')};
        --t2: ${token('t2')};
        --t3: ${token('t3')};
        --a: ${token('a')};
        --a2: ${token('a2')};
        --b: ${token('b')};
        --r: ${token('r')};
        --r-sm: ${token('r-sm')};
        --t-schnell: ${token('t-schnell')};
        --e-feder: ${token('e-feder')};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 34px 38px 60px;
        background: var(--grund); color: var(--t);
        font: ${token('f-text')} / 1.6 ${token('sans')};
      }
      h1 { margin: 0 0 6px; font-size: ${token('f-titel')}; font-weight: 600; letter-spacing: .06em; }
      h1 b { color: var(--a); font-weight: 600; }
      p.hinweis { margin: 0 0 30px; color: var(--t3); max-width: 78ch; }
      h2 {
        margin: 38px 0 14px; font-size: ${token('f-klein')}; font-weight: 600;
        letter-spacing: .18em; text-transform: uppercase; color: var(--t3);
      }
      .reihe { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
      .karte {
        margin: 0; display: flex; gap: 12px; align-items: center; padding: 12px;
        border: 1px solid ${token('b2')}; border-radius: var(--r);
      }
      .karte code { font: ${token('f-klein')} / 1.4 ${token('mono')}; color: var(--a); }
      .karte span { display: block; color: var(--t2); }
      .karte small { display: block; color: var(--t3); font-size: ${token('f-klein')}; }
      .probe { flex: none; width: 46px; height: 46px; border-radius: var(--r-sm); border: 1px solid #ffffff14; }
      .flaeche { flex: none; width: 46px; height: 46px; background: ${token('s')}; border: 1px solid ${token('b')}; }
      .dunkel { background: #00000059; }
      .schweb { flex: none; width: 46px; height: 46px; border-radius: var(--r); background: ${token('s')}; }
      .zeile { display: flex; align-items: baseline; gap: 16px; padding: 6px 0; border-bottom: 1px solid ${token('b2')}; }
      .zeile code { flex: none; width: 92px; font: ${token('f-klein')} ${token('mono')}; color: var(--a); }
      .zeile small { margin-left: auto; color: var(--t3); font-size: ${token('f-klein')}; }
      .lauf {
        display: grid; grid-template-columns: 26px 1fr; grid-template-rows: auto auto;
        gap: 2px 12px; align-items: center; text-align: left; cursor: pointer;
        padding: 12px; border: 1px solid ${token('b2')}; border-radius: var(--r);
        background: none; color: inherit; font: inherit;
        transition: border-color var(--t-schnell) var(--e-feder);
      }
      .lauf:hover { border-color: ${token('b')}; }
      .lauf code { grid-column: 2; font: ${token('f-klein')} ${token('mono')}; color: var(--a); }
      .lauf small { grid-column: 2; color: var(--t3); font-size: ${token('f-klein')}; }
      .lauf .punkt {
        grid-row: 1 / span 2; width: 18px; height: 18px; border-radius: var(--r-rund);
        background: var(--a); justify-self: start;
      }
      /* **Die Probe:** der Punkt läuft bei jedem Klick einmal — mit der Dauer und der Kurve des Tokens. */
      .lauf.an .punkt { animation: lauf var(--d) var(--e-feder) both; }
      @keyframes lauf {
        from { transform: translateX(0) scale(.6); }
        to { transform: translateX(190px) scale(1); }
      }
      footer { margin-top: 46px; color: var(--t3); font-size: ${token('f-klein')}; }
    </style>
  </head>
  <body>
    <h1><b>Prometheus</b> — Gestaltung der Welt</h1>
    <p class="hinweis">
      Erzeugt aus <code>apps/universe/src/app.css</code>. Jeder Wert steht auf seinem echten
      Untergrund, jede Dauer läuft auf Klick. Wer eine Zahl ändert, ändert sie im Blatt und läuft
      dieses Werkzeug neu — die Datei hier ist ein Ergebnis, keine Quelle.
    </p>

    <h2>Farbe</h2>
    <div class="reihe">
${farbkarten}
    </div>

    <h2>Schrift</h2>
${schriftproben}

    <h2>Form</h2>
    <div class="reihe">
${radiusproben}
    </div>

    <h2>Höhe</h2>
    <div class="reihe">
${schattenproben}
    </div>

    <h2>Bewegung — zum Drücken</h2>
    <div class="reihe">
${dauerproben}
    </div>

    <footer>
      Vier Dauern, vier Kurven, sechs Formen, drei Höhen. Wer keine Bewegung will, bekommt keine:
      <code>@media (prefers-reduced-motion: reduce)</code> setzt die Dauern auf 1 ms — ohne ein
      einziges <code>!important</code>.
    </footer>

    <script>
      // Die Probe: einmal anklicken, einmal laufen lassen. Kein Rahmenwerk, keine Abhängigkeit.
      for (const knopf of document.querySelectorAll('.lauf')) {
        knopf.addEventListener('click', () => {
          knopf.classList.remove('an')
          void knopf.offsetWidth
          knopf.classList.add('an')
        })
      }
    </script>
  </body>
</html>
`

// ── Schreiben oder vergleichen ──────────────────────────────────────────────────────────────

const dateien = [
  { pfad: join(ZIEL, 'world-design-tokens.json'), inhalt: `${JSON.stringify(daten, null, 2)}\n` },
  { pfad: join(ZIEL, 'world-design-preview.html'), inhalt: blatt },
]

if (nurPruefen) {
  const fehler = []
  for (const datei of dateien) {
    let vorhanden = null
    try {
      vorhanden = readFileSync(datei.pfad, 'utf8')
    } catch {
      fehler.push(`fehlt: ${datei.pfad}`)
      continue
    }
    if (vorhanden !== datei.inhalt) fehler.push(`abweichend: ${datei.pfad}`)
  }
  if (fehler.length > 0) {
    console.log(`FEHLER: ${String(fehler.length)}`)
    for (const f of fehler) console.log(`   ${f}`)
    console.log('')
    console.log('BEFUND: die erzeugten Gestaltungsdateien stimmen nicht mit app.css überein.')
    console.log('        In Ordnung bringen: bun tools/design-tokens.mjs')
    process.exit(1)
  }
  console.log(`Geprueft: ${String(dateien.length)} Dateien stimmen mit src/app.css ueberein.`)
  process.exit(0)
}

mkdirSync(ZIEL, { recursive: true })
for (const datei of dateien) writeFileSync(datei.pfad, datei.inhalt, 'utf8')
console.log(`Geschrieben: ${String(dateien.length)} Dateien nach ${ZIEL}`)
console.log(`   world-design-tokens.json    ${String(FARBEN.length)} Farben · ${String(RADIEN.length)} Formen · ${String(SCHATTEN.length)} Hoehen · ${String(DAUERN.length)} Dauern`)
console.log(`   world-design-preview.html   das Blatt zum Ansehen`)
