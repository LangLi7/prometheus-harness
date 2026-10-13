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
  READY_PATH,
  SERVICE_NAME,
  SERVICE_VERSION,
  abweisung,
  healthBody,
  handleHealth,
  inject,
  macheReadyHandler,
  name,
  readyBody,
} from '../src/index.ts'

/** Ein laufender Webserver mit eingehängtem Plugin. */
interface Aufbau {
  /** Adresse der offenen Auskunft. */
  url: string
  /** Adresse der geschützten Auskunft. */
  readyUrl: string
  /** Der Cordis-Kontext — die Attrappe des Verbindungsdienstes hängt daran. */
  ctx: Context
  /** Der Webserver-Dienst. */
  server: WebServer
  /** Wie die Attrappe des Verbindungsdienstes antwortet. */
  abweisungMit: (ergebnis: number | undefined) => void
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

/**
 * Hängt eine **Attrappe** des Verbindungsdienstes an den Kontext.
 *
 * **Warum eine Attrappe und nicht der echte Dienst.** Der echte
 * `HostConnectionService` verlangt das `credentials`-Plugin und ein
 * unterschriebenes Sitzungscookie; ihn hier aufzubauen hieße, den halben Host
 * nachzubauen — und geprüft würde dann der Host, nicht unser Paket.
 *
 * **Was damit geprüft wird.** Genau unser Vertrag: daß wir `requestRejection`
 * mit den Kopfdaten der Anfrage aufrufen und daß wir auf `undefined`, `401`,
 * `403` und einen fehlenden Dienst richtig antworten. Ob der **echte** Dienst
 * diese Werte richtig berechnet, ist eine andere Frage — sie ist am laufenden
 * Host gemessen (**401** ohne Cookie, **404** mit Cookie).
 *
 * **Was eine Attrappe nicht kann.** Sie kann nicht zeigen, daß unser Aufruf die
 * echte Prüfung erreicht. Deshalb steht die Attrappe so nah am Vertrag wie
 * möglich: dieselbe Signatur, dieselben möglichen Werte, und sie **zählt** die
 * Aufrufe mit — damit eine Prüfung nachweisen kann, daß überhaupt gefragt wurde.
 */
function verbindungsAttrappe() {
  const aufrufe: { headers: Record<string, unknown> }[] = []
  let ergebnis: number | undefined
  return {
    aufrufe,
    setze: (wert: number | undefined) => {
      ergebnis = wert
    },
    dienst: {
      requestRejection: (request: { headers: Record<string, unknown> }) => {
        aufrufe.push(request)
        return ergebnis
      },
    },
  }
}

beforeEach(async () => {
  const ctx = new Context()
  const server = new WebServer(ctx, { host: '127.0.0.1', port: 0 })
  await server[Service.init]()
  abräumen.push(async () => {
    await wurzelFiber(ctx).fiber.dispose()
  })
  const attrappe = verbindungsAttrappe()
  // Der Cordis-Kontext bekommt die Attrappe als Dienst. `get` ist die
  // öffentliche Abfrage, die unser Paket benutzt.
  const mitDienst = ctx as unknown as { get: (name: string) => unknown }
  const echtesGet = mitDienst.get.bind(mitDienst)
  mitDienst.get = (dienstName: string) =>
    dienstName === 'connection' ? attrappe.dienst : echtesGet(dienstName)
  aufbau = {
    url: `http://127.0.0.1:${String(server.port)}${HEALTH_PATH}`,
    readyUrl: `http://127.0.0.1:${String(server.port)}${READY_PATH}`,
    ctx,
    server,
    abweisungMit: attrappe.setze,
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
    // **`connection` steht hier absichtlich NICHT.** Der erste Entwurf forderte
    // ihn; in einem Aufbau ohne Verbindungsdienst hing der Loader das Plugin
    // dann **nie** ein, und beide Endpunkte antworteten 404 — ein stiller
    // Ausfall. Fehlt der Dienst zur Laufzeit, antwortet `/api/ready` jetzt mit
    // **503** und nennt den Grund. Ein Ausfall, den man abfragen kann.
    expect(inject).toEqual(['webServer'])
  })
})

