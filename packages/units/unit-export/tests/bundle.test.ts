/**
 * Bündelformat: Aufbau, Digest, Pfadsicherheit.
 *
 * Die Pfadprüfung ist eine **Sicherheitsgrenze**: ein Bündel ist Fremddaten.
 * Jede Ablehnung hat hier einen eigenen Test, nicht nur einen Sammeltest.
 */

import { describe, expect, test } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'

import {
  BUNDLE_FORMAT,
  BUNDLE_HEADER_BYTES,
  BUNDLE_MAGIC,
  buildBundle,
  bundleDigestOf,
  checkBundle,
  computeContentDigest,
  DIGEST_PLACEHOLDER,
  digestLabel,
  encodeBuiltBundle,
  encodeBundle,
  loadBundleFile,
  planExtract,
  validateRelativePath,
} from '../src/bundle.ts'
import { parseManifest } from '../src/manifest.ts'
import { FROZEN_TIMESTAMP, tempRoot, writeStandardTree, writeUnit } from './fixtures.ts'

function manifestOf(json: Record<string, unknown>): ReturnType<typeof parseManifest> {
  return parseManifest({ json })
}

async function builtFixture(): Promise<{ bundle: Awaited<ReturnType<typeof buildBundle>>; cleanup: () => Promise<void> }> {
  const root = await tempRoot()
  await writeStandardTree(root.path)
  const base = manifestOf({
    name: 'pmh-test-base',
    version: '1.2.0',
    kind: 'plugin',
    language: 'typescript',
    description: 'x',
    core: 'required_core',
    requires: [],
    provides: ['base-capability'],
    platforms: [],
    contract: '^0.2.0',
  })
  const router = manifestOf({
    name: 'pmh-test-router',
    version: '2.0.1',
    kind: 'plugin',
    language: 'typescript',
    description: 'x',
    core: 'required_core',
    requires: ['pmh-test-base'],
    provides: ['model-routing'],
    platforms: [],
    contract: '^0.2.0',
  })
  if (!base.ok || !router.ok) throw new Error('Vorlagen sind ungültig')
  const bundle = await buildBundle(
    router.value,
    root.child('pmh-test-router'),
    [{ manifest: base.value, directory: root.child('pmh-test-base') }],
    { createdAt: FROZEN_TIMESTAMP },
  )
  return { bundle, cleanup: root.cleanup }
}

describe('Containerformat', () => {
  test('die Kopfzeile ist genau 66 Bytes und trägt Magic und Formatversion', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      expect(bytes.toString('ascii', 0, 8)).toBe(BUNDLE_MAGIC)
      expect(bytes.toString('ascii', 8, 9)).toBe('\n')
      expect(bytes.toString('ascii', 9, 21)).toBe('000000000001')
      expect(BUNDLE_HEADER_BYTES).toBe(66)
      expect(bytes.subarray(62, 66).toString('ascii')).toBe('    ')
      expect(bytes[61]).toBe(0x0a)
    }
    finally {
      await cleanup()
    }
  })

  test('die deklarierten Längen passen zu den tatsächlichen Bytes', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      const manifestLength = Number.parseInt(bytes.toString('ascii', 22, 34), 10)
      const payloadLength = Number.parseInt(bytes.toString('ascii', 35, 47), 10)
      expect(payloadLength).toBe(bundle.payload.byteLength)
      expect(bytes.byteLength).toBe(BUNDLE_HEADER_BYTES + manifestLength + 12 + payloadLength)
    }
    finally {
      await cleanup()
    }
  })

  test('Hashes und Offsets sind lückenlos und vollständig', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      let offset = 0
      for (const file of bundle.manifest.files) {
        expect(file.offset).toBe(offset)
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
        offset += file.size
      }
      expect(offset).toBe(bundle.payload.byteLength)
    }
    finally {
      await cleanup()
    }
  })

  test('Dateien sind stabil sortiert (Unit, dann Pfad)', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const keys = bundle.manifest.files.map((file) => `${file.unit}/${file.path}`)
      expect(keys).toEqual([...keys].sort())
      expect(keys[0]?.startsWith('pmh-test-base/')).toBe(true)
    }
    finally {
      await cleanup()
    }
  })

  test('das Bündel enthält den Abschluss und die Herkunft', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      expect(bundle.manifest.closure).toEqual(['pmh-test-router', 'pmh-test-base'])
      expect(bundle.manifest.source).toEqual({ unit: 'pmh-test-router', version: '2.0.1' })
      expect(bundle.manifest.createdAt).toBe(FROZEN_TIMESTAMP)
      expect(bundle.manifest.format).toBe(BUNDLE_FORMAT)
      expect(bundle.manifest.createdBy).toContain('unit-export')
      expect(bundle.manifest.entrypoint.length).toBeGreaterThan(0)
    }
    finally {
      await cleanup()
    }
  })

  test('zwei Läufe mit festgehaltenem Zeitstempel sind byte-gleich', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const first = encodeBuiltBundle(bundle)
      const second = encodeBuiltBundle(bundle)
      expect(first.equals(second)).toBe(true)
    }
    finally {
      await cleanup()
    }
  })
})

