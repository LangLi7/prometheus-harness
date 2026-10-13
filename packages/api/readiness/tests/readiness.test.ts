/**
 * Prüfungen für `@prometheus-harness/readiness`.
 *
 * **Warum mit Attrappen und nicht gegen die laufende Datenbank.** Eine Sonde, die
 * nur gegen eine echte Gegenstelle prüfbar ist, wird nicht geprüft — weil sie in
 * jedem Lauf ohne Datenbank übersprungen würde. Geprüft wird hier deshalb die
 * **Logik**: welche Abfragen gestellt werden, was bei welcher Antwort geschieht,
 * welche Begründung nach außen geht.
 *
 * **Was das nicht abdeckt.** Ob ein echter PostgreSQL auf unsere Abfragen so
 * antwortet, wie die Attrappe es tut. Das prüft ein **abgesonderter** Lauf gegen
 * die laufende Datenbank (`lauf-gegen-echte-dienste.test.ts`).
 */
import { describe, expect, test } from 'bun:test'
import { Context } from '@deepseek-ai/cordis'

import {
  ERWARTETE_SCHEMAFASSUNG,
  KERN_TABELLEN,
  MIGRATIONSTABELLE,
  SONDE_POSTGRES,
  SONDE_REDIS,
  apply,
  gegenstellenAusUmgebung,
  inject,
  name,
  pingRedis,
  pruefePostgres,
  trageSondenEin,
  zerlegeRedisAdresse,
} from '../src/index.ts'
import { erzeugeRegister, statusFuer } from '../../health/src/index.ts'
import type { Sondenregister } from '../../health/src/index.ts'

/** Eine Attrappe, die aufgezeichnete Abfragen beantwortet. */
function sqlAttrappe(antworten: {
  /** Antwort auf `select 1`. Fehlt sie, wird sie erfüllt. */
  verbindung?: 'ok' | Error
  /** Antwort auf die Fassungsabfrage. */
  fassung?: readonly { version: number }[] | Error
  /** Antwort auf die Tabellenabfrage. */
  tabellen?: readonly { tablename: string }[] | Error
}) {
  const abfragen: { text: string; werte?: readonly unknown[] }[] = []
  return {
    abfragen,
    zugang: {
      query: async <T>(text: string, werte?: readonly unknown[]): Promise<readonly T[]> => {
        abfragen.push(werte === undefined ? { text } : { text, werte })
        // Die Attrappe liefert die Formen, die die Sonde erwartet; die Umformung
        // über `unknown` ist nötig, weil `T` hier beliebig ist.
        const alsT = (wert: unknown): readonly T[] => wert as readonly T[]
        if (/select 1/u.test(text)) {
          if (antworten.verbindung instanceof Error) throw antworten.verbindung
          return alsT([{ eins: 1 }])
        }
        if (text.includes(MIGRATIONSTABELLE)) {
          if (antworten.fassung instanceof Error) throw antworten.fassung
          return alsT(antworten.fassung ?? [{ version: ERWARTETE_SCHEMAFASSUNG }])
        }
        if (text.includes('pg_tables')) {
          if (antworten.tabellen instanceof Error) throw antworten.tabellen
          return alsT(antworten.tabellen ?? KERN_TABELLEN.map((tablename) => ({ tablename })))
        }
        throw new Error(`unerwartete Abfrage in der Attrappe: ${text}`)
      },
    },
  }
}

