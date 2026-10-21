/**
 * **Git als eigenes Plugin — die Überprüfungsansicht.**
 *
 * Der Betreiber hat die Ansicht des alten Werkzeugs gezeigt (21.10.2026): ein Umschalter
 * **Git changes · Branch changes · Änderungen der letzten Runde**, darunter Dateien mit Status und
 * `+/−`, aufklappbare Diffs, „Vereinheitlicht / Geteilt" und „Alle erweitern". Genau das ist dieses
 * Panel — gruppiert nach **Workspaces**, weil die Projektliste des Hosts die einzige ist, die
 * stimmt.
 *
 * ## Was hier gerechnet wird — und was nicht
 *
 * Nichts. Das Panel liest vier Routen (`/stand`, `/diff`, `/aktion`, `/fern`) und zeigt, was sie
 * sagen. Die Zahlen, die Modi und die Diffs entstehen auf dem Host: `src/repo.ts` fragt git,
 * `src/vertrag.ts` liest die Antworten. Eine zweite Rechnung im Browser wäre eine zweite Wahrheit.
 *
 * ## Warum die Typen hier noch einmal stehen
 *
 * Die Browser-Hälfte darf `src/server.ts` nicht importieren — das zöge `node:http` und den
 * git-Aufrufer in das Bündel. Die Schnittstelle ist deshalb ein eigener, schmaler Spiegel; die
 * Felder sind dieselben, und ein Bruch fällt beim ersten Aufruf auf, nicht beim Übersetzen.
 *
 * @module @prometheus-harness/git
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { DE, EN } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    git: keyof typeof DE
  }
}

/** Die Kennung im main-Slot und in der Seitenleiste. */
export const PANEL_ID = 'git'

/** Die Kennung des Tab-Typs in der rechten Leiste. */
export const TAB_ID = '@prometheus-harness/git'

/** Der Tab-Typ; ein eigener Name nimmt niemandem seinen Tab weg. */
export const TAB_KIND = 'pmh-git'

/** Der Namensraum der Texte. */
const NS = 'git'

/** Der Weg zum Stand — dieselbe Adresse wie in `src/server.ts`. */
const WEG_STAND = '/api/pmh/git/stand'

/** Der Weg zu einem Diff. */
const WEG_DIFF = '/api/pmh/git/diff'

/** Der Weg zu einer Aktion. */
const WEG_AKTION = '/api/pmh/git/aktion'

/** Der Weg zu Pull Requests und Issues. */
const WEG_FERN = '/api/pmh/git/fern'

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'sidebarRightTabs']

/** Die drei Modi der Überprüfung. */
type Modus = 'arbeitsbaum' | 'zweig' | 'letzte-runde'

/** Die Modi in Anzeigereihenfolge. */
const MODI: readonly Modus[] = ['arbeitsbaum', 'zweig', 'letzte-runde']

/** Der Zustand einer Datei. */
type Dateistatus =
  | 'hinzugefuegt'
  | 'geaendert'
  | 'geloescht'
  | 'umbenannt'
  | 'kopiert'
  | 'typwechsel'
  | 'konflikt'
  | 'unversioniert'
  | 'unbekannt'

/** Eine Zeile der Überprüfungsliste. */
interface Aenderung {
  readonly pfad: string
  readonly altpfad?: string
  readonly status: Dateistatus
  readonly bereich: 'index' | 'werk' | 'unversioniert' | 'zweig' | 'runde'
  readonly zusatz: number | null
  readonly abzug: number | null
  readonly binaer: boolean
}

/** Ein Commit der kurzen Liste. */
interface Commit {
  readonly hash: string
  readonly voll: string
  readonly autor: string
  readonly zeit: string
  readonly betreff: string
}

/** Ein Remote. */
interface Remote {
  readonly name: string
  readonly url: string
  readonly anbieter: string
  readonly host: string
  readonly eigner: string | null
  readonly repo: string | null
  readonly webUrl: string | null
}

/** Der Repostand eines Workspaces. */
interface Repostand {
  readonly wurzel: string
  readonly zweig: {
    readonly name: string | null
    readonly kopf: string | null
    readonly upstream: string | null
    readonly voraus: number
    readonly zurueck: number
  }
  readonly aenderungen: readonly Aenderung[]
  /** Wie viele Änderungen es insgesamt gibt — die Liste kann gekürzt sein. */
  readonly aenderungenGesamt: number
  /** Ob die Liste auf dem Host gekürzt wurde. */
  readonly gekuerzt: boolean
  readonly commits: readonly Commit[]
  readonly remotes: readonly Remote[]
  readonly basis: string | null
  readonly hinweis?: string
}

/** Ein Workspace mit Repostand. */
interface Workspacestand {
  readonly id: string
  readonly titel: string
  readonly pfad: string
  readonly modus: Modus
  readonly repo: Repostand | null
  readonly hinweis?: string
}

/** Die Antwort von `GET /stand`. */
interface Standantwort {
  readonly gelesenAm: string
  readonly workspaces: readonly Workspacestand[]
}

/** Eine Zeile eines Diffs. */
interface Diffzeile {
  readonly art: 'kopf' | 'meta' | 'kontext' | 'plus' | 'minus'
  readonly text: string
  readonly alt: number | null
  readonly neu: number | null
}

/** Ein Hunk. */
interface Hunk {
  readonly kopf: string
  readonly zeilen: readonly Diffzeile[]
}

/** Ein Diff einer Datei. */
interface Dateidiff {
  readonly binaer: boolean
  readonly abgeschnitten: boolean
  readonly hunks: readonly Hunk[]
  readonly hinweis?: string
}

/** Ein Eintrag aus der Cloud. */
interface Fernposten {
  readonly nummer: number
  readonly titel: string
  readonly url: string
  readonly art: 'pull' | 'issue'
  readonly zustand: string
  readonly autor: string
  readonly aktualisiert: string
}

/** Was die Cloud zu einem Repository sagt. */
interface Fernstand {
  readonly anbieter: string
  readonly eigner: string | null
  readonly repo: string | null
  readonly pulls: readonly Fernposten[]
  readonly issues: readonly Fernposten[]
  readonly hinweis?: string
}

/** Wie die Diffs dargestellt werden. */
type Ansicht = 'unified' | 'split'

/**
 * Der Schlüssel einer aufgeklappten Datei.
 *
 * **Warum nicht nur der Pfad.** Dieselbe Datei kann im Index und im Arbeitsbaum stehen; zwei
 * Zustände brauchen zwei Schlüssel.
 *
 * @param workspace - die Kennung des Workspaces
 * @param aenderung - die Änderung
 * @returns der Schlüssel
 */
function schluessel(workspace: string, aenderung: Aenderung): string {
  return `${workspace}|${aenderung.bereich}|${aenderung.pfad}`
}

