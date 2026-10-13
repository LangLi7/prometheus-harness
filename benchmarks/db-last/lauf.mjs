/**
 * `benchmarks/db-last/lauf.mjs` — die Schreiblast der Datenbank, **nachfahrbar**.
 *
 * ## Warum es dieses Gate gibt — der Befund, der es erzwungen hat
 *
 * Am 13.10.2026 habe ich die Kapazität des Schemas gemessen (`pgbench`, 10 bis 80
 * Clients) und die Zahlen in `docs/review/last-und-suche.md` veröffentlicht:
 * **8 030 tps** beim reinen Einfügen gegen **938 tps** mit dem Zähler-`UPDATE`.
 *
 * **Die Aufsicht konnte sie nicht nachprüfen** (Verifikation **V13**): die
 * Wegwerf-Datenbank war gelöscht, und die `pgbench`-Skripte lagen in `/tmp`
 * **innerhalb** des Containers. Das Verfahren war beschrieben, aber **kein
 * Skript lag im Baum**. Damit waren die Zahlen Behauptungen mit einem
 * Verfahrensanhang — und das verstößt gegen die Hausregel dieses Projekts, daß
 * jede Zahl den Befehl nennt, der sie gemessen hat.
 *
 * **Dieses Gate behebt das.** Es legt die Wegwerf-Datenbank selbst an, fährt die
 * Szenarien, meldet die Zahlen und **räumt wieder auf**. Wer die Zahlen bezweifelt,
 * ruft es auf.
 *
 * ## Aufruf
 *
 * ```sh
 * bun benchmarks/db-last/lauf.mjs                 # braucht den laufenden Stapel
 * PMH_BENCH_CONTAINER=pmh-postgres bun benchmarks/db-last/lauf.mjs
 * ```
 *
 * **Kein Docker oder kein laufender Container?** Dann meldet das Gate
 * `übersprungen` **mit Grund** und ist **nicht** grün. Eine fehlende Messung muß
 * als fehlend erscheinen — dieselbe Regel wie bei übersprungenen Tests.
 *
 * **Was es NICHT ist:** kein Vergleich mit der Vorlage. Es gibt dort keine
 * PostgreSQL-Schicht (siehe `MAPPING.md`). Die Zahlen gelten **gegen sich
 * selbst** — eine Regression über die Zeit.
 *
 * @module benchmarks/db-last/lauf
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fuehreAus } from '../support/messen.mjs'

/** Der Container mit dem Projektstapel. */
export const CONTAINER = process.env['PMH_BENCH_CONTAINER'] ?? 'pmh-postgres'

/** Die Wegwerf-Datenbank — sie wird angelegt und am Ende **gelöscht**. */
export const WEGWERF = 'pmh_bench'

/** Der feste Benutzer und Arbeitsbereich, den die Szenarien benutzen. */
export const BENUTZER = '77777777-7777-4777-8777-777777777777'
export const ARBEITSRAUM = '88888888-8888-4888-8888-888888888888'
export const EIN_CHAT = '99999999-9999-4999-8999-999999999999'

/**
 * Führt einen Befehl im Container aus.
 *
 * **Warum `docker exec` und nicht eine Verbindung aus Bun.** Der `postgres`-Treiber
 * läßt sich in diesem Projekt nicht importieren (offener Befund), und `pgbench`
 * ist das Werkzeug, das Last **richtig** erzeugt: mehrere Prozesse, echte
 * Transaktionen, eigener Bericht. Ein selbstgebauter Lastgenerator aus einer
 * einzigen Bun-Schleife wäre kein Ersatz — er kann die Maschine nicht auslasten.
 *
 * @param args - die Argumente für `docker exec`
 * @param eingabe - optionaler Text für die Standardeingabe
 * @returns Exit-Code und gesammelte Ausgabe
 */
