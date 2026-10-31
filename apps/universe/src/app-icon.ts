/**
 * **Das App-Zeichen der Welt** — die Marke, wie sie im Browserreiter steht.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Ein Favicon ist ein **Ergebnis**, kein Quelltext: es liegt als `public/favicon.svg` im Projekt und
 * wird vom Bau mitgenommen. Damit gibt es zwei Orte, an denen „die Marke" steht — die Kopfzeile
 * (gezeichnet aus `@prometheus-harness/icons`) und die Datei im Reiter. Zwei Orte sind eine
 * Gelegenheit zum Auseinanderlaufen, und ein Unterschied fällt im Reiter kaum auf.
 *
 * Deshalb steht die **Beschreibung** des Zeichens hier, in einer Datei, die beide lesen können:
 * `tools/write-favicon.mjs` schreibt daraus die Datei, und `tests/favicon.test.ts` prüft, daß die
 * Datei noch dazu paßt. Wer die Farbe ändert, ändert sie an **einer** Stelle und bekommt beim
 * nächsten Testlauf gesagt, ob die Datei nachgezogen werden muß.
 *
 * ## Warum eine feste Farbe
 *
 * Ein Zeichen in der Oberfläche erbt seine Farbe (`currentColor`). Eine **Datei** hat niemanden, von
 * dem sie erben könnte: `currentColor` wäre dort Schwarz — und neben einem dunklen Browser-Thema
 * unsichtbar. Der Betreiber sieht das Zeichen im Reiter, also muß die Farbe **drinstehen**.
 *
 * @module app-icon
 */

import { iconFile } from '@prometheus-harness/icons'

/**
 * Der Akzent der Oberfläche — derselbe Wert wie `--a` in `app.css`.
 *
 * **Warum hier eine Zahl und nicht ein Verweis.** CSS-Variablen gelten im Dokument, nicht in einer
 * Datei, die der Browser apart lädt. Wer den Akzent ändert, ändert ihn an zwei Stellen — dafür steht
 * diese hier **an einer** Stelle im Code und die Prüfung nennt die Datei, wenn sie nicht mehr paßt.
 */
export const APP_ICON_FARBE = '#ff9d3f'

/**
 * Der Inhalt der Datei `public/favicon.svg`.
 *
 * @returns das vollständige SVG-Dokument
 */
export function appIconSvg(): string {
  return iconFile('prometheus', APP_ICON_FARBE)
}
