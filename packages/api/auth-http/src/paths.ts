/**
 * Die Wege der Anmeldung — als **reine** Funktionen, ohne Socket.
 *
 * ## Warum getrennt von HTTP
 *
 * Diese Datei kennt kein `IncomingMessage`, kein `ServerResponse` und keinen
 * Socket. Sie bekommt eine Eingabe (Adresse, Passwort, IP) und gibt eine
 * {@link Antwort} zurück: Status, Kopfzeilen, Körper. Der HTTP-Teil liegt in
 * `http.ts`, das Einhängen in den Host in `index.ts`.
 *
 * **Warum das so ist.** Eine Anmeldung, die nur über einen laufenden Server
 * prüfbar ist, wird nicht geprüft. Hier läßt sich jeder Fall — schwaches Passwort,
 * vergebene Adresse, falsche Zugangsdaten, fehlendes CSRF — **ohne** Server und
 * **ohne** Datenbank durchspielen. Der Integrationstest gegen echtes HTTP kommt
 * zusätzlich, nicht statt.
 *
 * ## Die Form der Antwort — dieselbe wie die des Kerns
 *
 * Erfolg: `{ok: true, value: …}` · Fehler: `{ok: false, error: {code, message}}`.
 *
 * Der Kern des Harness antwortet bereits so (`docs/status/api-nachweis.md`: „Der
 * Server antwortet IMMER HTTP 200 — Fehler stehen im Objekt"). Diese Form
 * beizubehalten heißt: wer die Oberfläche an den Kern angepaßt hat, muß sie für
 * diese Wege **nicht** noch einmal anpassen. Der **HTTP-Status** wird trotzdem
 * gesetzt — er ist für Zwischenschichten (Proxy, Protokoll, Fehlersuche) da, das
 * Objekt für den Aufrufer.
 *
 * ## Was hier bewußt NICHT passiert
 *
 * Kein Passwort, kein Token und kein Hash verläßt diese Datei in einer Antwort.
 * Was zurückgeht, ist die Kennung, die Adresse, der Anzeigename und die Rolle.
 *
 * @module @prometheus-harness/auth-http/wege
 */

import {
  applyBackoff,
  authenticate,
  checkEmail,
  cookieNameFor,
  createSession,
  CSRF_COOKIE_NAME,
  DEFAULT_SESSION_POLICY,
  hitAll,
  LOGIN_LIMITS,
  loginAccountKey,
  loginIpKey,
  normalizeEmail,
  REGISTER_LIMITS,
  register,
  registerIpKey,
  revokeSession,
  sessionCookie,
  csrfCookie,
  clearSessionCookie,
  SESSION_NOT_USABLE,
  touchSession,
  verifyCsrf,
  verifySession,
  type PasswordHasher,
  type RateLimiter,
} from '@prometheus-harness/auth'
// **`AuthSpeicher` kommt aus dem Speicherpaket, nicht aus dem Regelkern.** Der
// Regelkern kennt die drei Schnittstellen einzeln (`UserStore`, `SessionStore`,
// `AuthEventSink`) und weiß nichts davon, daß sie zusammengebaut werden. Die
// Zusammenfassung ist eine Sache des Speichers.
import type { AuthSpeicher } from '@prometheus-harness/store-postgres'
// **Die Erstinbetriebnahme und die Rechte.** Beide Pakete gab es vorher schon —
// mit 21 bzw. 30 eigenen Prüfungen und **ohne einen einzigen Aufrufer**. Ein
// Recht, das niemand abfragt, ist keines.
import {
  CLAIMDATEI,
  entferneClaimdatei,
  erstinbetriebnahmeOffen,
  leseMaschinenbindung,
  leseOderErzeugeGeraeteId,
  pruefeClaim,
  type ClaimAblage,
} from '@prometheus-harness/claim'
import { akteurAus, darfBenutzerAnlegen, isolationAnsicht, type IsolationAnsicht } from './rights.ts'

// ---------------------------------------------------------------------------
// Die Wege
// ---------------------------------------------------------------------------

