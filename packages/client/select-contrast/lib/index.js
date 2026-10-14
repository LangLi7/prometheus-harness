/**
 * Knoten-Hälfte des Kontrast-Plugins — **leer**, wie bei einer reinen Oberflächen-Ergänzung.
 *
 * Diese Datei existiert, damit das Paket als Zeile im Ladeprogramm des Hosts **vorkommt**;
 * nur dann nimmt die Modul-Hälfte des Kerns die Browser-Hälfte in die Startliste auf. So steht
 * es wörtlich im Patch des Web-Bündels (`@deepseek-ai/dsh-web-app/cordis.patch.yml`):
 *
 * > *„`dsh.client` rows are the browser roster the modules node half scans into
 * > `window.__DSH_BOOT__`."*
 *
 * @module @prometheus-harness/client-select-contrast
 */

/** Knoten-Körper: dieses Paket hat kein Verhalten auf der Host-Seite. */
export function apply() {}
