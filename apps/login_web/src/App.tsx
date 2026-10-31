/**
 * `@prometheus-harness/login-web/App` — die Seite: **anmelden** oder **Konto anlegen**.
 *
 * ## Der Ablauf
 *
 * 1. Beim Laden fragt die Seite `/api/pmh/auth/me`. Ist man angemeldet, zeigt sie das Konto
 *    und den Weg weiter; sonst das Formular.
 * 2. Nach erfolgreicher Anmeldung zeigt sie den Weg nach `/start` an (die Schnittstelle des
 *    Rechners). **Automatisch** leitet sie nicht weiter — die Einstellung dafür gibt es noch
 *    nicht (siehe `src/redirect.ts`).
 * 3. Beim Konto-Anlegen ist das **Claim-Token** das Feld, das heute zählt: solange **kein**
 *    Admin im Bestand ist, verlangt der Server es (gemessen: 403 `claim-fehlt`), und das erste
 *    so angelegte Konto wird `admin`.
 *
 * ## Die Sprache
 *
 * Die Texte kommen aus `@prometheus-harness/languages` — **demselben** Paket, aus dem der
 * Rechner seine Seite `/start` baut. Keine Abschrift, also keine zweite Wahrheit. Der
 * Umschalter schreibt den Keks `pmh_sprache`; dieselbe Wahl gilt danach auch für `/start`.
 *
 * **Die Meldungen des Rechners bleiben vorerst deutsch.** Sie kommen wörtlich vom Server
 * (`zugangsdaten-falsch` → „Adresse oder Passwort ist falsch."), und der Server kennt heute
 * keine Sprachwahl. Eine übersetzte Oberfläche mit deutschen Fehlermeldungen ist besser als
 * geratene Übersetzungen — aber es ist eine offene Stelle, kein fertiger Zustand.
 *
 * @module @prometheus-harness/login-web/App
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import {
  abmelden,
  anmelden,
  einladungAnlegen,
  einladungZuruecknehmen,
  einladungen,
  ich,
  passwortSetzen,
  registrieren,
  zugang,
} from './api.ts'
import type { AuthFehler, EinladungZeile, Konto, NeueEinladung } from './api.ts'
import { einladungsToken, ermittleZiel, resetToken } from './redirect.ts'
import { SPRACHEN, gewaehlteSprache, ladeSprachliste, merkeSprache, texteFuer } from './language.ts'
import type { Sprache, Texte } from './language.ts'

/** Welches Formular sichtbar ist. */
type Ansicht = 'anmelden' | 'registrieren' | 'passwort'

/**
 * Wird nach erfolgreicher Anmeldung **automatisch** weitergeleitet?
 *
 * **Nein, und das ist vorerst Absicht.** Der Betreiber hat gesagt, daß eine Einstellung
 * später steuert, was nach der Anmeldung passiert. Bis sie da ist, zeigt die Seite den Weg
 * **an** und läßt ihn anklicken — eine Weiterleitung ohne Einstellung würde die Entscheidung
 * vorwegnehmen.
 */
const AUTOMATISCH_WEITER = false

/**
 * Ein Eingabefeld mit Beschriftung.
 *
 * @param props - Beschriftung, Wert und Änderung
 * @returns das Feld
 */
function Feld(props: {
  readonly id: string
  readonly label: string
  readonly typ: string
  readonly wert: string
  readonly hinweis?: string
  readonly aendern: (wert: string) => void
}): ReactElement {
  return (
    <p className="feld">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.typ}
        value={props.wert}
        autoComplete={props.typ === 'password' ? 'current-password' : 'on'}
        onChange={(e) => {
          props.aendern(e.target.value)
        }}
      />
      {props.hinweis !== undefined && <small>{props.hinweis}</small>}
    </p>
  )
}

/**
 * Der Umschalter für die Sprache.
 *
 * Die Liste kommt vom Rechner (`/api/pmh/auth/sprachen`), mit der mitgebündelten Liste als
 * Rückfall — deshalb wird `liste` hereingereicht und nicht hier geholt.
 *
 * @param props - die angebotenen Sprachen, die gewählte und die Änderung
 * @returns das Auswahlfeld
 */
