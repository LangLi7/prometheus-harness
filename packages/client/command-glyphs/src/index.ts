/**
 * `@prometheus-harness/client-command-glyphs` — **Zeichen für Befehle, die der Kern nicht kennt.**
 *
 * ## Der Befund
 *
 * Im `/`-Menü stehen die vier eingebauten Befehle (Verdichten, Berechtigung, Modell, Export) mit
 * einem Zeichen da; die Befehle der Plugins — `/bild`, `/image`, `/ui`, `/usage`, `/verbrauch` —
 * stehen als reine Textzeilen darunter. Der Grund ist keine Auslassung, sondern eine feste Tabelle:
 * `@deepseek-ai/dsh-client-ui-commands` erkennt einen Befehl an seiner Herkunft (`definitionId`) und
 * holt das Zeichen aus `HOST_FACES`. Ein Befehl aus einem Plugin hat dort keinen Eintrag — und ein
 * Client-Beitrag kann ihn nicht übernehmen, weil ein Beitrag mit demselben Namen laut kollidiert.
 *
 * ## Was diese Datei tut
 *
 * Sie **zeichnet** die fehlenden Zeichen und stellt sie unter dem Namen `pmhCommandGlyphs` bereit.
 * Die Naht sitzt in `@deepseek-ai/dsh-client-ui-commands` (eine Zeile in `candidates()`, siehe
 * `patches/`): Hat eine Host-Zeile kein eingebautes Zeichen, fragt sie diesen Dienst.
 *
 * ```ts
 * ctx.get('pmhCommandGlyphs')?.for('ui') // → die Karten
 * ```
 *
 * ## Warum zwei Zeichnungen und keine drei
 *
 * `/usage` und `/verbrauch` zeigen beide den Verbrauch — und der Kern **hat** dafür ein Zeichen
 * (`IconGaugeOutlineRegular`). Seine Pfade stehen hier **wörtlich** noch einmal: eine zweite
 * Messuhr mit eigenem Strich wäre eine zweite Zeichensprache in derselben Liste. Daß die Pfade
 * nicht auseinanderlaufen, prüft `build.mjs` gegen das Bündel des Kerns — die Kopie ist also
 * belegt und nicht bloß behauptet.
 *
 * ## Die Sprache der Formen
 *
 * 16 × 16 Raster, ein Pixel Strich, `currentColor` — dieselbe Sprache wie der Satz des Kerns.
 * Deshalb bringt jede Form ihre Merkmale selbst mit und das `<svg>` nur Größe und Raster: die
 * Palette ruft ein Zeichen mit `{ size: 14 }` auf, und bei 14 Pixeln ist ein Pixel Strich genug.
 *
 * @module @prometheus-harness/client-command-glyphs
 */

import { createElement, type ComponentType, type ReactElement } from 'react'

/** Der Name, unter dem der Kern dieses Plugin führt. */
export const name = 'command-glyphs'

/**
 * Kein Dienst wird gebraucht.
 *
 * **Und deshalb steht hier auch keine Zeile.** Das Plugin *gibt* etwas (den Dienst), es *nimmt*
 * nichts — die Palette fragt erst beim Öffnen des Menüs, nicht beim Laden.
 */
export const inject: readonly string[] = []

/** Die Kantenlänge des Rasters — dieselbe wie im Satz des Kerns. */
const RASTER = 16

/** Die Strichstärke in Rastereinheiten (der Kern zeichnet seine Zeichen mit 1). */
const STRICHSTAERKE = 1

/** Was die Palette einem Zeichen übergibt: die Größe, sonst nichts. */
export interface GlyphProps {
  readonly size?: number
}

/** Eine Form im Raster: Elementname und Merkmale. */
interface Form {
  readonly element: 'path' | 'rect' | 'circle'
  readonly merkmale: Readonly<Record<string, string | number>>
}

/**
 * Baut aus Formen ein Zeichen.
 *
 * **Warum eine Fabrik und keine fünf handgeschriebene Komponenten.** Fünf Komponenten wären fünf
 * Stellen, an denen Raster, Strich und `currentColor` stehen — und vier davon würden irgendwann
 * abweichen. Hier steht das einmal, und jedes Zeichen ist nur noch seine Geometrie.
 *
 * @param was - was das Zeichen zeigt (nur für die Anzeige im Entwicklerwerkzeug)
 * @param formen - die Formen, in Zeichenreihenfolge
 * @returns die Komponente, die die Palette aufruft
 */
function zeichne(was: string, formen: readonly Form[]): ComponentType<GlyphProps> {
  function Zeichen({ size = RASTER }: GlyphProps): ReactElement {
    return createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: `0 0 ${String(RASTER)} ${String(RASTER)}`,
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        strokeWidth: STRICHSTAERKE,
      },
      formen.map((form, index) => createElement(form.element, { key: index, ...form.merkmale })),
    )
  }
  Zeichen.displayName = `Glyph(${was})`
  return Zeichen
}

