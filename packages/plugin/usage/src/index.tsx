/**
 * **Usage als eigenes Plugin — nicht nur eine Route.**
 *
 * Der Betreiber kennt „Usage" aus dem alten Harness und wollte es hier wieder — *„leider ist das
 * beim alten gui, ui ux nicht beweglich"* (21.10.2026). Ein Sidebar-Eintrag und ein main-Panel sind
 * genau dieses „beweglich": dasselbe Fenster, an derselben Stelle wie Chat, Terminal und Obsidian.
 *
 * ## Was das Panel zeigt und woher es das weiß
 *
 * | Abschnitt | Quelle |
 * |---|---|
 * | Heute / 7 Tage / 30 Tage / Gesamt | `records[].cost` der Verbrauchsdatei |
 * | Guthaben und Limit je Schlüssel | `balances` derselben Datei |
 * | Tagesreihe und teuerste Modelle | dieselben `records`, nach Tag und Modell summiert |
 * | „Was kostet ein Bild?" | `GET /api/pmh/usage/schaetzung` → `schaetzeBildkosten` |
 *
 * **Nichts davon wird hier gerechnet.** Das Panel liest zwei Routen; die Rechnung liegt in
 * `src/stand.ts`, die Preise in `@prometheus-harness/usage-ansicht`. Die Schätzung geht deshalb
 * über den Host und nicht über eine zweite Formel im Browser.
 *
 * @module @prometheus-harness/usage
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// **Nur für die Typen.** Die beiden Tab-Slots (`sidebar.right.pane.tab` und `.title`) deklariert
// die rechte Leiste selbst; ohne diesen Import kennt der Compiler ihre Namen nicht. Zur Laufzeit
// ist die Zeile verschwunden — das Bündel bleibt frei von einer Abhängigkeit auf sie.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// **Für die Slot-Karte `plugins.item`** — der Typ kommt aus dem Plugin-Manager, zur Laufzeit wird
// nichts davon importiert.
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// **Für den Dienst `configForms`.** Das Modul erweitert den Kontext um ihn; ohne den Import kennt
// der Compiler `ctx.configForms` nicht.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { DE, type UsageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    usage: keyof typeof DE
  }
}

/** Die Kennung im main-Slot und in der Seitenleiste. */
export const PANEL_ID = 'usage'

/**
 * Die Kennung des Tab-Typs in der rechten Leiste — zugleich der Schlüssel seiner beiden Slots.
 *
 * Ein Paketname ist der natürliche Wert: der Typ muß über **jede** Anmeldung im Tab-System
 * hinweg eindeutig sein, und eine Kennung, die eine andere Anmeldung überschreibt, wird vom
 * Register abgewiesen.
 */
export const TAB_ID = '@prometheus-harness/usage'

/**
 * Der Tab-**Typ** in der rechten Leiste.
 *
 * **Warum nicht `usage`.** Der Kern kennt dort bereits Typen wie `browser`, `files`, `terminal`,
 * und ein Typ der Stufe `extension` **verdrängt** einen `builtin` derselben Kennung. Ein eigener
 * Name kostet nichts und nimmt niemandem seinen Tab weg.
 */
export const TAB_KIND = 'pmh-usage'

/**
 * Der Eintrag im Profil — **der Schlüssel der Einstellungen**.
 *
 * Die Einstellungsseite eines Plugins speist sich aus der `Config` seines **Profil-Eintrags**,
 * nicht aus seinem Paketnamen. Deshalb steht die Kennung hier als eigener Name und nicht als
 * Ableitung aus `PANEL_ID`: derselbe Text, zwei Bedeutungen, und eine Bedeutung darf sich ändern,
 * ohne die andere mitzunehmen.
 */
export const ENTRY_ID = 'pmh-usage'

/** Der Namensraum der Texte. */
const NS = 'usage'

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
  /** Ob die Kachel auf dem Startbildschirm erscheint. */
  readonly guide?: boolean
}

/** Die Anzeige, wie sie nach dem Lesen der Einstellungen gilt — Vorgaben schon eingesetzt. */
interface Anzeige {
  readonly oberflaeche: 'sidebar' | 'plugins' | 'both' | 'none'
  readonly reihenfolge: number
  readonly beschriftung: string | undefined
  readonly kachel: boolean
}

/** Der Platz, den das Plugin ohne Einstellung hatte — ein Bestand soll sich nicht verschieben. */
const STANDARD_REIHENFOLGE = 13

/** Der Platz der Start-Kachel — ebenfalls der bisherige, und unabhängig vom Eintrag. */
const STANDARD_KACHEL_REIHENFOLGE = 36

/**
 * Setzt die Vorgaben in die Einstellungen ein.
 *
 * **Warum das eine eigene Funktion ist.** Dieselbe Auslegung wird an drei Stellen gebraucht (zwei
 * Anmeldungen und die Kachel). Stünde sie dreimal da, wäre die Vorgabe `sidebar` irgendwann an einer
 * Stelle `both` — und das fiele niemandem auf.
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
  return { oberflaeche, reihenfolge, beschriftung, kachel: config?.guide !== false }
}

/** Der Weg zum Stand — dieselbe Adresse wie in `src/server.ts`. */
const WEG_STAND = '/api/pmh/usage/status'