describe('checkBundle', () => {
  test('nimmt ein unverändertes Bündel an', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const check = checkBundle(encodeBuiltBundle(bundle))
      expect(check.errors).toEqual([])
      expect(check.ok).toBe(true)
      expect(check.bundle?.manifest.digest).toBe(bundle.manifest.digest)
      expect(check.bundle?.computedDigest).toBe(bundle.manifest.digest)
    }
    finally {
      await cleanup()
    }
  })

  test('lehnt ein gekürztes Bündel ab', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      const check = checkBundle(bytes.subarray(0, bytes.byteLength - 4))
      expect(check.ok).toBe(false)
      expect(check.errors.map((error) => error.code)).toContain('bundle_length_mismatch')
    }
    finally {
      await cleanup()
    }
  })

  test('lehnt eine falsche Magic ab', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      Buffer.from('NICHTBND').copy(bytes, 0)
      const check = checkBundle(bytes)
      expect(check.errors.map((error) => error.code)).toContain('bundle_header_invalid')
    }
    finally {
      await cleanup()
    }
  })

  test('lehnt eine nicht gelesene Formatversion ab', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      Buffer.from('000000000009').copy(bytes, 9)
      const check = checkBundle(bytes)
      expect(check.errors.map((error) => error.code)).toContain('bundle_format_version_unsupported')
    }
    finally {
      await cleanup()
    }
  })

  test('lehnt ein verändertes Manifest ab (H1)', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      const position = bytes.indexOf(Buffer.from('createdAt"', 'utf8'))
      expect(position).toBeGreaterThan(0)
      bytes[position] = 'C'.charCodeAt(0)
      const check = checkBundle(bytes)
      expect(check.ok).toBe(false)
      expect(check.errors.map((error) => error.code)).toContain('bundle_component_digest_mismatch')
    }
    finally {
      await cleanup()
    }
  })

  test('lehnt ein gekipptes Byte in der Nutzlast ab (Dateihash und Digest)', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      bytes[bytes.byteLength - 1] = (bytes[bytes.byteLength - 1] ?? 0) ^ 0xff
      const check = checkBundle(bytes)
      expect(check.ok).toBe(false)
      const codes = check.errors.map((error) => error.code)
      expect(codes).toContain('bundle_file_digest_mismatch')
      expect(codes).toContain('bundle_digest_mismatch')
    }
    finally {
      await cleanup()
    }
  })

  test('ein Digest ohne Deckung in den Bytes fällt auf', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const bytes = encodeBuiltBundle(bundle)
      const wrong = digestLabel('f'.repeat(64))
      const replaced = Buffer.from(bytes.toString('latin1').replace(bundle.manifest.digest, wrong), 'latin1')
      const check = checkBundle(replaced)
      expect(check.ok).toBe(false)
      expect(check.errors.map((error) => error.code)).toContain('bundle_digest_mismatch')
    }
    finally {
      await cleanup()
    }
  })

  test('meldet einen Pfadeintrag, der aus dem Zielordner zeigt', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const manifest = { ...bundle.manifest, files: bundle.manifest.files.map((file, index) => index === 0 ? { ...file, path: '../ausserhalb.txt' } : file) }
      const manifestForDigest = { ...manifest, digest: DIGEST_PLACEHOLDER }
      const rebuilt = bundleDigestOf(manifestForDigest, bundle.payload)
      const withDigest = { ...manifest, digest: rebuilt }
      const check = checkBundle(encodeBundle(withDigest, bundle.payload))
      expect(check.ok).toBe(false)
      expect(check.errors.map((error) => error.code)).toContain('path_traversal')
    }
    finally {
      await cleanup()
    }
  })

  test('meldet eine Abhängigkeit, die im Bündel fehlt', async () => {
    const { bundle, cleanup } = await builtFixture()
    try {
      const manifest = {
        ...bundle.manifest,
        units: [bundle.manifest.units[0] as (typeof bundle.manifest.units)[number]],
        files: bundle.manifest.files.filter((file) => file.unit === 'pmh-test-router'),
      }
      const digest = bundleDigestOf({ ...manifest, digest: DIGEST_PLACEHOLDER }, bundle.payload)
      const check = checkBundle(encodeBundle({ ...manifest, digest }, bundle.payload))
      expect(check.ok).toBe(false)
      expect(check.errors.map((error) => error.code)).toContain('bundle_dependency_missing')
    }
    finally {
      await cleanup()
    }
  })

  test('loadBundleFile meldet eine fehlende Datei als bundle_missing', async () => {
    const root = await tempRoot()
    try {
      const check = await loadBundleFile(root.child('gibtsnicht.pmhunit'))
      expect(check.ok).toBe(false)
      expect(check.errors[0]?.code).toBe('bundle_missing')
    }
    finally {
      await root.cleanup()
    }
  })

  test('liest ein geschriebenes Bündel von der Platte', async () => {
    const { bundle, cleanup } = await builtFixture()
    const root = await tempRoot()
    try {
      const path = root.child('test.pmhunit')
      await writeFile(path, encodeBuiltBundle(bundle))
      const check = await loadBundleFile(path)
      expect(check.ok).toBe(true)
      const raw = await readFile(path)
      expect(raw.byteLength).toBeGreaterThan(BUNDLE_HEADER_BYTES)
    }
    finally {
      await root.cleanup()
      await cleanup()
    }
  })
})

