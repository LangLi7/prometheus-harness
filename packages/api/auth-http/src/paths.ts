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
  type UserRecord,
} from '@prometheus-harness/auth'
// **`AuthSpeicher` kommt aus dem Speicherpaket, nicht aus dem Regelkern.** Der
// Regelkern kennt die drei Schnittstellen einzeln (`UserStore`, `SessionStore`,
// `AuthEventSink`) und weiß nichts davon, daß sie zusammengebaut werden. Die
// Zusammenfassung ist eine Sache des Speichers.
import type { AuthSpeicher } from '@prometheus-harness/store-postgres'
// **Der Passwort-Link.** Derselbe Regelkern wie beim Zurücksetzen: ein Token,
// nur sein Hash in der Datenbank, einmal gültig, mit Ablauf. Er lag seit dem
// 14.10. fertig da — ohne einen einzigen Aufrufer. Ein Konto anzulegen, dessen
// Passwort der Administrator **nicht** kennt, ist genau sein Zweck.
import { erzeugeResetToken, loeseResetTokenEin } from '@prometheus-harness/reset'
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
// **Die Einladung.** Die Regeln liegen in `einladung.ts` — hier wird nur
// durchgereicht, was sie entscheiden, und die Ablage gefragt. Die Richtung ist
// **einbahnig** (`paths.ts` → `einladung.ts`), damit kein Ring entsteht.
import {
  EINLADUNG_VORGABE_SEKUNDEN,
  EINLADUNGEN_LISTE_MAX,
  OFFENE_EINLADUNGEN_MAX,
  einladungHash,
  erzeugeEinladungToken,
  pruefeEinladung,
  waehleDauer,
} from './einladung.ts'
import type { EinladungRecord } from '@prometheus-harness/store-postgres'
import { randomUUID } from 'node:crypto'

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

/**
 * Die Wege der Einladungen.
 *
 * **Warum drei statt einer mit Methodenwechsel.** Der Webserver des Kerns
 * gleicht nur den Pfad ab; ein Weg trägt genau **eine** Methode (siehe
 * `macheWeg`). Zwei Methoden auf demselben Pfad wären zwei Registrierungen
 * desselben Pfades — und `register()` wirft dabei („duplicate"). Die Namen sagen
 * deshalb, was geschieht, statt sich auf die Methode zu verlassen.
 */
export const PFAD_EINLADUNGEN = '/api/pmh/auth/einladungen'
export const PFAD_EINLADUNG_NEU = '/api/pmh/auth/einladungen/neu'
export const PFAD_EINLADUNG_ZURUECK = '/api/pmh/auth/einladungen/zuruecknehmen'

/**
 * Die Wege der Benutzerverwaltung.
 *
 * **Warum sie unter `auth` liegen und nicht unter einem eigenen Präfix.** Sie
 * brauchen dieselbe Sitzung, dieselbe CSRF-Kopplung und dieselbe Datenbank wie
 * die Anmeldung. Ein zweiter Namensraum wäre eine zweite Stelle, an der jemand
 * „wer darf das?" beantworten müßte — und die zweite Antwort wäre die falsche.
 */
export const PFAD_BENUTZER = '/api/pmh/auth/benutzer'
export const PFAD_BENUTZER_STATUS = '/api/pmh/auth/benutzer/status'
export const PFAD_BENUTZER_NEU = '/api/pmh/auth/benutzer/neu'
export const PFAD_BENUTZER_LOESCHEN = '/api/pmh/auth/benutzer/loeschen'
export const PFAD_BENUTZER_ROLLE = '/api/pmh/auth/benutzer/rolle'
export const PFAD_PASSWORT_LINK = '/api/pmh/auth/passwort/link'
export const PFAD_PASSWORT_SETZEN = '/api/pmh/auth/passwort/setzen'

/**
 * Der Weg des Betreibers — **aus der Token-Tür eine Sitzung**.
 *
 * Steht bei den Benutzerwegen und nicht bei den Anmeldewegen, weil er genau
 * eines bezweckt: die Verwaltung im Harness ohne zweite Anmeldung benutzbar
 * machen. Die Anmeldung mit Paßwort bleibt der Weg für Menschen, die **keinen**
 * Token haben.
 */
