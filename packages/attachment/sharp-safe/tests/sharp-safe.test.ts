/**
 * Prüfungen für `sharp-safe`: dieselben Aufrufe wie der Anhang-Pfad, aber im
 * Kindprozeß — und der Beweis, daß ein Absturz des Helfers den Aufrufer nicht
 * mitnimmt.
 */
import { describe, expect, test } from 'bun:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HIER, '..', '..', '..', '..')
const require_ = createRequire(import.meta.url)

/**
 * Den Helfer abfangen, **bevor** `sharp-safe` `spawn` bindet.
 *
 * Nur so läßt sich der Fehler stellen, den der Wirt sonst nicht sieht: ein
 * Rohrbruch am Helfer. Er kommt als `'error'`-Event auf `stdin` an, und ohne
 * Zuhörer beendet die Laufzeit den **ganzen** Prozess (gemessen am 27.10.2026:
 * der Host starb mit `exit 1`).
 */
const cp = require_('node:child_process') as typeof import('node:child_process')
const echterSpawn = cp.spawn
let letzterHelfer: import('node:child_process').ChildProcess | null = null
cp.spawn = ((...args: Parameters<typeof echterSpawn>) => {
  const kind = echterSpawn(...args)
  const argv = args[1] as readonly string[] | undefined
  if (String(argv?.[0] ?? '').includes('worker.mjs')) letzterHelfer = kind
  return kind
}) as typeof echterSpawn

const sharpSafe = require_(join(ROOT, 'packages', 'attachment', 'sharp-safe', 'index.cjs')) as (
  eingabe: Buffer | string,
  optionen?: Record<string, unknown>,
) => any

const PNG = readFileSync(join(ROOT, 'assets', 'avatar', 'prometheus-avatar.png'))

describe('sharp-safe', () => {
  test('metadata kommt aus dem Helfer', async () => {
    const metadaten = await sharpSafe(PNG, { failOn: 'error', limitInputPixels: false }).metadata()
    expect(metadaten.format).toBe('png')
    expect(metadaten.width).toBeGreaterThan(0)
    expect(metadaten.height).toBeGreaterThan(0)
  }, 30000)

  test('die Kette des Anhang-Pfads: rotate, srgb, resize, jpeg', async () => {
    const { data, info } = await sharpSafe(PNG, { failOn: 'error', limitInputPixels: false })
      .rotate()
      .toColourspace('srgb')
      .resize({ width: 64, height: 64, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    expect(data.length).toBeGreaterThan(0)
    expect(info.format).toBe('jpeg')
    expect(info.width).toBeLessThanOrEqual(64)
    expect(info.height).toBeLessThanOrEqual(64)
  }, 30000)

  test('clone trennt die Qualitaetsstufen (wie encodingLadder)', async () => {
    const vorbereitet = sharpSafe(PNG, { failOn: 'error', limitInputPixels: false })
      .rotate()
      .toColourspace('srgb')
      .resize({ width: 48, height: 48, fit: 'inside' })
    const klein = await vorbereitet.clone().jpeg({ quality: 60 }).toBuffer({ resolveWithObject: true })
    const gross = await vorbereitet.clone().jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })
    expect(klein.data.length).toBeGreaterThan(0)
    expect(gross.data.length).toBeGreaterThan(klein.data.length)
  }, 60000)

  test('ein Absturz des Helfers toetet den Aufrufer nicht', async () => {
    // Erst laden, damit der Helfer sicher laeuft.
    await sharpSafe(PNG).metadata()
    await expect(sharpSafe(PNG)._beendeHelferFuerPruefung()).rejects.toThrow(/Helfer beendet/)
    // Der naechste Aufruf startet einen neuen Helfer — der Aufrufer lebt.
    const danach = await sharpSafe(PNG).metadata()
    expect(danach.format).toBe('png')
  }, 60000)

  test('ein Rohrbruch am Helfer toetet den Aufrufer nicht', async () => {
    // Ein frischer Helfer, damit `letzterHelfer` sicher der laufende ist.
    await sharpSafe(PNG).metadata()
    await sharpSafe(PNG)._beendeHelferFuerPruefung().catch(() => {})
    await sharpSafe(PNG).metadata()
    expect(letzterHelfer).not.toBeNull()

    // Windows meldet das so, wenn die Gegenseite der Pipe weg ist.
    const epipe = Object.assign(new Error('EPIPE: broken pipe, write'), { code: 'EPIPE', errno: -4047 })
    letzterHelfer!.stdin?.destroy(epipe)
    await new Promise((r) => setTimeout(r, 150))

    // Ohne Zuhörer beendet dieses Event den Prozess. Mit Zuhörer gilt der
    // Helfer als verloren — und der nächste Aufruf startet einen neuen.
    const danach = await sharpSafe(PNG).metadata()
    expect(danach.format).toBe('png')
  }, 60000)
})
