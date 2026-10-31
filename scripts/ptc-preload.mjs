/**
 * `scripts/ptc-preload.mjs` — der Einstieg für `bun --preload`.
 *
 * **Warum eine eigene Datei und nicht der Modul selbst.** Wäre
 * `scripts/ptc-type-stripping.mjs` selbst der Vorlade-Einstieg, würde ein **Import**
 * aus einer Prüfdatei das Plugin registrieren — und die Prüfung veränderte damit
 * den laufenden Prozeß. Die Logik bleibt dort (prüfbar, ohne Host), die
 * Einhängung steht hier (eine Zeile).
 *
 * **Wann es geladen wird.** `scripts/start.mjs` hängt es dem Host nur an, wenn
 * {@link ergaenzungNoetig} es verlangt — auf **Node** also **nicht**. Ein
 * unbedingtes Vorladen würde dort eine fremde Datei ohne Grund verändern.
 *
 * @module scripts/ptc-preload
 */

import { plugin } from 'bun'
import { readFileSync } from 'node:fs'

import { ergaenzungNoetig, richteEin } from './ptc-type-stripping.mjs'

if (ergaenzungNoetig()) {
  richteEin(plugin, (pfad) => readFileSync(pfad, 'utf8'))
}
