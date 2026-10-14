/**
 * Deutsches Sprachpaket — die **Knoten-Hälfte**.
 *
 * ## Warum hier nichts passiert
 *
 * Die ganze Arbeit tut die **Browser-Hälfte** (`lib/client.js`): sie meldet die Sprache an
 * und hängt die Wörterbücher ein. Diese Datei existiert, damit das Paket als Zeile im
 * Ladeprogramm des Hosts **vorkommt** — und genau das ist die Bedingung dafür, daß die
 * Modul-Hälfte des Kerns die Browser-Hälfte in die Startliste aufnimmt.
 *
 * So steht es wörtlich im Patch des Web-Bündels
 * (`node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml`):
 *
 * > *„`dsh.client` rows are the browser roster the modules node half scans into
 * > `window.__DSH_BOOT__`; the modules row is simultaneously a host row."*
 *
 * Und so macht es der Kern selbst: die Knoten-Hälfte von `dsh-client-ui-skill` ist ein
 * leeres `apply` mit dem Kommentar *„Pure UI plugin: the empty apply exists so the plugin
 * appears in the host cordis.yml / Loader"*.
 *
 * ## Was hier **nicht** steht
 *
 * Kein `inject`: die Knoten-Hälfte braucht keinen Dienst. Das `inject` der Browser-Hälfte
 * steht in `src/index.ts` (`['locale']`), das `dsh.client.inject` der `package.json` nennt
 * **Paketnamen** für die Ladereihenfolge — drei verschiedene Dinge, die leicht verwechselt
 * werden.
 *
 * @module @prometheus-harness/client-locale
 */

/** Knoten-Körper: dieses Paket hat kein Verhalten auf der Host-Seite. */
export function apply() {}
