/**
 * `@prometheus-harness/languages` — die Sprachtabelle der Anmeldung.
 *
 * ## Warum ein eigenes Paket
 *
 * Dieselben Texte werden an **zwei** Stellen gebraucht: die Seite im Browser
 * (`apps/login_web`) und die Seiten, die der Rechner selbst ausliefert (`/start` in
 * `packages/api/auth-http/src/anmeldung.ts`). Zwei Abschriften wären zwei Wahrheiten —
 * die englische Seite sagte dann irgendwann etwas anderes als die deutsche.
 *
 * Das Paket hat **keine** Abhängigkeiten: es ist eine Tabelle und drei Funktionen. Deshalb
 * kann der Browser es mitbündeln und der Rechner es ausliefern.
 *
 * ## Vollständigkeit ist eine Typfrage, keine Fleißarbeit
 *
 * `TEXTE` ist `Record<string, Texte>` mit einem **ausgeschriebenen** `Texte`. Fehlt in einer
 * Sprache ein Feld, ist der Typlauf rot — nicht der Nutzer, der eine leere Stelle sieht.
 *
 * ## Keine Auszeichnung in den Texten
 *
 * Die Texte sind **reiner Text**. Wo eine Überschrift fett sein soll, setzt die Seite das
 * `<strong>` — eine Auszeichnung in der Tabelle wäre in jeder Sprache ein eigenes Problem
 * und in einer HTML-Seite ein Einfallstor.
 *
 * @module @prometheus-harness/languages
 */

/** Der Name des Kekses, in dem die gewählte Sprache liegt. */
export const KEKS_SPRACHE = 'pmh_sprache'

/** Die Sprache, die gilt, wenn niemand etwas gewählt hat. */
export const VORGABE_SPRACHE = 'de'

/** Eine angebotene Sprache. */
export interface Sprache {
  /** Die Kennung, wie sie im Keks steht (`de`). */
  readonly id: string
  /** Der Name **in der Sprache selbst** — so findet sie jeder, auch wer die Oberfläche nicht liest. */
  readonly label: string
}

/** Was die Anmeldung anbietet. Die Reihenfolge ist die Reihenfolge im Auswahlfeld. */
export const SPRACHEN: readonly Sprache[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
]

/**
 * Alle Texte der Anmeldung.
 *
 * **Die Namen sind deutsch, weil das Haus deutsch ist** — die Kennungen der Sprachen sind es
 * nicht (`de`, `en`).
 */
export interface Texte {
  /** Der Name der Anwendung. */
  readonly titel: string
  /** Der Titel des Browserfensters. */
  readonly seitenTitel: string
  /** Steht da, solange die Sitzung geprüft wird. */
  readonly laden: string
  /** Überschrift, wenn jemand angemeldet ist. */
  readonly angemeldet: string
  /** Ersatzbezeichnung, wenn weder Name noch Adresse da sind. */
  readonly rolleKonto: string
  /** Beschriftung des Auswahlfelds für die Sprache. */
  readonly spracheLabel: string
  /** „Weiter zu" vor dem Ziel. */
  readonly weiterZu: string
  /** Der Knopf, der zum Ziel führt. */
  readonly weiter: string
  /** Der Knopf zum Abmelden. */
  readonly abmelden: string
  /** Aufforderung über dem Anmeldeformular. */
  readonly bitteAnmelden: string
  /** Aufforderung über dem Formular zum Anlegen. */
  readonly bitteAnlegen: string
  readonly feldAdresse: string
  readonly feldPasswort: string
  readonly passwortHinweis: string
  readonly feldName: string
  readonly feldClaim: string
  readonly claimHinweis: string
  readonly knopfAnmelden: string
  readonly knopfKontoAnlegen: string
  readonly knopfZurAnmeldung: string
  /** Der Knopf, der die Oberfläche des Rechners öffnet — nur für Administratoren. */
  readonly knopfZumHarness: string
  /** Der Hinweis unter diesem Knopf. */
  readonly zugangHinweis: string
  /** Fußnote: woher das Ziel nach der Anmeldung kommt. */
  readonly fussZiel: string
  /** Fenstertitel der Schnittstelle `/start`. */
  readonly startTitel: string
  readonly startUeberschrift: string
  readonly startWeiter: string
  readonly startOberflaeche: string
  readonly startOberflaecheHinweis: string
  readonly startAnmeldeseite: string
  readonly startAnmeldeseiteHinweis: string
  readonly startEingebaut: string
  readonly startEingebautHinweis: string
  readonly startZustand: string
  readonly startZustandHinweis: string
  /** Überschrift des Hinweises zu den zwei Türen. */
  readonly zweiTuerenTitel: string
  /** Der Hinweis selbst. */
  readonly zweiTueren: string
}