export const PFAD_BETREIBER = '/api/pmh/auth/betreiber'

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
  /**
   * Das Einladungs-Token aus dem Link (`?token=…`).
   *
   * **Der dritte Weg zu einem Konto.** Er braucht **keine** Sitzung und **kein**
   * Claim: das Geheimnis ist der Link selbst. Wer ihn hat, darf **ein** Konto
   * anlegen — genau das ist die Absicht (der Admin verschickt ihn, der
   * Eingeladene setzt sein Passwort selbst).
   */
  readonly einladungToken?: unknown
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
  const einladungsToken = typeof eingabe.einladungToken === 'string' ? eingabe.einladungToken.trim() : ''

  /** Die Einladung, mit der dieses Konto entsteht — oder `undefined`. */
  let einladung: EinladungRecord | undefined

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
  } else if (einladungsToken !== '') {
    // **Der dritte Weg: ein Einladungslink.** Kein Claim (es gibt schon Konten),
    // keine Sitzung (der Eingeladene ist noch niemand) — das Geheimnis ist der
    // Link. Die Prüfung ist **lesend**: verbraucht wird erst, wenn das Konto
    // feststeht (siehe unten). Ein zu schwaches Passwort darf die Einladung
    // nicht verbrennen.
    const gefunden = await umg.speicher.einladungen.findeNachHash(einladungHash(einladungsToken))
    const urteil = pruefeEinladung(gefunden, jetzt)
    // **Die Prüfung zuerst, die Existenz danach.** `pruefeEinladung` deckt
    // `undefined` ab („unbekannt") — aber der Typlauf kann aus einem `||` nicht
    // schließen, daß `gefunden` im Fehlerzweig nicht mehr `undefined` ist. Die
    // getrennte Prüfung sagt dasselbe und ist für den Leser klarer.
    if (!urteil.gueltig) {
      // **Die Regel gehört in die Antwort.** Es gibt genau einen Berechtigten
      // (den, der den Link bekommen hat); ihm zu sagen, warum es nicht geht, ist
      // die einzige Auskunft, die ihm hilft.
      return schlecht(403, `einladung-${urteil.regel}`, urteil.grund)
    }
    if (gefunden === undefined) {
      // Kann nicht eintreten: `pruefeEinladung(undefined)` ist nie gültig. Ein
      // stiller Durchlauf wäre trotzdem falsch — dann stünde hier ein Konto ohne
      // Einladung.
      return schlecht(403, 'einladung-unbekannt', 'Dieser Einladungslink ist unbekannt.')
    }
    // **Eine Einladung vergibt nie Adminrechte — auch nicht, wenn in der Zeile
    // etwas anderes stünde.** Die Rolle ist eine Eigenschaft des Einladenden,
    // nicht des Links: ein weitergeleiteter Link darf nicht zum Admin machen.
    if (gefunden.role !== 'user') {
      return schlecht(403, 'einladung-rolle', 'Diese Einladung vergibt keine Administratorrechte.')
    }
    einladung = gefunden
    rolle = 'user'
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

  // **Die Einladung wird VOR dem Konto belegt — und nach dem Anlegen bestätigt.**
  // Das `UPDATE … WHERE consumed_at IS NULL` in der Ablage ist die Entscheidung:
  // zwei gleichzeitige Einlösungen desselben Links, und nur eine gewinnt. Erst
  // anlegen und danach verbrauchen hätte ein Zeitfenster, in dem **zwei** Konten
  // aus **einem** Link entstehen.
  //
  // **Warum zwei Schritte und nicht einer.** `consumed_by` verweist auf `users`;
  // die Kennung des Kontos gibt es vor dem Anlegen noch nicht. Belegen setzt
  // deshalb nur `consumed_at`, `bestaetige` trägt danach die Kennung ein.
  //
  // **Was passiert, wenn das Anlegen scheitert: die Belegung wird wieder
  // freigegeben** (`gibFrei`, weiter unten). Sonst wäre ein zu schwaches
  // Passwort ein verbrauchter Link — und der Eingeladene läse „bereits
  // eingelöst", obwohl er nie ein Konto bekam.
  const kontoId = einladung === undefined ? undefined : randomUUID()
  if (einladung !== undefined && kontoId !== undefined) {
    const belegt = await umg.speicher.einladungen.verbrauche(einladung.id, jetzt)
    if (!belegt) {
      return schlecht(
        409,
        'einladung-eingeloest',
        'Diese Einladung wurde soeben eingelöst. Bitte laß dir einen neuen Link schicken.',
      )
    }
  }

  const ergebnis = await register(umg.speicher.benutzer, umg.hasher, eingabe.email, eingabe.password, anzeigename, {
    ...(umg.maxUsers === undefined ? {} : { maxUsers: umg.maxUsers }),
    role: rolle,
    sink: umg.speicher.spur,
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
    ...(eingabe.userAgent === undefined ? {} : { userAgent: eingabe.userAgent }),
    ...(kontoId === undefined ? {} : { newId: () => kontoId }),
  })

  if (!ergebnis.ok && einladung !== undefined && kontoId !== undefined) {
    // **Nur eine unbestätigte Belegung freigeben.** `gibFrei` prüft
    // `consumed_by IS NULL`; eine inzwischen bestätigte Einlösung bleibt
    // unberührt.
    //
    // **Warum der Fehler hier nicht durchschlägt.** Das Anlegen ist bereits
    // gescheitert; die Freigabe ist eine Aufräumarbeit. Würfe sie, bekäme der
    // Aufrufer statt „Passwort zu schwach" ein 500 — und wüßte nicht, daß sein
    // Link noch gilt.
    try {
      await umg.speicher.einladungen.gibFrei(einladung.id)
    } catch (fehler) {
      process.stderr.write(
        `[pmh] auth/einladung: Freigabe nach gescheitertem Anlegen fehlgeschlagen — ` +
          `${fehler instanceof Error ? fehler.message : String(fehler)}\n`,
      )
    }
  }

  if (ergebnis.ok) {
    // **Die Einladung trägt jetzt das Konto.** Sie war belegt (consumed_at),
    // `consumed_by` fehlte noch — diese Kennung gibt es erst jetzt. Scheitert
    // dieser Schritt, bleibt die Einladung „eingelöst ohne Konto": ein sichtbarer,
    // harmloser Zustand, aber kein zweiter Einlöseweg.
    if (einladung !== undefined) {
      // **Buchführung, nicht Entscheidung.** Das Konto steht; scheitert das
      // Eintragen der Kennung, bleibt die Einladung „eingelöst ohne Konto" —
      // sichtbar, harmlos, aber kein Grund, dem Benutzer sein gerade angelegtes
      // Konto als Fehler zu melden.
      try {
        await umg.speicher.einladungen.bestaetige(einladung.id, ergebnis.user.id)
      } catch (fehler) {
        process.stderr.write(
          `[pmh] auth/einladung: Bestätigung fehlgeschlagen — ` +
            `${fehler instanceof Error ? fehler.message : String(fehler)}\n`,
        )
      }
    }
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

// ---------------------------------------------------------------------------
// Einladungen — der Admin lädt Menschen ein, sich selbst ein Konto zu geben
// ---------------------------------------------------------------------------

/**
 * Prüft, ob ein Aufruf im Namen eines angemeldeten **Administrators** kommt.
 *
 * **Die Reihenfolge: Sitzung, dann CSRF, dann Rolle.** Dieselbe wie beim
 * Anlegen eines Kontos auf dem Admin-Weg, und aus demselben Grund: ohne Sitzung
 * ist der CSRF-Wert bedeutungslos, und eine Prüfung, die zuerst das
 * Unwichtigere prüft, verrät mehr als nötig.
 *
 * **Warum `art` und nicht immer CSRF.** Lesen ist keine Zustandsänderung; ein
 * CSRF-Zwang beim Lesen würde nur die Oberfläche quälen. Schreiben verlangt ihn.
 *
 * @param umg - die Umgebung
 * @param token - das Sitzungstoken aus dem Keks
 * @param csrfKopf - der CSRF-Wert aus dem Kopf
 * @param art - `'lesen'` oder `'schreiben'`
 * @returns der Benutzer oder eine fertige Antwort
 */
async function alsAdmin(
  umg: Umgebung,
  token: string | undefined,
  csrfKopf: string | undefined,
  art: 'lesen' | 'schreiben',
): Promise<{ readonly ok: true; readonly benutzer: UserRecord } | { readonly ok: false; readonly antwort: Antwort }> {
  if (token === undefined || token === '') {
    return { ok: false, antwort: schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE) }
  }
  const geprueft = await verifySession(umg.speicher.sitzungen, token).catch(() => undefined)
  if (geprueft === undefined) {
    return { ok: false, antwort: schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE) }
  }
  if (art === 'schreiben' && !verifyCsrf(geprueft.session, csrfKopf ?? '')) {
    return { ok: false, antwort: schlecht(403, 'csrf-fehlt', 'Der CSRF-Wert fehlt oder stimmt nicht.') }
  }
  const benutzer = await umg.speicher.benutzer.findById(geprueft.session.userId)
  if (benutzer === undefined) {
    return { ok: false, antwort: schlecht(401, 'nicht-angemeldet', SESSION_NOT_USABLE) }
  }
  if (benutzer.role !== 'admin') {
    // **Eigener Code, nicht `nicht-angemeldet`.** Der Aufrufer ist angemeldet;
    // ihm „nicht angemeldet" zu sagen schickte ihn zum Anmeldeformular, wo er
    // schon war.
    return {
      ok: false,
      antwort: schlecht(403, 'kein-admin', 'Nur ein Administrator darf Einladungen verwalten.'),
    }
  }
  return { ok: true, benutzer }
}

