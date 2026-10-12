/**
 * Projektion der Dokumente in den Baum, den VitePress liest.
 *
 * Vorbild ist `website/build.ts` der Core-Vorlage: dort wird aus einem Manifest ein
 * generierter Quellbaum gebaut, den `srcDir` dann als Sitewurzel liest (`srcDir: '.generated'`).
 * Hier dasselbe, nur schlanker: Quelldateien werden unverändert kopiert, damit relative
 * Verweise zwischen den Dokumenten (`../INDEX.md`, `../design/…`) weiter stimmen.
 *
 * Aufruf: `bun run project` (läuft bei `dev` und `build` automatisch zuerst).
 */

import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DOCS_ROOT, GENERATED_ROOT, docsPages } from './docs.ts'

rmSync(GENERATED_ROOT, { recursive: true, force: true })
mkdirSync(GENERATED_ROOT, { recursive: true })

let copied = 0
for (const page of docsPages) {
  const target = join(GENERATED_ROOT, ...page.route.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(DOCS_ROOT, ...page.route.split('/')), target)
  copied++
}

console.log(`website: ${copied} Dokumente nach .generated/ projiziert`)
