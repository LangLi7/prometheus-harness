/**
 * `@prometheus-harness/auth-http` — die Anmeldung im Host.
 *
 * ## Was dieses Paket tut
 *
 * Es hängt vier Wege in den Webserver des Kerns und verbindet sie mit dem
 * Regelkern (`@prometheus-harness/auth`) und dem Speicher
 * (`@prometheus-harness/store-postgres`):
 *
 * | Weg | Methode | Was er tut |
 * |---|---|---|
 * | `/api/pmh/auth/register` | POST | Konto anlegen |
 * | `/api/pmh/auth/login` | POST | anmelden, beide Cookies setzen |
 * | `/api/pmh/auth/logout` | POST | abmelden (verlangt CSRF) |
 * | `/api/pmh/auth/me` | GET | wer bin ich |
 *
 * ## Warum der Weg frei ist — gemessen, nicht angenommen
 *
 * Der Kern besitzt `/api` als **Präfix**
 * (`dsh-client-connection/lib/index.js`: *„Route prefix owning every api request
 * (`/api` and `/api/<anything>`)"*). Ob ein eigener `POST` dort überhaupt
 * ankommt, war die entscheidende Frage vor dem Bau. Gemessen in
 * `dsh-host-webserver/lib/index.js`, `match(pathname)`:
 *
 * > *„Longest-prefix-wins over the prefix table after an exact-table miss."*
 *
 * Also: **erst die genaue Tabelle**, dann das längste Präfix. Ein genauer Weg
 * gewinnt gegen `/api`. Der Namensraum `pmh` macht zusätzlich jede Kollision
 * unmöglich — die Aufrufe des Kerns heißen `session/…`, `workspace/…`,
 * `plugin/…`.
 *
 * Und `register()` **wirft** bei einem doppelten Weg (`webserver: duplicate …`),
 * statt still zu überschreiben: eine Kollision fällt beim Start auf, nicht im
 * Betrieb.
 *
 * ## Die drei Dienste, die dieses Paket selbst baut
 *
 * `UserStore`, `SessionStore` und `AuthEventSink` kommen aus dem Speicherpaket;
 * den **Datenbankzugang**, den **Hasher** und die **Ratenbegrenzung** baut dieses
 * Paket. Warum:
 *
 * * Den Zugang, weil `DATABASE_URL` eine Angabe der **Anwendung** ist und nicht
 *   des Speichers — der Speicher bekommt einen Zugang und weiß nicht, woher.
 * * Den Hasher, weil die Parameter eine Betriebsentscheidung sind (19 MiB, zwei
 *   Durchgänge) und an **einer** Stelle stehen sollen.
 * * Die Ratenbegrenzung, weil sie **je Prozeß** gilt. Ein Zähler in der Datenbank
 *   wäre bei jedem Anmeldeversuch ein zusätzlicher Schreibvorgang — und der
 *   Angriff, gegen den sie schützt, ist gerade der, der viele Versuche macht.
 *
 * ## Woher die Angaben kommen
 *
 * Aus `process.env`. **Nicht** über einen Dienst des Kerns: ein Dienstname wäre
 * eine Annahme über den Kern, und ob es ihn gibt, ist nicht gemessen. Bun lädt
 * `.env` aus dem Arbeitsverzeichnis, und der Host wird aus der Projektwurzel
 * gestartet — dort liegt die Datei.
 *
 * ## Was der Betreiber wissen muß
 *
 * * **Ohne `DATABASE_URL` hängt sich dieses Paket nicht ein.** Es meldet das
 *   deutlich und läßt den Host weiterlaufen. Ein Host, der wegen einer fehlenden
 *   Angabe gar nicht startet, macht die Fehlersuche schwerer als nötig.
 * * **Die Verbindung ist eine je Prozeß**, mit `max: 4`. Eine Anmeldung braucht
 *   wenige Abfragen; vier gleichzeitige genügen für einen einzelnen Host.
 *
 * @module @prometheus-harness/auth-http
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { Argon2PasswordHasher, DEFAULT_SESSION_POLICY, MemoryRateLimiter } from '@prometheus-harness/auth'
import { resolveEigenesHome } from '@prometheus-harness/home-paths'
import { erzeugeSpeicher, type SqlZugang, type TransaktionsZugang } from '@prometheus-harness/store-postgres'
import { claimAblageImHome } from './claim-store.ts'
import { wegAbmelden, wegAnmelden, wegIch, wegRegistrieren } from './http.ts'
import { PFAD_ABMELDEN, PFAD_ANMELDEN, PFAD_ICH, PFAD_REGISTRIEREN, type Umgebung } from './paths.ts'
// **Die Anmeldeseite** — HTML und JavaScript, ausgeliefert von unserem eigenen Weg.
// Sie ist additiv: sie entscheidet keine Regel, sie zeigt die Antworten der Wege.
import { PFAD_SEITE, PFAD_SEITE_API, PFAD_SEITE_JS, seitenWege } from './page.ts'
// **Die gebaute Anmeldeseite und die Schnittstelle danach** — am Ursprung des Hosts.
import { anmeldungsWege, bauVerzeichnis, bauVorhanden, PFAD_ANMELDUNG, PFAD_START } from './login.ts'
// **Die Brücke zur Token-Tür**: aus der 401 des Kerns wird die Anmeldeseite, und ein
// angemeldeter Administrator bekommt die Token-Adresse.
import { PFAD_ZUGANG, sperreUmbiegen, verbindungAus, zugangsWege } from './access.ts'
// **Die Quellordner**: lesen, anlegen, Zugriff setzen, entfernen — je Mandant aus der Sitzung.
import { PFAD_ORDNER, ordnerWege } from './folders.ts'

export { ABLAGEDATEI, claimAblageImHome } from './claim-store.ts'

export {
  akteurAus,
  darfBenutzerAnlegen,
  isolationAnsicht,
  type IsolationAnsicht,
} from './rights.ts'

export {
  PFAD_ABMELDEN,
  PFAD_ANMELDEN,
  PFAD_ICH,
  PFAD_REGISTRIEREN,
  CSRF_KOPFZEILE,
  MAX_KOERPER_BYTES,
  adresseBrauchbar,
  anmelden,
  abmelden,
  cookieWert,
  registrieren,
  sitzungsCookieName,
  werBinIch,
  type Antwort,
  type Herkunft,
  type Umgebung,
} from './paths.ts'

export {
  CSRF_COOKIE,
  cookieKopf,
  herkunft,
  leseKoerper,
  macheWeg,
  sende,
  wegAbmelden,
  wegAnmelden,
  wegIch,
  wegRegistrieren,
  type Weg,
} from './http.ts'

export {
  ANGABE_BAU,
  PARAMETER_SPRACHE,
  PFAD_ANMELDUNG,
  PFAD_SPRACHEN,
  PFAD_START,
  anmeldungsWege,
  bauVerzeichnis,
  bauVorhanden,
  entschaerfe,
  schnittstelleHtml,
  wegBau,
  wegSprachen,
  wegStart,
} from './login.ts'

export { PFAD_ZUGANG, eigeneAdresse, sperreUmbiegen, verbindungAus, wegZugang, zugangsWege } from './access.ts'

export {
  PFAD_ORDNER,
  PFAD_ORDNER_ANLEGEN,
  PFAD_ORDNER_ENTFERNEN,
  PFAD_ORDNER_ZUGRIFF,
  ordnerWege,
  wegOrdnerAnlegen,
  wegOrdnerEntfernen,
  wegOrdnerListe,
  wegOrdnerZugriff,
} from './folders.ts'

export const name = 'pmh-auth-http'

/**
 * Was dieses Paket braucht.
 *
 * **Nur `webServer`.** Die Datenbank und der Hasher werden hier gebaut, nicht
 * hereingereicht — es gibt keinen Dienst, der sie bereitstellt. Sollte später
 * eines der anderen Pakete einen Datenbankdienst anbieten, gehört dieser Eintrag
 * erweitert und der eigene Aufbau entfernt.
 */