/**
 * **Das Bild** — Rahmen, Sonne, zwei Grate.
 *
 * Der Rahmen ist das, was ein Bild von einer Datei unterscheidet; ohne ihn läse man die Grate als
 * Berglandschaft. Die Sonne sitzt **oben links** und nicht in der Mitte: in der Mitte verdeckt sie
 * den ersten Grat, und bei 14 Pixeln bleibt von beiden nur ein Fleck.
 */
const PICTURE_FORMS: readonly Form[] = [
  { element: 'rect', merkmale: { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, stroke: 'currentColor' } },
  { element: 'circle', merkmale: { cx: 5.9, cy: 5.9, r: 1.15, stroke: 'currentColor' } },
  {
    element: 'path',
    merkmale: {
      d: 'M3.5 11.6 6.2 8.4 8.7 11.6 10.9 9.2 12.9 11.6',
      stroke: 'currentColor',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  },
]

/**
 * **Die Karten** — vier Flächen, eine davon gefüllt.
 *
 * Die gefüllte Ecke ist der Unterschied zwischen „Karten" und „Raster": ein Menü aus vier gleichen
 * Kacheln liest man als Ansichtsraster, eine hervorgehobene als das, was der Befehl schaltet —
 * sichtbare Karten im Chat.
 */
const CARD_FORMS: readonly Form[] = [
  { element: 'rect', merkmale: { x: 2.5, y: 2.5, width: 5, height: 5, rx: 1.2, fill: 'currentColor', stroke: 'none' } },
  { element: 'rect', merkmale: { x: 8.5, y: 2.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor' } },
  { element: 'rect', merkmale: { x: 2.5, y: 8.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor' } },
  { element: 'rect', merkmale: { x: 8.5, y: 8.5, width: 5, height: 5, rx: 1.2, stroke: 'currentColor' } },
]

/**
 * **Die Messuhr** — die Pfade des Kerns, wörtlich.
 *
 * Quelle: `@deepseek-ai/dsh-client-ui-primitives`, `IconGaugeOutlineArtwork` (Raster 16, Strich 1).
 * Der Bogen ist offen nach unten, die Nadel steht nach rechts oben, der Fußpunkt ist gefüllt —
 * genau die drei Formen, die den Verbrauch von einer Uhr unterscheiden.
 */
const GAUGE_FORMS: readonly Form[] = [
  {
    element: 'path',
    merkmale: {
      d: 'M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096',
      stroke: 'currentColor',
    },
  },
  { element: 'path', merkmale: { d: 'M8 8.49994L11.6114 4.88855', stroke: 'currentColor' } },
  {
    element: 'path',
    merkmale: {
      d: 'M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z',
      fill: 'currentColor',
    },
  },
]

/** Das Bild — für `/bild` und `/image` (derselbe Befehl in zwei Sprachen). */
export const PICTURE = zeichne('Bild', PICTURE_FORMS)

/** Die Karten — für `/ui`. */
export const CARDS = zeichne('Karten', CARD_FORMS)

/** Die Messuhr — für `/usage` und `/verbrauch`. */
export const GAUGE = zeichne('Messuhr', GAUGE_FORMS)

/**
 * **Die Zuordnung Befehl → Zeichen.**
 *
 * Der Schlüssel ist der **Name des Befehls ohne Schrägstrich**, so wie ihn der Katalog führt. Die
 * Liste ist bewusst kurz: sie nennt die Befehle dieses Hauses, nicht „alles, was ein Zeichen
 * bekommen könnte". Ein unbekannter Name ergibt `undefined` — dann bleibt die Zeile, wie sie ist.
 */
export const GLYPHS: ReadonlyMap<string, ComponentType<GlyphProps>> = new Map([
  ['bild', PICTURE],
  ['image', PICTURE],
  ['ui', CARDS],
  ['usage', GAUGE],
  ['verbrauch', GAUGE],
])

/** Der Dienst, den die Naht in der Palette fragt. */
export const SERVICE = 'pmhCommandGlyphs'

/** Was der Dienst kann — mehr braucht die Palette nicht. */
export interface CommandGlyphs {
  /**
   * Das Zeichen zu einem Befehlsnamen.
   *
   * @param befehl - der Name ohne Schrägstrich
   * @returns die Komponente, oder `undefined`, wenn dieser Befehl keins hat
   */
  for(befehl: string): ComponentType<GlyphProps> | undefined
}

/** Der kleinste Ausschnitt des Kontexts, den dieses Plugin braucht. */
interface PluginContext {
  provide(name: string, value: unknown): void
}

/**
 * Hängt den Dienst in den Kontext.
 *
 * @param ctx - der Kontext des Plugins
 */
export function apply(ctx: PluginContext): void {
  const dienst: CommandGlyphs = {
    for: (befehl) => GLYPHS.get(befehl),
  }
  ctx.provide(SERVICE, dienst)
}
