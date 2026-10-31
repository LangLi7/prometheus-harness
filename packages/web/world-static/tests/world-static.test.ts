/**
 * **Der Auslieferer der Welt — und die eine Stelle, an der aus einer Adresse ein Dateipfad wird.**
 *
 * **Warum hier so genau geprüft wird.** Diese Datei nimmt **Adressen aus dem Netz** entgegen und
 * macht daraus Dateizugriffe. Ein Fehler darin ist kein Schönheitsfehler, sondern ein Ausbruch aus
 * dem Zielbaum: `GET /universe/../../.env` wäre ein Lesezugriff auf eine Datei, die niemand
 * ausliefern wollte. Deshalb steht in `zieldatei` **eine** Stelle, die das entscheidet — und diese
 * Prüfung fährt jede Form durch, die man dafür kennt.
 *
 * Dazu kommt der Fall, der **still** schiefgeht: ein fehlender Inhaltstyp für `.woff2`. Der Browser
 * lädt die Marken-Schrift dann nicht, die Oberfläche fällt auf die Systemschrift zurück, und **nichts
 * meldet einen Fehler**. Genau das ist in diesem Projekt schon einmal passiert.
 */
import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { macheWeltHandler, typFuer, zieldatei, WORLD_PATH } from '../src/index'

/** Ein Wegwerf-Baum mit `index.html` und einem `assets`-Ordner. */
function baueWelt(): string {
  const basis = mkdtempSync(join(tmpdir(), 'pmh-welt-'))
  writeFileSync(join(basis, 'index.html'), '<!doctype html><title>Welt</title>', 'utf8')
  mkdirSync(join(basis, 'assets'), { recursive: true })
  writeFileSync(join(basis, 'assets', 'index.js'), 'export const x = 1', 'utf8')
  writeFileSync(join(basis, 'assets', 'schrift.woff2'), 'woff2-bytes', 'utf8')
  return basis
}

/** Eine Anfrage, wie sie der Kern an den Handler gibt — mehr braucht er nicht. */
function anfrage(url: string, method = 'GET'): unknown {
  return { url, method }
}

/** Eine Antwort, die mitschreibt, statt zu senden. */
function antwort(): { statusCode: number; kopf: Record<string, string>; koerper: Buffer | undefined; res: unknown } {
  const kopf: Record<string, string> = {}
  const zustand = { statusCode: 0, kopf, koerper: undefined as Buffer | undefined }
  const res = {
    get statusCode() {
      return zustand.statusCode
    },
    set statusCode(wert: number) {
      zustand.statusCode = wert
    },
    setHeader: (name: string, wert: string) => {
      kopf[name.toLowerCase()] = wert
    },
    end: (inhalt?: Buffer) => {
      zustand.koerper = inhalt
    },
  }
  return {
    get statusCode() {
      return zustand.statusCode
    },
    kopf,
    get koerper() {
      return zustand.koerper
    },
    res,
  }
}

test('der Pfad der Anfrage wird zu einer Datei im Zielbaum', () => {
  const basis = baueWelt()
  // Die Wurzel **ist** das Verzeichnis; welche Datei daraus wird, entscheidet der Handler (die
  // `index.html`) — nicht diese Funktion.
  expect(zieldatei(basis, '/universe/')).toBe(basis)
  expect(zieldatei(basis, '/universe/assets/index.js')).toBe(join(basis, 'assets', 'index.js'))
  // Der Abfrageteil gehört nicht zum Pfad. Der Umschalter schickt heute **keine** Zusaetze mehr mit
  // (`docs/status/umschalter-marke.md`: der Ankunftswunsch liegt im `localStorage`) — ein Aufruf mit
  // Zusatz darf trotzdem nicht zu einer anderen Datei fuehren, sonst waere ein geteilter Link kaputt.
  expect(zieldatei(basis, '/universe/?room=test')).toBe(basis)
})

