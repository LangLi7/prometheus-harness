/**
 * `scripts/undici-echte-aufloesung.mjs` — die Attrappe umgehen, die Bun unter dem
 * Namen `undici` ausliefert.
 *
 * ## Der Befund, gemessen am 18.10.2026
 *
 * ```
 * Bun.resolveSync("undici", <repo>)   ->  "undici"     <- Builtin, kein node_modules
 * typeof (await import("undici")).Agent.prototype.close ->  undefined
 * typeof require("<repo>/node_modules/undici/index.js").Agent.prototype.close -> function
 * ```
 *
 * **Wirkung im Betrieb.** `web_fetch` baut in
 * `@deepseek-ai/dsh-web-fetch-http/lib/index.js` einen `undici.Agent` und schließt
 * ihn nach dem Lesen des Rumpfes. Der Abruf **gelingt**, erst `close()` wirft —
 * und das fertige Ergebnis wird verworfen. Der Agent sieht:
 *
 * ```
 * Error: dispatcher.close is not a function. (In 'dispatcher.close()', 'dispatcher.close' is undefined)
 * ```
 *
 * Dasselbe trifft `@deepseek-ai/dsh-http-proxy/lib/index.js` (`direct.close()` beim
 * Abbau, `Agent`/`Pool`/`ProxyAgent` für den Proxy-Pfad).
 *
 * **Warum das nicht nur kosmetisch ist.** Der Agent wird mit
 * `connect: { lookup: createPinnedLookup(addresses) }` gebaut: der geprüfte
 * Adresssatz wird in den Verbindungsaufbau **gepinnt**, damit ein Hostname nach der
 * Prüfung nicht auf eine private IP umbiegen kann. Eine Attrappe, die `dispatcher`
 * einfach ignoriert, hebelt genau diesen Schutz aus. Deshalb ist die richtige
 * Antwort **nicht** `dispatcher.close?.()` — dann liefe der Abruf weiter, nur ohne
 * Pinning. Die richtige Antwort ist, das echte Paket zu laden.
 *
 * ## Warum der Anker bei den Verbrauchern liegt
 *
 * Ein `onResolve`-Filter auf `/^undici$/` feuert **nicht** (gemessen): Bun löst den
 * Spezifizierer auf, bevor Plugins gefragt werden. Dieselbe Grenze steht schon in
 * `bunfig.toml` für `node:module`. Der Anker ist deshalb der **Dateipfad** der zwei
 * Verbraucher; in ihrem Text wird `import("undici")` auf das Umleitungsmodul
 * `scripts/undici-echt.mjs` gezogen.
 *
 * ## Die Grenze, die dabeisteht
 *
 * Das ist eine **Ergänzung an fremdem Code**, kein Ersatz. Findet sie ihren Anker
 * nicht, **wirft sie** und der Host startet nicht: lieber laut scheitern als eine
 * Ergänzung, die ins Leere greift und `web_fetch` stumm kaputt läßt. Verschwindet
 * die Lücke in einer künftigen Bun-Fassung, schaltet `ergaenzungNoetig()` die
 * Ergänzung von selbst ab — gemessen, nicht geraten.
 *
 * @module scripts/undici-echte-aufloesung
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Das Umleitungsmodul, auf das die Verbraucher gezogen werden. */
export const UMWEG = new URL('./undici-echt.mjs', import.meta.url)

/** Die Dateien, deren Import umgeschrieben wird — **Muster**, kein Verzeichnisname. */
export const ZIELDATEIEN = [
  /dsh-web-fetch-http[\\/]lib[\\/]index\.js$/u,
  /dsh-http-proxy[\\/]lib[\\/]index\.js$/u,
]

/** Der Anker im fremden Text — wörtlich, damit ein Umbau auffällt. */
export const ANKER = 'import("undici")'

/** Was an seine Stelle tritt. */
export const ERSATZ = `import(${JSON.stringify(UMWEG.href)})`

/**
 * Zieht jeden `import("undici")` auf das Umleitungsmodul.
 *
 * **Reine Funktion, damit sie ohne Host prüfbar ist.**
 *
 * @param alt - der Inhalt einer Verbraucher-Datei
 * @returns der Inhalt mit umgeschriebenen Importen
 * @throws {Error} wenn der Anker fehlt — der Core hat die Stelle umgebaut
 */
export function zieheAufUmweg(alt) {
  const treffer = alt.split(ANKER).length - 1
  if (treffer === 0) {
    throw new Error(
      'undici-echte-aufloesung: kein import("undici") in der Verbraucher-Datei gefunden. ' +
        'Der Core hat die Stelle umgebaut — der Anker muß nachgezogen werden, sonst bleibt ' +
        'web_fetch unter Bun mit "dispatcher.close is not a function" kaputt.',
    )
  }
  return alt.split(ANKER).join(ERSATZ)
}

/**
 * Ist die Ergänzung nötig? **Ja, wenn die Laufzeit `undici` als Builtin auflöst.**
 *
 * Die Prüfung fragt die **Fähigkeit** ab, nicht die Plattform: liefert
 * `Bun.resolveSync` einen Pfad, ist das echte Paket erreichbar und es ist nichts zu
 * ergänzen. Liefert es den Spezifizierer selbst zurück, ist es ein Builtin — dann
 * greift die Attrappe.
 *
 * @returns ob ergänzt werden muß
 */
export function ergaenzungNoetig() {
  const bun = globalThis.Bun
  if (typeof bun?.resolveSync !== 'function') return false
  try {
    return bun.resolveSync('undici', fileURLToPath(new URL('../', import.meta.url))) === 'undici'
  } catch {
    return false
  }
}

/**
 * Registriert das Plugin.
 *
 * @param pluginFn - `plugin` aus `bun`
 * @param lies - Funktion zum Lesen einer Datei
 * @returns ob registriert wurde
 * @throws {Error} wenn das Umleitungsmodul fehlt
 */
export function richteEin(pluginFn, lies) {
  if (!existsSync(fileURLToPath(UMWEG))) {
    throw new Error(`undici-echte-aufloesung: Umleitungsmodul fehlt: ${fileURLToPath(UMWEG)}`)
  }
  pluginFn({
    name: 'pmh-undici-echt',
    setup(build) {
      for (const filter of ZIELDATEIEN) {
        build.onLoad({ filter }, (args) => ({
          contents: zieheAufUmweg(lies(args.path)),
          loader: 'js',
        }))
      }
    },
  })
  return true
}
