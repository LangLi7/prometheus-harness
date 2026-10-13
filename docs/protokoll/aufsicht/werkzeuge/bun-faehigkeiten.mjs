/**
 * bun-faehigkeiten.mjs — Wächter-Werkzeug (Aufsicht): die Laufzeit-Behauptungen nachmessen.
 *
 * WARUM. Der Rust-Befund (`docs/review/rust-bestand.md`) stützt seine Empfehlung „`crypto`
 * streichen" darauf, dass die Laufzeit Kryptografie und dauerhafte Schreibvorgänge **kann** — und
 * seine Empfehlung „`atomicfs` behalten" darauf, dass ein **Verzeichnis-fsync auf Windows
 * scheitert**. Beide Aussagen entscheiden über 685 + 623 Zeilen Rust. Sie sind billig nachmessbar,
 * ohne das Repo anzufassen: ein Verzeichnis öffnen, eine Datei syncen, ein paar globale Objekte
 * abfragen. Kein Schreibzugriff außer einer temporären Datei im Temp-Verzeichnis.
 *
 * Aufruf mit Bun:   bun run bun-faehigkeiten.mjs
 */
import { closeSync, fsyncSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as nodeFs from 'node:fs'

console.log(`Laufzeit: Bun ${globalThis.Bun?.version ?? '?'} auf ${process.platform}\n`)

const ordner = mkdtempSync(join(tmpdir(), 'aufsicht-probe-'))
const datei = join(ordner, 'probe.txt')
writeFileSync(datei, 'probe')

const versuch = (label, fn) => {
  try {
    fn()
    console.log(`  OK      ${label}`)
  } catch (error) {
    console.log(`  FEHLER  ${label}  ->  ${error.code ?? ''} ${String(error.message).split('\n')[0]}`)
  }
}

console.log('--- 1. Verzeichnis-fsync (die Behauptung, die über atomicfs entscheidet) ---')
versuch("Verzeichnis öffnen ('r') + sync()", () => {
  const fd = openSync(ordner, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
})
versuch('Verzeichnis öffnen (O_RDONLY als Konstante) + sync()', () => {
  const fd = openSync(ordner, nodeFs.constants.O_RDONLY)
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
})
versuch('DATEI öffnen + sync()  (Gegenprobe: muss OK sein)', () => {
  const fd = openSync(datei, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
})

console.log('\n--- 2. Was die Laufzeit an Kryptografie anbietet (entscheidet über crypto) ---')
const B = globalThis.Bun ?? {}
console.log(`  Bun.CryptoHasher          : ${typeof B.CryptoHasher}`)
console.log(`  Bun.password (Argon2id)   : ${typeof B.password}`)
console.log(`  Bun.hash                  : ${typeof B.hash}`)
console.log(`  node:crypto timingSafeEqual: ${typeof (await import('node:crypto')).timingSafeEqual}`)
versuch('SHA-256 über node:crypto', () => {
  const { createHash } = require('node:crypto')
  const h = createHash('sha256').update('probe').digest('hex')
  if (h.length !== 64) throw new Error('unerwartete Länge')
})
versuch('AES-256-GCM über node:crypto (createCipheriv)', () => {
  const { createCipheriv, randomBytes } = require('node:crypto')
  const key = randomBytes(32)
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.update('probe')
  c.final()
})
versuch('Argon2id über Bun.password.hash', () => {
  if (typeof B.password?.hash !== 'function') throw new Error('Bun.password.hash fehlt')
  const h = B.password.hashSync('probe', { algorithm: 'argon2id' })
  if (typeof h !== 'string' || h.length < 10) throw new Error('unerwartetes Ergebnis')
})

console.log('\n--- 3. Dateisperre (entscheidet über flock) ---')
console.log(`  node:fs.flock             : ${typeof nodeFs.flock}`)
console.log(`  node:fs.flockSync         : ${typeof nodeFs.flockSync}`)
console.log(`  Bun.file().lock?          : ${typeof (B.file?.('/')?.lock)}`)

/**
 * 3b. PTY — die erste Entscheidung der Sprachwahl-Recherche
 * (`docs/research/sprachwahl-entscheidung-2026.md` §1). Geprüft wird, was die **Laufzeit** anbietet,
 * ohne einen echten PTY zu erzwingen: die Terminal-Klasse, die Option in `spawn` und die Frage, ob
 * `node-pty` überhaupt ladbar ist. Ein fehlendes Angebot ist der ganze Befund.
 */
console.log('\n--- 3b. PTY (entscheidet über ein eigenes Programm) ---')
console.log(`  Bun.Terminal              : ${typeof B.Terminal}`)
console.log(`  Bun.spawnSync             : ${typeof B.spawnSync}`)
console.log(`  node:child_process.spawn  : ${typeof (await import('node:child_process')).spawn}`)
try {
  const nodePty = await import('node-pty')
  console.log(`  node-pty ladbar           : ja (${Object.keys(nodePty).slice(0, 4).join(', ')})`)
} catch (error) {
  console.log(`  node-pty ladbar           : NEIN — ${String(error.message).split('\n')[0].slice(0, 90)}`)
}
if (typeof B.Terminal === 'function') {
  console.log('  (Bun.Terminal ist vorhanden — ein eigener PTY-Dienst ist damit nicht mehr zwingend)')
} else {
  console.log('  (kein Bun.Terminal — die Aussage der Recherche stützt sich auf node:child_process)')
}

console.log('\n--- 4. Atomarer Ersatz (rename) ---')
versuch('rename über eine bestehende Datei', () => {
  const a = join(ordner, 'a.txt')
  const b = join(ordner, 'b.txt')
  writeFileSync(a, 'a')
  writeFileSync(b, 'b')
  nodeFs.renameSync(a, b)
})

rmSync(ordner, { recursive: true, force: true })
console.log('\n(Probe-Verzeichnis wieder entfernt.)')
