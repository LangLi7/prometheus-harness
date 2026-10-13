/**
 * kennwoerter-drehen.mjs — Wächter-Hilfe (Aufsicht): die Kennwörter eines **laufenden** Stapels
 * drehen, **ohne** das Datenverzeichnis zu löschen.
 *
 * ## Warum es diese Datei gibt
 *
 * PostgreSQL legt Rollen und Kennwörter **nur beim ersten Start** eines leeren Datenverzeichnisses an
 * (`docker-entrypoint-initdb.d` läuft genau einmal). Ein späterer `compose up` mit anderen Werten
 * ändert sie **nicht**: der Container wird neu erzeugt, das Volume bleibt. Deshalb gibt es für ein
 * bestehendes Volume genau **zwei** Wege:
 *
 *   * **A) die vorhandenen Kennwörter übernehmen** — kein Datenverlust, aber der Zustand bleibt.
 *   * **B) `docker compose down -v`** — neue Kennwörter, **alle Daten weg**.
 *
 * **Diese Hilfe ist Weg C**, den es auch gibt, den aber niemand geht, weil er unhandlich aussieht:
 * `ALTER ROLE … PASSWORD` auf dem laufenden System. **Kein Datenverlust, neue Kennwörter.** Sie
 * schreibt beide Seiten — die Datenbank **und** die `.env` — damit sie hinterher zueinander passen.
 *
 * ## Was sie **nicht** tut
 *
 * Sie läuft **nicht** von selbst. Ohne `--anwenden` zeigt sie nur, was sie täte (**Trockenlauf**,
 * Voreinstellung). Sie startet **keinen** Container neu, löscht **kein** Volume und ändert **keine**
 * Rechte. Sie ändert genau zwei Dinge: die Kennwörter der genannten Rollen in der Datenbank und die
 * Kennwortzeilen in der angegebenen `.env`.
 *
 * ## Warum keine Kennwörter in der Kommandozeile stehen
 *
 * Die SQL-Anweisungen gehen über **stdin** an `psql` (`docker exec -i`), nicht als Argument. Zur
 * Kontrolle der neuen Kennwörter wird im **Container** eine `pgpass`-Datei über stdin angelegt und
 * danach gelöscht — damit steht kein Kennwort in der Prozessliste des Wirts. Nach außen werden nur
 * **Länge und Fingerabdruck** genannt, nie der Wert.
 *
 * ## Aufruf
 *
 *   node kennwoerter-drehen.mjs --env <pfad> [--container <name>] [--port <n>] [--superuser <name>]
 *                              [--anwenden]
 *
 * Beispiele:
 *   node kennwoerter-drehen.mjs --env C:\Users\Chang\prometheus-harness\.env          # Trockenlauf
 *   node kennwoerter-drehen.mjs --env …\.env --container pmh-postgres --anwenden      # dreht
 *
 * Rückgabewert: 0 = in Ordnung (bzw. Trockenlauf), 1 = Abbruch ohne Änderung.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

// ---------------------------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------------------------
const argv = process.argv.slice(2)
function wert(name, vorgabe) {
  const i = argv.indexOf(name)
  return i === -1 ? vorgabe : argv[i + 1]
}
const envPfad = wert('--env')
const container = wert('--container', 'pmh-postgres')
const superuser = wert('--superuser', 'pmh_admin')
const anwenden = argv.includes('--anwenden')
if (envPfad === undefined) {
  console.error('usage: node kennwoerter-drehen.mjs --env <pfad> [--container <name>] [--port <n>] [--anwenden]')
  process.exit(1)
}
if (!existsSync(envPfad)) {
  console.error(`Die .env ist nicht lesbar: ${envPfad}`)
  process.exit(1)
}

/** Die vier Kennwörter und die Rolle, zu der jedes gehört. Die Rollennamen kommen aus der `.env`. */
const PAARE = [
  { schluessel: 'POSTGRES_SUPERUSER_PASSWORD', rolle: null, rolleAus: 'POSTGRES_SUPERUSER' },
  { schluessel: 'PMH_OWNER_PASSWORD', rolle: null, rolleAus: 'PMH_OWNER_USER' },
  { schluessel: 'PMH_APP_PASSWORD', rolle: null, rolleAus: 'PMH_APP_USER' },
  { schluessel: 'PMH_READONLY_PASSWORD', rolle: null, rolleAus: 'PMH_READONLY_USER' },
]