/**
 * Unter welchen Pfaden die Wege liegen.
 *
 * **Warum unter `/api/pmh/…` und nicht unter `/api/auth/…`.** Der Kern besitzt
 * `/api` als **Präfix** und bedient dort seine eigenen Aufrufe
 * (`dsh-client-connection/lib/index.js`: *„Route prefix owning every api request
 * (`/api` and `/api/<anything>`)"*). Gemessen ist die Auflösung
 * (`dsh-host-webserver/lib/index.js`, `match`): **erst die genaue Tabelle, dann
 * das längste Präfix**. Ein genauer Weg gewinnt also gegen den Kern.
 *
 * Der Namensraum `pmh` macht zusätzlich **jede** Kollision unmöglich: die
 * Aufrufe des Kerns heißen `session/…`, `workspace/…`, `plugin/…` — ein
 * `pmh/…` gibt es dort nicht. Und `register()` **wirft** bei einem doppelten Weg,
 * statt still zu überschreiben; eine Kollision fällt damit beim Start auf und
 * nicht im Betrieb.
 */
export const PFAD_REGISTRIEREN = '/api/pmh/auth/register'
export const PFAD_ANMELDEN = '/api/pmh/auth/login'
export const PFAD_ABMELDEN = '/api/pmh/auth/logout'
export const PFAD_ICH = '/api/pmh/auth/me'

/** Die Kopfzeile, in der die Anwendung ihren CSRF-Wert mitschickt. */
export const CSRF_KOPFZEILE = 'x-pmh-csrf'

/**
 * Die größte Körperlänge, die angenommen wird — 8 KiB.
 *
 * **Warum eine Grenze und warum so klein.** Ein Anmeldekörper besteht aus einer
 * Adresse, einem Passwort und einem Anzeigenamen — das sind wenige hundert Byte.
 * Alles darüber ist kein Benutzer, sondern ein Versuch, den Speicher zu füllen.
 * Der Kern setzt für seine Aufrufe 300 MiB an (er trägt Bilder durch); für eine
 * Anmeldung wäre dieselbe Zahl eine Einladung.
 */
export const MAX_KOERPER_BYTES = 8 * 1024

// ---------------------------------------------------------------------------
// Die Antwort
// ---------------------------------------------------------------------------

/** Was ein Weg zurückgibt — unabhängig davon, wer ihn aufruft. */
export interface Antwort {
  readonly status: number
  readonly koepfe: Readonly<Record<string, string | readonly string[]>>
  readonly koerper: unknown
}

/** Der Erfolgsfall. */
export function gut(value: unknown, koepfe: Antwort['koepfe'] = {}, status = 200): Antwort {
  return { status, koepfe, koerper: { ok: true, value } }
}

/**
 * Der Fehlerfall.
 *
 * `code` ist für den Aufrufer bestimmt und **stabil**; `message` ist für einen
 * Menschen. Beides steht im Körper — der HTTP-Status steht **zusätzlich** daneben,
 * nicht statt dessen.
 */
export function schlecht(status: number, code: string, message: string, koepfe: Antwort['koepfe'] = {}): Antwort {
  return { status, koepfe, koerper: { ok: false, error: { code, message } } }
}

/** Der Benutzer, wie er das Haus verläßt — nie mit Hash. */
export interface BenutzerAnsicht {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly role: 'user' | 'admin'
}

// ---------------------------------------------------------------------------
// Die Umgebung
// ---------------------------------------------------------------------------

