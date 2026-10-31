/**
 * **Welche Sitzung hält der Hauptbereich? — die Ableitung aus der Liste.**
 *
 * ## Warum das nicht die Sitzung „ist"
 *
 * Die Auswahl einer Sitzung gehört dem Panel-Besitzer (`ui-workspace`): er hält
 * eine Referenz auf genau eine Sitzung, und die Auswahl ist **kein Feld** der
 * Sitzungsliste. Öffentlich sichtbar wird sie nur als **Haltungszähler**:
 * `sessions.retainInfo(id)` nennt je Quelle, wie oft eine Sitzung gehalten wird.
 *
 * Dieses Plugin braucht die Auswahl **ohne React** — es schreibt die Adresse aus
 * einem Abonnement, nicht aus einem Rendering. Deshalb dieselbe Ableitung, die
 * der Kern selbst benutzt (`dsh-client-ui-workspace/lib/client.js`, Zeile 106,
 * für die Tastenkürzel):
 *
 * ```js
 * Object.values(ctx.sessions.list.getSnapshot().byId)
 *   .find((row) => (row.retainedBy.mainView ?? 0) > 0)
 * ```
 *
 * ## Die Grenze, offen benannt
 *
 * `retainedBy` steht **nicht** in der Typdeklaration von `SessionSummary`
 * (`@deepseek-ai/dsh-api-session-controller`), sondern wird zur Laufzeit von
 * `ui-session` an die Zeilen gehängt. Diese Datei liest es deshalb **defensiv**
 * (fehlt es, gilt 0) und die Prüfung in `tests/lage.test.ts` hält beide Fälle
 * fest. Ändert eine künftige Fassung des Kerns die Form, wird die Adresse
 * **nicht falsch**, sondern bleibt stehen — der Rückfall ist die leere Adresse,
 * nicht eine erfundene Sitzung.
 *
 * @module @prometheus-harness/client-tabs/lage
 */

/** Eine Listenzeile, so weit sie hier zählt. */
interface Zeile {
  readonly sessionId?: string
  readonly retainedBy?: Readonly<Record<string, number>>
}

/**
 * Die Sitzung, die der Hauptbereich hält.
 *
 * **Die erste genügt.** Der Hauptbereich hält genau eine; hielte er zwei (etwa
 * während einer Navigation, die beide Referenzen kurz offen läßt), ist die
 * Reihenfolge der Liste die des Kerns — und eine von beiden ist die richtige.
 *
 * @param byId - die Zeilen der Sitzungsliste
 * @returns die Kennung, oder `null`
 */
export function mainSessionId(byId: Readonly<Record<string, Zeile>>): string | null {
  for (const wert of Object.values(byId)) {
    const zeile = wert
    if (zeile === undefined || zeile === null) continue
    const gehalten = zeile.retainedBy?.['mainView'] ?? 0
    if (gehalten > 0 && typeof zeile.sessionId === 'string' && zeile.sessionId !== '') return zeile.sessionId
  }
  return null
}
