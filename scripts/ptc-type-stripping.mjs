/**
 * `scripts/ptc-typentfernung.mjs` — ergänzt `stripTypeScriptTypes` für Bun.
 *
 * ## Warum es diese Datei gibt — der Befund, der sie erzwungen hat
 *
 * Der Host startete, lieferte **HTTP 200** an allen Endpunkten — und **ließ keine
 * neue Sitzung anlegen**:
 *
 * ```
 * New session failed: agent-preset/invalid:
 *   workflow-ptc (@deepseek-ai/dsh-workflow-ptc): waiting for ptcRuntime
 *   tool-workflow (@deepseek-ai/dsh-tool-workflow): waiting for workflowEngine
 * ```
 *
 * **Die Ursache, gemessen:**
 *
 * | Laufzeit | `module.stripTypeScriptTypes` |
 * |---|---|
 * | Node v24.19.0 | vorhanden |
 * | **Bun 1.4.0** | **fehlt** (`undefined`) |
 *
 * `@deepseek-ai/dsh-ptc-runtime-node` **importiert** die Funktion in Zeile 1 seines
 * `lib/index.js` und benutzt sie in Zeile 955. Unter Bun scheitert schon der
 * **Import** (`Export named 'stripTypeScriptTypes' not found in module
 * 'node:module'`), also registriert sich `ptcRuntime` nie, `workflow-ptc` wartet,
 * und die Voreinstellung `standard` gilt als ungültig. **Das PTC-Zwischenstück ist
 * ein reines Node-Paket.**
 *
 * ## Warum ein Vorlade-Skript und KEIN Patch im `node_modules`
 *
 * **Der erste Weg wurde gemessen und ist widerlegt.** Ein Bun-Plugin, das
 * `node:module` abfängt, funktioniert **nicht**: Bun löst `node:`-Builtins **vor**
 * den Plugins auf, und der Versuch scheiterte wörtlich mit
 * `Export named 'stripTypeScriptTypes' not found`.
 *
 * **Der zweite Weg trägt.** Bun-Plugins fangen **Dateipfade** sehr wohl ab. Dieses
 * Skript registriert ein `onLoad` auf **genau eine Datei** und ersetzt darin
 * **genau eine Zeile**. Damit braucht es **keinen** Eintrag in `patches/` und
 * **kein** `patchedDependencies` — das war die Sorge, daß ein halb angewandter
 * Patch `bun install` bricht. Es überlebt jedes `bun install`, weil nichts im
 * Abhängigkeitsbaum verändert wird.
 *
 * ## Die Falle, die fast zu falsch ausgeführtem Code geführt hätte
 *
 * Der Core **rechnet mit der Form** der Node-Ausgabe:
 *
 * ```js
 * const stripped = stripTypeScriptTypes(STRIP_PREFIX + spec.program + STRIP_SUFFIX);
 * const data = { code: stripped.slice(35, stripped.length - 2), … };
 * ```
 *
 * `STRIP_PREFIX` ist `"async function __dsh_program__() {\n"` — **genau 35
 * Zeichen**; `STRIP_SUFFIX` ist `"\n}"`. Die festen Zahlen funktionieren nur, weil
 * Nodes Entferner **positionserhaltend** arbeitet: gemessen **255 Zeichen rein,
 * 255 Zeichen raus**, die Typangaben werden durch **Leerzeichen** ersetzt.
 *
 * **Buns Übersetzer tut das nicht.** Gemessen an derselben Eingabe:
 *
 * | | Node | Bun |
 * |---|---|---|
 * | Präfix (erste 35 Zeichen) erhalten | **ja** | **ja** |
 * | Ende | `"\n}"` | **`"}\n"`** |
 * | Länge | unverändert | **verändert** |
 *
 * **Ohne die Normalisierung hätte `slice(35, len-2)` die schließende Klammer
 * abgeschnitten** — und der Unterprozess hätte stillschweigend **kaputten Code**
 * ausgeführt. Genau die Sorte Fehler, die niemand bemerkt. Deshalb wird das Ende
 * hier ausdrücklich auf `"\n}"` gebracht, und der Rundlauf ist als Prüfung
 * hinterlegt (`scripts/tests/ptc-typentfernung.test.mjs`) — **mit Ausführung**,
 * nicht nur mit Formvergleich.
 *
 * ## Die bewußte Abweichung, die dabeisteht
 *
 * Bun **übersetzt** Syntax, die sich nicht rein löschen läßt (`enum`, `namespace`,
 * Parameter-Eigenschaften), während Node sie im `strip`-Modus **abweist**. Dasselbe
 * PTC-Programm verhält sich also je Laufzeit **unterschiedlich**: unter Bun läuft
 * mehr durch. Das ist bewußt — ein Ersatz, der wie Node *abwiese*, wäre strenger
 * als nötig und würde PTC unter Bun wieder abschalten. Es steht hier, damit es
 * niemand für ein Versehen hält.
 *
 * @module scripts/ptc-typentfernung
 */