/** Deutsch — die Sprache, in der dieses Projekt geschrieben ist. */
const DE: Texte = {
  titel: 'Prometheus Harness',
  seitenTitel: 'Anmeldung — Prometheus Harness',
  laden: 'Einen Augenblick …',
  angemeldet: 'Angemeldet',
  rolleKonto: 'Konto',
  spracheLabel: 'Sprache',
  weiterZu: 'Weiter zu',
  weiter: 'Weiter',
  abmelden: 'Abmelden',
  bitteAnmelden: 'Melde dich an.',
  bitteAnlegen: 'Lege das Konto an.',
  feldAdresse: 'Adresse',
  feldPasswort: 'Passwort',
  passwortHinweis: 'Mindestens 8 Zeichen.',
  feldName: 'Anzeigename (freiwillig)',
  feldClaim: 'Claim-Token',
  claimHinweis:
    'Solange kein Admin existiert: der Wert aus claim.txt im Harness-Home. Das erste Konto wird damit Admin.',
  knopfAnmelden: 'Anmelden',
  knopfKontoAnlegen: 'Konto anlegen',
  knopfZurAnmeldung: 'Zur Anmeldung',
  knopfZumHarness: 'Oberfläche öffnen',
  zugangHinweis: 'Nur als Administrator. Der Zugangsschlüssel steht dabei einmal in der Adreßzeile.',
  fussZiel: 'Das Ziel nach der Anmeldung ist ?weiter=… — später aus den Einstellungen.',
  startTitel: 'Prometheus Harness — angemeldet',
  startUeberschrift: 'Angemeldet',
  startWeiter: 'Weiter',
  startOberflaeche: 'Oberfläche des Harness',
  startOberflaecheHinweis: 'verlangt zusätzlich den Token aus der Konsole des Rechners (siehe Hinweis unten).',
  startAnmeldeseite: 'Anmeldeseite',
  startAnmeldeseiteHinweis: 'hier landen, wenn die Anmeldung abläuft.',
  startEingebaut: 'Eingebaute Anmeldeseite',
  startEingebautHinweis: 'dieselben vier Wege, ohne Bauausgabe.',
  startZustand: 'Zustand des Harness',
  startZustandHinweis: '/api/ready, ohne Anmeldung lesbar.',
  zweiTuerenTitel: 'Zwei Türen, noch nicht verbunden.',
  zweiTueren:
    'Diese Anmeldung ist die Konto-Tür: sie sagt, wer du bist. Die Oberfläche verlangt die Token-Tür: ' +
    'sie sagt nur, daß jemand den Rechner bedienen darf. Der Token steht in der Konsole des Rechners ' +
    'und wechselt bei jedem Start. Deshalb steht er hier nicht — er gilt für alles, und in einer ' +
    'Adreßzeile stünde er im Verlauf und im Zugriffsprotokoll.',
}