describe('readyBody', () => {
  test('nennt die zusätzlichen Felder der geschützten Auskunft', () => {
    const body = readyBody()
    expect(body.bereit).toBe(true)
    expect(body.status).toBe('ok')
    expect(body.prozessSekunden).toBeGreaterThanOrEqual(0)
    expect(body.plattform).toBe(process.platform)
    expect(body.version).toBe(SERVICE_VERSION)
  })
})

describe('abweisung — der Aufruf der Host-Prüfung', () => {
  /** Ein Kontext, dessen `get` einen Dienst liefert oder nicht. */
  function kontextMit(dienst: unknown) {
    return {
      get: (name: string) => (name === 'connection' ? dienst : undefined),
      dienst,
    }
  }

  test('gibt durch, was die Prüfung des Hosts sagt: undefined heißt erlaubt', () => {
    const ctx = kontextMit({ requestRejection: () => undefined })
    expect(abweisung(ctx as never, { host: '127.0.0.1:3080' })).toBeUndefined()
  })

  test('gibt 401 weiter — ohne eigene Deutung', () => {
    const ctx = kontextMit({ requestRejection: () => 401 })
    expect(abweisung(ctx as never, {})).toBe(401)
  })

  test('gibt 403 weiter', () => {
    const ctx = kontextMit({ requestRejection: () => 403 })
    expect(abweisung(ctx as never, {})).toBe(403)
  })

  test('reicht die Kopfdaten der Anfrage unverändert weiter', () => {
    // **Der Kern des Vertrags.** Die Prüfung des Hosts entscheidet anhand der
    // Kopfdaten (Cookie, Host, Origin). Würden wir sie nicht weiterreichen,
    // antwortete sie immer gleich — und zwar falsch.
    const gesehen: unknown[] = []
    const ctx = kontextMit({
      requestRejection: (r: unknown) => {
        gesehen.push(r)
        return undefined
      },
    })
    const kopf = { host: '127.0.0.1:3080', cookie: 'dsh-auth-1=abc' }
    abweisung(ctx as never, kopf)
    expect(gesehen).toHaveLength(1)
    expect((gesehen[0] as { headers: unknown }).headers).toBe(kopf)
  })

  test('fehlender Dienst verweigert mit 503 — nicht durchlassen', () => {
    // **Verweigern statt durchlassen.** Fehlt die Prüfung, ist die sichere
    // Annahme „nicht erlaubt": ein ungeschützter Endpunkt ist der teurere Fehler.
    const ctx = kontextMit(undefined)
    expect(abweisung(ctx as never, {})).toBe(503)
  })

  test('ein Dienst ohne requestRejection verweigert ebenfalls', () => {
    const ctx = kontextMit({ etwasAnderes: true })
    expect(abweisung(ctx as never, {})).toBe(503)
  })
})

