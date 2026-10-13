/**
 * Typdeklaration für SQL-Importe.
 *
 * **Warum das nötig ist.** Bun lädt `.sql`-Dateien direkt als Text
 * (`import sql from './x.sql' with { type: 'text' }`). Der Typechecker kennt
 * diese Form nicht von sich aus — ohne diese Datei wäre jeder SQL-Import ein
 * Fehler, obwohl er zur Laufzeit funktioniert. Eine Lücke im Typsystem, die
 * benannt statt umgangen wird.
 *
 * **Was hier zuerst falsch stand — und gemessen widerlegt wurde.** Hier stand:
 * „Gilt für jeden `.sql`-Import im Projekt." Das ist **falsch**. Eine
 * Ambient-Deklaration gilt nur für das **Programm**, das diese Datei
 * einschließt — und `.d.ts`-Dateien werden nicht importiert, wandern also nicht
 * mit.
 *
 * Gemessen am 13.10.2026, als `@prometheus-harness/store-postgres` den
 * Migrationsläufer importierte:
 *
 * ```
 * ../db-schema/src/index.ts(29,19): error TS2307:
 *   Cannot find module '../migrations/0001_identitaet.sql' or its corresponding
 *   type declarations.        ← und drei weitere, für jede Migration
 * ```
 *
 * Der Fehler entsteht **nicht** in `db-schema` (dort typprüft alles grün),
 * sondern **beim Import aus einem anderen Paket**. Genau deshalb vermeidet
 * `packages/api/readiness` den Import von `db-schema` — dort steht als Grund
 * „sechs `TS2307`", also dieselbe Ursache.
 *
 * **Die Folge, die daraus folgt:** jedes Paket, das `db-schema` importiert,
 * braucht seine **eigene** Kopie dieser Deklaration. `store-postgres` hat sie
 * (`src/sql.d.ts`). **Offener Punkt:** das gehört an eine gemeinsame Stelle —
 * eine Ambient-Deklaration im Typsystem des Projekts, statt einer Kopie je
 * importierendem Paket.
 */
declare module '*.sql' {
  const content: string
  export default content
}
