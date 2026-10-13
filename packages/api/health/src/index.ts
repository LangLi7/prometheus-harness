/**
 * `@prometheus-harness/health` — Zustandsauskunft, Anmeldesperre und das
 * **Register der Bereitschaftssonden** für unsere eigene API-Fläche.
 *
 * ## Warum dieses Paket existiert
 *
 * Am 13.10.2026 war der Stand: der Kern des Projekts ist gebaut, aber **kein
 * einziges Paket davon ist angeschlossen**. Der Host liefert die Oberfläche des
 * Cores aus; unser eigener Code lief nur in `bun test`. Eine Kette, die nur im
 * Test läuft, ist keine Kette.
 *
 * Dieses Paket ist der kleinste Schritt, der das ändert: Routen, die **unser**
 * Handler beantwortet — registriert über den offiziellen Dienst
 * `ctx.webServer.register`, nicht über eine eigene Serverinstanz.
 *
 * ## Die zwei Endpunkte — und warum es zwei sind
 *
 * | Pfad | Anmeldung | Frage |
 * |---|---|---|
 * | `GET /api/health` | **nein** | *läuft der Prozeß?* |
 * | `GET /api/ready` | **ja** | *ist die Anwendung dahinter ansprechbar?* |
 *
 * Das ist der übliche Schnitt, und er ist keine Pedanterie: eine
 * Erreichbarkeitsprüfung, die eine Anmeldung verlangt, kann nicht melden, daß
 * die Anmeldung kaputt ist. `/api/health` ist deshalb absichtlich offen — und
 * deshalb sagt er auch **nichts** außer „dieser Handler läuft".
 *
 * ## Warum `/api/ready` ein **Register** benutzt und keine festen Prüfungen
 *
 * Die naheliegende Fassung wäre: dieses Paket verbindet sich mit PostgreSQL und
 * Redis und meldet deren Zustand. **Das wäre falsch, und zwar aus zwei Gründen.**
 *
 * * **Es macht dieses Paket von den Datenbanken abhängig.** Ein Endpunkt, dessen
 *   Aufgabe „Zustand melden" ist, dürfte nicht selbst am Zustand hängen — er
 *   müßte bei jeder neuen Abhängigkeit geändert werden, und ein Fehler in der
 *   Datenbankverbindung würde den Endpunkt mitreißen, der ihn melden soll.
 * * **Es verletzt die Regel dieses Projekts**, daß keine Unit Interna einer
 *   anderen importiert (Regel 2 in der README): `health` kennt PostgreSQL nicht,
 *   PostgreSQL kennt `health` nicht.
 *
 * Stattdessen gibt es einen **Vertrag**: `ctx.readyness.register(sonde)`. Wer
 * etwas zu prüfen hat, trägt seine Sonde ein (`@prometheus-harness/readiness`
 * tut das für PostgreSQL und Redis). Dieses Paket führt sie aus, begrenzt ihre
 * Laufzeit, und faßt das Ergebnis zusammen — **ohne zu wissen, was er prüft**.
 *
 * ## Was dieses Paket **nicht** ist
 *
 * Es ist keine Überwachung. Es gibt kein Protokoll, keine Verlaufskurve, keinen
 * Alarm. Es beantwortet eine Frage, in dem Augenblick, in dem sie gestellt wird.
 *
 * @module @prometheus-harness/health
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/**
 * Stabiler Cordis-Plugin-Name.
 *
 * **Warum er nicht beliebig ist.** Der Loader führt Plugins unter diesem Namen:
 * die Ausgabe der Entry-Prüfung, Abschaltungen und Fehlermeldungen nennen ihn.
 * Steht hier etwas anderes als in der Patch-Zeile, sucht man den Fehler an der
 * falschen Stelle.
 */
export const name = 'pmh-health'

