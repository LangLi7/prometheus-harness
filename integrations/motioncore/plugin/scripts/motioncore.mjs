/**
 * `integrations/motioncore/plugin/scripts/motioncore.mjs` — Motion-Tokens und -Audit.
 *
 * ## Warum es das gibt
 *
 * „Alles 300 ms ease-in-out" ist der häufigste Grund, warum eine Seite nach
 * Vorlage klingt. Motion braucht **wenige, benannte Werte** (Dauer, Kurve,
 * Staffelung) und eine Prüfung, die Abweichungen findet. Genau das macht dieses
 * Skript — deterministisch, ohne Browser und ohne Modell.
 *
 * ```text
 * bun motioncore.mjs tokens --preset editorial --out tokens.css
 * bun motioncore.mjs audit ./mein-projekt
 * bun motioncore.mjs review ./mein-projekt
 * ```
 *
 * ## Was es nicht tut
 *
 * Es rendert nichts und beurteilt keine Ästhetik. Es liest CSS/HTML/JSX nach
 * Dauer, Kurve und `prefers-reduced-motion` und meldet Verstöße gegen die
 * Hausregeln. Die Entscheidung bleibt beim Menschen.
 *
 * @module integrations/motioncore/scripts/motioncore
 */

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

/** Voreinstellungen: dieselben Rollen, unterschiedliches Tempo. */
const PRESETS = {
  calm: {
    micro: 120, ui: 180, scene: 320, stagger: 30, distance: 10,
    standard: 'cubic-bezier(.2,.7,.2,1)',
    enter: 'cubic-bezier(.16,1,.3,1)',
    exit: 'cubic-bezier(.4,0,1,1)',
  },
  editorial: {
    micro: 150, ui: 240, scene: 480, stagger: 45, distance: 14,
    standard: 'cubic-bezier(.2,.8,.2,1)',
    enter: 'cubic-bezier(.16,1,.3,1)',
    exit: 'cubic-bezier(.4,0,1,1)',
  },
  kinetic: {
    micro: 180, ui: 300, scene: 600, stagger: 60, distance: 20,
    standard: 'cubic-bezier(.2,.8,.2,1)',
    enter: 'cubic-bezier(.34,1.56,.64,1)',
    exit: 'cubic-bezier(.4,0,1,1)',
  },
}

const DATEI_ENDUNGEN = new Set(['.css', '.scss', '.html', '.vue', '.svelte', '.jsx', '.tsx', '.js', '.ts', '.astro'])
const IGNORIEREN = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'graphify-out', '.tmp', 'coverage'])
const MAX_DATEIEN = 250
const MAX_BYTES = 400_000

function abbruch(text) {
  process.stderr.write(`motioncore: ${text}\n`)
  process.exit(1)
}

function schalter(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

function positionale(argv) {
  const werte = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === undefined) continue
    if (value.startsWith('--')) {
      index += 1
      continue
    }
    werte.push(value)
  }
  return werte
}

/** Erzeugt die Token-Datei. */
async function tokens(argv) {
  const presetName = schalter(argv, '--preset') ?? 'editorial'
  const preset = PRESETS[presetName]
  if (preset === undefined) abbruch(`unbekanntes Preset: ${presetName} (calm, editorial, kinetic)`)
  const out = schalter(argv, '--out') ?? 'tokens.css'
  const jsonOut = schalter(argv, '--json')

  const css = `/* Motion-Tokens — Preset ${presetName}. Quelle: integrations/motioncore. */
:root {
  --motion-dur-micro: ${preset.micro}ms;
  --motion-dur-ui: ${preset.ui}ms;
  --motion-dur-scene: ${preset.scene}ms;
  --motion-stagger: ${preset.stagger}ms;
  --motion-distance: ${preset.distance}px;
  --motion-ease-standard: ${preset.standard};
  --motion-ease-enter: ${preset.enter};
  --motion-ease-exit: ${preset.exit};
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-dur-micro: 1ms;
    --motion-dur-ui: 1ms;
    --motion-dur-scene: 1ms;
    --motion-stagger: 0ms;
    --motion-distance: 0px;
  }
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
`
  await writeFile(out, css, { encoding: 'utf8' })
  process.stdout.write(`${resolve(out)}\n`)
  if (jsonOut !== undefined) {
    await writeFile(jsonOut, `${JSON.stringify({ preset: presetName, ...preset }, undefined, 2)}\n`, { encoding: 'utf8' })
    process.stdout.write(`${resolve(jsonOut)}\n`)
  }
}