/** Der Weg zur Schätzung. */
const WEG_SCHAETZUNG = '/api/pmh/usage/schaetzung'

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'sidebarRightTabs', 'configForms']

/** Ein Guthaben, wie die Route es liefert. */
interface Saldo {
  readonly schluessel: string
  /** `live` heißt: eben beim Anbieter gefragt. `datei` heißt: aus dem Zwischenspeicher. */
  readonly quelle?: 'live' | 'datei'
  readonly guthabenUsd?: number
  readonly waehrung?: string
  readonly detail?: string
  /** Was je auf das Konto eingezahlt wurde — die Herkunft des Saldos, nicht der Saldo. */
  readonly eingezahltUsd?: number
  /** Was seit Kontoeröffnung verbraucht wurde. */
  readonly verbrauchtGesamtUsd?: number
  readonly limitUsd?: number
  readonly limitRestUsd?: number
  readonly verbrauchtUsd?: number
  /** Worauf das Limit sich bezieht (`daily`, `weekly`, `monthly`). */
  readonly limitZeitraum?: string
  readonly stand?: string
  readonly fehler?: string
  /**
   * Was der Abruf technisch gesagt hat — für den Tooltip, nicht für die Zeile.
   *
   * **Warum getrennt.** In der Zeile steht „Name nicht auflösbar"; wer nachsehen will, findet im
   * Tooltip `getaddrinfo ENOTFOUND openrouter.ai`. Beides an einem Ort wäre eine Zeile, die wie ein
   * Absturz aussieht.
   */
  readonly fehlerTechnisch?: string
  /** Geteilter Schlüssel: das Guthaben gehört mehreren. */
  readonly geteilt?: boolean
  /** Was **dieser Rechner** in den letzten 30 Tagen darüber verbraucht hat. */
  readonly hier30Usd?: number
}

/** Eine Summe über einen Zeitraum. */
interface Fenster {
  readonly usd: number
  readonly anfragen: number
  readonly unbepreist: number
}

/** Ein Tag der Tagesreihe. */
interface Tagesposten {
  readonly tag: string
  readonly usd: number
  readonly anfragen: number
}

/** Ein Modell der Rangliste. */
interface Modellposten {
  readonly modell: string
  readonly familie: string
  readonly usd: number
  readonly anfragen: number
}

/**
 * Ein Modell in der Auswahl des Schätzers.
 *
 * **`usd` darf fehlen.** Der Katalog nennt Modelle, für die kein Preis je Bild gemessen ist; sie
 * stehen in der Liste, aber ohne Zahl. Ein Modell aus der Liste zu werfen, weil sein Preis
 * unbekannt ist, wäre die falsche Antwort auf „welche gibt es".
 */
interface Bildpreis {
  readonly modell: string
  readonly usd?: number
  readonly herkunft: string
  readonly name?: string
}

/** Der Stand, wie ihn `GET /api/pmh/usage/status` liefert. */
interface Stand {
  readonly datei: string | null
  readonly gelesenAm: string
  readonly saldenStand: string | null
  readonly salden: readonly Saldo[]
  readonly fenster: {
    readonly tag: Fenster
    readonly woche: Fenster
    readonly monat: Fenster
    readonly gesamt: Fenster
  }
  readonly jeTag: readonly Tagesposten[]
  readonly jeModell: readonly Modellposten[]
  readonly hinweis?: string
  readonly schaetzung: { readonly modelle: readonly Bildpreis[]; readonly stufen: readonly string[] }
  /**
   * Wann der Bildmodell-Katalog geholt wurde, und ob es dabei ein Problem gab.
   *
   * **Warum optional.** Zwischen einem neuen Bündel und einem noch nicht neu gestarteten Host
   * antwortet der alte Handler ohne dieses Feld. Ein Panel, das daran zerbricht, wäre ein Absturz
   * für eine Verbesserung — die Marke fehlt dann eben.
   */
  readonly katalog?: { readonly geholtAm: string | null; readonly fehler?: string }
  /**
   * Wie viele Namen die Datei nannte, für die es hier **keinen** Schlüssel gibt.
   *
   * **Warum eine Zahl und keine Zeile.** Auf dieser Maschine nennt die Datei 14 Namen, hinterlegt
   * sind zwei. Elf Zeilen „kein Guthaben genannt" sind keine Auskunft über *deine* Schlüssel —
   * eine gezählte Zeile sagt, daß nichts verschwiegen wird.
   */
  readonly ausgeblendet?: number
  /**
   * Wie viele Buchungen eine fremde Eigner-Kennung trugen und deshalb nicht mitzählen.
   *
   * Auf dieser Maschine 37 Buchungen aus *openalice/finance* — ein anderes Werkzeug, das dieselbe
   * Datei benutzt. Sie zu verschweigen wäre schlimmer als sie zu nennen.
   */
  readonly fremd?: number
  /**
   * Wem die Zahlen gehören.
   *
   * **Optional wie `katalog`.** Ein Host, der noch die alte Antwort liefert, hat das Feld nicht; das
   * Panel zeigt dann keine Zeile statt einer falschen.
   */
  readonly geltung?: { readonly art: string; readonly nutzer: string | null }
}

/** Eine Schätzung, wie sie `GET /api/pmh/usage/schaetzung` liefert. */
interface Schaetzung {
  readonly usd?: number
  readonly grund: string
}