/**
 * Dienste, die vor dem Einhängen da sein müssen.
 *
 * `webServer` hält die Routen; ohne ihn gäbe es nichts zu registrieren.
 *
 * ## Warum `connection` hier **nicht** steht — mit dem Fehler, der dazu führte
 *
 * Der erste Entwurf forderte auch `connection`. Der Gedanke war: ohne den
 * Verbindungsdienst können wir `/api/ready` nicht absichern, also soll der Loader
 * uns gar nicht erst einhängen.
 *
 * **Das war falsch, und die Prüfung hat es gezeigt:** in einem Aufbau ohne
 * Verbindungsdienst hing der Loader das Plugin **nie** ein — beide Endpunkte
 * antworteten **404**. Ein Endpunkt, der wegen einer fehlenden Prüfung
 * verschwindet, kann nicht melden, **daß** die Prüfung fehlt. Er verschwindet
 * still, und ein stiller Ausfall ist genau das, was Regel 3 dieses Projekts
 * verbietet.
 *
 * **Jetzt gilt:** das Plugin hängt sich immer ein. Fehlt der Verbindungsdienst
 * zur Laufzeit, antwortet `/api/ready` mit **503** und dem Grund `unavailable`
 * (siehe {@link abweisung}) — sichtbar, statt still.
 */
export const inject = ['webServer']

/** Der Pfad der offenen Erreichbarkeitsprüfung. */
export const HEALTH_PATH = '/api/health'

/** Der Pfad der geschützten Bereitschaftsauskunft. */
export const READY_PATH = '/api/ready'

/** Der Name, den die Antworten über sich selbst nennen. */
export const SERVICE_NAME = '@prometheus-harness/health'

/**
 * Die Fassung dieses Pakets.
 *
 * **Warum sie hier als Zeichenkette steht und nicht aus `package.json` gelesen
 * wird.** Ein Lesezugriff zur Laufzeit könnte fehlschlagen (anderer Aufbau nach
 * einem Bündeln) und würde die Endpunkte von einer Datei abhängig machen, die sie
 * nicht brauchen. Stattdessen vergleicht eine Prüfung diesen Wert mit
 * `package.json` — dann fällt ein Auseinanderlaufen **beim Testen** auf, nicht im
 * Betrieb.
 */
export const SERVICE_VERSION = '0.3.0'

/**
 * Vorgabe für die Frist einer einzelnen Sonde.
 *
 * 2.000 ms ist großzügig für eine Frage an eine Datenbank im selben Rechner und
 * klein genug, daß eine hängende Sonde den Endpunkt nicht unbrauchbar macht.
 */
export const STANDARD_SONDEN_FRIST_MS = 2_000

/**
 * Vorgabe für die Frist der **gesamten** Prüfung.
 *
 * Kleiner als das Doppelte der Sondenfrist, weil die Sonden **gleichzeitig**
 * laufen: die Gesamtfrist begrenzt, wie lange der Aufrufer höchstens wartet.
 */
export const STANDARD_GESAMT_FRIST_MS = 3_000

/**
 * Wie lange ein Ergebnis wiederverwendet werden darf.
 *
 * **Warum es das geben muß.** Eine Bereitschaftsauskunft wird **oft** abgefragt —
 * von einem Orchestrator im Sekundentakt, von einem Lastverteiler bei jeder
 * Anfrage. Ohne kurze Wiederverwendung würde jede Abfrage eine Datenbankabfrage
 * auslösen, und der Endpunkt würde die Last erzeugen, deren Wirkung er messen
 * soll. Fünf Sekunden sind lang genug, um das zu verhindern, und kurz genug, daß
 * ein Ausfall schnell sichtbar wird.
 */
export const STANDARD_HALTBARKEIT_MS = 5_000

/** Der Augenblick, in dem dieses Modul geladen wurde. */
const START = Date.now()

/** Wie die offene Auskunft aussieht. */
export interface HealthBody {
  /** Immer `'ok'` — solange dieser Handler läuft. */
  status: 'ok'
  /** Wer antwortet. */
  service: string
  /** Welche Fassung. */
  version: string
  /** Seit wann dieses Plugin geladen ist, in Millisekunden. */
  uptimeMs: number
  /** Die Fassung der Laufzeit, in der der Host läuft. */
  runtime: string
}

/** Der Zustand einer einzelnen Sonde. */
export type Sondenzustand = 'ok' | 'fehler' | 'frist'