test('was NICHT zum Zielbaum gehört, wird abgewiesen — jede bekannte Form', () => {
  const basis = baueWelt()
  const boese = [
    // **Der Ausbruch, in allen Schreibweisen.** Jede Zeile ist ein eigener Versuch, aus `dist/`
    // herauszukommen; keine darf durchkommen.
    '/universe/../.env',
    '/universe/../../.env',
    '/universe/assets/../../.env',
    '/universe/%2e%2e/.env',
    '/universe/%2E%2E%2F.env',
    '/universe/..%2f.env',
    // Kaputte Prozentfolge — keine Adresse, die man auflösen kann.
    '/universe/%zz',
    // Eine fremde Route: hier ist dieses Paket nicht zuständig (der Kern antwortet 404).
    '/',
    '/chat',
    '/universeX/index.html',
  ]
  const durchgekommen = boese.filter((pfad) => zieldatei(basis, pfad) !== undefined)
  expect(durchgekommen.join(', ')).toBe('')
})

test('die Endung bestimmt den Inhaltstyp — und die Schrift ist dabei', () => {
  expect(typFuer('index.html')).toBe('text/html; charset=utf-8')
  expect(typFuer('assets/index-XYZ.js')).toBe('text/javascript; charset=utf-8')
  expect(typFuer('assets/index.css')).toBe('text/css; charset=utf-8')
  // **Die Zeile, die den stillen Fehler verhindert.** Fehlt der Typ, verwirft der Browser die
  // Schrift und die Marke fällt auf die Systemschrift zurück — ohne Meldung.
  expect(typFuer('assets/montserrat-regular.woff2')).toBe('font/woff2')
  expect(typFuer('assets/montserrat-light.woff')).toBe('font/woff')
  // Unbekanntes wird als Byte-Strom geliefert, nicht als HTML (sonst wären fremde Bytes Markup).
  expect(typFuer('etwas.xyz')).toBe('application/octet-stream')
})

test('der Handler liefert die Wurzel, ein Asset und die Schrift aus', () => {
  const basis = baueWelt()
  const handler = macheWeltHandler(basis)

  const wurzel = antwort()
  handler(anfrage('/universe/') as never, wurzel.res as never)
  expect(wurzel.statusCode).toBe(200)
  expect(wurzel.kopf['content-type']).toBe('text/html; charset=utf-8')
  expect(String(wurzel.koerper)).toContain('Welt')

  const asset = antwort()
  handler(anfrage('/universe/assets/index.js') as never, asset.res as never)
  expect(asset.statusCode).toBe(200)
  expect(asset.kopf['content-type']).toBe('text/javascript; charset=utf-8')
  expect(String(asset.koerper)).toContain('export const x')

  const schrift = antwort()
  handler(anfrage('/universe/assets/schrift.woff2') as never, schrift.res as never)
  expect(schrift.statusCode).toBe(200)
  expect(schrift.kopf['content-type']).toBe('font/woff2')

  /*
   * **`/universe` ohne Schlußstrich leitet um** — und das ist die richtige Antwort, nicht die
   * bequeme: die `index.html` lädt ihre Dateien **relativ** (`./assets/…`, siehe `base: './'` in
   * `apps/universe/vite.config.ts`). Ohne den Schlußstrich zeigte `./assets/…` auf `/assets/…` —
   * also auf die **Wurzel** des Harness, und die Welt bliebe schwarz. Der erste Anlauf dieser
   * Prüfung erwartete hier 200; die Umleitung ist die bessere Antwort.
   */
  const ohne = antwort()
  handler(anfrage(`${WORLD_PATH}`) as never, ohne.res as never)
  expect(ohne.statusCode).toBe(301)
  expect(ohne.kopf['location']).toBe(`${WORLD_PATH}/`)

  const verzeichnis = antwort()
  handler(anfrage('/universe/assets') as never, verzeichnis.res as never)
  expect(verzeichnis.statusCode).toBe(301)
  expect(verzeichnis.kopf['location']).toBe('/universe/assets/')
})