/** Das Präfix, mit dem der Core das PTC-Programm umhüllt. **Genau 35 Zeichen.** */
export const PRAEFIX = 'async function __dsh_program__() {\n'

/** Die Datei, deren Import ersetzt wird. */
export const ZIELDATEI = /dsh-ptc-runtime-node[\\/]lib[\\/]index\.js$/u

/** Die Zeile, die ersetzt wird — wörtlich, damit ein Umbau auffällt statt zu wirken. */
export const IMPORTZEILE = 'import { stripTypeScriptTypes } from "node:module";'

/**
 * Entfernt die Typangaben so, daß die festen Scheiben des Cores stimmen.
 *
 * **Reine Funktion, damit sie ohne Host prüfbar ist.** Sie kennt keinen Prozeß und
 * kein Plugin: aus Text wird Text.
 *
 * @param code - das umhüllte Programm (`PRAEFIX + Programm + "\n}"`)
 * @returns derselbe Text ohne Typangaben, mit erhaltenem Präfix und Ende `"\n}"`
 * @throws {TypeError} wenn die Form nicht herstellbar ist — **lieber laut scheitern
 *         als stillschweigend falschen Code ausliefern**
 */
export function entferneTypen(code) {
  const roh = new Bun.Transpiler({ loader: 'ts' }).transformSync(code)
  if (!roh.startsWith(PRAEFIX)) {
    throw new TypeError(
      'entferneTypen: das Präfix wurde nicht erhalten — der Core schneidet mit festen ' +
        'Zahlen, ein verschobenes Präfix ergäbe falschen Code',
    )
  }
  const rest = roh.slice(PRAEFIX.length).replace(/\s+$/u, '')
  if (!rest.endsWith('}')) {
    throw new TypeError('entferneTypen: kein abschließendes "}" gefunden')
  }
  // **Die Normalisierung, um derentwillen es diese Funktion gibt.** Ohne sie endet
  // die Ausgabe auf `"}\n"` und `slice(35, len-2)` schneidet die Klammer ab.
  return PRAEFIX + rest.replace(/\}$/u, '\n}')
}

/**
 * Ersetzt die Importzeile in der Quelldatei.
 *
 * **Warum die Zeile wörtlich gesucht wird.** Findet sie sich nicht, hat der Core
 * die Datei umgebaut — dann ist ein stilles Weiterlaufen falsch. Der Fehler sagt
 * genau das.
 *
 * @param alt - der bisherige Inhalt
 * @returns der Inhalt mit ersetzter Zeile
 * @throws {Error} wenn die Zeile fehlt
 */
export function ersetzeImport(alt) {
  if (!alt.includes(IMPORTZEILE)) {
    throw new Error(
      `ptc-typentfernung: die Importzeile wurde in ${String(ZIELDATEI)} nicht gefunden. ` +
        'Der Core hat die Datei geändert — der Anker muß nachgezogen werden, sonst liefe ' +
        'die Ergänzung ins Leere und PTC bliebe stumm.',
    )
  }
  return alt.replace(
    IMPORTZEILE,
    'const stripTypeScriptTypes = globalThis.__pmhStripTypeScriptTypes;',
  )
}

/**
 * Richtet die Ergänzung ein: globale Funktion setzen und das Plugin registrieren.
 *
 * **Warum global und nicht importiert.** Die ersetzte Zeile steht in einer fremden
 * Datei; sie kann unsere Funktion nicht importieren, ohne daß wir ihren Pfad
 * kennten. Ein Name unter `globalThis` ist der kleinste gemeinsame Nenner — und er
 * ist ausdrücklich mit `__pmh` gekennzeichnet, damit klar ist, wem er gehört.
 *
 * @param pluginFn - `plugin` aus `bun`, übergeben damit die Prüfung es ersetzen kann
 * @param lies - Funktion zum Lesen einer Datei, übergeben aus demselben Grund
 * @returns ob das Plugin registriert wurde
 */
export function richteEin(pluginFn, lies) {
  globalThis.__pmhStripTypeScriptTypes = entferneTypen
  pluginFn({
    name: 'pmh-ptc-typentfernung',
    setup(build) {
      build.onLoad({ filter: ZIELDATEI }, (args) => ({
        contents: ersetzeImport(lies(args.path)),
        loader: 'js',
      }))
    },
  })
  return true
}

/**
 * Ist die Ergänzung nötig?
 *
 * **Warum gefragt und nicht vorausgesetzt.** Auf **Node** ist
 * `stripTypeScriptTypes` vorhanden; dort wäre die Ergänzung unnötig und würde eine
 * fremde Datei ohne Grund verändern. Die Prüfung fragt die **Fähigkeit** ab, nicht
 * die Plattform — bringt eine künftige Bun-Fassung die Funktion mit, schaltet sich
 * die Ergänzung selbst ab.
 *
 * @returns ob ergänzt werden muß
 */
export function ergaenzungNoetig() {
  return typeof globalThis.process?.getBuiltinModule === 'function'
    ? typeof globalThis.process.getBuiltinModule('node:module')?.stripTypeScriptTypes !== 'function'
    : true
}