/** Das Ergebnis einer einzelnen Sonde, wie es nach außen geht. */
export interface Sondenergebnis {
  /** Der Name der Sonde. */
  name: string
  /** Ihr Zustand. */
  zustand: Sondenzustand
  /** Wie lange sie gebraucht hat, in Millisekunden. */
  dauerMs: number
  /** Kurze Begründung — **ohne** Zugangsdaten, siehe {@link SONDE}. */
  grund?: string
}

/** Der Gesamtzustand. */
export type Gesamtzustand = 'ok' | 'eingeschraenkt' | 'ausgefallen'

/** Wie die geschützte Auskunft aussieht. */
export interface ReadyBody extends Omit<HealthBody, 'status'> {
  /** Der Gesamtzustand. */
  bereit: boolean
  /** `ok`, `eingeschraenkt` oder `ausgefallen`. */
  zustand: Gesamtzustand
  /** Seit wann der Prozeß läuft, in Sekunden. */
  prozessSekunden: number
  /** Die Plattform, auf der der Host läuft. */
  plattform: string
  /** Was die Sonden gesagt haben, in Eintragsreihenfolge. */
  sonden: Sondenergebnis[]
  /** Ob dieses Ergebnis aus der Wiederverwendung kam. */
  zwischengespeichert: boolean
}

/**
 * Eine Bereitschaftssonde — der **Vertrag** zwischen diesem Paket und dem, was
 * geprüft wird.
 *
 * **Warum die Sonde „werfe bei Fehler" und nicht „gib einen Wahrheitswert" heißt.**
 * Eine Sonde, die `false` liefert, sagt nicht, **warum**. Die Begründung ist aber
 * das Einzige, was bei einem Ausfall weiterhilft. Deshalb: Erfolg ist das
 * **Durchlaufen ohne Fehler**, und alles andere ist ein Fehler mit Begründung.
 *
 * **Was eine Sonde nicht tun darf.** Sie darf keine Zugangsdaten in die
 * Begründung schreiben. Der Fehlertext geht an jeden, der angemeldet ist — und
 * eine Fehlermeldung aus einem Verbindungsversuch enthält oft den Wirt, den
 * Benutzer oder die halbe Verbindungszeichenfolge. Siehe
 * {@link bereinigeGrund}.
 */
export interface Sonde {
  /** Kurzer, stabiler Name — er steht in der Antwort und in Protokollen. */
  name: string
  /**
   * Führt die Prüfung aus.
   *
   * Gelingt sie, kehrt sie normal zurück. Scheitert sie, **wirft** sie einen
   * Fehler mit kurzer Begründung.
   */
  pruefe: () => Promise<void>
}

/** Das Ergebnis eines Durchlaufs über alle Sonden. */
export interface Sondenlauf {
  /** Der Gesamtzustand. */
  zustand: Gesamtzustand
  /** Die Einzelergebnisse, in Eintragsreihenfolge. */
  sonden: Sondenergebnis[]
}

/** Ein Sondenlauf mit der Angabe, woher er kommt. */
export interface Sondenantwort {
  /** Der Lauf selbst. */
  lauf: Sondenlauf
  /**
   * Ob dieses Ergebnis **wiederverwendet** wurde.
   *
   * **Warum das ausdrücklich mitgeliefert wird und nicht geraten.** Die erste
   * Fassung wollte es daran erkennen, wie lange der Aufruf gedauert hat — das ist
   * eine Krücke: eine schnelle Datenbank liefert in derselben Zeit ein **frisches**
   * Ergebnis. Wer „zwischengespeichert" meldet, muß es **wissen**, sonst ist die
   * Angabe wertlos.
   */
  ausSpeicher: boolean
}

/** Das Register, das dieses Paket als Dienst anbietet. */
export interface Sondenregister {
  /**
   * Trägt eine Sonde ein.
   *
   * @param sonde - Name und Prüffunktion
   * @returns ein Aufruf, der die Sonde wieder entfernt
   * @throws wenn der Name schon belegt ist — zwei Sonden mit demselben Namen
   *   wären in der Antwort nicht unterscheidbar
   */
  register: (sonde: Sonde) => () => void
  /** Die eingetragenen Sonden in Eintragsreihenfolge. */
  alle: () => readonly Sonde[]
  /** Führt alle Sonden aus — oder liefert ein noch haltbares Ergebnis. */
  pruefe: () => Promise<Sondenantwort>
}

