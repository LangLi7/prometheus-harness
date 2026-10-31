/**
 * **Zugänge als eigenes Plugin — das Panel.**
 *
 * ## Was es zeigt
 *
 * | Abschnitt | Quelle |
 * |---|---|
 * | Die Einträge samt Stand | `GET /api/pmh/zugaenge` |
 * | Ob ein Schlüssel hinterlegt ist | dieselbe Antwort — **nie** der Wert |
 * | Die Sonde je Eintrag | `POST /api/pmh/zugaenge/pruefen` |
 * | Anlegen, Ändern, Entfernen | die drei schreibenden Wege |
 *
 * **Nichts davon rechnet der Browser.** Die Stände kommen gerechnet aus `standVon`, die Sonde aus
 * `@prometheus-harness/provider-directory`; das Panel zeigt sie nur.
 *
 * ## Was es NICHT tut
 *
 * Es zeigt **keinen** Schlüssel — auch nicht gekürzt. Wer einen Schlüssel prüfen will, drückt
 * **Prüfen**; die Sonde schickt leere Aufträge und liest den Status. Ein Wert, der einmal im
 * Browser war, ist im Verlauf, im Cache und in jedem Bildschirmfoto.
 *
 * @module @prometheus-harness/zugaenge
 */

import { useEffect, useState } from 'react'
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

import { FAEHIGKEITEN } from '@prometheus-harness/capabilities'
import type { Faehigkeit } from '@prometheus-harness/capabilities'

import type { Stand, Zugang } from './vertrag.ts'
import { DE } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    zugaenge: keyof typeof DE
  }
}

/** Die Kennung im main-Slot, in der Seitenleiste und in der Plugin-Liste. */
export const PANEL_ID = 'zugaenge'

/**
 * Der Eintrag im Profil — **der Schlüssel der Einstellungen**.
 *
 * Die Einstellungsseite eines Plugins speist sich aus der `Config` seines **Profil-Eintrags**, nicht
 * aus seinem Paketnamen. Deshalb steht die Kennung hier als eigener Name und nicht als Ableitung aus
 * `PANEL_ID`: derselbe Text, zwei Bedeutungen, und eine Bedeutung darf sich ändern, ohne die andere
 * mitzunehmen.
 */
export const ENTRY_ID = 'pmh-zugaenge'

/** Der Namensraum der Texte. */
const NS = 'zugaenge'

/**
 * Die Anzeige-Einstellungen — **die Form der `Config` auf der Host-Hälfte** (`src/server.ts`).
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

/**
 * Die Anzeige, wie sie nach dem Lesen der Einstellungen gilt — Vorgaben schon eingesetzt.
 *
 * **Warum nicht `Anzeige`.** Diesen Namen trägt in dieser Datei bereits ein Eintrag, wie ihn die
 * Route liefert. Zwei Bedeutungen unter einem Namen wären beim Lesen eine Falle; `Darstellung`
 * meint genau das, was hier entsteht: die Anzeige nach den Einstellungen.
 */
interface Darstellung {
  readonly oberflaeche: 'sidebar' | 'plugins' | 'both' | 'none'
  readonly reihenfolge: number
  readonly beschriftung: string | undefined
}

/** Der Platz, den das Plugin ohne Einstellung hatte — ein Bestand soll sich nicht verschieben. */
const STANDARD_REIHENFOLGE = 14

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
function liesAnzeige(config: DisplayConfig | undefined): Darstellung {
  const flaeche = config?.surface
  const oberflaeche: Darstellung['oberflaeche'] =
    flaeche === 'plugins' || flaeche === 'both' || flaeche === 'none' || flaeche === 'sidebar'
      ? flaeche
      : 'sidebar'
  const platz = config?.order
  const reihenfolge = typeof platz === 'number' && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE
  const roh = config?.label
  const beschriftung = typeof roh === 'string' && roh.trim() !== '' ? roh.trim() : undefined
  return { oberflaeche, reihenfolge, beschriftung }
}

/** Die vier Wege — dieselben Adressen wie in `src/server.ts`. */
const WEG_LISTE = '/api/pmh/zugaenge'
const WEG_SPEICHERN = '/api/pmh/zugaenge/speichern'
const WEG_ENTFERNEN = '/api/pmh/zugaenge/entfernen'
const WEG_PRUEFEN = '/api/pmh/zugaenge/pruefen'

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'configForms']

/** Die Zuordnung Fähigkeit → Textschlüssel. */
const CAP_TEXT: Readonly<Record<Faehigkeit, keyof typeof DE>> = {
  gespraech: 'capGespraech',
  entscheiden: 'capEntscheiden',
  'text-zu-sprache': 'capTextZuSprache',
  'sprache-zu-text': 'capSpracheZuText',
  einbetten: 'capEinbetten',
  bild: 'capBild',
}