function Sprachwahl(props: {
  readonly liste: readonly Sprache[]
  readonly gewaehlt: string
  readonly label: string
  readonly aendern: (id: string) => void
}): ReactElement {
  return (
    <p className="sprachwahl">
      <label htmlFor="sprache">{props.label}</label>{' '}
      <select
        id="sprache"
        value={props.gewaehlt}
        onChange={(e) => {
          props.aendern(e.target.value)
        }}
      >
        {props.liste.map((sprache) => (
          <option key={sprache.id} value={sprache.id}>
            {sprache.label}
          </option>
        ))}
      </select>
    </p>
  )
}

/**
 * Die Dauer, die das Auswahlfeld anbietet — in Sekunden.
 *
 * **Warum hier und nicht vom Server.** Der Server **prüft** die Dauer
 * (`waehleDauer` in `auth-http/einladung.ts`); die Liste hier ist nur eine
 * Bequemlichkeit für den Admin. Eine Zahl, die der Server nicht kennt, wäre
 * trotzdem abgewiesen — die Prüfung ist nicht dupliziert, sondern die Auswahl
 * ist eine Auswahl.
 */
const DAUERN: readonly { readonly sekunden: number; readonly text: (t: Texte) => string }[] = [
  { sekunden: 60 * 60, text: (t) => t.einladungDauerStunde },
  { sekunden: 24 * 60 * 60, text: (t) => t.einladungDauerTag },
  { sekunden: 7 * 24 * 60 * 60, text: (t) => t.einladungDauerWoche },
  { sekunden: 30 * 24 * 60 * 60, text: (t) => t.einladungDauerMonat },
]

/**
 * Baut den Einladungslink.
 *
 * **Aus dem eigenen Ursprung, nicht aus dem `Host`-Kopf.** Der Server weiß, wer
 * fragt, aber nicht, unter welcher Adresse *diese* Seite erreichbar ist — und
 * der `Host`-Kopf ist frei wählbar. Die Seite kennt ihre eigene Adresse; sie
 * ersetzt nur die Abfrage.
 *
 * @param token - der Klartext-Token
 * @returns die vollständige Adresse
 */
function einladungsLink(token: string): string {
  return new URL(`?token=${encodeURIComponent(token)}`, window.location.href).toString()
}

/**
 * Der Zustand einer Einladung als Wort.
 *
 * **Warum ein `switch` über die Aufzählung und kein Wörterbuch.** Der Typlauf
 * erzwingt, daß jeder Fall dasteht: kommt ein Zustand dazu, fehlt ein Zweig und
 * die Funktion liefert kein `string` mehr. Ein Wörterbuch mit Zeichenschlüsseln
 * würde still `undefined` zurückgeben.
 *
 * @param zustand - der Zustand
 * @param texte - die Texte der gewählten Sprache
 * @returns das Wort
 */
function zustandsText(zustand: EinladungZeile['zustand'], texte: Texte): string {
  switch (zustand) {
    case 'offen':
      return texte.einladungOffen
    case 'eingeloest':
      return texte.einladungEingeloest
    case 'abgelaufen':
      return texte.einladungAbgelaufen
    case 'zurueckgezogen':
      return texte.einladungZurueckgezogen
  }
}

/**
 * Die Anmeldeseite.
 *
 * @returns die Seite
 */
