/**
 * `@prometheus-harness/login-web/App` — die Seite: **anmelden** oder **Konto anlegen**.
 *
 * ## Der Ablauf
 *
 * 1. Beim Laden fragt die Seite `/api/pmh/auth/me`. Ist man angemeldet, zeigt sie das Konto
 *    und den Weg weiter; sonst das Formular.
 * 2. Nach erfolgreicher Anmeldung leitet sie auf das Ziel aus `src/weiter.ts` weiter
 *    (Vorgabe oder `?weiter=…`, **nur relative Ziele**).
 * 3. Beim Konto-Anlegen ist das **Claim-Token** das Feld, das heute zählt: solange **kein**
 *    Admin im Bestand ist, verlangt der Server es (gemessen: 403 `claim-fehlt`), und das erste
 *    so angelegte Konto wird `admin`.
 *
 * ## Was hier **nicht** passiert
 *
 * Keine eigene Fehlerdichtung. Die Meldungen des Servers sind deutsch und genau — sie werden
 * **wörtlich** angezeigt. Eine zweite Formulierung wäre eine zweite Wahrheit, und die Seite
 * weiß nicht, welcher Fall vorliegt (etwa `claim-anderer-rechner`).
 *
 * @module @prometheus-harness/login-web/App
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { abmelden, anmelden, ich, registrieren } from './api.ts'
import type { AuthFehler, Konto } from './api.ts'
import { ermittleZiel, ZIEL_PARAMETER } from './weiter.ts'

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

  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [name, setName] = useState('')
  const [claim, setClaim] = useState('')

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

  if (!geprueft) {
    return (
      <main className="karte">
        <h1>Prometheus Harness</h1>
        <p className="still">Einen Augenblick…</p>
      </main>
    )
  }

  // ---- Angemeldet ----
  if (konto !== undefined) {
    return (
      <main className="karte">
        <h1>Angemeldet</h1>
        <p>
          <strong>{konto.displayName ?? konto.email ?? 'Konto'}</strong>
          {konto.role !== undefined && <span className="rolle"> {konto.role}</span>}
        </p>
        <p className="still">Weiter zu <code>{ziel}</code></p>
        <div className="knoepfe">
          <a className="knopf" href={ziel}>
            Weiter
          </a>
          <button type="button" className="knopf zweit" disabled={laeuft} onClick={() => void beimAbmelden()}>
            Abmelden
          </button>
        </div>
        {fehler !== undefined && <p className="fehler">{fehler.message}</p>}
      </main>
    )
  }

  // ---- Nicht angemeldet ----
  return (
    <main className="karte">
      <h1>Prometheus Harness</h1>
      <p className="still">
        {ansicht === 'anmelden' ? 'Melde dich an.' : 'Lege das Konto an.'}
      </p>

      <form onSubmit={(e) => void (ansicht === 'anmelden' ? beimAnmelden(e) : beimRegistrieren(e))}>
        <Feld id="email" label="Adresse" typ="email" wert={email} aendern={setEmail} />
        <Feld
          id="passwort"
          label="Passwort"
          typ="password"
          wert={passwort}
          aendern={setPasswort}
          {...(ansicht === 'registrieren' ? { hinweis: 'Mindestens 8 Zeichen.' } : {})}
        />
        {ansicht === 'registrieren' && (
          <>
            <Feld id="name" label="Anzeigename (freiwillig)" typ="text" wert={name} aendern={setName} />
            <Feld
              id="claim"
              label="Claim-Token"
              typ="password"
              wert={claim}
              aendern={setClaim}
              hinweis="Solange kein Admin existiert: der Wert aus claim.txt im Harness-Home. Das erste Konto wird damit Admin."
            />
          </>
        )}
        <div className="knoepfe">
          <button type="submit" className="knopf" disabled={laeuft}>
            {ansicht === 'anmelden' ? 'Anmelden' : 'Konto anlegen'}
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
            {ansicht === 'anmelden' ? 'Konto anlegen' : 'Zur Anmeldung'}
          </button>
        </div>
      </form>

      {fehler !== undefined && (
        <p className="fehler" role="alert">
          <span className="code">{fehler.code}</span> {fehler.message}
        </p>
      )}

      <p className="fuss">
        Das Ziel nach der Anmeldung ist <code>?{ZIEL_PARAMETER}=…</code> — später aus den
        Einstellungen.
      </p>
    </main>
  )
}
