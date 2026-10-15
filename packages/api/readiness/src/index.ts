/**
 * `@prometheus-harness/readiness` — die **Sonden** für PostgreSQL und Redis.
 *
 * ## Warum es dieses Paket gibt und nicht einen Block in `health`
 *
 * Die naheliegende Fassung wäre, `/api/ready` direkt mit PostgreSQL und Redis zu
 * verbinden. Das wäre aus zwei Gründen falsch:
 *
 * * **`health` würde von den Datenbanken abhängig.** Ein Endpunkt, dessen Aufgabe
 *   „Zustand melden" ist, darf nicht selbst am Zustand hängen: ein Fehler in der
 *   Datenbankverbindung würde den Endpunkt mitreißen, der ihn melden soll.
 * * **Es verletzt Regel 2 dieses Projekts** (README): keine Unit importiert
 *   Interna einer anderen. `health` kennt PostgreSQL nicht — und soll es nicht.
 *
 * Deshalb: `health` stellt einen **Vertrag** bereit
 * (`ctx.readyness.register(sonde)`), und dieses Paket trägt seine Sonden dort
 * ein. Wer eine dritte Abhängigkeit prüfen will, schreibt kein Wort in `health`.
 *
 * ## Warum `fetch` für Redis und nicht `Bun.redis`
 *
 * **Gemessen am 13.10.2026, Bun 1.4.0:**
 *
 * | Weg | Ergebnis |
 * |---|---|
 * | `postgres` (npm) gegen 5432 | **OK** (`select 1` → `1`, Fassung `17.11`) |
 * | `Bun.SQL` gegen 5432 | **OK** |
 * | `Bun.redis` | **vorhanden, aber ohne benutzbare Methoden** (`Object.keys` → leer) |
 * | **rohes TCP, `PING`** gegen 6379 | **OK** (`+PONG`) |
 * | `fetch('redis://…')` | **FEHLER** (`protocol must be http:, https: or s3:`) |
 *
 * Also: für Redis ein eigenes, kleines RESP-`PING` über einen Socket. Das ist
 * **keine** Nachbildung von Redis — es ist die kleinste Nachricht, die beweist,
 * daß jemand antwortet. Für eine Bereitschaftsauskunft ist genau das die Frage.
 *
 * ## Warum PostgreSQL **nicht** mit `select 1` geprüft wird
 *
 * `select 1` sagt, daß die Verbindung steht. Es sagt **nicht**, daß die Anwendung
 * mit der Datenbank arbeiten kann: fehlende Tabellen, eine nie gelaufene
 * Migration, ein falscher Suchpfad — alles davon liefert bei `select 1` ein
 * fröhliches Ergebnis. Ein Bereitschaftsendpunkt, der in diesem Fall „bereit"
 * sagt, ist schlimmer als keiner.
 *
 * Geprüft wird deshalb zusätzlich:
 *
 * 1. die Verbindung (`select 1`),
 * 2. die **Migrationstabelle** und die erreichte **Fassung**,
 * 3. daß die **Kern-Tabellen** vorhanden sind.
 *
 * @module @prometheus-harness/readiness
 */

import type { Context } from '@deepseek-ai/cordis'
import { connect } from 'node:net'
import type { Sondenregister } from '@prometheus-harness/health'

/** Stabiler Cordis-Plugin-Name. */
export const name = 'pmh-readiness'

/**
 * Dienste, die vor dem Einhängen da sein müssen.
 *
 * `readyness` ist das Register aus `@prometheus-harness/health`. Fehlt es, gibt
 * es nichts einzutragen — und der Loader wartet, bis es da ist. Das ist hier
 * **richtig**, anders als bei `health` selbst: dieses Paket fügt Sonden hinzu,
 * es ist kein Endpunkt. Fehlt das Register, ist unser Beitrag sinnlos, aber
 * nichts verschwindet still — `/api/ready` meldet dann ehrlich `ok` **ohne**
 * Sonden, und die Zahl der Sonden steht in der Antwort.
 */
export const inject = ['readyness']

/** Wie die Sonde nach außen heißt, die PostgreSQL prüft. */
export const SONDE_POSTGRES = 'postgres'

/** Wie die Sonde nach außen heißt, die Redis prüft. */
export const SONDE_REDIS = 'redis'

