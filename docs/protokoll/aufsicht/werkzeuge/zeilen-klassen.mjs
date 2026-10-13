/**
 * zeilen-klassen.mjs — Wächter-Werkzeug (Aufsicht): Leerzeilen, Kommentare und Code trennen.
 *
 * WARUM. Zwei Beteiligte nennen für denselben Rust-Bestand zwei Zahlen — **6.014** und **6.569** —
 * und die neuere Recherche schreibt ausdrücklich: *„Die Differenz ist nicht aufgeklärt — vermutlich
 * Zählweise oder veränderter Stand."* Ein Verdacht lässt sich prüfen: die kleinere Zahl sind
 * **Code + Kommentar**, die größere **alle Zeilen**. Dieses Werkzeug zählt die drei Klassen getrennt
 * und sagt damit, **welche** Zählweise welche Zahl ergibt — statt zu vermuten.
 *
 * Gezählt wird nur, was `git ls-files` kennt (kein Cache, keine Generationsartefakte).
 *
 * Aufruf:
 *   node zeilen-klassen.mjs <repo> <endung>
 *   node zeilen-klassen.mjs C:\Users\Chang\prometheus-harness rs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [repo, endung] = process.argv.slice(2)
if (repo === undefined || endung === undefined) throw new Error('usage: node zeilen-klassen.mjs <repo> <endung>')

const suffix = endung.startsWith('.') ? endung : `.${endung}`
const dateien = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .map((zeile) => zeile.trim())
  .filter((zeile) => zeile !== '' && zeile.toLowerCase().endsWith(suffix))

const gesamt = { leer: 0, kommentar: 0, code: 0, alle: 0 }
const proOrdner = new Map()

for (const relativ of dateien) {
  const text = readFileSync(join(repo, relativ), 'utf8')
  const zeilen = text.split('\n')
  if (zeilen[zeilen.length - 1] === '') zeilen.pop()

  let imBlock = false
  let leer = 0
  let kommentar = 0
  let code = 0
  for (const roh of zeilen) {
    const zeile = roh.trim()
    if (imBlock) {
      kommentar += 1
      if (zeile.includes('*/')) imBlock = false
      continue
    }
    if (zeile === '') {
      leer += 1
      continue
    }
    if (zeile.startsWith('//')) {
      kommentar += 1
      continue
    }
    if (zeile.startsWith('/*')) {
      kommentar += 1
      if (!zeile.includes('*/')) imBlock = true
      continue
    }
    code += 1
  }

  const teile = relativ.split('/')
  const ordner = teile.length >= 2 ? teile.slice(0, 2).join('/') : '(Wurzel)'
  const sammlung = proOrdner.get(ordner) ?? { leer: 0, kommentar: 0, code: 0, alle: 0, dateien: 0 }
  sammlung.leer += leer
  sammlung.kommentar += kommentar
  sammlung.code += code
  sammlung.alle += zeilen.length
  sammlung.dateien += 1
  proOrdner.set(ordner, sammlung)

  gesamt.leer += leer
  gesamt.kommentar += kommentar
  gesamt.code += code
  gesamt.alle += zeilen.length
}

console.log(`=== Zeilenklassen für *${suffix} in ${repo} ===`)
console.log(`${dateien.length} Dateien\n`)
console.log('Ordner'.padEnd(26) + 'Dateien'.padStart(8) + 'Code'.padStart(8) + 'Kommentar'.padStart(11) + 'Leer'.padStart(7) + 'Code+Kom'.padStart(10) + 'Alle'.padStart(8))
for (const [ordner, s] of [...proOrdner.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
  console.log(
    ordner.padEnd(26) +
      String(s.dateien).padStart(8) +
      String(s.code).padStart(8) +
      String(s.kommentar).padStart(11) +
      String(s.leer).padStart(7) +
      String(s.code + s.kommentar).padStart(10) +
      String(s.alle).padStart(8),
  )
}
console.log(
  '\nSUMME'.padEnd(26) +
    String(dateien.length).padStart(8) +
    String(gesamt.code).padStart(8) +
    String(gesamt.kommentar).padStart(11) +
    String(gesamt.leer).padStart(7) +
    String(gesamt.code + gesamt.kommentar).padStart(10) +
    String(gesamt.alle).padStart(8),
)
console.log(
  `\nAuflösung: Code+Kommentar = ${gesamt.code + gesamt.kommentar} · alle Zeilen = ${gesamt.alle} · ` +
    `Leerzeilen = ${gesamt.leer} (${((gesamt.leer / gesamt.alle) * 100).toFixed(1)} %)`,
)
console.log('Wer „alle Zeilen" zählt, kommt auf die größere Zahl; wer Code+Kommentar zählt, auf die kleinere.')