export const inject = ['webServer']

/** Die Angaben, die aus der Außenwelt kommen. */
export interface Angaben {
  readonly adresse: string
  /** Die Obergrenze der Benutzerzahl; `undefined` heißt **nicht entschieden**. */
  readonly maxUsers: number | undefined
  /** Ob über TLS ausgeliefert wird. */
  readonly sicher: boolean
}

/**
 * Die Außenwelt, aus der die Angaben kommen.
 *
 * **Warum ein Zeichenschlüssel-Verzeichnis und keine zwei benannten Felder.**
 * Der erste Entwurf deklarierte `{DATABASE_URL?, PMH_MAX_USERS?}`. Der Typlauf
 * wies `process.env` dafür ab:
 *
 * ```
 * error TS2559: Type 'ProcessEnv' has no properties in common with type
 *   '{ readonly DATABASE_URL?: string | undefined; … }'
 * ```
 *
 * `process.env` ist ein Verzeichnis mit Zeichenschlüsseln; zwei benannte Felder
 * daran zu erwarten, macht daraus einen „schwachen Typ", den TypeScript nur
 * annimmt, wenn **mindestens ein** Feld gemeinsam ist — und keines ist es.
 */
export type Aussenwelt = Readonly<Record<string, string | undefined>>

/**
 * Liest die Angaben aus der Außenwelt.
 *
 * @param aussenwelt - die Umgebungsvariablen
 * @param protokoll - `'http:'` oder `'https:'`; bestimmt den Cookienamen
 * @returns die Angaben oder `undefined`, wenn `DATABASE_URL` fehlt
 */
