/**
 * `scripts/undici-echt.mjs` — der Weg am Builtin vorbei zum **echten** Paket.
 *
 * **Warum es diese Datei gibt.** Bun 1.4.0 beantwortet den nackten Spezifizierer
 * `undici` aus **eigenem** Bestand und lädt `node_modules/undici` **nie**:
 *
 * ```
 * Bun.resolveSync("undici", <repo>)            -> "undici"        (Builtin)
 * new (await import("undici")).Agent()
 *   typeof close / destroy / dispatch          -> undefined / undefined / undefined
 *   Prototyp                                   -> nur "constructor"
 *
 * node_modules/undici (8.11.2), direkt geladen -> close ist eine Funktion
 * ```
 *
 * Die Attrappe ist **kein** Fehler in der Anwendung: die Klasse heißt `Agent`, ist
 * `instanceof Dispatcher`, und der Konstruktor wirft nicht. Erst der **Aufruf**
 * einer Methode scheitert — deshalb startet der Host sauber und `web_fetch` fällt
 * erst bei der Benutzung aus.
 *
 * **Warum ein Umweg und kein Plugin auf `undici`.** Gemessen am 18.10.2026: ein
 * `onResolve`-Filter auf `/^undici$/` feuert **nicht** — Bun löst den
 * Spezifizierer auf, bevor die Plugins gefragt werden. Dieselbe Grenze, an der
 * schon der Versuch scheiterte, `node:module` abzufangen (`bunfig.toml`, „Warum
 * eine Vorladung und kein Patch"). Der Filter greift deshalb an den **Verbrauchern**
 * an — siehe `scripts/undici-echte-aufloesung.mjs`.
 *
 * **Warum `export *` und keine Einzelliste.** Die Verbraucher holen `Agent`,
 * `Pool`, `ProxyAgent`, `fetch`, `getGlobalDispatcher`, `setGlobalDispatcher`.
 * Eine Aufzählung hier würde bei der nächsten undici-Version stumm veralten.
 *
 * **Die Grenze.** Der Pfad `../node_modules/undici/index.js` gilt für den
 * **hoisted** Linker dieses Repos (`bunfig.toml`, `[install] linker = "hoisted"`).
 * Fehlt das Paket, wirft der Import laut — das ist gewollt: eine stille Attrappe
 * wäre schlimmer als ein Startfehler.
 *
 * @module scripts/undici-echt
 */

export * from '../node_modules/undici/index.js'