describe('validateRelativePath', () => {
  test('nimmt gewöhnliche Pfade an', () => {
    expect(validateRelativePath('src/index.ts')).toEqual([])
    expect(validateRelativePath('a/b/c/d.txt')).toEqual([])
    expect(validateRelativePath('unit.json')).toEqual([])
  })

  const rejected = [
    ['absoluter Pfad', '/etc/passwd', 'path_absolute'],
    ['Traversal mit ..', '../aussen.txt', 'path_traversal'],
    ['Traversal in der Mitte', 'a/../../aussen.txt', 'path_traversal'],
    ['nur ..', '..', 'path_traversal'],
    ['nur .', '.', 'path_traversal'],
    ['Laufwerksbuchstabe', 'C:/Windows/system32', 'path_drive_letter'],
    ['Laufwerksbuchstabe klein', 'c:datei.txt', 'path_drive_letter'],
    ['Backslash-Traversal', '..\\aussen.txt', 'path_backslash'],
    ['UNC-Pfad', '//server/share/x', 'path_unc'],
    ['Null-Byte', 'a\u0000b.txt', 'path_nul_byte'],
    ['leerer Pfad', '', 'path_empty'],
    ['leeres Segment', 'a//b.txt', 'path_empty_segment'],
    ['abschließender Schrägstrich', 'a/', 'path_empty_segment'],
    ['reservierter Gerätename', 'nul', 'path_segment_reserved_device'],
    ['reservierter Gerätename mit Endung', 'con.txt', 'path_segment_reserved_device'],
    ['reservierter Gerätename im Unterordner', 'src/aux', 'path_segment_reserved_device'],
    ['abschließender Punkt', 'name.', 'path_segment_trailing_dot'],
    ['abschließendes Leerzeichen', 'name ', 'path_segment_trailing_dot'],
    ['Doppelpunkt im Segment', 'a:b.txt', 'path_empty_segment'],
    ['Sternchen im Segment', 'a*b.txt', 'path_empty_segment'],
    ['Fragezeichen im Segment', 'a?b.txt', 'path_empty_segment'],
  ] as const satisfies readonly (readonly [string, string, string])[]

  for (const [label, path, code] of rejected) {
    test(`lehnt ${label} ab`, () => {
      const codes = validateRelativePath(path).map((error) => error.code)
      expect(codes).toContain(code)
    })
  }

  test('jede Ablehnung nennt den Ort', () => {
    const errors = validateRelativePath('../x', 'bundle:files[7].path')
    expect(errors[0]?.at).toBe('bundle:files[7].path')
  })
})

