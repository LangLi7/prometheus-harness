/**
 * Knoten-Hälfte des Obsidian-Plugins.
 *
 * Sie ist **kein leerer Platzhalter**: das Plugin bringt seine Routen selbst
 * mit. Die Implementierung liegt im Provider-Paket, damit sie ohne Browser
 * prüfbar bleibt; hier wird sie nur als Cordis-Plugin sichtbar.
 *
 * ## Warum die Anzeige als `Config` hier steht
 *
 * Die Oberfläche kennt zwei Orte, an denen ein Plugin erscheinen kann, und
 * beide sind **Anmeldungen** des Plugins selbst, keine Vorrechte:
 *
 * | Ort | Anmeldung | Was der Nutzer sieht |
 * |---|---|---|
 * | Seitenleiste | `sidebar.panellist` | Zeile links, neben Chat und Terminal |
 * | Plugins-Liste | `plugins.item` | Karte in der Gruppe „Offiziell" mit Kurzfassung und eigener Seite |
 *
 * Welchen der beiden das Plugin nimmt, war bisher **im Code entschieden**
 * (`order: 11`, immer `sidebar.panellist`). Hier steht es jetzt als Feld: der
 * Eintrag `pmh-obsidian` trägt es in seiner Konfiguration, die
 * Einstellungsseite zeigt es, und die Browser-Hälfte liest es über
 * `ctx.configForms.get('pmh-obsidian')`.
 *
 * ## Warum `Config` auf der Host-Hälfte steht, obwohl die Anzeige im Browser passiert
 *
 * Die Einstellungsseite eines Eintrags speist sich aus dessen
 * **Config-Schema** — es gibt keinen zweiten Anmeldeweg für Einstellungen. Ein
 * Feld, das nur der Browser kennt, wäre in keiner Einstellungsseite sichtbar.
 * Der Host liest die Werte nicht; er hält sie nur.
 *
 * **Vorgabe `sidebar`:** das ist das Verhalten von vorher. Ein Bestand soll
 * sich durch das Hinzufügen eines Feldes nicht ändern.
 *
 * **Kein `guide`-Feld — und das bleibt so.** Ein `guide`-Feld an dieser Stelle
 * wäre die Kachel des **Startbildschirms**. Was es gibt, ist etwas anderes: einen
 * Eintrag im Guide der **rechten Leiste**, angemeldet von der Browser-Hälfte am
 * Tab-Typ (`guide: [{ id: 'vault' }]`). Er öffnet denselben Vault als Tab neben
 * dem Chat. Zwei Leisten, zwei Anmeldewege — der eine ist eine Konfiguration am
 * Plugin-Eintrag, der andere eine Anmeldung am Tab-Dienst.
 *
 * @module @prometheus-harness/obsidian
 */

import z from '@deepseek-ai/schemastery'

export { apply, inject, name, default } from '@prometheus-harness/world-obsidian-provider'

/**
 * Die Anzeige des Panels — **eingestellt wird sie in den Plugin-Einstellungen**.
 */
export const Config = z.object({
  /**
   * Wo das Panel erscheint.
   *
   * `both` meldet beide Orte an — dieselbe Fläche an zwei Stellen, nicht zwei
   * Flächen.
   */
  surface: z
    .union([z.const('sidebar'), z.const('plugins'), z.const('both'), z.const('none')])
    .default('sidebar')
    .description('sidebar · plugins · both · none'),
  /** Die Stelle in der Leiste bzw. in der Plugin-Liste. Kleinere Zahl steht weiter oben. */
  order: z.natural().max(999).default(11).description('Platz in der Liste, kleinere Zahl zuerst'),
  /** Eine eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  label: z.string().default('').description('leer = Beschriftung aus dem Sprachpaket'),
})