/** Ein Stand, wie die Route ihn liefert — ohne den Wert. */
interface Schluesselstand {
  readonly gesetzt: boolean
  readonly schreibbar: boolean
  readonly quelle?: 'ablage' | 'umgebung'
}

/** Ein Eintrag, wie ihn die Liste zeigt. */
interface Anzeige extends Zugang {
  readonly schluesselstand: Schluesselstand
  readonly stand: Stand
}

/** Eine Familie in der Auswahl. */
interface Familienauskunft {
  readonly id: string
  readonly name: string
  readonly basis?: string
  readonly basisNoetig: boolean
  readonly stand: string
}

/** Die Antwort der Liste. */
interface Bestand {
  readonly datei: string
  readonly geltung: { readonly art: string; readonly nutzer: string | null }
  readonly familien: readonly Familienauskunft[]
  readonly zugaenge: readonly Anzeige[]
}

/** Ein Sondebefund, wie ihn `POST …/pruefen` liefert. */
interface Pruefbefund {
  readonly id: string
  readonly familie: string
  readonly basis: string
  readonly geprueftAm: string
  readonly modelleErreichbar: boolean
  readonly modelle: readonly string[]
  readonly modellAnzahl: number
  readonly wege: Readonly<Record<string, string>>
  readonly bemerkung: string
}

/** Das Ergebnis einer Prüfung — Befund oder Fehler. */
type Pruefung =
  | { readonly art: 'befund'; readonly befund: Pruefbefund }
  | { readonly art: 'fehler'; readonly meldung: string }

/** Der Entwurf im Formular. */
interface Entwurf {
  readonly id?: string
  readonly name: string
  readonly familie: string
  readonly art: 'fern' | 'lokal'
  readonly schluessel: 'noetig' | 'kein'
  readonly basis: string
  readonly umgebung: string
  readonly notiz: string
  readonly modelle: Partial<Record<Faehigkeit, string>>
  /** Der neue Schlüssel — leer heißt „behalten". */
  readonly wert: string
}

/** Der leere Entwurf. */
function leererEntwurf(): Entwurf {
  return {
    name: '',
    familie: 'openrouter',
    art: 'fern',
    schluessel: 'noetig',
    basis: '',
    umgebung: '',
    notiz: '',
    modelle: {},
    wert: '',
  }
}

/** Macht aus einem Eintrag einen Entwurf. */
function alsEntwurf(zugang: Anzeige): Entwurf {
  return {
    id: zugang.id,
    name: zugang.name,
    familie: zugang.familie,
    art: zugang.art,
    schluessel: zugang.schluessel,
    basis: zugang.basis ?? '',
    umgebung: zugang.umgebung ?? '',
    notiz: zugang.notiz ?? '',
    modelle: { ...zugang.modelle },
    wert: '',
  }
}

/**
 * Der CSRF-Kopf für schreibende Aufrufe.
 *
 * **Warum hier ein Ersatzwert entstehen darf.** Liegt der CSRF-Keks der Anmeldung vor, wird er
 * geschickt — der Host vergleicht ihn. Fehlt er (Zugang über den Host-Token, Kopfzeilen ohne
 * Sitzung), genügt ein eigener, zufälliger Wert: eine fremde Seite kann einen **eigenen Kopf**
 * nicht ohne CORS-Freigabe senden, und dieses Plugin gibt keine.
 *
 * @returns die Kopfzeile
 */
function csrfKopf(): Record<string, string> {
  if (typeof document !== 'undefined') {
    for (const teil of document.cookie.split(';')) {
      const [name, ...rest] = teil.trim().split('=')
      if (name === 'pmh_csrf') {
        const wert = rest.join('=')
        if (wert !== '') {
          try {
            return { 'x-pmh-csrf': decodeURIComponent(wert) }
          } catch {
            return { 'x-pmh-csrf': wert }
          }
        }
      }
    }
  }
  return { 'x-pmh-csrf': EIGENER_CSRF }
}

/** Ein eigener Wert, wenn es keinen Keks gibt — je Sitzung einmal. */
const EIGENER_CSRF = `panel-${Math.random().toString(36).slice(2)}-${String(Date.now())}`

/** Liest eine Meldung aus einer Fehlerantwort. */
function meldungAus(daten: unknown, status: number): string {
  if (daten !== null && typeof daten === 'object') {
    const objekt = daten as Record<string, unknown>
    const maengel = objekt['maengel']
    if (Array.isArray(maengel) && maengel.length > 0) return maengel.map(String).join(' · ')
    const meldung = objekt['meldung']
    if (typeof meldung === 'string' && meldung !== '') return meldung
    const fehler = objekt['fehler']
    if (typeof fehler === 'string' && fehler !== '') return fehler
  }
  return `HTTP ${String(status)}`
}

