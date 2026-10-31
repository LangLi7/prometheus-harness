/**
 * Das Bündel — die fünf Angaben, ohne die es in keiner Plugin-Liste erscheint.
 *
 * **Warum es diesen Test gibt.** Ein Bündel ist keine Logik, die man beim Lesen prüft: es ist eine
 * Handvoll Felder, und **fehlt eines, ist es still kein Bündel mehr**. Der Kern prüft das an seiner
 * eigenen Stelle (`manifest.dsh.bundle.patch === undefined → kein Bündel`), aber er sagt es nicht
 * laut — das Paket verschwindet einfach aus der Liste. Jede dieser Angaben hat hier einen Fall.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAKET = join(import.meta.dir, '..')

function lies(datei: string): string {
  return readFileSync(join(PAKET, datei), 'utf8')
}

interface Manifest {
  readonly name?: string
  readonly version?: string
  readonly icon?: string
  readonly license?: string
  readonly private?: boolean
  readonly exports?: Record<string, string>
  readonly files?: readonly string[]
  readonly repository?: { readonly directory?: string }
  readonly dsh?: { readonly bundle?: { readonly patch?: string } }
}

const manifest = JSON.parse(lies('package.json')) as Manifest

describe('Der Marker: ohne ihn ist es kein Bündel', () => {
  test('dsh.bundle.patch zeigt auf eine Datei', () => {
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })

  test('die genannte Datei EXISTIERT wirklich', () => {
    // Ein Marker auf eine fehlende Datei ist schlimmer als kein Marker: der Composer bricht ab,
    // und die Ursache steht in einer Zeile, die wie eine Nebensache aussieht.
    const pfad = manifest.dsh?.bundle?.patch ?? ''
    expect(existsSync(join(PAKET, pfad))).toBe(true)
  })
})

describe('Die Angaben für die Liste', () => {
  test('ein Zeichen ist angekündigt und vorhanden — und es ist ein SVG', () => {
    expect(manifest.icon).toBe('./icon.svg')
    const svg = lies('icon.svg')
    expect(svg.trimStart().startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
  })

  test('Titel und Beschreibung stehen auf ENGLISCH und auf DEUTSCH', () => {
    for (const sprache of ['en', 'de']) {
      const eintrag = JSON.parse(lies(`locale/${sprache}.json`)) as {
        meta?: { title?: string; description?: string }
      }
      expect(eintrag.meta?.title ?? '').not.toBe('')
      expect(eintrag.meta?.description ?? '').not.toBe('')
      // **Der Satz ist der, den das Fenster zeigt** — er darf nicht leer sein, sonst erscheint das
      // Bündel ohne Beschreibung.
      expect((eintrag.meta?.description ?? '').length).toBeGreaterThan(20)
    }
  })

  test('die Locale-Dateien sind exportiert und mitgeliefert', () => {
    // Ohne beides findet der Loader sie nicht — und die Liste zeigt nichts an.
    expect(manifest.exports?.['./locale/*.json']).toBe('./locale/*.json')
    expect(manifest.files).toContain('locale/*.json')
    expect(manifest.exports?.['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    expect(manifest.files).toContain('cordis.patch.yml')
  })
})

describe('Der Eintrag selbst', () => {
  const patch = lies('cordis.patch.yml')

  test('genau EINE insert-Zeile', () => {
    // Von den vier Units ist nur `ai-ranking` ein Plugin. Eine zweite Zeile wäre entweder falsch
    // oder ein Duplikat — und ein Duplikat wirft beim Start.
    expect((patch.match(/- insert:/g) ?? []).length).toBe(1)
  })

  test('die Kennung paßt zum Plugin-Namen', () => {
    expect(patch).toContain('id: pmh-ai-ranking')
    expect(patch).toContain("'@prometheus-harness/ai-ranking'")
  })

  test('die Kollisionsregel steht IN der Datei, an der sie gilt', () => {
    // Der Core wirft bei doppeltem `(kind, path)`. Wer diese Zeile ein zweites Mal einträgt
    // (etwa zusätzlich in `scripts/profile-patch.mjs`), bekommt einen Host, der nicht startet.
    // Die Warnung muß dort stehen, wo die Gefahr ist — nicht in einem Dokument daneben.
    expect(patch).toContain('profile-patch.mjs')
    expect(patch.toLowerCase()).toContain('entweder')
    expect(patch).toContain('(kind, path)')
  })

  test('die drei Bibliotheken stehen NICHT im Patch — sie sind keine Plugins', () => {
    for (const bibliothek of ['@prometheus-harness/tariffs', '@prometheus-harness/ranking', '@prometheus-harness/router']) {
      expect(patch).not.toContain(bibliothek)
    }
  })
})

// ---------------------------------------------------------------------------
// Installierbar — die Vorbedingungen, die der Kern prüft
// ---------------------------------------------------------------------------

describe('Installierbar', () => {
  test('das Paket ist NICHT private — der Kern weist private Ziele ab', () => {
    // **Der eine Wert, an dem die Installation scheitert.** `app-boot` prüft beim
    // Installationsziel `manifest.private === true` und lehnt ab. Alle anderen Pakete dieses
    // Repos sind `private: true` — dieses ist die bewußte Ausnahme, weil es installiert wird.
    expect(manifest.private).toBeUndefined()
  })

  test('Name, Fassung und Lizenz stehen da', () => {
    expect(manifest.name).toBe('@prometheus-harness/ai-stack')
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/u)
    expect(manifest.license).toBe('MIT')
  })

  test('das Repository nennt den Unterordner — sonst findet ein Git-Install nichts', () => {
    expect(manifest.repository?.directory).toBe('packages/bundle/ai-stack')
  })

  test('package.json ist selbst exportiert — der Manager liest es', () => {
    expect(manifest.exports?.['./package.json']).toBe('./package.json')
  })

  test('der Eintrag steht im Patch unter seinem eigenen Namen', () => {
    // Ein Bündel, dessen Patch ein fremdes Paket einträgt, wäre ein Bündel, das etwas anderes
    // installiert als es heißt.
    const patch = lies('cordis.patch.yml')
    expect(patch).toContain("'@prometheus-harness/ai-ranking'")
  })
})
