/**
 * `@prometheus-harness/icons` — **der Zeichensatz der Prometheus-Oberfläche.**
 *
 * ## Warum es dieses Paket gibt
 *
 * In der Welt und in der Insel standen bis zum 15.10.2026 **Zeichen aus der Schrift**: `◆` für die
 * Marke, `▤` für den Chat, `◉` für den Überblick, `⟲` für das Zurücksetzen, `#` für einen Ort, `~`
 * für einen Körper, `⚙`, `✕`, `❯`. Der Betreiber: *„emoji sieht schon scheisse aus und
 * umprofessionell"*.
 *
 * Er hat recht, und der Grund ist nicht Geschmack:
 *
 *   1. **Ein Schriftzeichen ist eine Schriftart.** Wie `◆` aussieht, entscheidet der Rechner des
 *      Betrachters. Hier stand ein Vollton-Raute, auf einem anderen Rechner wäre es eine dünne — und
 *      `▤` fehlt in manchen Schriften ganz, dann steht dort ein **Platzhalterkasten**.
 *   2. **Ein Schriftzeichen hat keine Bedeutung.** `#` heißt „Nummer", nicht „Ort"; `~` heißt
 *      „ungefähr", nicht „Körper". Wer die Oberfläche liest, muss die Bedeutung aus dem Zusammenhang
 *      raten — und `⊙` vor „EINSTELLUNGEN" rät niemand.
 *   3. **Ein Schriftzeichen folgt keiner Linie.** Mal Vollton, mal Strich, mal 10 px breit, mal 14:
 *      eine Reihe davon sieht aus wie gewachsen, nicht wie gebaut.
 *
 * Ein gezeichnetes Zeichen ist dagegen an **einer** Stelle definiert, erbt die Farbe der Oberfläche
 * (`currentColor`), folgt einer Strichstärke — und ist auf jedem Rechner dasselbe Bild.
 *
 * ## Wie man es benutzt
 *
 * ```ts
 * import { iconMarkup, iconElement, SPRITE } from '@prometheus-harness/icons'
 *
 * // 1. Als Markup in eine Vorlage (das Zeichen bringt seine Größe nicht mit — die kommt aus CSS):
 * knopf.innerHTML = iconMarkup('prometheus')
 *
 * // 2. Als Element, fertig angehängt:
 * zeile.append(iconElement(document, 'chat'))
 *
 * // 3. Einmal je Seite das Sprite, danach überall nur noch <use>:
 * document.body.insertAdjacentHTML('afterbegin', SPRITE)
 * // <svg class="pmh-icon"><use href="#pmh-icon-chat"/></svg>
 * ```
 *
 * ## Was dieses Paket NICHT tut
 *
 * * **Es mischt keine Farben ein.** Jede Form zeichnet mit `currentColor`; die Farbe kommt aus dem
 *   CSS des Aufrufers.
 * * **Es setzt keine Größe.** `width`/`height` fehlen im Markup bewusst — sie gehören in die
 *   Oberfläche (`1em`, `15px`, wie sie es braucht). Ein Zeichen mit eingebauter Größe wäre in der
 *   Kopfzeile zu groß und in einer Tabelle zu klein.
 * * **Es bringt keine Schrift mit.** Nichts hier ist ein Buchstabe.
 *
 * @module @prometheus-harness/icons
 */

import { ICONS, ICON_NAMES, RASTER, STRICH, STRICHSTAERKE, z } from './shapes'
import type { IconName } from './shapes'

export { ICONS, ICON_NAMES, RASTER, STRICHSTAERKE }
export type { IconName }

/** Die Klasse, die jedes Zeichen trägt — die Oberfläche hängt ihre Größe daran. */
export const ICON_CLASS = 'pmh-icon'

/** Der Namensraum, in dem ein Zeichen lebt. Ohne ihn sieht ein Browser es nicht als Bild. */
export const SVG_NS = 'http://www.w3.org/2000/svg'

/** Womit jede Kennung im Sprite beginnt — damit sie mit nichts anderem auf der Seite kollidiert. */
export const SPRITE_PREFIX = 'pmh-icon-'

/**
 * Die Kennung eines Zeichens im Sprite.
 *
 * @param name - der Name des Zeichens
 * @returns die Kennung **ohne** `#`
 */
export function iconId(name: IconName): string {
  return `${SPRITE_PREFIX}${name}`
}

/**
 * **Wirft bei einem unbekannten Namen — und sagt, welche es gibt.**
 *
 * Ein Zeichen, das es nicht gibt, still durch ein Ersatzbild zu ersetzen wäre der schlechteste Fall:
 * die Oberfläche sähe „fast richtig" aus, und niemand fände den Tippfehler. Hier steht er im Fehler.
 *
 * @param name - der geprüfte Name
 * @returns das Zeichen
 */
function hole(name: IconName): (typeof ICONS)[IconName] {
  const zeichen = ICONS[name]
  if (!zeichen) {
    throw new Error(
      `Unbekanntes Zeichen ${JSON.stringify(name)}. Bekannt sind: ${ICON_NAMES.join(', ')}.`,
    )
  }
  return zeichen
}

/**
 * Die Merkmale des umgebenden `<svg>` — Farbe, Strich, Linienart.
 *
 * Sie stehen **einmal** hier und nicht in jeder Form: `fill` und `stroke` erben im SVG an die
 * Kindelemente, also braucht jede Form nur ihre Geometrie.
 */
function svgMerkmale(): string {
  return Object.entries(STRICH)
    .map(([schluessel, wert]) => `${schluessel}="${wert}"`)
    .join(' ')
}