/** Der Zustand einer Einladung, wie ihn die Oberfläche braucht. */
export type EinladungZustand = 'offen' | 'eingeloest' | 'abgelaufen' | 'zurueckgezogen'

/** Eine Einladung, wie sie das Haus verläßt — **ohne** Hash und **ohne** Klartext. */
export interface EinladungAnsicht {
  readonly id: string
  readonly note: string
  readonly zustand: EinladungZustand
  readonly erstelltAm: string
  readonly laeuftAb: string
  readonly eingeloestAm?: string
}

/**
 * Bestimmt den Zustand einer Einladung.
 *
 * **Die Reihenfolge ist dieselbe wie in {@link pruefeEinladung}** — und aus
 * demselben Grund: „zurückgezogen" ist die genauere Auskunft als „abgelaufen".
 * Ein Zustand, der anders herum bestimmt würde als die Prüfung, wäre eine
 * zweite Wahrheit: die Oberfläche zeigte „abgelaufen", während die Einlösung
 * „zurückgezogen" meldete.
 *
 * @param eintrag - die Einladung
 * @param jetzt - die Prüfzeit
 * @returns der Zustand
 */
export function einladungZustand(eintrag: EinladungRecord, jetzt: Date): EinladungZustand {
  if (eintrag.revokedAt !== undefined) return 'zurueckgezogen'
  if (eintrag.consumedAt !== undefined) return 'eingeloest'
  const ablauf = new Date(eintrag.expiresAt)
  if (Number.isNaN(ablauf.getTime()) || !(jetzt < ablauf)) return 'abgelaufen'
  return 'offen'
}

/** Macht aus einer gespeicherten Einladung die Ansicht. */
function einladungAnsicht(eintrag: EinladungRecord, jetzt: Date): EinladungAnsicht {
  return {
    id: eintrag.id,
    note: eintrag.note,
    zustand: einladungZustand(eintrag, jetzt),
    erstelltAm: eintrag.createdAt,
    laeuftAb: eintrag.expiresAt,
    ...(eintrag.consumedAt === undefined ? {} : { eingeloestAm: eintrag.consumedAt }),
  }
}

/** Die Eingabe zum Anlegen einer Einladung. */
export interface EinladungAnlegenEingabe {
  /** Das Sitzungstoken des Admins — aus dem Keks. */
  readonly token: string | undefined
  /** Der CSRF-Wert aus dem Kopf. */
  readonly csrfKopf: string | undefined
  /** Die gewünschte Gültigkeit in Sekunden; fehlt sie, gilt die Vorgabe. */
  readonly dauerSekunden: unknown
  /** Ein Merker („für Anna"). */
  readonly notiz: unknown
}

/**
 * Legt eine Einladung an — **nur ein Administrator**.
 *
 * **Was zurückgeht und was nicht.** Der Klartext des Tokens geht **genau
 * einmal** hinaus: in dieser Antwort. Er steht nirgends in der Datenbank
 * (nur sein Hash), also kann ihn auch niemand später noch einmal anzeigen —
 * wer den Link verliert, erzeugt einen neuen. Das ist der Preis dafür, daß ein
 * Datenbankleck keine Einladung ist.
 *
 * **Warum die Antwort keine Adresse enthält.** Die Adresse hängt am Ursprung
 * der Seite (`/anmeldung/`), und den kennt die Oberfläche, nicht dieser Weg.
 * Ein `Host`-Kopf wäre die falsche Quelle — er ist frei wählbar (dieselbe
 * Begründung wie in `access.ts`). Die Oberfläche baut den Link aus ihrem
 * eigenen Ursprung und dem Token.
 *
 * @param umg - die Umgebung
 * @param eingabe - Dauer, Notiz und Nachweise
 * @returns die Einladung mit dem Klartext-Token und Status **201**
 */