/** Sammelt die relevanten Dateien. */
async function sammle(root, gefunden = [], tiefe = 0) {
  if (gefunden.length >= MAX_DATEIEN || tiefe > 8) return gefunden
  let eintraege
  try {
    eintraege = await readdir(root, { withFileTypes: true })
  } catch {
    return gefunden
  }
  for (const eintrag of eintraege) {
    if (gefunden.length >= MAX_DATEIEN) break
    if (eintrag.name.startsWith('.') && eintrag.name !== '.well-known') continue
    const pfad = join(root, eintrag.name)
    if (eintrag.isDirectory()) {
      if (IGNORIEREN.has(eintrag.name)) continue
      await sammle(pfad, gefunden, tiefe + 1)
    } else if (DATEI_ENDUNGEN.has(extname(eintrag.name).toLowerCase())) {
      gefunden.push(pfad)
    }
  }
  return gefunden
}

/** Prüft ein Ziel und liefert die Messwerte. */
async function messe(ziel) {
  const dateien = await sammle(resolve(ziel))
  const dauern = []
  const ambientDauern = []
  const kurven = new Map()
  const befunde = []
  const variablen = new Map()
  let animationen = 0
  let ambient = 0
  let linearInteraction = 0
  let reducedMotion = false
  let transitionAll = 0

  for (const pfad of dateien) {
    let text
    try {
      const bytes = await readFile(pfad)
      if (bytes.length > MAX_BYTES) continue
      text = bytes.toString('utf8')
    } catch {
      continue
    }
    if (/prefers-reduced-motion/i.test(text)) reducedMotion = true
    transitionAll += (text.match(/transition\s*:\s*all\b/gi) ?? []).length

    // Eigene Variablen sammeln, damit `var(--motion-dur-ui)` nicht als „0 ms" zählt.
    for (const treffer of text.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) {
      if (!variablen.has(treffer[1])) variablen.set(treffer[1], (treffer[2] ?? '').trim())
    }

    const deklarationen = [
      ...(text.match(/transition(?:-property)?\s*:\s*[^;}\n]+/gi) ?? []),
      ...(text.match(/animation\s*:\s*[^;}\n]+/gi) ?? []),
    ]
    for (const deklaration of deklarationen) {
      animationen += 1
      const aufgeloest = deklaration.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name) => variablen.get(name) ?? '')
      // Ambient: endlose Rotation/Laufband. Dort sind lange Dauer und `linear` richtig,
      // nicht Abweichung — sonst meldet jeder Marquee einen Fehlalarm.
      const istAmbient = /\binfinite\b/i.test(aufgeloest) && /(?:spin|marquee|orbit|float|rotate|pulse|shimmer|drift|blink|ticker)/i.test(aufgeloest)
      if (istAmbient) ambient += 1
      for (const treffer of aufgeloest.matchAll(/(\d*\.?\d+)\s*(ms|s)\b/gi)) {
        const wert = Number(treffer[1]) * (treffer[2].toLowerCase() === 's' ? 1000 : 1)
        if (!Number.isFinite(wert) || wert <= 0) continue
        if (istAmbient) ambientDauern.push(Math.round(wert))
        else dauern.push(Math.round(wert))
      }
      for (const treffer of aufgeloest.matchAll(/cubic-bezier\([^)]*\)|steps\([^)]*\)|\b(ease-in-out|ease-in|ease-out|ease|linear)\b/gi)) {
        const name = treffer[0].toLowerCase()
        kurven.set(name, (kurven.get(name) ?? 0) + 1)
        if (!istAmbient && name === 'linear') linearInteraction += 1
      }
    }
    for (const treffer of text.matchAll(/cubic-bezier\([^)]*\)/gi)) {
      kurven.set(treffer[0].toLowerCase(), (kurven.get(treffer[0].toLowerCase()) ?? 0) + 1)
    }
  }

  const einzigartig = [...new Set(dauern)].sort((a, b) => a - b)
  if (animationen > 0 && !reducedMotion) {
    befunde.push({ stufe: 'error', text: 'kein `prefers-reduced-motion` bei vorhandenen Animationen' })
  }
  if (transitionAll > 0) {
    befunde.push({ stufe: 'error', text: `\`transition: all\` ${transitionAll}× — nur Eigenschaften nennen` })
  }
  if (dauern.some((dauer) => dauer > 600)) {
    befunde.push({ stufe: 'warn', text: 'Dauer über 600 ms — Szene prüfen, ob sie wirklich so lang ist' })
  }
  if (dauern.some((dauer) => dauer < 80)) {
    befunde.push({ stufe: 'warn', text: 'Dauer unter 80 ms — wirkt wie ein Sprung' })
  }
  if (linearInteraction > 0) {
    befunde.push({ stufe: 'warn', text: '`linear` gefunden — nur für Fortschritt/Rotation gedacht' })
  }
  if (einzigartig.length > 7) {
    befunde.push({ stufe: 'warn', text: `${einzigartig.length} verschiedene Dauern — auf drei Rollen zurückführen` })
  }
  if (animationen === 0) {
    befunde.push({ stufe: 'info', text: 'keine Transition/Animation gefunden — statisch oder JS-getrieben' })
  }
  if (![...kurven.keys()].some((name) => name.startsWith('cubic-bezier')) && animationen > 0) {
    befunde.push({ stufe: 'warn', text: 'keine eigene Kurve — `ease`/`ease-in-out` ist die Vorgabe des Browsers' })
  }

  return {
    dateien: dateien.length,
    animationen,
    ambient,
    dauern,
    ambientDauern,
    einzigartig,
    kurven: [...kurven.entries()].sort((a, b) => b[1] - a[1]),
    reducedMotion,
    transitionAll,
    befunde,
  }
}

