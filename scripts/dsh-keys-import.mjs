/**
 * `scripts/dsh-keys-import.mjs` — **die DSH-Schlüssel einmalig nach Postgres.**
 *
 * ## Was hier hineingeht
 *
 * `$DSH_HOME/.credentials.yaml` (Vorgabe `~/.dsh/.credentials.yaml`) hat zwei
 * Räume:
 *
 *   * `refs`     — Umgebungsvariablen-Namen (`DEEPSEEK_API_KEY`) → Klartext
 *   * `records`  — `<scope>/<id>` → `{ kind, payload }` (Grant/API-Key-Records)
 *
 * Der Import schreibt `refs` nach `user_secrets` und `records` nach
 * `credential_records`, jeweils mit dem **Hauptschlüssel** verpackt. Er zeigt
 * **keinen** Wert an — weder im Bericht noch in einer Fehlermeldung.
 *
 * ## Warum standardmäßig nur ein Trockenlauf
 *
 * Ein Import in die Betriebsdatenbank ist eine einmalige, aber echte Änderung.
 * Ohne `--schreiben` wird nur **gezählt und benannt**: welche `ref`, welche
 * Record-Adresse, welche Art. Erst `--schreiben` legt Zeilen an; vorhandene
 * Zeilen brauchen zusätzlich `--ueberschreiben`.
 *
 * ## Was er **nicht** tut
 *
 * Er löscht `.credentials.yaml` **nicht**. Solange der DSH-Provider noch der
 * lokale Datei-Provider ist, wäre das ein Ausfall. Die Datei wird vor dem
 * Schreiben gesichert; gelöscht wird sie erst, wenn der Postgres-Provider im
 * Profil läuft (siehe `docs/status/api-token.md` und
 * `docs/design/figma-mcp.md`).
 *
 * Aufruf:
 *
 * ```text
 * bun scripts/dsh-keys-import.mjs [--benutzer <email>] [--schreiben] [--ueberschreiben]
 * ```
 *
 * @module scripts/dsh-keys-import
 */

import { copyFileSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import {
  listeCredentialRecords,
  listeGeheimnisse,
  speichereCredentialRecord,
  speichereGeheimnis,
} from '../packages/auth/store-postgres/src/index.ts'
import { aufbau } from './secret.mjs'

/** Der DSH-Home-Pfad — `DSH_HOME`, sonst `~/.dsh`. */
function dshHome(umgebung) {
  return umgebung.DSH_HOME?.trim() || join(homedir(), '.dsh')
}

/** Wert eines Schalters, z. B. `--benutzer a@b.de`. */
function schalter(argv, name) {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}

/** Bricht ohne Wertausgabe ab. */
function abbruch(text) {
  process.stderr.write(`dsh-keys-import: ${text}\n`)
  process.exit(1)
}

/** Eine `ref` ist ein POSIX-Identifier — dieselbe Grammatik wie `credentialRef`. */
function istRef(wert) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(wert)
}

/** Eine Record-Adresse ist `<scope>/<id>`, beide klein und mit Bindestrich. */
function istRecordKey(wert) {
  return /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u.test(wert)
}

const argv = process.argv.slice(2)
const schreiben = argv.includes('--schreiben')
const ueberschreiben = argv.includes('--ueberschreiben')
const email = (schalter(argv, '--benutzer') ?? process.env.PMH_DSH_USER ?? '').trim()
const datei = join(dshHome(process.env), '.credentials.yaml')

let roh
try {
  roh = parse(readFileSync(datei, 'utf8'))
} catch {
  // **Keine Parser-Meldung ausgeben.** Der YAML-Parser zitiert die Zeile, in der
  // der Fehler steht — und dort kann ein Schlüssel stehen.
  abbruch(`die Datei ${datei} ist nicht lesbar oder kein YAML (Wert nicht angezeigt).`)
}

if (roh === null || typeof roh !== 'object') abbruch(`${datei} enthält kein Objekt.`)
const refs = roh.refs !== null && typeof roh.refs === 'object' && !Array.isArray(roh.refs) ? roh.refs : {}
const records = roh.records !== null && typeof roh.records === 'object' && !Array.isArray(roh.records) ? roh.records : {}