/**
 * Der Zugang zur Datenbank, den die Sonde braucht.
 *
 * **Warum eine eigene Schnittstelle und kein `postgres`-Typ.** Genau wie in
 * `@prometheus-harness/db-schema`: damit die Sonde **ohne laufende Datenbank**
 * geprüft werden kann. Die Prüfungen setzen eine Attrappe ein und prüfen, was bei
 * welcher Antwort geschieht — Reihenfolge der Abfragen, Umgang mit einer alten
 * Fassung, Umgang mit fehlenden Tabellen, Bereinigung der Begründung. Eine Sonde,
 * die nur gegen eine echte Datenbank prüfbar ist, wird nicht geprüft.
 */
export interface SqlZugang {
  /**
   * Führt eine Abfrage aus und liefert die Zeilen.
   *
   * @param text - das SQL
   * @param werte - die Werte für die Platzhalter
   * @returns die Zeilen
   */
  query<T>(text: string, werte?: readonly unknown[]): Promise<readonly T[]>
}

/** Das Ergebnis eines Redis-`PING`. */
export interface RedisAntwort {
  /** Die rohe Antwort, etwa `+PONG`. */
  roh: string
}

/**
 * Wie `readiness` mit einer Gegenstelle spricht.
 *
 * Beide Wege sind austauschbar, damit die Sonden ohne echte Gegenstellen prüfbar
 * sind. Im Betrieb sind es `postgres` und ein Socket; in der Prüfung Attrappen.
 */
export interface Gegenstellen {
  /** Die Datenbankabfrage, oder `undefined` wenn keine Datenbank eingerichtet ist. */
  sql?: SqlZugang
  /** Das Redis-`PING`, oder `undefined` wenn kein Redis eingerichtet ist. */
  ping?: () => Promise<RedisAntwort>
}

/**
 * Der Name der Migrationstabelle.
 *
 * **Warum hier die richtige Schreibweise steht.** Der erste Entwurf dieser Sonde
 * fragte `pmh_schema_migrations` ab — ein Name, der plausibel aussah und den es
 * **nicht gibt**. Die Tabelle heißt `schema_migrations` und liegt im Schema
 * `pmh`; der Suchpfad der Rollen ist `pmh, public` (gemessen am 13.10.2026 mit
 * `show search_path`), deshalb genügt der bloße Name.
 *
 * Aufgefallen ist das beim Nachsehen in der Datenbank, nicht beim Nachdenken:
 *
 * ```
 * $ docker exec pmh-postgres psql -U pmh_owner -d pmh -t \
 *     -c "select schemaname||'.'||tablename from pg_tables where schemaname not in ('pg_catalog','information_schema');"
 *   pmh.api_keys
 *   pmh.chats
 *   …
 *   pmh.schema_migrations
 * ```
 */
export const MIGRATIONSTABELLE = 'schema_migrations'


/**
 * Die erwartete Schemafassung.
 *
 * **Warum eine Zahl und nicht „die Tabelle existiert".** Eine Tabelle ohne Zeilen
 * sagt, daß jemand sie angelegt hat — nicht, daß die Migrationen gelaufen sind.
 * Die erreichte Fassung ist die einzige Auskunft, die „die Anwendung kann mit
 * dieser Datenbank arbeiten" belegt.
 *
 * **Woher die Zahl kommt — und wie sie ehrlich bleibt.** Sie ist die höchste
 * Fassung in `packages/auth/db-schema/migrations/` und wurde am 14.10.2026 in der
 * laufenden Datenbank nachgemessen:
 *
 * ```
 * $ docker exec pmh-postgres psql -U pmh_app -d pmh -t -c "select max(version) from schema_migrations;"
 *   10
 * ```
 *
 * **Warum hier zwischenzeitlich eine 7 stand.** Die Migrationen 0006, 0007 und 0008
 * liefen zuerst **nur gegen die Wegwerf-Datenbank**; die Betriebsdatenbank `pmh` blieb
 * auf Fassung 5. `/api/ready` meldete in dieser Zeit „Schemafassung 5 statt 7" — und das
 * war **korrekt**: die Migrationen fehlten wirklich. Am 14.10.2026 wurden 0006 bis 0008
 * gegen `pmh` nachgezogen, am selben Tag 0009 (die Quellordner). Sie sind **anlegend**
 * (`CREATE TABLE`, `ADD COLUMN`), kein `DROP` an Daten — gemessen danach: `max(version)` = 9.
 *
 * **Was hier bewußt nicht steht: ein Import von `@prometheus-harness/db-schema`.**
 * Das wäre die automatisch richtige Zahl — und würde dieses Paket an das
 * Schema-Paket binden. Dann hinge eine Zustandsauskunft an dem, dessen Zustand
 * sie meldet. Stattdessen vergleicht eine **Prüfung** diese Zahl mit
 * `SCHEMA_VERSION` aus `db-schema`:
 * `packages/auth/db-schema/tests/migrate.test.ts` liest die Zeile unten als Text
 * und wird rot, wenn beide auseinanderlaufen. Der Textvergleich und kein Import,
 * weil ein Import am Typsystem scheitert (sechs `TS2307` — die `.sql`-Deklaration
 * von `db-schema` ist im Programm von `readiness` nicht enthalten).
 */
