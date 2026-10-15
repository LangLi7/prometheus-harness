/**
 * Was kostet ein Umschlag — und was kostet nur ein Stück?
 *
 * ## Warum diese Sonde existiert
 *
 * Die Entscheidung für den Wissensspeicher lautet: **ein Datenschlüssel je
 * Benutzer** (ein Umschlag, viele Stücke) oder **ein Umschlag je Stück**. Die
 * Frage des Betreibers war nicht „welches ist schöner", sondern:
 *
 *   *„was ist effizienter und lohnt sich dieser Mehraufwand an Schema-Arbeit?"*
 *
 * Das ist eine **Meßfrage**, und sie ist mit `verpacke` und `verschluessele` aus
 * `packages/auth/secrets` direkt meßbar. Der Unterschied ist nicht der
 * Verschlüsselungsalgorithmus — der ist in beiden Fällen AES-GCM über dieselben
 * Bytes —, sondern die **Schlüsselerzeugung und das Wickeln**, die bei einem
 * Umschlag je Stück **pro Stück** anfallen.
 *
 * ## Was gemessen wird
 *
 *   A  `verschluessele(stueck, datenschluessel)`  — der Weg „ein Schlüssel je
 *      Benutzer": der Datenschlüssel existiert, jedes Stück wird nur noch
 *      symmetrisch verschlüsselt.
 *   B  `verpacke(stueck, hauptschluessel)`        — der Weg „ein Umschlag je
 *      Stück": je Stück ein neuer Datenschlüssel **und** ein Wickeln.
 *   C  `verpacke` **einmal**                      — der Einmalaufwand von Weg A.
 *
 * Gemessen wird mit `process.hrtime.bigint()` **im** Prozeß, nicht von außen
 * abgetastet (siehe `docs/status/groesse-und-ressourcen.md` §6: eine
 * Außenabtastung war dort schon einmal zu grob).
 *
 * Aufruf:  bun docs/status/messsonden/envelope-cost.mjs [stuecke]
 * Exit 0 = gemessen. Exit 2 = ein Ziel ließ sich nicht laden.
 */

import { erzeugeSchluessel, verschluessele } from '../../../packages/auth/secrets/src/crypto.ts'
import { verpacke } from '../../../packages/auth/secrets/src/index.ts'

/** Ein realistischer Textabschnitt — `chunker.ts` schneidet bei 1200 Zeichen. */
const STUECK_BYTES = 1200

const stuecke = Number(process.argv[2] ?? 2000)

if (!Number.isFinite(stuecke) || stuecke <= 0) {
  process.stderr.write(`Ungueltige Anzahl Stuecke: ${String(process.argv[2])}\n`)
  process.exit(2)
}

/** Ein Stück Klartext, wie es der Zerleger erzeugt. */
const stueck = new TextEncoder().encode('x'.repeat(STUECK_BYTES))

/** Der Hauptschluessel, wie ihn `holeHauptschluessel` liefert. */
const haupt = { schluessel: erzeugeSchluessel(), version: 1, herkunft: 'sonde' }

/** Der Datenschluessel des Benutzers — bei Weg A genau einer. */
const datenschluessel = erzeugeSchluessel()

if (stueck.length !== STUECK_BYTES || haupt.schluessel.length !== 32 || datenschluessel.length !== 32) {
  process.stderr.write('Ein Ziel liess sich nicht laden: Groessen stimmen nicht.\n')
  process.exit(2)
}

/** Mißt `n` Durchläufe und gibt Millisekunden zurück. */
function miss(n, tu) {
  const start = process.hrtime.bigint()
  for (let i = 0; i < n; i++) tu()
  return Number(process.hrtime.bigint() - start) / 1e6
}

const msA = miss(stuecke, () => verschluessele(stueck, datenschluessel))
const msB = miss(stuecke, () => verpacke(stueck, haupt))
const msC = miss(1, () => verpacke(stueck, haupt))

const jeA = (msA / stuecke) * 1000
const jeB = (msB / stuecke) * 1000

/** Zehn Millionen Stücke — eine Größenordnung für einen gefüllten Speicher. */
const GROSS = 10_000_000
const hochA = (msA / stuecke) * GROSS / 1000
const hochB = (msB / stuecke) * GROSS / 1000

const zahl = (n, stellen = 2) => n.toFixed(stellen).replace('.', ',')

process.stdout.write(
  `Umschlagkosten — ${stuecke} Stuecke je ${STUECK_BYTES} Byte, gemessen im Prozeß\n\n` +
    `  A  nur verschluesseln   (ein Schluessel je Benutzer)  ${zahl(msA)} ms gesamt   ${zahl(jeA, 3)} µs je Stueck\n` +
    `  B  verpacke je Stueck   (ein Umschlag je Stueck)      ${zahl(msB)} ms gesamt   ${zahl(jeB, 3)} µs je Stueck\n` +
    `  C  verpacke EINMAL      (Einmalaufwand von Weg A)     ${zahl(msC, 3)} ms\n\n` +
    `  Verhaeltnis B/A je Stueck: ${zahl(jeB / jeA, 1)}x\n` +
    `  Hochgerechnet auf ${GROSS.toLocaleString('de-DE')} Stuecke:\n` +
    `    Weg A (ein Schluessel je Benutzer): ${zahl(hochA, 1)} s\n` +
    `    Weg B (Umschlag je Stueck)        : ${zahl(hochB, 1)} s   (+${zahl(hochB - hochA, 1)} s)\n`,
)