/**
 * Kürzt eine Begründung und entfernt, was nicht nach außen gehört.
 *
 * **Warum das keine Höflichkeit ist, sondern eine Sicherheitsmaßnahme.** Ein
 * Fehler aus einem Verbindungsversuch nennt oft den Wirt, den Benutzer oder die
 * halbe Verbindungszeichenfolge. Wer angemeldet ist, darf den Zustand erfahren —
 * aber die Zugangsdaten stehen ihm nicht zu, nur weil er den Zustand abfragt. Die
 * Oberfläche könnte dieselbe Auskunft ganz anders schützen.
 *
 * Entfernt werden deshalb:
 *
 * * alles nach `://` in einer Adresse (der Benutzer-Teil), ersetzt durch `***@`
 * * `password=…` / `passwort=…` in jeder Schreibweise
 *
 * Gekürzt wird auf {@link GRUND_MAX_LAENGE} Zeichen, damit ein langer Stapel
 * nicht die Antwort flutet.
 *
 * @param roh - der rohe Fehlertext
 * @returns die bereinigte Begründung
 */
export function bereinigeGrund(roh: string): string {
  let text = roh
  // `postgres://benutzer:geheim@wirt/db` → `postgres://***@wirt/db`
  text = text.replace(/([a-zA-Z][\w+.-]*:\/\/)[^/@\s]*@/gu, '$1***@')
  // `password=geheim`, `passwort: geheim`, `Password = geheim`
  text = text.replace(/\b(pass\w*|pwd|secret|token|key)\s*[=:]\s*\S+/giu, '$1=***')
  const knapp = text.replace(/\s+/gu, ' ').trim()
  return knapp.length > GRUND_MAX_LAENGE ? `${knapp.slice(0, GRUND_MAX_LAENGE)}…` : knapp
}

/** Ab dieser Länge wird eine Begründung gekürzt. */
const GRUND_MAX_LAENGE = 180

/**
 * Baut den Antwortkörper der offenen Auskunft.
 *
 * @param now - der jetzige Augenblick (übergebbar, damit die Laufzeit prüfbar ist)
 * @returns der Antwortkörper
 */
export function healthBody(now: number = Date.now()): HealthBody {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    // Nie negativ: eine Uhr, die während des Starts zurückgestellt wird, würde
    // sonst eine unsinnige Laufzeit melden.
    uptimeMs: Math.max(0, now - START),
    runtime: `bun ${process.versions.bun ?? '?'}`,
  }
}

/**
 * Faßt Einzelergebnisse zu einem Gesamtzustand zusammen.
 *
 * **Die Regel, und warum sie drei Stufen hat.** Bei zwei Stufen („geht" /
 * „geht nicht") ist die Frage „eine von drei Sonden ausgefallen — ist der Dienst
 * bereit?" nicht beantwortbar. Drei Stufen machen die Antwort ehrlich:
 *
 * | Lage | Zustand | HTTP |
 * |---|---|---|
 * | keine Sonde eingetragen | `ok` | 200 |
 * | alle grün | `ok` | 200 |
 * | einige rot | `eingeschraenkt` | **503** |
 * | alle rot | `ausgefallen` | **503** |
 *
 * **Warum schon eine rote Sonde 503 ergibt.** Ein Lastverteiler, der einen
 * halbfähigen Dienst weiter beliefert, verschlimmert den Ausfall. Wer
 * „eingeschraenkt" lesen will, liest den Körper — der Statuscode ist für
 * Maschinen, und für die gilt: nicht bereit ist nicht bereit.
 *
 * @param ergebnisse - die Einzelergebnisse
 * @returns der Gesamtzustand
 */
export function fasseZusammen(ergebnisse: readonly Sondenergebnis[]): Gesamtzustand {
  if (ergebnisse.length === 0) return 'ok'
  const rot = ergebnisse.filter((e) => e.zustand !== 'ok').length
  if (rot === 0) return 'ok'
  return rot === ergebnisse.length ? 'ausgefallen' : 'eingeschraenkt'
}