/**
 * Formt eine Zeilenzahl.
 *
 * @param wert - die Zahl oder `null`
 * @returns der Text; `·` für unbekannt
 */
function zahl(wert: number | null): string {
  return wert === null ? '·' : String(wert)
}

/**
 * Übersetzt einen Dateistatus.
 *
 * @param status - der Status
 * @param t - der Übersetzer
 * @returns das Wort
 */
function statuswort(status: Dateistatus, t: TranslateNS<'git'>): string {
  switch (status) {
    case 'hinzugefuegt':
      return t('added')
    case 'geaendert':
      return t('modified')
    case 'geloescht':
      return t('deleted')
    case 'umbenannt':
      return t('renamed')
    case 'kopiert':
      return t('copied')
    case 'typwechsel':
      return t('typechange')
    case 'konflikt':
      return t('conflict')
    case 'unversioniert':
      return t('untracked')
    default:
      return t('unknown')
  }
}

/**
 * Die Farbklasse eines Status.
 *
 * @param status - der Status
 * @returns der Zusatz für die CSS-Klasse
 */
function statusklasse(status: Dateistatus): string {
  if (status === 'hinzugefuegt' || status === 'unversioniert') return 'is-neu'
  if (status === 'geloescht') return 'is-weg'
  if (status === 'konflikt') return 'is-konflikt'
  if (status === 'umbenannt' || status === 'kopiert') return 'is-verschoben'
  return 'is-geaendert'
}

/**
 * Ein Kürzel für die Dateiart — das kleine Quadrat vor dem Pfad.
 *
 * **Warum ein Kürzel und kein Icon-Satz.** Ein Icon-Paket für jede Sprache wäre eine Abhängigkeit
 * und ein Wartungsversprechen. Drei Buchstaben sagen dasselbe und kosten nichts.
 *
 * @param pfad - der Pfad
 * @returns das Kürzel
 */
function kuerzel(pfad: string): string {
  const name = pfad.split('/').pop() ?? pfad
  const punkt = name.lastIndexOf('.')
  if (punkt <= 0) return name.slice(0, 2).toUpperCase()
  const endung = name.slice(punkt + 1).toLowerCase()
  const karte: Record<string, string> = {
    ts: 'TS',
    tsx: 'TS',
    mts: 'TS',
    js: 'JS',
    jsx: 'JS',
    mjs: 'JS',
    json: '{}',
    md: 'MD',
    go: 'GO',
    rs: 'RS',
    py: 'PY',
    css: '{}',
    scss: '{}',
    html: '<>',
    svg: '<>',
    yml: 'YML',
    yaml: 'YML',
    toml: 'TML',
    lock: 'LCK',
    txt: 'TXT',
    png: 'IMG',
    jpg: 'IMG',
    jpeg: 'IMG',
    webp: 'IMG',
    gif: 'IMG',
    sh: 'SH',
    ps1: 'PS',
  }
  return karte[endung] ?? endung.slice(0, 3).toUpperCase()
}

/**
 * Ein Farbton je Dateiart — dieselbe Datei hat überall dieselbe Farbe.
 *
 * @param pfad - der Pfad
 * @returns einer von sechs Zusätzen
 */
function farbton(pfad: string): string {
  let summe = 0
  for (const zeichen of pfad) summe = (summe + zeichen.codePointAt(0)!) % 6
  return ['a', 'b', 'c', 'd', 'e', 'f'][summe] ?? 'a'
}

/**
 * Paart Zeilen für die geteilte Ansicht.
 *
 * **Warum gepaart und nicht zwei Spalten unabhängig.** Zwei Spalten ohne Paarung laufen
 * auseinander, sobald eine Seite mehr Zeilen hat; der Blick findet nichts wieder. Ein Block aus
 * Minus-Zeilen steht deshalb neben dem Block aus Plus-Zeilen, Zeile für Zeile.
 *
 * @param hunk - der Hunk
 * @returns die Paare; eine Seite darf `null` sein
 */
function paare(hunk: Hunk): { readonly links: Diffzeile | null; readonly rechts: Diffzeile | null }[] {
  const aus: { links: Diffzeile | null; rechts: Diffzeile | null }[] = []
  const zeilen = hunk.zeilen
  let i = 0
  while (i < zeilen.length) {
    const zeile = zeilen[i]
    if (zeile === undefined) break
    if (zeile.art === 'kontext') {
      aus.push({ links: zeile, rechts: zeile })
      i += 1
      continue
    }
    const minus: Diffzeile[] = []
    while (i < zeilen.length && zeilen[i]?.art === 'minus') {
      const wert = zeilen[i]
      if (wert !== undefined) minus.push(wert)
      i += 1
    }
    const plus: Diffzeile[] = []
    while (i < zeilen.length && zeilen[i]?.art === 'plus') {
      const wert = zeilen[i]
      if (wert !== undefined) plus.push(wert)
      i += 1
    }
    const anzahl = Math.max(minus.length, plus.length)
    for (let k = 0; k < anzahl; k += 1) {
      aus.push({ links: minus[k] ?? null, rechts: plus[k] ?? null })
    }
    if (anzahl === 0) i += 1
  }
  return aus
}

/** Ein kleines Abzweig-Symbol für die Seitenleiste. */
function GitIcon({ size = 16 }: { readonly size?: number }): ReactElement {
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
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="6" cy="18" r="2.3" />
      <circle cx="18" cy="9" r="2.3" />
      <path d="M6 8.3v7.4" />
      <path d="M8.3 6h3.1a2 2 0 0 1 2 2v.7" />
      <path d="M15.7 9h-1.9" />
      <path d="M8.3 18h3.1a2 2 0 0 0 2-2v-4.7" />
    </svg>
  )
}

/** Die Eigenschaften des Panels. */
interface Props {
  /** Schließt das Haupt-Panel; in der rechten Leiste fehlt er. */
  readonly close?: () => void
  readonly t: TranslateNS<'git'>
}

/** Was eine Karte von außen bekommt. */
interface Kartenprops {
  readonly ws: Workspacestand
  /** Ob die schmale Leiste zeigt — dort fallen die Nebenspalten weg. */
  readonly schmal: boolean
  /** Ob der Kopf Titel und Pfad trägt; bei mehreren Workspaces steht der Name im Auswahlfeld. */
  readonly mitKopf: boolean
  readonly offen: readonly string[]
  readonly diffs: Readonly<Record<string, Dateidiff>>
  readonly ladend: readonly string[]
  readonly ansicht: Ansicht
  readonly nachricht: string
  readonly arbeitet: string | null
  readonly fern: Fernstand | undefined
  readonly fernLaden: boolean
  readonly onOeffne: (ws: Workspacestand, aenderung: Aenderung) => void
  readonly onAktion: (ws: Workspacestand, aktion: string, extra?: Record<string, unknown>) => void
  readonly onFern: (ws: Workspacestand) => void
  readonly onNachricht: (ws: Workspacestand, text: string) => void
  readonly t: TranslateNS<'git'>
}

