/**
 * Typdeklaration für SQL-Importe — die **zweite** Kopie im Projekt.
 *
 * **Warum hier eine Kopie steht.** `@prometheus-harness/db-schema` hat dieselbe
 * Deklaration, und sie wirkt dort auch. Sie wirkt aber **nur** dort: eine
 * Ambient-Deklaration gilt für das Programm, das sie einschließt, und
 * `.d.ts`-Dateien werden nicht importiert — sie wandern also nicht mit.
 *
 * Gemessen, als `@prometheus-harness/auth-http` den Migrationsläufer importierte:
 *
 * ```
 * ../../auth/db-schema/src/index.ts(29,19): error TS2307:
 *   Cannot find module '../migrations/0001_identitaet.sql' or its corresponding
 *   type declarations.        ← und drei weitere, für jede Migration
 * ```
 *
 * **Das ist die zweite Ausfertigung** — `store-postgres` hat die erste
 * (`src/sql.d.ts`). Der Befund steht ausführlich in
 * `packages/auth/db-schema/src/sql.d.ts`.
 *
 * **Was daraus folgt, und warum die Empfehlung jetzt dringlicher ist.** Mit der
 * ersten Kopie ließ sich noch sagen: „ein Einzelfall". Jetzt sind es **zwei**
 * Pakete mit derselben Kopie, und jedes weitere, das `db-schema` importiert,
 * braucht eine dritte. Die Deklaration gehört an **eine** gemeinsame Stelle —
 * eine Ambient-Deklaration im Typsystem des Projekts statt einer Kopie je
 * importierendem Paket. Offener Punkt, und mit jeder Kopie teurer.
 *
 * **Warum dieses Paket `db-schema` überhaupt importiert.** Nur der **Test** tut
 * das, und nur um das Schema herzustellen, gegen das er prüft. Die Wege selbst
 * kennen kein Schema.
 */
declare module '*.sql' {
  const content: string
  export default content
}