export async function einladungAnlegen(umg: Umgebung, eingabe: EinladungAnlegenEingabe): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  const dauer =
    eingabe.dauerSekunden === undefined ? EINLADUNG_VORGABE_SEKUNDEN : waehleDauer(eingabe.dauerSekunden)
  if (dauer === undefined) {
    // **Kein Klemmen.** Wer 999999 schickt, hat sich vertan; still auf 30 Tage zu
    // begrenzen sähe wie Erfolg aus, und der Admin erführe nie, daß seine Angabe
    // nicht genommen wurde.
    return schlecht(
      400,
      'dauer-unbrauchbar',
      'Die Gültigkeit muß eine ganze Zahl zwischen 60 Sekunden und 30 Tagen sein.',
    )
  }

  const notiz = typeof eingabe.notiz === 'string' ? eingabe.notiz.trim().slice(0, 120) : ''
  const jetzt = umg.jetzt()

  const offen = await umg.speicher.einladungen.zaehleOffen(wer.benutzer.id, jetzt)
  if (offen >= OFFENE_EINLADUNGEN_MAX) {
    return schlecht(
      409,
      'zuviele-einladungen',
      `Es sind bereits ${String(OFFENE_EINLADUNGEN_MAX)} Einladungen offen. Bitte zieh zuerst eine zurück.`,
    )
  }

  const token = erzeugeEinladungToken()
  const eintrag = await umg.speicher.einladungen.legeAb({
    tokenHash: einladungHash(token),
    createdBy: wer.benutzer.id,
    // **Immer `user`.** Siehe `registrieren`: ein weitergeleiteter Link darf
    // nicht zum Administrator machen.
    role: 'user',
    note: notiz,
    expiresAt: new Date(jetzt.getTime() + dauer * 1000),
    jetzt,
  })

  return gut(
    {
      id: eintrag.id,
      token,
      note: eintrag.note,
      laeuftAb: eintrag.expiresAt,
      dauerSekunden: dauer,
    },
    {},
    201,
  )
}

/**
 * Die Einladungen des angemeldeten Administrators.
 *
 * **Nur seine eigenen.** Eine Einladung ist ein Versprechen, das jemand gegeben
 * hat; fremde Versprechen gehen ihn nichts an. Die Ablage filtert auf
 * `created_by` — hier steht nur die Begründung.
 *
 * @param umg - die Umgebung
 * @param eingabe - das Sitzungstoken
 * @returns die Liste
 */
export async function einladungenListe(
  umg: Umgebung,
  eingabe: { readonly token: string | undefined },
): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, undefined, 'lesen')
  if (!wer.ok) return wer.antwort
  const jetzt = umg.jetzt()
  const zeilen = await umg.speicher.einladungen.liste(wer.benutzer.id, EINLADUNGEN_LISTE_MAX)
  return gut({ einladungen: zeilen.map((zeile) => einladungAnsicht(zeile, jetzt)) })
}

/** Die Eingabe zum Zurückziehen. */
export interface EinladungZurueckziehenEingabe {
  readonly token: string | undefined
  readonly csrfKopf: string | undefined
  readonly id: unknown
}

/**
 * Zieht eine Einladung zurück.
 *
 * **Wirkung: sofort.** Der Link ist danach tot, auch wenn er noch nicht
 * abgelaufen war — das ist der Sinn eines Widerrufs. Eine bereits eingelöste
 * Einladung läßt sich **nicht** zurückziehen; das Konto ist dann da, und wer es
 * sperren will, sperrt das Konto (nicht den Link).
 *
 * @param umg - die Umgebung
 * @param eingabe - Kennung und Nachweise
 * @returns der neue Zustand
 */
export async function einladungZurueckziehen(
  umg: Umgebung,
  eingabe: EinladungZurueckziehenEingabe,
): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  if (typeof eingabe.id !== 'string' || eingabe.id.trim() === '') {
    return schlecht(400, 'eingabe-fehlt', 'Die Kennung der Einladung fehlt.')
  }
  const zurueck = await umg.speicher.einladungen.ziehZurueck(eingabe.id, wer.benutzer.id, umg.jetzt())
  if (!zurueck) {
    // **Dieselbe Antwort für „gibt es nicht", „gehört dir nicht" und „schon
    // eingelöst".** Der Aufrufer ist Administrator, aber die Einladung ist nicht
    // seine — und ob es sie gibt, ist eine Auskunft über fremde Versprechen.
    return schlecht(
      404,
      'einladung-nicht-offen',
      'Diese Einladung gibt es nicht (mehr), sie gehört nicht dir, oder sie ist nicht mehr offen.',
    )
  }
  return gut({ id: eingabe.id, zustand: 'zurueckgezogen' satisfies EinladungZustand })
}

// ---------------------------------------------------------------------------
// Die Konten — was die Verwaltung sieht und darf
// ---------------------------------------------------------------------------

/** Wie viele Konten die Liste höchstens zeigt. */
export const BENUTZER_LISTE_MAX = 200

