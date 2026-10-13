/**
 * init-skript-probe.mjs — Wächter-Werkzeug (Aufsicht): prüft ein Init-Skript gegen den echten
 * Server, **ohne Zustand zu ändern**.
 *
 * WARUM. Nach dem fehlgeschlagenen ersten Start (`02-roles.sql`, Befund B8) wurde das Skript auf
 * `02-roles.sh` umgestellt. Ob die Neufassung **wirkt**, ließ sich bisher nur durch einen echten
 * Neustart auf leerem Volume zeigen — und der löscht Daten. Dieser Weg ist unnötig:
 *
 *   Der SQL-Block wird aus dem Skript herausgeschnitten, in `BEGIN; … ROLLBACK;` gehüllt und gegen
 *   den **echten** Server geschickt. Jede Anweisung wird damit wirklich geparst und ausgeführt
 *   (Rechte, Schemaprüfung, Namensprüfung inklusive) — und am Ende ist **nichts** passiert.
 *
 * Das ist ein **Beweis der Ausführbarkeit**, kein Beweis der Wirkung: ob die Rechte danach
 * tatsächlich greifen, zeigt erst der Lauf ohne Rollback.
 *
 * Aufruf:
 *   node init-skript-probe.mjs <pfad-zum-init-skript> [container]
 *   node init-skript-probe.mjs C:\Users\Chang\prometheus-harness\docker\postgres-init\02-roles.sh
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [skriptPfad, container = 'pmh-postgres'] = process.argv.slice(2)
if (skriptPfad === undefined) throw new Error('usage: node init-skript-probe.mjs <pfad> [container]')

const text = readFileSync(skriptPfad, 'utf8')

/** Den Here-Dokument-Block `<<'MARKE' … MARKE` herausschneiden. */
const treffer = /<<'([A-Z_]+)'\n([\s\S]*?)\n\1\n/.exec(text)
if (treffer === null) {
  console.log('Kein Here-Dokument gefunden — dieses Skript hat keinen SQL-Block, der sich so prüfen lässt.')
  process.exit(1)
}
const marke = treffer[1]
const sql = treffer[2]

/** Die psql-Variablen aus den `-v name=…`-Zeilen des Skripts übernehmen. */
const variablen = [...text.matchAll(/-v\s+([a-z_]+)="\$([A-Z_]+)"/g)].map(([, psqlName, envName]) => [psqlName, envName])
console.log(`Skript     : ${skriptPfad}`)
console.log(`Container  : ${container}`)
console.log(`Here-Dok   : <<'${marke}' mit ${sql.split('\n').length} Zeilen`)
console.log(`Variablen  : ${variablen.map(([p, e]) => `${p}<-${e}`).join(', ')}\n`)

/** Die Werte kommen aus der Umgebung des Containers — nicht aus dem Skript, nicht von mir. */
const envAusContainer = spawnSync('docker', ['exec', container, 'sh', '-c', 'env'], { encoding: 'utf8' })
if (envAusContainer.status !== 0) {
  console.log('Die Umgebung des Containers war nicht lesbar — Abbruch.')
  process.exit(1)
}
const env = Object.fromEntries(
  envAusContainer.stdout
    .split('\n')
    .map((zeile) => zeile.split('='))
    .filter((teile) => teile.length >= 2)
    .map(([name, ...rest]) => [name, rest.join('=')]),
)

const args = ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'pmh_admin', '-d', 'pmh']
for (const [psqlName, envName] of variablen) {
  const wert = env[envName]
  if (wert === undefined) {
    console.log(`  FEHLT in der Container-Umgebung: ${envName} — das Skript würde hier abbrechen.`)
    process.exit(1)
  }
  args.push('-v', `${psqlName}=${wert}`)
}

const umhuellt = `BEGIN;\n${sql}\nROLLBACK;\n`
const lauf = spawnSync('docker', args, { input: umhuellt, encoding: 'utf8' })

console.log('--- Ausgabe des Servers ---')
console.log((lauf.stdout ?? '').trim() || '(keine)')
if ((lauf.stderr ?? '').trim() !== '') {
  console.log('--- Fehlerausgabe ---')
  console.log(lauf.stderr.trim())
}
console.log(`\nExit-Code: ${lauf.status}`)
console.log(
  lauf.status === 0
    ? 'ERGEBNIS: der SQL-Block läuft gegen den echten Server fehlerfrei durch — und wurde per ROLLBACK zurückgenommen.\n' +
        'Was das NICHT zeigt: ob die Rechte danach greifen (das braucht den Lauf ohne Rollback).'
    : 'ERGEBNIS: der SQL-Block scheitert. Siehe Fehlerausgabe oben.',
)