/**
 * Der HTTP-Status zu einem Gesamtzustand.
 *
 * @param zustand - der Gesamtzustand
 * @returns 200 oder 503
 */
export function statusFuer(zustand: Gesamtzustand): number {
  return zustand === 'ok' ? 200 : 503
}

/**
 * Erzeugt das Sondenregister.
 *
 * **Warum als eigene Funktion und nicht im Plugin-Kontext.** Das Register ist
 * reine Logik: eintragen, austragen, ausführen, zusammenfassen. Als eigene
 * Einheit läßt es sich **ohne** Host, ohne HTTP und ohne Datenbank prüfen — und
 * genau das braucht seine Prüfung, weil ein Fehler hier jeden Endpunkt betrifft.
 *
 * @param optionen - Fristen und Haltbarkeit
 * @returns das Register
 */
export function erzeugeRegister(optionen: {
  sondenFristMs?: number
  gesamtFristMs?: number
  haltbarkeitMs?: number
  /** Die Uhr, austauschbar für Prüfungen. */
  jetzt?: () => number
} = {}): Sondenregister {
  const sondenFrist = optionen.sondenFristMs ?? STANDARD_SONDEN_FRIST_MS
  const gesamtFrist = optionen.gesamtFristMs ?? STANDARD_GESAMT_FRIST_MS
  const haltbarkeit = optionen.haltbarkeitMs ?? STANDARD_HALTBARKEIT_MS
  const jetzt = optionen.jetzt ?? Date.now

  const sonden: Sonde[] = []
  let zwischengespeichert: { bis: number; lauf: Sondenlauf } | undefined
  /** Ein laufender Durchlauf, damit gleichzeitige Abfragen ihn teilen. */
  let laufend: Promise<Sondenlauf> | undefined = undefined

  /**
   * Führt **eine** Sonde mit Frist aus.
   *
   * **Warum die Frist je Sonde und nicht nur insgesamt.** Ohne sie würde eine
   * Sonde, die auf eine tote Gegenstelle wartet, den ganzen Endpunkt blockieren —
   * ein Ausfall würde ununterscheidbar von einem hängenden Endpunkt. Mit Frist
   * gibt es ein **Ergebnis**: `frist`, nach der vereinbarten Zeit.
   *
   * @param sonde - die auszuführende Sonde
   * @returns ihr Ergebnis
   */
  async function fuehreAus(sonde: Sonde): Promise<Sondenergebnis> {
    const beginn = jetzt()
    let fristgeber: ReturnType<typeof setTimeout> | undefined
    try {
      const frist = new Promise<never>((_erfuellen, ablehnen) => {
        fristgeber = setTimeout(() => {
          ablehnen(new Error(`Frist von ${String(sondenFrist)} ms überschritten`))
        }, sondenFrist)
      })
      // `Promise.race` und nicht `all`: sobald die Frist greift, ist das Ergebnis
      // da — auch wenn die Sonde weiterläuft. Ein Abbrechen der Sonde ist Sache
      // der Sonde; hier wird nur nicht mehr auf sie gewartet.
      await Promise.race([sonde.pruefe(), frist])
      return { name: sonde.name, zustand: 'ok', dauerMs: jetzt() - beginn }
    } catch (fehler) {
      const roh = fehler instanceof Error ? fehler.message : String(fehler)
      const istFrist = roh.includes('Frist von')
      const ergebnis: Sondenergebnis = {
        name: sonde.name,
        zustand: istFrist ? 'frist' : 'fehler',
        dauerMs: jetzt() - beginn,
        grund: bereinigeGrund(roh),
      }
      return ergebnis
    } finally {
      if (fristgeber !== undefined) clearTimeout(fristgeber)
    }
  }

  /**
   * Führt alle Sonden aus.
   *
   * **Gleichzeitig, nicht nacheinander.** Bei drei Sonden mit je 2.000 ms Frist
   * wäre die Reihenfolge 6.000 ms — länger als jede sinnvolle Gesamtfrist. Die
   * Sonden sind unabhängig (verschiedene Gegenstellen), also dürfen sie
   * gleichzeitig laufen.
   */
  async function durchlauf(): Promise<Sondenlauf> {
    if (sonden.length === 0) return { zustand: 'ok', sonden: [] }
    const ergebnisse = await Promise.all(sonden.map((s) => fuehreAus(s)))
    return { zustand: fasseZusammen(ergebnisse), sonden: ergebnisse }
  }

  return {
    register(sonde) {
      if (sonden.some((s) => s.name === sonde.name)) {
        // Zwei Sonden mit demselben Namen wären in der Antwort nicht
        // unterscheidbar — und der zweite Eintrag würde den ersten verdecken.
        throw new Error(`Sonde "${sonde.name}" ist bereits eingetragen`)
      }
      sonden.push(sonde)
      // Eine Änderung am Register macht ein zwischengespeichertes Ergebnis
      // ungültig: es könnte eine Sonde betreffen, die es nicht mehr gibt.
      zwischengespeichert = undefined
      return () => {
        const at = sonden.indexOf(sonde)
        if (at >= 0) sonden.splice(at, 1)
        zwischengespeichert = undefined
      }
    },
    alle: () => [...sonden],
    async pruefe() {
      const nun = jetzt()
      if (zwischengespeichert !== undefined && zwischengespeichert.bis > nun) {
        return { lauf: zwischengespeichert.lauf, ausSpeicher: true }
      }
      // **Ein laufender Durchlauf wird geteilt.** Ohne das würde eine Welle
      // gleichzeitiger Abfragen ebenso viele Datenbankabfragen auslösen — genau
      // die Last, die die Haltbarkeit verhindern soll. Geteilt heißt hier:
      // **nicht** aus dem Speicher, denn die Arbeit läuft gerade.
      if (laufend !== undefined) return { lauf: await laufend, ausSpeicher: false }
      const versprechen = (async () => {
        let fristgeber: ReturnType<typeof setTimeout> | undefined
        try {
          const frist = new Promise<Sondenlauf>((erfuellen) => {
            fristgeber = setTimeout(() => {
              erfuellen({
                zustand: 'ausgefallen',
                sonden: sonden.map((s) => ({
                  name: s.name,
                  zustand: 'frist' as const,
                  dauerMs: gesamtFrist,
                  grund: `Gesamtfrist von ${String(gesamtFrist)} ms überschritten, bevor diese Sonde ein Ergebnis hatte`,
                })),
              })
            }, gesamtFrist)
          })
          const lauf = await Promise.race([durchlauf(), frist])
          if (haltbarkeit > 0) {
            zwischengespeichert = { bis: jetzt() + haltbarkeit, lauf }
          }
          return lauf
        } finally {
          if (fristgeber !== undefined) clearTimeout(fristgeber)
          laufend = undefined
        }
      })()
      laufend = versprechen
      return { lauf: await versprechen, ausSpeicher: false }
    },
  }
}