describe('planExtract', () => {
  test('plant nur Ziele innerhalb der Zielwurzel', async () => {
    const { bundle, cleanup } = await builtFixture()
    const root = await tempRoot()
    try {
      const bytes = encodeBuiltBundle(bundle)
      const check = checkBundle(bytes)
      expect(check.bundle).toBeDefined()
      const plan = planExtract(check.bundle as NonNullable<typeof check.bundle>, root.path)
      expect(plan.ok).toBe(true)
      expect(plan.plan.length).toBe(bundle.manifest.files.length)
      for (const item of plan.plan) {
        expect(item.absolute.startsWith(root.path)).toBe(true)
      }
    }
    finally {
      await root.cleanup()
      await cleanup()
    }
  })

  test('ein einziger unsicherer Eintrag ergibt einen leeren Plan', async () => {
    const { bundle, cleanup } = await builtFixture()
    const root = await tempRoot()
    try {
      const manifest = {
        ...bundle.manifest,
        files: bundle.manifest.files.map((file, index) => index === 0 ? { ...file, path: '../../entwischt.txt' } : file),
      }
      const digest = bundleDigestOf({ ...manifest, digest: DIGEST_PLACEHOLDER }, bundle.payload)
      const check = checkBundle(encodeBundle({ ...manifest, digest }, bundle.payload))
      if (check.bundle !== undefined) {
        const plan = planExtract(check.bundle, root.path)
        expect(plan.ok).toBe(false)
        expect(plan.plan).toEqual([])
      }
      else {
        // Schon die Bündelprüfung hat den Pfad abgelehnt — das ist ebenso richtig.
        expect(check.errors.map((error) => error.code)).toContain('path_traversal')
      }
    }
    finally {
      await root.cleanup()
      await cleanup()
    }
  })
})

describe('Digestberechnung', () => {
  test('der Inhaltsdigest hängt nicht am Zeitstempel', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-digest', files: { 'a.txt': 'inhalt\n' } })
      const manifest = manifestOf({
        name: 'pmh-digest',
        version: '1.0.0',
        kind: 'plugin',
        language: 'typescript',
        description: 'x',
        core: 'required_core',
      })
      if (!manifest.ok) throw new Error('Vorlage ungültig')
      const first = await buildBundle(manifest.value, root.child('pmh-digest'), [], { createdAt: '2026-01-01T00:00:00.000Z' })
      const second = await buildBundle(manifest.value, root.child('pmh-digest'), [], { createdAt: '2027-02-02T00:00:00.000Z' })
      expect(first.manifest.contentDigest).toBe(second.manifest.contentDigest)
      expect(first.manifest.digest).not.toBe(second.manifest.digest)
    }
    finally {
      await root.cleanup()
    }
  })

  test('der Inhaltsdigest ändert sich mit dem Inhalt', () => {
    const files = [{ unit: 'a', path: 'x', size: 1, sha256: 'a'.repeat(64), offset: 0 }]
    const other = [{ unit: 'a', path: 'x', size: 1, sha256: 'b'.repeat(64), offset: 0 }]
    expect(computeContentDigest(files)).not.toBe(computeContentDigest(other))
    expect(computeContentDigest(files)).toBe(computeContentDigest(files))
  })
})
