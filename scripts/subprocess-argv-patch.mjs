/**
 * `scripts/subprocess-argv-patch.mjs` — der `--`-Trenner, den Bun verschluckt.
 *
 * ## Der Befund, gemessen mit beiden Laufzeiten
 *
 * ```
 * bun  script.mjs -- cmd arg   ->  ["bun.exe",  "script.mjs",        "cmd", "arg"]
 * node script.mjs -- cmd arg   ->  ["node.exe", "script.mjs", "--",  "cmd", "arg"]
 * ```
 *
 * **Bun entfernt den `--`-Trenner, Node reicht ihn an das Skript durch.** Der
 * Subprozess-Runner des Cores verlangt ihn aber **wörtlich**:
 *
 * ```js
 * // node_modules/@deepseek-ai/dsh-subprocess-local/lib/runner-launch-*.js
 * function parseRunnerTargetArgv(argv) {
 *   if (argv[0] !== "--" || argv.length < 2) throw new Error(
 *     "subprocess runner requires target argv after a private -- delimiter");
 *   return [...argv.slice(1)];
 * }
 * ```
 *
 * Unter Bun ist `argv[0]` der **Zielbefehl**, nicht `--` — die Prüfung schlägt
 * immer fehl.
 *
 * ## Was das kostet — und warum es so lange unentdeckt blieb
 *
 * Der Runner ist der **gemeinsame** Weg für **Shell und Suche**. Fällt er, fallen
 * beide zugleich. Die Meldung erscheint als **Werkzeugfehler**, nicht als
 * Startfehler: der Host startet sauber, liefert HTTP 200, und erst wenn ein Agent
 * ein Werkzeug benutzt, kommt
 * `subprocess runner requires target argv after a private -- delimiter`. Genau der
 * Fehler, der in einem Selbsttest-Bericht eines Agenten stand — und den ich
 * zunächst für eine Eigenheit jener Installation gehalten habe. Er ist es nicht:
 * er trifft **jeden** Bun-Host.
 *
 * ## Warum die Ergänzung den Trenner TOLERIERT statt ihn zu erzwingen
 *
 * Die Prüfung wird nicht abgeschaltet, sondern **erweitert**: mit `--` verhält sie
 * sich wie bisher (Node bleibt unberührt), ohne `--` nimmt sie die Argumente
 * direkt. **Eine Abschaltung wäre falsch** — dann liefe ein Aufruf ohne
 * Zielbefehl durch und der Runner startete mit leeren Argumenten, statt laut zu
 * scheitern.
 *
 * ## Die Grenze, die dabeisteht
 *
 * Das ist eine **Ergänzung an fremdem Code**, kein Ersatz. Sie hängt an einer
 * **Datei mit Prüfsumme im Namen** (`runner-launch-B2zsQ1Dz.js`) — der Anker ist
 * deshalb der **Pfad mit Muster**, nicht der Dateiname. Findet die Ergänzung ihre
 * Zeile nicht, **wirft sie** und der Host startet nicht: lieber laut scheitern als
 * eine Ergänzung, die ins Leere greift und den Fehler bestehen läßt.
 *
 * @module scripts/subprocess-argv-patch
 */

/** Die Datei, deren Prüfung erweitert wird — **Muster**, weil der Name einen Hash trägt. */
export const ZIELDATEI = /dsh-subprocess-local[\\/]lib[\\/]runner-launch-[^\\/]+\.js$/u

/** Die Zeile, die ersetzt wird — wörtlich, damit ein Umbau auffällt. */
export const PRUEFZEILE =
  '\tif (argv[0] !== "--" || argv.length < 2) throw new Error("subprocess runner requires target argv after a private -- delimiter");'

/** Was an ihre Stelle tritt. */
export const ERSATZ =
  '\tconst __pmhRest = argv[0] === "--" ? argv.slice(1) : argv;\n' +
  '\tif (__pmhRest.length < 1) throw new Error("subprocess runner requires target argv after a private -- delimiter");'

/**
 * Erweitert die Prüfung um die Form ohne Trenner.
 *
 * **Reine Funktion, damit sie ohne Host prüfbar ist.**
 *
 * @param alt - der Inhalt der Runner-Datei
 * @returns der Inhalt mit erweiterter Prüfung
 * @throws {Error} wenn die Prüfzeile fehlt — der Core hat sie umgebaut
 */
export function erweiterePrufung(alt) {
  if (!alt.includes(PRUEFZEILE)) {
    throw new Error(
      'subprocess-argv-patch: die Prüfzeile steht nicht mehr in der Runner-Datei. ' +
        'Der Core hat sie umgebaut — der Anker muß nachgezogen werden, sonst bliebe Shell ' +
        'und Suche unter Bun stumm.',
    )
  }
  return alt.replace(PRUEFZEILE, ERSATZ).replace('\treturn [...argv.slice(1)];', '\treturn [...__pmhRest];')
}

/**
 * Registriert das Plugin.
 *
 * @param pluginFn - `plugin` aus `bun`
 * @param lies - Funktion zum Lesen einer Datei
 * @returns ob registriert wurde
 */
export function richteEin(pluginFn, lies) {
  pluginFn({
    name: 'pmh-subprozess-argv',
    setup(build) {
      build.onLoad({ filter: ZIELDATEI }, (args) => ({
        contents: erweiterePrufung(lies(args.path)),
        loader: 'js',
      }))
    },
  })
  return true
}

/**
 * Ist die Ergänzung nötig? **Ja, unter Bun — nein, unter Node.**
 *
 * Die Prüfung fragt die **Fähigkeit** ab, nicht die Plattform: reicht die Laufzeit
 * `--` durch, ist nichts zu ergänzen. Gemessen wird an einem echten Aufruf wäre
 * teuer; die Unterscheidung ist die Laufzeitkennung, die genau dieses Verhalten
 * beschreibt.
 *
 * @returns ob ergänzt werden muß
 */
export function ergaenzungNoetig() {
  return typeof process.versions?.bun === 'string'
}