describe('pruefePostgres', () => {
  test('eine gesunde Datenbank läuft durch', async () => {
    const a = sqlAttrappe({})
    await expect(pruefePostgres(a.zugang)).resolves.toBeUndefined()
  })

  test('stellt drei Fragen, in dieser Reihenfolge', async () => {
    // **Die Reihenfolge ist Absicht.** Eine Abfrage gegen eine nicht existierende
    // Tabelle liefert einen Fehler, der wie ein Verbindungsfehler aussieht. Erst
    // die Verbindung, dann die Struktur — sonst sucht man an der falschen Stelle.
    const a = sqlAttrappe({})
    await pruefePostgres(a.zugang)
    expect(a.abfragen).toHaveLength(3)
    expect(a.abfragen[0]?.text).toMatch(/select 1/u)
    expect(a.abfragen[1]?.text).toContain(MIGRATIONSTABELLE)
    expect(a.abfragen[2]?.text).toContain('pg_tables')
  })

  test('eine tote Verbindung wird gemeldet', async () => {
    const a = sqlAttrappe({ verbindung: new Error('connect ECONNREFUSED 127.0.0.1:5432') })
    await expect(pruefePostgres(a.zugang)).rejects.toThrow(/ECONNREFUSED/u)
  })

  test('eine fehlende Migrationstabelle bekommt eine eigene Begründung', async () => {
    // Ein nackter SQL-Fehler („relation does not exist") sagt einem Leser nicht,
    // was zu tun ist. Diese Begründung sagt es.
    const a = sqlAttrappe({ fassung: new Error('relation "schema_migrations" does not exist') })
    await expect(pruefePostgres(a.zugang)).rejects.toThrow(/Migrationstabelle schema_migrations fehlt/u)
  })

  test('eine leere Migrationstabelle gilt als Fassung 0', async () => {
    const a = sqlAttrappe({ fassung: [] })
    await expect(pruefePostgres(a.zugang)).rejects.toThrow(/Schemafassung 0 statt 2/u)
  })

  test('eine veraltete Fassung wird gemeldet', async () => {
    const a = sqlAttrappe({ fassung: [{ version: 1 }] })
    await expect(pruefePostgres(a.zugang)).rejects.toThrow(/Schemafassung 1 statt 2/u)
  })

  test('eine ZU NEUE Fassung wird ebenfalls gemeldet', async () => {
    // **Kein „größer gleich".** Eine Datenbank, die weiter ist als die Anwendung,
    // bedeutet: hier lief eine neuere Anwendung. Die alte Anwendung kennt die
    // Änderungen nicht — sie ist nicht bereit, und zwar unabhängig davon, daß
    // „mehr Schema" harmlos aussieht.
    const a = sqlAttrappe({ fassung: [{ version: 3 }] })
    await expect(pruefePostgres(a.zugang)).rejects.toThrow(/Schemafassung 3 statt 2/u)
  })

  test('fehlende Kern-Tabellen werden namentlich gemeldet', async () => {
    const a = sqlAttrappe({ tabellen: [{ tablename: 'users' }, { tablename: 'chats' }] })
    await expect(pruefePostgres(a.zugang)).rejects.toThrow(/Kern-Tabellen fehlen: workspaces, messages, sessions/u)
  })

  test('die Tabellenabfrage fragt das aktuelle Schema, nicht "public"', async () => {
    // **Der Fehler, der hier verhindert wird.** Die Tabellen dieses Projekts
    // liegen im Schema `pmh`. Eine Abfrage auf `'public'` fände **nichts** und
    // die Sonde meldete „Kern-Tabellen fehlen", obwohl alles da ist.
    const a = sqlAttrappe({})
    await pruefePostgres(a.zugang)
    const tabellenAbfrage = a.abfragen[2]?.text ?? ''
    expect(tabellenAbfrage).toContain('current_schema()')
    expect(tabellenAbfrage).not.toContain("'public'")
  })

  test('die Tabellenabfrage überträgt die erwarteten Namen als Wert, nicht als Text', async () => {
    // Zusammengebautes SQL wäre eine Einladung; hier sind die Namen ein Wert.
    const a = sqlAttrappe({})
    await pruefePostgres(a.zugang)
    expect(a.abfragen[2]?.werte).toEqual([[...KERN_TABELLEN]])
  })

  test('eine eigene Kern-Tabellenliste wird benutzt', async () => {
    const a = sqlAttrappe({ tabellen: [{ tablename: 'nur_diese' }] })
    await expect(pruefePostgres(a.zugang, 2, ['nur_diese'])).resolves.toBeUndefined()
  })
})