/**
 * Baut den Antwortkörper der geschützten Auskunft.
 *
 * **Warum ein Befehl wie `SELECT 1` nicht ausreicht, um „bereit" zu sagen.** Er
 * sagt, daß die Verbindung steht. Ob die Migrationen gelaufen sind, sagt er
 * nicht. Deshalb ist „bereit" hier die Zusammenfassung dessen, was die
 * eingetragenen **Sonden** sagen — und die Sonde für PostgreSQL prüft mehr als
 * die Verbindung (siehe `@prometheus-harness/readiness`).
 *
 * @param lauf - das Ergebnis des Sondendurchlaufs
 * @param zwischengespeichert - ob das Ergebnis wiederverwendet wurde
 * @param now - der jetzige Augenblick
 * @returns der Antwortkörper
 */
export function readyBody(
  lauf: Sondenlauf,
  zwischengespeichert = false,
  now: number = Date.now(),
): ReadyBody {
  const { status: _status, ...rest } = healthBody(now)
  return {
    ...rest,
    bereit: lauf.zustand === 'ok',
    zustand: lauf.zustand,
    prozessSekunden: Math.round(process.uptime()),
    plattform: process.platform,
    sonden: lauf.sonden,
    zwischengespeichert,
  }
}

/**
 * Fragt die Anmelde- und Zaunprüfung des Hosts.
 *
 * Siehe Dateikopf: `requestRejection` prüft den Host/Origin-Zaun und danach die
 * Browsersitzung und antwortet `undefined`, `403` oder `401`.
 *
 * **Warum der Dienst über `ctx.get` geholt wird und nicht über `ctx.connection`.**
 * `ctx.get` liefert `undefined`, wenn der Dienst fehlt — damit ist der Fall „kein
 * Verbindungsdienst" ein **beschriebener Ausgang** (Verweigerung) statt eines
 * Absturzes beim Zugriff auf eine leere Eigenschaft.
 *
 * @param ctx - der Plugin-Kontext
 * @param headers - die Kopfdaten der Anfrage
 * @returns `undefined`, wenn erlaubt — sonst der HTTP-Status der Verweigerung
 */
