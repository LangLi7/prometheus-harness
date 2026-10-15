/**
 * `@prometheus-harness/db-schema/operational-database` — **welche Datenbank die Anwendung benutzt.**
 *
 * ## Warum das hier steht
 *
 * Am 15.10.2026 hat ein zerstörender Schematest die Betriebsdatenbank abgeräumt. Seine Sicherung
 * verglich den Namen der Prüfdatenbank mit `process.env.DATABASE_URL` — also mit der Angabe aus
 * der **Sitzung**. Ich hatte `DATABASE_URL` für einen Lauf auf meine Wegwerf-Datenbank
 * umgesetzt; die Sicherung sah zwei verschiedene Namen und ließ durch. Die Prüfung lief gegen
 * `pmh`.
 *
 * **Die Lehre:** die Datei `.env` ist die Angabe des Betreibers. Eine Umgebungsvariable einer
 * einzelnen Sitzung darf sie nicht entwaffnen. Vier Prüfdateien brauchen diesen Vergleich — hier
 * steht er **einmal**.
 *
 * @module @prometheus-harness/db-schema/operational-database
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Der Datenbankname aus einer Verbindungsadresse.
 *
 * @param adresse - die Adresse (`postgres://…/pmh`)
 * @returns der Name, oder `''` wenn die Adresse unbrauchbar ist
 */
export function datenbankNameAus(adresse: string | undefined): string {
  if (adresse === undefined || adresse.trim() === '') return ''
  try {
    return new URL(adresse.trim()).pathname.replace(/^\//u, '')
  } catch {
    return ''
  }
}

/**
 * Sucht die `.env` von einem Pfad aus **aufwärts** und liest die Datenbanknamen daraus.
 *
 * **Warum aufwärts und nicht mit einer festen Zahl von `..`.** Die Prüfdateien liegen
 * unterschiedlich tief (`packages/auth/db-schema/tests`, `packages/api/auth-http/tests`). Eine
 * feste Zahl wäre in jeder Datei eine andere — und eine davon wäre irgendwann falsch.
 *
 * Gelesen werden **`DATABASE_URL` und `MIGRATION_DATABASE_URL`** — die Datenbank der Anwendung
 * und die, auf der migriert wird. Beide sind „Betriebsdatenbank" im Sinn der Riegel.
 *
 * Gelesen wird **nur**; die Datei wird nie geschrieben.
 *
 * @param start - Verzeichnis, bei dem die Suche beginnt (meist das der Prüfdatei)
 * @returns die Datenbanknamen aus der Datei (doppelte entfernt)
 */
export function betriebsdatenbankNamenAusDatei(start: string | URL): readonly string[] {
  let ordner = typeof start === 'string' ? start : fileURLToPath(start)
  for (let stufe = 0; stufe < 8; stufe += 1) {
    const datei = join(ordner, '.env')
    if (existsSync(datei)) {
      const namen: string[] = []
      try {
        for (const zeile of readFileSync(datei, 'utf8').split(/\r?\n/u)) {
          const treffer = /^\s*(DATABASE_URL|MIGRATION_DATABASE_URL)\s*=\s*(.+)$/u.exec(zeile)
          if (treffer?.[2] !== undefined) {
            const name = datenbankNameAus(treffer[2])
            if (name !== '') namen.push(name)
          }
        }
      } catch {
        // Nicht lesbar: dann gilt nur die Umgebung.
      }
      return [...new Set(namen)]
    }
    const eltern = dirname(ordner)
    if (eltern === ordner) break
    ordner = eltern
  }
  return []
}

/**
 * Alle Datenbanknamen, die als **Betriebsdatenbank** gelten — **aus der Datei, nicht aus der
 * Sitzung.**
 *
 * ## Warum nicht aus der Umgebung — gemessen, zweimal
 *
 * 1. **Der Unfall (15.10.2026).** Der Riegel verglich mit `process.env.DATABASE_URL`. Ich hatte
 *    diese Angabe für einen Lauf auf meine Wegwerf-Datenbank umgesetzt; der Riegel sah zwei
 *    verschiedene Namen und ließ durch. Die Prüfung lief gegen die Betriebsdatenbank und räumte
 *    sie ab.
 * 2. **Der Fehlalarm (derselbe Tag, danach).** Der erste Reparaturversuch zog die Umgebung
 *    **und** die Datei heran. Ein Lauf, in dem **alles** — Anwendung, Migration und Prüfung —
 *    bewußt auf die Wegwerf-Datenbank zeigt (ein legitimer Lauf), brach ab, weil der Prüfname
 *    auch in der Umgebungsangabe stand.
 *
 * Die Datei ist die Angabe des Betreibers. Eine Umgebungsvariable einer einzelnen Sitzung darf
 * sie weder entwaffnen (Fall 1) noch den Lauf unmöglich machen (Fall 2). Deshalb: **nur die
 * Datei.**
 *
 * @param start - Verzeichnis für die Suche nach der `.env`
 * @returns die Namen (doppelte entfernt); leer, wenn keine `.env` gefunden wurde
 */
export function betriebsdatenbankNamen(start: string | URL): readonly string[] {
  return betriebsdatenbankNamenAusDatei(start)
}