export const ERWARTETE_SCHEMAFASSUNG = 10

/**
 * Die Tabellen, ohne die die Anwendung nicht arbeiten kann.
 *
 * **Warum das geprüft wird und nicht nur die Fassung.** Die Fassung steht in der
 * Migrationstabelle — auch dann, wenn jemand eine Tabelle später gelöscht hat.
 * Die Fassung sagt „die Migrationen liefen", die Tabelle sagt „das Ergebnis ist
 * da". Beides ist nötig.
 *
 * **Warum `current_schema()` und nicht `'public'`.** Die Tabellen dieses Projekts
 * liegen im Schema `pmh`, und der Suchpfad beider Rollen ist `pmh, public`
 * (gemessen mit `show search_path`). Eine Abfrage auf `'public'` würde also
 * **nichts** finden und die Sonde würde „Kern-Tabellen fehlen" melden, obwohl
 * alles da ist. `current_schema()` liefert `pmh` und damit das Richtige —
 * unabhängig davon, ob die Rollen ihren Suchpfad behalten.
 */
export const KERN_TABELLEN: readonly string[] = [
  'users',
  'workspaces',
  'chats',
  'messages',
  'auth_sessions',
  'conversation_sessions',
  // **`user_profiles` steht hier bewusst NICHT.** Diese Liste sind die Tabellen,
  // **ohne die die Anwendung nicht arbeiten kann**. Fehlt ein Profil, gilt das
  // Vorgabeprofil (`vorgabeProfil`) — die Anmeldung und jede Handlung
  // funktionieren weiter. Eine Tabelle in diese Liste aufzunehmen, die fehlen
  // darf, machte die Bereitschaftssonde **strenger als die Wirklichkeit**: sie
  // meldete dann 503 für eine Datenbank, mit der alles läuft.
]

/**
 * Prüft PostgreSQL.
 *
 * Drei Fragen, in dieser Reihenfolge — und die Reihenfolge ist Absicht: eine
 * Abfrage gegen eine nicht existierende Tabelle würde einen Fehler liefern, der
 * wie ein Verbindungsfehler aussieht. Erst die Verbindung, dann die Struktur.
 *
 * @param sql - der Zugang zur Datenbank
 * @param erwarteteFassung - die erwartete Schemafassung
 * @param kernTabellen - die erwarteten Tabellen
 * @throws mit kurzer Begründung, wenn etwas fehlt
 */
export async function pruefePostgres(
  sql: SqlZugang,
  erwarteteFassung: number = ERWARTETE_SCHEMAFASSUNG,
  kernTabellen: readonly string[] = KERN_TABELLEN,
): Promise<void> {
  // 1. Die Verbindung.
  await sql.query<{ eins: number }>('select 1 as eins')

  // 2. Die Fassung. Fehlt die Tabelle ganz, ist das ein eigener, hilfreicherer
  //    Fehler als ein nackter SQL-Fehler.
  let zeilen: readonly { version: string | number }[]
  try {
    zeilen = await sql.query<{ version: string | number }>(
      `select version from ${MIGRATIONSTABELLE} order by version desc limit 1`,
    )
  } catch (fehler) {
    throw new Error(
      `Migrationstabelle ${MIGRATIONSTABELLE} fehlt oder ist nicht lesbar: ${
        fehler instanceof Error ? fehler.message : String(fehler)
      }`,
    )
  }
  const erreicht = zeilen[0] === undefined ? 0 : Number(zeilen[0].version)
  if (erreicht !== erwarteteFassung) {
    throw new Error(
      `Schemafassung ${String(erreicht)} statt ${String(erwarteteFassung)} — Migrationen sind nicht auf dem Stand der Anwendung`,
    )
  }

  // 3. Die Tabellen. Eine Abfrage für alle, damit die Sonde schnell bleibt.
  //    `current_schema()` statt `'public'`: siehe KERN_TABELLEN.
  const gefunden = await sql.query<{ tablename: string }>(
    'select tablename from pg_tables where schemaname = current_schema() and tablename = any($1)',
    [[...kernTabellen]],
  )
  const namen = new Set(gefunden.map((z) => z.tablename))
  const fehlend = kernTabellen.filter((t) => !namen.has(t))
  if (fehlend.length > 0) {
    throw new Error(`Kern-Tabellen fehlen: ${fehlend.join(', ')}`)
  }
}