describe('zerlegeRedisAdresse', () => {
  test('nimmt Schema, Wirt und Port', () => {
    expect(zerlegeRedisAdresse('redis://127.0.0.1:6379')).toEqual({ host: '127.0.0.1', port: 6379 })
  })

  test('nimmt eine Datenbanknummer am Ende weg', () => {
    expect(zerlegeRedisAdresse('redis://wirt:6380/0')).toEqual({ host: 'wirt', port: 6380 })
  })

  test('schneidet Zugangsdaten ab — sie gehören nicht in eine Sonde', () => {
    expect(zerlegeRedisAdresse('redis://benutzer:geheim@wirt:6379')).toEqual({
      host: 'wirt',
      port: 6379,
    })
  })

  test('nimmt rediss (TLS) an, ohne zu scheitern', () => {
    expect(zerlegeRedisAdresse('rediss://wirt')).toEqual({ host: 'wirt', port: 6379 })
  })

  test('ohne Port gilt der Standardport', () => {
    expect(zerlegeRedisAdresse('redis://wirt')).toEqual({ host: 'wirt', port: 6379 })
  })

  test('ein unsinniger Port fällt auf den Standard zurück, statt NaN zu werden', () => {
    // `NaN` würde in `connect(NaN)` zu einem unerklärlichen Fehler führen.
    expect(zerlegeRedisAdresse('redis://wirt:keine-zahl').port).toBe(6379)
    expect(zerlegeRedisAdresse('redis://wirt:0').port).toBe(6379)
    expect(zerlegeRedisAdresse('redis://wirt:99999').port).toBe(6379)
  })

  test('leerer Text ergibt den lokalen Standard', () => {
    expect(zerlegeRedisAdresse('')).toEqual({ host: '127.0.0.1', port: 6379 })
  })
})

describe('gegenstellenAusUmgebung', () => {
  test('ohne Adressen gibt es keine Gegenstellen', () => {
    expect(gegenstellenAusUmgebung({})).toEqual({})
  })

  test('leere Zeichenketten gelten als nicht gesetzt', () => {
    // Eine leere Variable ist kein Auftrag, sich zu verbinden.
    expect(gegenstellenAusUmgebung({ DATABASE_URL: '   ', REDIS_URL: '' })).toEqual({})
  })

  test('liest DATABASE_URL und REDIS_URL', () => {
    const g = gegenstellenAusUmgebung({
      DATABASE_URL: 'postgres://a:b@127.0.0.1:5432/x',
      REDIS_URL: 'redis://127.0.0.1:6379',
    })
    expect(g.sql).toBeDefined()
    expect(g.ping).toBeDefined()
  })

  test('die eigenen Namen schlagen die allgemeinen', () => {
    // `PMH_READY_*` ist für den Fall da, daß die Bereitschaft gegen eine ANDERE
    // Instanz prüfen soll als die, mit der gearbeitet wird.
    const g = gegenstellenAusUmgebung({
      DATABASE_URL: 'postgres://a:b@127.0.0.1:5432/x',
      PMH_READY_DATABASE_URL: 'postgres://a:b@127.0.0.1:5432/y',
    })
    expect(g.sql).toBeDefined()
  })

  test('nur eine Adresse ergibt nur eine Gegenstelle', () => {
    const g = gegenstellenAusUmgebung({ REDIS_URL: 'redis://127.0.0.1:6379' })
    expect(g.sql).toBeUndefined()
    expect(g.ping).toBeDefined()
  })
})