/** Holt JSON und macht aus einem HTTP-Fehler eine Ausnahme. */
async function hole<T>(url: string): Promise<T> {
  const antwort = await fetch(url, { headers: { accept: 'application/json' } })
  const daten: unknown = await antwort.json().catch(() => undefined)
  if (!antwort.ok) throw new Error(meldungAus(daten, antwort.status))
  return daten as T
}

/** Schickt JSON und macht aus einem HTTP-Fehler eine Ausnahme. */
async function schicke<T>(url: string, koerper: unknown): Promise<T> {
  const antwort = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...csrfKopf() },
    body: JSON.stringify(koerper),
  })
  const daten: unknown = await antwort.json().catch(() => undefined)
  if (!antwort.ok) throw new Error(meldungAus(daten, antwort.status))
  return daten as T
}

interface Props {
  /** Schließt das Haupt-Panel — in der Seitenleiste gibt es keinen Schließen-Knopf. */
  readonly close?: () => void
  readonly t: TranslateNS<'zugaenge'>
}

/** Das Panel. */
export function ZugaengePanel({ close, t }: Props): ReactElement {
  const [bestand, setBestand] = useState<Bestand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [neu, setNeu] = useState(0)
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [formFehler, setFormFehler] = useState<string | null>(null)
  const [pruefungen, setPruefungen] = useState<Readonly<Record<string, Pruefung>>>({})
  const [laeuft, setLaeuft] = useState<string | null>(null)

  useEffect(() => {
    let ab = false
    setLaden(true)
    setFehler(null)
    hole<Bestand>(WEG_LISTE)
      .then((antwort) => {
        if (!ab) setBestand(antwort)
      })
      .catch((problem: unknown) => {
        if (!ab) setFehler(problem instanceof Error ? problem.message : String(problem))
      })
      .finally(() => {
        if (!ab) setLaden(false)
      })
    return () => {
      ab = true
    }
  }, [neu])

  const neuladen = (): void => setNeu((alt) => alt + 1)

  const speichern = async (): Promise<void> => {
    if (entwurf === null) return
    setSpeichert(true)
    setFormFehler(null)
    try {
      const modelle: Partial<Record<Faehigkeit, string>> = {}
      for (const faehigkeit of FAEHIGKEITEN) {
        const modell = (entwurf.modelle[faehigkeit] ?? '').trim()
        if (modell !== '') modelle[faehigkeit] = modell
      }
      const zugang = {
        ...(entwurf.id === undefined ? {} : { id: entwurf.id }),
        name: entwurf.name.trim(),
        familie: entwurf.familie,
        art: entwurf.art,
        schluessel: entwurf.schluessel,
        modelle,
        ...(entwurf.basis.trim() === '' ? {} : { basis: entwurf.basis.trim() }),
        ...(entwurf.umgebung.trim() === '' ? {} : { umgebung: entwurf.umgebung.trim() }),
        ...(entwurf.notiz.trim() === '' ? {} : { notiz: entwurf.notiz.trim() }),
      }
      await schicke<unknown>(WEG_SPEICHERN, {
        zugang,
        ...(entwurf.wert.trim() === '' ? {} : { wert: entwurf.wert.trim() }),
      })
      setEntwurf(null)
      setMeldung(t('saved'))
      neuladen()
    } catch (problem) {
      setFormFehler(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSpeichert(false)
    }
  }

  const entfernen = async (zugang: Anzeige): Promise<void> => {
    if (!window.confirm(t('confirmDelete'))) return
    try {
      await schicke<unknown>(WEG_ENTFERNEN, { id: zugang.id })
      setMeldung(t('removed'))
      setPruefungen((alt) => {
        const neu2 = { ...alt }
        delete neu2[zugang.id]
        return neu2
      })
      neuladen()
    } catch (problem) {
      setFehler(problem instanceof Error ? problem.message : String(problem))
    }
  }

  const pruefen = async (zugang: Anzeige): Promise<void> => {
    setLaeuft(zugang.id)
    setMeldung(null)
    try {
      const antwort = await schicke<{ befund: Pruefbefund }>(WEG_PRUEFEN, { id: zugang.id })
      setPruefungen((alt) => ({ ...alt, [zugang.id]: { art: 'befund', befund: antwort.befund } }))
    } catch (problem) {
      setPruefungen((alt) => ({
        ...alt,
        [zugang.id]: { art: 'fehler', meldung: problem instanceof Error ? problem.message : String(problem) },
      }))
    } finally {
      setLaeuft(null)
    }
  }

  const bereit = bestand?.zugaenge.filter((zugang) => zugang.stand === 'bereit').length ?? 0

  return (
    <section className="pmh-zu">
      <header className="pmh-zu__head">
        <div className="pmh-zu__brand">
          <ZugaengeIcon />
          <div className="pmh-zu__brandtext">
            <span className="pmh-zu__kicker">{t('kicker')}</span>
            <h1 className="pmh-zu__title">{t('title')}</h1>
          </div>
        </div>
        <div className="pmh-zu__actions">
          <span className={`pmh-zu__dot${bereit > 0 ? ' is-on' : ''}`} />
          <span className="pmh-zu__state">
            {bestand === null ? '—' : `${String(bereit)} / ${String(bestand.zugaenge.length)} ${t('ready')}`}
          </span>
          <button className="pmh-zu__btn" onClick={() => setEntwurf(leererEntwurf())} type="button">
            {t('new')}
          </button>
          <button className="pmh-zu__btn pmh-zu__btn--ghost" onClick={neuladen} type="button">
            {t('refresh')}
          </button>
          {close === undefined ? null : (
            <button className="pmh-zu__btn pmh-zu__btn--ghost" onClick={close} type="button">
              {t('close')}
            </button>
          )}
        </div>
      </header>

      <div className="pmh-zu__scroll">
        {meldung === null ? null : <p className="pmh-zu__hinweis">{meldung}</p>}
        {fehler === null ? null : (
          <div className="pmh-zu__fehler">
            <strong>{t('error')}</strong>
            <span>{fehler}</span>
            <button className="pmh-zu__btn" onClick={neuladen} type="button">
              {t('refresh')}
            </button>
          </div>
        )}
        {laden && bestand === null ? <p className="pmh-zu__leer">{t('loading')}</p> : null}
        {bestand !== null && bestand.zugaenge.length === 0 && entwurf === null ? (
          <p className="pmh-zu__leer">{t('empty')}</p>
        ) : null}

        {bestand?.zugaenge.map((zugang) => (
          <Karte
            key={zugang.id}
            zugang={zugang}
            t={t}
            pruefung={pruefungen[zugang.id]}
            laeuft={laeuft === zugang.id}
            onPruefen={() => void pruefen(zugang)}
            onBearbeiten={() => {
              setFormFehler(null)
              setEntwurf(alsEntwurf(zugang))
            }}
            onEntfernen={() => void entfernen(zugang)}
          />
        ))}

        {entwurf === null ? null : (
          <Formular
            entwurf={entwurf}
            familien={bestand?.familien ?? []}
            t={t}
            fehler={formFehler}
            speichert={speichert}
            onAendern={setEntwurf}
            onSpeichern={() => void speichern()}
            onAbbrechen={() => {
              setEntwurf(null)
              setFormFehler(null)
            }}
          />
        )}

        {bestand === null ? null : (
          <footer className="pmh-zu__fuss">
            <span>
              <b>{t('path')}</b> {bestand.datei}
            </span>
            <span>
              <b>{t('scope')}</b> {bestand.geltung.nutzer ?? t('hostScope')}
            </span>
            <span className="pmh-zu__fusshinweis">{t('hint')}</span>
          </footer>
        )}
      </div>
    </section>
  )
}

interface KarteProps {
  readonly zugang: Anzeige
  readonly t: TranslateNS<'zugaenge'>
  readonly pruefung: Pruefung | undefined
  readonly laeuft: boolean
  readonly onPruefen: () => void
  readonly onBearbeiten: () => void
  readonly onEntfernen: () => void
}

/** Eine Zeile der Verwaltung. */
function Karte({ zugang, t, pruefung, laeuft, onPruefen, onBearbeiten, onEntfernen }: KarteProps): ReactElement {
  const standText =
    zugang.stand === 'bereit'
      ? t('standBereit')
      : zugang.stand === 'kein-schluessel'
        ? t('standKeinSchluessel')
        : t('standKeineFaehigkeit')

  return (
    <article className="pmh-zu__karte">
      <div className="pmh-zu__kopf">
        <div className="pmh-zu__namen">
          <h2 className="pmh-zu__name">{zugang.name}</h2>
          <div className="pmh-zu__marken">
            <span className={`pmh-zu__stand is-${zugang.stand}`}>{standText}</span>
            <span className="pmh-zu__marke">{zugang.familie}</span>
            <span className="pmh-zu__marke">{zugang.art === 'lokal' ? t('local') : t('remote')}</span>
            <span className={`pmh-zu__marke${zugang.schluesselstand.gesetzt ? ' is-gesetzt' : ''}`}>
              {zugang.schluesselstand.gesetzt ? t('keySet') : t('keyMissing')}
              {zugang.schluesselstand.quelle === 'umgebung' ? ` · ${t('keyEnv')}` : ''}
            </span>
          </div>
        </div>
        <div className="pmh-zu__knopfreihe">
          <button className="pmh-zu__btn" onClick={onPruefen} disabled={laeuft} type="button">
            {laeuft ? t('testing') : t('test')}
          </button>
          <button className="pmh-zu__btn pmh-zu__btn--ghost" onClick={onBearbeiten} type="button">
            {t('edit')}
          </button>
          <button className="pmh-zu__btn pmh-zu__btn--warn" onClick={onEntfernen} type="button">
            {t('remove')}
          </button>
        </div>
      </div>

      <ul className="pmh-zu__faecher">
        {FAEHIGKEITEN.map((faehigkeit) => {
          const modell = zugang.modelle[faehigkeit]
          if (modell === undefined) return null
          return (
            <li key={faehigkeit}>
              <span>{t(CAP_TEXT[faehigkeit])}</span>
              <code>{modell}</code>
            </li>
          )
        })}
      </ul>
      {zugang.basis === undefined ? null : <p className="pmh-zu__basis">{zugang.basis}</p>}
      {zugang.notiz === undefined ? null : <p className="pmh-zu__notiz">{zugang.notiz}</p>}

      {pruefung === undefined ? null : pruefung.art === 'fehler' ? (
        <p className="pmh-zu__prueffehler">{pruefung.meldung}</p>
      ) : (
        <div className="pmh-zu__befund">
          <p className="pmh-zu__befundkopf">
            <b>{t('testResult')}</b> · {String(pruefung.befund.modellAnzahl)} {t('models')} · {pruefung.befund.basis}
          </p>
          <ul className="pmh-zu__wege">
            {FAEHIGKEITEN.map((faehigkeit) => {
              const wert = pruefung.befund.wege[faehigkeit] ?? 'unbekannt'
              const text = wert === 'vorhanden' ? t('present') : wert === 'fehlt' ? t('missing') : t('unknown')
              return (
                <li key={faehigkeit}>
                  <span>{t(CAP_TEXT[faehigkeit])}</span>
                  <b className={`is-${wert}`}>{text}</b>
                </li>
              )
            })}
          </ul>
          <p className="pmh-zu__grund">{pruefung.befund.bemerkung}</p>
        </div>
      )}
    </article>
  )
}

interface FormularProps {
  readonly entwurf: Entwurf
  readonly familien: readonly Familienauskunft[]
  readonly t: TranslateNS<'zugaenge'>
  readonly fehler: string | null
  readonly speichert: boolean
  readonly onAendern: (entwurf: Entwurf) => void
  readonly onSpeichern: () => void
  readonly onAbbrechen: () => void
}

/** Das Formular — anlegen und ändern. */
function Formular({ entwurf, familien, t, fehler, speichert, onAendern, onSpeichern, onAbbrechen }: FormularProps): ReactElement {
  const familie = familien.find((eintrag) => eintrag.id === entwurf.familie)
  const setze = (teil: Partial<Entwurf>): void => onAendern({ ...entwurf, ...teil })

  return (
    <section className="pmh-zu__form">
      <h2 className="pmh-zu__formtitel">{entwurf.id === undefined ? t('new') : t('edit')}</h2>

      <div className="pmh-zu__feld">
        <label htmlFor="pmh-zu-name">{t('name')}</label>
        <input
          id="pmh-zu-name"
          value={entwurf.name}
          onChange={(ereignis) => setze({ name: ereignis.target.value })}
          placeholder="OpenRouter privat"
        />
      </div>

      <div className="pmh-zu__doppel">
        <div className="pmh-zu__feld">
          <label htmlFor="pmh-zu-familie">{t('family')}</label>
          <select
            id="pmh-zu-familie"
            value={entwurf.familie}
            onChange={(ereignis) => {
              const id = ereignis.target.value
              setze({
                familie: id,
                ...(id === 'openai-kompatibel' ? { art: 'lokal' as const } : {}),
              })
            }}
          >
            {familien.map((eintrag) => (
              <option key={eintrag.id} value={eintrag.id}>
                {eintrag.name}
              </option>
            ))}
            {familien.length === 0 ? <option value={entwurf.familie}>{entwurf.familie}</option> : null}
          </select>
        </div>
        <div className="pmh-zu__feld">
          <label htmlFor="pmh-zu-key">{t('key')}</label>
          <input
            id="pmh-zu-key"
            type="password"
            autoComplete="off"
            value={entwurf.wert}
            onChange={(ereignis) => setze({ wert: ereignis.target.value })}
            placeholder={t('keyPlaceholder')}
          />
        </div>
      </div>

      {familie?.stand === undefined ? null : (
        <p className="pmh-zu__familienstand">
          <b>{t('familyStand')}</b> {familie.stand}
        </p>
      )}

      <div className="pmh-zu__feld">
        <label htmlFor="pmh-zu-basis">{t('base')}</label>
        <input
          id="pmh-zu-basis"
          value={entwurf.basis}
          onChange={(ereignis) => setze({ basis: ereignis.target.value })}
          placeholder="http://127.0.0.1:11434/v1"
        />
        <span className="pmh-zu__hilfe">{t('baseHint')}</span>
      </div>

      <div className="pmh-zu__doppel">
        <div className="pmh-zu__feld">
          <label htmlFor="pmh-zu-art">{t('kind')}</label>
          <select
            id="pmh-zu-art"
            value={entwurf.art}
            onChange={(ereignis) => setze({ art: ereignis.target.value === 'lokal' ? 'lokal' : 'fern' })}
          >
            <option value="fern">{t('remote')}</option>
            <option value="lokal">{t('local')}</option>
          </select>
        </div>
        <div className="pmh-zu__feld">
          <label htmlFor="pmh-zu-schluessel">{t('keyNeeded')}</label>
          <select
            id="pmh-zu-schluessel"
            value={entwurf.schluessel}
            onChange={(ereignis) =>
              setze({ schluessel: ereignis.target.value === 'kein' ? 'kein' : 'noetig' })
            }
          >
            <option value="noetig">{t('keyNeeded')}</option>
            <option value="kein">{t('keyOptional')}</option>
          </select>
        </div>
      </div>

      <fieldset className="pmh-zu__faecherfeld">
        <legend>{t('capabilities')}</legend>
        {FAEHIGKEITEN.map((faehigkeit) => (
          <div className="pmh-zu__modell" key={faehigkeit}>
            <span>{t(CAP_TEXT[faehigkeit])}</span>
            <input
              value={entwurf.modelle[faehigkeit] ?? ''}
              onChange={(ereignis) => {
                const modell = ereignis.target.value
                const modelle = { ...entwurf.modelle }
                if (modell.trim() === '') delete modelle[faehigkeit]
                else modelle[faehigkeit] = modell
                setze({ modelle })
              }}
              placeholder={t('model')}
              aria-label={t(CAP_TEXT[faehigkeit])}
            />
          </div>
        ))}
      </fieldset>

      <div className="pmh-zu__feld">
        <label htmlFor="pmh-zu-umgebung">{t('env')}</label>
        <input
          id="pmh-zu-umgebung"
          value={entwurf.umgebung}
          onChange={(ereignis) => setze({ umgebung: ereignis.target.value })}
          placeholder="OPENROUTER_API_KEY"
        />
        <span className="pmh-zu__hilfe">{t('envHint')}</span>
      </div>

      <div className="pmh-zu__feld">
        <label htmlFor="pmh-zu-notiz">{t('note')}</label>
        <input
          id="pmh-zu-notiz"
          value={entwurf.notiz}
          onChange={(ereignis) => setze({ notiz: ereignis.target.value })}
          placeholder={t('notePlaceholder')}
        />
      </div>

      {fehler === null ? null : <p className="pmh-zu__prueffehler">{fehler}</p>}

      <div className="pmh-zu__knopfreihe">
        <button className="pmh-zu__btn" onClick={onSpeichern} disabled={speichert} type="button">
          {t('save')}
        </button>
        <button className="pmh-zu__btn pmh-zu__btn--ghost" onClick={onAbbrechen} type="button">
          {t('cancel')}
        </button>
      </div>
    </section>
  )
}

/** Das Zeichen der Seitenleiste: ein Schlüssel. */
export function ZugaengeIcon(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="12" r="3.4" />
      <path d="M11.4 12H21m-3.2 0v3.2M21 12v2.2" strokeLinecap="round" />
      <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * Die Karte in der Plugin-Liste — der zweite Ort, den ein Plugin nehmen kann.
 *
 * **Was hier steht und warum.** Der Plugin-Manager fragt eine Anmeldung in `plugins.item` zweimal:
 * einmal für die **Kurzfassung** in der Liste (`view: 'summary'`) und einmal für den **Rumpf** der
 * eigenen Seite (`view: 'page'`). Die Kurzfassung ist ein Satz; der Rumpf ist dasselbe Panel wie im
 * Hauptfeld — nicht eine zweite Anzeige, sondern dieselbe an einem zweiten Ort.
 *
 * **Was hier bewusst nicht steht.** Kein eigener Speichern-Knopf: dieses Panel liest und schreibt
 * über seine eigenen Routen. Was der Nutzer an der Anzeige ändert, ändert er in den Einstellungen
 * des Eintrags — dort, wo die `Config` liegt, und nicht in einer zweiten Steuerung daneben.
 */
function ZugaengeItem({ view, t }: PluginConfigViewProps & Props): ReactElement {
  if (view === 'summary') return <span className="pmh-zu__chip">{t('guide')}</span>
  return <ZugaengePanel t={t} />
}

/** Hängt Panel, die Anzeige nach den Einstellungen und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhZugaenge = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'zugaenge: Stil')

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
      ZugaengePanel,
    )
  })

  /*
   * **Die Anzeige kommt jetzt aus den Einstellungen.**
   *
   * Vorher stand hier `order: 14` fest und `sidebar.panellist` wurde immer angemeldet. Jetzt liest
   * dieser Block den Eintrag `pmh-zugaenge` über `configForms` und meldet **je nach `surface`** an:
   * die Seitenleiste, die Karte in der Plugin-Liste, oder beides — oder nichts.
   *
   * **Warum neu angemeldet statt nur umgeschaltet.** `order` ist Teil der Anmeldung; ein Eintrag mit
   * geänderter Reihenfolge ist ein anderer Eintrag. Deshalb wird bei jeder Änderung abgemeldet und
   * neu angemeldet — aber nur, wenn sich der **Wirkschlüssel** wirklich geändert hat, sonst würde
   * jeder Schnappschuss des Hosts die Oberfläche neu bauen.
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
              ZugaengeIcon,
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
              ZugaengeItem,
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
  }, 'zugaenge: Anzeige nach den Einstellungen')
}

const CSS = `
.pmh-zu{
  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
  background:radial-gradient(120% 80% at 80% 0%,#0f1d22 0%,#0a1013 55%,#06090b 100%);
  color:#e8f1f2;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
}
.pmh-zu__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-zu__brand{display:flex;align-items:center;gap:11px;color:#7fe0c0}
.pmh-zu__brandtext{display:flex;flex-direction:column;gap:1px}
.pmh-zu__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(127,224,192,.55)}
.pmh-zu__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f2fbf8}
.pmh-zu__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d9f6ec}
.pmh-zu__actions{display:flex;align-items:center;gap:9px;min-width:0}
.pmh-zu__dot{width:6px;height:6px;border-radius:50%;background:#4c6b70;box-shadow:0 0 0 4px rgba(76,107,112,.12)}
.pmh-zu__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
.pmh-zu__state{max-width:24ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.5)}
.pmh-zu__btn{
  appearance:none;border:1px solid rgba(127,224,192,.24);background:rgba(14,30,32,.6);
  color:#e9fbf4;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor:pointer;transition:border-color .18s ease,background .18s ease;
}
.pmh-zu__btn:hover:not(:disabled){border-color:rgba(127,224,192,.65);background:rgba(22,48,48,.8)}
.pmh-zu__btn:disabled{opacity:.45;cursor:default}
.pmh-zu__btn--ghost{border-color:transparent;background:transparent;color:rgba(232,241,242,.6)}
.pmh-zu__btn--warn{border-color:rgba(255,140,140,.28);color:#ffc9c9;background:rgba(50,18,22,.5)}
.pmh-zu__btn--warn:hover:not(:disabled){border-color:rgba(255,140,140,.6);background:rgba(70,22,28,.7)}
.pmh-zu__scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 26px}
.pmh-zu__leer{margin:12px 0;color:rgba(232,241,242,.45);font-size:12px}
.pmh-zu__hinweis{margin:0 0 12px;padding:8px 11px;border:1px solid rgba(127,224,192,.24);border-radius:9px;background:rgba(127,224,192,.07);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(226,250,242,.78)}
.pmh-zu__fehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;padding:15px 16px;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,207,207,.85);border:1px solid rgba(255,120,120,.26);border-radius:10px;background:rgba(60,20,30,.35)}
.pmh-zu__fehler strong{font-weight:600;color:#ffdcdc;flex-basis:100%}
.pmh-zu__fehler span{flex:1 1 auto;min-width:0;color:rgba(255,207,207,.8)}
.pmh-zu__karte{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));padding:14px 16px 16px;margin-bottom:12px}
.pmh-zu__kopf{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.pmh-zu__namen{min-width:0}
.pmh-zu__name{margin:0 0 6px;font-size:14px;font-weight:600;color:#f4fbf8}
.pmh-zu__marken{display:flex;flex-wrap:wrap;gap:6px}
.pmh-zu__stand{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:3px 7px;border:1px solid rgba(255,255,255,.14);color:rgba(232,241,242,.6)}
.pmh-zu__stand.is-bereit{color:#8fe3c6;border-color:rgba(105,214,163,.4);background:rgba(105,214,163,.09)}
.pmh-zu__stand.is-kein-schluessel{color:#f0c98d;border-color:rgba(233,198,143,.38);background:rgba(233,198,143,.08)}
.pmh-zu__stand.is-keine-faehigkeit{color:#ffb4b4;border-color:rgba(255,140,140,.32);background:rgba(255,140,140,.07)}
.pmh-zu__marke{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.06em;border-radius:999px;padding:3px 7px;border:1px solid rgba(255,255,255,.1);color:rgba(232,241,242,.42)}
.pmh-zu__marke.is-gesetzt{color:#9fe8cf;border-color:rgba(105,214,163,.32)}
.pmh-zu__knopfreihe{display:flex;flex-wrap:wrap;gap:7px;flex:0 0 auto}
.pmh-zu__faecher{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.pmh-zu__faecher li{display:flex;align-items:baseline;gap:7px;padding:4px 8px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.02)}
.pmh-zu__faecher span{font:9.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.4)}
.pmh-zu__faecher code{font:10.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d9f6ec}
.pmh-zu__basis,.pmh-zu__notiz{margin:8px 0 0;font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.42);word-break:break-all}
.pmh-zu__befund{margin-top:12px;padding-top:11px;border-top:1px dashed rgba(255,255,255,.07)}
.pmh-zu__befundkopf{margin:0 0 7px;font:10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.42);word-break:break-all}
.pmh-zu__befundkopf b{margin-right:5px;color:rgba(127,224,192,.75);font-weight:600}
.pmh-zu__wege{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px 12px}
.pmh-zu__wege li{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font:10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.45)}
.pmh-zu__wege b{font-weight:600;color:rgba(232,241,242,.42)}
.pmh-zu__wege b.is-vorhanden{color:#8fe3c6}
.pmh-zu__wege b.is-fehlt{color:#ff9f9f}
.pmh-zu__wege b.is-unbekannt{color:#f0c98d}
.pmh-zu__grund{margin:8px 0 0;font:10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.34)}
.pmh-zu__prueffehler{margin:10px 0 0;font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,167,167,.82)}
.pmh-zu__form{margin-top:6px;border:1px solid rgba(127,224,192,.22);border-radius:12px;background:rgba(16,32,34,.5);padding:16px 16px 18px}
.pmh-zu__formtitel{margin:0 0 14px;font:600 13px/1.2 "Segoe UI", system-ui, sans-serif;color:#eafaf4}
.pmh-zu__feld{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;min-width:0}
.pmh-zu__feld>label{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(232,241,242,.42)}
.pmh-zu__feld input,.pmh-zu__feld select{
  appearance:none;width:100%;min-width:0;border:1px solid rgba(127,224,192,.2);border-radius:8px;
  background:rgba(6,12,14,.75);color:#eafaf4;padding:7px 9px;font:11.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;
}
.pmh-zu__feld input:focus,.pmh-zu__feld select:focus{border-color:rgba(127,224,192,.6);box-shadow:0 0 0 3px rgba(127,224,192,.09)}
.pmh-zu__hilfe{font:9.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.3)}
.pmh-zu__doppel{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pmh-zu__familienstand{margin:0 0 12px;padding:8px 10px;border-left:2px solid rgba(127,224,192,.35);font:10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.42)}
.pmh-zu__familienstand b{margin-right:5px;color:rgba(127,224,192,.7);font-weight:600}
.pmh-zu__faecherfeld{margin:0 0 12px;padding:11px 12px 6px;border:1px solid rgba(255,255,255,.07);border-radius:9px}
.pmh-zu__faecherfeld legend{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(232,241,242,.42);padding:0 5px}
.pmh-zu__modell{display:grid;grid-template-columns:minmax(110px,150px) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:7px}
.pmh-zu__modell span{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.5)}
.pmh-zu__modell input{appearance:none;min-width:0;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:rgba(6,12,14,.7);color:#eafaf4;padding:6px 8px;font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
.pmh-zu__modell input:focus{border-color:rgba(127,224,192,.5)}
.pmh-zu__fuss{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.36);word-break:break-all}
.pmh-zu__fuss b{margin-right:5px;color:rgba(127,224,192,.6);font-weight:600}
.pmh-zu__fusshinweis{width:100%;color:rgba(232,241,242,.28)}
@media (max-width:820px){
  .pmh-zu__doppel{grid-template-columns:1fr}
  .pmh-zu__kopf{flex-direction:column}
  .pmh-zu__state{display:none}
}
`