/** Alles, was die Wege brauchen — hereingereicht, nicht selbst geholt. */
export interface Umgebung {
  readonly speicher: AuthSpeicher
  readonly hasher: PasswordHasher
  readonly limiter: RateLimiter
  /** Ob über TLS ausgeliefert wird. Bestimmt den Cookienamen. */
  readonly sicher: boolean
  /** Die Obergrenze der Benutzerzahl; `undefined` heißt unbegrenzt. */
  readonly maxUsers: number | undefined
  /** Zeitquelle — austauschbar, damit Prüfungen nicht von der Uhr abhängen. */
  readonly jetzt: () => Date
  /** Wartefunktion für die Verzögerung — austauschbar, damit Prüfungen nicht warten. */
  readonly warten: (ms: number) => Promise<void>
  /**
   * Das Harness-Home.
   *
   * **Warum die Wege es brauchen.** Zwei Dinge hängen daran: die
   * **Erstinbetriebnahme** (der Claim ist an Rechner, lokalen Nutzer und eine
   * Gerätekennung aus diesem Verzeichnis gebunden) und die **Isolation** eines
   * Akteurs (sein Schreibbereich ist das Home).
   */
  readonly home: string
  /** Wo der Claim der Erstinbetriebnahme liegt. */
  readonly claimAblage: ClaimAblage
}

/** Wer die Anfrage stellt. */
export interface Herkunft {
  /** Die IP. **Vom Socket**, nicht aus einer Kopfzeile — siehe `http.ts`. */
  readonly ip: string | undefined
  readonly userAgent: string | undefined
}

/** Die Fristen des Sitzungscookies, in Sekunden. */
function cookieFristSekunden(): number {
  return Math.floor(DEFAULT_SESSION_POLICY.absoluteMs / 1000)
}

// ---------------------------------------------------------------------------
// Registrieren
// ---------------------------------------------------------------------------

/** Die Eingabe zum Registrieren. */
export interface RegistrierEingabe extends Herkunft {
  readonly email: unknown
  readonly password: unknown
  readonly displayName: unknown
  /** Das Claim-Token der Erstinbetriebnahme — nur beim **ersten** Konto nötig. */
  readonly claimToken?: unknown
  /** Das Sitzungstoken des anlegenden Admins — nur wenn schon Benutzer existieren. */
  readonly token?: string | undefined
  /** Der CSRF-Wert aus der Kopfzeile — Pflicht auf dem Admin-Weg. */
  readonly csrfKopf?: string | undefined
}

/**
 * Legt ein Konto an.
 *
 * **Warum hier NICHT gleich angemeldet wird.** Ein Konto anzulegen und den
 * Benutzer dabei anzumelden sieht freundlich aus und ist eine Entscheidung, die
 * an einer anderen Stelle hingehört: ob ein Konto sofort benutzbar ist, hängt an
 * einer Bestätigung der Adresse — und die gibt es noch nicht. Wer sich anmelden
 * will, ruft danach `anmelden`. Das ist ein Aufruf mehr und eine Annahme weniger.
 *
 * @param umg - die Umgebung
 * @param eingabe - Adresse, Passwort, Anzeigename, Herkunft
 * @returns die Antwort mit dem angelegten Benutzer und Status **201**
 */
