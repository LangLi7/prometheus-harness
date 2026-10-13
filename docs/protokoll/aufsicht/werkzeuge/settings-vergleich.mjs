/**
 * settings-vergleich.mjs — Wächter-Werkzeug (Aufsicht/Rolle).
 *
 * WARUM. Am 13.10.2026 wurde `~/.dsh/settings.yaml` nach einem Schrumpf auf 151 Bytes
 * aus einer Sicherung wiederhergestellt. Die Reparatur-Notiz nennt als Quelle
 * „die letzte vollständige Fassung" (`crew/settings.yaml.pre-probe`, 17.09.2026).
 * Dieses Werkzeug prüft diese Behauptung nach: es vergleicht die **live**-Fassung
 * gegen ALLE gefundenen Sicherungen und benennt, welche Abschnitte abweichen.
 *
 * GRUNDREGEL. Es werden **keine Geheimwerte** ausgegeben. Werte von Schlüsseln, deren
 * Name auf `key`, `token`, `secret`, `password` passt, werden nur als Länge gemeldet.
 *
 * Aufruf:
 *   node settings-vergleich.mjs <live.yaml> <sicherung1.yaml> [<sicherung2.yaml> ...]
 *
 * Ausgabe: je Sicherung eine Tabelle „Abschnitt | live-Bytes | Sicherung-Bytes | gleich?"
 * plus die tiefen Unterschiede je abweichendem Abschnitt.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')
const yaml = require('js-yaml')

const [livePath, ...backupPaths] = process.argv.slice(2)
if (livePath === undefined || backupPaths.length === 0) {
  throw new Error('usage: node settings-vergleich.mjs <live.yaml> <sicherung...yaml>')
}

/** Ein Geheimwert wird nie gedruckt — nur seine Länge. */
const SECRET = /key|token|secret|password/i

function redact(value, keyName, depth = 0) {
  if (value === null || typeof value !== 'object') {
    const text = String(value ?? '')
    if (SECRET.test(keyName) && text.length > 0) return `<${text.length} Zeichen>`
    return value
  }
  if (Array.isArray(value)) return value.map(item => redact(item, keyName, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, depth + 1)
  return out
}

/** Stabile Textform eines Werts, damit „gleich?" nicht von Schlüsselreihenfolge abhängt. */
function canonical(value) {
  const json = JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    return v
  })
  return createHash('sha256').update(json ?? 'undefined').digest('hex').slice(0, 12)
}

function sizeOf(value) {
  return Buffer.byteLength(yaml.dump(value ?? null, { lineWidth: 120 }), 'utf8')
}

const liveText = readFileSync(livePath, 'utf8')
const live = yaml.load(liveText)
console.log(`live: ${livePath}`)
console.log(`      ${liveText.length} B · sha256 ${createHash('sha256').update(liveText).digest('hex').slice(0, 12)}`)
console.log(`      Abschnitte (${Object.keys(live).length}): ${Object.keys(live).join(', ')}\n`)

for (const backupPath of backupPaths) {
  const text = readFileSync(backupPath, 'utf8')
  let doc
  try {
    doc = yaml.load(text)
  } catch (error) {
    console.log(`SICHERUNG ${backupPath}\n  NICHT LESBAR: ${error.message}\n`)
    continue
  }
  console.log(`SICHERUNG ${backupPath}`)
  console.log(`  ${text.length} B · sha256 ${createHash('sha256').update(text).digest('hex').slice(0, 12)} · Abschnitte (${Object.keys(doc).length})`)

  const names = [...new Set([...Object.keys(live), ...Object.keys(doc)])].sort()
  const differing = []
  for (const name of names) {
    const a = live[name]
    const b = doc[name]
    const equal = canonical(a) === canonical(b)
    if (!equal) differing.push(name)
    console.log(
      `  ${equal ? 'gleich ' : 'ABWEICHT'}  ${name.padEnd(22)} live ${String(sizeOf(a)).padStart(7)} B   sicherung ${String(sizeOf(b)).padStart(7)} B` +
        (a === undefined ? '   (nur in der Sicherung)' : b === undefined ? '   (nur live)' : ''),
    )
  }

  for (const name of differing) {
    console.log(`\n  --- Unterschied in "${name}" ---`)
    const show = value => {
      const text = JSON.stringify(redact(value, name)) ?? 'undefined'
      return text.length > 1400 ? text.slice(0, 1400) + ' …' : text
    }
    console.log('  live      : ' + show(live[name]))
    console.log('  sicherung : ' + show(doc[name]))
    // Struktur-Ebene: welche Schlüssel fehlen auf welcher Seite?
    const a = live[name]
    const b = doc[name]
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const onlyLive = Object.keys(a).filter(k => !(k in b))
      const onlyBackup = Object.keys(b).filter(k => !(k in a))
      if (onlyLive.length > 0) console.log(`    nur live     : ${onlyLive.join(', ')}`)
      if (onlyBackup.length > 0) console.log(`    nur sicherung: ${onlyBackup.join(', ')}`)
    }
  }
  console.log('')
}