/**
 * **Der Betreiber — erkannt an der Token-Tür.**
 *
 * ## Warum es diesen Weg gibt
 *
 * Wer die Oberfläche öffnet, hat sie über den **Token des Wirts** geöffnet
 * (`http://127.0.0.1:3080/?token=…`). Dieser Token ist die Wurzel: er erlaubt
 * Dateien, Prozesse, alles. Er ist **stärker** als jedes PMH-Konto.
 *
 * Trotzdem hatte die Oberfläche keine PMH-Sitzung — das Panel „Konten" bekam
 * `401` und verlangte eine zweite Anmeldung. Das ist die schlechtere von zwei
 * Welten: der Stärkste muß sich am schwächsten Tor anmelden.
 *
 * ## Was hier geschieht
 *
 * Trägt die Anfrage den Token des Wirts (`hatToken` in `access.ts`), wird eine
 * **Sitzung für das Administratorkonto** angelegt — dieselbe Form wie bei einer
 * Anmeldung, mit Sitzungs- und CSRF-Keks. Danach ist alles wie immer: die Wege
 * prüfen die Sitzung, nicht den Token.
 *
 * ## Warum kein eigener „Betreiber"-Akteur ohne Konto
 *
 * Eine Einladung braucht einen **Absender** (`created_by` → `users`). Ein
 * erfundener Akteur müßte die Spalte leeren und die Fremdschlüssel aufgeben —
 * nur um einen Namen zu sparen. Ein echtes Konto ist ehrlicher.
 *
 * ## Die Grenzen, und warum sie eng sind
 *
 * | Fall | Antwort |
 * |---|---|
 * | kein Token | `401 kein-token` — der Weg ist **kein** Ersatz für die Anmeldung |
 * | kein aktives Administratorkonto | `409 kein-admin-konto` |
 * | **mehrere** Administratorkonten, keine Wahl | `409 mehrere-admins` **mit der Liste** |
 * | genannte Kennung ist kein aktiver Verwalter | `403 kein-verwalter` |
 * | genau ein Konto oder eine gültige Wahl | `200` mit beiden Keksen |
 *
 * ## Warum die Wahl und nicht die Ablehnung
 *
 * Früher antwortete der Weg bei mehreren Administratoren mit `409` und einem
 * Satz. Das war sicher, aber eine Sackgasse: wer den Token des Wirts hat, ist der
 * Besitzer der Maschine — und durfte sich trotzdem nicht anmelden, weil der
 * Server nicht raten wollte, wer gemeint ist.
 *
 * **Die Wahl ist keine Vermutung.** Der Aufrufer nennt die Kennung ausdrücklich
 * (`userId`); der Server prüft, daß sie zu einem **aktiven** Administratorkonto
 * gehört. Geraten wird nichts, und die Spur nennt weiterhin `token-tuer` samt der
 * Kennung, für die die Sitzung ausgestellt wurde. Ohne Wahl bleibt es beim
 * `409` — dann steht die Liste im Körper, damit der Mensch wählen kann.
 *
 * @param umg - die Umgebung
 * @param eingabe - ob der Token des Wirts vorliegt, die Herkunft und die Wahl
 * @returns die Antwort mit den beiden Keksen
 */
export async function betreiberAnmelden(
  umg: Umgebung,
  eingabe: Herkunft & { readonly beweis: boolean; readonly userId?: string },
): Promise<Antwort> {
  if (!eingabe.beweis) {
    return schlecht(
      401,
      'kein-token',
      'Diese Anfrage trägt den Token des Harness nicht. Der Betreiber-Weg ist kein Ersatz für die Anmeldung.',
    )
  }

  const alle = await umg.speicher.listeBenutzer(BENUTZER_LISTE_MAX)
  const admins = alle.filter((zeile) => zeile.role === 'admin' && zeile.disabledAt === undefined)
  if (admins.length === 0) {
    return schlecht(
      409,
      'kein-admin-konto',
      'Es gibt kein aktives Administratorkonto. Lege zuerst eines an (Erstinbetriebnahme über den Claim).',
    )
  }

  // **Die Wahl ist ausdrücklich oder gar nicht.** Wer den Token hat, ist der
  // Besitzer der Maschine; er darf sagen, als welcher Verwalter er handelt. Der
  // Server prüft nur, daß die genannte Kennung wirklich ein aktiver Verwalter
  // ist — geraten wird nichts.
  const gewuenscht = (eingabe.userId ?? '').trim()
  let konto = admins[0]
  if (gewuenscht !== '') {
    const treffer = admins.find((zeile) => zeile.id === gewuenscht)
    if (treffer === undefined) {
      return schlecht(403, 'kein-verwalter', 'Das genannte Konto ist kein aktives Administratorkonto.')
    }
    konto = treffer
  } else if (admins.length > 1) {
    // **Keine Vermutung über die Identität.** Die Liste ist die Wahl; das
    // älteste still zu nehmen wäre eine Entscheidung, die niemand getroffen hat.
    return {
      status: 409,
      koepfe: {},
      koerper: {
        ok: false,
        error: {
          code: 'mehrere-admins',
          message: 'Es gibt mehrere Administratorkonten — bitte wähle, wer handelt.',
        },
        konten: admins.map((zeile) => ({
          id: zeile.id,
          email: zeile.email,
          displayName: zeile.displayName,
        })),
      },
    }
  }
  if (konto === undefined) {
    return schlecht(409, 'kein-admin-konto', 'Es gibt kein aktives Administratorkonto.')
  }

  const sitzung = await createSession(umg.speicher.sitzungen, konto.id, {
    ...(eingabe.userAgent === undefined ? {} : { userAgent: eingabe.userAgent }),
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
  })

  // **Die Spur nennt den Weg.** Ein Eintrag `login-success` ohne diesen Vermerk
  // sähe aus wie eine Anmeldung mit Paßwort — und die Frage „wer kam über den
  // Token herein?" wäre später nicht mehr zu beantworten.
  await umg.speicher.spur.record({
    kind: 'login-success',
    userId: konto.id,
    email: konto.email,
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
    userAgent: eingabe.userAgent ?? '',
    detail: { ueber: 'token-tuer' },
  })

  const cookieOptionen = { secure: umg.sicher, maxAgeSeconds: cookieFristSekunden() }
  return gut(
    {
      id: konto.id,
      email: konto.email,
      displayName: konto.displayName,
      role: konto.role,
    } satisfies BenutzerAnsicht,
    {
      'set-cookie': [sessionCookie(sitzung.token, cookieOptionen), csrfCookie(sitzung.csrf, cookieOptionen)],
    },
  )
}

/** Ein Konto, wie es die Verwaltung sieht — **ohne** Hash, ohne Sitzung. */
export interface BenutzerAnsichtAdmin {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly role: 'user' | 'admin'
  /** Gesperrt heißt: dieser Benutzer kommt nicht mehr durch die Anmeldung. */
  readonly gesperrt: boolean
  readonly erstelltAm: string
}

