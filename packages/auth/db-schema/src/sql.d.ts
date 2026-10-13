/**
 * Typdeklaration für SQL-Importe.
 *
 * **Warum das nötig ist.** Bun lädt `.sql`-Dateien direkt als Text
 * (`import sql from './x.sql' with { type: 'text' }`). Der Typechecker kennt
 * diese Form nicht von sich aus — ohne diese Datei wäre jeder SQL-Import ein
 * Fehler, obwohl er zur Laufzeit funktioniert. Eine Lücke im Typsystem, die
 * benannt statt umgangen wird.
 *
 * Gilt für jeden `.sql`-Import im Projekt.
 */
declare module '*.sql' {
  const content: string
  export default content
}
