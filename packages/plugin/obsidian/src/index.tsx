/**
 * **Obsidian als eigenes Plugin — nicht nur eine Route.**
 *
 * Ein Sidebar-Eintrag, ein main-Panel, ein Tab im rechten Dock und ein Knopf im
 * Seitenleisten-Fuß: Vault-Status, Suche, Notizliste und Vorschau. Die Routen
 * liegen im Host-Teil (`lib/index.js` → Provider); dieses Panel liest sie nur.
 *
 * **Öffnen im Programm.** Zwei Stellen führen aus dem Harness heraus in die
 * Anwendung: die Kopfzeile des Panels (ganzer Vault) und die Werkzeugleiste der
 * Notiz (genau diese Notiz). Beide fragen zuerst `GET /app` — ohne gefundenes
 * Programm gibt es keinen Knopf.
 *
 * @module @prometheus-harness/obsidian
 */

import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// **Für das rechte Dock.** Das Paket erweitert den Kontext um `sidebarRightTabs` und
// `sidebarRight` und den Slot-Vertrag um `sidebar.right.pane.tab`; ohne den Import kennt der
// Compiler beides nicht. Zur Laufzeit wird nichts davon geladen — die Dienste kommen über `inject`.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// **Für die Slot-Karte `plugins.item`** — der Typ kommt aus dem Plugin-Manager, zur Laufzeit wird
// nichts davon importiert.
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// **Für den Dienst `configForms`.** Das Modul erweitert den Kontext um ihn; ohne den Import kennt
// der Compiler `ctx.configForms` nicht.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { DE } from './locales.ts'
import { GraphView } from './GraphView.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    obsidian: keyof typeof DE
  }
}

/** Die Kennung im main-Slot und in der Seitenleiste. */
export const PANEL_ID = 'obsidian'

/**
 * Der Eintrag im Profil — **der Schlüssel der Einstellungen**.
 *
 * Die Einstellungsseite eines Plugins speist sich aus der `Config` seines **Profil-Eintrags**,
 * nicht aus seinem Paketnamen. Deshalb steht die Kennung hier als eigener Name und nicht als
 * Ableitung aus `PANEL_ID`: derselbe Text, zwei Bedeutungen, und eine Bedeutung darf sich ändern,
 * ohne die andere mitzunehmen.
 */
export const ENTRY_ID = 'pmh-obsidian'

/** Der Namensraum der Texte. */
const NS = 'obsidian'

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
const STANDARD_REIHENFOLGE = 11

/**
 * Setzt die Vorgaben in die Einstellungen ein.
 *
 * **Warum das eine eigene Funktion ist.** Die Auslegung entscheidet über beide Anmeldungen. Stünde
 * sie zweimal da, wäre die Vorgabe `sidebar` irgendwann an einer Stelle `both` — und das fiele
 * niemandem auf.
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
export const inject = ['slots', 'locale', 'layout', 'configForms', 'sidebarRight', 'sidebarRightTabs']

/**
 * Die Kennung des Tab-Typs im **rechten** Seitenleisten-Dock.
 *
 * Getrennt von {@link PANEL_ID}: der Tab wird über `ctx.sidebarRight.openTab`
 * geöffnet, das Panel über `ctx.layout.selectPanel`. Eine gemeinsame Kennung
 * würde den einen Weg in den anderen greifen lassen — der Tab verschwindet
 * nicht, wenn das Haupt-Panel schließt, und das ist Absicht.
 */
export const TAB_ID = '@prometheus-harness/obsidian'

/** Der Diskriminator, den `openTab(TAB_KIND)` nennt. */
export const TAB_KIND = 'obsidian'

/** Was der Host über das Obsidian-Programm meldet (`GET /api/world/obsidian/app`). */
interface AppStatus {
  readonly verfuegbar: boolean
  readonly exe: string | null
  readonly weg: string | null
  readonly detail: string
  readonly vault: string | null
}

interface Status {
  readonly available: boolean
  readonly vault: string | null
  readonly notes: number
  readonly edges: number
  readonly openLinks: number
  readonly detail: string
  readonly error?: string
}

interface GraphNode {
  readonly id: string
  readonly label: string
  readonly kind?: string
  readonly path?: string
  readonly tags?: readonly string[]
}

interface GraphEdge {
  readonly from: string
  readonly to: string
  readonly kind?: string
}

interface Graph {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
}

interface Props {
  /**
   * Schließt das Haupt-Panel.
   *
   * **Warum optional.** In der Plugin-Liste gibt es diesen Knopf nicht: dort führt der Weg zurück
   * über die Liste, und ein zweiter Schließen-Knopf wäre ein zweiter Weg für dieselbe Sache.
   */
  readonly close?: () => void
  readonly t: TranslateNS<'obsidian'>
}

/** Liest JSON und macht aus einem HTTP-Fehler eine Ausnahme. */
async function hole<T>(url: string): Promise<T> {
  const antwort = await fetch(url, { headers: { accept: 'application/json' } })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return (await antwort.json()) as T
}

/**
 * Bittet den Host, Obsidian zu öffnen — Vault oder eine Notiz.
 *
 * Eine Stelle für beide Aufrufer (Panel und Seitenleisten-Aktion): die Route,
 * der Rumpf und die Fehlerform sollen nicht zweimal dastehen.
 *
 * @param notiz - relativer Notizpfad; ohne Angabe öffnet sich der ganze Vault
 * @returns die Meldung des Hosts
 */
async function oeffneImProgramm(notiz?: string): Promise<string> {
  const antwort = await fetch('/api/world/obsidian/app/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(notiz === undefined ? {} : { note: notiz }),
  })
  const daten = (await antwort.json().catch(() => ({}))) as { message?: string }
  if (!antwort.ok) throw new Error(daten.message ?? `HTTP ${antwort.status}`)
  return daten.message ?? ''
}

