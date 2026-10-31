/**
 * Knoten-Hälfte des Welt-Umschalters — **leer**, wie bei einer reinen Oberflächen-Ergänzung.
 *
 * Diese Datei existiert, damit das Paket als Zeile im Ladeprogramm des Hosts **vorkommt**; nur dann
 * nimmt die Modul-Hälfte des Kerns die Browser-Hälfte in die Startliste auf. Wörtlich aus dem Patch
 * des Web-Bündels (`@deepseek-ai/dsh-web-app/cordis.patch.yml`):
 *
 * > *„`dsh.client` rows are the browser roster the modules node half scans into
 * > `window.__DSH_BOOT__`."*
 *
 * Die Arbeit tut `lib/client.js` — gebaut aus `src/index.ts`
 * (`bun scripts/client-buendel.mjs --paket packages/client/world-switch`).
 *
 * @module @prometheus-harness/client-world-switch
 */

/** Knoten-Körper: dieses Paket hat kein Verhalten auf der Host-Seite. */
export function apply() {}
