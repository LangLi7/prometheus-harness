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
import { abmelden, anmelden, ich, registrieren, zugang } from './api.ts'
import type { AuthFehler, Konto } from './api.ts'
import { ermittleZiel } from './redirect.ts'
import { SPRACHEN, gewaehlteSprache, ladeSprachliste, merkeSprache, texteFuer } from './language.ts'
import type { Sprache, Texte } from './language.ts'

/** Welches Formular sichtbar ist. */
type Ansicht = 'anmelden' | 'registrieren'

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
 * Die Anmeldeseite.
 *
 * @returns die Seite
 */
export function App(): ReactElement {
  const [ansicht, setAnsicht] = useState<Ansicht>('anmelden')
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

  const texte: Texte = texteFuer(sprache)
  const ziel = ermittleZiel(window.location.search)

  /** Wer bin ich? Beim Laden und nach jeder Änderung. */
  const nachsehen = useCallback(async () => {
    const a = await ich()
    setKonto(a.ok ? a.value : undefined)
    setGeprueft(true)
  }, [])

  useEffect(() => {
    void nachsehen()
  }, [nachsehen])

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
      const a = await registrieren({
        email,
        password: passwort,
        ...(name === '' ? {} : { displayName: name }),
        ...(claim === '' ? {} : { claimToken: claim }),
      })
      if (a.ok) {
        // Nach dem Anlegen gleich anmelden — sonst müßte man zweimal tippen.
        const b = await anmelden(email, passwort)
        if (b.ok) await nachsehen()
        return b
      }
      return a
    })
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

  // ---- Nicht angemeldet ----
  return (
    <main className="karte">
      <Sprachwahl liste={liste} gewaehlt={sprache} label={texte.spracheLabel} aendern={wechsleSprache} />
      <h1>{texte.titel}</h1>
      <p className="still">{ansicht === 'anmelden' ? texte.bitteAnmelden : texte.bitteAnlegen}</p>

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
            <Feld id="claim" label={texte.feldClaim} typ="password" wert={claim} aendern={setClaim} hinweis={texte.claimHinweis} />
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
