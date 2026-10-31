#!/usr/bin/env bun
/**
 * `sharp-safe` einhängen — als **nahestehende Auflösung**, nicht als Eingriff in
 * die gemeinsame `sharp`-Fassung.
 *
 * **Warum dieser Ort.** `@deepseek-ai/dsh-attachment-local` lädt `sharp` erst
 * beim ersten Bild (`createLazyRequire("sharp", import.meta.url)`). Die
 * Auflösung beginnt im Verzeichnis dieser Datei und geht nach oben. Ein
 * `sharp` unter `node_modules/@deepseek-ai/dsh-attachment-local/node_modules/`
 * gewinnt daher für **dieses** Paket — jedes andere Paket behält die echte
 * Fassung. Das ist die Entsprechung zu einem Nix-Override: derselbe Name, eine
 * andere Ableitung, nur für den Verbraucher, der sie braucht.
 *
 * **Rückweg.** `--entfernen` nimmt die Verknüpfung wieder weg. Die gemeinsame
 * `sharp`-Fassung wird in beiden Richtungen nicht angefaßt.
 *
 * Aufruf:
 *   bun scripts/sharp-safe-install.mjs            # einhängen
 *   bun scripts/sharp-safe-install.mjs --entfernen # Rückweg
 *   bun scripts/sharp-safe-install.mjs --status    # nur zeigen
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const QUELLE = join(ROOT, 'packages', 'attachment', 'sharp-safe')
const VERBRAUCHER = join(ROOT, 'node_modules', '@deepseek-ai', 'dsh-attachment-local')
const ZIEL = join(VERBRAUCHER, 'node_modules', 'sharp')

const modus = process.argv.includes('--entfernen')
  ? 'entfernen'
  : process.argv.includes('--status')
    ? 'status'
    : 'einhängen'

function istUnsereVerknuepfung(pfad) {
  try {
    const stat = lstatSync(pfad)
    if (!stat.isSymbolicLink()) return false
    return resolve(dirname(pfad), readlinkSync(pfad)) === resolve(QUELLE)
  } catch {
    return false
  }
}

if (!existsSync(QUELLE)) {
  console.error(`[sharp-safe] FEHLER: Quelle fehlt: ${QUELLE}`)
  process.exit(1)
}

if (!existsSync(VERBRAUCHER)) {
  console.error(`[sharp-safe] FEHLER: Verbraucher fehlt: ${VERBRAUCHER}`)
  process.exit(1)
}

if (modus === 'status') {
  if (istUnsereVerknuepfung(ZIEL)) {
    console.log(`[sharp-safe] eingehaengt -> ${relative(ROOT, QUELLE)}`)
    process.exit(0)
  }
  console.log(existsSync(ZIEL) ? '[sharp-safe] ZIEL ist belegt, aber nicht von uns' : '[sharp-safe] nicht eingehaengt')
  process.exit(0)
}

if (modus === 'entfernen') {
  if (istUnsereVerknuepfung(ZIEL)) {
    rmSync(ZIEL, { recursive: true, force: true })
    console.log('[sharp-safe] entfernt — die gemeinsame sharp-Fassung war nie betroffen')
    process.exit(0)
  }
  console.log('[sharp-safe] nichts zu entfernen')
  process.exit(0)
}

// einhängen
if (istUnsereVerknuepfung(ZIEL)) {
  console.log('[sharp-safe] war schon eingehaengt')
  process.exit(0)
}
if (existsSync(ZIEL)) {
  console.error(
    `[sharp-safe] FEHLER: ${relative(ROOT, ZIEL)} existiert und ist nicht unsere Verknuepfung — nichts wird geloescht`,
  )
  process.exit(1)
}

mkdirSync(dirname(ZIEL), { recursive: true })
symlinkSync(QUELLE, ZIEL, process.platform === 'win32' ? 'junction' : 'dir')
console.log(`[sharp-safe] eingehaengt: ${relative(ROOT, ZIEL)} -> ${relative(ROOT, QUELLE)}`)
