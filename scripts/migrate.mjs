/**
 * `scripts/migrate.mjs` — die Datenbank auf den Stand der Anwendung bringen.
 *
 * ## Warum es das geben muß
 *
 * Die Migrationen gibt es seit dem ersten Tag (`packages/auth/db-schema`), und sie
 * waren **nur aus Tests** aufrufbar. Wer das Projekt frisch installierte, bekam
 * eine leere Datenbank: keine Tabellen, kein Schema, und der Bereitschaftsendpunkt
 * meldete zu Recht **503**, ohne daß jemand sagen konnte, was zu tun ist.
 *
 * Ein Schema, das nur ein Test anlegen kann, ist kein installationsfähiges Schema.
 *
 * ## Die zwei Adressen — und warum sie getrennt sind
 *
 * | Variable | Rolle | Warum |
 * |---|---|---|
 * | `MIGRATION_DATABASE_URL` | `pmh_owner` | Migrationen sind **DDL** — Tabellen anlegen. `pmh_app` darf das nicht, und das ist Absicht |
 * | `DATABASE_URL` | `pmh_app` | die Anwendung liest und schreibt **Daten** |
 *
 * Wer für beides dieselbe Rolle nimmt, hebt das Rechtemodell auf, ohne daß es
 * auffällt. Dieses Skript liest **nur** `MIGRATION_DATABASE_URL` — fällt sie
 * aus, bricht es ab, statt heimlich die Anwendungsrolle zu benutzen.
 *
 * @module scripts/migrate
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCHEMA_VERSION, migrate } from '../packages/auth/db-schema/src/index.ts'

/**
 * Baut das Migrationsziel über den echten Treiber.
 *
 * **Warum hier und nicht in `db-schema`.** `db-schema` definiert die
 * **Schnittstelle** (`MigrationTarget`) und bleibt dadurch ohne Datenbanktreiber
 * prüfbar. Wer den Treiber anschließt, ist Aufgabe des Aufrufers — hier.
 *
 * **Warum kein `as never[]`.** Diese Datei ist eine `.mjs` und wird von Bun als
 * **JavaScript** ausgeführt; eine Typzusicherung ist dort ein Syntaxfehler. Beim
 * ersten Lauf stand genau das hier — und Bun brach mit
 * `Expected ")" but found "as"` ab. Typen gehören in eine `.ts` oder in JSDoc,
 * nicht in eine `.mjs`.
 *
 * @param {import('postgres').Sql} sql - die Verbindung
 * @returns {{exec: (anweisung: string) => Promise<void>, query: <T>(anweisung: string, werte?: readonly unknown[]) => Promise<readonly T[]>}}
 */
function zielVon(sql) {
  return {
    async exec(anweisung) {
      await sql.unsafe(anweisung)
    },
    async query(anweisung, werte) {
      return await sql.unsafe(anweisung, werte ?? [])
    },
  }
}

/**
 * Führt die Migrationen aus.
 *
 * @param optionen - Adresse, Ausgabe und Treiber, austauschbar für Prüfungen
 * @returns der Exit-Code
 */
export async function migriere(optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const adresse = optionen.adresse ?? process.env.MIGRATION_DATABASE_URL

  if (adresse === undefined || adresse.trim() === '') {
    // **Fail-loud und mit dem nächsten Schritt.** Ein Skript, das „geht nicht"
    // sagt, ohne zu sagen was zu tun ist, kostet den Benutzer eine halbe Stunde.
    schreibe(
      'FEHLER: MIGRATION_DATABASE_URL ist nicht gesetzt.\n' +
        '\n' +
        'Die Migrationen brauchen die Rolle `pmh_owner` (DDL), nicht die der\n' +
        'Anwendung (`pmh_app`). Setze:\n' +
        '\n' +
        '  MIGRATION_DATABASE_URL=postgres://pmh_owner:<kennwort>@127.0.0.1:5432/pmh\n' +
        '\n' +
        '`scripts/install.mjs` schreibt diesen Wert nach `.env`.\n',
    )
    return 1
  }

  // **Der Treiber ist austauschbar.** Eine Prüfung, die den echten `postgres`
  // lädt, bräuchte eine laufende Datenbank — und würde ohne sie übersprungen.
  // Übersprungene Prüfungen sind keine. Mit einem austauschbaren Treiber bleibt
  // die Logik prüfbar: die Adressprüfung, der Abgleich der Fassung, der
  // Fehlerpfad und das Schließen der Verbindung.
  const oeffne = optionen.oeffne ?? (async (a) => {
    const { default: postgres } = await import('postgres')
    return postgres(a, { max: 1, onnotice: () => undefined })
  })

  let sql
  try {
    sql = await oeffne(adresse)
    const bericht = await migrate(zielVon(sql))
    if (bericht.fresh) {
      schreibe(`Schema neu angelegt: ${bericht.applied.length} Migration(en) angewendet.\n`)
    } else if (bericht.applied.length === 0) {
      schreibe(`Schema ist aktuell (Fassung ${String(bericht.version)}). Nichts zu tun.\n`)
    } else {
      schreibe(
        `Schema aktualisiert: ${bericht.applied.length} Migration(en) ` +
          `(${bericht.applied.join(', ')}) — jetzt Fassung ${String(bericht.version)}.\n`,
      )
    }
    // **Der Abgleich mit dem, was die Anwendung erwartet.** Beides steht im
    // Quelltext; ein Auseinanderlaufen wäre sonst erst beim Start sichtbar.
    if (bericht.version !== SCHEMA_VERSION) {
      schreibe(
        `WARNUNG: die Datenbank steht auf Fassung ${String(bericht.version)}, ` +
          `der Quelltext erwartet ${String(SCHEMA_VERSION)}.\n`,
      )
      return 1
    }
    return 0
  } catch (fehler) {
    schreibe(`FEHLER bei den Migrationen: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
    return 1
  } finally {
    // Die Verbindung ausdrücklich schließen: ein offener Zeiger hält den Prozeß
    // am Leben, und das Skript „hängt" nach getaner Arbeit.
    if (sql !== undefined) await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await migriere()
}