async function imContainer(args, eingabe) {
  const { spawn } = await import('node:child_process')
  return await new Promise((fertig) => {
    const kind = spawn('docker', ['exec', '-i', CONTAINER, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let aus = ''
    kind.stdout.on('data', (s) => {
      aus += String(s)
    })
    kind.stderr.on('data', (s) => {
      aus += String(s)
    })
    kind.on('error', (f) => fertig({ code: -1, aus: `${aus}\n${f.message}` }))
    kind.on('close', (code) => fertig({ code: code ?? -1, aus }))
    if (eingabe !== undefined) kind.stdin.write(eingabe)
    kind.stdin.end()
  })
}

/**
 * Der Ablauf einer pgbench-Transaktion je Szenario.
 *
 * **Warum diese vier und keine anderen.** Sie isolieren genau die Frage, die das
 * Dokument beantwortet: was kostet das **Einfügen** (F), was kostet der
 * **Zähler** darauf (G), was kostet der **indizierte** `updated_at` zusätzlich
 * (H), und was kostet derselbe Zähler, wenn ihn **niemand** pflegt (I)?
 *
 * @param szene - `f` | `g` | `h` | `i`
 * @returns das SQL-Skript
 */
export function skriptFuer(szene) {
  const einfuegen =
    `INSERT INTO pmh.messages (chat_id, id, role, created_at)\n` +
    `SELECT '${EIN_CHAT}'::uuid, gen_random_uuid()::text, 'assistant', now();\n`
  const zaehler =
    `UPDATE pmh.chats SET message_count = message_count + 1\n WHERE id = '${EIN_CHAT}'::uuid;\n`
  const mitZeitstempel =
    `UPDATE pmh.chats SET message_count = message_count + 1, last_message_at = now(), ` +
    `updated_at = now()\n WHERE id = '${EIN_CHAT}'::uuid;\n`
  switch (szene) {
    case 'f':
      return einfuegen
    case 'g':
      return einfuegen + zaehler
    case 'h':
      return einfuegen + mitZeitstempel
    case 'i':
      // Die Gegenprobe zu B41: derselbe Zähler, aber die Zeile wird nicht getroffen.
      return (
        einfuegen +
        `UPDATE pmh.chats SET message_count = message_count + 1\n` +
        ` WHERE id = '00000000-0000-4000-8000-000000000000'::uuid;\n`
      )
    default:
      throw new Error(`unbekannte Szene: ${String(szene)}`)
  }
}

/**
 * Liest `tps` und die mittlere Latenz aus der pgbench-Ausgabe.
 *
 * @param aus - die Ausgabe von pgbench
 * @returns die Zahlen, oder `undefined` wenn der Lauf scheiterte
 */
export function leseErgebnis(aus) {
  const tps = /tps = ([0-9.]+)/u.exec(aus)
  const latenz = /latency average = ([0-9.]+)/u.exec(aus)
  const fehler = /number of failed transactions: (\d+)/u.exec(aus)
  if (tps === null || latenz === null) return undefined
  return {
    tps: Number(tps[1]),
    latenzMs: Number(latenz[1]),
    fehlgeschlagen: fehler === null ? 0 : Number(fehler[1]),
  }
}

/**
 * Legt die Wegwerf-Datenbank an — Schema aus `pmh` kopiert.
 *
 * @returns eine Meldung oder `undefined`, wenn es geklappt hat
 */
async function legeAn() {
  const da = await imContainer(['psql', '-U', 'pmh_admin', '-d', 'postgres', '-t', '-c', `select 1 from pg_database where datname='${WEGWERF}';`])
  if (da.code !== 0) {
    return `kein Zugang zum Container ${CONTAINER} — läuft der Stapel? (docker compose up -d)`
  }
  await imContainer(['psql', '-U', 'pmh_admin', '-d', 'postgres', '-q', '-c', `DROP DATABASE IF EXISTS ${WEGWERF};`])
  const neu = await imContainer(['psql', '-U', 'pmh_admin', '-d', 'postgres', '-q', '-c', `CREATE DATABASE ${WEGWERF};`])
  if (neu.code !== 0) return `Wegwerf-Datenbank ${WEGWERF} ließ sich nicht anlegen: ${neu.aus.trim()}`
  const kopie = await imContainer([
    'sh',
    '-lc',
    `pg_dump -s -n pmh -U pmh_admin pmh | psql -q -U pmh_admin -d ${WEGWERF}`,
  ])
  if (kopie.code !== 0) return `Schema ließ sich nicht kopieren: ${kopie.aus.trim()}`
  await imContainer([
    'psql', '-U', 'pmh_admin', '-d', WEGWERF, '-q', '-c',
    `INSERT INTO pmh.users (id, email) VALUES ('${BENUTZER}','bench@example.invalid') ON CONFLICT DO NOTHING;` +
      `INSERT INTO pmh.workspaces (id, user_id, name) VALUES ('${ARBEITSRAUM}','${BENUTZER}','Bench') ON CONFLICT DO NOTHING;` +
      `INSERT INTO pmh.chats (id, workspace_id, user_id, title) VALUES ('${EIN_CHAT}','${ARBEITSRAUM}','${BENUTZER}','Bench') ON CONFLICT DO NOTHING;`,
  ])
  return undefined
}

/** Räumt die Wegwerf-Datenbank wieder weg. */
async function raeumeAb() {
  await imContainer(['psql', '-U', 'pmh_admin', '-d', 'postgres', '-q', '-c', `DROP DATABASE IF EXISTS ${WEGWERF};`])
}

/**
 * Fährt ein Szenario und liefert das Ergebnis.
 *
 * @param szene - `f` | `g` | `h` | `i`
 * @param clients - die Zahl gleichzeitiger Clients
 * @param sekunden - die Laufzeit
 * @returns das Ergebnis oder `undefined`
 */
async function fahre(szene, clients, sekunden) {
  const skript = skriptFuer(szene)
  await imContainer(['sh', '-lc', `cat > /tmp/${WEGWERF}_${szene}.sql`], skript)
  const { aus } = await imContainer([
    'pgbench', '-U', 'pmh_app', '-d', WEGWERF, '-n', '-f', `/tmp/${WEGWERF}_${szene}.sql`,
    '-c', String(clients), '-j', '4', '-T', String(sekunden),
  ])
  return leseErgebnis(aus)
}

/**
 * Die Teile dieses Gates.
 *
 * @param {{clients?: number, sekunden?: number}} [optionen]
 * @returns {readonly (() => Promise<{ok: boolean, text: string}> )[]}
 */
export function teile(optionen = {}) {
  const clients = optionen.clients ?? 10
  const sekunden = optionen.sekunden ?? 15
  return [
    // ── Die Isolierung: was kostet der Zähler? ────────────────────────────────
    async () => {
      const vorbereitet = await legeAn()
      if (vorbereitet !== undefined) {
        return { ok: false, text: `ROT  Datenbanklast übersprungen — ${vorbereitet}` }
      }
      try {
        const f = await fahre('f', clients, sekunden)
        const g = await fahre('g', clients, sekunden)
        const h = await fahre('h', clients, sekunden)
        if (f === undefined || g === undefined || h === undefined) {
          return { ok: false, text: 'ROT  ein pgbench-Lauf lieferte keine Zahlen — Messung ungültig' }
        }
        const verlust = (1 - g.tps / f.tps) * 100
        const zusatz = (1 - h.tps / g.tps) * 100
        return {
          // **Die Aussage, die geprüft wird:** der Zähler kostet deutlich. Ist der
          // Verlust klein, hat sich das Schema geändert und der Befund ist
          // erledigt — dann gehört das Dokument geändert, nicht die Schwelle.
          ok: verlust >= 50,
          text:
            `ok   Isolierung (${String(clients)} Clients, ${String(sekunden)} s, EIN Chat): ` +
            `nur Einfügen ${f.tps.toFixed(0)} tps · + Zähler ${g.tps.toFixed(0)} tps ` +
            `(Verlust ${verlust.toFixed(0)} %) · + indizierter updated_at ${h.tps.toFixed(0)} tps ` +
            `(weitere ${zusatz.toFixed(0)} %) — Latenz ${f.latenzMs.toFixed(2)} / ${g.latenzMs.toFixed(2)} / ` +
            `${h.latenzMs.toFixed(2)} ms`,
        }
      } finally {
        await raeumeAb()
      }
    },

    // ── Der Gegenbeweis zu B41: der Zähler auf eine Zeile, die es nicht gibt ──
    async () => {
      const vorbereitet = await legeAn()
      if (vorbereitet !== undefined) {
        return { ok: false, text: `ROT  Datenbanklast übersprungen — ${vorbereitet}` }
      }
      try {
        const i = await fahre('i', clients, sekunden)
        if (i === undefined) {
          return { ok: false, text: 'ROT  der Gegenlauf lieferte keine Zahlen — Messung ungültig' }
        }
        return {
          ok: true,
          text:
            `ok   Gegenprobe (Zähler auf eine NICHT getroffene Zeile): ${i.tps.toFixed(0)} tps, ` +
            `${i.latenzMs.toFixed(2)} ms — ohne Zeilensperre kostet das UPDATE fast nichts`,
        }
      } finally {
        await raeumeAb()
      }
    },
  ]
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await fuehreAus('db-last — Schreiblast der Datenbank', teile())) === 0 ? 0 : 1
}