interface Props {
  /**
   * Schließt das Haupt-Panel.
   *
   * **Warum optional.** In der rechten Leiste gibt es diesen Knopf nicht: dort schließt der Chip
   * des Tabs, und ein zweiter Schließen-Knopf wäre ein zweiter Weg für dieselbe Sache.
   */
  readonly close?: () => void
  readonly t: TranslateNS<'usage'>
}

/**
 * Formt einen Dollarbetrag.
 *
 * **Warum zwei Genauigkeiten.** Ein Bild kostet 0,0387 USD und ein Monat einige Dollar; mit vier
 * Nachkommastellen überall wäre die Monatssumme unlesbar, mit zwei überall wäre das Bild „0,04" und
 * damit nicht mehr nachrechenbar.
 *
 * @param wert - der Betrag oder `undefined`
 * @returns der Text; bei `undefined` ein Gedankenstrich
 */
function geld(wert: number | undefined): string {
  if (wert === undefined || !Number.isFinite(wert)) return '—'
  return `${Math.abs(wert) < 1 ? wert.toFixed(4) : wert.toFixed(2)} USD`
}

/**
 * Formt einen Betrag ohne Einheit, mit zwei Nachkommastellen.
 *
 * **Warum neben `geld`.** `geld` schaltet unter einem Dollar auf vier Stellen — richtig für einen
 * Bildpreis von 0,0387 USD, falsch neben einem Limit von 5,00 USD: „0,0000 / 5,00" sieht dort wie
 * zwei verschiedene Einheiten aus.
 *
 * @param wert - der Betrag oder `undefined`
 * @returns der Text; bei `undefined` ein Gedankenstrich
 */
function zwei(wert: number | undefined): string {
  return wert === undefined || !Number.isFinite(wert) ? '—' : wert.toFixed(2)
}

/**
 * Die Beschriftung des Schlüssellimits.
 *
 * **Warum nicht einfach „Limit".** Ein Betrag direkt unter dem Guthaben wird als Budget des
 * Kontos gelesen. Das Limit gehört aber dem **Schlüssel** und gilt je Zeitraum; beides muß
 * dastehen, sonst widerspricht die Zeile der Zahl darüber (5,00 neben 25,10).
 *
 * @param zeitraum - `daily`, `weekly`, `monthly` oder `undefined`
 * @returns der Schlüssel des Textes
 */
function limitLabel(zeitraum: string | undefined): UsageKey {
  if (zeitraum === 'daily') return 'limitDaily'
  if (zeitraum === 'weekly') return 'limitWeekly'
  if (zeitraum === 'monthly') return 'limitMonthly'
  return 'limitKey'
}

/**
 * Formt einen Zeitpunkt.
 *
 * @param iso - der Zeitpunkt als ISO-Text oder `null`
 * @returns der lokale Text; bei `null` ein Gedankenstrich
 */
function zeitpunkt(iso: string | null): string {
  if (iso === null) return '—'
  const datum = new Date(iso)
  return Number.isNaN(datum.getTime()) ? '—' : datum.toLocaleString()
}

/**
 * Wie viele volle Tage ein Zeitpunkt zurückliegt.
 *
 * **Warum das am Rand der Anzeige steht und nicht in `stand.ts`.** Es ist keine Rechnung über Geld,
 * sondern über die Anzeige: „wie alt ist die Zahl, die ich gerade hinschreibe". Ein Datum allein
 * (21.10., 21:39) läßt den Leser subtrahieren; die Zahl daneben tut es nicht.
 *
 * @param iso - der Zeitpunkt als ISO-Text oder `undefined`
 * @param jetzt - die Zeit, gegen die gemessen wird (Millisekunden)
 * @returns die vollen Tage, oder `undefined`, wenn kein Zeitpunkt dasteht
 */
function alterInTagen(iso: string | undefined, jetzt: number): number | undefined {
  if (iso === undefined) return undefined
  const zeit = new Date(iso).getTime()
  if (Number.isNaN(zeit)) return undefined
  return Math.max(0, Math.floor((jetzt - zeit) / 86_400_000))
}

/** Liest JSON und macht aus einem HTTP-Fehler eine Ausnahme. */
async function hole<T>(url: string): Promise<T> {
  const antwort = await fetch(url, { headers: { accept: 'application/json' } })
  if (!antwort.ok) throw new Error(`HTTP ${String(antwort.status)}`)
  return (await antwort.json()) as T
}