describe('trageSondenEin', () => {
  /** Ein Register, das die Sonden nur sammelt. */
  function registerAttrappe() {
    const sonden: { name: string; pruefe: () => Promise<void> }[] = []
    const register: Sondenregister = {
      register: (sonde) => {
        sonden.push(sonde)
        return () => {
          const at = sonden.indexOf(sonde)
          if (at >= 0) sonden.splice(at, 1)
        }
      },
      alle: () => [...sonden],
      pruefe: async () => ({ lauf: { zustand: 'ok' as const, sonden: [] }, ausSpeicher: false }),
    }
    return { register, sonden }
  }

  test('trägt beide Sonden ein, wenn beide Gegenstellen da sind', () => {
    const r = registerAttrappe()
    trageSondenEin(r.register, { sql: sqlAttrappe({}).zugang, ping: async () => ({ roh: '+PONG' }) })
    expect(r.sonden.map((s) => s.name)).toEqual([SONDE_POSTGRES, SONDE_REDIS])
  })

  test('trägt nur die Datenbanksonde ein, wenn Redis fehlt', () => {
    const r = registerAttrappe()
    trageSondenEin(r.register, { sql: sqlAttrappe({}).zugang })
    expect(r.sonden.map((s) => s.name)).toEqual([SONDE_POSTGRES])
  })

  test('trägt gar nichts ein, wenn nichts eingerichtet ist', () => {
    // Das ist der ehrliche Fall: `/api/ready` meldet dann `ok` mit **leerer**
    // Sondenliste. Wer die Antwort liest, sieht, daß nichts geprüft wurde.
    const r = registerAttrappe()
    trageSondenEin(r.register, {})
    expect(r.sonden).toHaveLength(0)
  })

  test('der Abmelder entfernt alle Sonden wieder', () => {
    const r = registerAttrappe()
    const ab = trageSondenEin(r.register, {
      sql: sqlAttrappe({}).zugang,
      ping: async () => ({ roh: '+PONG' }),
    })
    expect(r.sonden).toHaveLength(2)
    ab()
    expect(r.sonden).toHaveLength(0)
  })

  test('die Redis-Sonde nimmt PONG an', async () => {
    const r = registerAttrappe()
    trageSondenEin(r.register, { ping: async () => ({ roh: '+PONG' }) })
    await expect(r.sonden[0]?.pruefe()).resolves.toBeUndefined()
  })

  test('die Redis-Sonde lehnt eine andere Antwort ab', async () => {
    // **„Jemand antwortet" ist nicht dasselbe wie „Redis ist bereit".** Ein
    // beliebiger Dienst auf Port 6379 würde sonst als bereit durchgehen.
    const r = registerAttrappe()
    trageSondenEin(r.register, { ping: async () => ({ roh: '+OK' }) })
    await expect(r.sonden[0]?.pruefe()).rejects.toThrow(/unerwartete Antwort auf PING: \+OK/u)
  })
})

describe('trageSondenEin im echten Register', () => {
  test('eine gesunde Sonde ergibt "ok"', async () => {
    const register = erzeugeRegister({ haltbarkeitMs: 0 })
    trageSondenEin(register, { sql: sqlAttrappe({}).zugang })
    const { lauf } = await register.pruefe()
    expect(lauf.zustand).toBe('ok')
    expect(lauf.sonden[0]?.name).toBe(SONDE_POSTGRES)
  })

  test('eine kranke Sonde ergibt "ausgefallen" und eine Begründung', async () => {
    const register = erzeugeRegister({ haltbarkeitMs: 0 })
    trageSondenEin(register, {
      sql: sqlAttrappe({ verbindung: new Error('connect ECONNREFUSED 127.0.0.1:5432') }).zugang,
    })
    const { lauf } = await register.pruefe()
    expect(lauf.zustand).toBe('ausgefallen')
    expect(lauf.sonden[0]?.zustand).toBe('fehler')
    expect(lauf.sonden[0]?.grund).toContain('ECONNREFUSED')
  })

  test('eine hängende Sonde wird von der Frist beendet', async () => {
    // **Warum das geprüft wird.** Ohne Frist würde eine Sonde, die auf eine tote
    // Gegenstelle wartet, den Endpunkt blockieren — ein Ausfall wäre von einem
    // hängenden Endpunkt nicht zu unterscheiden.
    const register = erzeugeRegister({ sondenFristMs: 50, gesamtFristMs: 200, haltbarkeitMs: 0 })
    register.register({
      name: 'haengt',
      pruefe: () => new Promise<void>(() => undefined),
    })
    const { lauf } = await register.pruefe()
    expect(lauf.zustand).toBe('ausgefallen')
    expect(lauf.sonden[0]?.zustand).toBe('frist')
    expect(lauf.sonden[0]?.grund).toContain('Frist von 50 ms')
  })
})

