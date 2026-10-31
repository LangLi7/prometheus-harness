/**
 * `scripts/fs-beobachtung-lebensdauer.mjs` — die Beobachtung soll die **Sitzung**
 * überleben, nicht das Sitzungs-**Objekt**.
 *
 * ## Der Befund, gemessen am 18.10.2026
 *
 * `web_fetch` war der eine Fehler; das hier ist der zweite, größere. Vier Edits in
 * einem Schritt scheiterten mit
 *
 * ```
 * Error: cannot modify "<pfad>": file has not been read — read the file, then retry
 * ```
 *
 * obwohl dieselben Dateien **im selben Turn** vorher gelesen und **im Turn davor**
 * erfolgreich editiert worden waren. Der Blick ins Protokoll zeigt die Kette:
 *
 * ```
 * seq=908  step/end
 * seq=909  turn/end              <- Turn zu Ende
 * seq=910  session/end-seed      <- Sitzung wird NEU aufgebaut (Wiederherstellung)
 * seq=912  turn/start
 * seq=919  assistant  [edit, edit, edit, edit]
 * seq=920  … alle vier: "file has not been read"
 * ```
 *
 * Dieselbe Kette in einer zweiten Sitzung: `read` bei `seq=44` (Turn 1), `edit` bei
 * `seq=307` (Turn 3) → `FS_NOT_OBSERVED`.
 *
 * ## Die Ursache im Code
 *
 * `@deepseek-ai/dsh-fs-observation-policy` merkt sich Beobachtungen in einer
 * **`WeakMap`**, geschlüsselt über das **Sitzungs-Objekt**:
 *
 * ```js
 * observed = new WeakMap();
 * owner(actor) { return actor?.agent?.session; }
 * ```
 *
 * Das ist bewusst so gebaut („weakly held, so a collected session frees its
 * state"). Nur: der Web-Host **behält die Sitzung nicht am Leben**. Am Turn-Ende
 * wird sie persistiert, am nächsten Turn über `agents.resume()` aus dem Protokoll
 * **wiederhergestellt** — ein neues `Session`-Objekt mit derselben `id`. Der
 * `end-seed`-Eintrag im Protokoll ist der Beweis: er wird im **Konstruktor** einer
 * geseedeten Sitzung angehängt.
 *
 * Ein neues Objekt heißt: der `WeakMap`-Schlüssel ist weg, die Beobachtung ist weg.
 * Für den Agenten sieht es aus, als hätte er die Datei nie gelesen — nach **jedem**
 * Turn, für **jede** Datei. Die Edits im ersten Schritt eines Turns scheitern
 * zuverlässig, danach wird nachgelesen und es geht weiter.
 *
 * ## Was die Ergänzung ändert
 *
 * Zwei Zeilen, nichts weiter: der Schlüssel ist die **`id`** der Sitzung (eine
 * Zeichenkette, über Wiederherstellungen hinweg stabil), und die `WeakMap` wird
 * eine `Map`, weil Zeichenketten keine schwachen Schlüssel sein können.
 *
 * ## Was die Ergänzung **nicht** tut
 *
 * Sie schaltet die Prüfung **nicht** ab. Es bleibt dabei: ohne vorherige
 * Beobachtung kein `edit`, und geschrieben wird weiter gegen die **beobachtete
 * Version** (`replaceIfVersion`). Ändert jemand die Datei zwischen zwei Turns
 * außerhalb des Werkzeugs, kommt `FS_STALE_VERSION` — die richtige, sichere
 * Antwort („re-read the file, then retry"). Nur die Frage „habe ich die Datei in
 * dieser Unterhaltung schon gesehen?" wird jetzt richtig beantwortet.
 *
 * ## Die Grenze, die dabeisteht
 *
 * Eine `Map` räumt nicht von selbst auf: je Sitzung bleibt ein Eintrag im Prozeß.
 * Das ist die Gegenleistung für die Lebensdauer und bei der Zahl der Sitzungen
 * eines Hosts vertretbar. Verschwindet die `WeakMap` in einer künftigen Fassung
 * (weil der Kern es selbst richtig macht), **wirft** die Ergänzung beim Start —
 * lieber laut scheitern als eine Ergänzung, die ins Leere greift.
 *
 * @module scripts/fs-beobachtung-lebensdauer
 */

/** Die Datei, deren Schlüssel geändert wird. */
export const ZIELDATEI = /dsh-fs-observation-policy[\\/]lib[\\/]index\.js$/u

/** Der schwache Schlüssel — die Stelle, die ersetzt wird. */
export const SCHWACH = 'observed = /* @__PURE__ */ new WeakMap();'

/** Dasselbe in `clear()`. */
export const SCHWACH_CLEAR = 'this.observed = /* @__PURE__ */ new WeakMap();'

/** Die Schlüsselableitung — die zweite Stelle. */
export const SCHLUESSEL = '\towner(actor) {\n\t\treturn actor?.agent?.session;\n\t}'

/** Was an ihre Stelle tritt. */
export const SCHLUESSEL_NEU =
  '\towner(actor) {\n' +
  '\t\tconst sitzung = actor?.agent?.session;\n' +
  '\t\treturn sitzung?.id ?? sitzung;\n' +
  '\t}'

/**
 * Zieht den Schlüssel von der Objekt-Identität auf die Sitzungs-`id` um.
 *
 * **Reine Funktion, damit sie ohne Host prüfbar ist.**
 *
 * @param alt - der Inhalt der Policy-Datei
 * @returns der Inhalt mit dauerhaftem Schlüssel
 * @throws {Error} wenn eine der Ankerstellen fehlt
 */
export function zieheAufSitzungsId(alt) {
  for (const [was, text] of [
    ['WeakMap-Feld', SCHWACH],
    ['WeakMap in clear()', SCHWACH_CLEAR],
    ['owner()', SCHLUESSEL],
  ]) {
    if (!alt.includes(text)) {
      throw new Error(
        `fs-beobachtung-lebensdauer: Anker "${was}" fehlt in der Policy-Datei. ` +
          'Der Kern hat die Stelle umgebaut — der Anker muß nachgezogen werden, sonst ' +
          'scheitert nach jedem Turn jeder Edit mit "file has not been read".',
      )
    }
  }
  return alt
    .replace(SCHWACH, SCHWACH.replace('new WeakMap()', 'new Map()'))
    .replace(SCHWACH_CLEAR, SCHWACH_CLEAR.replace('new WeakMap()', 'new Map()'))
    .replace(SCHLUESSEL, SCHLUESSEL_NEU)
}

/**
 * Ist die Ergänzung nötig?
 *
 * **Immer — solange die Ankerstellen stehen.** Das ist keine Laufzeit-Fähigkeit wie
 * bei den Bun-Lücken, sondern eine Eigenschaft des Zusammenspiels: der Host stellt
 * Sitzungen pro Turn wieder her, die Policy schlüsselt über das Objekt. Beides ist
 * hier nicht abfragbar; die Prüfung der Anker übernimmt {@link zieheAufSitzungsId}
 * beim Laden und **wirft**, wenn sie nicht mehr stimmen.
 *
 * @returns ob ergänzt werden muß
 */
export function ergaenzungNoetig() {
  return true
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
    name: 'pmh-beobachtung-lebensdauer',
    setup(build) {
      build.onLoad({ filter: ZIELDATEI }, (args) => ({
        contents: zieheAufSitzungsId(lies(args.path)),
        loader: 'js',
      }))
    },
  })
  return true
}