// ---------------------------------------------------------------------------------------------
// Die .env lesen — und die Zeilen **mit** ihrer Position, damit nur Werte ersetzt werden
// ---------------------------------------------------------------------------------------------
const envInhalt = readFileSync(envPfad, 'utf8')
const crlf = envInhalt.includes('\r\n')
const zeilen = envInhalt.split(/\r?\n/)
function leseWerte() {
  const werte = new Map()
  for (const zeile of zeilen) {
    const treffer = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(zeile)
    if (treffer === null) continue
    werte.set(treffer[1], treffer[2].trim().replace(/^["']|["']$/g, ''))
  }
  return werte
}
const werte = leseWerte()
const port = wert('--port', werte.get('POSTGRES_PORT') ?? '5432')
/**
 * **Zwei verschiedene Ports, und sie zu verwechseln ist ein Fehler.**
 * `port` ist der Port auf dem **Wirt** — er steht so in den Verbindungsadressen der `.env`.
 * `containerPort` ist der Port **im Container**: dort lauscht PostgreSQL immer auf 5432, gleich
 * welcher Port nach außen veröffentlicht ist. Die Anmelde-Prüfung läuft **im Container** und muß
 * deshalb diesen Port nehmen. (Beim ersten Test dieser Hilfe führte genau das zu „Connection
 * refused" — die Prüfung fragte im Container nach dem Port des Wirts.)
 */
const containerPort = wert('--container-port', '5432')
const datenbank = werte.get('POSTGRES_DB') ?? 'pmh'

console.log('=== Kennwörter drehen ===')
console.log(`  .env        : ${envPfad}`)
console.log(`  Container   : ${container}`)
console.log(`  Datenbank   : ${datenbank}   Wirt-Port ${port} · Port im Container ${containerPort}`)
console.log(`  Modus       : ${anwenden ? 'ANWENDEN (ändert Datenbank und .env)' : 'Trockenlauf (ändert nichts)'}\n`)

/** Ein Fingerabdruck, damit ein Wert verglichen werden kann, ohne gedruckt zu werden. */
const fp = (wert) => createHash('sha256').update(wert).digest('hex').slice(0, 12)

// ---------------------------------------------------------------------------------------------
// Läuft der Container? Und welche Kennwörter stehen dort?
// ---------------------------------------------------------------------------------------------
function docker(args, eingabe) {
  const r = spawnSync('docker', args, { encoding: 'utf8', input: eingabe, maxBuffer: 32 * 1024 * 1024 })
  return { code: r.status, aus: (r.stdout ?? '').trim(), fehler: (r.stderr ?? '').trim() }
}

const laeuft = docker(['inspect', '-f', '{{.State.Running}}', container])
if (laeuft.code !== 0 || laeuft.aus !== 'true') {
  console.error(`Abbruch: der Container "${container}" läuft nicht (oder heißt anders). Ich ändere nichts.`)
  process.exit(1)
}

const containerEnv = docker(['inspect', '-f', '{{range .Config.Env}}{{println .}}{{end}}', container]).aus
const containerWerte = new Map()
for (const zeile of containerEnv.split('\n')) {
  const i = zeile.indexOf('=')
  if (i > 0) containerWerte.set(zeile.slice(0, i), zeile.slice(i + 1))
}

console.log('--- 1. Der Ist-Zustand (Namen, Längen, Fingerabdrücke — keine Werte) ---')
for (const p of PAARE) {
  const rolle = werte.get(p.rolleAus)
  const alt = werte.get(p.schluessel) ?? ''
  p.rolle = rolle
  console.log(
    `  ${(rolle ?? '?').padEnd(16)} ${p.schluessel.padEnd(30)} ${String(alt.length).padStart(3)} Zeichen  ${alt === '' ? '(leer!)' : fp(alt)}`,
  )
}
// **Ohne Rollennamen kein ALTER ROLE.** Lieber hier abbrechen als später `ALTER ROLE "undefined"` senden.
const ohneRolle = PAARE.filter((p) => typeof p.rolle !== 'string' || p.rolle.trim() === '')
if (ohneRolle.length > 0) {
  console.error(
    `\nAbbruch: in der .env fehlen die Rollennamen: ${ohneRolle.map((p) => p.rolleAus).join(', ')}. Ich ändere nichts.`,
  )
  process.exit(1)
}
const imContainer = containerWerte.get('POSTGRES_PASSWORD') ?? ''
const inEnv = werte.get('POSTGRES_SUPERUSER_PASSWORD') ?? ''
console.log(
  `\n  Container-Kennwort (POSTGRES_PASSWORD): ${imContainer.length} Zeichen  ${imContainer === inEnv ? '== .env ✓' : '!= .env ⚠'}`,
)

// ---------------------------------------------------------------------------------------------
// Anmeldung prüfen — über **TCP**, nicht über den lokalen Socket (der prüft kein Kennwort)
// ---------------------------------------------------------------------------------------------
/**
 * Meldet sich mit einem Kennwort über TCP an, **ohne** es in eine Kommandozeile zu schreiben:
 * die `pgpass`-Datei entsteht im Container über stdin und wird sofort danach gelöscht.
 */
function pruefeAnmeldung(rolle, kennwort) {
  const inhalt = `127.0.0.1:${containerPort}:*:${rolle}:${kennwort}\n`
  const schreiben = docker(['exec', '-i', container, 'sh', '-c', 'umask 077; cat > /tmp/.pmh-pgpass'], inhalt)
  if (schreiben.code !== 0) return { ok: false, grund: 'pgpass konnte nicht geschrieben werden' }
  const r = docker([
    'exec', '-e', 'PGPASSFILE=/tmp/.pmh-pgpass', container,
    'psql', '-h', '127.0.0.1', '-p', containerPort, '-U', rolle, '-d', datenbank, '-tAc', 'select current_user',
  ])
  docker(['exec', container, 'sh', '-c', 'rm -f /tmp/.pmh-pgpass'])
  const ok = r.code === 0 && r.aus === rolle
  return { ok, grund: ok ? 'angemeldet' : (r.fehler.split('\n')[0] ?? 'unbekannt') }
}

console.log('\n--- 2. Kann sich jede Rolle mit dem Kennwort aus der .env anmelden? ---')
const anmeldung = new Map()
for (const p of PAARE) {
  const alt = werte.get(p.schluessel) ?? ''
  if (alt === '') {
    console.log(`  ${p.rolle.padEnd(16)} übersprungen — kein Kennwort in der .env`)
    anmeldung.set(p.rolle, { offen: true, ok: false, grund: 'kein Kennwort' })
    continue
  }
  const e = pruefeAnmeldung(p.rolle, alt)
  anmeldung.set(p.rolle, { offen: false, ok: e.ok, alt })
  console.log(`  ${p.rolle.padEnd(16)} ${e.ok ? 'OK' : 'FEHLGESCHLAGEN — ' + e.grund}`)
}

/**
 * ## Die Prüfung, die zuerst fehlte — und der Fehler, der sie erzwungen hat
 *
 * Eine Anmeldung, die **gelingt**, beweist **nichts**, solange nicht geprüft ist, ob eine Anmeldung
 * mit **falschem** Kennwort **scheitert**. Das offizielle PostgreSQL-Abbild bringt eine
 * `pg_hba.conf` mit, die für `127.0.0.1/32` **`trust`** setzt: über die Schleife wird **kein**
 * Kennwort verlangt, jede Rolle — auch der Superuser — kommt ohne Kennwort hinein. Eine Drehung ist
 * dann **kosmetisch**, und eine Erfolgsmeldung wäre eine Falschaussage.
 *
 * Genau das ist mir beim ersten Test dieser Hilfe passiert: ich habe über TCP geprüft und
 * „Anmeldung gelingt" gemeldet, während in Wahrheit **kein** Kennwort geprüft wurde. Diese Funktion
 * ist die Korrektur.
 */
function kennwortWirdGeprueft(rolle) {
  const falsch = `falsch-${randomBytes(8).toString('hex')}`
  const e = pruefeAnmeldung(rolle, falsch)
  return !e.ok
}

const hba = docker(['exec', container, 'sh', '-c', 'grep -v "^#" /var/lib/postgresql/data/pg_hba.conf 2>/dev/null | grep -v "^$"'])
console.log('\n--- 2b. Verlangt die Datenbank überhaupt ein Kennwort? ---')
if (hba.code === 0 && hba.aus !== '') {
  for (const zeile of hba.aus.split('\n')) console.log(`  pg_hba: ${zeile}`)
} else {
  console.log('  pg_hba.conf nicht lesbar — die Prüfung stützt sich auf den Versuch unten.')
}
const geprueft = new Map()
for (const p of PAARE) {
  geprueft.set(p.rolle, kennwortWirdGeprueft(p.rolle))
  console.log(
    `  ${p.rolle.padEnd(16)} ${geprueft.get(p.rolle) ? 'Kennwort wird geprüft ✓' : '⚠ KENNWORT WIRD NICHT GEPRÜFT (trust)'}`,
  )
}
const ohnePruefung = PAARE.filter((p) => !geprueft.get(p.rolle))
if (ohnePruefung.length > 0) {
  console.log(
    '\n  ⚠ Für diese Rollen ist die Kennwortprüfung **abgeschaltet** (pg_hba: `trust` für 127.0.0.1).',
  )
  console.log('    Jede Anmeldung gelingt dann **ohne** richtiges Kennwort — auch als Superuser.')
  console.log('    Eine Drehung ist damit **kosmetisch**: sie ändert die gespeicherten Werte, aber nicht,')
  console.log('    wer hineinkommt. Erst `host all all 127.0.0.1/32 scram-sha-256` in `pg_hba.conf`')
  console.log('    (und ein `select pg_reload_conf()`) macht aus der Drehung eine Wirkung.')
}

// ---------------------------------------------------------------------------------------------
// Neue Kennwörter — dieselbe Form wie `neuesGeheimnis(32)` des Installers: 32 Bytes base64url
// ---------------------------------------------------------------------------------------------
const neu = new Map()
for (const p of PAARE) neu.set(p.rolle, randomBytes(32).toString('base64url'))
const pgadmin = werte.has('PGADMIN_PASSWORD') ? randomBytes(24).toString('base64url') : undefined

console.log('\n--- 3. Was geschehen würde ---')
for (const p of PAARE) {
  console.log(`  ALTER ROLE ${p.rolle.padEnd(16)} WITH PASSWORD '…'   → ${neu.get(p.rolle).length} Zeichen, ${fp(neu.get(p.rolle))}`)
}
console.log(`  .env: ${PAARE.map((p) => p.schluessel).join(', ')}`)
console.log('  .env: DATABASE_URL, MIGRATION_DATABASE_URL, PMH_TEST_DATABASE_URL (aus den neuen Kennwörtern gebaut)')
if (pgadmin !== undefined) console.log(`  .env: PGADMIN_PASSWORD → ${pgadmin.length} Zeichen, ${fp(pgadmin)} (wirkt beim nächsten Erzeugen des pgAdmin-Containers)`)

if (!anwenden) {
  console.log('\nTrockenlauf — es wurde NICHTS geändert. Zum Drehen: --anwenden')
  process.exit(0)
}

// ---------------------------------------------------------------------------------------------
// Anwenden
// ---------------------------------------------------------------------------------------------
// 1. Sicherung der .env, damit ein Fehlschlag zurückzudrehen ist.
const sicherung = `${envPfad}.vor-drehung-${new Date().toISOString().replace(/[:.]/g, '-')}`
copyFileSync(envPfad, sicherung)
console.log(`\n--- 4. Anwenden ---\n  Sicherung der .env: ${basename(sicherung)}`)

// 2. Die Rolle des Superusers kann in der .env fehlen — dann ist es der Containerbenutzer.
const superuserRolle = werte.get('POSTGRES_SUPERUSER') ?? superuser
if (PAARE[0].rolle !== superuserRolle) {
  console.log(`  Hinweis: POSTGRES_SUPERUSER=${superuserRolle}, Eintrag in .env: ${PAARE[0].rolle}`)
}

// 3. SQL über stdin — nie über die Kommandozeile.
const anweisungen = [
  ...PAARE.map((p) => `ALTER ROLE "${p.rolle}" WITH PASSWORD '${neu.get(p.rolle).replace(/'/g, "''")}';`),
  'SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY rolname;',
].join('\n')
const sqlLauf = docker(['exec', '-i', container, 'psql', '-U', superuserRolle, '-d', datenbank, '-v', 'ON_ERROR_STOP=1', '-tA'], anweisungen + '\n')
if (sqlLauf.code !== 0) {
  console.error(`  FEHLGESCHLAGEN: ${sqlLauf.fehler.split('\n')[0]}`)
  console.error(`  Die .env ist unverändert; die Sicherung liegt unter ${basename(sicherung)}.`)
  process.exit(1)
}
console.log('  Datenbank: Kennwörter gesetzt ✓')

// 4. Die .env schreiben — **nur vorhandene Zeilen**, Kommentare und Reihenfolge bleiben.
const neueWerte = new Map()
for (const p of PAARE) neueWerte.set(p.schluessel, neu.get(p.rolle))
const owner = neu.get(werte.get('PMH_OWNER_USER') ?? 'pmh_owner')
const app = neu.get(werte.get('PMH_APP_USER') ?? 'pmh_app')
neueWerte.set('DATABASE_URL', `postgres://${werte.get('PMH_APP_USER') ?? 'pmh_app'}:${app}@127.0.0.1:${port}/${datenbank}`)
neueWerte.set('MIGRATION_DATABASE_URL', `postgres://${werte.get('PMH_OWNER_USER') ?? 'pmh_owner'}:${owner}@127.0.0.1:${port}/${datenbank}`)
neueWerte.set('PMH_TEST_DATABASE_URL', neueWerte.get('MIGRATION_DATABASE_URL'))
if (pgadmin !== undefined) neueWerte.set('PGADMIN_PASSWORD', pgadmin)

let ersetzt = 0
const neueZeilen = zeilen.map((zeile) => {
  const treffer = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/.exec(zeile)
  if (treffer === null) return zeile
  const name = treffer[2]
  if (!neueWerte.has(name)) return zeile
  ersetzt++
  return `${treffer[1]}${name}=${neueWerte.get(name)}`
})
if (ersetzt === 0) {
  console.error('  ABBRUCH: keine Zeile passte — die .env wurde NICHT geschrieben. Bitte die Sicherung prüfen.')
  process.exit(1)
}
// **Die Zeilenenden bleiben, wie sie waren.** Wer sie umschreibt, ändert jede Zeile der Datei —
// und genau diese Klasse Fehler hat den Installer zuletzt lahmgelegt (CRLF gegen `=(.*)$`).
writeFileSync(envPfad, neueZeilen.join(crlf ? '\r\n' : '\n'), 'utf8')
console.log(`  .env: ${ersetzt} Zeile(n) ersetzt ✓  (Zeilenende ${crlf ? 'CRLF' : 'LF'} beibehalten, Sicherung: ${basename(sicherung)})`)

// 5. Kontrolle: die neuen Kennwörter müssen über TCP funktionieren — sonst ist nichts gewonnen.
console.log('\n--- 5. Kontrolle mit den NEUEN Kennwörtern ---')
let alleOk = true
for (const p of PAARE) {
  const e = pruefeAnmeldung(p.rolle, neu.get(p.rolle))
  if (!e.ok) alleOk = false
  console.log(`  ${p.rolle.padEnd(16)} ${e.ok ? 'OK' : 'FEHLGESCHLAGEN — ' + e.grund}`)
}
const wirkungslos = PAARE.filter((p) => !geprueft.get(p.rolle))
console.log(
  !alleOk
    ? '\n⚠ Mindestens eine Rolle meldet sich mit dem neuen Kennwort NICHT an. Die Sicherung der .env liegt bereit.'
    : wirkungslos.length > 0
      ? `\n⚠ Die Kennwörter sind gesetzt und die .env passt — aber sie **wirken nicht**: für ${wirkungslos.length} Rolle(n) ist die Kennwortprüfung abgeschaltet (\`trust\` für 127.0.0.1). Der Zugang bleibt offen, bis \`pg_hba.conf\` geändert ist.`
      : '\nFertig: die Kennwörter sind gedreht, Datenbank und .env passen zusammen, und die Prüfung greift — kein Datenverlust.',
)
process.exit(alleOk && wirkungslos.length === 0 ? 0 : 1)
