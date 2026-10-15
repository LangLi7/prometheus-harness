/**
 * `scripts/plugin-metadaten-aufloeser.mjs` — Paket-Metadaten unter Bun lesbar machen.
 *
 * ## Der Befund, gemessen am 14.10.2026
 *
 * Im Plugin-Verwalter der Oberfläche stand beim Sprachbündel:
 *
 * > *Fehler in den Paket-Metadaten: Plugin metadata for
 * > @deepseek-ai/dsh-experimental-voice-input-bundle: Error: **Plugin metadata requires
 * > the Node module resolver***
 *
 * Die Ursache: `@deepseek-ai/dsh-app-boot` liest Paket-Ressourcen (allen voran das **Icon**
 * eines Plugins) über den **internen ESM-Lader von Node** —
 * `ModuleLoader.fromInternal()` aus `@deepseek-ai/cordis-plugin-loader`. Unter Bun schlägt
 * `requireInternal("internal/modules/esm/loader")` fehl, `fromInternal()` gibt `undefined`
 * zurück, und der Verbraucher **wirft**.
 *
 * ## Der erste Versuch war falsch — und der Host startete nicht mehr
 *
 * Zuerst wurde `ModuleLoader.fromInternal()` selbst mit einem **Ersatz-Auflöser** bestückt
 * (`{ version: "v2", resolveSync }`). Gemessen: der Host startete danach **nicht mehr** —
 * *„startup failed: 5 required plugins did not activate"*, **167 × „failed to import"**.
 * Ohne die Ergänzung startete er. Ein reiner Import der betroffenen Pakete gelang dagegen
 * einzeln.
 *
 * **Die Lehre.** `fromInternal()` ist nicht nur für Metadaten da: der **Lader** des Kerns
 * benutzt ihn, um Plugin-Module aufzulösen. Solange er `undefined` liefert, nimmt der Lader
 * seinen **dokumentierten Ausweichweg** — und der funktioniert. Ein **Teilersatz**, der nur
 * `resolveSync` nachbaut, macht diesen Weg kaputt: die Auflösung liefert dann etwas, mit dem
 * der Lader nicht weiterkommt. *Einen Innenlader halb nachzubauen ist schlimmer als keiner.*
 *
 * ## Was jetzt geschieht: der **Verbraucher** wird ergänzt, nicht der Lader
 *
 * Ergänzt wird `resolvePluginResource` in `dsh-app-boot` — die eine Funktion, die den
 * Auflöser braucht. Sie bekommt für den Fall „kein Innenlader" einen **öffentlichen** Weg
 * (`createRequire(...).resolve(...)`), statt zu werfen. Alles andere bleibt unberührt:
 *
 * * Unter **Node** ändert sich **nichts** — dort liefert `fromInternal()` einen Lader, und
 *   der neue Zweig wird nie betreten.
 * * Der **Lader** des Kerns sieht weiterhin genau das, was er vorher sah (`undefined`).
 *
 * `createRequire` und `fileURLToPath` sind in der Zieldatei bereits eingeführt.
 *
 * ## Die zweite Stelle — gefunden, **nicht** ergänzt
 *
 * `dsh-app-boot` ruft `ModuleLoader.fromInternal()` an **zwei** Stellen. Die zweite, in
 * `collectConfigSchemas`, braucht den Innenlader **wirklich** (sie liest Konfigurations-
 * Schemata über Modul-Aufträge) und wirft dort mit
 * *„config schema dump requires the Node module loader used by profile resolution"*.
 * Nachbauen läßt sich das nicht — ein Teilersatz wäre derselbe Fehler wie oben. Das steht hier
 * als **offener Punkt** und nicht als stiller Rest.
 *
 * @module scripts/plugin-metadaten-aufloeser
 */

/** Die Datei, deren Ressourcen-Auflösung ergänzt wird. */
export const ZIELDATEI = /dsh-app-boot[\\/]lib[\\/]index\.js$/u

/** Die Stelle, die ergänzt wird — wörtlich, damit ein Umbau auffällt. */
export const ANKER =
  'function resolvePluginResource(specifier, parentURL) {\n\tconst loader = ModuleLoader.fromInternal();\n\tif (loader === void 0) throw new Error("Plugin metadata requires the Node module resolver");'

/** Was dort steht. */
export const ERSATZ = `function resolvePluginResource(specifier, parentURL) {
	const loader = ModuleLoader.fromInternal();
	if (loader === void 0) {
		// Von scripts/plugin-metadaten-aufloeser.mjs: Bun hat keinen Node-Innenlader.
		// Öffentlicher Weg statt Wurf — der Aufrufer behandelt ein fehlendes Ergebnis
		// ohnehin als "diese Ressource gibt es nicht".
		const basis = typeof parentURL === "string" ? parentURL : String(parentURL);
		const alsPfad = basis.startsWith("file:") ? fileURLToPath(basis) : basis;
		return createRequire(alsPfad).resolve(specifier);
	}`

/**
 * Ergänzt die Ressourcen-Auflösung um einen öffentlichen Weg.
 *
 * **Reine Funktion, damit sie ohne Host prüfbar ist.**
 *
 * @param alt - der Inhalt von `dsh-app-boot/lib/index.js`
 * @returns der Inhalt mit dem zusätzlichen Zweig
 * @throws {Error} wenn der Anker fehlt — der Kern hat umgebaut
 */
export function ergaenzeAufloeser(alt) {
  if (!alt.includes(ANKER)) {
    throw new Error(
      'plugin-metadaten-aufloeser: der Anker in dsh-app-boot/lib/index.js steht nicht mehr. ' +
        'Der Kern hat `resolvePluginResource` umgebaut — der Anker muß nachgezogen werden, ' +
        'sonst bleiben Paket-Metadaten (Icons) unter Bun unlesbar.',
    )
  }
  return alt.replace(ANKER, ERSATZ)
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
    name: 'pmh-plugin-metadaten',
    setup(build) {
      build.onLoad({ filter: ZIELDATEI }, (args) => ({
        contents: ergaenzeAufloeser(lies(args.path)),
        loader: 'js',
      }))
    },
  })
  return true
}

/**
 * Ist die Ergänzung nötig? **Ja unter Bun — nein unter Node.**
 *
 * Gefragt wird die **Fähigkeit**, nicht die Plattform.
 *
 * @returns ob ergänzt werden muß
 */
export function ergaenzungNoetig() {
  return typeof process.versions?.bun === 'string'
}
