/**
 * **Konten als eigenes Plugin — die Verwaltung im Sidebar.**
 *
 * Ein Sidebar-Eintrag, ein main-Panel: alle Konten, ihr Zustand, und die
 * Einladungen mit Ablauf. Die Wege liegen in `@prometheus-harness/auth-http`
 * (`/api/pmh/auth/benutzer`, `/api/pmh/auth/einladungen`); dieses Panel liest
 * und schreibt sie nur.
 *
 * **Wo das Panel erscheint, ist seit dem 21.10.2026 eine Einstellung.** Vorher stand es fest in der
 * Seitenleiste; jetzt wählt der Eintrag `pmh-accounts` zwischen Seitenleiste, Plugin-Liste, beidem
 * oder nichts (`surface`), dazu Platz und Beschriftung. Die Werte liegen in der `Config` der
 * Host-Hälfte (`lib/index.js`), gelesen werden sie hier über `ctx.configForms`.
 *
 * ## Warum das Panel **nichts selbst entscheidet**
 *
 * Ob jemand Administrator ist, ob das letzte Adminkonto gesperrt werden darf,
 * ob eine Einladung noch gilt — alles das beantwortet der Server. Hier steht
 * **keine** Regel, die es dort auch gibt: eine Oberfläche, die eine Regel
 * nachbaut, hat sie zweimal, und die zweite ist die falsche.
 *
 * @module @prometheus-harness/accounts
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// **Für die Slot-Karte `plugins.item`** — der Typ kommt aus dem Plugin-Manager, zur Laufzeit wird
// nichts davon importiert.
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// **Für den Dienst `configForms`.** Das Modul erweitert den Kontext um ihn; ohne den Import kennt
// der Compiler `ctx.configForms` nicht.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { DE } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    konten: keyof typeof DE
  }
}

/** Die Kennung im main-Slot und in der Seitenleiste. */
export const PANEL_ID = 'konten'

/**
 * Der Eintrag im Profil — **der Schlüssel der Einstellungen**.
 *
 * Die Einstellungsseite eines Plugins speist sich aus der `Config` seines **Profil-Eintrags**,
 * nicht aus seinem Paketnamen. Der Wert steht in `cordis.patch.yml` (`- id: pmh-accounts`); deshalb
 * hier ein eigener Name statt einer Ableitung aus `PANEL_ID`: derselbe Text, zwei Bedeutungen, und
 * eine Bedeutung darf sich ändern, ohne die andere mitzunehmen.
 */
export const ENTRY_ID = 'pmh-accounts'

/** Der Namensraum der Texte. */
const NS = 'konten'

/**
 * Die Anzeige-Einstellungen — **die Form der `Config` auf der Host-Hälfte** (`lib/index.js`).
 *
 * Alle Felder sind optional: die Einstellungsseite schickt nur, was der Nutzer geändert hat, und
 * eine fehlende Angabe heißt „Vorgabe", nicht „leer".
 */
export interface DisplayConfig {
  /** Wo das Panel erscheint: `sidebar`, `plugins`, `both` oder `none`. */
  readonly surface?: string
  /** Platz in der Leiste bzw. in der Plugin-Liste; kleinere Zahl steht weiter oben. */
  readonly order?: number
  /** Eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  readonly label?: string
}

/** Die Anzeige, wie sie nach dem Lesen der Einstellungen gilt — Vorgaben schon eingesetzt. */
interface Anzeige {
  readonly oberflaeche: 'sidebar' | 'plugins' | 'both' | 'none'
  readonly reihenfolge: number
  readonly beschriftung: string | undefined
}

/** Der Platz, den das Plugin ohne Einstellung hatte — ein Bestand soll sich nicht verschieben. */
const STANDARD_REIHENFOLGE = 12

/**
 * Setzt die Vorgaben in die Einstellungen ein.
 *
 * **Warum das eine eigene Funktion ist.** Dieselbe Auslegung wird an zwei Stellen gebraucht (beide
 * Anmeldungen). Stünde sie zweimal da, wäre die Vorgabe `sidebar` irgendwann an einer Stelle `both`
 * — und das fiele niemandem auf.
 *
 * @param config - der gelesene Abschnitt, oder `undefined`, solange der Host noch nicht geantwortet hat
 * @returns die geltende Anzeige
 */
function liesAnzeige(config: DisplayConfig | undefined): Anzeige {
  const flaeche = config?.surface
  const oberflaeche: Anzeige['oberflaeche'] =
    flaeche === 'plugins' || flaeche === 'both' || flaeche === 'none' || flaeche === 'sidebar'
      ? flaeche
      : 'sidebar'
  const platz = config?.order
  const reihenfolge = typeof platz === 'number' && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE
  const roh = config?.label
  const beschriftung = typeof roh === 'string' && roh.trim() !== '' ? roh.trim() : undefined
  return { oberflaeche, reihenfolge, beschriftung }
}

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'configForms']

/** Der Keks, den die Seite lesen darf — das Sitzungskek ist `HttpOnly`. */
const CSRF_KEKS = 'pmh_csrf'

/** Der Kopf, den unser Server für Zustandsänderungen verlangt. */
const CSRF_KOPF = 'x-pmh-csrf'