/**
 * Die Konten — **nur für einen Administrator**.
 *
 * **Was hier NICHT drinsteht.** Keine Chats, keine Werke, keine Notizen, keine
 * Schlüssel. Diese Dinge sind je Benutzer getrennt (`user_id`, teils zusätzlich
 * Row Level Security); sie in einer Verwaltungsliste zusammenzutragen hieße,
 * den Mandanten für jede Zeile zu wechseln — also die Trennung aufzuheben, um
 * sie anzuzeigen. Wer als Administrator in fremde Daten sehen will, braucht
 * dafür einen eigenen Weg mit eigener Begründung, nicht eine Liste.
 *
 * @param umg - die Umgebung
 * @param eingabe - das Sitzungstoken
 * @returns die Kontenliste
 */
export async function benutzerListe(
  umg: Umgebung,
  eingabe: { readonly token: string | undefined },
): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, undefined, 'lesen')
  if (!wer.ok) return wer.antwort

  const zeilen = await umg.speicher.listeBenutzer(BENUTZER_LISTE_MAX)
  return gut({
    benutzer: zeilen.map(
      (zeile) =>
        ({
          id: zeile.id,
          email: zeile.email,
          displayName: zeile.displayName,
          role: zeile.role,
          gesperrt: zeile.disabledAt !== undefined,
          erstelltAm: zeile.createdAt,
        }) satisfies BenutzerAnsichtAdmin,
    ),
  })
}

/** Die Eingabe zum Sperren oder Freigeben. */
export interface BenutzerStatusEingabe {
  readonly token: string | undefined
  readonly csrfKopf: string | undefined
  readonly id: unknown
  readonly gesperrt: unknown
}

/**
 * Sperrt oder gibt ein Konto frei.
 *
 * ## Die drei Regeln, und warum sie hier stehen
 *
 * | Regel | Warum |
 * |---|---|
 * | **nicht sich selbst sperren** | Der Administrator, der den Knopf drückt, wäre sofort draußen — und der nächste, der es merkt, ist niemand |
 * | **nicht den letzten Administrator sperren** | Ein System ohne Administrator ist ausgesperrt: niemand könnte Konten anlegen, Einladungen erzeugen oder Rechte vergeben. Dieselbe Aussperrung, die `registrieren` mit `admins === 0` abfedert |
 * | **Sperren widerruft alle Sitzungen** | Ein gesperrtes Konto, dessen Sitzung noch gilt, ist nicht gesperrt — es ist nur nicht mehr anmeldbar. `revokeAllForUser` macht die Sperre sofort wirksam |
 *
 * @param umg - die Umgebung
 * @param eingabe - Kennung, Zielzustand und Nachweise
 * @returns der neue Zustand
 */
export async function benutzerSperren(umg: Umgebung, eingabe: BenutzerStatusEingabe): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  if (typeof eingabe.id !== 'string' || eingabe.id.trim() === '') {
    return schlecht(400, 'eingabe-fehlt', 'Die Kennung des Kontos fehlt.')
  }
  if (typeof eingabe.gesperrt !== 'boolean') {
    // **Kein stilles „dann eben sperren".** Ein fehlendes Feld könnte auch ein
    // Tippfehler im Aufrufer sein; raten wäre hier die falsche Freundlichkeit.
    return schlecht(400, 'eingabe-fehlt', 'Es fehlt die Angabe, ob gesperrt oder freigegeben werden soll.')
  }

  if (eingabe.id === wer.benutzer.id && eingabe.gesperrt) {
    return schlecht(409, 'selbst-sperren', 'Du kannst dein eigenes Konto nicht sperren.')
  }

  const ziel = await umg.speicher.benutzer.findById(eingabe.id)
  if (ziel === undefined) {
    return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')
  }

  if (eingabe.gesperrt && ziel.role === 'admin') {
    const admins = await umg.speicher.anzahlAdmins()
    // **`<= 1` und nicht `< 1`.** Der letzte Administrator ist der, der gerade
    // gesperrt werden soll — nach der Sperre wären es null.
    if (admins <= 1) {
      return schlecht(
        409,
        'letzter-admin',
        'Das ist der letzte Administrator. Ein System ohne Administrator kann keine Konten mehr verwalten.',
      )
    }
  }

  const jetzt = umg.jetzt()
  const geaendert = await umg.speicher.setzeGesperrt(eingabe.id, eingabe.gesperrt, jetzt)
  if (!geaendert) {
    // Zwischen `findById` und dem Schreiben gelöscht. Kein Erfolg vortäuschen.
    return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')
  }

  if (eingabe.gesperrt) {
    // **Sofort wirksam.** Ohne diesen Schritt bliebe eine offene Sitzung gültig,
    // bis sie von selbst abläuft — und die Sperre wäre nur eine Ankündigung.
    await umg.speicher.sitzungen.revokeAllForUser(eingabe.id, jetzt.toISOString(), 'konto-gesperrt')
  }

  return gut({
    id: eingabe.id,
    email: ziel.email,
    gesperrt: eingabe.gesperrt,
  })
}

// ---------------------------------------------------------------------------
// Konten anlegen, löschen, Rolle ändern — und der Passwort-Link
// ---------------------------------------------------------------------------

/**
 * Baut den Passwort-Link.
 *
 * **Ein Pfad, keine absolute Adresse.** Denselben Grund wie bei den Einladungen:
 * die Adresse hängt am Ursprung, und den kennt die Oberfläche. Ein `Host`-Kopf
 * wäre frei wählbar.
 *
 * @param token - der Klartext des Einmal-Tokens
 * @returns der Pfad auf der Anmeldeseite
 */
export function passwortLink(token: string): string {
  return `/anmeldung/?reset=${encodeURIComponent(token)}`
}

