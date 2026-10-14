/**
 * Die Anmeldeseite **am Ursprung des Hosts** und die Schnittstelle danach — über einen
 * **echten** Socket.
 *
 * ## Warum diese Datei existiert
 *
 * Der Betreiber hat gefragt, ob die Anmeldung nicht auf **demselben Port** liegen muß wie der
 * Host. Sie muß: unsere Kekse sind `SameSite=Strict`, und ein solcher Keks kommt **nur** bei
 * **derselben Herkunft** an. Auf einem eigenen Port wäre die Anmeldung **still wirkungslos** —
 * grün im Entwicklungsserver (dort leitet ein Proxy weiter), kaputt im Betrieb (dort gibt es
 * keinen).
 *
 * Geprüft wird deshalb, was der **Host** ausliefert: die gebaute Seite unter `/anmeldung` und
 * die Schnittstelle `/start`.
 *
 * ## Warum ein echter Server
 *
 * Dieselbe Begründung wie in `seite.test.ts`: ob Kopfzeilen wirklich auf dem Draht stehen, ob
 * eine falsche Methode abgewiesen wird und ob eine Weiterleitung **wirklich** 303 mit `location`
 * ist, sieht man nur am Socket. Und die **Präfixauflösung** wird hier nachgebaut wie im Kern:
 * *„Longest-prefix-wins over the prefix table after an exact-table miss"*
 * (`dsh-host-webserver/lib/index.js`).
 *
 * ## Die zwei Fallen, die hier geprüft werden
 *
 * 1. **Ausbruch aus dem Verzeichnis.** Ein Auslieferer statischer Dateien ist der klassische
 *    Ort für `../..`. Die Wege werden mit **`http.request`** gefahren, nicht mit `fetch`:
 *    `fetch` **normalisiert** `..` in der Adresse, bevor es sendet — die Prüfung käme dann nie
 *    beim Server an und wäre grün, ohne etwas geprüft zu haben. Gemessen und in der Prüfung
 *    unten als eigener Fall festgehalten.
 * 2. **XSS über den Kontonamen.** `displayName` ist Benutzereingabe und wird **serverseitig**
 *    in HTML gesetzt. Deshalb wird die Renderfunktion **direkt** mit einem Namen gerufen, der
 *    HTML enthält — und über den Socket ein zweites Mal mit einem **echten** Konto.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpAnfrage, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { Argon2PasswordHasher, MemoryRateLimiter } from '@prometheus-harness/auth'
import { KEKS_SPRACHE, VORGABE_SPRACHE, SPRACHEN, texteFuer } from '@prometheus-harness/sprachen'
import { erzeugeSpeicher, type SqlZugang } from '@prometheus-harness/store-postgres'
import { claimAblageImHome } from '../src/claim-ablage.ts'
import {
  ANGABE_BAU,
  PARAMETER_SPRACHE,
  PFAD_ANMELDUNG,
  PFAD_SPRACHEN,
  PFAD_START,
  anmeldungsWege,
  bauVerzeichnis,
  entschaerfe,
  schnittstelleHtml,
  wegBau,
} from '../src/anmeldung.ts'
import { PFAD_SEITE } from '../src/seite.ts'
import { anmelden, type Umgebung } from '../src/wege.ts'

// ---------------------------------------------------------------------------
// Ein Bau zum Prüfen — und ein Geheimnis NEBEN ihm
// ---------------------------------------------------------------------------

/** Ein Wegwerf-Verzeichnis für Bau und Geheimnis. */
const WURZEL = mkdtempSync(join(tmpdir(), 'pmh-anmeldung-'))

/** Der nachgestellte Bau. */
const BAU = join(WURZEL, 'dist')

/** Eine Datei **außerhalb** des Baus — sie darf **nie** ausgeliefert werden. */
const GEHEIM = join(WURZEL, 'geheim.txt')

const GEHEIM_INHALT = 'DIESE-DATEI-DARF-NICHT-AUSGELIEFERT-WERDEN'