/** Der Weg der Anmeldeseite — dorthin führt der Hinweis, wenn man nicht Admin ist. */
const ANMELDUNG = '/anmeldung/'

interface Konto {
  readonly id?: string
  readonly email?: string
  readonly displayName?: string | null
  readonly role?: string
}

interface BenutzerZeile {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly role: 'user' | 'admin'
  readonly gesperrt: boolean
  readonly erstelltAm: string
}

interface EinladungZeile {
  readonly id: string
  readonly note: string
  readonly zustand: 'offen' | 'eingeloest' | 'abgelaufen' | 'zurueckgezogen'
  readonly erstelltAm: string
  readonly laeuftAb: string
}

interface NeueEinladung {
  readonly id: string
  readonly token: string
  readonly laeuftAb: string
}

/**
 * Ein Administratorkonto, wenn mehrere zur Wahl stehen.
 *
 * **Warum die Wahl überhaupt angezeigt wird.** Bei genau einem Administrator
 * setzt der Betreiber-Weg die Sitzung still. Bei mehreren wäre „wer gemeint ist"
 * eine Vermutung — die Liste macht daraus eine Entscheidung des Menschen.
 */
interface AuswahlKonto {
  readonly id: string
  readonly email: string
  readonly displayName?: string
}

interface Props {
  /**
   * Schließt das Haupt-Panel.
   *
   * **Warum optional.** Auf der eigenen Seite in der Plugin-Liste gibt es keinen Hauptbereich zu
   * schließen. Dort fehlt der Knopf, statt daß er nichts täte.
   */
  readonly close?: () => void
  readonly t: TranslateNS<'konten'>
}

/** Liest einen Kekswert; leer, wenn er fehlt. */
function keksWert(name: string): string {
  for (const stueck of document.cookie.split(';')) {
    const i = stueck.indexOf('=')
    if (i === -1) continue
    if (stueck.slice(0, i).trim() === name) return decodeURIComponent(stueck.slice(i + 1).trim())
  }
  return ''
}

/**
 * Ein GET auf unseren eigenen Ursprung — mit Keksen.
 *
 * **Warum die Hülle ausgepackt wird.** Alle Wege antworten in **einer** Form:
 * `{ok: true, value: …}` oder `{ok: false, error: {code, message}}`. Wer
 * `json()` unverändert zurückgibt, hält die Hülle für das Konto — und `role`
 * steht dann nirgends. Genau das war der Fehler, den erst der Browser zeigte:
 * die Netzspur sagte `200 admin`, das Panel sagte „kein Administrator".
 */
async function hole<T>(url: string): Promise<T> {
  const antwort = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  const daten = (await antwort.json().catch(() => undefined)) as
    | { ok?: boolean; value?: T; error?: { code?: string; message?: string }; konten?: readonly AuswahlKonto[] }
    | undefined
  if (daten?.ok === true) return daten.value as T
  throw new ServerFehler(
    daten?.error?.code ?? `http-${String(antwort.status)}`,
    daten?.error?.message ?? `HTTP ${String(antwort.status)}`,
    daten?.konten ?? [],
  )
}

/** Ein Fehler aus einer Antwort des Servers — mit dem stabilen Code. */
class ServerFehler extends Error {
  readonly code: string
  /** Die Wahl, wenn der Server mehrere Administratorkonten meldet. */
  readonly konten: readonly AuswahlKonto[]
  constructor(code: string, message: string, konten: readonly AuswahlKonto[] = []) {
    super(message)
    this.code = code
    this.konten = konten
  }
}

/** Ein POST auf unseren eigenen Ursprung — mit CSRF-Wert aus dem lesbaren Keks. */
async function sende<T>(url: string, koerper: unknown): Promise<T> {
  const antwort = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', [CSRF_KOPF]: keksWert(CSRF_KEKS) },
    body: JSON.stringify(koerper),
  })
  const daten = (await antwort.json().catch(() => undefined)) as
    | { ok?: boolean; value?: T; error?: { code?: string; message?: string }; konten?: readonly AuswahlKonto[] }
    | undefined
  if (daten?.ok === true) return daten.value as T
  // **Die Meldung des Servers wörtlich.** Sie weiß, welcher Fall vorliegt
  // („letzter Administrator", „falsches CSRF"); hier neu zu formulieren wäre
  // eine zweite Wahrheit. Die Kontenliste kommt mit, wenn der Server sie anbietet.
  throw new ServerFehler(
    daten?.error?.code ?? 'unbekannt',
    daten?.error?.message ?? `HTTP ${String(antwort.status)}`,
    daten?.konten ?? [],
  )
}

/** Der Zustand einer Einladung als Wort. */
function zustandText(zustand: EinladungZeile['zustand'], t: TranslateNS<'konten'>): string {
  switch (zustand) {
    case 'offen':
      return t('open')
    case 'eingeloest':
      return t('redeemed')
    case 'abgelaufen':
      return t('expired')
    case 'zurueckgezogen':
      return t('revoked')
  }
}

/** Baut den Einladungslink aus dem eigenen Ursprung. */
function einladungsLink(token: string): string {
  return `${window.location.origin}${ANMELDUNG}?token=${encodeURIComponent(token)}`
}