/** Die Eingabe zum Anlegen eines Kontos. */
export interface BenutzerAnlegenEingabe {
  readonly token: string | undefined
  readonly csrfKopf: string | undefined
  readonly email: unknown
  readonly displayName: unknown
  readonly rolle: unknown
}

/**
 * Legt ein Konto an — **ohne Passwort, mit einem Passwort-Link**.
 *
 * ## Warum ohne Passwort
 *
 * Ein Administrator, der ein Passwort eintippt, kennt danach das fremde
 * Passwort. Das ist kein Angriff, sondern die Bauart: ein geteiltes Geheimnis
 * bleibt geteilt. Das Konto entsteht deshalb **passwortlos** (`password_hash =
 * NULL`), und der Mensch setzt sein Passwort über den Link — derselbe
 * Einmal-Token-Mechanismus wie beim Zurücksetzen.
 *
 * Bis dahin ist das Konto sichtbar (in der Liste), aber **nicht anmeldbar**:
 * `authenticate` weist ein Konto ohne Hash genauso ab wie ein falsches Passwort.
 *
 * @param umg - die Umgebung
 * @param eingabe - Adresse, Name, Rolle und die Nachweise des Admins
 * @returns das Konto und **einmalig** den Link
 */
export async function benutzerAnlegen(umg: Umgebung, eingabe: BenutzerAnlegenEingabe): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  const adresse = typeof eingabe.email === 'string' ? eingabe.email.trim() : ''
  const pruefung = checkEmail(adresse)
  if (!pruefung.ok) {
    return schlecht(400, 'adresse-unbrauchbar', `Die Adresse ist unbrauchbar (${pruefung.reason}).`)
  }

  // **Nur zwei Rollen, und die Vorgabe ist `user`.** Ein Tippfehler im Körper
  // darf nicht versehentlich einen Administrator erzeugen.
  const rolle: 'user' | 'admin' = eingabe.rolle === 'admin' ? 'admin' : 'user'
  const anzeige = typeof eingabe.displayName === 'string' ? eingabe.displayName.trim().slice(0, 80) : ''

  const jetzt = umg.jetzt()
  const kennung = await umg.speicher.benutzer.create({
    id: randomUUID(),
    email: adresse,
    passwordHash: null,
    displayName: anzeige,
    role: rolle,
  })
  if (kennung === undefined) {
    return schlecht(409, 'adresse-vergeben', 'Diese Adresse ist schon vergeben.')
  }

  const reset = await erzeugeResetToken(umg.speicher.tokenAblage, kennung, jetzt, 10)
  return gut(
    {
      id: kennung,
      email: adresse,
      displayName: anzeige,
      role: rolle,
      link: passwortLink(reset.token),
      laeuftAb: reset.laeuftAb.toISOString(),
    },
    {},
    201,
  )
}

/** Die Eingabe zum Löschen. */
export interface KontoEingabe {
  readonly token: string | undefined
  readonly csrfKopf: string | undefined
  readonly id: unknown
}

/**
 * Löscht ein Konto — **endgültig**.
 *
 * | Regel | Warum |
 * |---|---|
 * | **nicht sich selbst** | wer den Knopf drückt, wäre sofort draußen — und die Sitzung zeigte auf ein Konto, das es nicht mehr gibt |
 * | **nicht den letzten Administrator** | dieselbe Aussperrung wie beim Sperren |
 *
 * **Was mitgelöscht wird.** Sitzungen, API-Schlüssel, Geheimnisse und
 * Einmal-Token hängen mit `ON DELETE CASCADE` an `users`. Das ist gewollt: wer
 * gelöscht ist, soll keine gültige Sitzung und keinen Schlüssel zurücklassen.
 *
 * @param umg - die Umgebung
 * @param eingabe - Kennung und Nachweise
 * @returns die gelöschte Kennung
 */
export async function benutzerLoeschen(umg: Umgebung, eingabe: KontoEingabe): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  if (typeof eingabe.id !== 'string' || eingabe.id.trim() === '') {
    return schlecht(400, 'eingabe-fehlt', 'Die Kennung des Kontos fehlt.')
  }
  if (eingabe.id === wer.benutzer.id) {
    return schlecht(409, 'selbst-loeschen', 'Du kannst dein eigenes Konto nicht löschen.')
  }

  const ziel = await umg.speicher.benutzer.findById(eingabe.id)
  if (ziel === undefined) {
    return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')
  }
  if (ziel.role === 'admin') {
    const admins = await umg.speicher.anzahlAdmins()
    if (admins <= 1) {
      return schlecht(
        409,
        'letzter-admin',
        'Das ist der letzte Administrator. Ein System ohne Administrator kann keine Konten mehr verwalten.',
      )
    }
  }

  const weg = await umg.speicher.loescheBenutzer(eingabe.id)
  if (!weg) return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')

  return gut({ id: eingabe.id, email: ziel.email })
}

/** Die Eingabe zum Rollenwechsel. */
export interface RolleEingabe {
  readonly token: string | undefined
  readonly csrfKopf: string | undefined
  readonly id: unknown
  readonly rolle: unknown
}

/**
 * Ändert die Rolle eines Kontos.
 *
 * **Warum man sich selbst nicht ändern kann.** Die eigene Rolle zu senken
 * nähme einem die Verwaltung mitten im Satz; sie zu heben wäre ein No-Op mit
 * Spur. Beides ist keine Funktion, sondern eine Verwechslung.
 *
 * @param umg - die Umgebung
 * @param eingabe - Kennung, neue Rolle und Nachweise
 * @returns die neue Rolle
 */