export function abweisung(
  ctx: Context,
  headers: IncomingHttpHeaders | Readonly<Record<string, string | readonly string[] | undefined>>,
): number | undefined {
  const verbindung = ctx.get('connection') as
    | { requestRejection?: (request: { headers: typeof headers }) => number | undefined }
    | undefined
  if (verbindung === undefined || typeof verbindung.requestRejection !== 'function') {
    // **Verweigern statt durchlassen.** Fehlt die Prüfung, ist die sichere
    // Annahme „nicht erlaubt": ein ungeschützter Endpunkt ist der teurere Fehler.
    return 503
  }
  return verbindung.requestRejection({ headers })
}

/**
 * Schreibt eine JSON-Antwort und **beendet sie ausdrücklich**.
 *
 * **Warum `Content-Length` und nicht `res.end(text)`.** Der Webserver des Cores
 * verdichtet Antworten ab 1.024 Byte (`compression: gzip`). Eine Antwort ohne
 * Längenangabe gilt dort als „unbekannte Länge" und wird **verdichtet** — für ein
 * paar Dutzend Byte unnötige Arbeit und ein `Content-Encoding`, das ein Aufrufer
 * ohne gzip-Unterstützung nicht lesen kann.
 *
 * **Warum `Cache-Control: no-store`.** Eine zwischengespeicherte
 * Zustandsauskunft ist eine falsche Zustandsauskunft — auf der Ebene des
 * Browsers. Die Wiederverwendung im Prozeß ist etwas anderes und steht in der
 * Antwort (`zwischengespeichert`).
 *
 * @param res - die Antwort des Webservers
 * @param status - HTTP-Statuscode
 * @param body - der Körper, wird als JSON geschrieben
 * @param extraKopf - weitere Kopfdaten
 * @param head - ob nur die Kopfdaten gesendet werden (HEAD)
 */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraKopf: Record<string, string> = {},
  head = false,
): void {
  const raw = Buffer.from(JSON.stringify(body), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(raw.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(extraKopf)) res.setHeader(k, v)
  if (head) res.end()
  else res.end(raw)
}

/**
 * Beantwortet eine Anfrage mit der Methode `GET` oder `HEAD`.
 *
 * **Warum 405 und nicht 404.** Ein Aufruf mit der falschen Methode ist ein
 * anderer Fehler als ein Aufruf an der falschen Adresse.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 * @param körper - liefert den zu sendenden Körper
 * @param status - der Statuscode für den Erfolgsfall
 */
function nurLesend(
  req: IncomingMessage,
  res: ServerResponse,
  körper: () => unknown,
  status = 200,
): void {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    sendJson(res, 405, { status: 'error', error: 'method_not_allowed', allow: ['GET', 'HEAD'] })
    return
  }
  sendJson(res, status, körper(), {}, method === 'HEAD')
}

/**
 * Der Handler der **offenen** Erreichbarkeitsprüfung.
 *
 * Er prüft **nichts** außer der Methode. Genau das ist sein Zweck: melden, daß der
 * Prozeß lebt und Routen bedient.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 */
export function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  nurLesend(req, res, () => healthBody())
}

/**
 * Der Handler der **geschützten** Bereitschaftsauskunft.
 *
 * **Die Reihenfolge ist eine Entscheidung:** erst die Sperre, dann die Methode,
 * dann die Sonden. Wer nicht angemeldet ist, erfährt nicht, welche Methoden die
 * Adresse kennt — sonst wäre jede 405-Antwort eine Auskunft an einen Fremden. Und
 * wer nicht angemeldet ist, löst auch **keine** Sonden aus: sonst könnte ein
 * Fremder durch bloßes Abfragen Last erzeugen.
 *
 * @param ctx - der Plugin-Kontext mit dem Verbindungsdienst
 * @param register - das Sondenregister
 * @returns der Handler
 */