export async function registrieren(umg: Umgebung, eingabe: RegistrierEingabe): Promise<Antwort> {
  if (typeof eingabe.email !== 'string' || typeof eingabe.password !== 'string') {
    return schlecht(400, 'eingabe-fehlt', 'Adresse und Passwort sind Pflicht.')
  }
  const anzeigename =
    typeof eingabe.displayName === 'string' && eingabe.displayName.trim() !== ''
      ? eingabe.displayName.trim()
      : eingabe.email.split('@')[0] ?? 'Benutzer'

  // **Die Grenze vor der teuren Arbeit.** Ein Argon2id-Hash kostet 19 MiB und
  // rund 20 ms. Wer Konten in Serie anlegt, soll das nicht auf unsere Kosten tun.
  const grenze = await hitAll(umg.limiter, [
    {
      key: registerIpKey(eingabe.ip ?? 'ohne-ip'),
      limit: REGISTER_LIMITS.perIp.limit,
      windowMs: REGISTER_LIMITS.perIp.windowMs,
    },
  ])
  if (!grenze.allowed) {
    return schlecht(429, 'zu-viele-anfragen', 'Zu viele Registrierungen. Bitte später erneut versuchen.', {
      'retry-after': String(Math.ceil(grenze.retryAfterMs / 1000)),
    })
  }

  // ---------------------------------------------------------------------------
  // DAS TOR — wer darf ein Konto anlegen?
  // ---------------------------------------------------------------------------
  const jetzt = umg.jetzt()
  const anzahl = await umg.speicher.benutzer.count()
  const admins = await umg.speicher.anzahlAdmins()
  let rolle: 'admin' | 'user'

  // **Zwei Bedingungen, und die zweite ist der gemessene Fall.**
  //
  // `erstinbetriebnahmeOffen` ist die Regel des Claim-Pakets: offen, solange es
  // **kein Konto** gibt. Sie deckt den ersten Start ab.
  //
  // Die zweite Bedingung deckt einen Zustand, den die erste übersieht: eine
  // Datenbank mit Konten, aber **ohne Administrator**. Am 13.10.2026 in der
  // Betriebsdatenbank gemessen:
  //
  // ```
  // benutzer=4  davon_admins=0
  // ```
  //
  // Dort konnte **niemand** mehr ein Konto anlegen — die Erstinbetriebnahme war
  // nach der ersten Bedingung zu, und einen Admin, der hätte anlegen dürfen, gab
  // es nicht. Vor der Verdrahtung dieses Tores ging es (schlecht, aber es ging);
  // das Tor hätte daraus eine Aussperrung gemacht.
  //
  // **Warum das sicher ist.** Der Weg bleibt an das Claim-Token **und** an die
  // Bindung an Rechner, lokalen Nutzer und Gerätekennung gebunden. Lokaler Zugang
  // ist die Vertrauenswurzel — genau so, wie `erzeugeClaim` es in die Datei
  // schreibt. Wer keinen Zugang zum Dateisystem hat, kommt auch hier nicht durch.
  const claimWeg = erstinbetriebnahmeOffen(anzahl) || admins === 0

  if (claimWeg) {
    // **Der erste Weg: lokaler Zugang.** Ohne dieses Geheimnis wäre die Regel
    // „der erste darf" eine Einladung — wer den Port vor dem Eigentümer
    // erreicht, bekäme das Adminkonto.
    if (typeof eingabe.claimToken !== 'string' || eingabe.claimToken.trim() === '') {
      return schlecht(
        403,
        'claim-fehlt',
        'Dies ist die Erstinbetriebnahme: das erste Konto braucht das Claim-Token aus ' +
          `${CLAIMDATEI} im Harness-Home. Ohne es könnte jeder, der den Port erreicht, ` +
          'das Adminkonto anlegen.',
      )
    }
    // `leseOderErzeugeGeraeteId` **zuerst**: die Bindung braucht die
    // Gerätekennung, und beim allerersten Lauf gibt es die Datei noch nicht. Sie
    // wird dabei angelegt (Modus 0600) — ohne sie wäre die Bindung nicht prüfbar,
    // sondern nur behauptet.
    leseOderErzeugeGeraeteId(umg.home)
    const bindung = leseMaschinenbindung(umg.home)
    const claimUrteil = await pruefeClaim(eingabe.claimToken, bindung, umg.claimAblage, jetzt)
    if (!claimUrteil.gueltig) {
      // **Die Regel gehört in die Antwort.** Der Eigentümer sitzt hier selbst;
      // „anderer-rechner" ist eine nützlichere Auskunft als „ungültig".
      return schlecht(403, `claim-${claimUrteil.regel}`, claimUrteil.grund)
    }
    rolle = 'admin'
  } else {
    // **Der zweite Weg: ein angemeldeter Admin.** Reihenfolge: Sitzung, dann
    // CSRF, dann das Recht. Ohne Sitzung ist der CSRF-Wert bedeutungslos, und
    // eine Prüfung, die zuerst das Unwichtigere prüft, verrät mehr als nötig.
    if (eingabe.token === undefined || eingabe.token === '') {
      return schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE)
    }
    const geprueft = await verifySession(umg.speicher.sitzungen, eingabe.token).catch(() => undefined)
    if (geprueft === undefined) {
      return schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE)
    }
    // **CSRF auf diesem Weg.** Ein Konto anzulegen ist eine Zustandsänderung im
    // Namen eines Angemeldeten — dieselbe Begründung wie beim Abmelden.
    if (!verifyCsrf(geprueft.session, eingabe.csrfKopf ?? '')) {
      return schlecht(403, 'csrf-fehlt', 'Der CSRF-Wert fehlt oder stimmt nicht.')
    }
    const handelnder = await umg.speicher.benutzer.findById(geprueft.session.userId)
    if (handelnder === undefined) {
      return schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE)
    }
    const recht = darfBenutzerAnlegen(akteurAus(handelnder, umg.home), eingabe.email, jetzt)
    if (!recht.erlaubt) {
      return schlecht(403, `recht-${recht.regel}`, recht.grund)
    }
    rolle = 'user'
  }

  const ergebnis = await register(umg.speicher.benutzer, umg.hasher, eingabe.email, eingabe.password, anzeigename, {
    ...(umg.maxUsers === undefined ? {} : { maxUsers: umg.maxUsers }),
    role: rolle,
    sink: umg.speicher.spur,
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
    ...(eingabe.userAgent === undefined ? {} : { userAgent: eingabe.userAgent }),
  })

  if (ergebnis.ok) {
    // **Die Claim-Datei weg, sobald das Adminkonto steht.** Bliebe sie liegen,
    // läge das Token weiter auf der Platte — und ein Token, das nicht mehr gilt,
    // aber noch existiert, ist eine Einladung, es wieder gültig zu machen
    // (`packages/auth/claim` begründet das so). Den Claim selbst hat
    // `pruefeClaim` bereits als verbraucht markiert.
    if (rolle === 'admin') entferneClaimdatei(umg.home)
    return gut(
      {
        id: ergebnis.user.id,
        email: ergebnis.user.email,
        displayName: ergebnis.user.displayName,
        role: ergebnis.user.role,
      } satisfies BenutzerAnsicht,
      {},
      201,
    )
  }

  // Die Zuordnung Grund → Status steht **einmal** hier und nicht verstreut.
  switch (ergebnis.reason) {
    case 'email-invalid':
      return schlecht(400, 'adresse-unbrauchbar', ergebnis.hint ?? 'Die Adresse ist unbrauchbar.')
    case 'password-weak':
      return schlecht(400, 'passwort-zu-schwach', ergebnis.hint ?? 'Das Passwort ist zu schwach.')
    case 'email-taken':
      // **409 und nicht 400.** Der Aufrufer soll unterscheiden können, ob seine
      // Eingabe falsch war oder ob die Adresse vergeben ist — das ist der
      // Unterschied zwischen „ändere etwas" und „wähle eine andere Adresse".
      return schlecht(409, 'adresse-vergeben', 'Für diese Adresse gibt es bereits ein Konto.')
    case 'store-failed':
      return schlecht(500, 'speicher-fehler', 'Das Konto konnte nicht angelegt werden.')
  }
}