function bericht(m) {
  const zeilen = [
    `Dateien      ${m.dateien}`,
    `Deklarationen ${m.animationen}`,
    `Dauern       ${m.dauern.length} gesamt, ${m.einzigartig.length} verschieden`,
    `Spanne       ${m.einzigartig[0] ?? '-'} ms … ${m.einzigartig.at(-1) ?? '-'} ms`,
    `Ambient      ${m.ambient} Deklarationen${m.ambientDauern.length > 0 ? ` (${[...new Set(m.ambientDauern)].join(', ')} ms, nicht gewertet)` : ''}`,
    `Kurven       ${m.kurven.map(([name, count]) => `${name} (${count})`).join(', ') || '-'}`,
    `reduced      ${m.reducedMotion ? 'vorhanden' : 'fehlt'}`,
    '',
  ]
  for (const befund of m.befunde) zeilen.push(`${befund.stufe.toUpperCase().padEnd(5)} ${befund.text}`)
  return zeilen.join('\n')
}

async function audit(argv) {
  const ziel = positionale(argv)[0]
  if (ziel === undefined) abbruch('audit braucht ein Verzeichnis.')
  const m = await messe(ziel)
  process.stdout.write(`${bericht(m)}\n`)
  process.exitCode = m.befunde.some((befund) => befund.stufe === 'error') ? 1 : 0
}

async function review(argv) {
  const ziel = positionale(argv)[0]
  if (ziel === undefined) abbruch('review braucht ein Verzeichnis.')
  const m = await messe(ziel)
  process.stdout.write(`${bericht(m)}\n\n`)
  process.stdout.write(`Checkliste:
1. Genau eine Sache bewegt sich pro Abschnitt.
2. Dauer aus drei Rollen (micro/ui/scene), nicht pro Komponente neu.
3. Staffelung 30–60 ms zwischen Karten, nicht mehr.
4. Distanz 8–24 px; große Sprünge sind Szenen, keine Hover-Effekte.
5. Nur transform und opacity animieren; nie width/height/top/left.
6. reduced-motion schaltet Bewegung ab, nicht nur schneller.
7. Kein Idle-Wobble: Bewegung passiert auf Ereignis, nicht in Schleife.
8. Exit-Kurve ist nicht die Enter-Kurve.
`)
  process.exitCode = m.befunde.some((befund) => befund.stufe === 'error') ? 1 : 0
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'tokens') await tokens(rest)
else if (command === 'audit') await audit(rest)
else if (command === 'review') await review(rest)
else abbruch(`unbekannt: ${command ?? '(nichts)'}. Erlaubt: tokens, audit, review.`)
