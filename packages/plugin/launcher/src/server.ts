/**
 * Der Starter — **ein Eintrag, der die Panels der anderen öffnet**.
 *
 * ## Warum es dieses Paket gibt
 *
 * Mit fünf eigenen Panels wächst die Seitenleiste zu einer Liste, in der jedes Plugin eine Zeile
 * belegt. Der Betreiber: *„sollte es nicht eher plugin installiert sein das man sozusagen per
 * dropdown öffnen kann wie beim Terminal"* (21.10.2026). Die Leiste kann das nicht selbst: ihre
 * Anmeldung ist eine **Liste von Symbolen**, und zu jedem Symbol gehört genau eine Hauptfläche —
 * ein Aufklapper, der mehrere adressiert, ist dort nicht vorgesehen.
 *
 * Dieses Paket löst es ohne Eingriff in den Kern: es belegt **eine** Zeile und **eine** Fläche,
 * und diese Fläche ist die Liste. Ein Klick öffnet das gewählte Panel über den Layout-Dienst.
 *
 * ## Was hier bewusst NICHT steht
 *
 * Kein Wissen über die Panels. Die Kennungen stehen in `Config.entries` und damit in den
 * Plugin-Einstellungen — wer ein Panel hinzufügt, trägt es dort ein, statt dieses Paket zu ändern.
 * Die Beschriftung kommt aus dem Namensraum des jeweiligen Plugins (`panel`), nicht aus einer
 * zweiten Liste hier: eine zweite Liste wäre irgendwann falsch.
 *
 * @module @prometheus-harness/launcher/server
 */

import z from '@deepseek-ai/schemastery'

/** Der stabile Name des Host-Eintrags. */
export const name = 'pmh-launcher'

/**
 * Die Panels, die ohne weitere Einstellung in der Liste stehen.
 *
 * **Warum diese fünf.** Es sind die Panels, die vorher je eine eigene Zeile belegten. Verbrauch
 * fehlt absichtlich: es zeigt einen Stand, den man auf einen Blick sehen will, und behält seine
 * Zeile.
 */
const STANDARD = ['obsidian', 'konten', 'graphify', 'crew', 'zugaenge']

/**
 * Die Einstellungen des Starters.
 *
 * `entries` ist eine Liste von **Panel-Kennungen** — dieselbe Kennung, unter der ein Plugin seine
 * Hauptfläche anmeldet. Eine unbekannte Kennung ist kein Fehler: die Fläche zeigt dann den Namen
 * der Kennung, und ein Klick tut nichts. Lieber sichtbar nichts als still nichts.
 *
 * **Was hier bewusst nicht steht:** keine eigene Reihenfolge für den Leisten-Eintrag. Er ist der
 * einzige Eintrag seiner Art; eine Einstellung, die nur eine Zahl verschiebt, wäre eine
 * Einstellung ohne Frage.
 */
export const Config = z.object({
  entries: z.array(z.string().min(1)).default([...STANDARD]).description('Panel-Kennungen, die in der Liste stehen'),
})

/** Der Host hält die Einstellungen; er liest sie nicht. */
export function apply(): void {}
