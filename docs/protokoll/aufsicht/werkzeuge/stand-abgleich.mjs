/**
 * stand-abgleich.mjs — Wächter-Werkzeug (Aufsicht): **sind meine offenen Befunde noch offen?**
 *
 * ## Warum dieses Werkzeug
 *
 * Jeder Befund der Aufsicht ist eine **Momentaufnahme**. Der bauende Agent arbeitet schnell und
 * gleichzeitig: zwischen zwei Takten kann er drei Befunde erledigt haben, ohne daß es jemand merkt.
 * Eine Liste, die man glaubt, ist wertlos — eine Liste, die man **nachmißt**, ist ein Protokoll.
 *
 * Dieses Werkzeug prüft je offenem Befund **genau die eine Tatsache**, auf der er steht, und vergleicht
 * sie mit dem Stand, der im Protokoll festgehalten ist. Es schreibt **nichts** und ändert **nichts**:
 * alle Prüfungen sind lesend (Dateien, `git`, `netstat`/`docker`-Abfragen, `wsl`).
 *
 * ## Ausgabe
 *
 * Eine Zeile je Befund: **erwartet** (der protokollierte Zustand) gegen **gemessen**. Status:
 *   * `offen`     — unverändert wie protokolliert
 *   * `BEHOBEN`   — der Befund trifft nicht mehr zu (bitte im Protokoll nachtragen)
 *   * `GEÄNDERT`  — die Zahl weicht ab, aber in keine der beiden klaren Richtungen
 *
 * Rückgabewert: 0, wenn nichts behoben ist; 1, sobald **ein** Befund behoben scheint — damit läßt sich
 * das Werkzeug als Wächter in einen Lauf einhängen.
 *
 * ## Aufruf
 *
 *   node stand-abgleich.mjs [<repo>]
 *   node stand-abgleich.mjs C:\Users\Chang\prometheus-harness
 *
 * **Keine Geheimwerte:** es werden nur Längen, Zähler und Wahrheitswerte ausgegeben (Hausregel H4).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const repo = process.argv[2] ?? 'C:\\Users\\Chang\\prometheus-harness'
const dsh = 'C:\\Users\\Chang\\deepseek-harness'
const BUN = join(process.env.USERPROFILE ?? '', '.bun', 'bin', 'bun.exe')

/**
 * Führt ein Programm aus und liefert **stdout und stderr zusammen**, nie einen Wurf.
 *
 * **Warum `spawnSync` und nicht `execFileSync`.** `execFileSync` gibt **nur stdout** zurück — stderr
 * erreicht man dort ausschließlich im Fehlerfall über das Ausnahmeobjekt. Der Registry-Scan von
 * **B31** endet aber mit **exit 0** und schreibt seine sechs Warnungen nach **stderr**: die erste
 * Fassung dieses Werkzeugs meldete deshalb „gemessen 0" und hätte einen **offenen** Befund als
 * erledigt ausgegeben. `spawnSync` liefert beide Ströme, unabhängig vom Rückgabewert.
 *
 * **Und ein zweiter eigener Fehler an derselben Stelle:** der erste Reparaturversuch änderte nur den
 * **Fehler**pfad (`fehler.stdout + fehler.stderr`) — bei exit 0 blieb es bei stdout allein. Die
 * Messung war danach **unverändert falsch**. Wer eine Sonde repariert, muß sie danach **erneut
 * messen**, nicht nur den Code ansehen.
 */
function lauf(befehl, args, optionen = {}) {
  const r = spawnSync(befehl, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...optionen })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
}