export function angabenAus(aussenwelt: Aussenwelt, protokoll: string): Angaben | undefined {
  const adresse = aussenwelt.DATABASE_URL?.trim() ?? ''
  if (adresse === '') return undefined

  // **Kein stiller Zahlenrückfall.** Fehlt die Angabe oder ist sie unbrauchbar,
  // ist die Grenze **nicht entschieden** — und das steht als `undefined` da,
  // nicht als eine große Zahl, die niemand gesetzt hat. Eine große Zahl verbirgt,
  // daß nichts entschieden wurde.
  const rohMax = aussenwelt.PMH_MAX_USERS?.trim() ?? ''
  const zahl = Number(rohMax)
  const maxUsers = rohMax !== '' && Number.isInteger(zahl) && zahl > 0 ? zahl : undefined

  return { adresse, maxUsers, sicher: protokoll === 'https:' }
}

/**
 * Baut den Datenbankzugang — **faul**.
 *
 * ## Warum `await import('postgres')` und kein Import oben in der Datei
 *
 * Dieses Paket soll **ladbar** bleiben, auch wenn das `postgres`-Paket fehlt:
 * die Wege sind ohne Datenbank prüfbar, und ein fehlendes Paket darf nicht schon
 * beim Laden scheitern. Geladen wird es erst beim ersten Zugriff.
 *
 * ## Die Verbesserung gegenüber dem Vorbild: ein gescheiterter Versuch wird nicht festgehalten
 *
 * `readiness` merkt sich das **Ergebnis** des Ladens (`verbindung ??= …`). Ist der
 * erste Versuch gescheitert — Datenbank noch nicht oben, Netz für einen Moment
 * weg —, bleibt die **abgewiesene** Zusage für immer liegen: jede spätere Anfrage
 * bekommt sofort denselben Fehler, und der Host kann sich **nie wieder**
 * verbinden, ohne neu zu starten. Ein Neustart, den niemand mit einem
 * Sekundenausfall in Verbindung bringt.
 *
 * Hier wird die Zusage bei einem Fehler **verworfen**, damit der nächste Versuch
 * es erneut probieren darf.
 *
 * @param adresse - die Verbindungsadresse
 * @param max - die größte Zahl gleichzeitiger Verbindungen
 * @returns der Zugang
 */
export function macheSqlZugang(adresse: string, max = 4): TransaktionsZugang {
  let verbindung: Promise<SqlZugang> | undefined

  const hole = async (): Promise<SqlZugang> => {
    if (verbindung === undefined) {
      verbindung = (async (): Promise<SqlZugang> => {
        const { default: postgres } = (await import('postgres')) as unknown as {
          default: (a: string, o?: unknown) => SqlZugang
        }
        return postgres(adresse, { max, connect_timeout: 5, onnotice: () => undefined })
      })().catch((fehler: unknown) => {
        // **Verwerfen, damit es erneut versucht wird.** Ohne diese Zeile bliebe
        // die abgewiesene Zusage liegen und der Zugang wäre dauerhaft tot.
        verbindung = undefined
        throw fehler
      })
    }
    return verbindung
  }

  return {
    async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
      const zugang = await hole()
      return zugang.unsafe(anweisung, werte)
    },
    /**
     * **Die Transaktion — nachgereicht am 15.10.2026.**
     *
     * Der Zugang hatte sie nicht, und das fiel erst auf, als die Quellordner dazukamen: sie
     * werden über `mitMandant` gelesen und geschrieben, und das **verlangt** eine Transaktion
     * (sonst bliebe `set_config(…, true)` in der Verbindung stehen und die nächste Abfrage
     * liefe unter einem anderen Benutzer). Der Treiber kann es; hier wird es nur
     * durchgereicht — die innere Sicht ist genau die Form, die `mitMandant` erwartet.
     */
    async begin<T>(arbeit: (innerhalb: SqlZugang) => Promise<T>): Promise<T> {
      const zugang = (await hole()) as unknown as {
        begin<T2>(cb: (tx: { unsafe(a: string, w?: readonly unknown[]): Promise<unknown> }) => Promise<T2>): Promise<T2>
      }
      return await zugang.begin(
        async (tx) =>
          await arbeit({
            async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
              return await tx.unsafe(anweisung, werte)
            },
          }),
      )
    },
  }
}