/** Eine Karte für den gewählten Workspace. */
function Workspacekarte({
  ws,
  schmal,
  mitKopf,
  offen,
  diffs,
  ladend,
  ansicht,
  nachricht,
  arbeitet,
  fern,
  fernLaden,
  onOeffne,
  onAktion,
  onFern,
  onNachricht,
  t,
}: Kartenprops): ReactElement {
  const repo = ws.repo
  const busy = arbeitet === ws.id
  return (
    <section className="pmh-git__karte">
      <header className="pmh-git__kopf">
        <div className="pmh-git__kopftext">
          {mitKopf ? <h3 className="pmh-git__titel">{ws.titel}</h3> : null}
          <span className="pmh-git__pfad" title={ws.pfad}>
            {repo?.wurzel ?? ws.pfad}
          </span>
        </div>
        {repo !== null && (
          <div className="pmh-git__zweig">
            <span className="pmh-git__chip" title={repo.basis === null ? undefined : `${t('basis')}: ${repo.basis}`}>
              {repo.zweig.name ?? 'HEAD'}
            </span>
            {repo.zweig.voraus > 0 && (
              <span className="pmh-git__ab" title={`${String(repo.zweig.voraus)} ${t('ahead')}`}>
                ↑{repo.zweig.voraus}
              </span>
            )}
            {repo.zweig.zurueck > 0 && (
              <span className="pmh-git__ab is-zurueck" title={`${String(repo.zweig.zurueck)} ${t('behind')}`}>
                ↓{repo.zweig.zurueck}
              </span>
            )}
            <span className={`pmh-git__zustand${repo.aenderungenGesamt === 0 ? ' is-sauber' : ''}`}>
              {repo.aenderungenGesamt === 0
                ? t('clean')
                : `${String(repo.aenderungenGesamt)} ${t('changed')}`}
            </span>
          </div>
        )}
      </header>

      {ws.hinweis !== undefined && <p className="pmh-git__leer">{ws.hinweis}</p>}
      {repo === null && ws.hinweis === undefined && <p className="pmh-git__leer">{t('noRepo')}</p>}

      {repo !== null && (
        <>
          <div className="pmh-git__liste">
            {repo.aenderungen.length === 0 && <p className="pmh-git__leer">{t('noChanges')}</p>}
            {repo.aenderungen.map((aenderung) => {
              const key = schluessel(ws.id, aenderung)
              const istOffen = offen.includes(key)
              const diff = diffs[key]
              const laedt = ladend.includes(key)
              return (
                <div key={key} className="pmh-git__datei">
                  <button
                    type="button"
                    className={`pmh-git__zeile${istOffen ? ' is-offen' : ''}`}
                    onClick={() => onOeffne(ws, aenderung)}
                    title={aenderung.altpfad === undefined ? aenderung.pfad : `${aenderung.altpfad} → ${aenderung.pfad}`}
                  >
                    <span className={`pmh-git__kuerzel pmh-git__kuerzel--${farbton(aenderung.pfad)}`}>
                      {kuerzel(aenderung.pfad)}
                    </span>
                    <span className="pmh-git__dateipfad">
                      {aenderung.pfad}
                      {aenderung.altpfad !== undefined && (
                        <em className="pmh-git__alt"> ← {aenderung.altpfad}</em>
                      )}
                    </span>
                    <span className={`pmh-git__status ${statusklasse(aenderung.status)}`}>
                      {statuswort(aenderung.status, t)}
                    </span>
                    <span className="pmh-git__zahlen">
                      <b className="is-plus">+{zahl(aenderung.zusatz)}</b>
                      <i className="is-minus">−{zahl(aenderung.abzug)}</i>
                    </span>
                    <span className={`pmh-git__pfeil${istOffen ? ' is-offen' : ''}`} aria-hidden="true">
                      ›
                    </span>
                  </button>
                  {istOffen && (
                    <div className="pmh-git__diff">
                      {laedt && <p className="pmh-git__leer">{t('loadingDiff')}</p>}
                      {!laedt && diff === undefined && <p className="pmh-git__leer">{t('diffError')}</p>}
                      {!laedt && diff !== undefined && <Diffblock diff={diff} ansicht={ansicht} t={t} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {repo.hinweis !== undefined && <p className="pmh-git__hinweis">{repo.hinweis}</p>}
          {repo.gekuerzt && (
            <p className="pmh-git__hinweis">
              {t('truncatedList')} — {String(repo.aenderungen.length)} / {String(repo.aenderungenGesamt)}
            </p>
          )}

          {!schmal && (
            <div className="pmh-git__spalten">
              <div className="pmh-git__spalte">
                <h4 className="pmh-git__ueberschrift">{t('commits')}</h4>
                {repo.commits.length === 0 && <p className="pmh-git__leer">{t('noChanges')}</p>}
                <ul className="pmh-git__commits">
                  {repo.commits.slice(0, 5).map((commit) => (
                    <li key={commit.voll}>
                      <code>{commit.hash}</code>
                      <span className="pmh-git__betreff">{commit.betreff}</span>
                      <span className="pmh-git__autor">{commit.autor}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pmh-git__spalte">
                <h4 className="pmh-git__ueberschrift">{t('remote')}</h4>
                {repo.remotes.length === 0 && <p className="pmh-git__leer">{t('noRepo')}</p>}
                {repo.remotes.map((remote) => (
                  <div key={remote.name} className="pmh-git__remote">
                    <span className="pmh-git__anbieter">{remote.anbieter === 'unbekannt' ? t('providerUnknown') : remote.anbieter}</span>
                    <span className="pmh-git__remotename">{remote.name}</span>
                    {remote.webUrl !== null ? (
                      <a className="pmh-git__link" href={remote.webUrl} target="_blank" rel="noreferrer">
                        {remote.eigner ?? ''}/{remote.repo ?? ''}
                      </a>
                    ) : (
                      <span className="pmh-git__remotepfad">{remote.host === '' ? remote.url : `${remote.host}/${remote.repo ?? ''}`}</span>
                    )}
                  </div>
                ))}
                {repo.remotes.length > 0 && (
                  <button type="button" className="pmh-git__btn pmh-git__btn--cloud" onClick={() => onFern(ws)} disabled={fernLaden}>
                    {fernLaden ? t('cloudLoading') : t('cloud')}
                  </button>
                )}
                {fern !== undefined && <Fernblock fern={fern} t={t} />}
              </div>
            </div>
          )}

          <div className="pmh-git__aktionen">
            <h4 className="pmh-git__ueberschrift">{t('actions')}</h4>
            <div className="pmh-git__aktionszeile">
              <button type="button" className="pmh-git__btn" onClick={() => onAktion(ws, 'stage')} disabled={busy}>
                {t('stage')}
              </button>
              <button type="button" className="pmh-git__btn" onClick={() => onAktion(ws, 'fetch')} disabled={busy}>
                {t('fetch')}
              </button>
              <button type="button" className="pmh-git__btn" onClick={() => onAktion(ws, 'pull')} disabled={busy}>
                {t('pull')}
              </button>
              <button type="button" className="pmh-git__btn" onClick={() => onAktion(ws, 'push')} disabled={busy}>
                {t('push')}
              </button>
            </div>
            <div className="pmh-git__commit">
              <input
                className="pmh-git__feld"
                value={nachricht}
                placeholder={t('commitPlaceholder')}
                onChange={(ereignis) => onNachricht(ws, ereignis.target.value)}
                onKeyDown={(ereignis) => {
                  if (ereignis.key === 'Enter' && !ereignis.shiftKey) {
                    ereignis.preventDefault()
                    onAktion(ws, 'commit', { nachricht })
                  }
                }}
              />
              <button
                type="button"
                className="pmh-git__btn pmh-git__btn--stark"
                onClick={() => onAktion(ws, 'commit', { nachricht })}
                disabled={busy || nachricht.trim() === ''}
              >
                {t('commit')}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/** Pull Requests und Issues einer Karte. */
function Fernblock({ fern, t }: { readonly fern: Fernstand; readonly t: TranslateNS<'git'> }): ReactElement {
  return (
    <div className="pmh-git__fern">
      {fern.hinweis !== undefined && <p className="pmh-git__leer">{fern.hinweis}</p>}
      {fern.pulls.length > 0 && (
        <>
          <h5 className="pmh-git__ueberschrift">{t('pulls')}</h5>
          <ul className="pmh-git__fernliste">
            {fern.pulls.map((posten) => (
              <li key={`p${String(posten.nummer)}`}>
                <a href={posten.url} target="_blank" rel="noreferrer">
                  #{posten.nummer} {posten.titel}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      {fern.issues.length > 0 && (
        <>
          <h5 className="pmh-git__ueberschrift">{t('issues')}</h5>
          <ul className="pmh-git__fernliste">
            {fern.issues.map((posten) => (
              <li key={`i${String(posten.nummer)}`}>
                <a href={posten.url} target="_blank" rel="noreferrer">
                  #{posten.nummer} {posten.titel}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="pmh-git__klein">{t('cloudHint')}</p>
    </div>
  )
}

/** Der Diff einer Datei. */
function Diffblock({
  diff,
  ansicht,
  t,
}: {
  readonly diff: Dateidiff
  readonly ansicht: Ansicht
  readonly t: TranslateNS<'git'>
}): ReactElement {
  if (diff.hinweis !== undefined && diff.hunks.length === 0) {
    return <p className="pmh-git__leer">{diff.hinweis}</p>
  }
  if (diff.binaer) return <p className="pmh-git__leer">{t('binary')}</p>
  if (diff.hunks.length === 0) return <p className="pmh-git__leer">{t('noChanges')}</p>

  return (
    <div className="pmh-git__diffrumpf">
      {diff.abgeschnitten && <p className="pmh-git__hinweis">{t('truncated')}</p>}
      {diff.hunks.map((hunk, hunkIndex) => (
        <div key={`${String(hunkIndex)}-${hunk.kopf}`} className="pmh-git__hunk">
          <div className="pmh-git__hunkkopf">{hunk.kopf}</div>
          {ansicht === 'unified'
            ? hunk.zeilen.map((zeile, index) => (
                <div key={String(index)} className={`pmh-git__dzeile is-${zeile.art}`}>
                  <span className="pmh-git__nr">{zeile.alt === null ? '' : String(zeile.alt)}</span>
                  <span className="pmh-git__nr">{zeile.neu === null ? '' : String(zeile.neu)}</span>
                  <span className="pmh-git__zeichen">{zeile.art === 'plus' ? '+' : zeile.art === 'minus' ? '−' : ' '}</span>
                  <span className="pmh-git__dtext">{zeile.text}</span>
                </div>
              ))
            : paare(hunk).map((paar, index) => (
                <div key={String(index)} className="pmh-git__paar">
                  <div className={`pmh-git__seite${paar.links?.art === 'minus' ? ' is-minus' : ''}`}>
                    <span className="pmh-git__nr">{paar.links?.alt === null || paar.links === null ? '' : String(paar.links.alt)}</span>
                    <span className="pmh-git__dtext">{paar.links?.text ?? ''}</span>
                  </div>
                  <div className={`pmh-git__seite${paar.rechts?.art === 'plus' ? ' is-plus' : ''}`}>
                    <span className="pmh-git__nr">{paar.rechts?.neu === null || paar.rechts === null ? '' : String(paar.rechts.neu)}</span>
                    <span className="pmh-git__dtext">{paar.rechts?.text ?? ''}</span>
                  </div>
                </div>
              ))}
        </div>
      ))}
    </div>
  )
}

/** Das Panel. */
export function GitPanel({ close, t }: Props): ReactElement {
  const [stand, setStand] = useState<Standantwort | null>(null)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [neu, setNeu] = useState(0)
  const [modus, setModus] = useState<Modus>('arbeitsbaum')
  const [ansicht, setAnsicht] = useState<Ansicht>('unified')
  const [offen, setOffen] = useState<readonly string[]>([])
  const [diffs, setDiffs] = useState<Record<string, Dateidiff>>({})
  const [ladend, setLadend] = useState<readonly string[]>([])
  const [nachrichten, setNachrichten] = useState<Record<string, string>>({})
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null)
  const [arbeitet, setArbeitet] = useState<string | null>(null)
  const [fern, setFern] = useState<Record<string, Fernstand>>({})
  const [fernLaden, setFernLaden] = useState<readonly string[]>([])

  /**
   * Welcher Workspace gezeigt wird.
   *
   * **Warum nur einer.** Mit zwei Workspaces standen zwei Karten untereinander, und die zweite
   * begann erst nach der ersten — bei 2925 Dateien sieht man den zweiten nie. Der Betreiber
   * (21.10.2026): *„das sollte smart sein … und wenn es 2 anzeigen sollten wir moderne dropdown
   * machen"*. Also: eine Auswahl, eine Ansicht.
   */
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)

  /** Gemessene Breite — die schmale Leiste sieht anders aus als das Hauptfeld. */
  const [breite, setBreite] = useState(1000)
  const rahmen = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = rahmen.current
    if (element === null) return
    const beobachter = new ResizeObserver((eintraege) => {
      const erster = eintraege[0]
      if (erster !== undefined) setBreite(erster.contentRect.width)
    })
    beobachter.observe(element)
    return () => {
      beobachter.disconnect()
    }
  }, [])

  /** Unter dieser Breite ist es die rechte Leiste, nicht das Hauptfeld. */
  const schmal = breite < 520

  /**
   * Wählt beim ersten Laden den Workspace mit Repository.
   *
   * **Warum der mit Repository.** „OBS" ohne Repository ist der uninteressantere Eintrag; wer das
   * Panel öffnet, will Änderungen sehen. Die Auswahl bleibt danach stehen, auch über ein
   * „Aktualisieren" hinweg — bis der Nutzer selbst wechselt.
   */
  useEffect(() => {
    if (stand === null) return
    const liste = stand.workspaces
    if (liste.length === 0) {
      setGewaehlt(null)
      return
    }
    if (gewaehlt !== null && liste.some((eintrag) => eintrag.id === gewaehlt)) return
    const mitRepo = liste.find((eintrag) => eintrag.repo !== null)
    setGewaehlt(mitRepo?.id ?? liste[0]?.id ?? null)
  }, [stand, gewaehlt])

  useEffect(() => {
    let ab = false
    setLaden(true)
    setFehler(null)
    setDiffs({})
    setOffen([])
    fetch(`${WEG_STAND}?modus=${modus}`, { headers: { accept: 'application/json' } })
      .then(async (antwort) => {
        if (!antwort.ok) {
          const text = await antwort.text()
          throw new Error(text === '' ? `HTTP ${String(antwort.status)}` : text)
        }
        return (await antwort.json()) as Standantwort
      })
      .then((daten) => {
        if (!ab) setStand(daten)
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
  }, [modus, neu])

  const ladeDiff = useCallback(
    async (ws: Workspacestand, aenderung: Aenderung): Promise<void> => {
      const key = schluessel(ws.id, aenderung)
      setLadend((alt) => (alt.includes(key) ? alt : [...alt, key]))
      try {
        const frage = new URLSearchParams({
          workspace: ws.id,
          modus,
          pfad: aenderung.pfad,
          bereich: aenderung.bereich,
        })
        if (ws.repo?.basis != null) frage.set('basis', ws.repo.basis)
        const antwort = await fetch(`${WEG_DIFF}?${frage.toString()}`, { headers: { accept: 'application/json' } })
        if (!antwort.ok) throw new Error(`HTTP ${String(antwort.status)}`)
        const daten = (await antwort.json()) as { diff: Dateidiff }
        setDiffs((alt) => ({ ...alt, [key]: daten.diff }))
      } catch (problem) {
        setDiffs((alt) => ({
          ...alt,
          [key]: {
            binaer: false,
            abgeschnitten: false,
            hunks: [],
            hinweis: problem instanceof Error ? problem.message : String(problem),
          },
        }))
      } finally {
        setLadend((alt) => alt.filter((eintrag) => eintrag !== key))
      }
    },
    [modus],
  )

  const oeffne = useCallback(
    (ws: Workspacestand, aenderung: Aenderung): void => {
      const key = schluessel(ws.id, aenderung)
      if (offen.includes(key)) {
        setOffen(offen.filter((eintrag) => eintrag !== key))
        return
      }
      setOffen([...offen, key])
      if (diffs[key] === undefined) void ladeDiff(ws, aenderung)
    },
    [offen, diffs, ladeDiff],
  )

  const alleErweitern = useCallback((): void => {
    const alle = (stand?.workspaces ?? []).flatMap((ws) =>
      (ws.repo?.aenderungen ?? []).map((aenderung) => ({ ws, aenderung })),
    )
    const begrenzt = alle.slice(0, 20)
    if (alle.length > 20) setMeldung({ art: 'ok', text: t('onlyTwenty') })
    const zuOeffnen = begrenzt.filter((eintrag) => !offen.includes(schluessel(eintrag.ws.id, eintrag.aenderung)))
    if (zuOeffnen.length === 0) {
      setOffen([])
      return
    }
    setOffen([...offen, ...zuOeffnen.map((eintrag) => schluessel(eintrag.ws.id, eintrag.aenderung))])
    for (const eintrag of zuOeffnen) {
      if (diffs[schluessel(eintrag.ws.id, eintrag.aenderung)] === undefined) void ladeDiff(eintrag.ws, eintrag.aenderung)
    }
  }, [stand, offen, diffs, ladeDiff, t])

  const aktion = useCallback(
    async (ws: Workspacestand, name: string, extra?: Record<string, unknown>): Promise<void> => {
      setArbeitet(ws.id)
      setMeldung(null)
      try {
        const antwort = await fetch(WEG_AKTION, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ workspace: ws.id, aktion: name, ...extra }),
        })
        const daten = (await antwort.json()) as {
          ok?: boolean
          ausgabe?: string
          fehler?: string
          repo?: Repostand
        }
        if (daten.repo !== undefined) {
          setStand((alt) =>
            alt === null
              ? alt
              : {
                  ...alt,
                  workspaces: alt.workspaces.map((eintrag) =>
                    eintrag.id === ws.id ? { ...eintrag, repo: daten.repo ?? eintrag.repo } : eintrag,
                  ),
                },
          )
        }
        const ok = daten.ok === true && antwort.ok
        setMeldung({
          art: ok ? 'ok' : 'fehler',
          text: ok
            ? daten.ausgabe === undefined || daten.ausgabe === ''
              ? t('actionOk')
              : daten.ausgabe
            : (daten.fehler ?? `HTTP ${String(antwort.status)}`),
        })
        if (ok && name === 'commit') setNachrichten((alt) => ({ ...alt, [ws.id]: '' }))
      } catch (problem) {
        setMeldung({ art: 'fehler', text: problem instanceof Error ? problem.message : String(problem) })
      } finally {
        setArbeitet(null)
      }
    },
    [t],
  )

  const holeFern = useCallback(async (ws: Workspacestand): Promise<void> => {
    setFernLaden((alt) => (alt.includes(ws.id) ? alt : [...alt, ws.id]))
    try {
      const antwort = await fetch(`${WEG_FERN}?workspace=${encodeURIComponent(ws.id)}`, {
        headers: { accept: 'application/json' },
      })
      const daten = (await antwort.json()) as Fernstand
      setFern((alt) => ({ ...alt, [ws.id]: daten }))
    } catch (problem) {
      setFern((alt) => ({
        ...alt,
        [ws.id]: {
          anbieter: 'unbekannt',
          eigner: null,
          repo: null,
          pulls: [],
          issues: [],
          hinweis: problem instanceof Error ? problem.message : String(problem),
        },
      }))
    } finally {
      setFernLaden((alt) => alt.filter((eintrag) => eintrag !== ws.id))
    }
  }, [])

  const leer = stand !== null && stand.workspaces.length === 0
  const anzahl = stand?.workspaces.length ?? 0
  const gezeigt = (stand?.workspaces ?? []).find((eintrag) => eintrag.id === gewaehlt) ?? null

  return (
    <div className={`pmh-git${schmal ? ' is-schmal' : ''}`} ref={rahmen}>
      <header className="pmh-git__head">
        <div className="pmh-git__brand">
          <GitIcon size={schmal ? 16 : 20} />
          <div className="pmh-git__brandtext">
            {!schmal && <span className="pmh-git__kicker">GIT</span>}
            <h2 className="pmh-git__name">{t('title')}</h2>
          </div>
        </div>
        <div className="pmh-git__headaktionen">
          <span className={`pmh-git__dot${stand === null ? '' : ' is-on'}`} />
          <button type="button" className="pmh-git__btn" onClick={() => setNeu(neu + 1)} disabled={laden}>
            {t('refresh')}
          </button>
          {close !== undefined && (
            <button type="button" className="pmh-git__btn pmh-git__btn--ghost" onClick={close}>
              {t('close')}
            </button>
          )}
        </div>
      </header>

      <div className="pmh-git__bar">
        {anzahl > 1 && (
          <label className="pmh-git__waehler">
            <span className="pmh-git__waehlerlabel">{t('workspace')}</span>
            <span className="pmh-git__waehlerselect">
              <select
                value={gewaehlt ?? ''}
                onChange={(ereignis) => {
                  setGewaehlt(ereignis.target.value)
                  setOffen([])
                  setDiffs({})
                }}
              >
                {stand?.workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.titel}
                    {' · '}
                    {ws.repo === null
                      ? t('noRepoShort')
                      : `${ws.repo.zweig.name ?? 'HEAD'} · ${String(ws.repo.aenderungenGesamt)}`}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}
        <div className="pmh-git__segmente" role="tablist" aria-label={t('title')}>
          {MODI.map((wert) => (
            <button
              key={wert}
              type="button"
              role="tab"
              aria-selected={modus === wert}
              className={`pmh-git__segment${modus === wert ? ' is-aktiv' : ''}`}
              onClick={() => setModus(wert)}
            >
              {t(wert === 'arbeitsbaum' ? 'working' : wert === 'zweig' ? 'branch' : 'round')}
            </button>
          ))}
        </div>
        {!schmal && (
          <div className="pmh-git__ansichten">
            <button
              type="button"
              className={`pmh-git__segment${ansicht === 'unified' ? ' is-aktiv' : ''}`}
              onClick={() => setAnsicht('unified')}
            >
              {t('unified')}
            </button>
            <button
              type="button"
              className={`pmh-git__segment${ansicht === 'split' ? ' is-aktiv' : ''}`}
              onClick={() => setAnsicht('split')}
            >
              {t('split')}
            </button>
            <button type="button" className="pmh-git__segment" onClick={alleErweitern}>
              {t('expandAll')}
            </button>
          </div>
        )}
      </div>

      <div className="pmh-git__scroll">
        {fehler !== null && (
          <div className="pmh-git__fehler">
            <strong>{t('error')}</strong>
            <span>{fehler}</span>
            <button type="button" className="pmh-git__btn" onClick={() => setNeu(neu + 1)}>
              {t('retry')}
            </button>
          </div>
        )}

        {laden && stand === null && <p className="pmh-git__leer">{t('loading')}</p>}
        {leer && <p className="pmh-git__leer">{t('noWorkspaces')}</p>}

        {meldung !== null && (
          <div className={`pmh-git__meldung is-${meldung.art}`}>
            <b>{meldung.art === 'ok' ? t('actionOk') : t('actionFail')}</b>
            <span>{meldung.text}</span>
          </div>
        )}

        {gezeigt !== null && (
          <Workspacekarte
            ws={gezeigt}
            schmal={schmal}
            mitKopf={anzahl <= 1}
            offen={offen}
            diffs={diffs}
            ladend={ladend}
            ansicht={ansicht}
            nachricht={nachrichten[gezeigt.id] ?? ''}
            arbeitet={arbeitet}
            fern={fern[gezeigt.id]}
            fernLaden={fernLaden.includes(gezeigt.id)}
            onOeffne={oeffne}
            onAktion={(ziel, name, extra) => {
              void aktion(ziel, name, extra)
            }}
            onFern={(ziel) => {
              void holeFern(ziel)
            }}
            onNachricht={(ziel, text) => setNachrichten((alt) => ({ ...alt, [ziel.id]: text }))}
            t={t}
          />
        )}
      </div>

      <footer className="pmh-git__fuss">
        <span>
          <b>{t('files')}</b> {String(gezeigt?.repo?.aenderungenGesamt ?? 0)}
        </span>
        <span>{stand === null ? '' : new Date(stand.gelesenAm).toLocaleString()}</span>
      </footer>
    </div>
  )
}

/** Der Rumpf in der rechten Leiste — dasselbe Panel, ohne eigenen Schließen-Knopf. */
function GitTabBody({ t }: Props): ReactElement {
  return <GitPanel t={t} />
}

/** Der Titel im Tab-Chip. */
function GitTabTitle({ t }: Props): ReactElement {
  return <span className="pmh-git__chip">{t('panel')}</span>
}

/** Hängt Panel, Sidebar-Eintrag, Tab-Typ und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, 'de', DE), 'git: Texte de')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'git: Texte en')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhGit = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'git: Stil')

  const close = (): void => {
    ctx.layout.selectPanel(null)
  }

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register(
      { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ close }) },
      GitPanel,
    )
  })

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 14, label: () => t('panel'), locale: NS },
      GitIcon,
    ),
  )

  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        multiple: false,
        keepMounted: true,
        priority: 'extension',
        title: () => t('panel'),
        guide: [{ id: 'git', order: 37, title: () => t('panel'), description: () => t('guide') }],
      }),
    'git: Typ in der rechten Leiste',
  )

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, GitTabBody),
  )

  ctx.slots.inject('sidebar.right.pane.tab.title', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID, locale: NS }, GitTabTitle),
  )
}

const CSS = `
.pmh-git{
  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
  background:radial-gradient(120% 80% at 85% 0%,#131022 0%,#0b0a12 55%,#07070c 100%);
  color:#eceef8;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
}
.pmh-git__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 13px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-git__brand{display:flex;align-items:center;gap:11px;color:#b9a6f0}
.pmh-git__brandtext{display:flex;flex-direction:column;gap:1px}
.pmh-git__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(185,166,240,.55)}
.pmh-git__name{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f4f1fb}
.pmh-git__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#e7e2f7}
.pmh-git__headaktionen{display:flex;align-items:center;gap:9px;min-width:0}
.pmh-git__dot{width:6px;height:6px;border-radius:50%;background:#5b4f86;box-shadow:0 0 0 4px rgba(91,79,134,.12)}
.pmh-git__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
.pmh-git__bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.012)}
.pmh-git__segmente,.pmh-git__ansichten{display:flex;align-items:center;gap:2px;padding:2px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(0,0,0,.25)}
.pmh-git__segment{
  appearance:none;border:0;background:transparent;color:rgba(236,238,248,.55);
  padding:5px 10px;border-radius:7px;cursor:pointer;
  font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.02em;white-space:nowrap;
}
.pmh-git__segment:hover{color:#f0ecfb;background:rgba(255,255,255,.05)}
.pmh-git__segment.is-aktiv{background:rgba(150,127,224,.18);color:#efe9ff;box-shadow:inset 0 0 0 1px rgba(150,127,224,.35)}
.pmh-git__scroll{flex:1;min-height:0;overflow:auto;padding:14px 20px 26px}
.pmh-git__karte{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.022);margin-bottom:14px;overflow:hidden}
.pmh-git__kopf{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:13px 15px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018)}
.pmh-git__kopftext{display:flex;flex-direction:column;gap:2px;min-width:0}
.pmh-git__titel{margin:0;font-size:13.5px;font-weight:600;color:#f2eefc;letter-spacing:-.01em}
.pmh-git__pfad{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.38);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:58ch}
.pmh-git__zweig{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.pmh-git__ab{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
.pmh-git__ab.is-zurueck{color:#f0b48d}
.pmh-git__zustand{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.05em;text-transform:uppercase;color:#f0c98d;border:1px solid rgba(240,201,141,.24);background:rgba(240,201,141,.07);border-radius:999px;padding:3px 7px}
.pmh-git__zustand.is-sauber{color:#8fe3c6;border-color:rgba(105,214,163,.3);background:rgba(105,214,163,.07)}
.pmh-git__liste{padding:4px 0}
.pmh-git__datei{border-bottom:1px solid rgba(255,255,255,.035)}
.pmh-git__datei:last-child{border-bottom:0}
.pmh-git__zeile{
  display:grid;grid-template-columns:30px minmax(0,1fr) auto auto 14px;align-items:center;gap:9px;
  width:100%;padding:7px 14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;
}
.pmh-git__zeile:hover{background:rgba(255,255,255,.035)}
.pmh-git__zeile.is-offen{background:rgba(150,127,224,.07)}
.pmh-git__kuerzel{
  display:inline-flex;align-items:center;justify-content:center;width:24px;height:18px;border-radius:4px;
  font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.02em;
}
.pmh-git__kuerzel--a{background:rgba(80,140,220,.18);color:#9dc3f5}
.pmh-git__kuerzel--b{background:rgba(200,140,70,.18);color:#f0c08a}
.pmh-git__kuerzel--c{background:rgba(120,190,140,.16);color:#9ee0b5}
.pmh-git__kuerzel--d{background:rgba(180,120,200,.16);color:#dcb3ec}
.pmh-git__kuerzel--e{background:rgba(200,100,110,.16);color:#f2aab2}
.pmh-git__kuerzel--f{background:rgba(120,160,180,.16);color:#a9cfdd}
.pmh-git__dateipfad{font:11.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(240,242,250,.86);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-git__alt{font-style:normal;color:rgba(236,238,248,.34)}
.pmh-git__status{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.04em;white-space:nowrap}
.pmh-git__status.is-neu{color:#8fe3c6}
.pmh-git__status.is-weg{color:#f29b9b}
.pmh-git__status.is-geaendert{color:#f0c98d}
.pmh-git__status.is-verschoben{color:#a9c9f2}
.pmh-git__status.is-konflikt{color:#f2a06a}
.pmh-git__zahlen{display:flex;align-items:baseline;gap:6px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;white-space:nowrap}
.pmh-git__zahlen b{font-weight:600;color:#7fd8a8}
.pmh-git__zahlen i{font-style:normal;color:#ef9a9a}
.pmh-git__pfeil{color:rgba(236,238,248,.3);transition:transform .15s ease;display:inline-block}
.pmh-git__pfeil.is-offen{transform:rotate(90deg);color:#b9a6f0}
.pmh-git__diff{border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.28)}
.pmh-git__diffrumpf{max-height:420px;overflow:auto;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace}
.pmh-git__hunk{border-bottom:1px solid rgba(255,255,255,.04)}
.pmh-git__hunk:last-child{border-bottom:0}
.pmh-git__hunkkopf{padding:5px 12px;color:rgba(150,180,220,.75);background:rgba(80,120,180,.08)}
.pmh-git__dzeile,.pmh-git__paar{display:grid;grid-template-columns:44px 44px 14px minmax(0,1fr);align-items:baseline}
.pmh-git__dzeile.is-plus{background:rgba(70,160,110,.11)}
.pmh-git__dzeile.is-minus{background:rgba(190,80,90,.1)}
.pmh-git__nr{padding:0 6px;text-align:right;color:rgba(236,238,248,.26);user-select:none;font-size:10px}
.pmh-git__zeichen{color:rgba(236,238,248,.4);text-align:center}
.pmh-git__dtext{padding:0 12px 0 2px;white-space:pre-wrap;word-break:break-word;color:rgba(240,242,250,.82)}
.pmh-git__dzeile.is-plus .pmh-git__dtext{color:#b8ecc9}
.pmh-git__dzeile.is-minus .pmh-git__dtext{color:#f3bcbc}
.pmh-git__paar{grid-template-columns:1fr 1fr;gap:1px}
.pmh-git__seite{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:baseline;min-width:0}
.pmh-git__seite.is-plus{background:rgba(70,160,110,.11)}
.pmh-git__seite.is-minus{background:rgba(190,80,90,.1)}
.pmh-git__spalten{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:14px;padding:12px 15px;border-top:1px solid rgba(255,255,255,.05)}
.pmh-git__spalte{min-width:0}
.pmh-git__ueberschrift{margin:0 0 7px;font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,166,240,.72)}
.pmh-git__commits{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.pmh-git__commits li{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px;align-items:baseline}
.pmh-git__commits code{font:10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#b9a6f0}
.pmh-git__betreff{font:11px/1.4 "Segoe UI", system-ui, sans-serif;color:rgba(240,242,250,.78);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-git__autor{font:9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.3)}
.pmh-git__remote{display:flex;align-items:center;gap:7px;margin-bottom:6px;flex-wrap:wrap}
.pmh-git__anbieter{font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;color:#d9cdf7;border:1px solid rgba(150,127,224,.3);background:rgba(150,127,224,.09);border-radius:999px;padding:3px 6px}
.pmh-git__remotename{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.4)}
.pmh-git__link{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:#9dc3f5;text-decoration:none;overflow:hidden;text-overflow:ellipsis}
.pmh-git__link:hover{text-decoration:underline}
.pmh-git__remotepfad{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.45);overflow:hidden;text-overflow:ellipsis}
.pmh-git__fern{margin-top:9px;padding-top:9px;border-top:1px dashed rgba(255,255,255,.07)}
.pmh-git__fernliste{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:3px}
.pmh-git__fernliste a{font:10.5px/1.4 "Segoe UI", system-ui, sans-serif;color:#c9dcf7;text-decoration:none}
.pmh-git__fernliste a:hover{text-decoration:underline}
.pmh-git__aktionen{padding:12px 15px 14px;border-top:1px solid rgba(255,255,255,.05)}
.pmh-git__aktionszeile{display:flex;flex-wrap:wrap;gap:6px}
.pmh-git__commit{display:flex;gap:6px;margin-top:8px}
.pmh-git__feld{
  flex:1;min-width:0;border:1px solid rgba(185,166,240,.18);border-radius:8px;background:rgba(8,8,14,.7);
  color:#efeafc;padding:7px 9px;font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;
}
.pmh-git__feld:focus{border-color:rgba(185,166,240,.5);box-shadow:0 0 0 3px rgba(150,127,224,.09)}
.pmh-git__btn{
  appearance:none;border:1px solid rgba(185,166,240,.2);background:rgba(20,17,30,.6);color:#efeafc;
  border-radius:8px;padding:6px 11px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;
  transition:border-color .16s ease,background .16s ease;
}
.pmh-git__btn:hover:not(:disabled){border-color:rgba(185,166,240,.55);background:rgba(38,32,55,.8)}
.pmh-git__btn:disabled{opacity:.45;cursor:default}
.pmh-git__btn--ghost{border-color:transparent;background:transparent;color:rgba(236,238,248,.55)}
.pmh-git__btn--stark{border-color:rgba(150,127,224,.45);background:rgba(150,127,224,.18);color:#f2ecff}
.pmh-git__btn--cloud{margin-top:2px;width:fit-content}
.pmh-git__leer{margin:12px 15px;color:rgba(236,238,248,.4);font-size:12px}
.pmh-git__hinweis{margin:8px 15px;padding:7px 10px;border:1px solid rgba(240,201,141,.2);border-radius:8px;background:rgba(240,201,141,.06);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(246,238,222,.7)}
.pmh-git__klein{margin:8px 0 0;font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.3)}
.pmh-git__meldung{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin:0 0 12px;padding:9px 12px;border-radius:9px;font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace}
.pmh-git__meldung.is-ok{border:1px solid rgba(105,214,163,.24);background:rgba(105,214,163,.07);color:#c9f2e0}
.pmh-git__meldung.is-fehler{border:1px solid rgba(255,120,120,.26);background:rgba(60,20,30,.35);color:rgba(255,207,207,.9)}
.pmh-git__meldung span{flex:1 1 60%;min-width:0;white-space:pre-wrap}
.pmh-git__fehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;padding:15px 16px;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,207,207,.85);border:1px solid rgba(255,120,120,.26);border-radius:10px;background:rgba(60,20,30,.35)}
.pmh-git__fehler strong{font-weight:600;color:#ffdcdc;flex-basis:100%}
.pmh-git__fehler span{flex:1 1 auto;min-width:0;color:rgba(255,207,207,.8)}
.pmh-git__fuss{display:flex;justify-content:space-between;gap:12px;padding:9px 20px;border-top:1px solid rgba(255,255,255,.06);font:9.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.34)}
.pmh-git__fuss b{color:rgba(185,166,240,.65);font-weight:600;margin-right:4px}
@media (max-width:900px){
  .pmh-git__spalten{grid-template-columns:1fr}
  .pmh-git__pfad{max-width:32ch}
}
.pmh-git__waehler{display:flex;align-items:center;gap:7px;min-width:0}
.pmh-git__waehlerlabel{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,166,240,.55)}
.pmh-git__waehlerselect{position:relative;display:inline-flex;min-width:0;max-width:300px}
.pmh-git__waehlerselect::after{content:'';position:absolute;right:9px;top:50%;width:5px;height:5px;border-right:1px solid rgba(236,238,248,.5);border-bottom:1px solid rgba(236,238,248,.5);transform:translateY(-65%) rotate(45deg);pointer-events:none}
.pmh-git__waehlerselect select{appearance:none;-webkit-appearance:none;width:100%;min-width:0;border:1px solid rgba(185,166,240,.22);border-radius:9px;background:rgba(20,17,30,.75);color:#efeafc;padding:6px 26px 6px 10px;font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;outline:none}
.pmh-git__waehlerselect select:hover{border-color:rgba(185,166,240,.5)}
.pmh-git__waehlerselect select:focus{border-color:rgba(185,166,240,.6);box-shadow:0 0 0 3px rgba(150,127,224,.1)}
.pmh-git__waehlerselect option{background:#141120;color:#efeafc}
/* Die schmale Leiste ist nicht das Hauptfeld: weniger Kopf, kein Statuswort, keine Nebenspalten. */
.pmh-git.is-schmal .pmh-git__bar{gap:8px}
.pmh-git.is-schmal .pmh-git__waehler{flex:1 1 100%}
.pmh-git.is-schmal .pmh-git__waehlerselect{flex:1;max-width:none}
.pmh-git.is-schmal .pmh-git__segmente{flex:1 1 100%;overflow:auto;scrollbar-width:none}
.pmh-git.is-schmal .pmh-git__head{padding:12px 14px 10px}
.pmh-git.is-schmal .pmh-git__name{font-size:14px}
.pmh-git.is-schmal .pmh-git__scroll{padding:10px 12px 18px}
.pmh-git.is-schmal .pmh-git__kopf{flex-direction:column;align-items:flex-start;gap:6px}
.pmh-git.is-schmal .pmh-git__zeile{grid-template-columns:26px minmax(0,1fr) auto 14px}
.pmh-git.is-schmal .pmh-git__zahlen{display:none}
.pmh-git.is-schmal .pmh-git__status{display:none}
.pmh-git.is-schmal .pmh-git__dzeile{grid-template-columns:30px 30px 12px minmax(0,1fr)}
@media (max-width:560px){
  .pmh-git__head{padding:14px 16px 12px}
  .pmh-git__bar{padding:9px 16px}
  .pmh-git__scroll{padding:12px 16px 22px}
  .pmh-git__zeile{grid-template-columns:26px minmax(0,1fr) auto 14px}
  .pmh-git__zahlen{display:none}
}
`