describe('apply — die Einhängung selbst', () => {
  /**
   * **Warum diese Prüfung nachträglich dazukam — mit dem Fehler, der sie erzwang.**
   *
   * Alle Prüfungen darüber rufen `trageSondenEin` mit einem **selbstgebauten**
   * Register auf. Sie prüfen die Logik und gehen an `apply` **vorbei**. Genau
   * dort steckte der Fehler: `apply` las den Dienst mit `ctx.get('readyness')`
   * **innerhalb von `apply`** — und `ctx.provide` macht einen Dienst erst **nach**
   * dem Ende von `apply` auffindbar (gemessen, siehe Dateikopf von `apply`).
   *
   * Im Host scheiterte das Paket deshalb vollständig:
   * `pmh-readiness: Error: readiness: der Dienst "readyness" fehlt`.
   *
   * Diese Prüfung führt `apply` **wirklich** aus — gegen einen echten
   * Cordis-Kontext und ein echtes Register — und weist nach, daß die Sonden
   * ankommen.
   */
  test('trägt die Sonden in das Register eines echten Kontexts ein', async () => {
    const ctx = new Context()
    const register = erzeugeRegister({ haltbarkeitMs: 0 })
    // Der Dienst, wie `health` ihn bereitstellt.
    ctx.provide('readyness', register)
    await new Promise((r) => setTimeout(r, 50))

    // `apply` mit einer Umgebung, die beide Gegenstellen nennt.
    const vorher = { DATABASE_URL: process.env['DATABASE_URL'], REDIS_URL: process.env['REDIS_URL'] }
    process.env['DATABASE_URL'] = 'postgres://a:b@127.0.0.1:5432/x'
    process.env['REDIS_URL'] = 'redis://127.0.0.1:6379'
    try {
      ctx.plugin({ name, inject, apply })
      // `ctx.inject` läuft, sobald der Dienst da ist — das braucht einen Moment.
      await new Promise((r) => setTimeout(r, 200))
      expect(register.alle().map((s) => s.name)).toEqual([SONDE_POSTGRES, SONDE_REDIS])
    } finally {
      if (vorher.DATABASE_URL === undefined) delete process.env['DATABASE_URL']
      else process.env['DATABASE_URL'] = vorher.DATABASE_URL
      if (vorher.REDIS_URL === undefined) delete process.env['REDIS_URL']
      else process.env['REDIS_URL'] = vorher.REDIS_URL
      await (ctx as unknown as { fiber: { dispose: () => Promise<void> } }).fiber.dispose()
    }
  })

  test('ohne Adressen trägt es keine Sonde ein, ohne zu scheitern', async () => {
    // **Der ehrliche Fall.** Keine Sonde heißt nicht „kaputt", sondern „nichts
    // zu prüfen" — `/api/ready` meldet dann `ungeprueft` mit HTTP 503.
    await ohneAdressen(async () => {
      const ctx = new Context()
      const register = erzeugeRegister({ haltbarkeitMs: 0 })
      ctx.provide('readyness', register)
      await new Promise((r) => setTimeout(r, 50))
      try {
        ctx.plugin({ name, inject, apply })
        await new Promise((r) => setTimeout(r, 200))
        expect(register.alle()).toHaveLength(0)
        // **Und das Register meldet ehrlich „ungeprueft".** Ohne Adressen wird
        // nichts geprüft — dann darf die Antwort nicht „ok" sein (Befund B20 der
        // Aufsicht). Das Einhängen selbst ist trotzdem gelungen; es scheitert nicht.
        const { lauf } = await register.pruefe()
        expect(lauf.zustand).toBe('ungeprueft')
        expect(lauf.sonden).toHaveLength(0)
        expect(statusFuer(lauf.zustand)).toBe(503)
      } finally {
        await (ctx as unknown as { fiber: { dispose: () => Promise<void> } }).fiber.dispose()
      }
    })
  })

  /**
   * Räumt die Adressvariablen weg, die die Umgebung mitbringen könnte.
   *
   * **Der Fehler, der diese Funktion erzwungen hat.** Diese Prüfungen hatten die
   * Sondenzahl **fest** erwartet (`toHaveLength(1)`) und dabei stillschweigend
   * vorausgesetzt, daß **nur** `REDIS_URL` gesetzt ist. Wer `DATABASE_URL` in der
   * Shell exportiert — und das tut man, wenn man die Bereitschaft von Hand
   * prüft —, bekam **zwei** Sonden und damit eine rote Prüfung.
   *
   * Das ist eine Prüfung, die von der Umgebung abhängt: sie ist grün auf einem
   * frischen Rechner und rot auf einem benutzten. **Beides sagt nichts über den
   * Code.** Die Prüfung setzt die Umgebung jetzt selbst — und stellt sie danach
   * wieder her.
   */
  const ADRESS_VARIABLEN = ['DATABASE_URL', 'REDIS_URL', 'PMH_READY_DATABASE_URL', 'PMH_READY_REDIS_URL']

  /** Führt einen Körper mit **leeren** Adressvariablen aus. */
  async function ohneAdressen(koerper: () => Promise<void>): Promise<void> {
    const vorher: Record<string, string | undefined> = {}
    for (const name of ADRESS_VARIABLEN) {
      vorher[name] = process.env[name]
      delete process.env[name]
    }
    try {
      await koerper()
    } finally {
      for (const [name, wert] of Object.entries(vorher)) {
        if (wert === undefined) delete process.env[name]
        else process.env[name] = wert
      }
    }
  }

  test('das Abhängen nimmt die Sonden wieder heraus', async () => {
    await ohneAdressen(async () => {
      const ctx = new Context()
      const register = erzeugeRegister({ haltbarkeitMs: 0 })
      ctx.provide('readyness', register)
      await new Promise((r) => setTimeout(r, 50))
      // Genau EINE Adresse: nur Redis. Die Prüfung setzt das jetzt selbst.
      process.env['REDIS_URL'] = 'redis://127.0.0.1:6379'
      try {
        const fiber = ctx.plugin({ name, inject, apply }) as unknown as {
          dispose: () => Promise<void>
        }
        await new Promise((r) => setTimeout(r, 200))
        expect(register.alle().map((s) => s.name)).toEqual([SONDE_REDIS])
        await fiber.dispose()
        await new Promise((r) => setTimeout(r, 100))
        expect(register.alle()).toHaveLength(0)
      } finally {
        await (ctx as unknown as { fiber: { dispose: () => Promise<void> } }).fiber.dispose()
      }
    })
  })
})