/** Das Panel. */
export function KontenPanel({ close, t }: Props): ReactElement {
  const [ich, setIch] = useState<Konto | null>(null)
  const [geprueft, setGeprueft] = useState(false)
  const [benutzer, setBenutzer] = useState<readonly BenutzerZeile[]>([])
  const [einladungen, setEinladungen] = useState<readonly EinladungZeile[]>([])
  /** Die Wahl, wenn der Betreiber-Weg mehrere Administratorkonten meldet. */
  const [auswahl, setAuswahl] = useState<readonly AuswahlKonto[]>([])
  const [neue, setNeue] = useState<NeueEinladung | null>(null)
  const [dauer, setDauer] = useState(7 * 24 * 60 * 60)
  const [notiz, setNotiz] = useState('')
  const [kopiert, setKopiert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [arbeitet, setArbeitet] = useState(false)

  // **Die Verwaltung, die mehr tut als zusehen.** Anlegen, Rolle, Passwort-Link,
  // Löschen — vier kleine Formulare, die alle denselben Weg gehen: senden, neu
  // lesen, Fehler wörtlich zeigen (siehe `aendere`).
  const [neuOffen, setNeuOffen] = useState(false)
  const [neuEmail, setNeuEmail] = useState('')
  const [neuName, setNeuName] = useState('')
  const [neuRolle, setNeuRolle] = useState<'user' | 'admin'>('user')
  const [passwortLink, setPasswortLink] = useState<{ email: string; link: string; laeuftAb: string } | null>(null)
  const [linkKopiert, setLinkKopiert] = useState(false)
  const [bestaetigen, setBestaetigen] = useState<string | null>(null)

  const istAdmin = ich?.role === 'admin'

  /** Liest Sitzung, Konten und Einladungen. */
  const lade = useCallback(async () => {
    setLaden(true)
    setFehler(null)
    try {
      // **Die automatische Erkennung.**
      //
      // Wer die Oberfläche über den Token des Wirts geöffnet hat
      // (`http://127.0.0.1:3080/?token=…`), hat **keine** PMH-Sitzung — der
      // Token ist eine andere Tür. Genau daran scheiterte dieses Panel zuerst:
      // `401`, und der Betreiber sollte sich ein zweites Mal anmelden, obwohl
      // er schon der Stärkste im Haus ist.
      //
      // Der Server prüft den Token selbst (`authorizeIndex` des Kerns) und
      // stellt bei Erfolg eine Sitzung für das Administratorkonto aus. Diese
      // Seite fragt also nur: „bitte einmal erkenne, wer hier sitzt" — und
      // entscheidet nichts.
      const ich_ = await hole<Konto>('/api/pmh/auth/me').catch(async (problem: unknown) => {
        if (problem instanceof ServerFehler && problem.code === 'nicht-angemeldet') {
          try {
            await sende('/api/pmh/auth/betreiber', {})
          } catch (zweiter) {
            // **Mehrere Verwalter: der Server rät nicht — also wählt der Mensch.**
            // Die Liste kam mit der Absage; sie wird zur Auswahl statt zu einer
            // Sackgasse. Ein Token-Inhaber ist der Besitzer der Maschine; wen er
            // vertritt, ist seine Entscheidung und steht danach in der Spur.
            if (zweiter instanceof ServerFehler && zweiter.code === 'mehrere-admins') {
              setAuswahl(zweiter.konten)
              return undefined
            }
            throw zweiter
          }
          return await hole<Konto>('/api/pmh/auth/me')
        }
        throw problem
      })
      if (ich_ === undefined) {
        // Die Wahl steht im Panel; bis dahin gibt es kein Konto.
        setIch(null)
        setBenutzer([])
        setEinladungen([])
        return
      }
      setAuswahl([])
      setIch(ich_)
      if (ich_.role !== 'admin') {
        setBenutzer([])
        setEinladungen([])
        return
      }
      const [k, e] = await Promise.all([
        hole<{ benutzer?: readonly BenutzerZeile[] }>('/api/pmh/auth/benutzer'),
        hole<{ einladungen?: readonly EinladungZeile[] }>('/api/pmh/auth/einladungen'),
      ])
      setBenutzer(k.benutzer ?? [])
      setEinladungen(e.einladungen ?? [])
    } catch (problem) {
      if (problem instanceof ServerFehler && problem.code === 'kein-token') {
        // **Kein Token, keine Sitzung: der Normalfall im fremden Browser.**
        // Dann ist der Hinweis „nur für Administratoren" die richtige Antwort —
        // und **kein** roter Fehler. Ein Fehler wäre hier eine Auskunft über
        // einen Zustand, den der Betrachter nicht ändern kann.
        setIch(null)
        setBenutzer([])
        setEinladungen([])
        return
      }
      setFehler(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setGeprueft(true)
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    void lade()
  }, [lade])

  /** Führt eine Änderung aus und liest danach neu. */
  const aendere = async (arbeit: () => Promise<unknown>): Promise<void> => {
    setArbeitet(true)
    setFehler(null)
    try {
      await arbeit()
      await lade()
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setArbeitet(false)
    }
  }

  const beimSperren = (id: string, gesperrt: boolean): void => {
    void aendere(() => sende('/api/pmh/auth/benutzer/status', { id, gesperrt }))
  }

  /**
   * Die Wahl bei mehreren Administratorkonten — **ausdrücklich, nicht geraten**.
   *
   * Der Weg bekommt die Kennung, prüft, daß sie zu einem aktiven Verwalter
   * gehört, und stellt die Sitzung dafür aus. Danach liest `aendere` neu, und
   * das Panel arbeitet als dieses Konto.
   *
   * @param id - die gewählte Kontokennung
   */
  const waehle = (id: string): void => {
    setAuswahl([])
    void aendere(() => sende('/api/pmh/auth/betreiber', { userId: id }))
  }

  /** Legt ein Konto **ohne Passwort** an und zeigt den Passwort-Link einmal. */
  const beimAnlegen = (): void => {
    setPasswortLink(null)
    void aendere(async () => {
      const frisch = await sende<{ email: string; link: string; laeuftAb: string }>('/api/pmh/auth/benutzer/neu', {
        email: neuEmail,
        displayName: neuName,
        rolle: neuRolle,
      })
      setPasswortLink(frisch)
      setNeuEmail('')
      setNeuName('')
      setNeuRolle('user')
      setNeuOffen(false)
    })
  }

  /** Ändert die Rolle — der Server prüft „letzter Admin" und „nicht du selbst". */
  const beimRolle = (id: string, rolle: 'user' | 'admin'): void => {
    void aendere(() => sende('/api/pmh/auth/benutzer/rolle', { id, rolle }))
  }

  /** Erzeugt einen Passwort-Link für ein bestehendes Konto. */
  const beimPasswortLink = (id: string): void => {
    setPasswortLink(null)
    void aendere(async () => {
      const frisch = await sende<{ email: string; link: string; laeuftAb: string }>('/api/pmh/auth/passwort/link', { id })
      setPasswortLink(frisch)
    })
  }

  /** Löscht ein Konto — **zweistufig**, weil es nichts zurückzuholen gibt. */
  const beimLoeschen = (id: string): void => {
    if (bestaetigen !== id) {
      setBestaetigen(id)
      return
    }
    setBestaetigen(null)
    void aendere(() => sende('/api/pmh/auth/benutzer/loeschen', { id }))
  }

  const beimEinladen = (): void => {
    setKopiert(false)
    void aendere(async () => {
      const frisch = await sende<NeueEinladung>('/api/pmh/auth/einladungen/neu', {
        dauerSekunden: dauer,
        notiz,
      })
      setNeue(frisch)
      setNotiz('')
    })
  }

  const beimZuruecknehmen = (id: string): void => {
    void aendere(() => sende('/api/pmh/auth/einladungen/zuruecknehmen', { id }))
  }

  const beimKopieren = async (token: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(einladungsLink(token))
      setKopiert(true)
    } catch {
      // **Kein stiller Erfolg.** Ohne Zwischenablage steht der Link weiter
      // sichtbar da; die Meldung sagt, was zu tun ist.
      setKopiert(false)
      setFehler('Kopieren ging nicht — bitte den Link von Hand markieren.')
    }
  }

  const kopf = (
    <header className="pmh-kt__head">
      <div className="pmh-kt__brand">
        <KontenIcon size={22} />
        <div className="pmh-kt__brandtext">
          <span className="pmh-kt__kicker">{t('kicker')}</span>
          <h2 className="pmh-kt__title">{t('title')}</h2>
        </div>
      </div>
      <div className="pmh-kt__actions">
        <button className="pmh-kt__btn" type="button" onClick={() => void lade()} disabled={laden}>
          {t('refresh')}
        </button>
        {close !== undefined && (
          <button className="pmh-kt__btn pmh-kt__btn--ghost" type="button" onClick={close}>
            {t('close')}
          </button>
        )}
      </div>
    </header>
  )

  if (!geprueft) {
    return (
      <div className="pmh-kt">
        {kopf}
        <p className="pmh-kt__leer">{t('loading')}</p>
      </div>
    )
  }

  if (!istAdmin) {
    return (
      <div className="pmh-kt">
        {kopf}
        {auswahl.length > 0 ? (
          <div className="pmh-kt__hinweis">
            <strong>{t('chooseAdmin')}</strong>
            <p>{t('chooseAdminHint')}</p>
            <div className="pmh-kt__linkzeile">
              {auswahl.map((konto) => (
                <button
                  key={konto.id}
                  className="pmh-kt__btn"
                  type="button"
                  disabled={arbeitet}
                  onClick={() => waehle(konto.id)}
                >
                  {konto.displayName === undefined || konto.displayName === '' ? konto.email : konto.displayName}
                </button>
              ))}
              <button className="pmh-kt__btn pmh-kt__btn--ghost" type="button" onClick={() => void lade()}>
                {t('retry')}
              </button>
            </div>
          </div>
        ) : (
          <div className="pmh-kt__hinweis">
            <strong>{t('notAdmin')}</strong>
            {/* **Der Grund steht im Kasten, nicht als roter Balken.** „Kein Token",
                „mehrere Administratorkonten" und „kein Adminkonto" sind keine
                Fehler der Seite — sie sind Zustände, und der nächste Schritt
                (anmelden oder Konto anlegen) steht direkt daneben. */}
            <p>{fehler ?? t('notAdminHint')}</p>
            <div className="pmh-kt__linkzeile">
              <a className="pmh-kt__btn" href={ANMELDUNG}>
                {t('signIn')}
              </a>
              <button className="pmh-kt__btn pmh-kt__btn--ghost" type="button" onClick={() => void lade()}>
                {t('retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="pmh-kt">
      {kopf}

      {fehler !== null && (
        <div className="pmh-kt__fehler">
          <span>{fehler}</span>
          <button className="pmh-kt__btn" type="button" onClick={() => void lade()}>
            {t('retry')}
          </button>
        </div>
      )}

      <div className="pmh-kt__body">
        <section className="pmh-kt__abschnitt">
          <div className="pmh-kt__abschnittkopf">
            <h3>{t('users')}</h3>
            <span className="pmh-kt__zahl">{benutzer.length}</span>
            <button
              className="pmh-kt__btn pmh-kt__btn--klein pmh-kt__rechts"
              type="button"
              disabled={arbeitet}
              onClick={() => {
                setNeuOffen(!neuOffen)
                setPasswortLink(null)
              }}
            >
              {neuOffen ? t('cancel') : t('newUser')}
            </button>
          </div>
          <p className="pmh-kt__still">{t('usersHint')}</p>

          {neuOffen && (
            <form
              className="pmh-kt__form"
              onSubmit={(ereignis) => {
                ereignis.preventDefault()
                beimAnlegen()
              }}
            >
              <label className="pmh-kt__feld">
                <span>{t('email')}</span>
                <input
                  type="email"
                  value={neuEmail}
                  autoComplete="off"
                  required
                  onChange={(e) => setNeuEmail(e.target.value)}
                />
              </label>
              <label className="pmh-kt__feld">
                <span>{t('name')}</span>
                <input type="text" value={neuName} autoComplete="off" onChange={(e) => setNeuName(e.target.value)} />
              </label>
              <label className="pmh-kt__feld pmh-kt__feld--schmal">
                <span>{t('role')}</span>
                <select
                  value={neuRolle}
                  onChange={(e) => setNeuRolle(e.target.value === 'admin' ? 'admin' : 'user')}
                >
                  <option value="user">{t('roleUser')}</option>
                  <option value="admin">{t('roleAdmin')}</option>
                </select>
              </label>
              <button className="pmh-kt__btn pmh-kt__btn--voll" type="submit" disabled={arbeitet}>
                {t('createUser')}
              </button>
            </form>
          )}

          {/* **Der Link steht genau einmal da.** Wie bei den Einladungen: der
              Server kennt nur den Hash, danach ist er nicht mehr zu holen. */}
          {passwortLink !== null && (
            <div className="pmh-kt__link">
              <strong>
                {t('passwordLinkTitle')} · {passwortLink.email}
              </strong>
              <code>{`${window.location.origin}${passwortLink.link}`}</code>
              <div className="pmh-kt__linkzeile">
                <button
                  className="pmh-kt__btn pmh-kt__btn--klein"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.origin}${passwortLink.link}`)
                    setLinkKopiert(true)
                  }}
                >
                  {linkKopiert ? t('copied') : t('copy')}
                </button>
                <small>{t('passwordLinkHint')}</small>
              </div>
            </div>
          )}

          {benutzer.length === 0 ? (
            <p className="pmh-kt__leer">{t('emptyUsers')}</p>
          ) : (
            <ul className="pmh-kt__liste">
              {benutzer.map((zeile) => {
                const selbst = zeile.id === ich?.id
                return (
                  <li key={zeile.id} className={zeile.gesperrt ? 'pmh-kt__zeile is-gesperrt' : 'pmh-kt__zeile'}>
                    <div className="pmh-kt__wer">
                      <span className="pmh-kt__mail">{zeile.email}</span>
                      <span className="pmh-kt__name">
                        {zeile.displayName === '' ? '—' : zeile.displayName}
                        {selbst ? ` · ${t('self')}` : ''}
                      </span>
                    </div>
                    <span className={zeile.role === 'admin' ? 'pmh-kt__rolle is-admin' : 'pmh-kt__rolle'}>
                      {zeile.role === 'admin' ? t('roleAdmin') : t('roleUser')}
                    </span>
                    <span className={zeile.gesperrt ? 'pmh-kt__stand is-gesperrt' : 'pmh-kt__stand'}>
                      {zeile.gesperrt ? t('blocked') : t('active')}
                    </span>
                    <small className="pmh-kt__datum">{new Date(zeile.erstelltAm).toLocaleDateString()}</small>

                    <div className="pmh-kt__aktionen">
                      <button
                        className="pmh-kt__btn pmh-kt__btn--klein"
                        type="button"
                        disabled={arbeitet || selbst}
                        onClick={() => beimSperren(zeile.id, !zeile.gesperrt)}
                      >
                        {zeile.gesperrt ? t('unblock') : t('block')}
                      </button>
                      <button
                        className="pmh-kt__btn pmh-kt__btn--klein"
                        type="button"
                        disabled={arbeitet || selbst}
                        onClick={() => beimRolle(zeile.id, zeile.role === 'admin' ? 'user' : 'admin')}
                      >
                        {zeile.role === 'admin' ? t('makeUser') : t('makeAdmin')}
                      </button>
                      <button
                        className="pmh-kt__btn pmh-kt__btn--klein"
                        type="button"
                        disabled={arbeitet || zeile.gesperrt}
                        onClick={() => beimPasswortLink(zeile.id)}
                      >
                        {t('passwordLink')}
                      </button>
                      <button
                        className={
                          bestaetigen === zeile.id
                            ? 'pmh-kt__btn pmh-kt__btn--klein pmh-kt__btn--gefahr is-scharf'
                            : 'pmh-kt__btn pmh-kt__btn--klein pmh-kt__btn--gefahr'
                        }
                        type="button"
                        disabled={arbeitet || selbst}
                        onClick={() => beimLoeschen(zeile.id)}
                        onBlur={() => setBestaetigen(null)}
                      >
                        {bestaetigen === zeile.id ? t('deleteSure') : t('delete')}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="pmh-kt__abschnitt">
          <div className="pmh-kt__abschnittkopf">
            <h3>{t('invitations')}</h3>
            <span className="pmh-kt__zahl">{einladungen.filter((e) => e.zustand === 'offen').length}</span>
          </div>
          <p className="pmh-kt__still">{t('invitationsHint')}</p>

          <div className="pmh-kt__form">
            <label className="pmh-kt__feld">
              <span>{t('duration')}</span>
              <select
                value={String(dauer)}
                onChange={(ereignis) => setDauer(Number(ereignis.target.value))}
              >
                <option value={String(60 * 60)}>{t('hour')}</option>
                <option value={String(24 * 60 * 60)}>{t('day')}</option>
                <option value={String(7 * 24 * 60 * 60)}>{t('week')}</option>
                <option value={String(30 * 24 * 60 * 60)}>{t('month')}</option>
              </select>
            </label>
            <label className="pmh-kt__feld">
              <span>{t('note')}</span>
              <input
                type="text"
                value={notiz}
                maxLength={120}
                onChange={(ereignis) => setNotiz(ereignis.target.value)}
                placeholder="für Anna"
              />
            </label>
            <button className="pmh-kt__btn pmh-kt__btn--voll" type="button" disabled={arbeitet} onClick={beimEinladen}>
              {t('create')}
            </button>
          </div>

          {neue !== null && (
            <div className="pmh-kt__link">
              <strong>{t('linkTitle')}</strong>
              <code>{einladungsLink(neue.token)}</code>
              <div className="pmh-kt__linkzeile">
                <button className="pmh-kt__btn" type="button" onClick={() => void beimKopieren(neue.token)}>
                  {kopiert ? t('copied') : t('copy')}
                </button>
                <small>
                  {t('duration')} {new Date(neue.laeuftAb).toLocaleString()}
                </small>
              </div>
            </div>
          )}

          {einladungen.length === 0 ? (
            <p className="pmh-kt__leer">{t('emptyInvitations')}</p>
          ) : (
            <ul className="pmh-kt__liste">
              {einladungen.map((zeile) => (
                <li key={zeile.id} className="pmh-kt__zeile">
                  <span className={`pmh-kt__stand is-${zeile.zustand}`}>{zustandText(zeile.zustand, t)}</span>
                  <span className="pmh-kt__name">{zeile.note === '' ? '—' : zeile.note}</span>
                  <small className="pmh-kt__datum">{new Date(zeile.laeuftAb).toLocaleString()}</small>
                  {zeile.zustand === 'offen' && (
                    <button
                      className="pmh-kt__btn pmh-kt__btn--klein"
                      type="button"
                      disabled={arbeitet}
                      onClick={() => beimZuruecknehmen(zeile.id)}
                    >
                      {t('revoke')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/** Zwei Personen — die Verwaltung. Eine Linienstärke, wie die übrigen Panels. */
export function KontenIcon({ size = 20 }: { readonly size?: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-2.8 2.4-4.6 5.5-4.6s5.5 1.8 5.5 4.6" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M15.2 14.6c2.6.2 4.3 1.8 4.3 4.1" />
    </svg>
  )
}

/**
 * Die Karte in der Plugin-Liste — der zweite Ort, den ein Plugin nehmen kann.
 *
 * **Was hier steht und warum.** Der Plugin-Manager fragt eine Anmeldung in `plugins.item` zweimal:
 * einmal für die **Kurzfassung** in der Liste (`view: 'summary'`) und einmal für den **Rumpf** der
 * eigenen Seite (`view: 'page'`). Die Kurzfassung ist eine Zeile; der Rumpf ist dasselbe Panel wie
 * im Hauptfeld — nicht eine zweite Anzeige, sondern dieselbe an einem zweiten Ort.
 *
 * **Warum die Kurzfassung `panel` nennt.** Einen Satz über dieses Panel gibt es im Sprachpaket
 * nicht (anders als `pmh-usage`, das einen `guide`-Text mitbringt). Einen Schlüssel nur für die
 * Karte zu erfinden hieße, eine zweite Beschriftung derselben Sache zu führen — also nimmt die
 * Karte den Namen, den das Panel auch in der Leiste trägt.
 *
 * **Was hier bewusst nicht steht.** Kein eigener Speichern-Knopf: dieses Panel liest und schreibt
 * Konten, aber es stellt sich nicht selbst ein. Was der Nutzer an der Anzeige ändert, ändert er in
 * den Einstellungen des Eintrags — dort, wo die `Config` liegt, und nicht in einer zweiten
 * Steuerung daneben.
 */
function KontenItem({ view, t }: PluginConfigViewProps & Props): ReactElement {
  if (view === 'summary') return <span className="pmh-kt__chip">{t('panel')}</span>
  return <KontenPanel t={t} />
}

/** Hängt Panel, Sidebar-Eintrag und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhKonten = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'konten: Stil')

  const close = (): void => {
    ctx.layout.selectPanel(null)
  }

  /*
   * **Die Texte kommen jetzt aus dem Sprachpaket.**
   *
   * Hier standen zwei `ctx.locale.register`-Aufrufe. Sie sind entfallen, weil
   * `@prometheus-harness/client-locale` denselben Namensraum anmeldet — und der Kern läßt je
   * (Namensraum, Sprache) **genau einen** Eigentümer zu: eine zweite Anmeldung wirft beim Laden.
   * Die Quelle bleibt `locale/de.json`/`locale/en.json` in diesem Paket; sie wird von
   * `scripts/language-merge.mjs` ins Sprachpaket übernommen.
   */
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ close }),
      },
      KontenPanel,
    )
  })

  /*
   * **Die Anzeige kommt jetzt aus den Einstellungen.**
   *
   * Vorher stand hier `order: 12` fest und `sidebar.panellist` wurde immer angemeldet. Jetzt liest
   * dieser Block den Eintrag `pmh-accounts` über `configForms` und meldet **je nach `surface`** an:
   * die Seitenleiste, die Karte in der Plugin-Liste, oder beides — oder nichts.
   *
   * **Warum neu angemeldet statt nur umgeschaltet.** `order` ist Teil der Anmeldung; ein Eintrag mit
   * geänderter Reihenfolge ist ein anderer Eintrag. Deshalb wird bei jeder Änderung abgemeldet und
   * neu angemeldet — aber nur, wenn sich der **Wirkschlüssel** wirklich geändert hat, sonst würde
   * jeder Schnappschuß des Hosts die Oberfläche neu bauen.
   */
  ctx.effect(() => {
    const form = ctx.configForms.get<DisplayConfig>(ENTRY_ID)
    let abgemeldet: (() => void)[] = []
    let zuletzt = ''

    const anmelden = (): void => {
      const anzeige = liesAnzeige(form.getSnapshot().value)
      const schluessel = JSON.stringify(anzeige)
      if (schluessel === zuletzt) return
      zuletzt = schluessel

      for (const ab of abgemeldet) ab()
      abgemeldet = []

      const titel = (): string => anzeige.beschriftung ?? t('panel')

      if (anzeige.oberflaeche === 'sidebar' || anzeige.oberflaeche === 'both') {
        abgemeldet.push(
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: anzeige.reihenfolge,
                label: titel,
                locale: NS,
              },
              KontenIcon,
            ),
          ),
        )
      }

      if (anzeige.oberflaeche === 'plugins' || anzeige.oberflaeche === 'both') {
        abgemeldet.push(
          ctx.slots.inject('plugins.item', () =>
            ctx.slots.register(
              {
                name: 'plugins.item',
                id: PANEL_ID,
                order: anzeige.reihenfolge,
                label: titel,
                locale: NS,
              },
              KontenItem,
            ),
          ),
        )
      }
    }

    anmelden()
    const abhoeren = form.subscribe(anmelden)
    return () => {
      abhoeren()
      for (const ab of abgemeldet) ab()
      abgemeldet = []
    }
  }, 'konten: Anzeige nach den Einstellungen')
}

const CSS = `
.pmh-kt{
  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
  background:radial-gradient(120% 80% at 15% 0%,#0f1a18 0%,#090d0c 55%,#07090a 100%);
  color:#e9f2ef;font:13px/1.5 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
}
.pmh-kt__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-kt__brand{display:flex;align-items:center;gap:11px;color:#a8e6cf}
.pmh-kt__brandtext{display:flex;flex-direction:column;gap:1px}
.pmh-kt__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(168,230,207,.55)}
.pmh-kt__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f2fff9}
/* **Die eine Zeile der Plugin-Liste.** Monospace wie die übrigen Kurztexte des Panels, in der
   Farbe der Marke — sie steht dort, wo sonst der Titel der Karte steht, und soll nicht wie ein
   Fließtext aussehen. */
.pmh-kt__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d9f7ec}
.pmh-kt__actions{display:flex;align-items:center;gap:9px}
.pmh-kt__btn{
  appearance:none;border:1px solid rgba(150,220,195,.22);background:rgba(18,34,30,.6);
  color:#e8faf3;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor:pointer;text-decoration:none;transition:border-color .18s ease,background .18s ease;
}
.pmh-kt__btn:hover:not(:disabled){border-color:rgba(150,230,200,.6);background:rgba(28,52,46,.75)}
.pmh-kt__btn:disabled{opacity:.45;cursor:default}
.pmh-kt__btn--ghost{border-color:transparent;background:transparent;color:rgba(233,242,239,.6)}
.pmh-kt__btn--klein{padding:4px 8px;font-size:10px}
.pmh-kt__btn--voll{width:100%}
.pmh-kt__body{flex:1;min-height:0;overflow:auto;padding:18px 20px 26px;display:grid;gap:26px}
.pmh-kt__abschnitt{display:flex;flex-direction:column;gap:8px}
.pmh-kt__abschnittkopf{display:flex;align-items:baseline;gap:9px}
.pmh-kt__abschnittkopf h3{margin:0;font-size:15px;font-weight:600;color:#f2fff9;letter-spacing:-.01em}
.pmh-kt__zahl{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(168,230,207,.7);border:1px solid rgba(150,220,195,.22);border-radius:999px;padding:3px 7px}
.pmh-kt__still{margin:0 0 4px;font-size:11.5px;line-height:1.5;color:rgba(233,242,239,.5);max-width:78ch}
.pmh-kt__leer{margin:10px 0;color:rgba(233,242,239,.42);font-size:12px}
.pmh-kt__fehler{display:flex;align-items:center;gap:12px;margin:14px 20px 0;padding:10px 12px;border:1px solid rgba(255,120,120,.25);border-radius:9px;background:rgba(60,20,30,.35);color:#ffd9d9;font-size:12px}
.pmh-kt__hinweis{margin:22px 20px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}
.pmh-kt__hinweis strong{display:block;margin-bottom:4px;color:#f2fff9}
.pmh-kt__hinweis p{margin:0 0 12px;color:rgba(233,242,239,.55);font-size:12px}
.pmh-kt__liste{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.pmh-kt__zeile{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:8px 10px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(255,255,255,.015)}
.pmh-kt__zeile.is-gesperrt{opacity:.62}
.pmh-kt__wer{display:flex;flex-direction:column;gap:1px;min-width:180px;flex:1}
.pmh-kt__mail{font-size:12.5px;color:#f0fdf8;overflow-wrap:anywhere}
.pmh-kt__name{font-size:11px;color:rgba(233,242,239,.45)}
.pmh-kt__rolle{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;padding:4px 7px;border-radius:999px;border:1px solid rgba(150,220,195,.2);color:rgba(233,242,239,.55)}
.pmh-kt__rolle.is-admin{border-color:rgba(255,205,120,.45);color:#ffd88a}
.pmh-kt__stand{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;padding:4px 7px;border-radius:999px;border:1px solid rgba(120,220,160,.35);color:#8fe3b6}
.pmh-kt__stand.is-gesperrt,.pmh-kt__stand.is-abgelaufen,.pmh-kt__stand.is-zurueckgezogen{border-color:rgba(255,140,140,.35);color:#ffb4b4}
.pmh-kt__stand.is-eingeloest{border-color:rgba(150,190,255,.35);color:#a9c6ff}
.pmh-kt__datum{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,242,239,.35);margin-left:auto}
.pmh-kt__form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin:6px 0 12px;max-width:640px}
.pmh-kt__feld{display:grid;gap:4px;font-size:11px;color:rgba(233,242,239,.55)}
.pmh-kt__feld select,.pmh-kt__feld input{
  padding:7px 9px;border:1px solid rgba(150,220,195,.2);border-radius:7px;background:rgba(8,14,12,.6);
  color:#e9f2ef;font:12px/1.3 "Segoe UI", system-ui, sans-serif;outline:none;
}
.pmh-kt__feld select:focus-visible,.pmh-kt__feld input:focus-visible{border-color:rgba(150,230,200,.55);box-shadow:0 0 0 3px rgba(90,200,160,.1)}
.pmh-kt__link{display:grid;gap:8px;margin:0 0 14px;padding:12px;border:1px solid rgba(150,220,195,.22);border-radius:9px;background:rgba(10,20,17,.6);max-width:680px}
.pmh-kt__link strong{font-size:12px;color:#f2fff9}
.pmh-kt__link code{font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:#a8e6cf;word-break:break-all;background:rgba(0,0,0,.25);padding:8px;border-radius:6px}
.pmh-kt__linkzeile{display:flex;align-items:center;gap:12px}
.pmh-kt__linkzeile small{font:10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,242,239,.4)}
/* **Die Zeile trägt jetzt Handlungen.** Datum und Aktionen teilen sich den
   rechten Rand: das Datum bleibt ruhig, die vier Knöpfe stehen dahinter. */
.pmh-kt__zeile .pmh-kt__datum{margin-left:0}
.pmh-kt__aktionen{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.pmh-kt__aktionen .pmh-kt__btn{opacity:.72}
.pmh-kt__zeile:hover .pmh-kt__aktionen .pmh-kt__btn{opacity:1}
.pmh-kt__rechts{margin-left:auto}
.pmh-kt__btn--gefahr{color:rgba(255,180,180,.8);border-color:rgba(255,140,140,.22)}
.pmh-kt__btn--gefahr:hover:not(:disabled){border-color:rgba(255,140,140,.6);background:rgba(60,20,20,.6);color:#ffd0d0}
.pmh-kt__btn--gefahr.is-scharf{background:rgba(120,30,30,.75);border-color:rgba(255,140,140,.7);color:#fff}
.pmh-kt__feld--schmal{max-width:140px}
@media (max-width:760px){
  .pmh-kt__body{padding:14px}
  .pmh-kt__wer{min-width:120px}
  .pmh-kt__datum{margin-left:0}
  .pmh-kt__aktionen{margin-left:0;width:100%}
}
`
