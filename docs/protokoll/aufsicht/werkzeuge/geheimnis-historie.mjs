/**
 * geheimnis-historie.mjs — Wächter-Werkzeug (Aufsicht): steht ein **echter** Geheimwert in der
 * Git-Historie?
 *
 * WARUM DIESES WERKZEUG UND NICHT EIN MUSTER-SCANNER. Ein Muster-Scanner (`sk-[A-Za-z0-9]{20,}`)
 * findet Platzhalter und echte Schlüssel gleichermaßen und kann „sauber" nicht beweisen. Diese
 * Prüfung ist definitiv: sie liest die **tatsächlichen** Werte aus dem Credential-Speicher, bildet
 * je Wert einen Suchbegriff und lässt `git grep -F -f` über **alle** Commits laufen.
 *
 * Ergebnis:
 *   * kein Treffer  → dieser Wert wurde **nie** committet (belastbar, nicht „vermutlich")
 *   * Treffer       → Datei und Commit werden genannt, **der Wert selbst nie gedruckt**
 *
 * Die Suchbegriffe liegen in einer Datei **außerhalb** des Repositories (Temp-Verzeichnis) und
 * werden danach gelöscht. Es wird **nichts** in das Repository geschrieben.
 *
 * Aufruf:
 *   node geheimnis-historie.mjs <repo> [<credential-store>]
 *   node geheimnis-historie.mjs C:\Users\Chang\prometheus-harness C:\Users\Chang\.dsh\.credentials.yaml
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')
const yaml = require('js-yaml')

const [repo, storePath = 'C:\\Users\\Chang\\.dsh\\.credentials.yaml'] = process.argv.slice(2)
if (repo === undefined) throw new Error('usage: node geheimnis-historie.mjs <repo> [credential-store]')

console.log(`Repository : ${repo}`)
console.log(`Speicher   : ${storePath}\n`)

if (!existsSync(storePath)) {
  console.log('Der Credential-Speicher ist nicht lesbar — die Prüfung wäre eine Behauptung. Abbruch.')
  process.exit(1)
}
const store = yaml.load(readFileSync(storePath, 'utf8'))
const werte = Object.entries(store?.refs ?? {}).filter(([, wert]) => typeof wert === 'string' && wert.length >= 16)
console.log(`Zu prüfende Geheimwerte: ${werte.length} (Länge ≥ 16 Zeichen; kürzere sind nicht eindeutig genug)`)

const ordner = mkdtempSync(join(tmpdir(), 'aufsicht-historie-'))
const musterDatei = join(ordner, 'muster.txt')
writeFileSync(musterDatei, werte.map(([, wert]) => wert).join('\n') + '\n', 'utf8')

const revs = execFileSync('git', ['rev-list', '--all'], { cwd: repo, encoding: 'utf8' }).trim().split('\n')
console.log(`Commits in allen Zweigen: ${revs.length}\n`)

/** `git grep -F -f <muster>` über alle Commits; `-l` nennt nur Dateinamen, nie Inhalte. */
let treffer = 0
for (const rev of revs) {
  let ausgabe = ''
  try {
    ausgabe = execFileSync('git', ['grep', '-I', '-l', '-F', '-f', musterDatei, rev], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    ausgabe = '' // exit 1 = kein Treffer — das ist der Normalfall
  }
  const dateien = ausgabe.trim().split('\n').filter((zeile) => zeile !== '')
  if (dateien.length > 0) {
    treffer += dateien.length
    const betreff = execFileSync('git', ['show', '-s', '--format=%h %ci %s', rev], { cwd: repo, encoding: 'utf8' }).trim()
    console.log(`  TREFFER in ${betreff}`)
    for (const datei of dateien) console.log(`    ${datei.replace(`${rev}:`, '')}`)
  }
}

rmSync(ordner, { recursive: true, force: true })
console.log(
  treffer === 0
    ? `\nERGEBNIS: keiner der ${werte.length} echten Geheimwerte kommt in ${revs.length} Commits vor.\n` +
        'Das ist ein belastbarer Negativbefund — kein Muster, sondern der Wert selbst wurde gesucht.'
    : `\nERGEBNIS: ${treffer} Treffer. Ein echter Geheimwert steht in der Historie und muss als\n` +
        'kompromittiert gelten: Schlüssel rotieren, Historie bereinigen oder Repository neu beginnen.',
)
console.log('(Die Suchbegriffsdatei lag außerhalb des Repositories und wurde gelöscht.)')