const refEintraege = []
for (const [ref, wert] of Object.entries(refs)) {
  if (typeof wert !== 'string') continue
  if (!istRef(ref)) {
    process.stderr.write(`dsh-keys-import: übersprungen — keine gültige ref: ${ref}\n`)
    continue
  }
  const klartext = wert.trim()
  if (klartext === '') continue
  refEintraege.push({ ref, klartext })
}

const recordEintraege = []
for (const [key, wert] of Object.entries(records)) {
  if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) continue
  if (!istRecordKey(key)) {
    process.stderr.write(`dsh-keys-import: übersprungen — keine gültige Record-Adresse: ${key}\n`)
    continue
  }
  const kind = wert.kind
  if (kind !== 'api-key' && kind !== 'grant') {
    process.stderr.write(`dsh-keys-import: übersprungen — unbekannte Art bei ${key}\n`)
    continue
  }
  recordEintraege.push({ key, kind, record: wert })
}

process.stdout.write(`Quelle: ${datei}\n`)
process.stdout.write(`  refs:    ${String(refEintraege.length)} (${refEintraege.map((e) => e.ref).join(', ') || '—'})\n`)
process.stdout.write(
  `  records: ${String(recordEintraege.length)} (${
    recordEintraege.map((e) => `${e.key} [${e.kind}]`).join(', ') || '—'
  })\n`,
)

if (!schreiben) {
  process.stdout.write('\nTrockenlauf. Nichts geschrieben. Mit `--schreiben` in die Datenbank übernehmen.\n')
  process.exit(0)
}

let auf = undefined
try {
  auf = await aufbau(process.env)
  const { sql, zugang, haupt } = auf

  let userId
  if (email !== '') {
    const zeilen = await zugang.unsafe(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email])
    userId = zeilen[0]?.id
    if (userId === undefined) abbruch(`kein Benutzer mit der Adresse ${email}`)
  } else {
    const zeilen = await zugang.unsafe(`SELECT id FROM users WHERE role = 'admin'`)
    if (zeilen.length !== 1) {
      abbruch(`ohne --benutzer braucht es genau einen Administrator, gefunden: ${String(zeilen.length)}`)
    }
    userId = zeilen[0]?.id
  }

  const vorhandeneRefs = await listeGeheimnisse(zugang, userId)
  const vorhandeneRecords = await listeCredentialRecords(zugang, userId)
  if (!ueberschreiben && (vorhandeneRefs.length > 0 || vorhandeneRecords.length > 0)) {
    abbruch(
      `für dieses Konto liegen schon ${String(vorhandeneRefs.length)} refs und ${String(vorhandeneRecords.length)} records. ` +
        'Mit `--ueberschreiben` ersetzen.',
    )
  }

  // **Sicherung, bevor irgendetwas geschrieben wird.** Der Import ändert die
  // Datei nicht; die Kopie ist trotzdem der Punkt, an dem ein späterer
  // Providerwechsel rückgängig gemacht werden kann.
  const sicherung = `${datei}.bak-${new Date().toISOString().replace(/[:.]/gu, '-')}`
  copyFileSync(datei, sicherung)
  process.stdout.write(`Sicherung: ${sicherung}\n`)

  let geschrieben = 0
  for (const eintrag of refEintraege) {
    await speichereGeheimnis(zugang, haupt, {
      userId,
      ref: eintrag.ref,
      klartext: new TextEncoder().encode(eintrag.klartext),
    })
    geschrieben += 1
  }
  for (const eintrag of recordEintraege) {
    await speichereCredentialRecord(zugang, haupt, {
      userId,
      key: eintrag.key,
      kind: eintrag.kind,
      record: eintrag.record,
    })
    geschrieben += 1
  }

  process.stdout.write(
    `\nGeschrieben: ${String(geschrieben)} Zeilen (${String(refEintraege.length)} refs, ${String(recordEintraege.length)} records).\n` +
      'Kein Wert wurde angezeigt. Die Datei bleibt liegen, bis der Postgres-Provider im Profil läuft.\n',
  )
} catch (fehler) {
  abbruch(fehler instanceof Error ? fehler.message : String(fehler))
} finally {
  if (auf !== undefined) await auf.sql.end({ timeout: 5 }).catch(() => undefined)
}
