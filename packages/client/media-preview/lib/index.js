/**
 * Knoten-Hälfte — **leer**, wie bei einer reinen Oberflächen-Ergänzung.
 *
 * Diese Datei muß existieren, damit das Paket als Zeile im Ladeprogramm des
 * Hosts vorkommt; erst dann nimmt die Modul-Hälfte des Kerns die Browser-Hälfte
 * in die Startliste auf. Die Arbeit tut `lib/client.js` — gebaut aus
 * `src/index.tsx` (`bun run build`).
 *
 * @module @prometheus-harness/client-media-preview
 */

/** Knoten-Körper: dieses Paket hat kein Verhalten auf der Host-Seite. */
export function apply(): void {}
