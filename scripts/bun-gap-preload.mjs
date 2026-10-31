/**
 * `scripts/bun-gap-preload.mjs` — der Einstieg für `bun --preload`.
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
 * @module scripts/bun-gap-preload
 */

import { plugin } from 'bun'
import { readFileSync } from 'node:fs'

import { ergaenzungNoetig as ptcNoetig, richteEin as ptcEin } from './ptc-type-stripping.mjs'
import {
  ergaenzungNoetig as argvNoetig,
  richteEin as argvEin,
} from './subprocess-argv-patch.mjs'
import {
  ergaenzungNoetig as metadatenNoetig,
  richteEin as metadatenEin,
} from './plugin-metadata-resolver.mjs'
import {
  ergaenzungNoetig as undiciNoetig,
  richteEin as undiciEin,
} from './undici-echte-aufloesung.mjs'
import {
  ergaenzungNoetig as beobachtungNoetig,
  richteEin as beobachtungEin,
} from './fs-beobachtung-lebensdauer.mjs'

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
if (metadatenNoetig()) {
  // **Diagnose-Schalter, gemessen am 14.10.2026.** Beim Einbau dieser Ergänzung startete der
  // Host nicht mehr (167 × „failed to import"). Um zu entscheiden, ob **diese** Ergänzung die
  // Ursache ist, muß sie sich abschalten lassen: `PMH_OHNE_METADATEN_FIX=1`. Der Schalter ist
  // **kein** stiller Ausweg — er steht im Startbericht, wenn er greift.
  if (process.env.PMH_OHNE_METADATEN_FIX === '1') {
    process.stderr.write('[pmh] ACHTUNG: Paket-Metadaten-Ergänzung ist ABGESCHALTET (PMH_OHNE_METADATEN_FIX=1)\n')
  } else {
    metadatenEin(plugin, lies)
    ANGEWANDT.push('Paket-Metadaten (Bun hat keinen Node-Modulauflöser)')
  }
}
if (undiciNoetig()) {
  undiciEin(plugin, lies)
  ANGEWANDT.push('undici-Auflösung (Bun liefert für "undici" eine Attrappe aus)')
}
if (beobachtungNoetig()) {
  // **Diagnose-Schalter, gemessen am 18.10.2026.** Diese Ergänzung ändert die Schlüsselung einer
  // Sicherheits-Policy (Objekt -> Sitzungs-id). Sie muß sich abschalten lassen, ohne den Baum
  // anzufassen: `PMH_OHNE_BEOBACHTUNGS_FIX=1`. Wie beim Metadaten-Schalter steht sie im
  // Startbericht, wenn sie greift — **kein** stiller Ausweg.
  if (process.env.PMH_OHNE_BEOBACHTUNGS_FIX === '1') {
    process.stderr.write('[pmh] ACHTUNG: Beobachtungs-Ergänzung ist ABGESCHALTET (PMH_OHNE_BEOBACHTUNGS_FIX=1)\n')
  } else {
    beobachtungEin(plugin, lies)
    ANGEWANDT.push('Beobachtungs-Lebensdauer (die Sitzung wird pro Turn wiederhergestellt)')
  }
}

// **`stderr` und nicht `stdout` — gemessen am 13.10.2026.**
//
// Hier stand `process.stdout.write`. Diese Datei läuft als **Vorladung bei jedem
// `bun`-Prozeß** dieses Projekts, also schrieb **jeder** Kindprozeß zwei Zeilen
// auf seine **Standardausgabe**. Wer die Ausgabe eines Kindes als **Daten** liest,
// bekommt sie verfälscht:
//
// ```
// $ bun kind.mjs   # gibt JSON aus
// [pmh] Bun-Lücke ergänzt: PTC-Typentfernung (module.stripTypeScriptTypes fehlt)
// [pmh] Bun-Lücke ergänzt: Subprozess-argv (Bun verschluckt den -- Trenner)
// {"ergebnis":…}          <- wer hier JSON liest, scheitert
// ```
//
// Gefunden hat es die eigene Meßsonde
// (`docs/status/messsonden/ripgrep-haeufigkeit.mjs`): ihr `JSON.parse` brach ab mit
// *„Unexpected identifier \"pmh\""*. Das war kein Fehler der Sonde, sondern einer
// der Vorladung.
//
// **Was der Fund NICHT ist.** Er erklärt den sprunghaften `glob`-Ausfall **nicht**:
// der Subprozess-Runner berichtet über einen **IPC-Kanal** (`"ipc"` in
// `runner-launch-*.js`), nicht über stdout. Die Vermutung stand im Raum und ist
// damit widerlegt — sie steht hier, damit sie nicht wieder aufkommt.
//
// **Warum nicht ganz schweigen.** Der Betreiber soll beim Start sehen, daß eine
// Lücke ergänzt wurde; eine stille Reparatur wäre schlimmer als eine laute.
// `stderr` ist der Ort für Diagnose, `stdout` der für Daten.
for (const was of ANGEWANDT) {
  process.stderr.write(`[pmh] Bun-Lücke ergänzt: ${was}\n`)
}
