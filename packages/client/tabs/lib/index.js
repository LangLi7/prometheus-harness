/**
 * Knoten-Hälfte der Ansichten — **leer**, wie bei einer reinen Oberflächen-Ergänzung.
 *
 * Diese Datei existiert, damit das Paket als Zeile im Ladeprogramm des Hosts
 * **vorkommt**; nur dann nimmt die Modul-Hälfte des Kerns die Browser-Hälfte in
 * die Startliste auf. Die Arbeit tut `lib/client.js` — gebaut aus
 * `src/index.tsx` (`bun run build.mjs`).
 *
 * @module @prometheus-harness/client-tabs
 */

/** Knoten-Körper: dieses Paket hat kein Verhalten auf der Host-Seite. */
export function apply() {}