/**
 * Prüft Redis mit einem `PING` über einen Socket.
 *
 * **Warum ein eigener Socket und kein Redis-Paket.** Gemessen (siehe Dateikopf):
 * `Bun.redis` hat unter 1.4.0 keine benutzbaren Methoden, und `fetch` nimmt das
 * Protokoll nicht an. Ein `PING` ist **eine** Zeile im RESP-Protokoll
 * (`*1\r\n$4\r\nPING\r\n`); die Antwort ist `+PONG`. Das ist kein Redis-Client und
 * soll keiner sein — es ist die kleinste Nachricht, die beweist, daß jemand
 * antwortet. Für eine Bereitschaftsauskunft ist genau das die Frage.
 *
 * **Warum ein Zeitlimit im Socket und nicht nur außerhalb.** Ohne
 * `socket.setTimeout` bliebe ein Socket zu einem Rechner, der die Verbindung
 * annimmt und dann schweigt, bis die äußere Frist greift — der Socket bliebe
 * dabei offen. Mit Zeitlimit wird er **geschlossen**, und ein geschlossener
 * Socket ist keine Last mehr.
 *
 * @param port - der Port
 * @param host - der Wirt
 * @param fristMs - Zeitlimit für Verbindung und Antwort
 * @returns die rohe Antwort
 */
export function pingRedis(
  port: number,
  host = '127.0.0.1',
  fristMs = 2_000,
): Promise<RedisAntwort> {
  return new Promise<RedisAntwort>((erfuellen, ablehnen) => {
    const socket = connect(port, host)
    let puffer = ''
    let erledigt = false

    /** Räumt auf und beendet das Versprechen genau einmal. */
    const schliesse = (fehler?: Error) => {
      if (erledigt) return
      erledigt = true
      socket.destroy()
      if (fehler !== undefined) ablehnen(fehler)
    }

    socket.setTimeout(fristMs)
    socket.on('connect', () => {
      socket.write('*1\r\n$4\r\nPING\r\n')
    })
    socket.on('data', (stück) => {
      puffer += stück.toString('utf8')
      if (!puffer.includes('\r\n')) return
      if (erledigt) return
      erledigt = true
      socket.destroy()
      const antwort = puffer.trim()
      // Ein Redis-Fehler beginnt mit `-`. Ihn als Erfolg zu nehmen wäre falsch:
      // „jemand antwortet" ist nicht dasselbe wie „Redis ist bereit".
      if (antwort.startsWith('-')) ablehnen(new Error(`Redis antwortete mit einem Fehler: ${antwort}`))
      else erfuellen({ roh: antwort })
    })
    socket.on('timeout', () => {
      schliesse(new Error(`keine Antwort binnen ${String(fristMs)} ms`))
    })
    socket.on('error', (fehler) => {
      schliesse(new Error(`Verbindung zu ${host}:${String(port)} fehlgeschlagen: ${fehler.message}`))
    })
    socket.on('close', () => {
      if (!erledigt) schliesse(new Error('Verbindung wurde ohne Antwort geschlossen'))
    })
  })
}

/**
 * Liest den Port aus einer Redis-Adresse.
 *
 * Nimmt `redis://host:port`, `redis://host:port/0` und einen nackten Port. Gibt
 * `undefined` zurück, wenn nichts Lesbares dasteht — dann wird der Standardport
 * benutzt, statt zu raten.
 *
 * @param adresse - die Adresse aus der Umgebung
 * @returns Wirt und Port
 */
