/**
 * `@prometheus-harness/client-select-contrast` — Kontrast nativer Auswahlfenster.
 *
 * ## Der Befund (Bild des Betreibers, 14.10.2026)
 *
 * Im Einstellungsdialog der Spracheingabe ist das Auswahlfeld **Model download source**
 * geöffnet. Die Seite ist dunkel, das Auswahlfenster wird aber **hell** gezeichnet — und die
 * nicht hervorgehobenen Einträge erben die weiße Textfarbe: *„HF-Mirror (China mirror)"* ist
 * weiß auf weiß und praktisch unlesbar.
 *
 * ## Die Ursache steht in der CSS des Sprachpakets — gemessen
 *
 * ```css
 * .preferences select, .sourceChoice select {
 *   background: transparent;   /* ← kein eigener Grund *\/
 *   color: inherit;            /* ← die Farbe der dunklen Seite *\/
 * }
 * ```
 *
 * Ein `<select>` ist ein **natives** Bedienelement: das aufgeklappte Fenster zeichnet der
 * Browser **selbst**, außerhalb des Kastenbaums der Seite. Bleibt `background` leer, malt der
 * Browser seinen Vorgabegrund (hell) und nimmt die **geerbte** Schriftfarbe (weiß) — genau die
 * Mischung aus dem Bild. Für den geschlossenen Kasten ist `transparent` richtig; für die
 * Einträge im aufgeklappten Fenster ist es ein Fehler.
 *
 * ## Wie dieses Plugin es repariert — und warum an dieser Stelle
 *
 * Es setzt **beide** Werte für die Einträge, und zwar aus den **Variablen des Themes**
 * (`--dsw-alias-bg-layer-2`, `--dsw-alias-label-primary`). Damit stimmt der Kontrast in
 * **jedem** Theme, ohne daß hier eine Farbe festgeschrieben wird:
 *
 * * dunkles Theme → dunkler Grund, helle Schrift,
 * * helles Theme → heller Grund, dunkle Schrift.
 *
 * Die Rückfallwerte `Canvas` und `CanvasText` sind die **Systemfarben** der CSS-Farbskala: sie
 * richten sich nach `color-scheme` und sind damit ebenfalls theme-treu, falls ein Theme eine
 * der beiden Variablen nicht führt.
 *
 * ## Warum ein eigenes Paket und nicht ein Zusatz im Sprachpaket
 *
 * Es ist eine **andere Aufgabe**. Das Sprachpaket liefert Texte; dies ist Darstellung. Ein
 * Zusatz dort wäre bequem und würde beim nächsten Mal gesucht werden.
 *
 * ## Was hier **nicht** gemessen ist
 *
 * Auf diesem Rechner ist **kein Browser** installiert (`chrome-devtools`: *„Could not find
 * Google Chrome executable"*; auch Edge und Firefox fehlen). Gemessen ist: das Plugin steht in
 * der Startliste, sein Bündel wird ausgeliefert und enthält die Regel. Daß die Einträge
 * **sichtbar** sind, kann nur am Bildschirm beurteilt werden.
 *
 * @module @prometheus-harness/client-select-contrast
 */

import type { Context } from '@deepseek-ai/cordis'

/** Kennung des Pakets. */
export const name = 'select-contrast'

/**
 * Keine Dienste nötig: dieses Plugin hängt nur eine Stilregel ein.
 *
 * **Warum der Eintrag trotzdem da ist.** Der Client-Kern liest `inject` aus dem Bündel
 * (`exports.inject`); fehlt es ganz, gilt das Plugin als unvollständig. Eine leere Liste sagt
 * ausdrücklich: *ich brauche nichts.*
 */
export const inject: readonly string[] = []

/**
 * Die Stilregel.
 *
 * **Warum `option` und `optgroup`.** Beide werden im aufgeklappten Fenster gezeichnet.
 *
 * **Warum nicht `select` selbst.** Der geschlossene Kasten soll durchsichtig bleiben — so
 * steht er in der Oberfläche des Kerns, und so sieht er richtig aus.
 */
export const REGEL = `
select option,
select optgroup {
  background-color: var(--dsw-alias-bg-layer-2, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
}
`.trim()

/** Die Kennung des eingehängten Stilelements — damit es wiederholbar ist. */
export const STIL_ID = 'pmh-select-contrast'

/**
 * Hängt die Regel ein und nimmt sie beim Abbau wieder heraus.
 *
 * @param ctx - Client-Kontext des Kerns
 */
export function apply(ctx: Context): void {
  const dokument = globalThis.document
  if (dokument === undefined) return
  ctx.effect(() => {
    const vorhanden = dokument.getElementById(STIL_ID)
    if (vorhanden !== null) vorhanden.remove()
    const stil = dokument.createElement('style')
    stil.id = STIL_ID
    stil.textContent = REGEL
    dokument.head.append(stil)
    return () => {
      stil.remove()
    }
  }, 'select-contrast: Kontrast nativer Auswahlfenster')
}