/**
 * Baut die Umgebung der Wege.
 *
 * @param sql - der Datenbankzugang (echt, nur aufgeschoben)
 * @param angaben - die Angaben aus der Außenwelt
 * @param home - das Harness-Home (Erstinbetriebnahme und Isolation)
 * @returns die Umgebung
 */
export function umgebungAus(sql: SqlZugang, angaben: Angaben, home: string): Umgebung {
  return {
    speicher: erzeugeSpeicher(sql),
    hasher: new Argon2PasswordHasher(),
    limiter: new MemoryRateLimiter(),
    sicher: angaben.sicher,
    maxUsers: angaben.maxUsers,
    jetzt: () => new Date(),
    warten: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    home,
    claimAblage: claimAblageImHome(home),
  }
}

/**
 * Hängt die vier Wege ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const protokoll = (ctx.webServer as { readonly protocol?: string }).protocol ?? 'http:'
  const angaben = angabenAus(process.env, protokoll)

  if (angaben === undefined) {
    // **Deutlich melden, nicht still nichts tun.** Ein fehlendes `DATABASE_URL`
    // heißt: es gibt keine Anmeldung. Wer das im Betrieb sucht, soll es im
    // Protokoll finden und nicht aus einem 404 schließen müssen.
    process.stderr.write(
      `[pmh] ${name}: nicht eingehängt — DATABASE_URL ist nicht gesetzt.\n` +
        '  Die Anmeldung braucht die Rolle `pmh_app` (Daten, kein DDL).\n' +
        '  `scripts/install.mjs` schreibt den Wert nach `.env`.\n' +
        `  Die Fristen der Sitzung: ${String(Math.round(DEFAULT_SESSION_POLICY.idleMs / 3_600_000))} h Ruhe, ` +
        `${String(Math.round(DEFAULT_SESSION_POLICY.absoluteMs / 86_400_000))} Tage Höchstfrist.\n`,
    )
    return
  }

  // **Woher das Home kommt.** Aus `PMH_HOME`, sonst `~/.pmh` — und **nicht** aus
  // `DSH_HOME`. Der erste Entwurf nahm `resolvePmhHome()`, dessen Kette
  // `PMH_HOME → DSH_HOME → ~/.pmh` lautet. Auf diesem Rechner ist `DSH_HOME`
  // gesetzt, also zeigte das Home auf `~/.dsh` — das Home des **anderen**
  // Harness. Gemessen am 13.10.2026: `scripts/claim.mjs` legte dort drei Dateien
  // an. `resolveEigenesHome()` wirft, wenn der Pfad auf ein DSH-Home zeigt.
  //
  // Unsere Dateien — Gerätekennung, Claim — gehören in **unser** Home; das Home
  // des Kerns (`--home` des Hosts) ist ein dritter Ort und dort liegen seine
  // Sitzungen.
  const home = resolveEigenesHome()

  const zugang = macheSqlZugang(angaben.adresse)
  const umgebung = umgebungAus(zugang, angaben, home)

  // **Die gebaute Anmeldeseite an **diesem** Ursprung.** Der Betreiber hat gefragt, ob die
  // Anmeldung nicht auf demselben Port liegen muß wie der Host — sie muß: unsere Kekse sind
  // `SameSite=Strict`, und ein Keks kommt nur bei **derselben Herkunft** an. Auf einem eigenen
  // Port wäre die Anmeldung **still wirkungslos**.
  //
  // Fehlt der Bau, leitet der Weg auf die eingebaute Seite um. Der Hinweis hier steht, damit
  // die Ursache auffindbar bleibt — ein stiller Rückfall wäre nicht zu unterscheiden von einem
  // gewollten Zustand.
  const bau = bauVerzeichnis()
  void bauVorhanden(bau).then((da) => {
    if (!da) {
      process.stderr.write(
        `[pmh] ${name}: keine Bauausgabe der Anmeldeseite unter ${bau}.\n` +
          `  ${PFAD_ANMELDUNG}/ leitet deshalb auf ${PFAD_SEITE} um (eingebaute Seite).\n` +
          '  Bauen mit:  cd apps/login_web && bun run build\n',
      )
    }
  })

  ctx.effect(() => {
    const wege: readonly WebRoute[] = [
      { kind: 'exact', path: PFAD_REGISTRIEREN, handler: wegRegistrieren(umgebung) },
      { kind: 'exact', path: PFAD_ANMELDEN, handler: wegAnmelden(umgebung) },
      { kind: 'exact', path: PFAD_ABMELDEN, handler: wegAbmelden(umgebung) },
      { kind: 'exact', path: PFAD_ICH, handler: wegIch(umgebung) },
      // **Die Anmeldeseite kommt dazu, die vier Wege bleiben unberührt.** Sie ist
      // additiv: sie entscheidet nichts, sie zeigt nur, was die Wege antworten.
      ...seitenWege(),
      // **Die gebaute Seite und die Schnittstelle danach** — gleicher Ursprung wie die vier
      // Wege, damit der Sitzungskeks überhaupt mitkommt. `/start` liest die Sitzung über
      // **dieselbe** Funktion wie `GET /api/pmh/auth/me`.
      ...anmeldungsWege(umgebung, bau),
      // **Die Brücke zur Token-Tür** — nur ein Weg: die Adresse für einen Administrator.
      ...zugangsWege(umgebung, ctx),
      // **Die Quellordner** — vier Wege, je Mandant aus der Sitzung, die drei ändernden mit CSRF.
      ...ordnerWege(umgebung, zugang),
    ]
    const ab = wege.map((weg) => ctx.webServer.register(weg))

    // **Die Sperre wird nachgeholt, bis sie greift.** Der Kern beantwortet `/` ohne Token mit
    // einer 401-Textzeile; wir biegen genau diese Antwort auf die Anmeldeseite um — ohne eine
    // Datei in `node_modules` zu ändern (siehe `access.ts`).
    //
    // **Warum in Abständen und nicht einmal.** Zwei Live-Versuche sind gescheitert, und der
    // Grund war beide Male die **Zeit**, nicht der Zugriff: unser Paket lädt, bevor der
    // Verbindungsdienst bereitsteht. Mit `ctx.inject` greift es zwar — aber der Rückruf läuft
    // **mehrfach**, der erste Lauf kommt zu früh, und eine Warnung aus dem ersten Lauf stand
    // im Protokoll, obwohl die Brücke arbeitete. Deshalb: nachsehen, nachholen, und erst
    // warnen, wenn nach zehn Versuchen (rund zehn Sekunden) **nichts** greift.
    let sperreZurueck: (() => void) | undefined
    let versuche = 0
    const wecker = setInterval(() => {
      if (sperreZurueck !== undefined) {
        clearInterval(wecker)
        return
      }
      versuche += 1
      sperreZurueck = sperreUmbiegen(ctx)
      if (sperreZurueck !== undefined) {
        // **Ein Satz, der sagt, daß es steht.** Ohne ihn ist im Protokoll nicht zu sehen, ob
        // die Anmeldeseite an der Tür hängt oder nicht.
        process.stderr.write(`[pmh] ${name}: die 401 des Kerns führt auf ${PFAD_ANMELDUNG}/ (Versuch ${String(versuche)})\n`)
        clearInterval(wecker)
        return
      }
      if (versuche >= 10) {
        clearInterval(wecker)
        // **Die Meldung nennt den Befund, nicht nur das Ergebnis.** Beim ersten Versuch stand
        // hier nur „ließ sich nicht umbiegen" — und im Betrieb griff die Brücke trotzdem, weil
        // ein anderer Aufruf sie gesetzt hatte. Wer das liest, soll sehen, **was** fehlte.
        const dienst = verbindungAus(ctx)
        const gefunden = dienst !== undefined
        const methode = typeof dienst?.authorizeIndex === 'function'
        process.stderr.write(
          `[pmh] ${name}: die Sperre des Kerns ließ sich nicht umbiegen.\n` +
            `  Dienst gefunden: ${gefunden ? 'ja' : 'nein'}, authorizeIndex: ${methode ? 'ja' : 'nein'}.\n` +
            '  Erwartet wird `connection.authorizeIndex` (dsh-client-connection).\n',
        )
      }
    }, 1_000)
    // Der Wecker darf den Rechner nicht am Laufen halten.
    wecker.unref?.()

    return () => {
      clearInterval(wecker)
      sperreZurueck?.()
      for (const einer of ab.reverse()) einer()
    }
  }, `${name} ${PFAD_REGISTRIEREN} ${PFAD_ANMELDEN} ${PFAD_ABMELDEN} ${PFAD_ICH} ${PFAD_SEITE} ${PFAD_SEITE_API} ${PFAD_SEITE_JS} ${PFAD_ANMELDUNG} ${PFAD_START} ${PFAD_ZUGANG} ${PFAD_ORDNER}`)
}

export default apply