// ---------------------------------------------------------------------------
// Anmelden
// ---------------------------------------------------------------------------

/** Die Eingabe zum Anmelden. */
export interface AnmeldeEingabe extends Herkunft {
  readonly email: unknown
  readonly password: unknown
}

/**
 * Meldet an und setzt beide Cookies.
 *
 * **Was die Antwort NICHT verrät.** Auf ein unbekanntes Konto und ein falsches
 * Passwort kommt **dieselbe** Antwort — Status, Code und Text. Der Regelkern
 * rechnet bei einem unbekannten Konto gegen einen Vergleichs-Hash, damit auch die
 * **Dauer** keinen Unterschied zeigt; diese Datei darf ihn nicht wieder einbauen,
 * indem sie etwa bei unbekanntem Konto früher zurückkehrt.
 *
 * @param umg - die Umgebung
 * @param eingabe - Adresse, Passwort, Herkunft
 * @returns die Antwort mit den beiden Cookies
 */
export async function anmelden(umg: Umgebung, eingabe: AnmeldeEingabe): Promise<Antwort> {
  if (typeof eingabe.email !== 'string' || typeof eingabe.password !== 'string') {
    return schlecht(400, 'eingabe-fehlt', 'Adresse und Passwort sind Pflicht.')
  }

  const normalisiert = normalizeEmail(eingabe.email)
  const kontoschluessel = loginAccountKey(normalisiert)
  const ipSchluessel = loginIpKey(eingabe.ip ?? 'ohne-ip')

  const grenze = await hitAll(umg.limiter, [
    { key: kontoschluessel, limit: LOGIN_LIMITS.perAccount.limit, windowMs: LOGIN_LIMITS.perAccount.windowMs },
    { key: ipSchluessel, limit: LOGIN_LIMITS.perIp.limit, windowMs: LOGIN_LIMITS.perIp.windowMs },
  ])
  if (!grenze.allowed) {
    return schlecht(429, 'zu-viele-anfragen', 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.', {
      'retry-after': String(Math.ceil(grenze.retryAfterMs / 1000)),
    })
  }

  const ergebnis = await authenticate(
    umg.speicher.benutzer,
    umg.hasher,
    eingabe.email,
    eingabe.password,
    umg.speicher.spur,
    {
      ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
      ...(eingabe.userAgent === undefined ? {} : { userAgent: eingabe.userAgent }),
    },
  )

  if (!ergebnis.ok) {
    // **Die Verzögerung bei Fehlversuchen.** Sie hängt an der Zahl der
    // Fehlversuche für dieses Konto — nicht daran, ob es das Konto gibt — und
    // wird nur bei einem Fehlversuch angewandt.
    const treffer = grenze.hits.find((einer) => einer.key === kontoschluessel)
    await applyBackoff(treffer?.hit.count ?? 0, umg.warten)

    const nachricht = ergebnis.reason === 'disabled' ? 'Dieses Konto ist gesperrt.' : 'Adresse oder Passwort ist falsch.'
    const code = ergebnis.reason === 'disabled' ? 'konto-gesperrt' : 'zugangsdaten-falsch'
    return schlecht(401, code, nachricht)
  }

  // **Der Prüfspur sagen, daß es geklappt hat.** Ohne diesen Eintrag steht in der
  // Spur nur, was schiefging — und die Frage „wurde dieses Konto benutzt?" wäre
  // nicht zu beantworten.
  //
  // **Warum `login-success` und nicht `login-ok`.** Der erste Entwurf schrieb
  // `login-ok` — geraten. Der Typlauf hat es belegt: die Ereignisarten sind eine
  // abschließende Aufzählung in `packages/auth/auth/src/identity.ts`, und sie
  // kennt `login-success`. Ein geratener Name wäre zur Laufzeit in die Spalte
  // `kind` gegangen (dort steht freier Text, es gibt keine Prüfregel) und hätte
  // eine Spur erzeugt, die **niemand** findet, der nach `login-success` sucht.
  await umg.speicher.spur.record({
    kind: 'login-success',
    userId: ergebnis.user.id,
    email: ergebnis.user.email,
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
    userAgent: eingabe.userAgent ?? '',
  })

  const sitzung = await createSession(umg.speicher.sitzungen, ergebnis.user.id, {
    ...(eingabe.userAgent === undefined ? {} : { userAgent: eingabe.userAgent }),
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
  })

  const cookieOptionen = { secure: umg.sicher, maxAgeSeconds: cookieFristSekunden() }
  return gut(
    {
      id: ergebnis.user.id,
      email: ergebnis.user.email,
      displayName: ergebnis.user.displayName,
      role: ergebnis.user.role,
    } satisfies BenutzerAnsicht,
    {
      'set-cookie': [sessionCookie(sitzung.token, cookieOptionen), csrfCookie(sitzung.csrf, cookieOptionen)],
    },
  )
}