/** Das Panel. */
export function ObsidianPanel({ close, t }: Props): ReactElement {
  const [status, setStatus] = useState<Status | null>(null)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [neu, setNeu] = useState(0)
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [inhalt, setInhalt] = useState<string | null>(null)
  const [inhaltLaden, setInhaltLaden] = useState(false)
  const [inhaltFehler, setInhaltFehler] = useState<string | null>(null)
  const [modus, setModus] = useState<'vorschau' | 'quelle' | 'graph'>('vorschau')
  const [bearbeiten, setBearbeiten] = useState(false)
  const [entwurf, setEntwurf] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [hinweisFehler, setHinweisFehler] = useState(false)
  const [app, setApp] = useState<AppStatus | null>(null)
  const [vaultPfad, setVaultPfad] = useState('')
  const [waehlerLaeuft, setWaehlerLaeuft] = useState(false)
  const [oeffnet, setOeffnet] = useState(false)

  useEffect(() => {
    let ab = false
    setLaden(true)
    setFehler(null)
    Promise.all([
      hole<Status>('/api/world/obsidian/status'),
      hole<Graph>('/api/world/obsidian/graph'),
    ])
      .then(([neuerStatus, neuerGraph]) => {
        if (ab) return
        setStatus(neuerStatus)
        setGraph(neuerGraph)
        const erste = neuerGraph.nodes.find((knoten) => knoten.kind === 'note') ?? neuerGraph.nodes[0]
        setGewaehlt((alt) => alt ?? erste?.path ?? erste?.id ?? null)
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

  /**
   * **Das Programm getrennt vom Vault lesen.**
   *
   * Eigener Aufruf und eigener Fehlerpfad: ein Host ohne die neue Route antwortet
   * mit 404, und dann gibt es eben keinen Knopf — statt daß das ganze Panel
   * scheitert, weil eine Zusatzauskunft fehlt.
   */
  useEffect(() => {
    let ab = false
    hole<AppStatus>('/api/world/obsidian/app')
      .then((antwort) => {
        if (!ab) setApp(antwort)
      })
      .catch(() => {
        if (!ab) setApp(null)
      })
    return () => {
      ab = true
    }
  }, [neu])

  useEffect(() => {
    if (gewaehlt === null) {
      setInhalt(null)
      return
    }
    let ab = false
    setInhaltLaden(true)
    setInhaltFehler(null)
    hole<{ path: string; content: string }>(
      `/api/world/obsidian/note?path=${encodeURIComponent(gewaehlt)}`,
    )
      .then((antwort) => {
        if (!ab) setInhalt(antwort.content)
      })
      .catch((problem: unknown) => {
        if (!ab) {
          setInhalt(null)
          setInhaltFehler(problem instanceof Error ? problem.message : String(problem))
        }
      })
      .finally(() => {
        if (!ab) setInhaltLaden(false)
      })
    return () => {
      ab = true
    }
  }, [gewaehlt])

  useEffect(() => {
    if (!bearbeiten) setEntwurf(inhalt ?? '')
  }, [inhalt, bearbeiten])

  useEffect(() => {
    setBearbeiten(false)
    setHinweis(null)
  }, [gewaehlt])

  const speichere = async (): Promise<void> => {
    if (gewaehlt === null) return
    setSpeichert(true)
    setHinweis(null)
    try {
      const antwort = await fetch('/api/world/obsidian/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: gewaehlt, content: entwurf }),
      })
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
      setInhalt(entwurf)
      setBearbeiten(false)
      setModus('vorschau')
      setHinweis(t('saved'))
      setHinweisFehler(false)
    } catch (problem) {
      setHinweis(`${t('saveError')}: ${problem instanceof Error ? problem.message : String(problem)}`)
      setHinweisFehler(true)
    } finally {
      setSpeichert(false)
    }
  }

  /**
   * Öffnet den Vault — oder genau eine Notiz — im **Programm**.
   *
   * Der Host prüft den Pfad gegen den Vault (dieselbe Prüfung wie beim Lesen) und
   * startet über das `obsidian://`-Protokoll. Was zurückkommt, steht als Hinweis
   * im Panel: auch die abgeschickte Adresse, falls der Start scheiterte.
   *
   * @param notiz - relativer Notizpfad; ohne Angabe öffnet sich der ganze Vault
   */
  /**
   * Setzt den Vault — wahlweise mit Anlegen.
   *
   * **Der Weg ohne Obsidian.** Wer das Programm nicht hat, braucht trotzdem einen
   * Ordner; `anlegen` erzeugt ihn samt Willkommensnotiz. Ohne das Flag wird nur
   * geprüft, damit ein Tippfehler keinen leeren Ordner hinterläßt.
   */
  const setzeVault = async (anlegen: boolean): Promise<void> => {
    const pfad = vaultPfad.trim()
    if (pfad === '') return
    setWaehlerLaeuft(true)
    setHinweis(null)
    setHinweisFehler(false)
    try {
      const antwort = await fetch('/api/world/obsidian/vault', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(anlegen ? { path: pfad, anlegen: true } : { path: pfad }),
      })
      const daten = (await antwort.json().catch(() => ({}))) as { message?: string }
      if (!antwort.ok) throw new Error(daten.message ?? `HTTP ${antwort.status}`)
      setNeu((n) => n + 1)
    } catch (problem) {
      setHinweis(`${t('vaultError')}: ${problem instanceof Error ? problem.message : String(problem)}`)
      setHinweisFehler(true)
    } finally {
      setWaehlerLaeuft(false)
    }
  }

  const oeffneInObsidian = async (notiz?: string | null): Promise<void> => {
    setOeffnet(true)
    setHinweis(null)
    setHinweisFehler(false)
    try {
      const meldung = await oeffneImProgramm(notiz ?? undefined)
      setHinweis(meldung === '' ? t('opened') : meldung)
    } catch (problem) {
      setHinweis(`${t('openFailed')}: ${problem instanceof Error ? problem.message : String(problem)}`)
      setHinweisFehler(true)
    } finally {
      setOeffnet(false)
    }
  }

  const geaendert = bearbeiten && entwurf !== (inhalt ?? '')

  const verwerfen = (): void => {
    setBearbeiten(false)
    setEntwurf(inhalt ?? '')
    setHinweis(null)
  }

  const waehle = (ziel: string): void => {
    if (geaendert && !window.confirm(t('discardConfirm'))) return
    setGewaehlt(ziel)
  }

  const schliessePanel = (): void => {
    if (geaendert && !window.confirm(t('discardConfirm'))) return
    close?.()
  }

  const notizen = (graph?.nodes ?? []).filter((knoten) => knoten.kind === 'note')
  const begriff = suche.trim().toLowerCase()
  const sichtbar =
    begriff.length === 0
      ? notizen
      : notizen.filter((knoten) =>
          `${knoten.label} ${knoten.path ?? ''}`.toLowerCase().includes(begriff),
        )
  const gewaehlteNotiz =
    notizen.find((knoten) => (knoten.path ?? knoten.id) === gewaehlt) ?? null

  return (
    <div className="pmh-ob">
      <header className="pmh-ob__head">
        <div className="pmh-ob__brand">
          <ObsidianIcon size={22} />
          <div className="pmh-ob__brandtext">
            <span className="pmh-ob__kicker">VAULT</span>
            <h2 className="pmh-ob__title">{t('title')}</h2>
          </div>
        </div>
        <div className="pmh-ob__actions">
          <span className={status?.available ? 'pmh-ob__dot is-on' : 'pmh-ob__dot'} />
          <span className="pmh-ob__state">
            {status?.available ? t('vault') : t('noVault')}
          </span>
          {app?.verfuegbar === true && (
            <button
              className="pmh-ob__btn pmh-ob__btn--app"
              type="button"
              onClick={() => void oeffneInObsidian()}
              disabled={oeffnet}
              title={app.detail}
            >
              <ObsidianGem size={13} />
              {t('openInApp')}
            </button>
          )}
          <button
            className="pmh-ob__btn"
            type="button"
            onClick={() => setNeu((n) => n + 1)}
            disabled={laden}
          >
            {t('refresh')}
          </button>
          {close !== undefined && (
            <button className="pmh-ob__btn pmh-ob__btn--ghost" type="button" onClick={schliessePanel}>
              {t('close')}
            </button>
          )}
        </div>
      </header>

      <div className="pmh-ob__stats">
        <div className="pmh-ob__stat">
          <b>{status?.notes ?? '—'}</b>
          <span>{t('notes')}</span>
        </div>
        <div className="pmh-ob__stat">
          <b>{status?.edges ?? '—'}</b>
          <span>{t('edges')}</span>
        </div>
        <div className="pmh-ob__stat">
          <b>{status?.openLinks ?? '—'}</b>
          <span>{t('open')}</span>
        </div>
        <div className="pmh-ob__pfad" title={status?.vault ?? undefined}>
          {status?.vault ?? status?.detail ?? '—'}
        </div>
      </div>

      {status !== null && status.available === false ? (
        <form
          className="pmh-ob__waehler"
          onSubmit={(ereignis) => {
            ereignis.preventDefault()
            void setzeVault(false)
          }}
        >
          <label htmlFor="pmh-ob-vault">{t('vaultChoose')}</label>
          <input
            id="pmh-ob-vault"
            value={vaultPfad}
            onChange={(ereignis) => setVaultPfad(ereignis.target.value)}
            placeholder={t('vaultPlaceholder')}
            spellCheck={false}
          />
          <button className="pmh-ob__btn" type="submit" disabled={waehlerLaeuft || vaultPfad.trim() === ''}>
            {t('vaultUse')}
          </button>
          <button
            className="pmh-ob__btn pmh-ob__btn--app"
            type="button"
            disabled={waehlerLaeuft || vaultPfad.trim() === ''}
            onClick={() => void setzeVault(true)}
          >
            {t('vaultCreate')}
          </button>
        </form>
      ) : null}
      {fehler !== null ? (
        <div className="pmh-ob__fehler">
          <strong>{t('error')}</strong>
          <span>{fehler}</span>
          <button className="pmh-ob__btn" type="button" onClick={() => setNeu((n) => n + 1)}>
            {t('retry')}
          </button>
        </div>
      ) : (
        <div className="pmh-ob__body">
          <aside className="pmh-ob__list">
            <label className="pmh-ob__search">
              <SearchIcon />
              <input
                type="search"
                value={suche}
                onChange={(event) => setSuche(event.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
              />
            </label>
            <div className="pmh-ob__items">
              {laden && notizen.length === 0 ? (
                <p className="pmh-ob__leer">{t('loading')}</p>
              ) : sichtbar.length === 0 ? (
                <p className="pmh-ob__leer">{begriff.length > 0 ? '—' : t('empty')}</p>
              ) : (
                sichtbar.map((knoten) => (
                  <button
                    key={knoten.id}
                    type="button"
                    className={
                      (knoten.path ?? knoten.id) === gewaehlt ? 'pmh-ob__item is-aktiv' : 'pmh-ob__item'
                    }
                    onClick={() => waehle(knoten.path ?? knoten.id)}
                    title={knoten.path ?? knoten.label}
                  >
                    <span className="pmh-ob__itemname">{knoten.label}</span>
                    <span className="pmh-ob__itempfad">{knoten.path ?? knoten.kind ?? ''}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="pmh-ob__detail">
            {gewaehlteNotiz === null ? (
              <p className="pmh-ob__leer">{t('select')}</p>
            ) : (
              <>
                <div className="pmh-ob__detailkopf">
                  <div>
                    <h3>{gewaehlteNotiz.label}</h3>
                    <code>{gewaehlteNotiz.path ?? gewaehlteNotiz.id}</code>
                  </div>
                  <div className="pmh-ob__tools" role="group" aria-label={t('content')}>
                    {bearbeiten ? (
                      <>
                        <button
                          className="pmh-ob__tool is-aktiv"
                          type="button"
                          onClick={() => void speichere()}
                          disabled={speichert}
                        >
                          {speichert ? t('loading') : t('save')}
                        </button>
                        <button className="pmh-ob__tool" type="button" onClick={verwerfen}>
                          {t('discard')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={modus === 'vorschau' ? 'pmh-ob__tool is-aktiv' : 'pmh-ob__tool'}
                          type="button"
                          onClick={() => setModus('vorschau')}
                        >
                          {t('preview')}
                        </button>
                        <button
                          className={modus === 'quelle' ? 'pmh-ob__tool is-aktiv' : 'pmh-ob__tool'}
                          type="button"
                          onClick={() => setModus('quelle')}
                        >
                          {t('source')}
                        </button>
                        <button
                          className={modus === 'graph' ? 'pmh-ob__tool is-aktiv' : 'pmh-ob__tool'}
                          type="button"
                          onClick={() => setModus('graph')}
                          title={t('graphView')}
                        >
                          {t('graph')}
                        </button>
                        <button
                          className="pmh-ob__tool"
                          type="button"
                          onClick={() => {
                            setEntwurf(inhalt ?? '')
                            setBearbeiten(true)
                            setHinweis(null)
                          }}
                        >
                          {t('edit')}
                        </button>
                        {app?.verfuegbar === true && (
                          <button
                            className="pmh-ob__tool pmh-ob__tool--app"
                            type="button"
                            onClick={() => void oeffneInObsidian(gewaehlt)}
                            disabled={oeffnet}
                            title={t('openNoteHint')}
                          >
                            <ObsidianGem size={11} />
                            {t('openNote')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {inhaltLaden ? (
                  <p className="pmh-ob__leer">{t('loading')}</p>
                ) : inhaltFehler !== null ? (
                  <p className="pmh-ob__leer">{inhaltFehler}</p>
                ) : bearbeiten ? (
                  <textarea
                    className="pmh-ob__editor"
                    value={entwurf}
                    onChange={(event) => setEntwurf(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                        event.preventDefault()
                        void speichere()
                      }
                    }}
                    spellCheck={false}
                    aria-label={t('edit')}
                  />
                ) : modus === 'quelle' ? (
                  <pre className="pmh-ob__text">{inhalt ?? ''}</pre>
                ) : modus === 'graph' ? (
                  <GraphView
                    graph={graph ?? { nodes: [], edges: [] }}
                    gewaehlt={gewaehlt}
                    onSelect={waehle}
                    t={t}
                  />
                ) : (
                  <MarkdownView text={inhalt ?? ''} />
                )}
                {hinweis !== null ? (
                  <p className={hinweisFehler ? 'pmh-ob__hinweis is-fehler' : 'pmh-ob__hinweis'}>
                    {hinweis}
                  </p>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/**
 * **Markdown lesbar machen — ohne fremde Bibliothek.**
 *
 * Der Vault ist Markdown; ein `<pre>` zeigt die Sterne der Auszeichnung, nicht
 * den Text. Dieser Renderer deckt ab, was in Notizen vorkommt: Überschriften,
 * Absätze, Listen, Zitate, Codezäune, `**fett**`, `*kursiv*`, `[[Wikilinks]]`
 * und normale Links. Alles wird als React-Text gerendert, nie als HTML.
 */
function MarkdownView({ text }: { readonly text: string }): ReactElement {
  const zeilen = text.split(/\r?\n/)
  const bloecke: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < zeilen.length) {
    const zeile = zeilen[i] ?? ''
    const kante = zeile.trim()

    if (kante.length === 0) {
      i += 1
      continue
    }

    const zaun = /^```\s*([\w-]*)\s*$/.exec(zeile)
    if (zaun) {
      const sprache = zaun[1] ?? ''
      const code: string[] = []
      i += 1
      while (i < zeilen.length && !/^```\s*$/.test(zeilen[i] ?? '')) {
        code.push(zeilen[i] ?? '')
        i += 1
      }
      i += 1
      bloecke.push(
        <pre key={`code-${key++}`} className="pmh-ob__mdcode" data-lang={sprache}>
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const kopf = /^(#{1,6})\s+(.*)$/.exec(zeile)
    if (kopf) {
      const stufe = Math.min(6, (kopf[1] ?? '#').length)
      const Inhalt = `h${stufe}` as 'h1'
      bloecke.push(
        <Inhalt key={`h-${key++}`} className={`pmh-ob__mdh pmh-ob__mdh${stufe}`}>
          {inline(kopf[2] ?? '', `h-${key}`)}
        </Inhalt>,
      )
      i += 1
      continue
    }

    if (/^\s*[-*+]\s+/.test(zeile)) {
      const punkte: ReactNode[] = []
      while (i < zeilen.length && /^\s*[-*+]\s+/.test(zeilen[i] ?? '')) {
        punkte.push(<li key={`li-${key++}`}>{inline((zeilen[i] ?? '').replace(/^\s*[-*+]\s+/, ''), `li-${key}`)}</li>)
        i += 1
      }
      bloecke.push(<ul key={`ul-${key++}`} className="pmh-ob__mdliste">{punkte}</ul>)
      continue
    }

    if (/^\s*\d+\.\s+/.test(zeile)) {
      const punkte: ReactNode[] = []
      while (i < zeilen.length && /^\s*\d+\.\s+/.test(zeilen[i] ?? '')) {
        punkte.push(<li key={`oli-${key++}`}>{inline((zeilen[i] ?? '').replace(/^\s*\d+\.\s+/, ''), `oli-${key}`)}</li>)
        i += 1
      }
      bloecke.push(<ol key={`ol-${key++}`} className="pmh-ob__mdliste">{punkte}</ol>)
      continue
    }

    if (/^>\s?/.test(zeile)) {
      const zitat: string[] = []
      while (i < zeilen.length && /^>\s?/.test(zeilen[i] ?? '')) {
        zitat.push((zeilen[i] ?? '').replace(/^>\s?/, ''))
        i += 1
      }
      bloecke.push(
        <blockquote key={`q-${key++}`} className="pmh-ob__mdzitat">
          {inline(zitat.join(' '), `q-${key}`)}
        </blockquote>,
      )
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(kante)) {
      bloecke.push(<hr key={`hr-${key++}`} className="pmh-ob__mdhr" />)
      i += 1
      continue
    }

    const absatz: string[] = []
    while (i < zeilen.length) {
      const naechste = zeilen[i] ?? ''
      if (
        naechste.trim().length === 0 ||
        /^```/.test(naechste) ||
        /^#{1,6}\s+/.test(naechste) ||
        /^\s*[-*+]\s+/.test(naechste) ||
        /^\s*\d+\.\s+/.test(naechste) ||
        /^>\s?/.test(naechste) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(naechste.trim())
      ) {
        break
      }
      absatz.push(naechste)
      i += 1
    }
    bloecke.push(
      <p key={`p-${key++}`} className="pmh-ob__mdp">
        {inline(absatz.join(' '), `p-${key}`)}
      </p>,
    )
  }

  return <div className="pmh-ob__md">{bloecke}</div>
}

/** Zerlegt eine Zeile in fette, kursive, Code-, Wiki- und normale Links. */
function inline(text: string, keyBasis: string): ReactNode[] {
  const teile = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g)
  const aus: ReactNode[] = []
  teile.forEach((teil, index) => {
    if (teil.length === 0) return
    const key = `${keyBasis}-${index}`
    if (teil.startsWith('**') && teil.endsWith('**')) {
      aus.push(<strong key={key}>{teil.slice(2, -2)}</strong>)
    } else if (teil.startsWith('*') && teil.endsWith('*')) {
      aus.push(<em key={key}>{teil.slice(1, -1)}</em>)
    } else if (teil.startsWith('`') && teil.endsWith('`')) {
      aus.push(<code key={key} className="pmh-ob__mdc">{teil.slice(1, -1)}</code>)
    } else if (teil.startsWith('[[') && teil.endsWith(']]')) {
      const inner = teil.slice(2, -2)
      const [ziel, name] = inner.split('|')
      aus.push(
        <span key={key} className="pmh-ob__wikilink" title={ziel}>
          {name ?? ziel}
        </span>,
      )
    } else if (/^\[[^\]]+\]\([^)]+\)$/.test(teil)) {
      const treffer = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(teil)
      if (treffer) {
        aus.push(
          <a key={key} className="pmh-ob__mdlink" href={treffer[2]} target="_blank" rel="noreferrer">
            {treffer[1]}
          </a>,
        )
      }
    } else {
      aus.push(teil)
    }
  })
  return aus
}

/** Ein Buch mit Lesezeichen — ruhig, eine Linienstärke. */
export function ObsidianIcon({ size = 20 }: { readonly size?: number }): ReactElement {
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
      <path d="M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2Z" />
      <path d="M5 18a2 2 0 0 1 2-2h11.5" />
      <path d="M8 4.5v7l2-1.4 2 1.4v-7" />
    </svg>
  )
}

/** Ein kleines Suchglas. */
function SearchIcon(): ReactElement {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </svg>
  )
}

/**
 * Das Obsidian-Zeichen — der geschliffene Stein, nicht das Buch.
 *
 * **Warum ein zweites Zeichen.** {@link ObsidianIcon} steht für *den Vault*
 * (Buch mit Lesezeichen) und sitzt in der Leiste, wo er das Panel adressiert.
 * Der Knopf „im Programm öffnen“ meint aber das **Programm** — dafür steht der
 * Stein, den Obsidian selbst als Marke führt. Zwei Bedeutungen, zwei Zeichen.
 *
 * @param props - Kantenlänge und Zusatzklasse
 * @returns das Symbol
 */
export function ObsidianGem({
  size = 18,
  className,
}: {
  readonly size?: number | undefined
  readonly className?: string | undefined
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2.6 4.6 9.4 8.1 19 12 21.4 15.9 19l3.5-9.6z" />
      <path d="M12 2.6 9.4 12.2 12 21.4l2.6-9.2z" />
    </svg>
  )
}

/**
 * **Die Aktion in der Seitenleiste.**
 *
 * Steht im Fuß der Seitenleiste, neben den Einstellungen: in der breiten Spalte
 * als Zeile mit Beschriftung, in der schmalen Leiste als Symbol. Sie startet das
 * **Programm** (nicht das Panel) — der Vault liegt schon daneben.
 *
 * Meldet Obsidian nicht gefunden, wird **nichts** gerendert: ein Knopf, der
 * nichts tun kann, ist schlechter als keiner.
 *
 * @param props - Spaltenbreite und Übersetzer
 * @returns der Knopf, oder `null` ohne gefundenes Programm
 */
function ObsidianSidebarAction({
  wide,
  t,
}: {
  readonly wide: boolean
  readonly t: TranslateNS<'obsidian'>
}): ReactElement | null {
  const [app, setApp] = useState<AppStatus | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    let ab = false
    hole<AppStatus>('/api/world/obsidian/app')
      .then((antwort) => {
        if (!ab) setApp(antwort)
      })
      .catch(() => {
        if (!ab) setApp(null)
      })
    return () => {
      ab = true
    }
  }, [])

  if (app?.verfuegbar !== true) return null

  const klick = async (): Promise<void> => {
    setLaeuft(true)
    try {
      await oeffneImProgramm()
    } catch {
      // Kein Hinweisort im Fuß der Leiste: der Host antwortet im Panel mit dem
      // Grund (GET /app nennt ihn), und ein Toast für einen Startversuch wäre
      // lauter als der Vorgang.
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <button
      className={wide ? 'pmh-ob__rail is-weit' : 'pmh-ob__rail'}
      type="button"
      onClick={() => void klick()}
      disabled={laeuft}
      title={app.detail}
      aria-label={t('openInApp')}
    >
      <ObsidianGem size={18} />
      {wide && <span className="pmh-ob__railtext">{t('openInApp')}</span>}
    </button>
  )
}

/**
 * Der Rumpf des Tabs in der **rechten** Seitenleiste.
 *
 * Dasselbe Panel wie im Hauptfeld, nur an einem zweiten Ort; geschlossen wird
 * über den Tab (`tab.actions.close`), nicht über das Layout.
 *
 * @param props - Tab-Auskunft und Übersetzer
 * @returns das Panel
 */
function ObsidianTabBody({
  useTabInfo,
  t,
}: {
  readonly useTabInfo: () => { readonly tab: { readonly actions: { readonly close: () => void } } }
  readonly t: TranslateNS<'obsidian'>
}): ReactElement {
  const { tab } = useTabInfo()
  return <ObsidianPanel close={() => tab.actions.close()} t={t} />
}

/**
 * Die Karte in der Plugin-Liste — der zweite Ort, den ein Plugin nehmen kann.
 *
 * **Was hier steht und warum.** Der Plugin-Manager fragt eine Anmeldung in `plugins.item` zweimal:
 * einmal für die **Kurzfassung** in der Liste (`view: 'summary'`) und einmal für den **Rumpf** der
 * eigenen Seite (`view: 'page'`). Die Kurzfassung ist eine Zeile; der Rumpf ist dasselbe Panel wie
 * im Hauptfeld — nicht eine zweite Anzeige, sondern dieselbe an einem zweiten Ort.
 *
 * **Was hier bewusst nicht steht.** Kein eigener Schließen-Knopf: dieses Panel wird von der
 * Plugin-Seite getragen, die ihren eigenen Weg zurück hat.
 */
function ObsidianItem({ view, t }: PluginConfigViewProps & Props): ReactElement {
  if (view === 'summary') return <span className="pmh-ob__badge">{t('panel')}</span>
  return <ObsidianPanel t={t} />
}

/** Hängt Panel, Sidebar-Eintrag und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhObsidian = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'obsidian: Stil')

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
      ObsidianPanel,
    )
  })

  /*
   * **Derselbe Vault, ein zweiter Ort: das rechte Dock.**
   *
   * Ein Tab-Typ besteht aus zwei Anmeldungen: die *Definition* (wer ist dieser
   * Typ, was öffnet er, welcher Titel steht am Chip) und der *Rumpf* unter
   * derselben Kennung. Beide sind nötig — eine Definition ohne Rumpf ist ein
   * leerer Tab, ein Rumpf ohne Definition wird nie geöffnet.
   */
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => t('title'),
        guide: [
          {
            id: 'vault',
            order: 21,
            title: () => t('title'),
            description: () => t('guide'),
            icon: ObsidianGem,
          },
        ],
      }),
    'obsidian: Tab-Typ im rechten Dock',
  )

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
          ObsidianTabBody,
        ),
      ),
    'obsidian: Tab-Rumpf im rechten Dock',
  )

  /*
   * **Kein eigener Titel-Eintrag.** Der Chip eines Tabs kommt aus der Definition
   * (`title(address)`), und die nennt bereits `t('title')`. Ein zweiter Eintrag
   * für denselben Text wäre eine zweite Quelle für dieselbe Beschriftung.
   */

  /*
   * **Der Programm-Knopf in der Seitenleiste.**
   *
   * `sidebar.footer.action` ist der einzige Seitenleisten-Platz, der eine
   * *Handlung* trägt statt eines Panels: `sidebar.panellist` adressiert ein
   * Haupt-Panel, und ein Eintrag dort würde den Vault öffnen — nicht das
   * Programm.
   */
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'obsidian-app', order: 20, locale: NS },
          ObsidianSidebarAction,
        ),
      ),
    'obsidian: Programm-Aktion in der Seitenleiste',
  )

  /*
   * **Die Anzeige kommt jetzt aus den Einstellungen.**
   *
   * Vorher stand hier `order: 11` fest und `sidebar.panellist` wurde immer angemeldet. Jetzt liest
   * dieser Block den Eintrag `pmh-obsidian` über `configForms` und meldet **je nach `surface`** an:
   * die Seitenleiste, die Karte in der Plugin-Liste, oder beides — oder nichts.
   *
   * **Warum neu angemeldet statt nur umgeschaltet.** `order` ist Teil der Anmeldung; ein Eintrag
   * mit geänderter Reihenfolge ist ein anderer Eintrag. Deshalb wird bei jeder Änderung abgemeldet
   * und neu angemeldet — aber nur, wenn sich der **Wirkschlüssel** wirklich geändert hat, sonst
   * würde jeder Schnappschuß des Hosts die Oberfläche neu bauen.
   *
   * **Keine Start-Kachel.** Dieses Plugin meldet keine an; deshalb gibt es weder ein `guide`-Feld
   * noch eine zweite Anmeldung, die davon abhinge.
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
              ObsidianIcon,
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
              ObsidianItem,
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
  }, 'obsidian: Anzeige nach den Einstellungen')
}

const CSS = `
.pmh-ob{
  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
  background:radial-gradient(120% 80% at 15% 0%,#12142a 0%,#090a12 55%,#07080d 100%);
  color:#eceef8;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
}
.pmh-ob__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-ob__brand{display:flex;align-items:center;gap:11px;color:#c9b8ff}
.pmh-ob__brandtext{display:flex;flex-direction:column;gap:1px}
.pmh-ob__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(206,190,255,.55)}
.pmh-ob__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f2f0ff}
.pmh-ob__actions{display:flex;align-items:center;gap:9px;min-width:0}
.pmh-ob__dot{width:6px;height:6px;border-radius:50%;background:#6b5a8f;box-shadow:0 0 0 4px rgba(107,90,143,.12)}
.pmh-ob__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
.pmh-ob__state{font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.55);white-space:nowrap}
.pmh-ob__btn{
  appearance:none;border:1px solid rgba(180,170,230,.22);background:rgba(24,22,40,.6);
  color:#e8e6fa;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor:pointer;transition:border-color .18s ease,background .18s ease;
}
.pmh-ob__btn:hover:not(:disabled){border-color:rgba(190,170,255,.6);background:rgba(40,34,64,.75)}
.pmh-ob__btn:disabled{opacity:.45;cursor:default}
.pmh-ob__btn--ghost{border-color:transparent;background:transparent;color:rgba(230,232,248,.6)}
.pmh-ob__stats{display:flex;align-items:center;gap:22px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.06)}
.pmh-ob__stat{display:flex;align-items:baseline;gap:6px;white-space:nowrap}
.pmh-ob__stat b{font:600 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f4f2ff}
.pmh-ob__stat span{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.5);letter-spacing:.04em}
.pmh-ob__pfad{margin-left:auto;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(206,190,255,.55)}
.pmh-ob__fehler{display:flex;align-items:center;gap:12px;margin:18px 20px;padding:12px 14px;border:1px solid rgba(255,120,120,.25);border-radius:10px;background:rgba(60,20,30,.35);color:#ffd9d9}
.pmh-ob__fehler span{font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,217,217,.75)}
.pmh-ob__body{display:grid;grid-template-columns:minmax(220px,320px) minmax(0,1fr);flex:1;min-height:0}
.pmh-ob__list{display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.06)}
.pmh-ob__search{display:flex;align-items:center;gap:8px;margin:12px 12px 8px;padding:7px 9px;border:1px solid rgba(180,170,230,.18);border-radius:8px;color:rgba(230,232,248,.5);background:rgba(10,10,18,.5)}
.pmh-ob__search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#eceef8;font:12px/1.3 "Segoe UI", system-ui, sans-serif}
.pmh-ob__search input::placeholder{color:rgba(230,232,248,.35)}
.pmh-ob__items{flex:1;min-height:0;overflow:auto;padding:2px 8px 12px}
.pmh-ob__item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:8px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:#dfe1f0;cursor:pointer}
.pmh-ob__item:hover{background:rgba(120,100,200,.08)}
.pmh-ob__item.is-aktiv{background:rgba(120,100,220,.16);border-color:rgba(170,150,255,.22)}
.pmh-ob__itemname{font-size:12.5px;font-weight:500;color:#f0eeff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-ob__itempfad{font:10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-ob__detail{min-height:0;overflow:auto;padding:20px 22px}
.pmh-ob__detailkopf{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
.pmh-ob__detailkopf h3{margin:0 0 4px;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#f4f2ff}
.pmh-ob__detailkopf code{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(206,190,255,.6)}
.pmh-ob__badge{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.12em;color:rgba(206,190,255,.55);border:1px solid rgba(180,170,230,.18);border-radius:999px;padding:5px 8px}
.pmh-ob__text{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82);max-width:76ch}
.pmh-ob__editor{display:block;width:100%;max-width:78ch;min-height:52vh;resize:vertical;border:1px solid rgba(180,170,230,.22);border-radius:9px;background:rgba(4,5,10,.72);color:rgba(236,238,248,.9);padding:13px 15px;font:12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
.pmh-ob__editor:focus{border-color:rgba(190,170,255,.55);box-shadow:0 0 0 3px rgba(140,120,240,.1)}
.pmh-ob__hinweis{margin:12px 0 0;font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
.pmh-ob__hinweis.is-fehler{color:#ffb4b4}
.pmh-ob__tools{display:inline-flex;gap:2px;padding:2px;border:1px solid rgba(180,170,230,.18);border-radius:8px;background:rgba(8,8,16,.45)}
.pmh-ob__tool{appearance:none;border:0;border-radius:6px;background:transparent;color:rgba(230,232,248,.55);padding:5px 8px;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;transition:background .16s ease,color .16s ease}
.pmh-ob__tool:hover{color:#f0eeff}
.pmh-ob__tool.is-aktiv{background:rgba(140,120,240,.18);color:#f2f0ff}
.pmh-ob__md{max-width:78ch;color:rgba(236,238,248,.86);font:13px/1.72 "Segoe UI", "SF Pro Text", system-ui, sans-serif}
.pmh-ob__mdh{margin:22px 0 8px;font-weight:600;letter-spacing:-.015em;color:#f6f4ff;line-height:1.25}
.pmh-ob__mdh1{font-size:24px;margin-top:4px}
.pmh-ob__mdh2{font-size:19px}
.pmh-ob__mdh3{font-size:16px}
.pmh-ob__mdh4,.pmh-ob__mdh5,.pmh-ob__mdh6{font-size:13px;color:rgba(236,238,248,.7)}
.pmh-ob__mdp{margin:0 0 13px}
.pmh-ob__mdliste{margin:0 0 14px;padding-left:22px;display:flex;flex-direction:column;gap:4px}
.pmh-ob__mdliste li{color:rgba(236,238,248,.84)}
.pmh-ob__mdzitat{margin:0 0 14px;padding:8px 14px;border-left:2px solid rgba(180,150,255,.45);background:rgba(140,120,240,.06);color:rgba(236,238,248,.72);font-style:italic}
.pmh-ob__mdhr{border:0;border-top:1px solid rgba(255,255,255,.08);margin:20px 0}
.pmh-ob__mdcode{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(4,5,10,.7);overflow:auto}
.pmh-ob__mdcode code{font:11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82)}
.pmh-ob__mdc{font:11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d8c9ff;background:rgba(140,120,240,.12);border-radius:4px;padding:1px 4px}
.pmh-ob__mdlink{color:#b9a8ff;text-decoration:none;border-bottom:1px solid rgba(185,168,255,.35)}
.pmh-ob__mdlink:hover{border-bottom-color:#b9a8ff}
.pmh-ob__wikilink{color:#d8c9ff;border-bottom:1px dashed rgba(216,201,255,.4);cursor:default}
.pmh-ob__leer{margin:18px 0;color:rgba(230,232,248,.42);font-size:12px}
.pmh-ob__btn--app{display:inline-flex;align-items:center;gap:6px;border-color:rgba(150,120,255,.42);color:#ded4ff}
.pmh-ob__btn--app:hover:not(:disabled){border-color:rgba(180,150,255,.8);background:rgba(60,40,120,.4)}
.pmh-ob__tool--app{display:inline-flex;align-items:center;gap:4px;color:#c9b8ff}
.pmh-ob__tool--app:hover{color:#f0eaff}
.pmh-ob__rail{
  display:flex;align-items:center;justify-content:center;gap:7px;
  border:1px solid transparent;background:transparent;color:rgba(230,232,248,.62);
  border-radius:8px;padding:7px 9px;cursor:pointer;
  font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  transition:color .16s ease,border-color .16s ease,background .16s ease;
}
.pmh-ob__rail:hover:not(:disabled){color:#e8e6fa;border-color:rgba(180,170,230,.22);background:rgba(24,22,40,.6)}
.pmh-ob__rail:disabled{opacity:.45;cursor:default}
.pmh-ob__rail.is-weit{justify-content:flex-start;width:100%}
.pmh-ob__railtext{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-ob__graph{display:flex;flex-direction:column;gap:10px;min-height:0}
.pmh-ob__graphleiste{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pmh-ob__graphstand{margin-left:auto;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.45)}
.pmh-ob__waehler{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 16px 0;padding:10px 12px;border:1px solid rgba(180,170,230,.2);border-radius:10px;background:rgba(18,16,30,.55)}
.pmh-ob__waehler label{font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.55)}
.pmh-ob__waehler input{flex:1;min-width:220px;border:1px solid rgba(180,170,230,.2);border-radius:8px;background:rgba(8,8,14,.65);color:#eceef8;padding:6px 9px;font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
.pmh-ob__waehler input:focus{border-color:rgba(190,170,255,.55)}
.pmh-ob__canvas{width:100%;height:470px;max-height:58vh;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:radial-gradient(120% 100% at 50% 0%,#0d0f1c 0%,#07080d 70%);cursor:grab;touch-action:none}
.pmh-ob__canvas:active{cursor:grabbing}
.pmh-ob__graphsuche{flex:1;min-width:120px;max-width:260px;border:1px solid rgba(180,170,230,.18);border-radius:8px;background:rgba(10,10,18,.5);color:#eceef8;padding:5px 8px;font:11px/1.3 "Segoe UI", system-ui, sans-serif;outline:none}
.pmh-ob__graphsuche:focus{border-color:rgba(190,170,255,.55)}.pmh-ob__verweise{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:4px}
.pmh-ob__verweise h4{margin:0 0 6px;font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.55);display:flex;gap:6px;align-items:baseline}
.pmh-ob__verweise ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:180px;overflow:auto}
.pmh-ob__verweise button{appearance:none;border:0;background:transparent;color:#c9b8ff;text-align:left;padding:2px 0;cursor:pointer;font:12px/1.4 "Segoe UI", system-ui, sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
.pmh-ob__verweise button:hover{color:#f2f0ff;text-decoration:underline}
.pmh-ob__zahl{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.35)}
@media (max-width:760px){
  .pmh-ob__body{grid-template-columns:1fr}
  .pmh-ob__list{border-right:0;border-bottom:1px solid rgba(255,255,255,.06);max-height:42vh}
  .pmh-ob__state{display:none}
  .pmh-ob__pfad{max-width:100%;margin-left:0}
  .pmh-ob__stats{flex-wrap:wrap;gap:12px 18px}
}
`
