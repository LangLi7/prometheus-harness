/**
 * Typdeklaration für SQL-Importe — die **Kopie**, die dieses Paket braucht.
 *
 * **Warum hier eine zweite Kopie steht.** `@prometheus-harness/db-schema` hat
 * dieselbe Deklaration, und sie wirkt dort auch. Sie wirkt aber **nur** dort:
 * eine Ambient-Deklaration gilt für das Programm, das sie einschließt, und
 * `.d.ts`-Dateien werden nicht importiert — sie wandern also nicht mit.
 *
 * Gemessen: ohne diese Datei scheitert der Typlauf dieses Pakets mit vier
 * `TS2307` auf die Migrationsdateien, obwohl `db-schema` selbst grün ist. Der
 * ausführliche Befund samt Befehl steht in
 * `packages/auth/db-schema/src/sql.d.ts`.
 *
 * **Warum dieses Paket `db-schema` überhaupt importiert.** Nur der **Test** tut
 * das, und nur um das Schema herzustellen, gegen das er prüft. Der Speicher
 * selbst kennt kein Schema — er bekommt einen Zugang und ein paar SQL-Anweisungen.
 *
 * **Offener Punkt:** die Deklaration gehört an eine gemeinsame Stelle, statt in
 * jedes importierende Paket kopiert zu werden.
 */
declare module '*.sql' {
  const content: string
  export default content
}