/** Liest `SCHLUESSEL=WERT`-Zeilen (nur die Namen und Längen werden je gebraucht). */
function envWerte(pfad) {
  const werte = new Map()
  if (!existsSync(pfad)) return werte
  for (const zeile of readFileSync(pfad, 'utf8').split(/\r?\n/)) {
    const treffer = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(zeile)
    if (treffer !== null) werte.set(treffer[1], treffer[2].trim().replace(/^["']|["']$/g, ''))
  }
  return werte
}

function zaehleTreffer(dateien, muster) {
  let n = 0
  for (const datei of dateien) {
    if (!existsSync(datei)) continue
    const inhalt = readFileSync(datei, 'utf8')
    n += (inhalt.match(muster) ?? []).length
  }
  return n
}

// -----------------------------------------------------------------------------------------------
// Die Prüfungen. Je Eintrag: Befund, Frage, erwarteter Wert (wie protokolliert), Messung.
// -----------------------------------------------------------------------------------------------
const pruefungen = []
function pruefe(id, titel, frage, erwartet, messen) {
  pruefungen.push({ id, titel, frage, erwartet, messen })
}

pruefe('B28', 'pg_hba: verlangt die Datenbank ein Kennwort?', 'erste Zeile für 127.0.0.1 = trust', 'trust', () => {
  const hba = lauf('docker', ['exec', 'pmh-postgres', 'sh', '-c', 'grep -v "^#" /var/lib/postgresql/data/pg_hba.conf 2>/dev/null | grep -v "^$"'])
  if (hba === '') return { wert: 'nicht lesbar', inhalt: '' }
  const zeile = hba.split('\n').find((z) => z.includes('127.0.0.1/32')) ?? ''
  return { wert: zeile.includes('scram') ? 'scram-sha-256' : zeile.includes('trust') ? 'trust' : 'unbekannt', inhalt: zeile.trim() }
})

pruefe('B26', 'Sind die Rollenkennwörter noch die Vorlagenwerte?', 'identisch mit .env.example', 'identisch', () => {
  const env = envWerte(join(repo, '.env'))
  const vor = envWerte(join(repo, '.env.example'))
  const namen = ['POSTGRES_SUPERUSER_PASSWORD', 'PMH_OWNER_PASSWORD', 'PMH_APP_PASSWORD', 'PMH_READONLY_PASSWORD']
  const gleich = namen.filter((n) => env.has(n) && env.get(n) === vor.get(n)).length
  return { wert: gleich === 4 ? 'identisch' : `${gleich} von 4 identisch`, inhalt: `Längen: ${namen.map((n) => (env.get(n) ?? '').length).join('/')}` }
})

pruefe('B30', 'Steht ein Modellschlüssel in der Vorlage?', 'keine Zeile DEEPSEEK_API_KEY', 'fehlt', () => {
  const vor = readFileSync(join(repo, '.env.example'), 'utf8')
  const da = /^DEEPSEEK_API_KEY=/mu.test(vor)
  return { wert: da ? 'vorhanden' : 'fehlt', inhalt: 'Zeile in .env.example' }
})

pruefe('B32', 'Sind die DSH-Anpassungen aufgezeichnet?', '11 unversionierte Einträge im Checkout', '11', () => {
  const status = lauf('git', ['-C', dsh, 'status', '--porcelain'])
  const n = status === '' ? 0 : status.split('\n').filter(Boolean).length
  const zweig = lauf('git', ['-C', dsh, 'log', '-1', '--format=%h %ci', 'dsh-custom'])
  return { wert: String(n), inhalt: `Zweig dsh-custom: ${zweig || 'fehlt'}` }
})

pruefe('B33', 'Hat der Anhängepunkt einen Origin-Zaun?', 'kein Origin in services/pmh-attach/internal', 'kein Zaun', () => {
  const verzeichnis = join(repo, 'services', 'pmh-attach', 'internal')
  const dateien = []
  const sammle = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) sammle(p)
      else if (e.name.endsWith('.go') && !e.name.endsWith('_test.go')) dateien.push(p)
    }
  }
  if (existsSync(verzeichnis)) sammle(verzeichnis)
  const n = zaehleTreffer(dateien, /Origin/gmu)
  return { wert: n === 0 ? 'kein Zaun' : `${n} Origin-Stelle(n)`, inhalt: `${dateien.length} Quelldateien geprüft` }
})

pruefe('B23', 'Zählt die Waisenprüfung des Port-Tests?', 'kein $script:fehler', 'fehlt', () => {
  const p = join(repo, 'scripts', 'port-test.ps1')
  const n = existsSync(p) ? zaehleTreffer([p], /\$script:fehler/gmu) : -1
  return { wert: n <= 0 ? 'fehlt' : `${n} Stelle(n)`, inhalt: 'scripts/port-test.ps1' }
})

pruefe('B13', 'Töten die Messsonden noch nach Name und Alter?', '3 Stellen', '3', () => {
  const dateien = ['boot-schleife.ps1', 'api-test.ps1', 'api-flaeche.ps1'].map((n) => join(repo, 'docs', 'status', 'messsonden', n))
  const n = zaehleTreffer(dateien, /Get-Process bun/gmu)
  return { wert: String(n), inhalt: 'docs/status/messsonden/*.ps1' }
})