export function App(): ReactElement {
  const tokenAusAdresse = einladungsToken(window.location.search)
  // **Der Passwort-Link.** Ein bestehendes Konto, dessen Passwort noch fehlt
  // oder vergessen ist. Eigener Parameter, eigener Vorgang — siehe `redirect.ts`.
  const resetAusAdresse = resetToken(window.location.search)

  const [ansicht, setAnsicht] = useState<Ansicht>(
    resetAusAdresse !== undefined ? 'passwort' : tokenAusAdresse === undefined ? 'anmelden' : 'registrieren',
  )
  const [konto, setKonto] = useState<Konto | undefined>(undefined)
  const [geprueft, setGeprueft] = useState(false)
  const [fehler, setFehler] = useState<AuthFehler | undefined>(undefined)
  const [laeuft, setLaeuft] = useState(false)

  const [sprache, setSprache] = useState<string>(() => gewaehlteSprache())
  const [liste, setListe] = useState<readonly Sprache[]>(SPRACHEN)

  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [name, setName] = useState('')
  const [claim, setClaim] = useState('')

  const [dauer, setDauer] = useState<number>(7 * 24 * 60 * 60)
  const [notiz, setNotiz] = useState('')
  const [neueEinladung, setNeueEinladung] = useState<NeueEinladung | undefined>(undefined)
  const [einladungsListe, setEinladungsListe] = useState<readonly EinladungZeile[]>([])
  const [kopiert, setKopiert] = useState(false)

  const texte: Texte = texteFuer(sprache)
  const ziel = ermittleZiel(window.location.search)

  /** Wer bin ich? Beim Laden und nach jeder Änderung. */
  const nachsehen = useCallback(async () => {
    const a = await ich()
    setKonto(a.ok ? a.value : undefined)
    setGeprueft(true)
  }, [])

  /** Die Einladungen des Administrators holen. */
  const ladeEinladungen = useCallback(async () => {
    const a = await einladungen()
    setEinladungsListe(a.ok && a.value?.einladungen !== undefined ? a.value.einladungen : [])
  }, [])

  useEffect(() => {
    void nachsehen()
  }, [nachsehen])

  // **Die Liste gehört nur dem Administrator.** Ein gewöhnlicher Benutzer
  // bekommt sie gar nicht erst angefragt — der Server würde ohnehin 403
  // antworten, aber ein Aufruf, der nur scheitert, ist kein Aufruf.
  useEffect(() => {
    if (konto?.role !== 'admin') {
      setEinladungsListe([])
      return
    }
    void ladeEinladungen()
  }, [konto?.role, ladeEinladungen])

  // Die angebotenen Sprachen holt der Rechner — er ist die Quelle, nicht die Seite.
  useEffect(() => {
    void ladeSprachliste().then((geholt) => {
      setListe(geholt)
    })
  }, [])

  // Der Fenstertitel gehört zur Sprache.
  useEffect(() => {
    document.title = texte.seitenTitel
  }, [texte])

  /** Wechselt die Sprache und merkt sie im Keks. */
  const wechsleSprache = (id: string): void => {
    setSprache(id)
    merkeSprache(id)
  }

  /** Führt eine Aktion aus und zeigt den Fehler des Servers **wörtlich**. */
  const mache = async (arbeit: () => Promise<{ ok: boolean; error?: AuthFehler }>): Promise<void> => {
    setLaeuft(true)
    setFehler(undefined)
    const a = await arbeit()
    if (!a.ok && a.error !== undefined) setFehler(a.error)
    else setFehler(undefined)
    setLaeuft(false)
  }

  const beimAnmelden = async (ereignis: React.FormEvent): Promise<void> => {
    ereignis.preventDefault()
    await mache(async () => {
      const a = await anmelden(email, passwort)
      if (a.ok) {
        await nachsehen()
        if (AUTOMATISCH_WEITER) window.location.assign(ziel)
      }
      return a
    })
  }

  const beimRegistrieren = async (ereignis: React.FormEvent): Promise<void> => {
    ereignis.preventDefault()
    await mache(async () => {
      const a = await registrieren({        email,
        password: passwort,
        ...(name === '' ? {} : { displayName: name }),
        ...(claim === '' ? {} : { claimToken: claim }),
        // **Der Einladungs-Token kommt aus der Adresse, nicht aus einem Feld.**
        // Er ist das Geheimnis des Links; ihn abzutippen wäre eine Hürde ohne
        // Gewinn.
        ...(tokenAusAdresse === undefined ? {} : { einladungToken: tokenAusAdresse }),
      })
      if (a.ok) {
        // **Den verbrauchten Token aus der Adresse nehmen.** Er steht sonst im
        // Verlauf und in jedem Lesezeichen, obwohl er nichts mehr öffnet. Der
        // Server hat ihn bereits verbraucht; das hier räumt nur die Spuren.
        if (tokenAusAdresse !== undefined) {
          const sauber = new URL(window.location.href)
          sauber.searchParams.delete('token')
          window.history.replaceState(null, '', sauber.toString())
        }
        // Nach dem Anlegen gleich anmelden — sonst müßte man zweimal tippen.
        const b = await anmelden(email, passwort)
        if (b.ok) await nachsehen()
        return b
      }
      return a
    })
  }

  /** Löst den Passwort-Link ein — der einzige Weg ohne vorherige Sitzung. */
  const beimPasswortSetzen = async (ereignis: React.FormEvent): Promise<void> => {
    ereignis.preventDefault()
    if (resetAusAdresse === undefined) return
    await mache(async () => {
      const a = await passwortSetzen(resetAusAdresse, passwort)
      if (a.ok) {
        // **Den verbrauchten Token aus der Adresse nehmen** — dieselbe
        // Begründung wie beim Einladungslink: er steht sonst im Verlauf.
        const sauber = new URL(window.location.href)
        sauber.searchParams.delete('reset')
        window.history.replaceState(null, '', sauber.toString())
        await nachsehen()
      }
      return a
    })
  }

  /** Erzeugt eine Einladung — nur der Administrator kommt hierher. */
  const beimEinladen = async (ereignis: React.FormEvent): Promise<void> => {
    ereignis.preventDefault()
    setKopiert(false)
    await mache(async () => {
      const a = await einladungAnlegen(dauer, notiz)
      if (a.ok) {
        // **Der Klartext-Token steht ab jetzt nur hier.** Der Server hat ihn
        // gespeichert als Hash; ein zweites Anzeigen gibt es nicht.
        setNeueEinladung(a.value)
        setNotiz('')
        await ladeEinladungen()
      }
      return a
    })
  }

  /** Nimmt eine Einladung zurück — der Link ist danach tot. */
  const beimZuruecknehmen = async (id: string): Promise<void> => {
    await mache(async () => {
      const a = await einladungZuruecknehmen(id)
      if (a.ok) await ladeEinladungen()
      return a
    })
  }

  /** Kopiert den Link in die Zwischenablage. */
  const beimKopieren = async (token: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(einladungsLink(token))
      setKopiert(true)
    } catch {
      // **Kein stiller Erfolg.** Ohne Zwischenablage (http, ältere Browser,
      // verweigerte Erlaubnis) steht der Link weiterhin sichtbar da — die
      // Meldung sagt, was zu tun ist.
      setKopiert(false)
      setFehler({ code: 'zwischenablage', message: 'Kopieren ging nicht — bitte den Link von Hand markieren.' })
    }
  }

  const beimAbmelden = async (): Promise<void> => {
    await mache(async () => abmelden())
    await nachsehen()
  }

  /**
   * Öffnet die Oberfläche des Rechners.
   *
   * Die Adresse kommt vom Server und trägt den Zugangsschlüssel. Sie wird **nicht** angezeigt,
   * sondern nur geöffnet — sonst stünde der Schlüssel auf dem Bildschirm, wo ihn jeder sieht,
   * der über die Schulter schaut.
   */
  const beimOeffnen = async (): Promise<void> => {
    setLaeuft(true)
    setFehler(undefined)
    const a = await zugang()
    setLaeuft(false)
    if (a.ok) {
      if (a.value?.url !== undefined) window.location.assign(a.value.url)
      return
    }
    setFehler(a.error)
  }

  if (!geprueft) {
    return (
      <main className="karte">
        <h1>{texte.titel}</h1>
        <p className="still">{texte.laden}</p>
      </main>
    )
  }

  // ---- Angemeldet ----
  if (konto !== undefined) {
    return (
      <main className="karte">
        <Sprachwahl liste={liste} gewaehlt={sprache} label={texte.spracheLabel} aendern={wechsleSprache} />
        <h1>{texte.angemeldet}</h1>
        <p>
          <strong>{konto.displayName ?? konto.email ?? texte.rolleKonto}</strong>
          {konto.role !== undefined && <span className="rolle"> {konto.role}</span>}
        </p>
        <p className="still">
          {texte.weiterZu} <code>{ziel}</code>
        </p>

        {/* **Nur für Administratoren.** Der Knopf öffnet die Oberfläche des Rechners; die
            Adresse trägt den Zugangsschlüssel, und wer sie hat, kommt an alles. */}
        {konto.role === 'admin' && (
          <div className="zugang">
            <button type="button" className="knopf" disabled={laeuft} onClick={() => void beimOeffnen()}>
              {texte.knopfZumHarness}
            </button>
            <small>{texte.zugangHinweis}</small>
          </div>
        )}

        {/* **Der Verwaltungsbereich: Einladungen.** Ein Administrator erzeugt
            einen Link mit Ablauf; wer ihn öffnet, legt sein eigenes Konto an
            und setzt sein eigenes Paßwort. Genau das fehlte: beim Anlegen durch
            den Admin kannte dieser das fremde Paßwort. */}
        {konto.role === 'admin' && (
          <section className="einladungen">
            <h2>{texte.einladungTitel}</h2>
            <p className="still">{texte.einladungHinweis}</p>

            <form onSubmit={(e) => void beimEinladen(e)}>
              <p className="feld">
                <label htmlFor="dauer">{texte.einladungFeldDauer}</label>
                <select
                  id="dauer"
                  value={String(dauer)}
                  onChange={(e) => {
                    setDauer(Number(e.target.value))
                  }}
                >
                  {DAUERN.map((eine) => (
                    <option key={eine.sekunden} value={String(eine.sekunden)}>
                      {eine.text(texte)}
                    </option>
                  ))}
                </select>
              </p>
              <Feld
                id="notiz"
                label={texte.einladungFeldNotiz}
                typ="text"
                wert={notiz}
                aendern={setNotiz}
              />
              <button type="submit" className="knopf" disabled={laeuft}>
                {texte.einladungErzeugen}
              </button>
            </form>

            {neueEinladung !== undefined && (
              <div className="neuerlink">
                <p>
                  <strong>{texte.einladungLinkTitel}</strong>
                </p>
                <code className="link">{einladungsLink(neueEinladung.token)}</code>
                <button
                  type="button"
                  className="knopf zweit"
                  onClick={() => void beimKopieren(neueEinladung.token)}
                >
                  {kopiert ? texte.einladungKopiert : texte.einladungKopieren}
                </button>
                <small>
                  {texte.einladungFeldDauer} {new Date(neueEinladung.laeuftAb).toLocaleString()}
                </small>
              </div>
            )}

            <h3>{texte.einladungListeTitel}</h3>
            {einladungsListe.length === 0 ? (
              <p className="still">{texte.einladungLeer}</p>
            ) : (
              <ul className="liste">
                {einladungsListe.map((eine) => (
                  <li key={eine.id}>
                    <span className={`zustand ${eine.zustand}`}>{zustandsText(eine.zustand, texte)}</span>
                    <span className="notiz">{eine.note === '' ? '—' : eine.note}</span>
                    <small>{new Date(eine.laeuftAb).toLocaleString()}</small>
                    {eine.zustand === 'offen' && (
                      <button
                        type="button"
                        className="knopf zweit klein"
                        disabled={laeuft}
                        onClick={() => void beimZuruecknehmen(eine.id)}
                      >
                        {texte.einladungZuruecknehmen}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="knoepfe">
          <a className="knopf" href={ziel}>
            {texte.weiter}
          </a>
          <button type="button" className="knopf zweit" disabled={laeuft} onClick={() => void beimAbmelden()}>
            {texte.abmelden}
          </button>
        </div>
        {fehler !== undefined && <p className="fehler">{fehler.message}</p>}
      </main>
    )
  }

  // ---- Passwort setzen (über den Einmal-Link) ----
  //
  // **Diese Ansicht steht vor der Anmeldung und hat kein Adreßfeld.** Wer den
  // Link hat, ist der Mensch — die Adresse steht im Konto, nicht in der
  // Eingabe. Zwei Felder weniger, die falsch sein können.
  if (resetAusAdresse !== undefined) {
    return (
      <main className="karte">
        <Sprachwahl liste={liste} gewaehlt={sprache} label={texte.spracheLabel} aendern={wechsleSprache} />
        <h1>{texte.passwortTitel}</h1>
        <p className="still">{texte.passwortSeiteHinweis}</p>
        <form onSubmit={(e) => void beimPasswortSetzen(e)}>
          <Feld
            id="passwort"
            label={texte.passwortFeld}
            typ="password"
            wert={passwort}
            aendern={setPasswort}
            hinweis={texte.passwortHinweis}
          />
          <div className="knoepfe">
            <button className="knopf" type="submit" disabled={laeuft}>
              {texte.passwortTitel}
            </button>
            <a className="knopf zweit" href={ziel}>
              {texte.knopfZurAnmeldung}
            </a>
          </div>
        </form>
        {fehler !== undefined && <p className="fehler">{fehler.message}</p>}
      </main>
    )
  }

  // ---- Nicht angemeldet ----
  return (
    <main className="karte">
      <Sprachwahl liste={liste} gewaehlt={sprache} label={texte.spracheLabel} aendern={wechsleSprache} />
      <h1>{tokenAusAdresse === undefined ? texte.titel : texte.eingeladenTitel}</h1>
      <p className="still">
        {tokenAusAdresse !== undefined
          ? texte.eingeladenHinweis
          : ansicht === 'anmelden'
            ? texte.bitteAnmelden
            : texte.bitteAnlegen}
      </p>

      <form onSubmit={(e) => void (ansicht === 'anmelden' ? beimAnmelden(e) : beimRegistrieren(e))}>
        <Feld id="email" label={texte.feldAdresse} typ="email" wert={email} aendern={setEmail} />
        <Feld
          id="passwort"
          label={texte.feldPasswort}
          typ="password"
          wert={passwort}
          aendern={setPasswort}
          {...(ansicht === 'registrieren' ? { hinweis: texte.passwortHinweis } : {})}
        />
        {ansicht === 'registrieren' && (
          <>
            <Feld id="name" label={texte.feldName} typ="text" wert={name} aendern={setName} />
            {/* **Das Claim-Feld nur, wenn es kein Einladungslink ist.** Wer
                eingeladen wurde, hat keinen Claim und braucht keinen — das Feld
                zeigte ihm sonst ein Geheimnis, das er nicht besitzt. */}
            {tokenAusAdresse === undefined && (
              <Feld
                id="claim"
                label={texte.feldClaim}
                typ="password"
                wert={claim}
                aendern={setClaim}
                hinweis={texte.claimHinweis}
              />
            )}
          </>
        )}
        <div className="knoepfe">
          <button type="submit" className="knopf" disabled={laeuft}>
            {ansicht === 'anmelden' ? texte.knopfAnmelden : texte.knopfKontoAnlegen}
          </button>
          <button
            type="button"
            className="knopf zweit"
            disabled={laeuft}
            onClick={() => {
              setAnsicht(ansicht === 'anmelden' ? 'registrieren' : 'anmelden')
              setFehler(undefined)
            }}
          >
            {ansicht === 'anmelden' ? texte.knopfKontoAnlegen : texte.knopfZurAnmeldung}
          </button>
        </div>
      </form>

      {fehler !== undefined && (
        <p className="fehler" role="alert">
          <span className="code">{fehler.code}</span> {fehler.message}
        </p>
      )}

      <p className="fuss">{texte.fussZiel}</p>
    </main>
  )
}