/** Englisch. */
const EN: Texte = {
  titel: 'Prometheus Harness',
  seitenTitel: 'Sign in — Prometheus Harness',
  laden: 'One moment …',
  angemeldet: 'Signed in',
  rolleKonto: 'Account',
  spracheLabel: 'Language',
  weiterZu: 'Continue to',
  weiter: 'Continue',
  abmelden: 'Sign out',
  bitteAnmelden: 'Sign in.',
  bitteAnlegen: 'Create the account.',
  feldAdresse: 'Address',
  feldPasswort: 'Password',
  passwortHinweis: 'At least 8 characters.',
  feldName: 'Display name (optional)',
  feldClaim: 'Claim token',
  claimHinweis:
    'While no admin exists: the value from claim.txt in the harness home. The first account becomes admin with it.',
  knopfAnmelden: 'Sign in',
  knopfKontoAnlegen: 'Create account',
  knopfZurAnmeldung: 'Back to sign in',
  knopfZumHarness: 'Open the interface',
  zugangHinweis: 'Administrators only. The access key appears once in the address line.',
  fussZiel: 'The target after signing in is ?weiter=… — later from the settings.',
  startTitel: 'Prometheus Harness — signed in',
  startUeberschrift: 'Signed in',
  startWeiter: 'Continue',
  startOberflaeche: 'Harness interface',
  startOberflaecheHinweis: 'additionally requires the token from the machine console (see the note below).',
  startAnmeldeseite: 'Sign-in page',
  startAnmeldeseiteHinweis: 'where you land when the session expires.',
  startEingebaut: 'Built-in sign-in page',
  startEingebautHinweis: 'the same four routes, no build output needed.',
  startZustand: 'Harness state',
  startZustandHinweis: '/api/ready, readable without signing in.',
  zweiTuerenTitel: 'Two doors, not yet connected.',
  zweiTueren:
    'This sign-in is the account door: it says who you are. The interface requires the token door: ' +
    'it only says that someone may operate this machine. The token is printed in the machine console ' +
    'and changes on every start. That is why it is not shown here — it grants everything, and in an ' +
    'address line it would end up in the browser history and in access logs.',
}

/** Die Tabelle. */
export const TEXTE: Readonly<Record<string, Texte>> = { de: DE, en: EN }

/**
 * Ist das eine angebotene Sprache?
 *
 * @param wert - die geprüfte Kennung
 * @returns ob sie angeboten wird
 */
export function istSprache(wert: string): boolean {
  return SPRACHEN.some((sprache) => sprache.id === wert)
}

/**
 * Die Texte einer Sprache.
 *
 * **Unbekannt heißt Vorgabe, nicht Fehler.** Eine Sprache kommt aus einem Keks, also aus einer
 * Angabe des Aufrufers; sie kann veraltet sein oder erfunden. Wer darauf einen Fehler baut,
 * sperrt jemanden aus, weil sein Browser etwas Falsches geschickt hat.
 *
 * @param id - die Kennung (darf fehlen oder unbekannt sein)
 * @returns die Texte der Sprache oder die der Vorgabe
 */
export function texteFuer(id: string | undefined): Texte {
  if (id === undefined) return DE
  return TEXTE[id] ?? DE
}

/**
 * Die gewählte Sprache aus einem `Cookie`-Kopf.
 *
 * @param kopf - der Wert der `Cookie`-Kopfzeile
 * @returns die Kennung einer **angebotenen** Sprache; sonst die Vorgabe
 */
export function spracheAusKeks(kopf: string | undefined): string {
  if (kopf === undefined) return VORGABE_SPRACHE
  for (const teil of kopf.split(';')) {
    const gleich = teil.indexOf('=')
    if (gleich === -1) continue
    if (teil.slice(0, gleich).trim() !== KEKS_SPRACHE) continue
    const wert = decodeURIComponent(teil.slice(gleich + 1).trim())
    return istSprache(wert) ? wert : VORGABE_SPRACHE
  }
  return VORGABE_SPRACHE
}