// ---------------------------------------------------------------------------
// Abmelden
// ---------------------------------------------------------------------------

/** Die Eingabe zum Abmelden. */
export interface AbmeldeEingabe {
  /** Das Sitzungstoken — aus dem Cookie, nicht aus dem Körper. */
  readonly token: string | undefined
  /** Der CSRF-Wert aus der Kopfzeile. */
  readonly csrfKopf: string | undefined
}

/**
 * Meldet ab.
 *
 * **Warum hier ein CSRF-Nachweis verlangt wird und beim Anmelden nicht.** Anmelden
 * ist harmlos, wenn es eine fremde Seite auslöst — das Ergebnis wäre eine Sitzung,
 * die der Angreifer nicht lesen kann. **Abmelden** dagegen ist eine
 * Zustandsänderung: eine fremde Seite könnte einen Benutzer abmelden, und das ist
 * eine Belästigung, die sich nicht zurücknehmen läßt (die Sitzung ist widerrufen).
 *
 * **Warum ein ungültiges Token trotzdem mit 204 endet.** Ein Abmelden, das bei
 * einem bereits widerrufenen Token einen Fehler meldete, verriete, ob das Token
 * einmal gültig war. Beide Fälle räumen die Cookies und melden Erfolg.
 *
 * @param umg - die Umgebung
 * @param eingabe - Token und CSRF-Wert
 * @returns **204** ohne Körper
 */
