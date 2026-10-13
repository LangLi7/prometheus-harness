/**
 * Prüfungen für `@prometheus-harness/health`.
 *
 * ## Warum hier **echtes HTTP** läuft und keine Attrappe
 *
 * Der Zweck dieses Pakets ist nicht, JSON zu erzeugen — es ist, **im Host
 * angeschlossen** zu sein. Eine Prüfung mit einem gefälschten `webServer` würde
 * genau die Frage offenlassen, um die es geht: kommt eine Anfrage von außen bei
 * unserem Handler an?
 *
 * Deshalb benutzt diese Prüfung den **echten** `WebServer` des Cores
 * (`@deepseek-ai/dsh-host-webserver`) auf einem vom Betriebssystem vergebenen
 * Port (`port: 0`) und den **echten** Cordis-Kontext. Geprüft wird mit `fetch`,
 * also über den Netzstapel.
 *
 * **Die Grenze, die das nicht abdeckt.** Hier wird der Webserver **direkt**
 * eingehängt. Ob der **Loader des Hosts** unser Paket findet und einhängt, kann
 * diese Prüfung nicht zeigen — das ist die Frage, die nur ein laufender Host
 * beantwortet (siehe `docs/status/beleg-eigener-endpunkt.md`). Zwei Prüfungen,
 * zwei Fragen; keine von beiden behauptet, die andere zu sein.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Context, Service } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import apply, {
  HEALTH_PATH,
  SERVICE_NAME,
  SERVICE_VERSION,
  healthBody,
  handleHealth,
  inject,
  name,
} from '../src/index.ts'

/** Ein laufender Webserver mit eingehängtem Plugin. */
interface Aufbau {
  /** Adresse des Endpunkts. */
  url: string
  /** Der Cordis-Kontext. */
  ctx: Context
  /** Der Webserver-Dienst. */
  server: WebServer
  /** Hängt das Plugin ein und gibt das Fiber zurück. */
  plugin: () => { dispose: () => Promise<void> }
}

let aufbau: Aufbau
/**
 * Aufräumen, damit kein Port offen bleibt, wenn eine Prüfung scheitert.
 *
 * **Warum das nötig ist — nachgelesen und nachgemessen, nicht geraten.** Der
 * `WebServer` schließt seinen Lauscher in einem **Effekt** (`ctx.effect` in
 * seiner `init`). Wer nur `fiber.dispose()` für unser Plugin ruft, läßt den
 * Lauscher offen. Erst das Entsorgen des **Wurzel-Fibers** führt den Effekt des
 * Webservers aus.
 *
 * Nachgemessen mit einer Sonde am 13.10.2026: nach `ctx.fiber.dispose()` hört der
 * Port auf zu lauschen, und ein zweiter Aufbau auf **demselben** Port gelingt.
 * Ohne diese Messung wäre das Aufräumen hier eine Behauptung.
 *
 * **Warum `ctx.stop()` hier nicht steht.** Diese Cordis-Fassung hat kein
 * `ctx.stop` und kein `ctx.root.dispose` — beide Versuche waren Typecheck-Fehler.
 * `ctx.fiber` gibt es zur Laufzeit, aber nicht in den Typen; deshalb die
 * ausdrückliche Umformung.
 */
const wurzelFiber = (ctx: Context) =>
  ctx as unknown as { fiber: { dispose: () => Promise<void> } }

let abräumen: (() => Promise<void>)[] = []

beforeEach(async () => {
  const ctx = new Context()
  const server = new WebServer(ctx, { host: '127.0.0.1', port: 0 })
  await server[Service.init]()
  abräumen.push(async () => {
    await wurzelFiber(ctx).fiber.dispose()
  })
  aufbau = {
    url: `http://127.0.0.1:${String(server.port)}${HEALTH_PATH}`,
    ctx,
    server,
    plugin: () => ctx.plugin({ name, inject, apply }) as unknown as { dispose: () => Promise<void> },
  }
})

afterEach(async () => {
  for (const auf of abräumen.reverse()) await auf()
  abräumen = []
})

/** Kurz warten, damit der Cordis-Lebenszyklus den Effekt ausführen kann. */
const ruhe = () => new Promise((r) => setTimeout(r, 100))

describe('healthBody', () => {
  test('nennt Zustand, Dienst, Fassung und Laufzeit', () => {
    const body = healthBody()
    expect(body.status).toBe('ok')
    expect(body.service).toBe(SERVICE_NAME)
    expect(body.version).toBe(SERVICE_VERSION)
    expect(body.runtime).toMatch(/^bun \d/)
  })

  test('die Laufzeit wächst mit der Uhr', () => {
    const früh = healthBody(Date.now())
    const spät = healthBody(Date.now() + 5_000)
    expect(spät.uptimeMs - früh.uptimeMs).toBeGreaterThanOrEqual(5_000)
  })

  test('eine zurückgestellte Uhr ergibt keine negative Laufzeit', () => {
    // Eine Uhr, die während des Starts zurückgestellt wird, darf keine unsinnige
    // Laufzeit melden.
    expect(healthBody(0).uptimeMs).toBe(0)
  })

  test('die Fassung stimmt mit package.json überein', () => {
    // **Warum das geprüft wird.** Die Fassung steht als Zeichenkette im Quelltext
    // (`SERVICE_VERSION`), damit der Endpunkt zur Laufzeit keine Datei lesen
    // muß. Dann kann sie aber von `package.json` abweichen — und niemand merkt
    // es. Diese Prüfung ist der Ersatz für den Lesezugriff.
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'),
    ) as { version: string; name: string }
    expect(SERVICE_VERSION).toBe(manifest.version)
    expect(SERVICE_NAME).toBe(manifest.name)
  })

  test('der Pfad ist der, den der Patch nennt', () => {
    expect(HEALTH_PATH).toBe('/api/health')
  })
})

