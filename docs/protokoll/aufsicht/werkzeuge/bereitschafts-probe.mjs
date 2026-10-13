/**
 * bereitschafts-probe.mjs — Wächter-Werkzeug (Aufsicht): die Bereitschafts-Sonde **nachfahren**.
 *
 * WARUM. `packages/api/readiness` stellt dem Endpunkt `/api/ready` drei Fragen an PostgreSQL
 * (`packages/api/readiness/src/index.ts` Zeile 45–47):
 *
 *   1. die **Verbindung** — `select 1`
 *   2. die **Migrationstabelle** und die erreichte **Fassung** — erwartet `2` (`ERWARTETE_SCHEMAFASSUNG`)
 *   3. die **Kerntabellen** — `users`, `workspaces`, `chats`, `messages`, `sessions` (`KERN_TABELLEN`)
 *
 * Diese Fragen sind gut gewählt (die Begründung steht im Quelltext: `select 1` allein sagt nichts
 * darüber, ob die **Anwendung** arbeiten kann). Ob sie gegen den **laufenden** Stapel auch
 * **beantwortbar** sind, hängt an Rechten, Suchpfad und Schema — und nicht am Code. Genau das prüft
 * dieses Werkzeug: es benutzt die **dokumentierte Rolle** und den **echten Treiber** des Repos.
 *
 * **Read-only.** Es wird ausschließlich gelesen (`select`). Kein Schreiben, kein `INSERT`, kein DDL.
 *
 * Aufruf (aus dem Repository, mit Bun — `postgres` liegt dort):
 *   bun run docs\protokoll\aufsicht\werkzeuge\bereitschafts-probe.mjs
 */
import { createRequire } from 'node:module'

const REPO = 'C:\\Users\\Chang\\prometheus-harness'
const require = createRequire(REPO + '\\')

/** Die dokumentierte Adresse — genau die, die `.env.example` nennt. */
const ADRESSE = process.env.PMH_READY_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://pmh_app:bitte-aendern-app@127.0.0.1:5432/pmh'
const OHNE_ZUGANG = ADRESSE.replace(/\/\/[^@]*@/u, '//***@')

const ERWARTETE_FASSUNG = 2
const MIGRATIONSTABELLE = 'schema_migrations'
const KERN_TABELLEN = ['users', 'workspaces', 'chats', 'messages', 'sessions']

console.log('=== Bereitschafts-Sonde nachgefahren (nur lesend) ===')
console.log(`Adresse : ${OHNE_ZUGANG}`)
console.log(`Erwartet: Fassung ${ERWARTETE_FASSUNG}, Kerntabellen ${KERN_TABELLEN.join(', ')}\n`)

/**
 * **Warum `.default` geprüft wird.** Unter Bun liefert `require('postgres')` eine **Modulhülle**,
 * nicht die Funktion selbst — der erste Lauf dieses Werkzeugs brach mit
 * „postgres is not a function" ab. Das ist genau der Fall, den ein Werkzeug **selbst** finden muss:
 * es wurde ausgeführt, bevor es ausgeliefert wurde.
 */
const geladen = require('postgres')
const postgres = typeof geladen === 'function' ? geladen : (geladen.default ?? geladen.postgres)
if (typeof postgres !== 'function') {
  console.log(`ABBRUCH: der Treiber 'postgres' ist nicht aufrufbar (geladen: ${typeof geladen}).`)
  process.exit(1)
}
const sql = postgres(ADRESSE, { max: 1, connect_timeout: 5, onnotice: () => undefined })

let fehler = 0
const frage = async (nummer, text, abfrage) => {
  try {
    const ergebnis = await abfrage()
    console.log(`  ok      Frage ${nummer}: ${text} → ${JSON.stringify(ergebnis)}`)
    return ergebnis
  } catch (error) {
    fehler += 1
    console.log(`  FEHLER  Frage ${nummer}: ${text} → ${String(error.message).split('\n')[0].slice(0, 120)}`)
    return undefined
  }
}

/** Frage 1 — steht die Verbindung? */
await frage(1, 'Verbindung (select 1)', async () => {
  const [zeile] = await sql`select 1 as eins`
  return zeile.eins
})

/** Frage 2 — gibt es die Migrationstabelle, und welche Fassung steht darin? */
const fassung = await frage(2, `Fassung aus ${MIGRATIONSTABELLE}`, async () => {
  const zeilen = await sql.unsafe(`select version from ${MIGRATIONSTABELLE} order by version desc limit 1`)
  return zeilen[0]?.version ?? '(leer)'
})

/** Frage 3 — sind die Kerntabellen im AKTUELLEN Schema vorhanden? */
const tabellen = await frage(3, 'Kerntabellen im aktuellen Schema', async () => {
  const zeilen = await sql.unsafe(
    'select tablename from pg_tables where schemaname = current_schema() and tablename = any($1)',
    [KERN_TABELLEN],
  )
  return zeilen.map((zeile) => zeile.tablename)
})

/** Und die Zusatzfragen, die ein Betreiber sofort stellt. */
const [kontext] = await sql`select current_user as benutzer, current_schema() as schema, current_setting('search_path') as suchpfad`
console.log(`\n  Kontext : Benutzer ${kontext.benutzer} · Schema ${kontext.schema} · Suchpfad ${kontext.suchpfad}`)

const beurteilung = []
if (fassung !== undefined && Number(fassung) !== ERWARTETE_FASSUNG) beurteilung.push(`Fassung ${String(fassung)} statt ${ERWARTETE_FASSUNG}`)
if (tabellen !== undefined) {
  const fehlend = KERN_TABELLEN.filter((name) => !tabellen.includes(name))
  if (fehlend.length > 0) beurteilung.push(`Kerntabellen fehlen: ${fehlend.join(', ')}`)
}

await sql.end({ timeout: 5 })
console.log(
  fehler === 0 && beurteilung.length === 0
    ? '\nERGEBNIS: der Weg der Sonde ist gegen den laufenden Stapel beantwortbar — Rechte, Suchpfad und Schema stimmen.'
    : `\nERGEBNIS: ${fehler} Fehler, ${beurteilung.length} Abweichung(en)${beurteilung.length > 0 ? `: ${beurteilung.join('; ')}` : ''}`,
)
process.exit(fehler === 0 && beurteilung.length === 0 ? 0 : 1)