export function zerlegeRedisAdresse(adresse: string): { host: string; port: number } {
  const text = adresse.trim()
  const ohneSchema = text.replace(/^rediss?:\/\//u, '')
  const ohnePfad = ohneSchema.split('/')[0] ?? ''
  // Zugangsdaten abschneiden: `benutzer:geheim@wirt:6379`
  const ohneZugang = ohnePfad.includes('@') ? (ohnePfad.split('@').pop() ?? '') : ohnePfad
  const doppelpunkt = ohneZugang.lastIndexOf(':')
  if (doppelpunkt < 0) {
    return { host: ohneZugang === '' ? '127.0.0.1' : ohneZugang, port: 6379 }
  }
  const host = ohneZugang.slice(0, doppelpunkt)
  const port = Number(ohneZugang.slice(doppelpunkt + 1))
  return {
    host: host === '' ? '127.0.0.1' : host,
    port: Number.isInteger(port) && port > 0 && port < 65_536 ? port : 6379,
  }
}

/**
 * Trägt die Sonden in das Register ein.
 *
 * **Warum die Sonden fehlen dürfen, ohne daß etwas stumm ausfällt.** Ist keine
 * Datenbank eingerichtet, wird keine Sonde eingetragen — `/api/ready` meldet dann
 * `ok` **mit leerer Sondenliste**. Das ist ehrlich: die Antwort sagt ausdrücklich,
 * was geprüft wurde (`sonden: []` und `zwischengespeichert`). Wer eine
 * Bereitschaftsauskunft liest, sieht die Zahl der Sonden und weiß, ob „ok" etwas
 * bedeutet.
 *
 * @param register - das Register aus `@prometheus-harness/health`
 * @param gegenstellen - die Verbindungen
 * @returns ein Aufruf, der alle Sonden wieder entfernt
 */
export function trageSondenEin(
  register: Sondenregister,
  gegenstellen: Gegenstellen,
): () => void {
  const ab: (() => void)[] = []
  if (gegenstellen.sql !== undefined) {
    const sql = gegenstellen.sql
    ab.push(register.register({ name: SONDE_POSTGRES, pruefe: () => pruefePostgres(sql) }))
  }
  if (gegenstellen.ping !== undefined) {
    const ping = gegenstellen.ping
    ab.push(
      register.register({
        name: SONDE_REDIS,
        pruefe: async () => {
          const antwort = await ping()
          if (!antwort.roh.includes('PONG')) {
            throw new Error(`unerwartete Antwort auf PING: ${antwort.roh}`)
          }
        },
      }),
    )
  }
  return () => {
    for (const einer of ab.reverse()) einer()
  }
}

/**
 * Die Vorgabe: liest die Adressen aus der Umgebung und baut die Gegenstellen.
 *
 * **Warum die Adressen hier gelesen werden und nicht im Handler.** Der Endpunkt
 * darf bei jeder Anfrage nicht die Umgebung neu auswerten — eine Änderung
 * während des Laufs würde sonst stillschweigend wirken. Einmal beim Einhängen
 * gelesen, ist die Verbindung eine feste Tatsache dieses Prozesses.
 *
 * @returns die Gegenstellen aus der Umgebung
 */
export function gegenstellenAusUmgebung(
  env: Record<string, string | undefined> = process.env,
): Gegenstellen {
  const gegenstellen: Gegenstellen = {}
  const datenbank = env.PMH_READY_DATABASE_URL ?? env.DATABASE_URL
  if (datenbank !== undefined && datenbank.trim() !== '') {
    gegenstellen.sql = macheSqlZugang(datenbank)
  }
  const redis = env.PMH_READY_REDIS_URL ?? env.REDIS_URL
  if (redis !== undefined && redis.trim() !== '') {
    const { host, port } = zerlegeRedisAdresse(redis)
    gegenstellen.ping = () => pingRedis(port, host)
  }
  return gegenstellen
}

/**
 * Baut den Datenbankzugang aus einer Adresse.
 *
 * **Warum `await import('postgres')` und nicht ein Import oben in der Datei.**
 * Dieses Paket soll ohne das `postgres`-Paket **ladbar** bleiben: die Sonden sind
 * ohne Datenbank prüfbar, und ein fehlendes Paket darf nicht schon beim Import
 * scheitern. Geladen wird es erst, wenn es wirklich gebraucht wird.
 *
 * @param adresse - die Verbindungsadresse
 * @returns der Zugang
 */
export function macheSqlZugang(adresse: string): SqlZugang {
  // Ein einzelner, wiederverwendeter Zeiger: eine Bereitschaftssonde darf keine
  // Verbindung je Anfrage aufbauen. `max: 1` genügt, weil die Sonde eine Abfrage
  // nach der anderen stellt.
  let verbindung: Promise<SqlZugang> | undefined
  const hole = async (): Promise<SqlZugang> => {
    verbindung ??= (async () => {
      const { default: postgres } = (await import('postgres')) as unknown as {
        default: (a: string, o?: unknown) => {
          unsafe: (t: string, w?: readonly unknown[]) => Promise<readonly unknown[]>
        }
      }
      const sql = postgres(adresse, { max: 1, connect_timeout: 3, onnotice: () => undefined })
      return {
        query: async <T>(text: string, werte?: readonly unknown[]): Promise<readonly T[]> =>
          (await sql.unsafe(text, werte)) as readonly T[],
      }
    })()
    return verbindung
  }
  return {
    query: async <T>(text: string, werte?: readonly unknown[]): Promise<readonly T[]> => {
      const zugang = await hole()
      return zugang.query<T>(text, werte)
    },
  }
}

/**
 * Hängt die Sonden ein.
 *
 * ## Der Fehler, der hier zuerst stand — und warum ihn keine Prüfung fand
 *
 * Die erste Fassung las den Dienst mit `ctx.get('readyness')` **innerhalb von
 * `apply`** und warf, wenn er fehlte. Im Host scheiterte das Paket damit
 * vollständig:
 *
 * ```
 * [host] pmh: warning: 2 entries did not activate
 * [host] pmh-readiness (@prometheus-harness/readiness):
 *        Error: readiness: der Dienst "readyness" fehlt, obwohl inject ihn fordert
 * ```
 *
 * **Die Ursache ist ein Verhalten von Cordis, das ich nicht kannte und das eine
 * Sonde sichtbar gemacht hat:** `ctx.provide(name, wert)` macht den Dienst erst
 * **nach dem Ende von `apply()`** über `ctx.get` auffindbar. Während `apply`
 * läuft, liefert `ctx.get` noch `undefined`. Gemessen:
 *
 * ```
 * anbieter: setze Dienst
 * anbieter: after provide, ctx.get = undefined     ← der eigene Dienst ist noch unsichtbar
 * Wurzel:   ctx.get(meinding)     = [object Object] ← erst danach da
 * ```
 *
 * **Warum keine Prüfung das fand.** Die Prüfungen dieses Pakets rufen
 * `trageSondenEin` mit einem **selbstgebauten** Register auf — also genau an
 * `apply` vorbei. Das war eine Lücke: die reine Logik war geprüft, die
 * **Einhängung** nicht. Jetzt gibt es einen Fall, der `apply` gegen einen echten
 * Cordis-Kontext ausführt und nachweist, daß die Sonden im Register landen.
 *
 * ## Wie es richtig geht
 *
 * `ctx.inject(['readyness'], …)` läuft erst, wenn der Dienst **da ist** — der
 * Loader wartet von selbst. Das ist derselbe Weg, den das Dokumentationsbeispiel
 * von `ctx.effect` nennt (`ctx.on("event")` / `ctx.provide("name")`).
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const gegenstellen = gegenstellenAusUmgebung()
  const namen = [
    gegenstellen.sql === undefined ? undefined : SONDE_POSTGRES,
    gegenstellen.ping === undefined ? undefined : SONDE_REDIS,
  ].filter((n): n is string => n !== undefined)
  console.log(
    namen.length === 0
      ? 'pmh readiness: keine Sonde eingetragen — DATABASE_URL und REDIS_URL sind beide leer'
      : `pmh readiness: Sonden eingetragen: ${namen.join(', ')}`,
  )
  ctx.inject(['readyness'], (c) => {
    const register = c.get('readyness') as Sondenregister | undefined
    if (register === undefined) {
      // Kann mit `inject` nicht geschehen. Wenn doch, ist es ein Fehler, den man
      // sehen soll — nicht einer, den man wegschluckt.
      throw new Error('readiness: der Dienst "readyness" fehlt, obwohl inject ihn fordert')
    }
    // **Erst hier eintragen, nicht vorher.** Das Register gehört `health`; trüge
    // dieses Paket die Sonden in ein eigenes Register ein, stünden sie in keiner
    // Antwort.
    ctx.effect(() => trageSondenEin(register, gegenstellen), `${name} ${namen.join('+')}`)
  })
}

export default apply