beforeAll(() => {
  mkdirSync(join(BAU, 'assets'), { recursive: true })
  writeFileSync(join(BAU, 'index.html'), '<!doctype html><title>Anmeldung — Pruefbau</title>', 'utf8')
  writeFileSync(join(BAU, 'assets', 'app.js'), 'export const x = 1\n', 'utf8')
  writeFileSync(join(BAU, 'assets', 'app.css'), 'body { color: CanvasText }\n', 'utf8')
  writeFileSync(join(BAU, 'assets', 'unbekannt.bin'), '\u0000\u0001', 'utf8')
  writeFileSync(GEHEIM, GEHEIM_INHALT, 'utf8')
})

afterAll(() => {
  rmSync(WURZEL, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Der Prüfserver — mit der Auflösung des Kerns
// ---------------------------------------------------------------------------

/**
 * Sucht den Weg wie der Kern: **erst die genaue Tabelle, dann das längste Präfix**.
 *
 * @param wege - die angemeldeten Wege
 * @param pfad - der angefragte Pfad
 * @returns der zuständige Weg oder `undefined`
 */
function findeWeg(wege: readonly WebRoute[], pfad: string): WebRoute | undefined {
  const genau = wege.find((w) => w.kind === 'exact' && w.path === pfad)
  if (genau !== undefined) return genau
  const praefixe = wege
    .filter((w) => w.kind === 'prefix' && (pfad === w.path || pfad.startsWith(`${w.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)
  return praefixe[0]
}

let server: Server
let basis: string

/**
 * Die Pfade, die der Server **wirklich gesehen** hat.
 *
 * **Wozu das gut ist.** `fetch` räumt `..` aus der Adresse, **bevor** es sendet. Eine Prüfung,
 * die nur den Status vergleicht, kann deshalb nicht zeigen, ob der Ausbruch überhaupt beim
 * Server ankam. Diese Liste zeigt es wörtlich: was `fetch` schickt und was ein roher Aufruf
 * schickt, ist **nicht dasselbe**.
 */
const GESEHEN: string[] = []

/** Startet einen Server mit den gegebenen Wegen. */
async function starteServer(wege: readonly WebRoute[]): Promise<{ server: Server; basis: string }> {
  const s = createServer((req: IncomingMessage, res: ServerResponse) => {
    GESEHEN.push(req.url ?? '/')
    const pfad = (req.url ?? '/').split('?')[0] ?? '/'
    const treffer = findeWeg(wege, pfad)
    if (treffer === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('nicht gefunden')
      return
    }
    void Promise.resolve(treffer.handler(req, res)).catch(() => {
      try {
        res.writeHead(500)
        res.end()
      } catch {
        // Der Socket kann schon zu sein.
      }
    })
  })
  await new Promise<void>((fertig) => s.listen(0, '127.0.0.1', fertig))
  return { server: s, basis: `http://127.0.0.1:${String((s.address() as AddressInfo).port)}` }
}

/** Eine Sitzungsumgebung, die nur den Fall „kein Keks" fahren muß (der Speicher wird nicht berührt). */
function umgebungOhneSpeicher(): Umgebung {
  return {
    speicher: undefined as never,
    hasher: new Argon2PasswordHasher(),
    limiter: new MemoryRateLimiter(),
    sicher: false,
    maxUsers: undefined,
    jetzt: () => new Date(),
    warten: async () => undefined,
    home: WURZEL,
    claimAblage: claimAblageImHome(WURZEL),
  }
}

/** Fragt einen Pfad **roh** an — ohne die Normalisierung, die `fetch` vornimmt. */
async function roh(pfad: string): Promise<{ status: number; koerper: string; koepfe: Record<string, string | string[] | undefined> }> {
  return await new Promise((fertig, scheitern) => {
    const anfrage = httpAnfrage(
      { host: '127.0.0.1', port: Number(new URL(basis).port), path: pfad, method: 'GET' },
      (antwort) => {
        const stuecke: Buffer[] = []
        antwort.on('data', (s: Buffer) => stuecke.push(s))
        antwort.on('end', () => {
          fertig({ status: antwort.statusCode ?? 0, koerper: Buffer.concat(stuecke).toString('utf8'), koepfe: antwort.headers })
        })
      },
    )
    anfrage.on('error', scheitern)
    anfrage.end()
  })
}

beforeAll(async () => {
  const gebaut = await starteServer(anmeldungsWege(umgebungOhneSpeicher(), BAU))
  server = gebaut.server
  basis = gebaut.basis
})

afterAll(async () => {
  await new Promise<void>((fertig) => server.close(() => fertig()))
})

// ---------------------------------------------------------------------------
// 1. Die Seite kommt vom Host
// ---------------------------------------------------------------------------

describe('Die gebaute Anmeldeseite wird vom Host ausgeliefert', () => {
  test('unter `/anmeldung` und `/anmeldung/` — beide 200, beide HTML', async () => {
    for (const pfad of [PFAD_ANMELDUNG, `${PFAD_ANMELDUNG}/`]) {
      const antwort = await fetch(`${basis}${pfad}`)
      expect(antwort.status).toBe(200)
      expect(antwort.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(await antwort.text()).toContain('Pruefbau')
    }
  })

  test('die Kopfzeilen stehen so auf dem Draht, wie sie gemeint sind', async () => {
    const antwort = await fetch(`${basis}${PFAD_ANMELDUNG}/`)
    const csp = antwort.headers.get('content-security-policy') ?? ''
    // **Wörtlich geprüft, nicht „enthält irgendwas".** Eine aufgeweichte Richtlinie soll
    // auffallen und nicht durchgehen.
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('unsafe-eval')
    expect(antwort.headers.get('x-content-type-options')).toBe('nosniff')
    expect(antwort.headers.get('x-frame-options')).toBe('DENY')
    expect(antwort.headers.get('referrer-policy')).toBe('no-referrer')
    expect(antwort.headers.get('cache-control')).toBe('no-store')
  })

  test('die Bündel liegen unter dem Präfix und haben den richtigen Typ', async () => {
    const js = await fetch(`${basis}${PFAD_ANMELDUNG}/assets/app.js`)
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    const css = await fetch(`${basis}${PFAD_ANMELDUNG}/assets/app.css`)
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  test('ein unbekannter Typ wird NICHT geraten — und nicht als HTML gedeutet', async () => {
    // **Der Grund für die feste Tabelle.** Ein geratener Typ wäre der Weg, auf dem aus einer
    // Textdatei ausführbarer Code wird.
    const antwort = await fetch(`${basis}${PFAD_ANMELDUNG}/assets/unbekannt.bin`)
    expect(antwort.status).toBe(200)
    expect(antwort.headers.get('content-type')).toBe('application/octet-stream')
    expect(antwort.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('eine falsche Methode wird abgewiesen — POST ergibt 405', async () => {
    const antwort = await fetch(`${basis}${PFAD_ANMELDUNG}/`, { method: 'POST' })
    expect(antwort.status).toBe(405)
    expect(antwort.headers.get('allow')).toContain('GET')
  })
})

// ---------------------------------------------------------------------------
// 2. Kein Ausbruch aus dem Verzeichnis
// ---------------------------------------------------------------------------

describe('Der Auslieferer bleibt im Bauverzeichnis', () => {
  test('`..` im Pfad liest nichts außerhalb — die Datei daneben bleibt unerreichbar', async () => {
    const antwort = await roh(`${PFAD_ANMELDUNG}/../geheim.txt`)
    expect(antwort.koerper).not.toContain(GEHEIM_INHALT)
  })

  test('auch kodiert (`%2e%2e%2f`) und über Unterverzeichnisse kommt niemand heraus', async () => {
    for (const pfad of [
      `${PFAD_ANMELDUNG}/%2e%2e%2fgeheim.txt`,
      `${PFAD_ANMELDUNG}/assets/%2e%2e/%2e%2e/geheim.txt`,
      `${PFAD_ANMELDUNG}/..%5Cgeheim.txt`,
      `${PFAD_ANMELDUNG}/%00geheim.txt`,
    ]) {
      const antwort = await roh(pfad)
      expect({ pfad, inhalt: antwort.koerper.includes(GEHEIM_INHALT) }).toEqual({ pfad, inhalt: false })
    }
  })

  test('GEGENPROBE: `fetch` normalisiert `..` selbst — deshalb wird roh angefragt', async () => {
    // Ohne diesen Fall wäre die Prüfung oben **wertlos**: `fetch` löst `..` in der Adresse auf,
    // bevor es sendet. Der Server sähe den Ausbruch nie, und die Prüfung wäre grün, ohne etwas
    // geprüft zu haben. Der Unterschied wird hier **wörtlich** gezeigt: an dem Pfad, den der
    // Server gesehen hat — nicht an einem Status, der aus zwei Gründen 404 sein kann.
    GESEHEN.length = 0
    await fetch(`${basis}${PFAD_ANMELDUNG}/../geheim.txt`)
    const vomFetch = GESEHEN.at(-1)

    GESEHEN.length = 0
    await roh(`${PFAD_ANMELDUNG}/../geheim.txt`)
    const vomRoh = GESEHEN.at(-1)

    expect(vomFetch).toBe('/geheim.txt')
    expect(vomRoh).toBe(`${PFAD_ANMELDUNG}/../geheim.txt`)
  })

  test('eine fehlende Datei mit Endung ergibt 404 — nicht die Startseite', async () => {
    const antwort = await roh(`${PFAD_ANMELDUNG}/assets/gibtsnicht.js`)
    expect(antwort.status).toBe(404)
  })

  test('ohne Bau wird auf die EINGEBAUTE Seite umgeleitet — 303, mit Ziel', async () => {
    // **Kein 404 und kein 503.** Die Anmeldung darf nicht daran scheitern, daß niemand
    // `bun run build` gerufen hat: die eingebaute Seite ist geprüft und braucht keinen Bau.
    const ohne = await starteServer([{ kind: 'prefix', path: PFAD_ANMELDUNG, handler: wegBau(join(WURZEL, 'gibt-es-nicht')) }])
    try {
      // **`redirect: 'manual'` ist hier Pflicht.** Ohne das folgt `fetch` der 303 und landet auf
      // `/pmh/anmelden` — ein anderer Weg, den dieser kleine Server nicht kennt, und die Prüfung
      // bekäme **404** statt **303** zu sehen. Gemessen, nicht vermutet.
      const antwort = await fetch(`${ohne.basis}${PFAD_ANMELDUNG}/`, { redirect: 'manual' })
      expect(antwort.status).toBe(303)
      expect(antwort.headers.get('location')).toBe(PFAD_SEITE)
    } finally {
      await new Promise<void>((fertig) => ohne.server.close(() => fertig()))
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Die Schnittstelle danach
// ---------------------------------------------------------------------------

describe('Die Schnittstelle `/start`', () => {
  test('ohne Sitzung wird auf die Anmeldeseite umgeleitet — 303', async () => {
    const antwort = await fetch(`${basis}${PFAD_START}`, { redirect: 'manual' })
    expect(antwort.status).toBe(303)
    expect(antwort.headers.get('location')).toBe(`${PFAD_ANMELDUNG}/`)
  })

  // **Ein „erfundenes Token" wird hier NICHT geprüft.** Ohne Keks antwortet der Weg, *bevor*
  // der Speicher gefragt wird; mit Keks braucht es einen echten. Eine Prüfung, die „303 **oder**
  // 500" zuläßt, behauptet nichts — der Fall steht unten mit einer echten Datenbank.
})

// ---------------------------------------------------------------------------
// Die Sprache — die Liste, der Wechsel, die englische Seite
// ---------------------------------------------------------------------------

describe('Die angebotenen Sprachen', () => {
  test('die Liste kommt vom Rechner — nicht aus der Seite', async () => {
    const antwort = await fetch(`${basis}${PFAD_SPRACHEN}`)
    expect(antwort.status).toBe(200)
    const koerper = (await antwort.json()) as {
      readonly ok?: boolean
      readonly value?: { readonly sprachen?: readonly { readonly id: string }[]; readonly vorgabe?: string }
    }
    expect(koerper.ok).toBe(true)
    expect(koerper.value?.vorgabe).toBe(VORGABE_SPRACHE)
    expect(koerper.value?.sprachen?.map((s) => s.id)).toEqual(SPRACHEN.map((s) => s.id))
  })

  test('eine andere Methode wird abgewiesen', async () => {
    const antwort = await fetch(`${basis}${PFAD_SPRACHEN}`, { method: 'POST' })
    expect(antwort.status).toBe(405)
  })
})

describe('Der Sprachwechsel auf `/start`', () => {
  test('`?sprache=en` setzt den Keks und leitet auf `/start` zurück', async () => {
    const antwort = await fetch(`${basis}${PFAD_START}?${PARAMETER_SPRACHE}=en`, { redirect: 'manual' })
    expect(antwort.status).toBe(303)
    expect(antwort.headers.get('location')).toBe(PFAD_START)
    const keks = antwort.headers.get('set-cookie') ?? ''
    expect(keks).toContain(`${KEKS_SPRACHE}=en`)
    expect(keks).toContain('Path=/')
    // **`SameSite=Strict` wie die anderen Kekse.** Der Keks verläßt den Ursprung nicht.
    expect(keks).toContain('SameSite=Strict')
  })

  test('eine erfundene Sprache setzt NICHTS', async () => {
    const antwort = await fetch(`${basis}${PFAD_START}?${PARAMETER_SPRACHE}=klingonisch`, { redirect: 'manual' })
    expect(antwort.status).toBe(303)
    // Ohne Sitzung geht es zur Anmeldeseite — und ein Keks mit einer erfundenen Sprache
    // entsteht gar nicht erst.
    expect(antwort.headers.get('location')).toBe(`${PFAD_ANMELDUNG}/`)
    expect(antwort.headers.get('set-cookie')).toBeNull()
  })
})

describe('Die Schnittstelle in beiden Sprachen', () => {
  test('englische Texte werden wirklich benutzt', () => {
    const html = schnittstelleHtml({ email: 'ada@example.org' }, texteFuer('en'), 'en')
    expect(html).toContain('Signed in')
    expect(html).toContain('lang="en"')
    expect(html).not.toContain('>Angemeldet<')
  })

  test('der Umschalter ist aus LINKS gebaut — kein Skript auf der Seite', () => {
    const html = schnittstelleHtml({ email: 'ada@example.org' }, texteFuer('de'), 'de')
    expect(html).toContain(`${PFAD_START}?${PARAMETER_SPRACHE}=en`)
    expect(html).not.toContain('<script')
    // Die gewählte Sprache steht als Text da, nicht als Link auf sich selbst.
    expect(html).toContain('<strong>Deutsch</strong>')
  })

  test('eine Sprachkennung mit HTML wird entschärft', () => {
    // Die Kennung kommt aus dem Keks und damit vom Aufrufer — sie wird im `lang`-Attribut
    // ausgegeben und darf dort nichts anrichten.
    const html = schnittstelleHtml({ email: 'ada@example.org' }, texteFuer('de'), '<script>boese()</script>')
    expect(html).not.toContain('<script>boese()')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('Der Entschärfer für HTML', () => {  test('entschärft die fünf Zeichen, die zählen', () => {
    expect(entschaerfe('<script>"x" & \'y\'</script>')).toBe('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;')
  })

  test('das kaufmännische Und zuerst — sonst würden die eigenen Ersetzungen ersetzt', () => {
    expect(entschaerfe('&lt;')).toBe('&amp;lt;')
  })

  test('ohne Angabe kommt leerer Text — nicht „undefined"', () => {
    expect(entschaerfe(undefined)).toBe('')
    expect(entschaerfe('')).toBe('')
  })
})

describe('Die Schnittstelle entschärft den Kontonamen', () => {
  const ANGRIFF = '<img src=x onerror="alert(1)">'

  test('ein Name mit HTML kommt entschärft an — und NIE als Tag', () => {
    const html = schnittstelleHtml({ email: 'ada@example.org', displayName: ANGRIFF, role: 'admin' })
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    // Auch nicht über den Umweg eines Attributs: die Anführungszeichen sind entschärft.
    expect(html).not.toContain('onerror="alert(1)"')
  })

  test('die Rolle wird ebenso entschärft', () => {
    const html = schnittstelleHtml({ email: 'a@b.invalid', role: '<b>admin</b>' })
    expect(html).not.toContain('<b>admin</b>')
    expect(html).toContain('&lt;b&gt;admin&lt;/b&gt;')
  })

  test('die Seite hat KEIN Skript — deshalb darf die Richtlinie es verbieten', () => {
    const html = schnittstelleHtml({ email: 'ada@example.org' })
    expect(html).not.toContain('<script')
  })

  test('der Token steht NICHT auf der Seite — und die Seite sagt, warum', () => {
    const html = schnittstelleHtml({ email: 'ada@example.org' })
    expect(html).toContain('Zwei Türen, noch nicht verbunden')
    // Kein Wort, das nach einem ausgegebenen Geheimnis aussieht.
    expect(html.toLowerCase()).not.toContain('token=')
  })
})

describe('Wo der Bau gesucht wird', () => {
  test('ohne Angabe unter `apps/login_web/dist` im Arbeitsverzeichnis', () => {
    expect(bauVerzeichnis({})).toBe(join(process.cwd(), 'apps', 'login_web', 'dist'))
  })

  test('mit `PMH_ANMELDUNG_BAU` dort, wo die Angabe hinzeigt', () => {
    expect(bauVerzeichnis({ [ANGABE_BAU]: WURZEL })).toBe(WURZEL)
  })

  test('eine leere Angabe zählt NICHT — sie ist kein Ort', () => {
    expect(bauVerzeichnis({ [ANGABE_BAU]: '   ' })).toBe(join(process.cwd(), 'apps', 'login_web', 'dist'))
  })
})

// ---------------------------------------------------------------------------
// 4. Mit einer ECHTEN Sitzung — gegen eine echte Datenbank
// ---------------------------------------------------------------------------

const AUS_ENV = process.env.PMH_TEST_DATABASE_URL
const DA = AUS_ENV !== undefined && AUS_ENV.trim() !== '' ? AUS_ENV : undefined

/**
 * Zeigt die Prüfadresse auf **dieselbe Datenbank** wie die Anwendung?
 *
 * **Warum das hier steht.** In `.env` zeigt `PMH_TEST_DATABASE_URL` auf die
 * **Betriebsdatenbank** `pmh` (gemessen: beide `…:5432/pmh`, nur die Rolle unterscheidet sich).
 * Ein Aufruf aus der Wurzel schreibt damit in die Datenbank des Betreibers. Die zerstörenden
 * Prüfungen **brechen** deshalb ab (`packages/auth/db-schema/tests/postgres.test.ts`).
 *
 * Diese Prüfung **bricht nicht ab, sie überspringt**: sie legt ein Konto mit eigener Adresse an
 * und löscht es wieder — sie räumt nichts ab. Ein Abbruch wäre hier eine rote Prüfung ohne
 * Schaden; ein Überspringen mit Begründung sagt die Wahrheit: **kein Beweis**.
 *
 * Die Gegenprobe gehört dazu: mit dem Rezept aus
 * `docs/status/anmeldeseite-und-erstlogin.md` §7 (`…/pmh_test`) läuft sie und beweist.
 */
function zeigtAufBetriebsdatenbank(): boolean {
  if (DA === undefined) return false
  const betrieb = process.env.DATABASE_URL
  if (betrieb === undefined || betrieb.trim() === '') return false
  try {
    return new URL(betrieb).pathname === new URL(DA).pathname
  } catch {
    // Eine unlesbare Adresse ist kein Grund zu schreiben — im Zweifel überspringen.
    return true
  }
}

const aufBetrieb = zeigtAufBetriebsdatenbank()

if (DA === undefined) {
  process.stderr.write(
    'HINWEIS: Die Sitzungsprüfungen der Schnittstelle übersprungen — PMH_TEST_DATABASE_URL ist nicht gesetzt.\n' +
      '  Was hier fehlt, ist der Beweis, daß `/start` mit einem echten Konto den Namen zeigt — entschärft.\n',
  )
} else if (aufBetrieb) {
  process.stderr.write(
    'HINWEIS: Die Sitzungsprüfungen der Schnittstelle übersprungen — PMH_TEST_DATABASE_URL zeigt auf die\n' +
      '  BETRIEBSDATENBANK (dieselbe wie DATABASE_URL). Diese Prüfung legt ein Konto an; sie schreibt nicht\n' +
      "  in die Datenbank des Betreibers. Mit einer Wegwerf-Datenbank:\n" +
      "    $env:PMH_TEST_DATABASE_URL = <MIGRATION_DATABASE_URL mit '/pmh_test' statt '/pmh'>\n",
  )
}
const mitDatenbank = DA === undefined || aufBetrieb ? describe.skip : describe

/** Die Adresse des Prüfkontos — eigene Domäne, damit nichts Fremdes getroffen wird. */
const ADRESSE = 'schnittstelle@schnittstelle.invalid'
const PASSWORT = 'Schnittstelle-ist-kein-Zufall-2026'
const NAME = '<img src=x onerror="alert(1)">Schnittstelle'

mitDatenbank('Mit einem echten Konto', () => {
  let sql: postgres.Sql
  let umg: Umgebung
  let token = ''
  let einer: { server: Server; basis: string }

  beforeAll(async () => {
    // **Der Riegel steht auch hier** — nicht nur beim Überspringen oben. Wer diese Datei
    // umbaut (etwa die Bedingung entfernt), soll nicht versehentlich in die Betriebsdatenbank
    // schreiben; der Typverengung wegen steht er ohnehin hier.
    if (DA === undefined || aufBetrieb) return
    sql = postgres(DA, { max: 2, onnotice: () => undefined })
    const zugang: SqlZugang = {
      async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
        return await sql.unsafe(anweisung, werte as never[])
      },
    }
    umg = { ...umgebungOhneSpeicher(), speicher: erzeugeSpeicher(zugang) }

    // **Den Zustand direkt herstellen, nicht über den Weg.** Den Weg zu benutzen, den die
    // Prüfung prüft, wäre ein Zirkel (dieselbe Begründung wie in `erstlogin.test.ts`).
    await sql.unsafe('DELETE FROM users WHERE email = $1', [ADRESSE]).catch(() => undefined)
    const hash = await umg.hasher.hash(PASSWORT)
    const kennung = await umg.speicher.benutzer.create({
      id: crypto.randomUUID(),
      email: ADRESSE,
      passwordHash: hash,
      displayName: NAME,
      role: 'user',
    })
    expect(kennung).toBeDefined()

    // Und anmelden — über den **echten** Weg, damit das Sitzungstoken echt ist.
    const antwort = await anmelden(umg, { email: ADRESSE, password: PASSWORT, userAgent: 'pruefung', ip: '127.0.0.1' })
    expect(antwort.status).toBe(200)
    const kekse = antwort.koepfe['set-cookie']
    const liste = Array.isArray(kekse) ? kekse : [kekse ?? '']
    const sitzung = liste.find((k) => k.startsWith('pmh_session='))
    token = (sitzung ?? '').split(';')[0]?.slice('pmh_session='.length) ?? ''
    expect(token).not.toBe('')

    einer = await starteServer(anmeldungsWege(umg, BAU))
  })

  afterAll(async () => {
    await new Promise<void>((fertig) => einer.server.close(() => fertig()))
    await sql.unsafe('DELETE FROM users WHERE email = $1', [ADRESSE]).catch(() => undefined)
    await sql.end({ timeout: 5 })
  })

  test('mit gültiger Sitzung zeigt `/start` das Konto — und den Namen ENTschärft', async () => {
    const antwort = await fetch(`${einer.basis}${PFAD_START}`, { headers: { cookie: `pmh_session=${token}` } })
    expect(antwort.status).toBe(200)
    const html = await antwort.text()
    expect(html).toContain('Angemeldet')
    expect(html).toContain(ADRESSE)
    // **Der Kern dieser Prüfung:** derselbe Name, der oben als Angriff diente, kommt durch die
    // ganze Kette (Datenbank → Sitzung → HTML) und ist dort **Text**, kein Tag.
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  test('mit englischem Keks zeigt `/start` die englische Seite — mit echtem Konto', async () => {
    const antwort = await fetch(`${einer.basis}${PFAD_START}`, {
      headers: { cookie: `pmh_session=${token}; ${KEKS_SPRACHE}=en` },
    })
    expect(antwort.status).toBe(200)
    const html = await antwort.text()
    expect(html).toContain('Signed in')
    expect(html).toContain(ADRESSE)
    expect(html).not.toContain('>Angemeldet<')
  })

  test('ein erfundenes Token führt auch mit echter Datenbank zur Anmeldeseite', async () => {
    const antwort = await fetch(`${einer.basis}${PFAD_START}`, {
      headers: { cookie: 'pmh_session=00000000-0000-4000-8000-000000000000' },
      redirect: 'manual',
    })
    expect(antwort.status).toBe(303)
    expect(antwort.headers.get('location')).toBe(`${PFAD_ANMELDUNG}/`)
  })
})
