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
 * ## Zwei Teile, weil zwei Mechanismen im Spiel sind — gemessen und benannt
 *
 * **1. Der Kasten selbst braucht einen undurchsichtigen Grund.** Der Betreiber hat zweimal
 * dasselbe gemeldet (`Model download source`, dann `Recognition language`), obwohl die
 * Eintragsregel schon ausgeliefert war. Der Grund: Chromium leitet das Farbpaar des
 * **aufgeklappten** Fensters vom **`select`-Element** ab. Steht dort `background: 0 0`
 * (so stylt das Sprachpaket, und so stylt auch `dsh-client-ui-cordis`), dann malt der Browser
 * seinen **hellen** Vorgabegrund und nimmt die **geerbte** Schriftfarbe der dunklen Seite.
 * Eine Regel für `option` allein erreicht diesen Weg nicht.
 *
 * **2. Die Einträge bekommen ihr eigenes Paar** — für Browser, die `option` gestalten. Beides
 * zusammen deckt die beiden Wege ab; welchen ein Browser geht, ist nicht vorhersagbar.
 *
 * ## Warum die Regel auf die Spracheingabe **begrenzt** ist
 *
 * `[class*="sourceChoice"]` trifft die gehashten Klassennamen des CSS-Moduls
 * (gemessen: `ddpbLW_preferences select, ddpbLW_sourceChoice select`). Ein **globales**
 * `select { … }` würde **jeden** Auswahlkasten der Oberfläche umfärben — auch die in
 * Werkzeugleisten, wo `transparent` Absicht ist. Auf diesem Rechner ist **kein Browser**
 * installiert; eine so breite Änderung könnte ich nicht nachsehen. Deshalb: eng am gemeldeten
 * Fehler, und der Kern-Fall (`ui-cordis`) steht als **offener Punkt** im Bericht.
 *
 * ## Warum `!important`
 *
 * Die Regel des Pakets ist `.ddpbLW_sourceChoice select` — **gleiche** Spezifität wie
 * `[class*="sourceChoice"] select`. Welche zuletzt kommt, hinge an der Ladereihenfolge der
 * Plugins. `!important` macht das Ergebnis von der Reihenfolge unabhängig — und nur darauf
 * kommt es hier an. Es steht **nur** auf `background-color`, nicht auf der Schriftfarbe.
 */
export const REGEL = `
[class*="sourceChoice"] select,
[class*="preferences"] select,
[class*="deviceField"] select {
  background-color: var(--dsw-alias-bg-l1, Canvas) !important;
}

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
