/**
 * zugang-bereitstellen.mjs — Hilfe der Aufsicht für den Modellzugang.
 *
 * WARUM ES DIESE DATEI GIBT. Der Nachweis `P8.12` („Aufruf gegen den echten Anbieter") steht im
 * Register des Ziel-Repos auf **„kein Schlüssel in dieser Umgebung"**. Gemessen ist: der Schlüssel
 * existiert und ist gültig — er liegt nur in einem Home, das der Host dieses Projekts **nicht**
 * liest. `scripts/start.mjs` (Zeile 259) startet den Host mit `--home
 * <repo>/.pmh-build/harness-home`, und dieses Home hat **0** Credential-Referenzen (161 Byte).
 * Befund **B3** in `../befunde.md`.
 *
 * GRUNDREGEL DIESER HILFE. Der **Standard ist „nur anzeigen"**. Es wird nichts geschrieben, solange
 * nicht ausdrücklich `--anwenden` gesetzt ist. Ein Geheimwert wird **nie** gedruckt — nur Name,
 * Länge und ein SHA-256-Kurzfingerabdruck.
 *
 * Aufrufe:
 *   node zugang-bereitstellen.mjs                      # Lage anzeigen (Standard)
 *   node zugang-bereitstellen.mjs --umgebung           # Startbefehl mit gesetzter Umgebungsvariable
 *   node zugang-bereitstellen.mjs --anwenden           # Referenzen ins Ziel-Home schreiben (mit Sicherung)
 *
 * Optionen:
 *   --quelle <home>   Home, aus dem gelesen wird   (Vorgabe: C:\Users\Chang\.pmh)
 *   --ziel   <home>   Home, in das geschrieben wird(Vorgabe: <repo>/.pmh-build/harness-home)
 *   --refs   A,B,C    nur diese Referenzen         (Vorgabe: alle, die im Ziel fehlen)
 *
 * WARNUNG, die ernst gemeint ist: das Vorgabe-Ziel liegt **im Repository** (`.pmh-build/` ist über
 * `.gitignore` Zeile 46 abgedeckt, aber es ist ein **Bauartefakt**). Ein Geheimwert in einem
 * Bauartefakt überlebt kein Aufräumen. Wer Dauerhaftigkeit braucht, nimmt ein Home **außerhalb**
 * des Repos oder die Umgebungsvariable beim Start.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')
const yaml = require('js-yaml')

const HERE = dirname(fileURLToPath(import.meta.url))
// hilfen → aufsicht → protokoll → docs → Wurzel des Repos
const REPO = resolve(HERE, '..', '..', '..', '..')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name, fallback) => {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : (argv[index + 1] ?? fallback)
}

const QUELLE = value('--quelle', 'C:\\Users\\Chang\\.pmh')
const ZIEL = value('--ziel', join(REPO, '.pmh-build', 'harness-home'))
const NUR_REFS = value('--refs', '')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '')

const anwenden = flag('--anwenden')
const umgebung = flag('--umgebung')

const fp = (text) => createHash('sha256').update(String(text)).digest('hex').slice(0, 12)
const storePath = (home) => join(home, '.credentials.yaml')

function readStore(path) {
  if (!existsSync(path)) return undefined
  try {
    return yaml.load(readFileSync(path, 'utf8'))
  } catch (error) {
    console.log(`  ! ${path} ist nicht lesbar: ${error.message}`)
    return undefined
  }
}

console.log('=== Zugang bereitstellen — Aufsicht (Standard ist „nur anzeigen") ===\n')
console.log(`Quelle: ${QUELLE}`)
console.log(`Ziel  : ${ZIEL}`)
console.log(`Modus : ${anwenden ? 'ANWENDEN (schreibt)' : 'anzeigen (schreibt nichts)'}${umgebung ? ' + Startbefehl' : ''}\n`)

const quelle = readStore(storePath(QUELLE))
const ziel = readStore(storePath(ZIEL))

if (quelle?.refs === undefined || Object.keys(quelle.refs).length === 0) {
  console.log('ABBRUCH: die Quelle hat keine Referenzen. Ist das Home richtig?')
  process.exit(1)
}

const fehlend = Object.keys(quelle.refs).filter((name) => ziel?.refs?.[name] === undefined)
const gewaehlt = (NUR_REFS.length > 0 ? NUR_REFS : fehlend).filter((name) => name in quelle.refs)
const unbekannt = (NUR_REFS.length > 0 ? NUR_REFS : []).filter((name) => !(name in quelle.refs))

console.log(`Quelle: ${Object.keys(quelle.refs).length} Referenzen`)
console.log(`Ziel  : ${ziel ? `${Object.keys(ziel.refs ?? {}).length} Referenzen` : 'keine Datei'}`)
console.log(`Fehlend im Ziel (${fehlend.length}): ${fehlend.join(', ') || '(keine)'}`)
if (unbekannt.length > 0) console.log(`! unbekannt in der Quelle: ${unbekannt.join(', ')}`)
console.log('')

console.log('Geheimwerte werden nicht ausgegeben — nur Länge und Fingerabdruck:')
for (const name of Object.keys(quelle.refs)) {
  const wert = String(quelle.refs[name] ?? '')
  const hat = ziel?.refs?.[name] !== undefined
  console.log(`  ${hat ? 'vorhanden ' : 'FEHLT     '} ${name.padEnd(28)} ${String(wert.length).padStart(3)} Zeichen  ${fp(wert)}`)
}

if (umgebung) {
  // Der Wert wird zur Laufzeit aus dem Speicher gelesen und in die Umgebung gesetzt. Er erscheint
  // dabei weder in der Ausgabe noch als Argument in der Prozessliste — nur im Speicher des
  // Kindprozesses, der ihn braucht.
  const name = NUR_REFS[0] ?? 'DEEPSEEK_API_KEY'
  const quelleDatei = storePath(QUELLE).replace(/\\/g, '/')
  const yamlPfad = 'C:/Users/Chang/deepseek-harness/node_modules/js-yaml'
  console.log(`\n=== Start mit gesetztem Zugang (Referenz: ${name}) — geprüftes Rezept ===`)
  console.log('PowerShell, zwei Zeilen. Der Geheimwert wird nie gedruckt:')
  console.log(`
  $env:${name} = node -e "const fs=require('fs');const y=require('${yamlPfad}');process.stdout.write(y.load(fs.readFileSync('${quelleDatei}','utf8')).refs['${name}'])"
  bun run start
`)
  console.log('Kontrolle, dass die Variable gesetzt ist — vergleicht nur den Fingerabdruck:')
  console.log(`
  node -e "const c=require('crypto');console.log('${name}', (process.env.${name}??'').length, c.createHash('sha256').update(process.env.${name}??'').digest('hex').slice(0,12))"
`)
  console.log(`Erwartet: ${String(quelle.refs[name] ?? '').length} Zeichen und ${fp(quelle.refs[name] ?? '')}.`)
  console.log('Dauerhafter ist ein Home **außerhalb** des Repos — siehe Befund B3, Abschnitt „Empfehlung".')
}

if (anwenden) {
  if (gewaehlt.length === 0) {
    console.log('\nNichts zu tun — alle gewählten Referenzen sind im Ziel vorhanden.')
    process.exit(0)
  }
  if (resolve(ZIEL).toLowerCase().startsWith(resolve(REPO).toLowerCase())) {
    console.log(`\n! WARNUNG: das Ziel liegt im Repository (${ZIEL}).`)
    console.log('  Ein Geheimwert in einem Bauartefakt überlebt kein Aufräumen.')
  }
  const zielPfad = storePath(ZIEL)
  const neu = { version: ziel?.version ?? 1, refs: { ...(ziel?.refs ?? {}) }, ...(ziel?.records ? { records: ziel.records } : {}) }
  for (const name of gewaehlt) neu.refs[name] = quelle.refs[name]

  if (existsSync(zielPfad)) {
    const stempel = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(zielPfad, `${zielPfad}.bak-${stempel}`)
    console.log(`\nSicherung: ${zielPfad}.bak-${stempel}`)
  } else {
    writeFileSync(zielPfad, '', { flag: 'a' })
  }
  const temp = `${zielPfad}.tmp`
  writeFileSync(temp, yaml.dump(neu, { lineWidth: 120, noRefs: true, quotingType: '"' }), 'utf8')
  renameSync(temp, zielPfad)
  console.log(`Geschrieben: ${gewaehlt.length} Referenz(en) → ${zielPfad}`)
  console.log(`Danach prüfen: node ${join(HERE, '..', 'werkzeuge', 'zugangs-lage.mjs').replace(/\\/g, '\\\\')} --pruefen DEEPSEEK_API_KEY "${ZIEL}"`)
} else {
  console.log('\nEs wurde NICHTS geschrieben. Zum Schreiben: --anwenden')
}