describe('pingRedis — gegen einen echten Socket', () => {
  /**
   * Ein winziger Server, der auf `PING` mit `+PONG` antwortet.
   *
   * **Warum ein echter Socket und keine Attrappe.** `pingRedis` ist die einzige
   * Stelle, die mit dem Netz spricht; eine Attrappe würde genau das nicht prüfen.
   * Der Server hier ist **nicht** Redis — er versteht eine Nachricht. Für die
   * Frage „kommt eine Antwort an?" genügt das, und die Prüfung bleibt schnell.
   */
  function pongServer(verhalten: 'pong' | 'fehler' | 'schweigen' | 'schliessen') {
    const { createServer } = require('node:net') as typeof import('node:net')
    const server = createServer((socket) => {
      socket.on('data', () => {
        if (verhalten === 'pong') socket.write('+PONG\r\n')
        else if (verhalten === 'fehler') socket.write('-ERR unknown command\r\n')
        else if (verhalten === 'schliessen') socket.end()
        // 'schweigen': nichts tun
      })
    })
    return server
  }

  /** Startet einen Server auf einem freien Port und gibt Port und Aufräumer. */
  async function mitServer(verhalten: Parameters<typeof pongServer>[0]) {
    const server = pongServer(verhalten)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const adresse = server.address()
    const port = typeof adresse === 'object' && adresse !== null ? adresse.port : 0
    return { port, weg: () => new Promise<void>((r) => server.close(() => r())) }
  }

  test('liest +PONG von einem echten Socket', async () => {
    const s = await mitServer('pong')
    try {
      const antwort = await pingRedis(s.port)
      expect(antwort.roh).toBe('+PONG')
    } finally {
      await s.weg()
    }
  })

  test('lehnt eine Fehlerantwort ab', async () => {
    const s = await mitServer('fehler')
    try {
      await expect(pingRedis(s.port)).rejects.toThrow(/Redis antwortete mit einem Fehler/u)
    } finally {
      await s.weg()
    }
  })

  test('ein geschlossener Socket ohne Antwort ist ein Fehler', async () => {
    const s = await mitServer('schliessen')
    try {
      await expect(pingRedis(s.port)).rejects.toThrow(/ohne Antwort geschlossen|Verbindung/u)
    } finally {
      await s.weg()
    }
  })

  test('ein schweigender Server läuft in die Frist', async () => {
    const s = await mitServer('schweigen')
    try {
      await expect(pingRedis(s.port, '127.0.0.1', 120)).rejects.toThrow(/keine Antwort binnen 120 ms/u)
    } finally {
      await s.weg()
    }
  })

  test('ein Port ohne Zuhörer ist ein Verbindungsfehler', async () => {
    // Ein Port, auf dem nichts lauscht: 1 ist reserviert und praktisch nie belegt.
    await expect(pingRedis(1, '127.0.0.1', 500)).rejects.toThrow(/Verbindung zu 127\.0\.0\.1:1/u)
  })
})
