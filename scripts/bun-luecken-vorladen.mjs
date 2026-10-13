/**
 * `scripts/bun-luecken-vorladen.mjs` — der Einstieg für `bun --preload`.
 *
 * **Warum diese Datei existiert.** Der Core hat Teilsysteme, die **Node
 * voraussetzen**. Unter Bun brechen sie — und zwar **stumm**, als Werkzeug- oder
 * Prüfsummenfehler, nicht als Startfehler. Der Host startet sauber, liefert
 * HTTP 200, und erst bei der Benutzung fällt es auf. Zwei solche Lücken sind
 * gemessen:
 *
 * | Lücke | Wirkung ohne Ergänzung | Gemessen |
 * |---|---|---|
 * | `module.stripTypeScriptTypes` fehlt | PTC lädt nicht -> `ptcRuntime` fehlt -> Voreinstellung `standard` ungültig -> **keine Sitzung** | Bun `undefined`, Node `function` |
 * | Bun verschluckt den `--`-Trenner | Subprozess-Runner scheitert -> **Shell und Suche zugleich tot** | Bun `["…","script","cmd"]`, Node `["…","script","--","cmd"]` |
 *
 * **Warum eine Vorladung und kein Patch im `node_modules`.** Bun-Plugins fangen
 * **Dateipfade** ab. Beide Ergänzungen ersetzen daher je **eine Zeile** in **einer**
 * fremden Datei. Es braucht **keinen** Eintrag in `patches/` und **kein**
 * `patchedDependencies` — nichts im Abhängigkeitsbaum wird verändert, und jede
 * `bun install`-Runde läßt die Ergänzung unberührt.
 *
 * **Widerlegt und deshalb nicht benutzt:** ein Plugin, das `node:module` abfängt.
 * Bun löst `node:`-Builtins **vor** den Plugins auf.
 *
 * **Warum die Einhängung hier steht und nicht in den Modulen.** Wäre eines der
 * Module selbst der Vorlade-Einstieg, würde ein **Import** aus einer Prüfdatei das
 * Plugin registrieren und damit den laufenden Prozeß verändern. Die Logik bleibt
 * dort (prüfbar ohne Host), die Einhängung steht hier.
 *
 * @module scripts/bun-luecken-vorladen
 */

import { plugin } from 'bun'
import { readFileSync } from 'node:fs'

import { ergaenzungNoetig as ptcNoetig, richteEin as ptcEin } from './ptc-typentfernung.mjs'
import {
  ergaenzungNoetig as argvNoetig,
  richteEin as argvEin,
} from './subprozess-argv-ergaenzung.mjs'

const lies = (pfad) => readFileSync(pfad, 'utf8')

/** Die angewandten Ergänzungen — für die Ausgabe des Starters. */
export const ANGEWANDT = []

if (ptcNoetig()) {
  ptcEin(plugin, lies)
  ANGEWANDT.push('PTC-Typentfernung (module.stripTypeScriptTypes fehlt)')
}
if (argvNoetig()) {
  argvEin(plugin, lies)
  ANGEWANDT.push('Subprozess-argv (Bun verschluckt den -- Trenner)')
}

for (const was of ANGEWANDT) {
  process.stdout.write(`[pmh] Bun-Lücke ergänzt: ${was}\n`)
}