describe('macheReadyHandler — die Sperre wirkt', () => {
  /** Eine minimale Antwort-Attrappe. */
  function antwort() {
    const kopf = new Map<string, string>()
    let körper: Buffer | undefined
    return {
      statusCode: 0,
      setHeader: (k: string, v: string) => kopf.set(k.toLowerCase(), v),
      end: (b?: Buffer) => {
        körper = b
      },
      kopf,
      körper: () => körper,
      json: () => JSON.parse(String(körper)) as Record<string, unknown>,
    }
  }

  /** Ein Kontext mit einer Prüfung, die ein festes Ergebnis liefert. */
  function handlerMit(ergebnis: number | undefined) {
    const gefragt: unknown[] = []
    const ctx = {
      get: () => ({
        requestRejection: (r: unknown) => {
          gefragt.push(r)
          return ergebnis
        },
      }),
    }
    return { handler: macheReadyHandler(ctx as never), gefragt }
  }

  test('ohne Anmeldung: 401 mit WWW-Authenticate, kein Inhalt', () => {
    const { handler } = handlerMit(401)
    const res = antwort()
    handler({ method: 'GET', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('unauthenticated')
    expect(res.kopf.get('www-authenticate')).toBe('Cookie')
    // Der Körper enthält **keine** Auskunft — eine Verweigerung, die verrät,
    // was dahinter liegt, ist keine Verweigerung.
    expect(res.json().bereit).toBeUndefined()
  })

  test('fremder Zaun: 403 ohne WWW-Authenticate', () => {
    // Ein 403 heißt „du bist nicht der richtige Aufrufer" — eine Anmeldung
    // würde nicht helfen. Deshalb **kein** `WWW-Authenticate`.
    const { handler } = handlerMit(403)
    const res = antwort()
    handler({ method: 'GET', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('untrusted_origin')
    expect(res.kopf.get('www-authenticate')).toBeUndefined()
  })

  test('fehlende Prüfung: 503, nicht 200', () => {
    const { handler } = handlerMit(503)
    const res = antwort()
    handler({ method: 'GET', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toBe('unavailable')
  })

  test('erlaubt: 200 mit der Bereitschaftsauskunft', () => {
    const { handler } = handlerMit(undefined)
    const res = antwort()
    handler({ method: 'GET', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(res.json().bereit).toBe(true)
  })

  test('die Sperre kommt VOR der Methode — POST ohne Anmeldung ist 401, nicht 405', () => {
    // **Die Reihenfolge ist eine Entscheidung.** Wer nicht angemeldet ist,
    // erfährt nicht, welche Methoden die Adresse kennt. Sonst wäre jede
    // 405-Antwort eine Auskunft an einen Fremden.
    const { handler } = handlerMit(401)
    const res = antwort()
    handler({ method: 'POST', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(401)
    expect(res.kopf.get('allow')).toBeUndefined()
  })

  test('angemeldet, aber falsche Methode: 405 mit Allow', () => {
    const { handler } = handlerMit(undefined)
    const res = antwort()
    handler({ method: 'POST', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(405)
    expect(res.kopf.get('allow')).toBe('GET, HEAD')
  })

  test('angemeldet und HEAD: Kopfdaten ohne Körper', () => {
    const { handler } = handlerMit(undefined)
    const res = antwort()
    handler({ method: 'HEAD', headers: {} } as never, res as never)
    expect(res.statusCode).toBe(200)
    expect(res.körper()).toBeUndefined()
  })

  test('die Prüfung wird bei jeder Anfrage gefragt', () => {
    const { handler, gefragt } = handlerMit(undefined)
    handler({ method: 'GET', headers: {} } as never, antwort() as never)
    handler({ method: 'GET', headers: {} } as never, antwort() as never)
    expect(gefragt).toHaveLength(2)
  })
})

describe('apply — /api/ready über HTTP', () => {
  test('vor dem Einhängen antwortet die Adresse 404', async () => {
    expect((await fetch(aufbau.readyUrl)).status).toBe(404)
  })

  test('ohne Anmeldung antwortet sie 401', async () => {
    aufbau.abweisungMit(401)
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.readyUrl)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Cookie')
  })

  test('mit Anmeldung antwortet sie 200 mit der Bereitschaftsauskunft', async () => {
    aufbau.abweisungMit(undefined)
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.readyUrl)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { bereit: boolean; prozessSekunden: number }
    expect(body.bereit).toBe(true)
    expect(body.prozessSekunden).toBeGreaterThanOrEqual(0)
  })

  test('mit Anmeldung und falscher Methode: 405', async () => {
    aufbau.abweisungMit(undefined)
    aufbau.plugin()
    await ruhe()
    const res = await fetch(aufbau.readyUrl, { method: 'POST' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  test('die offene Auskunft bleibt offen — sie fragt die Sperre gar nicht', async () => {
    // **Das ist der Unterschied der beiden Endpunkte.** `/api/health` muß auch
    // dann antworten, wenn die Anmeldung kaputt ist — sonst könnte keine
    // Erreichbarkeitsprüfung melden, daß die Anmeldung kaputt ist.
    aufbau.abweisungMit(401)
    aufbau.plugin()
    await ruhe()
    expect((await fetch(aufbau.url)).status).toBe(200)
  })

  test('nach dem Abhängen antwortet auch /api/ready wieder 404', async () => {
    aufbau.abweisungMit(undefined)
    const fiber = aufbau.plugin()
    await ruhe()
    expect((await fetch(aufbau.readyUrl)).status).toBe(200)
    await fiber.dispose()
    await ruhe()
    expect((await fetch(aufbau.readyUrl)).status).toBe(404)
  })
})
