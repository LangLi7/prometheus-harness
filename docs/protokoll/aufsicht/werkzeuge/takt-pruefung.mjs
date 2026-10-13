/**
 * takt-pruefung.mjs — Wächter-Werkzeug (Aufsicht): die wiederkehrende Prüfung in einem Aufruf.
 *
 * WARUM. Jeder Takt der Aufsicht misst dieselben Dinge. Sie von Hand in PowerShell zu tippen hat
 * schon einmal zu einem Quoting-Fehler geführt, bei dem **nichts** ausgeführt wurde, aber ein
 * Ergebnisbericht entstand. Ein Werkzeug, das man ausführt, ist ehrlicher als ein Befehl, den man
 * richtig tippen muss.
 *
 * Was gemessen wird (alles lesend, kein Schreibzugriff, kein Neustart):
 *   1. `~/.dsh/settings.yaml` — Größe, Zeit, Hash, Abschnitte, Anbieter-Routen, Crews, Referenzen
 *   2. die Zugangslage der drei Harness-Homes (ohne Geheimwerte)
 *   3. der Git-Zustand des Ziel-Repos und von `deepseek-harness` (HEAD, Sicherung, Arbeitsbaum)
 *   4. die laufenden Prozesse, die zur Harness gehören
 *   5. die Datenbank (nur lesend): Tabellenzahl in `pmh`
 *
 * Aufruf:  node takt-pruefung.mjs [--still]
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/Chang/deepseek-harness/')
const yaml = require('js-yaml')

const REPO = 'C:\\Users\\Chang\\prometheus-harness'
const DSH_CHECKOUT = 'C:\\Users\\Chang\\deepseek-harness'
const SETTINGS = 'C:\\Users\\Chang\\.dsh\\settings.yaml'
const HOMES = {
  '~/.dsh': 'C:\\Users\\Chang\\.dsh',
  '~/.pmh': 'C:\\Users\\Chang\\.pmh',
  'projekt-home': `${REPO}\\.pmh-build\\harness-home`,
}

const run = (file, args, cwd) => {
  try {
    return execFileSync(file, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch (error) {
    return `(Fehler: ${error.message.split('\n')[0]})`
  }
}

const line = (text) => console.log(text)

line(`=== Takt-Prüfung der Aufsicht · ${new Date().toISOString()} ===\n`)

/** 1. Konfiguration */
line('--- 1. ~/.dsh/settings.yaml ---')
if (!existsSync(SETTINGS)) {
  line('  FEHLT')
} else {
  const text = readFileSync(SETTINGS, 'utf8')
  const stat = statSync(SETTINGS)
  let doc
  try {
    doc = yaml.load(text)
  } catch (error) {
    line(`  NICHT LESBAR: ${error.message}`)
  }
  const refs = [...text.matchAll(/apiKeyEnv\s*:\s*"?([A-Za-z0-9_]+)"?/g)].map((m) => m[1])
  line(`  ${text.length} B · ${stat.mtime.toISOString()} · sha256 ${createHash('sha256').update(text).digest('hex').slice(0, 12)}`)
  if (doc) {
    const routen = doc['llm-pi-ai']?.providers ? Object.keys(doc['llm-pi-ai'].providers).length : '?'
    const crews = doc.crew?.crews?.length ?? '?'
    line(`  Abschnitte ${Object.keys(doc).length} (Soll 10) · Routen ${routen} · Crews ${crews}`)
    line(`  Referenzen ${new Set(refs).size} distinkt, ${refs.length} Vorkommen`)
    line(`  agent-default-model: ${JSON.stringify(doc['agent-default-model'])}`)
    line(`  agent-loop: ${JSON.stringify(doc['agent-loop'])}`)
    const flash = doc['llm-deepseek']?.models?.find((m) => m.id === 'deepseek-flash')
    line(`  deepseek-flash: contextWindow=${flash?.contextWindow} Modalitäten=${JSON.stringify(flash?.inputModalities)}`)
  }
}

/** 2. Zugangslage */
line('\n--- 2. Zugangslage (Namen und Längen, keine Werte) ---')
for (const [label, home] of Object.entries(HOMES)) {
  const path = `${home}\\.credentials.yaml`
  if (!existsSync(path)) {
    line(`  ${label.padEnd(14)} FEHLT`)
    continue
  }
  try {
    const doc = yaml.load(readFileSync(path, 'utf8'))
    const refs = Object.keys(doc?.refs ?? {})
    const ds = doc?.refs?.DEEPSEEK_API_KEY
    const fp = ds ? createHash('sha256').update(String(ds)).digest('hex').slice(0, 12) : '-'
    line(`  ${label.padEnd(14)} ${String(statSync(path).size).padStart(5)} B · ${String(refs.length).padStart(2)} Referenzen · DEEPSEEK ${ds ? `35 Zeichen ${fp}` : 'FEHLT'}`)
  } catch (error) {
    line(`  ${label.padEnd(14)} NICHT LESBAR: ${error.message}`)
  }
}