export function macheReadyHandler(
  ctx: Context,
  register: Sondenregister,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const abgelehnt = abweisung(ctx, req.headers)
    if (abgelehnt !== undefined) {
      sendJson(
        res,
        abgelehnt,
        {
          status: 'error',
          error:
            abgelehnt === 401
              ? 'unauthenticated'
              : abgelehnt === 403
                ? 'untrusted_origin'
                : 'unavailable',
        },
        abgelehnt === 401 ? { 'WWW-Authenticate': 'Cookie' } : {},
      )
      return
    }
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      sendJson(res, 405, { status: 'error', error: 'method_not_allowed', allow: ['GET', 'HEAD'] })
      return
    }
    // **Ab hier wird gearbeitet.** Die Sonden laufen erst, wenn die Anmeldung
    // steht — siehe oben.
    void (async () => {
      try {
        const { lauf, ausSpeicher } = await register.pruefe()
        sendJson(res, statusFuer(lauf.zustand), readyBody(lauf, ausSpeicher), {}, method === 'HEAD')
      } catch (fehler) {
        // Ein Fehler **im Register** ist ein Fehler dieses Pakets, nicht der
        // Gegenstellen. Er wird gemeldet, nicht verschluckt.
        sendJson(res, 500, {
          status: 'error',
          error: 'probe_registry_failed',
          grund: bereinigeGrund(fehler instanceof Error ? fehler.message : String(fehler)),
        })
      }
    })()
  }
}

/**
 * Hängt die Endpunkte ein und stellt das Sondenregister als Dienst bereit.
 *
 * ## Der Fehler, der hier zuerst stand — und warum er gefährlich war
 *
 * Die erste Fassung hing den Disposer an `ctx.on('dispose', …)`. Das sah richtig
 * aus, **feuerte aber nie**: Cordis kennt kein `dispose`-**Ereignis**. Der
 * Listener wurde beim Abhängen nur mitentsorgt — das Aufräumen, das er hätte
 * auslösen sollen, lief nie mit.
 *
 * Die Prüfung hat es gefunden, nicht das Nachdenken: nach `fiber.dispose()`
 * antwortete die Route weiter mit **200**.
 *
 * ## Wie es richtig geht
 *
 * `ctx.effect(körper)` führt den Körper **sofort** aus und sammelt die Disposer,
 * die er zurückgibt. Sie laufen in umgekehrter Reihenfolge, wenn der Effekt
 * selbst entsorgt wird **oder** wenn das Plugin abgehängt wird — was zuerst
 * kommt.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const register = erzeugeRegister()
  // **Das Register als Dienst — mit `provide`, nicht mit `set`.**
  //
  // `set` ist nur der Setter; `provide` meldet einen Dienst an, der **diesem
  // Fiber gehört**. Der Unterschied ist nicht kosmetisch: `provide` gibt einen
  // Abmelder zurück und nimmt den Dienst beim Abhängen des Plugins mit. Mit `set`
  // bliebe ein Register stehen, dessen Sonden zu einem toten Kontext gehören —
  // genau die Sorte Rest, die eine spätere Neuladung unerklärlich scheitern läßt.
  //
  // Wer etwas zu prüfen hat, ruft `ctx.readyness.register(sonde)`. Dieses Paket
  // kennt PostgreSQL nicht.
  ctx.provide('readyness', register)
  ctx.effect(() => {
    const offen: WebRoute = { kind: 'exact', path: HEALTH_PATH, handler: handleHealth }
    const geschützt: WebRoute = {
      kind: 'exact',
      path: READY_PATH,
      handler: macheReadyHandler(ctx, register),
    }
    const ab = [ctx.webServer.register(offen), ctx.webServer.register(geschützt)]
    return () => {
      for (const einer of ab.reverse()) einer()
    }
  }, `${name} ${HEALTH_PATH} ${READY_PATH}`)
}

export default apply