pruefe('B29', 'Widerspricht die Arbeitskopie der .gitattributes?', '11 Dateien mit w/crlf und eol=lf', '11', () => {
  const aus = lauf('git', ['-C', repo, 'ls-files', '--eol'])
  const n = aus.split('\n').filter((z) => /^i\/lf\s+w\/crlf\s+attr\/text eol=lf/.test(z)).length
  return { wert: String(n), inhalt: 'git ls-files --eol' }
})

pruefe('B31', 'Warnt sein Werkzeug gegen seine eigenen Manifeste?', '6 Namensabweichungen', '6', () => {
  const cli = join(repo, 'packages', 'units', 'unit-export', 'src', 'cli.ts')
  if (!existsSync(cli)) return { wert: 'Werkzeug fehlt', inhalt: '' }
  const aus = lauf(BUN, ['run', cli, 'list', '--root', join(repo, 'native'), '--root', join(repo, 'services'), '--root', join(repo, 'packages')], { cwd: join(repo, 'packages', 'units', 'unit-export') })
  const n = (aus.match(/unit_name_directory_mismatch/gmu) ?? []).length
  return { wert: String(n), inhalt: 'eigener Registry-Scan' }
})

pruefe('B24', 'Gibt es eine Rust-Werkzeugkette auf der Zielplattform?', 'cargo fehlt in WSL', 'fehlt', () => {
  const aus = lauf('wsl', ['-d', 'Ubuntu', '--', 'sh', '-c', 'command -v cargo || echo FEHLT'])
  return { wert: aus.includes('cargo') && !aus.includes('FEHLT') ? 'vorhanden' : 'fehlt', inhalt: aus.split('\n')[0] ?? '' }
})

pruefe('B22', 'Laufen Waisen des Projekts?', '0 bun-Prozesse', '0', () => {
  const aus = lauf('powershell', ['-NoProfile', '-Command', "(Get-CimInstance Win32_Process -Filter \"Name='bun.exe'\" | Where-Object { $_.CommandLine -like '*prometheus-harness*' }).Count"])
  return { wert: aus === '' ? 'nicht messbar' : aus, inhalt: 'bun.exe dieses Projekts' }
})

pruefe('Volumes', 'Verwaiste Docker-Volumes (Bestandsaufnahme)', 'Bestandsaufnahme', '', () => {
  const aus = lauf('docker', ['volume', 'ls', '-f', 'dangling=true', '-q'])
  const n = aus === '' ? 0 : aus.split('\n').filter(Boolean).length
  return { wert: `${n} verwaist`, inhalt: 'docker volume ls -f dangling=true — einer davon hält ein intaktes PG-17-Cluster (64,8 MB): `compose down -v` trifft ihn nicht, `docker volume prune` löscht ihn' }
})

// -----------------------------------------------------------------------------------------------
// Bericht
// -----------------------------------------------------------------------------------------------
console.log('=== Standabgleich der Aufsicht ===')
console.log(`Repository: ${repo}`)
console.log(`Zeit      : ${new Date().toISOString()}\n`)
console.log('Befund   Status     erwartet                        gemessen')
console.log('-'.repeat(96))
let behoben = 0
let geaendert = 0
for (const p of pruefungen) {
  const { wert, inhalt } = p.messen()
  const status = wert === p.erwartet ? 'offen' : wert.includes(p.erwartet) || p.erwartet.includes(wert) ? 'offen' : 'GEAENDERT'
  const klarBehoben = ['B28', 'B30', 'B33', 'B23'].includes(p.id) && wert !== p.erwartet
  const urteil = klarBehoben ? 'BEHOBEN' : status
  if (urteil === 'BEHOBEN') behoben++
  if (urteil === 'GEAENDERT') geaendert++
  console.log(`${p.id.padEnd(8)} ${urteil.padEnd(10)} ${p.erwartet.padEnd(30)} ${wert}`)
  if (inhalt !== '') console.log(`${' '.repeat(9)}↳ ${inhalt}`)
}
console.log()
console.log(`Geprüft: ${pruefungen.length}   unverändert offen: ${pruefungen.length - behoben - geaendert}   behoben: ${behoben}   abweichend: ${geaendert}`)
if (behoben === 0) console.log('Ergebnis: kein offener Befund ist erledigt — die Liste im Protokoll gilt unverändert.')
else console.log(`Ergebnis: ${behoben} Befund(e) scheinen erledigt — im Protokoll nachtragen (Regel H6: berichtigen, nicht löschen).`)
process.exit(behoben === 0 ? 0 : 1)