/** 3. Git-Zustand */
line('\n--- 3. Git-Zustand ---')
for (const [label, dir] of [['Ziel-Repo', REPO], ['deepseek-harness', DSH_CHECKOUT]]) {
  const head = run('git', ['rev-parse', '--short', 'HEAD'], dir)
  const subject = run('git', ['log', '-1', '--format=%ci %s'], dir)
  const dirty = run('git', ['status', '--short'], dir)
  const count = dirty === '' ? 0 : dirty.split('\n').length
  line(`  ${label.padEnd(16)} HEAD ${head} · ${count} geänderte Pfade`)
  line(`  ${' '.repeat(16)} ${subject}`)
}
line(`  origin/main: ${run('git', ['ls-remote', 'origin', 'refs/heads/main'], REPO).split(/\s/)[0]}`)

/** 4. Prozesse */
line('\n--- 4. Prozesse ---')
const ps = run('powershell.exe', [
  '-NoProfile',
  '-Command',
  "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'node|bun|pmh|go$' } | Select-Object -ExpandProperty Id",
])
line(`  PIDs (node/bun/pmh/go): ${ps.replace(/\s+/g, ' ')}`)

/** 5. Datenbank, nur lesend — **mit Herkunft**, sonst ist die Zahl nicht zuordenbar */
line('\n--- 5. Datenbank (nur lesend) ---')
const containerFacts = (name) => {
  const image = run('docker', ['inspect', name, '--format', '{{.Config.Image}}'])
  const created = run('docker', ['inspect', name, '--format', '{{.Created}}'])
  const project = run('docker', ['inspect', name, '--format', '{{index .Config.Labels "com.docker.compose.project"}}'])
  const volume = run('docker', ['inspect', name, '--format', '{{range .Mounts}}{{.Name}}{{end}}'])
  const status = run('docker', ['inspect', name, '--format', '{{.State.Status}}'])
  return { image, created, project: project === '<no value>' ? '—' : project, volume, status }
}
for (const name of ['pmh-postgres', 'pmh-redis']) {
  const facts = containerFacts(name)
  line(`  ${name}: ${facts.status} · ${facts.image} · Compose-Projekt ${facts.project}`)
  line(`  ${' '.repeat(name.length)}  erstellt ${facts.created} · Volume ${facts.volume === '' ? '(anonym)' : facts.volume}`)
}
const roles = run('docker', ['exec', 'pmh-postgres', 'psql', '-U', 'pmh_admin', '-d', 'pmh', '-Atc',
  "select string_agg(rolname, ', ' order by rolname) from pg_roles where rolname like 'pmh%';"])
line(`  Rollen: ${roles || '(keine)'}`)
// Die Tabellen werden **je Schema** gezählt. Grund: seit dem Compose-Umbau liegt das
// Anwendungsschema in `pmh`, nicht in `public` — eine unqualifizierte Abfrage hätte „0 Tabellen"
// gemeldet und damit einen Fortschritt als Rückschritt gelesen (eigener Fehler, 13.10. 12:08).
const jeSchema = run('docker', ['exec', 'pmh-postgres', 'psql', '-U', 'pmh_admin', '-d', 'pmh', '-Atc',
  "select schemaname || '=' || count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema') group by schemaname order by schemaname;"])
line(`  Tabellen je Schema: ${jeSchema.replace(/\n/g, ' · ') || '(keine)'}`)
const migrations = run('docker', ['exec', 'pmh-postgres', 'psql', '-U', 'pmh_admin', '-d', 'pmh', '-Atc',
  "set search_path to pmh, public; select version, count(*) from schema_migrations group by version order by version;"]).replace(/\n/g, ' · ')
line(`  schema_migrations: ${migrations || '(Tabelle fehlt — Anwendungsschema nicht migriert)'}`)
const anon = run('docker', ['volume', 'ls', '--filter', 'dangling=true', '--format', '{{.Name}}'])
line(`  verwaiste Volumes: ${anon.split('\n').filter((n) => n !== '').length} (davon können alte Datenbankstände sein)`)
line(`  redis: ${run('docker', ['exec', 'pmh-redis', 'redis-cli', 'ping'])}`)