export async function benutzerRolle(umg: Umgebung, eingabe: RolleEingabe): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  if (typeof eingabe.id !== 'string' || eingabe.id.trim() === '') {
    return schlecht(400, 'eingabe-fehlt', 'Die Kennung des Kontos fehlt.')
  }
  if (eingabe.rolle !== 'user' && eingabe.rolle !== 'admin') {
    return schlecht(400, 'rolle-unbekannt', 'Es gibt nur die Rollen „user" und „admin".')
  }
  if (eingabe.id === wer.benutzer.id) {
    return schlecht(409, 'selbst-rolle', 'Du kannst deine eigene Rolle nicht ändern.')
  }

  const ziel = await umg.speicher.benutzer.findById(eingabe.id)
  if (ziel === undefined) {
    return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')
  }
  if (ziel.role === 'admin' && eingabe.rolle === 'user') {
    const admins = await umg.speicher.anzahlAdmins()
    if (admins <= 1) {
      return schlecht(409, 'letzter-admin', 'Das ist der letzte Administrator.')
    }
  }

  const geaendert = await umg.speicher.setzeRolle(eingabe.id, eingabe.rolle, umg.jetzt())
  if (!geaendert) return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')

  return gut({ id: eingabe.id, email: ziel.email, role: eingabe.rolle })
}

/**
 * Erzeugt einen **Passwort-Link** für ein bestehendes Konto.
 *
 * Der übliche Fall: jemand hat sein Passwort vergessen. Der Admin erzeugt den
 * Link und gibt ihn weiter; das Konto bleibt, die Sitzungen werden beim
 * Einlösen widerrufen.
 *
 * @param umg - die Umgebung
 * @param eingabe - Kennung und Nachweise
 * @returns der Link, **einmalig**
 */
export async function passwortLinkErzeugen(umg: Umgebung, eingabe: KontoEingabe): Promise<Antwort> {
  const wer = await alsAdmin(umg, eingabe.token, eingabe.csrfKopf, 'schreiben')
  if (!wer.ok) return wer.antwort

  if (typeof eingabe.id !== 'string' || eingabe.id.trim() === '') {
    return schlecht(400, 'eingabe-fehlt', 'Die Kennung des Kontos fehlt.')
  }
  const ziel = await umg.speicher.benutzer.findById(eingabe.id)
  if (ziel === undefined) {
    return schlecht(404, 'konto-unbekannt', 'Dieses Konto gibt es nicht.')
  }
  if (ziel.disabledAt !== undefined) {
    // **Ein gesperrtes Konto bleibt gesperrt.** Sonst wäre der Passwort-Link die
    // Hintertür an der Sperre vorbei.
    return schlecht(409, 'konto-gesperrt', 'Dieses Konto ist gesperrt. Gib es zuerst frei.')
  }

  const reset = await erzeugeResetToken(umg.speicher.tokenAblage, eingabe.id, umg.jetzt(), 10)
  return gut({
    id: eingabe.id,
    email: ziel.email,
    link: passwortLink(reset.token),
    laeuftAb: reset.laeuftAb.toISOString(),
  })
}

/** Die Eingabe zum Setzen eines Passworts über den Link. */
export interface PasswortSetzenEingabe extends Herkunft {
  readonly resetToken: unknown
  readonly passwort: unknown
}

/**
 * Setzt ein Passwort über einen Einmal-Link — **ohne Sitzung**.
 *
 * **Warum ohne Sitzung.** Wer den Link öffnet, ist genau der Mensch, der noch
 * kein Passwort hat. Eine Sitzung zu verlangen wäre die Anforderung „melde dich
 * an, um dir ein Passwort zu geben".
 *
 * **Warum danach angemeldet wird.** Der Link ist ein Nachweis; ihn einzulösen
 * und dann noch einmal das gerade gesetzte Passwort abzufragen wäre eine
 * Zeremonie ohne Sicherheitsgewinn.
 *
 * @param umg - die Umgebung
 * @param eingabe - Token, neues Passwort und Herkunft
 * @returns das Konto, mit den beiden Keksen
 */
export async function passwortSetzen(umg: Umgebung, eingabe: PasswortSetzenEingabe): Promise<Antwort> {
  if (typeof eingabe.resetToken !== 'string' || eingabe.resetToken.trim() === '') {
    return schlecht(400, 'eingabe-fehlt', 'Der Link enthält kein Token.')
  }
  if (typeof eingabe.passwort !== 'string') {
    return schlecht(400, 'eingabe-fehlt', 'Es fehlt das neue Passwort.')
  }

  const jetzt = umg.jetzt()
  const urteil = await loeseResetTokenEin(
    {
      ablage: umg.speicher.tokenAblage,
      benutzer: umg.speicher.benutzer,
      sitzungen: umg.speicher.sitzungen,
      hasher: umg.hasher,
      spur: umg.speicher.spur,
    },
    eingabe.resetToken,
    eingabe.passwort,
    jetzt,
  )
  if (!urteil.ok) {
    // **Der Grund ist hier unterscheidbar** — anders als bei einer Anmeldung.
    // Es gibt genau einen Berechtigten (den, der den Link hat); ihm zu sagen,
    // ob das Passwort zu schwach war oder der Link abgelaufen ist, ist die
    // Auskunft, die ihm hilft.
    return schlecht(403, `passwort-${urteil.regel}`, urteil.grund)
  }

  const konto = await umg.speicher.benutzer.findById(urteil.userId)
  if (konto === undefined) {
    return schlecht(403, 'passwort-unbekannt', 'Zu diesem Link gibt es kein Konto mehr.')
  }

  const sitzung = await createSession(umg.speicher.sitzungen, konto.id, {
    ...(eingabe.userAgent === undefined ? {} : { userAgent: eingabe.userAgent }),
    ...(eingabe.ip === undefined ? {} : { ip: eingabe.ip }),
  })

  const cookieOptionen = { secure: umg.sicher, maxAgeSeconds: cookieFristSekunden() }
  return gut(
    { id: konto.id, email: konto.email, displayName: konto.displayName, role: konto.role } satisfies BenutzerAnsicht,
    {
      'set-cookie': [sessionCookie(sitzung.token, cookieOptionen), csrfCookie(sitzung.csrf, cookieOptionen)],
    },
  )
}
