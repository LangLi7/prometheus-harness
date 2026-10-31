/**
 * Knoten-Hälfte des Konten-Panels — **bis auf die Anzeige-Einstellungen leer**.
 *
 * Diese Datei existiert, damit das Paket als Zeile im Ladeprogramm des Hosts
 * **vorkommt**; nur dann nimmt die Modul-Hälfte des Kerns die Browser-Hälfte in
 * die Startliste auf (`dsh.client`-Zeilen sind zugleich Host-Zeilen — wörtlich
 * im Patch des Web-Bündels: *„`dsh.client` rows are the browser roster the
 * modules node half scans into `window.__DSH_BOOT__`"*).
 *
 * Die Arbeit tut `lib/client.js` — gebaut aus `src/index.tsx` mit
 * `bun run build.mjs`. Die Wege selbst liegen in `@prometheus-harness/auth-http`.
 *
 * @module @prometheus-harness/accounts
 */

import z from '@deepseek-ai/schemastery'

/**
 * Die Anzeige des Panels — **eingestellt wird sie in den Plugin-Einstellungen**.
 *
 * ## Warum die Anzeige ein Feld des Host-Eintrags ist
 *
 * Die Oberfläche kennt zwei Orte, an denen ein Plugin erscheinen kann, und beide sind
 * **Anmeldungen** des Plugins selbst, keine Vorrechte:
 *
 * | Ort | Anmeldung | Was der Nutzer sieht |
 * |---|---|---|
 * | Seitenleiste | `sidebar.panellist` | Zeile links, neben Chat und Terminal |
 * | Plugins-Liste | `plugins.item` | Karte in der Gruppe „Offiziell" mit Kurzfassung und eigener Seite |
 *
 * Welchen der beiden dieses Plugin nimmt, war bisher **im Code entschieden** (`order: 12`, immer
 * `sidebar.panellist`). Hier steht es jetzt als Feld: der Eintrag `pmh-accounts` trägt es in seiner
 * Konfiguration, die Einstellungsseite zeigt es, und die Browser-Hälfte liest es über
 * `ctx.configForms.get('pmh-accounts')`. Die Kennung ist die `- id:` aus
 * [cordis.patch.yml](../cordis.patch.yml) — nicht der Paketname und nicht `PANEL_ID`.
 *
 * ## Warum `Config` auf der Host-Hälfte steht, obwohl die Anzeige im Browser passiert
 *
 * Die Einstellungsseite eines Eintrags speist sich aus dessen **Config-Schema** — es gibt keinen
 * zweiten Anmeldeweg für Einstellungen. Ein Feld, das nur der Browser kennt, wäre in keiner
 * Einstellungsseite sichtbar. Der Host liest die Werte nicht; er hält sie nur.
 *
 * **Vorgabe `sidebar`:** das ist das Verhalten von vorher. Ein Bestand soll sich durch das
 * Hinzufügen eines Feldes nicht ändern.
 *
 * ## Warum es hier kein `guide` gibt
 *
 * Dieses Plugin meldet **keine Kachel auf dem Startbildschirm** an (anders als `pmh-usage`, das eine
 * anmeldet). Ein Feld für etwas, das es nicht gibt, wäre eine Einstellung ohne Wirkung — und eine
 * Einstellung, die nichts tut, ist schlimmer als keine.
 */
export const Config = z.object({
  /**
   * Wo das Panel erscheint.
   *
   * `both` meldet beide Orte an — dieselbe Fläche an zwei Stellen, nicht zwei Flächen.
   */
  surface: z
    .union([z.const('sidebar'), z.const('plugins'), z.const('both'), z.const('none')])
    .default('sidebar')
    .description('sidebar · plugins · both · none'),
  /** Die Stelle in der Leiste bzw. in der Plugin-Liste. Kleinere Zahl steht weiter oben. */
  order: z.natural().max(999).default(12).description('Platz in der Liste, kleinere Zahl zuerst'),
  /** Eine eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  label: z.string().default('').description('leer = Beschriftung aus dem Sprachpaket'),
})

/** Knoten-Körper: dieses Paket hat kein Verhalten auf der Host-Seite. */
export function apply() {}