/**
 * **Das Zeichen als Markup** — ein vollständiges `<svg>`, ohne Größe.
 *
 * @param name - welches Zeichen
 * @param klasse - zusätzliche Klasse(n), mit Leerzeichen getrennt
 * @returns das Markup
 */
export function iconMarkup(name: IconName, klasse = ''): string {
  const zeichen = hole(name)
  const klassen = klasse === '' ? ICON_CLASS : `${ICON_CLASS} ${klasse}`
  return (
    `<svg xmlns="${SVG_NS}" viewBox="0 0 ${String(RASTER)} ${String(RASTER)}" ` +
    `class="${klassen}" aria-hidden="true" focusable="false" ${svgMerkmale()}>` +
    `${zeichen.koerper}</svg>`
  )
}

/**
 * **Das Zeichen als fertiges Element.**
 *
 * **Warum über ein `<template>` und nicht über `innerHTML` am Zielknoten.** Ein `<template>` ist ein
 * eigener, abgetrennter Baum: der Browser **parst** das Markup (also entstehen echte SVG-Knoten im
 * richtigen Namensraum), aber er **hängt** es nicht an die Seite. Wer `innerHTML` direkt auf ein
 * `<div>` schreibt, baut das Zeichen als HTML auf — ein `<path>` in einem HTML-Namensraum wird nicht
 * gezeichnet. Genau dieser Unterschied kostet sonst einen Nachmittag.
 *
 * @param dokument - das Dokument, in dem das Zeichen leben soll
 * @param name - welches Zeichen
 * @param klasse - zusätzliche Klasse(n)
 * @returns das Element
 */
export function iconElement(dokument: Document, name: IconName, klasse = ''): SVGElement {
  const vorlage = dokument.createElement('template')
  vorlage.innerHTML = iconMarkup(name, klasse)
  const erstes = vorlage.content?.firstElementChild
  if (!erstes) {
    throw new Error(`Das Zeichen ${JSON.stringify(name)} liess sich nicht bauen.`)
  }
  return erstes as unknown as SVGElement
}

/**
 * **Das ganze Sprite** — ein `<svg>` mit allen Zeichen als `<symbol>`.
 *
 * Wer viele Zeichen zeigt (die Insel zeigt ein Dutzend), hängt es **einmal** in die Seite und
 * verweist danach nur noch:
 *
 * ```html
 * <svg class="pmh-icon"><use href="#pmh-icon-chat"/></svg>
 * ```
 *
 * Der Vorteil ist nicht nur die Größe: ein `<use>` erbt die Farbe **der Stelle**, an der es steht.
 * Ein Zeichen wechselt also mit dem Zustand seines Knopfes die Farbe, ohne daß ein zweites Bild
 * nötig wäre.
 *
 * @returns das Markup des Sprites
 */
export function spriteMarkup(): string {
  const symbole = ICON_NAMES.map(
    (name) => `<symbol id="${iconId(name)}" viewBox="0 0 ${String(RASTER)} ${String(RASTER)}">${hole(name).koerper}</symbol>`,
  ).join('')
  return (
    `<svg xmlns="${SVG_NS}" style="display:none" aria-hidden="true" ${svgMerkmale()}>` +
    `<defs>${symbole}</defs></svg>`
  )
}

/**
 * **Das Zeichen als eigene Datei** — ein vollständiges SVG-Dokument.
 *
 * Das ist die Form, in der ein Zeichensatz **weitergegeben** wird: ein `<svg>` mit `xmlns`, ohne
 * Klasse und ohne Größe (also skalierbar), das jede Anwendung öffnen kann. `build.mjs` schreibt
 * daraus `svg/<name>.svg`.
 *
 * **Warum es eine Farbe annehmen kann.** In der Oberfläche erbt ein Zeichen seine Farbe
 * (`currentColor`). Eine **Datei** hat niemanden, von dem sie erben könnte: ein Favicon, das mit
 * `currentColor` allein dasteht, ist schwarz — und im Browserreiter neben einem dunklen Thema
 * unsichtbar. Wer eine Farbe angibt, bekommt sie fest eingetragen; wer keine angibt, bekommt
 * `currentColor` und damit die erbbare Form.
 *
 * @param name - welches Zeichen
 * @param farbe - eine feste Farbe (Vorgabe: `currentColor`)
 * @returns das Dokument
 */
export function iconFile(name: IconName, farbe?: string): string {
  const zeichen = hole(name)
  const merkmale = farbe === undefined ? svgMerkmale() : svgMerkmale().replace('stroke="currentColor"', `stroke="${farbe}"`)
  return (
    `<svg xmlns="${SVG_NS}" viewBox="0 0 ${String(RASTER)} ${String(RASTER)}" width="${String(RASTER)}" height="${String(RASTER)}" ${merkmale}>\n` +
    `  <title>${zeichen.was}</title>\n` +
    `  ${zeichen.koerper}\n` +
    `</svg>\n`
  )
}

/**
 * Wie viele Zeichen es gibt — für die Übersicht und die Prüfung.
 *
 * @returns die Anzahl
 */
export function anzahl(): number {
  return ICON_NAMES.length
}

/** Die Strichstärke als Zahl, für Aufrufer, die damit rechnen (Übersichtsblatt, Prüfung). */
export const STAERKE = STRICHSTAERKE

/** Kurzform für Aufrufer, die eine Zahl ins Markup schreiben: zwei Nachkommastellen. */
export const zahl = z