describe('handleHealth (ohne Netz)', () => {
  /** Eine minimale Antwort-Attrappe, die nur mitschreibt. */
  function antwortAttrappe() {
    const kopf = new Map<string, string>()
    let körper: Buffer | undefined
    let beendet = false
    return {
      statusCode: 0,
      setHeader: (k: string, v: string) => kopf.set(k.toLowerCase(), v),
      end: (b?: Buffer) => {
        körper = b
        beendet = true
      },
      // Auslesen
      kopf,
      körper: () => körper,
      beendet: () => beendet,
    }
  }

  test('GET antwortet mit 200 und no-store', () => {
    const res = antwortAttrappe()
    handleHealth({ method: 'GET' } as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(res.kopf.get('cache-control')).toBe('no-store')
    expect(res.kopf.get('content-type')).toBe('application/json; charset=utf-8')
    expect(JSON.parse(String(res.körper())).status).toBe('ok')
  })

  test('HEAD sendet die Kopfdaten ohne Körper', () => {
    // **Warum das ausdrücklich geprüft wird.** `HEAD` ist die Methode, die
    // Werkzeuge zur Erreichbarkeitsprüfung benutzen. Eine Antwort **mit** Körper
    // auf `HEAD` ist ein Protokollfehler.
    const res = antwortAttrappe()
    handleHealth({ method: 'HEAD' } as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(res.körper()).toBeUndefined()
    expect(res.beendet()).toBe(true)
  })

  test('eine fehlende Methode gilt als GET', () => {
    const res = antwortAttrappe()
    handleHealth({} as never, res as never)
    expect(res.statusCode).toBe(200)
  })

  test('POST bekommt 405 mit Allow — nicht 404', () => {
    // Ein Aufruf mit der falschen Methode ist ein anderer Fehler als einer an
    // der falschen Adresse. Wer POST schickt, hat den Pfad richtig.
    const res = antwortAttrappe()
    handleHealth({ method: 'POST' } as never, res as never)
    expect(res.statusCode).toBe(405)
    expect(res.kopf.get('allow')).toBe('GET, HEAD')
    expect(JSON.parse(String(res.körper())).error).toBe('method_not_allowed')
  })

  test('die Längenangabe stimmt mit dem Körper überein', () => {
    // Der Webserver des Cores verdichtet ab 1.024 Byte und behandelt eine
    // Antwort **ohne** Längenangabe als „unbekannte Länge". Falsche Länge wäre
    // schlimmer als keine: der Aufrufer bekäme einen abgeschnittenen Körper.
    const res = antwortAttrappe()
    handleHealth({ method: 'GET' } as never, res as never)
    const körper = res.körper()
    expect(körper).toBeDefined()
    expect(res.kopf.get('content-length')).toBe(String(körper?.byteLength))
  })
})

describe('apply — der echte Weg über Cordis und HTTP', () => {
  test('vor dem Einhängen antwortet die Adresse 404', async () => {
    const res = await fetch(aufbau.url)
    expect(res.status).toBe(404)
  })

  test('nach dem Einhängen antwortet unser Handler mit 200', async () => {
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.url)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; service: string }
    expect(body.status).toBe('ok')
    expect(body.service).toBe(SERVICE_NAME)
  })

  test('die Antwort trägt die Kopfdaten aus dem Handler', async () => {
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.url)
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(res.headers.get('content-length')).toBe(String(Buffer.byteLength(text)))
  })

  test('POST über HTTP bekommt 405 mit Allow', async () => {
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.url, { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  test('HEAD über HTTP liefert die Kopfdaten ohne Körper', async () => {
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.url, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
  })

  test('ein anderer Pfad bleibt 404 — die Route ist genau, nicht ein Präfix', async () => {
    aufbau.plugin()
    await ruhe()
    const daneben = aufbau.url.replace(HEALTH_PATH, `${HEALTH_PATH}/mehr`)
    const res = await fetch(daneben)
    expect(res.status).toBe(404)
  })

  test('nach dem Abhängen antwortet die Adresse wieder 404', async () => {
    // **Der Fehler, den diese Prüfung gefunden hat.** Die erste Fassung hing den
    // Disposer an `ctx.on('dispose', …)` — ein Ereignis, das Cordis **nicht
    // kennt**. Der Listener feuerte nie, die Route blieb stehen und zeigte nach
    // dem Abhängen auf einen toten Kontext. Hier wurde daraus 200 statt 404.
    const fiber = aufbau.plugin()
    await ruhe()
    expect((await fetch(aufbau.url)).status).toBe(200)

    await fiber.dispose()
    await ruhe()
    expect((await fetch(aufbau.url)).status).toBe(404)
  })

  test('erneutes Einhängen scheitert nicht an der alten Route', async () => {
    // Der Webserver wirft bei einer doppelten (kind, path)-Registrierung. Bliebe
    // die alte Route stehen, wäre ein Neuladen des Plugins unmöglich.
    const erst = aufbau.plugin()
    await ruhe()
    await erst.dispose()
    await ruhe()
    aufbau.plugin()
    await ruhe()
    expect((await fetch(aufbau.url)).status).toBe(200)
  })

  test('das Plugin nennt einen stabilen Namen und fordert webServer', () => {
    // Der Name steht auch in der Patch-Zeile des Profils. Weichen beide ab,
    // sucht man einen Fehler an der falschen Stelle.
    expect(name).toBe('pmh-health')
    expect(inject).toEqual(['webServer'])
  })
})