/** Das Panel. */
export function UsagePanel({ close, t }: Props): ReactElement {
  const [stand, setStand] = useState<Stand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [neu, setNeu] = useState(0)
  const [modell, setModell] = useState('')
  const [stufe, setStufe] = useState('')
  const [anzahl, setAnzahl] = useState(1)
  const [schaetzung, setSchaetzung] = useState<Schaetzung | null>(null)
  const [schaetzt, setSchaetzt] = useState(false)
  const [schaetzFehler, setSchaetzFehler] = useState<string | null>(null)

  useEffect(() => {
    let ab = false
    setLaden(true)
    setFehler(null)
    // Beim **Neu lesen** wird der Katalog-Zwischenspeicher übergangen; beim ersten Öffnen nicht.
    hole<Stand>(neu > 0 ? `${WEG_STAND}?frisch=1` : WEG_STAND)
      .then((neuer) => {
        if (ab) return
        setStand(neuer)
        setModell((alt) => (alt !== '' ? alt : (neuer.schaetzung.modelle[0]?.modell ?? '')))
        setStufe((alt) => {
          if (alt !== '') return alt
          return neuer.schaetzung.stufen.includes('1K') ? '1K' : (neuer.schaetzung.stufen[0] ?? '')
        })
      })
      .catch((problem: unknown) => {
        if (ab) return
        setFehler(problem instanceof Error ? problem.message : String(problem))
      })
      .finally(() => {
        if (!ab) setLaden(false)
      })
    return () => {
      ab = true
    }
  }, [neu])

  useEffect(() => {
    if (modell === '') {
      setSchaetzung(null)
      return
    }
    let ab = false
    setSchaetzt(true)
    setSchaetzFehler(null)
    const frage = new URLSearchParams({ modell, anzahl: String(anzahl) })
    if (stufe !== '') frage.set('aufloesung', stufe)
    hole<{ schaetzung: Schaetzung }>(`${WEG_SCHAETZUNG}?${frage.toString()}`)
      .then((antwort) => {
        if (!ab) setSchaetzung(antwort.schaetzung)
      })
      .catch((problem: unknown) => {
        if (ab) return
        setSchaetzung(null)
        setSchaetzFehler(problem instanceof Error ? problem.message : String(problem))
      })
      .finally(() => {
        if (!ab) setSchaetzt(false)
      })
    return () => {
      ab = true
    }
  }, [modell, stufe, anzahl])

  const kacheln: readonly { schluessel: keyof typeof DE; fenster: Fenster }[] =
    stand === null
      ? []
      : [
          { schluessel: 'today', fenster: stand.fenster.tag },
          { schluessel: 'week', fenster: stand.fenster.woche },
          { schluessel: 'month', fenster: stand.fenster.monat },
          { schluessel: 'all', fenster: stand.fenster.gesamt },
        ]
  const hoechsterTag =
    stand === null
      ? 0
      : stand.jeTag.reduce((hoechster, posten) => (posten.usd > hoechster ? posten.usd : hoechster), 0)
  const leer = stand !== null && stand.fenster.gesamt.anfragen === 0 && stand.salden.length === 0
  // **Einmal je Zeichnung, nicht je Zeile.** Alle Zeilen sollen gegen dieselbe Uhr messen; sonst
  // stehen zwei Salden desselben Abrufs mit verschiedenem Alter nebeneinander.
  const jetzt = Date.now()

  return (
    <div className="pmh-us">
      <header className="pmh-us__head">
        <div className="pmh-us__brand">
          <UsageIcon size={20} />
          <div className="pmh-us__brandtext">
            <span className="pmh-us__kicker">USAGE</span>
            <h2 className="pmh-us__title">{t('title')}</h2>
          </div>
        </div>
        <div className="pmh-us__actions">
          <span className={`pmh-us__dot${stand === null ? '' : ' is-on'}`} />
          <span className="pmh-us__state">{stand?.datei ?? t('noFile')}</span>
          <button
            type="button"
            className="pmh-us__btn"
            onClick={() => setNeu(neu + 1)}
            disabled={laden}
          >
            {t('refresh')}
          </button>
          {close !== undefined && (
            <button type="button" className="pmh-us__btn pmh-us__btn--ghost" onClick={close}>
              {t('close')}
            </button>
          )}
        </div>
      </header>

      <div className="pmh-us__scroll">
        {fehler !== null && (
          <div className="pmh-us__fehler">
            <strong>{t('error')}</strong>
            <span>{fehler}</span>
            <button type="button" className="pmh-us__btn" onClick={() => setNeu(neu + 1)}>
              {t('retry')}
            </button>
          </div>
        )}

        {laden && stand === null && <p className="pmh-us__leer">{t('loading')}</p>}

        {stand !== null && (
          <>
            {stand.hinweis !== undefined && <p className="pmh-us__hinweis">{stand.hinweis}</p>}
            {leer && <p className="pmh-us__leer">{t('noData')}</p>}

            <section className="pmh-us__stats">
              {kacheln.map((kachel) => (
                <div key={kachel.schluessel} className="pmh-us__stat">
                  <span className="pmh-us__statlabel">{t(kachel.schluessel)}</span>
                  <strong className="pmh-us__statwert">{geld(kachel.fenster.usd)}</strong>
                  <span className="pmh-us__statsub">
                    {String(kachel.fenster.anfragen)} {t('requests')}
                    {kachel.fenster.unbepreist > 0
                      ? ` · ${String(kachel.fenster.unbepreist)} ${t('unpriced')}`
                      : ''}
                  </span>
                </div>
              ))}
            </section>

            <div className="pmh-us__grid">
              <section className="pmh-us__card">
                <h3 className="pmh-us__karte">{t('balances')}</h3>
                {stand.salden.length === 0 ? (
                  <p className="pmh-us__leer">{t('noBalance')}</p>
                ) : (
                  <ul className="pmh-us__salden">
                    {stand.salden.map((saldo) => {
                      const anteil =
                        saldo.limitUsd === undefined ||
                        saldo.limitUsd <= 0 ||
                        saldo.verbrauchtUsd === undefined
                          ? undefined
                          : Math.min(1, Math.max(0, saldo.verbrauchtUsd / saldo.limitUsd))
                      // **Das Alter gehört zur Zahl.** Ein Wert aus der Datei ohne Datum sieht aus
                      // wie eine Auskunft von jetzt; am 28.10.2026 war er 6,8 Tage alt.
                      const tage = saldo.quelle === 'live' ? undefined : alterInTagen(saldo.stand, jetzt)
                      // Ab zwei Tagen wird es farbig: ein Tag Verzug ist normal, eine Woche nicht.
                      const veraltet = tage !== undefined && tage >= 2
                      return (
                        <li key={saldo.schluessel} className="pmh-us__saldo">
                          <div className="pmh-us__saldokopf">
                            <span className="pmh-us__saldomarke">
                              {saldo.schluessel.replace(/_API_KEY$/u, '')}
                              <span
                                className={`pmh-us__quelle${saldo.quelle === 'live' ? ' is-live' : ''}`}
                                title={saldo.stand === undefined ? undefined : zeitpunkt(saldo.stand)}
                              >
                                {saldo.quelle === 'live' ? t('live') : t('cached')}
                              </span>
                              {saldo.geteilt === true && (
                                <span className="pmh-us__geteilt">{t('shared')}</span>
                              )}
                            </span>
                            <span className="pmh-us__saldobetrag">
                              {saldo.guthabenUsd === undefined
                                ? t('noBalance')
                                : geld(saldo.guthabenUsd)}
                            </span>
                          </div>
                          {saldo.detail !== undefined && (
                            <p className="pmh-us__saldodetail">{saldo.detail}</p>
                          )}
                          {saldo.geteilt === true && saldo.hier30Usd !== undefined && (
                            <p className="pmh-us__saldodetail">
                              {t('ofWhichHere')} {geld(saldo.hier30Usd)}
                            </p>
                          )}
                          {saldo.quelle !== 'live' && saldo.stand !== undefined && (
                            <p className={`pmh-us__saldostand${veraltet ? ' is-alt' : ''}`}>
                              {t('fileStand')} {zeitpunkt(saldo.stand)}
                              {tage === undefined ? '' : ` · ${String(tage)} ${t('ageDays')}`}
                            </p>
                          )}
                          {saldo.fehler !== undefined && (
                            <p className="pmh-us__saldofehler" title={saldo.fehlerTechnisch}>
                              {saldo.fehler}
                            </p>
                          )}
                          {anteil !== undefined && (
                            <div className="pmh-us__limit">
                              <div className="pmh-us__spur">
                                <i style={{ width: `${String(Math.round(anteil * 100))}%` }} />
                              </div>
                              <span>
                                {t(limitLabel(saldo.limitZeitraum))} · {zwei(saldo.verbrauchtUsd)} /{' '}
                                {zwei(saldo.limitUsd)} USD
                                {saldo.limitRestUsd === undefined
                                  ? ''
                                  : ` · ${zwei(saldo.limitRestUsd)} ${t('left')}`}
                              </span>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {stand.ausgeblendet !== undefined && stand.ausgeblendet > 0 && (
                  <p className="pmh-us__ausgeblendet">
                    {String(stand.ausgeblendet)} × {t('hiddenKeys')}
                  </p>
                )}
                {stand.fremd !== undefined && stand.fremd > 0 && (
                  <p className="pmh-us__ausgeblendet">
                    {String(stand.fremd)} × {t('foreign')}
                  </p>
                )}
                <p className="pmh-us__ausgeblendet">{t('billingNote')}</p>
              </section>

              <section className="pmh-us__card">
                <h3 className="pmh-us__karte">{t('history')}</h3>
                <div className="pmh-us__verlauf">
                  {stand.jeTag.map((posten) => {
                    const hoehe =
                      hoechsterTag <= 0 ? 0 : Math.max(2, Math.round((posten.usd / hoechsterTag) * 100))
                    return (
                      <span
                        key={posten.tag}
                        className={`pmh-us__balken${posten.usd > 0 ? ' is-aktiv' : ''}`}
                        style={{ height: `${String(hoehe)}%` }}
                        title={`${posten.tag}: ${geld(posten.usd)} · ${String(posten.anfragen)} ${t('requests')}`}
                      />
                    )
                  })}
                </div>
                <div className="pmh-us__verlaufsfuss">
                  <span>{stand.jeTag[0]?.tag ?? ''}</span>
                  <span>{t('today')}</span>
                </div>

                <h3 className="pmh-us__karte pmh-us__karte--eng">{t('models')}</h3>
                {stand.jeModell.length === 0 ? (
                  <p className="pmh-us__leer">{t('noData')}</p>
                ) : (
                  <ul className="pmh-us__modelle">
                    {stand.jeModell.map((posten) => (
                      <li key={`${posten.familie}/${posten.modell}`}>
                        <span className="pmh-us__modellname">{posten.modell}</span>
                        <span className="pmh-us__modellfamilie">{posten.familie}</span>
                        <span className="pmh-us__modellbetrag">{geld(posten.usd)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="pmh-us__card pmh-us__schaetzer">
              <h3 className="pmh-us__karte">{t('estimate')}</h3>
              <div className="pmh-us__steuer">
                <label className="pmh-us__feld">
                  <span>{t('model')}</span>
                  <select value={modell} onChange={(ereignis) => setModell(ereignis.target.value)}>
                    {stand.schaetzung.modelle.map((eintrag) => (
                      <option key={eintrag.modell} value={eintrag.modell}>
                        {eintrag.usd === undefined
                          ? `${eintrag.modell} — ${t('unknownPrice')}`
                          : `${eintrag.modell} — ${geld(eintrag.usd)} (${eintrag.herkunft})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pmh-us__feld">
                  <span>{t('resolution')}</span>
                  <select value={stufe} onChange={(ereignis) => setStufe(ereignis.target.value)}>
                    {stand.schaetzung.stufen.map((wert) => (
                      <option key={wert} value={wert}>
                        {wert}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="pmh-us__feld">
                  <span>{t('count')}</span>
                  <div className="pmh-us__zaehler">
                    <button
                      type="button"
                      onClick={() => setAnzahl((alt) => Math.max(1, alt - 1))}
                      disabled={anzahl <= 1}
                      aria-label={t('less')}
                    >
                      −
                    </button>
                    <b>{anzahl}</b>
                    <button
                      type="button"
                      onClick={() => setAnzahl((alt) => Math.min(4, alt + 1))}
                      disabled={anzahl >= 4}
                      aria-label={t('more')}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <p className="pmh-us__zahl">
                {schaetzt ? '…' : schaetzung?.usd === undefined ? t('noEstimate') : geld(schaetzung.usd)}
              </p>
              {schaetzung !== null && (
                <p className="pmh-us__grund">
                  <b>{t('basis')}</b> {schaetzung.grund}
                </p>
              )}
              {schaetzFehler !== null && (
                <p className="pmh-us__saldofehler">
                  {t('estimateError')} {schaetzFehler}
                </p>
              )}
            </section>

            <footer className="pmh-us__fuss">
              {stand.geltung !== undefined && (
                <span>
                  <b>{t('scope')}</b>{' '}
                  {stand.geltung.nutzer === null
                    ? t('scopeHost')
                    : `${stand.geltung.nutzer} · ${t('scopeHost')}`}
                </span>
              )}
              <span>
                <b>{t('source')}</b> {stand.datei ?? t('noFile')}
              </span>
              <span>
                <b>{t('readAt')}</b> {zeitpunkt(stand.gelesenAm)}
              </span>
              {stand.katalog?.geholtAm != null && (
                <span>
                  <b>{t('catalog')}</b> {zeitpunkt(stand.katalog.geholtAm)}
                </span>
              )}
              {stand.saldenStand !== null && (
                <span>
                  <b>{t('balancesAt')}</b> {zeitpunkt(stand.saldenStand)}
                </span>
              )}
              {stand.katalog?.fehler !== undefined && (
                <span className="pmh-us__fussfehler">{stand.katalog.fehler}</span>
              )}
              <span className="pmh-us__fusshinweis">{t('hint')}</span>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

/** Ein kleines Portemonnaie für die Seitenleiste. */
function UsageIcon({ size = 16 }: { readonly size?: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5Z" />
      <path d="M4 8.5h13" />
      <circle cx="16.4" cy="13" r="1.25" />
    </svg>
  )
}

/** Der Rumpf in der rechten Leiste — dasselbe Panel, ohne eigenen Schließen-Knopf. */
function UsageTabBody({ t }: Props): ReactElement {
  return <UsagePanel t={t} />
}

/** Der Titel im Tab-Chip. */
function UsageTabTitle({ t }: Props): ReactElement {
  return <span className="pmh-us__chip">{t('panel')}</span>
}

/**
 * Die Karte in der Plugin-Liste — der zweite Ort, den ein Plugin nehmen kann.
 *
 * **Was hier steht und warum.** Der Plugin-Manager fragt eine Anmeldung in `plugins.item` zweimal:
 * einmal für die **Kurzfassung** in der Liste (`view: 'summary'`) und einmal für den **Rumpf** der
 * eigenen Seite (`view: 'page'`). Die Kurzfassung ist ein Satz; der Rumpf ist dasselbe Panel wie im
 * Hauptfeld — nicht eine zweite Anzeige, sondern dieselbe an einem zweiten Ort.
 *
 * **Was hier bewusst nicht steht.** Kein eigener Speichern-Knopf: dieses Panel liest. Was der
 * Nutzer an der Anzeige ändert, ändert er in den Einstellungen des Eintrags — dort, wo die
 * `Config` liegt, und nicht in einer zweiten Steuerung daneben.
 */
function UsageItem({ view, t }: PluginConfigViewProps & Props): ReactElement {
  if (view === 'summary') return <span className="pmh-us__chip">{t('guide')}</span>
  return <UsagePanel t={t} />
}

/** Hängt Panel, Sidebar-Eintrag, Tab-Typ und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhUsage = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'usage: Stil')

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
      UsagePanel,
    )
  })

  /*
   * **Die Anzeige kommt jetzt aus den Einstellungen.**
   *
   * Vorher stand hier `order: 13` fest und `sidebar.panellist` wurde immer angemeldet. Jetzt liest
   * dieser Block den Eintrag `pmh-usage` über `configForms` und meldet **je nach `surface`** an:
   * die Seitenleiste, die Karte in der Plugin-Liste, oder beides — oder nichts.
   *
   * **Warum neu angemeldet statt nur umgeschaltet.** `order` ist Teil der Anmeldung; ein Eintrag
   * mit geänderter Reihenfolge ist ein anderer Eintrag. Deshalb wird bei jeder Änderung abgemeldet
   * und neu angemeldet — aber nur, wenn sich der **Wirkschlüssel** wirklich geändert hat, sonst
   * würde jeder Schnappschuss des Hosts die Oberfläche neu bauen.
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
              UsageIcon,
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
              UsageItem,
            ),
          ),
        )
      }

      // **Die rechte Leiste — hier wird das Panel „beweglich".** Was im Hauptfeld ein Panel ist, ist
      // dort ein Tab-Typ: dieselbe Anzeige, aber dockbar, schwebend, splittbar und in der Breite
      // ziehbar. Beides anzumelden ist der Punkt dieser Anmeldung — nicht ein zweites Fenster,
      // sondern dasselbe an einem Ort, den der Nutzer verschieben kann.
      //
      // **Warum der Dienst im `inject` steht und nicht über `ctx.get` geholt wird.** Mit `ctx.get`
      // kam zur Anmeldezeit `undefined` zurück: dieses Bundle lud **vor** `ui-sidebar-right`, also
      // gab es den Dienst noch nicht — und die Anmeldung lief still ins Leere (gemessen am 21.10.2026
      // im Schattenstart: der Eintrag fehlte im Guide, ohne eine einzige Fehlermeldung). Ein `inject`
      // auf den Dienst macht die Reihenfolge zur Sache des Loaders statt zur Annahme dieses Plugins.
      abgemeldet.push(
        ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          // Ein Usage-Tab je Spalte: zwei wären zwei Abfragen derselben Datei.
          multiple: false,
          // Einmal geöffnet, bleibt der Rumpf durch Andocken und Sitzungswechsel stehen — die
          // Zahlen müssen dann nicht neu gelesen werden.
          keepMounted: true,
          priority: 'extension',
          title: titel,
          // **Die Kachel behält ihren Platz.** `order` gilt für den Eintrag in Leiste und
          // Plugin-Liste; die Startseite hat ihre eigene Ordnung, und ein Bestand soll sich durch
          // das Hinzufügen eines Feldes nicht verschieben.
          guide: anzeige.kachel
            ? [{ id: 'usage', order: STANDARD_KACHEL_REIHENFOLGE, title: titel, description: () => t('guide') }]
            : [],
        }),
      )
    }

    anmelden()
    const abhoeren = form.subscribe(anmelden)
    return () => {
      abhoeren()
      for (const ab of abgemeldet) ab()
      abgemeldet = []
    }
  }, 'usage: Anzeige nach den Einstellungen')

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, UsageTabBody),
  )

  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID, locale: NS }, UsageTabTitle),
  )
}

const CSS = `
.pmh-us{
  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
  background:radial-gradient(120% 80% at 85% 0%,#161227 0%,#0b0a12 55%,#07070c 100%);
  color:#eceef8;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
}
.pmh-us__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-us__brand{display:flex;align-items:center;gap:11px;color:#e9c68f}
.pmh-us__brandtext{display:flex;flex-direction:column;gap:1px}
.pmh-us__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(233,198,143,.55)}
.pmh-us__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f6f1e8}
.pmh-us__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f0e6d2}
.pmh-us__actions{display:flex;align-items:center;gap:9px;min-width:0}
.pmh-us__dot{width:6px;height:6px;border-radius:50%;background:#6b5a8f;box-shadow:0 0 0 4px rgba(107,90,143,.12)}
.pmh-us__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
.pmh-us__state{max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.5)}
.pmh-us__btn{
  appearance:none;border:1px solid rgba(233,198,143,.22);background:rgba(30,24,18,.55);
  color:#f2ead9;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor:pointer;transition:border-color .18s ease,background .18s ease;
}
.pmh-us__btn:hover:not(:disabled){border-color:rgba(233,198,143,.6);background:rgba(52,41,28,.75)}
.pmh-us__btn:disabled{opacity:.45;cursor:default}
.pmh-us__btn--ghost{border-color:transparent;background:transparent;color:rgba(230,232,248,.6)}
.pmh-us__scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 26px}
.pmh-us__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin-bottom:14px}
.pmh-us__stat{display:flex;flex-direction:column;gap:3px;padding:11px 13px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))}
.pmh-us__statlabel{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(230,232,248,.45)}
.pmh-us__statwert{font:600 17px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f7f2e7;letter-spacing:-.02em}
.pmh-us__statsub{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.42)}
.pmh-us__grid{display:grid;grid-template-columns:minmax(260px,0.85fr) minmax(0,1.15fr);gap:14px;margin-bottom:14px}
.pmh-us__card{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.022);padding:14px 16px 16px}
.pmh-us__karte{margin:0 0 11px;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(233,198,143,.72)}
.pmh-us__karte--eng{margin-top:22px}
.pmh-us__salden{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.pmh-us__saldo{display:flex;flex-direction:column;gap:4px;padding-bottom:11px;border-bottom:1px dashed rgba(255,255,255,.06)}
.pmh-us__saldo:last-child{border-bottom:0;padding-bottom:0}
.pmh-us__saldokopf{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.pmh-us__saldomarke{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82);letter-spacing:.03em}
.pmh-us__quelle{margin-left:6px;font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(230,232,248,.32);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 5px}
.pmh-us__quelle.is-live{color:#8fe3c6;border-color:rgba(105,214,163,.35);background:rgba(105,214,163,.08)}
.pmh-us__geteilt{margin-left:5px;font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;color:#f0c98d;border:1px solid rgba(233,198,143,.3);background:rgba(233,198,143,.08);border-radius:999px;padding:2px 5px}
.pmh-us__fussfehler{width:100%;color:rgba(255,167,167,.6)}
.pmh-us__saldobetrag{font:600 12.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f4ead6;white-space:nowrap}
.pmh-us__saldodetail{margin:0;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.42)}
.pmh-us__saldofehler{margin:0;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,167,167,.78)}
.pmh-us__saldostand{margin:0;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.34)}
.pmh-us__saldostand.is-alt{color:#e3b778}
.pmh-us__limit{display:flex;flex-direction:column;gap:4px}
.pmh-us__limit span{font:9.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.4)}
.pmh-us__spur{height:4px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}
.pmh-us__spur i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#e9c68f,#d98f5a);transition:width .3s ease}
.pmh-us__verlauf{display:flex;align-items:flex-end;gap:3px;height:74px;padding:2px 0 0}
.pmh-us__balken{flex:1;min-height:2px;border-radius:2px 2px 0 0;background:rgba(255,255,255,.07)}
.pmh-us__balken.is-aktiv{background:linear-gradient(180deg,#e9c68f,rgba(217,143,90,.55))}
.pmh-us__verlaufsfuss{display:flex;justify-content:space-between;margin-top:5px;font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.34)}
.pmh-us__modelle{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.pmh-us__modelle li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:baseline}
.pmh-us__modellname{font:11.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-us__modellfamilie{font:9.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.34)}
.pmh-us__modellbetrag{font:11.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f2e6cf}
.pmh-us__schaetzer{display:flex;flex-direction:column}
.pmh-us__steuer{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(90px,.7fr) auto;gap:12px;align-items:end}
.pmh-us__feld{display:flex;flex-direction:column;gap:5px;min-width:0}
.pmh-us__feld>span{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(230,232,248,.42)}
.pmh-us__feld select{
  appearance:none;width:100%;min-width:0;border:1px solid rgba(233,198,143,.2);border-radius:8px;
  background:rgba(10,9,15,.7);color:#efe9dc;padding:7px 9px;font:11.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;
}
.pmh-us__feld select:focus{border-color:rgba(233,198,143,.55);box-shadow:0 0 0 3px rgba(233,198,143,.09)}
.pmh-us__zaehler{display:flex;align-items:center;gap:6px}
.pmh-us__zaehler button{
  appearance:none;width:26px;height:28px;border:1px solid rgba(233,198,143,.2);border-radius:8px;
  background:rgba(10,9,15,.7);color:#efe9dc;font:13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;
}
.pmh-us__zaehler button:hover:not(:disabled){border-color:rgba(233,198,143,.55)}
.pmh-us__zaehler button:disabled{opacity:.35;cursor:default}
.pmh-us__zaehler b{min-width:18px;text-align:center;font:600 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f6efdf}
.pmh-us__zahl{margin:16px 0 4px;font:600 30px/1.05 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:-.03em;color:#f8f1e2}
.pmh-us__grund{margin:0;max-width:84ch;font:10.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.46)}
.pmh-us__grund b{color:rgba(233,198,143,.8);font-weight:600}
.pmh-us__fuss{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.36)}
.pmh-us__fuss b{margin-right:5px;color:rgba(233,198,143,.6);font-weight:600}
.pmh-us__fusshinweis{width:100%;color:rgba(230,232,248,.28)}
.pmh-us__leer{margin:12px 0;color:rgba(230,232,248,.4);font-size:12px}
.pmh-us__ausgeblendet{margin:12px 0 0;padding-top:10px;border-top:1px dashed rgba(255,255,255,.06);font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.3)}
.pmh-us__hinweis{margin:0 0 12px;padding:8px 11px;border:1px solid rgba(233,198,143,.2);border-radius:9px;background:rgba(233,198,143,.06);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(246,238,222,.7)}
.pmh-us__fehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;padding:15px 16px;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,207,207,.85);border:1px solid rgba(255,120,120,.26);border-radius:10px;background:rgba(60,20,30,.35)}
.pmh-us__fehler strong{font-weight:600;color:#ffdcdc;flex-basis:100%}
.pmh-us__fehler span{flex:1 1 auto;min-width:0;color:rgba(255,207,207,.8)}
@media (max-width:900px){
  .pmh-us__grid{grid-template-columns:1fr}
  .pmh-us__steuer{grid-template-columns:1fr 1fr}
  .pmh-us__state{display:none}
}
@media (max-width:560px){
  .pmh-us__steuer{grid-template-columns:1fr}
  .pmh-us__head{padding:14px 16px 12px}
  .pmh-us__scroll{padding:14px 16px 22px}
}
`