export async function abmelden(umg: Umgebung, eingabe: AbmeldeEingabe): Promise<Antwort> {
  const loeschen = {
    'set-cookie': [clearSessionCookie({ secure: umg.sicher }), `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Strict`],
  }

  if (eingabe.token === undefined || eingabe.token === '') {
    return { status: 204, koepfe: loeschen, koerper: undefined }
  }

  const geprueft = await verifySession(umg.speicher.sitzungen, eingabe.token).catch(() => undefined)
  if (geprueft === undefined) {
    return { status: 204, koepfe: loeschen, koerper: undefined }
  }

  if (!verifyCsrf(geprueft.session, eingabe.csrfKopf ?? '')) {
    return schlecht(403, 'csrf-fehlt', 'Der CSRF-Wert fehlt oder stimmt nicht.')
  }

  await revokeSession(umg.speicher.sitzungen, geprueft.session.id, 'logout')
  // **Das Abmelden gehört in die Spur.** Es ist die zweite Hälfte der Frage „wer
  // war wann da": ohne diesen Eintrag endet jede Spur mit der letzten Nutzung,
  // und ein Abmelden ließe sich von einem abgebrochenen Fenster nicht
  // unterscheiden. `revokeSession` bekommt keine Senke — der Aufrufer trägt ein.
  await umg.speicher.spur.record({
    kind: 'logout',
    userId: geprueft.session.userId,
    userAgent: geprueft.session.userAgent,
  })
  return { status: 204, koepfe: loeschen, koerper: undefined }
}

// ---------------------------------------------------------------------------
// Wer bin ich
// ---------------------------------------------------------------------------

/**
 * Gibt den angemeldeten Benutzer zurück.
 *
 * **Warum die Sitzung dabei fortgeschrieben wird.** Jede Anfrage ist eine
 * Nutzung. Ohne {@link touchSession} würde die Ruhefrist nie verlängert, und ein
 * Benutzer, der den ganzen Tag arbeitet, wäre nach zwölf Stunden abgemeldet,
 * obwohl er nie weg war. Der Regelkern entscheidet selbst, ob geschrieben werden
 * muß (`shouldTouch`) — er drosselt auf höchstens einmal je Minute.
 *
 * @param umg - die Umgebung
 * @param eingabe - das Sitzungstoken
 * @returns die Antwort mit dem Benutzer
 */