/**
 * **Der Abfrageteil überlebt die Umleitung — und das war gemessen falsch.**
 *
 * ## Der Fehler
 *
 * Die Umleitung hing den Schlußstrich an die **ganze** Adresse: `${req.url}/`. Damit wurde aus
 * `/universe/?stil=prometheus` die Adresse `/universe/?stil=prometheus/`, und der Wert hieß für die
 * Seite `prometheus/`.
 *
 * ## Wie er gefunden wurde
 *
 * Nicht durch Nachdenken, sondern **am laufenden Bild** (16.10.2026): die Stilvorlage der Welt
 * (`?stil=…`, siehe `apps/universe/src/stil.ts`) schaltete nicht um. Die Messung im Browser zeigte
 * `location.search === "?room=stilprobe&stil=prometheus/"`. Ohne diese Messung hätte man den Fehler
 * in der Umschaltung gesucht — die richtig gebaut war.
 *
 * ## Warum er lange unentdeckt blieb
 *
 * Der **Raum** ist der einzige Abfragewert, den es vorher gab, und `normalizeRoom`
 * (`apps/universe/src/room.ts`) schneidet Sonderzeichen weg: aus `alice/` wird `alice`. Die
 * Bereinigung **verdeckte** den Schaden. Ein Wert, der genau stimmen muß, deckt ihn auf.
 *
 * **Und warum die Prüfung auf dem Pfad sitzt.** Das Verzeichnis entscheidet der **Pfad**; ein
 * Schlußstrich im Abfrageteil (`?zurueck=/start/`) darf keine Umleitung auslösen. Ein Vergleich auf
 * der ganzen Adresse hätte genau das getan.
 */
test('die Umleitung nimmt den Abfrageteil unverändert mit', () => {
  const handler = macheWeltHandler(baueWelt())

  const mitAbfrage = antwort()
  handler(anfrage(`${WORLD_PATH}?room=alice`) as never, mitAbfrage.res as never)
  expect(mitAbfrage.statusCode).toBe(301)
  expect(mitAbfrage.kopf['location']).toBe(`${WORLD_PATH}/?room=alice`)

  const zweiWerte = antwort()
  handler(anfrage(`${WORLD_PATH}?room=alice&stil=prometheus`) as never, zweiWerte.res as never)
  expect(zweiWerte.kopf['location']).toBe(`${WORLD_PATH}/?room=alice&stil=prometheus`)

  // Schon kanonisch: **keine** Umleitung, und der Abfrageteil bleibt, wie er ist.
  const kanonisch = antwort()
  handler(anfrage(`${WORLD_PATH}/?stil=prometheus`) as never, kanonisch.res as never)
  expect(kanonisch.statusCode).toBe(200)

  // Ein Schlußstrich im **Abfrageteil** ist kein Verzeichnis-Schlußstrich.
  const imWert = antwort()
  handler(anfrage(`${WORLD_PATH}?zurueck=/start/`) as never, imWert.res as never)
  expect(imWert.statusCode).toBe(301)
  expect(imWert.kopf['location']).toBe(`${WORLD_PATH}/?zurueck=/start/`)
})

test('HEAD sendet nur die Kopfdaten', () => {
  const basis = baueWelt()
  const handler = macheWeltHandler(basis)
  const kopf = antwort()
  handler(anfrage('/universe/index.html', 'HEAD') as never, kopf.res as never)
  expect(kopf.statusCode).toBe(200)
  expect(kopf.kopf['content-length']).toBeTruthy()
  expect(kopf.koerper).toBeUndefined()
})

test('eine andere Methode bekommt 405 — nicht 404', () => {
  const basis = baueWelt()
  const handler = macheWeltHandler(basis)
  const post = antwort()
  handler(anfrage('/universe/', 'POST') as never, post.res as never)
  expect(post.statusCode).toBe(405)
  expect(post.kopf['allow']).toBe('GET, HEAD')
  // **Der alte Vite-Server hätte hier 404 gesagt.** Eine falsche Methode und eine falsche Adresse
  // sind zwei verschiedene Fehler — wer sie gleich beantwortet, schickt den Suchenden an die
  // falsche Stelle.
})

test('ohne Bau wird das GESAGT — mit dem Befehl, der ihn herstellt', () => {
  const leeresZiel = mkdtempSync(join(tmpdir(), 'pmh-welt-leer-'))
  const handler = macheWeltHandler(join(leeresZiel, 'dist'))
  const antwortOhne = antwort()
  handler(anfrage('/universe/') as never, antwortOhne.res as never)
  expect(antwortOhne.statusCode).toBe(503)
  const text = String(antwortOhne.koerper)
  expect(text).toContain('nicht gebaut')
  expect(text).toContain('bun run build')
  // Und der Weg steht dabei — sonst sucht man ihn.
  expect(text).toContain('apps/universe')
})