export async function werBinIch(umg: Umgebung, eingabe: { readonly token: string | undefined }): Promise<Antwort> {
  if (eingabe.token === undefined || eingabe.token === '') {
    return schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE)
  }

  const geprueft = await verifySession(umg.speicher.sitzungen, eingabe.token).catch(() => undefined)
  if (geprueft === undefined) {
    // **Wörtlich dieselbe Meldung wie bei einem widerrufenen Token.** Ein
    // Unterschied wäre meßbar und verriete, ob ein geratenes Token je existiert
    // hat. Der Regelkern hält das so; diese Datei übernimmt es unverändert.
    return schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE)
  }

  const benutzer = await umg.speicher.benutzer.findById(geprueft.session.userId)
  if (benutzer === undefined) {
    return schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE)
  }
  if (benutzer.disabledAt !== undefined) {
    return schlecht(403, 'konto-gesperrt', 'Dieses Konto ist gesperrt.')
  }

  await touchSession(umg.speicher.sitzungen, geprueft, DEFAULT_SESSION_POLICY, umg.jetzt)

  // **Die Isolation gehört in die Antwort.** Ohne sie müßte die Oberfläche
  // raten, was sie darf: welche Pfade lesbar sind, ob Netz und Prozesse erlaubt
  // sind. Geraten wird falsch — und dann versucht sie etwas, das abgewiesen wird,
  // oder sie läßt etwas bleiben, das erlaubt gewesen wäre.
  //
  // **Seit Migration 0005 kommt sie aus der Datenbank, wenn dort ein Profil
  // liegt.** Bis dahin wurde sie bei jeder Anfrage abgeleitet; ein Benutzer
  // konnte also gar kein eigenes Profil haben. Gibt es keines, gilt weiter die
  // Ableitung — siehe `akteurAus`.
  //
  // **Warum eine eigene Ansicht und nicht die Isolation selbst.** Was in einer
  // Antwort steht, ist öffentlich. Eine benannte Auswahl ist eine Stelle, an der
  // man sieht, was hinausgeht; ein durchgereichtes Objekt ist eine, an der man es
  // nicht sieht. Siehe `isolationAnsicht`.
  const eigenesProfil = await umg.speicher.ladeProfil(benutzer.id)
  const akteur = akteurAus(benutzer, umg.home, eigenesProfil)
  return gut({
    id: benutzer.id,
    email: benutzer.email,
    displayName: benutzer.displayName,
    role: benutzer.role,
    isolation: isolationAnsicht(akteur.isolation),
  } satisfies BenutzerAnsicht & { readonly isolation: IsolationAnsicht })
}

// ---------------------------------------------------------------------------
// Ein Weg, der prüft, ob die Adresse brauchbar ist — ohne etwas anzulegen
// ---------------------------------------------------------------------------

/**
 * Prüft eine Adresse, ohne etwas zu speichern.
 *
 * **Warum das keinen eigenen Weg bekommt.** Eine Schnittstelle „ist diese Adresse
 * frei?" ist eine **Auskunft über fremde Konten**: wer sie abfragt, kann
 * durchprobieren, wer angemeldet ist. Der Regelkern hat die Prüfung
 * ({@link checkEmail}) für die Eingabe, nicht für die Auskunft. Diese Funktion
 * steht hier, damit die Form prüfbar ist — sie ist **nicht** an einen Weg
 * gehängt.
 *
 * @param email - die zu prüfende Adresse
 * @returns ob sie die Form erfüllt
 */
export function adresseBrauchbar(email: unknown): boolean {
  return typeof email === 'string' && checkEmail(email).ok
}

/** Der Cookiename, unter dem die Sitzung liegt — abhängig von TLS. */
export function sitzungsCookieName(umg: Umgebung): string {
  return cookieNameFor(umg.sicher)
}

/**
 * Liest die Sitzung aus einem `Cookie`-Kopf.
 *
 * @param kopf - der Wert der `Cookie`-Kopfzeile
 * @param name - der gesuchte Name
 * @returns das Token oder `undefined`
 */
export function cookieWert(kopf: string | undefined, name: string): string | undefined {
  if (kopf === undefined) return undefined
  for (const teil of kopf.split(';')) {
    const gleich = teil.indexOf('=')
    if (gleich === -1) continue
    if (teil.slice(0, gleich).trim() !== name) continue
    const wert = teil.slice(gleich + 1).trim()
    return wert === '' ? undefined : wert
  }
  return undefined
}
