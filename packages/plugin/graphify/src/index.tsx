/**
 * **Graphify als eigenes Plugin — mit gezeichnetem Graphen, nicht nur als Liste.**
 *
 * Das Panel zeigt drei Dinge an einem Ort: die **Liste** der Knoten, den
 * **gezeichneten Ausschnitt** um den gewählten Knoten und seine **Daten** samt
 * Quelldatei. Welche der drei Flächen aufgehen, steht in den
 * Plugin-Einstellungen; die Vorgaben stehen in {@link liesAnsicht}.
 *
 * ## Warum ein Ausschnitt und nicht der ganze Graph
 *
 * 36 000 Knoten sind ein Datenbestand, kein Bild. Gezeichnet wird die
 * Nachbarschaft des gewählten Knotens; die Tiefe (1–3) und die Höchstzahl der
 * Knoten sind einstellbar, und was fehlt, steht sichtbar daneben. Der ganze
 * Graph bleibt über Suche und Hubs erreichbar.
 *
 * @module @prometheus-harness/graphify
 */

import { useEffect, useMemo, useState } from 'react'
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
import { GraphCanvas } from './graph-view.tsx'
import { DE } from './locales.ts'
import {
  baueGemeinschaften,
  baueIndex,
  farbeNachGruppe,
  hubs,
  LEERER_AUSSCHNITT,
  LEERER_INDEX,
  LEERE_GEMEINSCHAFTEN,
  liesAnsicht,
  schneideAusschnitt,
  schneideGesamt,
  schneideGruppe,
  type Ansicht,
  type DisplayConfig,
  type Ebene,
  type ViewGraph,
  type ViewNode,
} from './view.ts'

export type { DisplayConfig } from './view.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    graphify: keyof typeof DE
  }
}

/** Die Kennung im main-Slot und in der Seitenleiste. */
export const PANEL_ID = 'graphify'

/**
 * Der Eintrag im Profil — **zugleich der Schlüssel der Einstellungen**.
 *
 * Die Einstellungsseite eines Plugins speist sich aus der `Config` seines **Profil-Eintrags**,
 * nicht aus seinem Paketnamen. Der Wert steht deshalb als eigener Name da und nicht als Ableitung
 * aus `PANEL_ID`: derselbe Text, zwei Bedeutungen, und eine Bedeutung darf sich ändern, ohne die
 * andere mitzunehmen. Die Kennung selbst steht in `cordis.patch.yml`.
 */
export const ENTRY_ID = 'pmh-graphify'

/** Der Namensraum der Texte. */
const NS = 'graphify'

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'configForms']

/**
 * Die Form der Einstellungen, wie der Browser sie liest.
 *
 * **Warum hier eine eigene Schnittstelle steht.** Der konkrete Controller gehört der
 * Einstellungsseite; dieses Plugin braucht nur lesen und hören. Eine schmale Form hält die
 * Kopplung klein und macht jeden Test ohne Host möglich.
 */
export interface SettingsForm<T> {
  getSnapshot(): { readonly value: T | undefined }
  subscribe(listener: () => void): () => void
}

interface Status {
  readonly available: boolean
  readonly command: string
  readonly outDir: string
  readonly graphFile: string
  readonly nodes: number
  readonly edges: number
  readonly detail: string
  readonly error?: string
}

interface RunAntwort {
  readonly ok: boolean
  readonly exitCode?: number | null
  readonly output?: string
  readonly stderr?: string
  readonly error?: string
}

/** Das Ergebnis eines Installationsversuchs — die Form aus dem Provider. */
interface SetupErgebnis {
  readonly ok: boolean
  readonly method: string
  readonly command: string
  readonly output: string
  readonly error?: string
  readonly at: string
  readonly pfad: string | null
}

/** Die Auskunft von `GET /api/world/graphify/setup`. */
interface SetupInfo {
  readonly platform: string
  readonly command: string
  readonly cli: string | null
  readonly uv: string | null
  readonly pipx: string | null
  readonly python: string | null
  readonly method: 'uv' | 'pipx' | 'pip' | 'none'
  readonly installable: boolean
  readonly modus: 'auto' | 'ask' | 'never'
  readonly installiert: SetupErgebnis | null
  readonly hinweise: readonly string[]
}

interface FileAntwort {
  readonly path: string
  readonly content: string
  readonly language: string
  readonly lines: number
}

interface Props {
  /**
   * Schließt das Haupt-Panel.
   *
   * **Warum optional.** In der Plugin-Liste gibt es diesen Knopf nicht: die eigene Seite hat ihre
   * Navigation, und ein Schließen-Knopf dort führte ins Leere.
   */
  readonly close?: () => void
  /** Der Einstellungseintrag; ohne ihn gelten die Vorgaben. */
  readonly form?: SettingsForm<DisplayConfig>
  readonly t: TranslateNS<'graphify'>
}

async function hole<T>(url: string): Promise<T> {
  const antwort = await fetch(url, { headers: { accept: 'application/json' } })
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
  return (await antwort.json()) as T
}

/**
 * Liest die Anzeige-Einstellungen und hört auf Änderungen.
 *
 * **Warum kein `useSyncExternalStore`.** Die Einstellungsseite liefert ein
 * Schnappschuß-Objekt, dessen Identität sich bei jeder Änderung erneuert; ein
 * eigener Zustand mit Abonnement ist dafür kürzer und genauso richtig.
 *
 * @param form - der Einstellungseintrag oder `undefined`
 * @returns die geltende Anzeige
 */
function useAnsicht(form: SettingsForm<DisplayConfig> | undefined): Ansicht {
  const [roh, setRoh] = useState<DisplayConfig | undefined>(() => form?.getSnapshot().value)
  useEffect(() => {
    if (form === undefined) return
    setRoh(form.getSnapshot().value)
    return form.subscribe(() => setRoh(form.getSnapshot().value))
  }, [form])
  return useMemo(() => liesAnsicht(roh), [roh])
}

/** Ein Legendeneintrag: Gruppe, Anzahl im Ausschnitt und ihr größter Knoten. */
interface Legende {
  readonly id: number
  readonly anzahl: number
  readonly top: string
  readonly farbe: string
}

/**
 * Der Kasten für die fehlende CLI.
 *
 * **Warum er im Panel steht und nicht in einem Dialog.** Die Installation ist
 * der erste Schritt vor dem ersten Graphen; wer das Panel öffnet, soll sehen,
 * warum nichts da ist und was der nächste Klick tut — ohne Fenster, das man
 * wegklicken kann, bevor man es gelesen hat.
 */
function SetupBox({
  setup,
  laeuft,
  ausgabe,
  onInstall,
  onModus,
  t,
}: {
  readonly setup: SetupInfo
  readonly laeuft: boolean
  readonly ausgabe: string
  readonly onInstall: () => void
  readonly onModus: (modus: 'auto' | 'ask' | 'never') => void
  readonly t: TranslateNS<'graphify'>
}): ReactElement {
  // Ein automatischer Versuch beim Start hinterläßt seine Ausgabe im Status;
  // der Kasten zeigt sie, auch wenn niemand den Knopf gedrückt hat.
  const letzte = setup.installiert
  const text =
    ausgabe !== ''
      ? ausgabe
      : [letzte?.output, letzte?.error]
          .filter((teil): teil is string => typeof teil === 'string' && teil.trim() !== '')
          .join('\n')
  return (
    <section className="pmh-gf__setup">
      <div className="pmh-gf__setupkopf">
        <b>{t('setupTitle')}</b>
        <span>{t('setupMissing')}</span>
      </div>
      <div className="pmh-gf__setupzeile">
        <span className="pmh-gf__setupweg">
          {t('setupMethod')}: <code>{setup.method === 'none' ? t('setupNone') : setup.method}</code>
        </span>
        {setup.installable ? (
          <button
            className="pmh-gf__btn pmh-gf__btn--run"
            type="button"
            onClick={onInstall}
            disabled={laeuft}
          >
            {laeuft ? t('setupInstalling') : t('setupInstall')}
          </button>
        ) : null}
        <label className="pmh-gf__setupauto">
          <input
            type="checkbox"
            checked={setup.modus === 'auto'}
            onChange={(event) => onModus(event.target.checked ? 'auto' : 'ask')}
          />
          {t('setupAuto')}
        </label>
      </div>
      {setup.hinweise.length > 0 ? (
        <ul className="pmh-gf__setuphilfe">
          {setup.hinweise.map((zeile) => (
            <li key={zeile}>{zeile}</li>
          ))}
        </ul>
      ) : null}
      {text === '' ? null : <pre className="pmh-gf__setupausgabe">{text.slice(0, 4000)}</pre>}
    </section>
  )
}

/** Das Panel. */
export function GraphifyPanel({ close, form, t }: Props): ReactElement {
  const [status, setStatus] = useState<Status | null>(null)
  const [graph, setGraph] = useState<ViewGraph | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laden, setLaden] = useState(true)
  const [neu, setNeu] = useState(0)
  const [suche, setSuche] = useState('')
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [lauf, setLauf] = useState<'idle' | 'laeuft' | 'fertig' | 'fehler'>('idle')
  const [ausgabe, setAusgabe] = useState('')
  const [datei, setDatei] = useState<FileAntwort | null>(null)
  const [dateiLaden, setDateiLaden] = useState(false)
  const [dateiFehler, setDateiFehler] = useState<string | null>(null)
  const [dateiGeaendert, setDateiGeaendert] = useState(false)
  const [startBearbeiten, setStartBearbeiten] = useState(false)
  const [seed, setSeed] = useState(0)
  const [setup, setSetup] = useState<SetupInfo | null>(null)
  const [setupLaeuft, setSetupLaeuft] = useState(false)
  const [setupAusgabe, setSetupAusgabe] = useState('')

  const anzeige = useAnsicht(form)
  const [tiefe, setTiefe] = useState<Ansicht['tiefe']>(anzeige.tiefe)
  const [beschriftungen, setBeschriftungen] = useState(anzeige.beschriftungen)
  const [bewegung, setBewegung] = useState(anzeige.bewegung)
  const [farbe, setFarbe] = useState<Ansicht['farbe']>(anzeige.farbe)
  const [ebene, setEbene] = useState<Ebene>(anzeige.ebene)
  const [gruppe, setGruppe] = useState<number | null>(null)

  // Eine geänderte Einstellung gilt sofort — auch für eine Fläche, an der schon gedreht wurde.
  useEffect(() => {
    setTiefe(anzeige.tiefe)
    setBeschriftungen(anzeige.beschriftungen)
    setBewegung(anzeige.bewegung)
    setFarbe(anzeige.farbe)
    setEbene(anzeige.ebene)
  }, [anzeige.tiefe, anzeige.beschriftungen, anzeige.bewegung, anzeige.farbe, anzeige.ebene])

  useEffect(() => {
    let ab = false
    setLaden(true)
    setFehler(null)
    Promise.all([
      hole<Status>('/api/world/graphify/status'),
      hole<ViewGraph>('/api/world/graphify/graph'),
      hole<SetupInfo>('/api/world/graphify/setup').catch(() => null),
    ])
      .then(([neuerStatus, neuerGraph, neuesSetup]) => {
        if (ab) return
        setStatus(neuerStatus)
        setGraph(neuerGraph)
        setSetup(neuesSetup)
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

  const index = useMemo(() => (graph === null ? LEERER_INDEX : baueIndex(graph)), [graph])

  const gemeinschaften = useMemo(
    () => (graph === null ? LEERE_GEMEINSCHAFTEN : baueGemeinschaften(index)),
    [graph, index],
  )

  const gruppen = useMemo(() => {
    const menge = new Set<number>()
    for (const knoten of graph?.nodes ?? []) {
      if (knoten.community !== undefined) menge.add(knoten.community)
    }
    return menge
  }, [graph])

  // Der erste Blick soll auf einem Knoten mit Anschluß liegen, nicht auf dem ersten Array-Eintrag.
  useEffect(() => {
    if (graph === null || graph.nodes.length === 0) return
    if (gewaehlt !== null && index.byId.has(gewaehlt)) return
    setGewaehlt(hubs(index, 1)[0] ?? graph.nodes[0]?.id ?? null)
  }, [graph, index, gewaehlt])

  useEffect(() => {
    setDatei(null)
    setDateiFehler(null)
  }, [gewaehlt])

  const starte = async (): Promise<void> => {
    setLauf('laeuft')
    setAusgabe('')
    try {
      const antwort = await fetch('/api/world/graphify/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'update' }),
      })
      const daten = (await antwort.json()) as RunAntwort
      const text = [daten.output, daten.stderr, daten.error].filter(Boolean).join('\n')
      setAusgabe(text.length > 0 ? text : `exit ${daten.exitCode ?? '?'}`)
      setLauf(daten.ok ? 'fertig' : 'fehler')
      if (daten.ok) setNeu((n) => n + 1)
    } catch (problem) {
      setAusgabe(problem instanceof Error ? problem.message : String(problem))
      setLauf('fehler')
    }
  }

  /**
   * Installiert die CLI über den Provider.
   *
   * **Warum der Knopf nicht selbst installiert.** Der Browser darf kein
   * Programm starten. Er bittet die Host-Route, und die kennt drei feste Wege;
   * die Ausgabe kommt zurück und steht im Kasten.
   */
  const installiere = async (): Promise<void> => {
    setSetupLaeuft(true)
    setSetupAusgabe('')
    try {
      const antwort = await fetch('/api/world/graphify/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
      const daten = (await antwort.json()) as SetupInfo
      setSetup(daten)
      const ergebnis = daten.installiert
      const text = [ergebnis?.output, ergebnis?.error]
        .filter((teil): teil is string => typeof teil === 'string' && teil.trim() !== '')
        .join('\n')
      setSetupAusgabe(
        text.length > 0 ? text : ergebnis?.ok === true ? t('setupDone') : t('setupFailed'),
      )
      if (ergebnis?.ok === true) setNeu((n) => n + 1)
    } catch (problem) {
      setSetupAusgabe(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setSetupLaeuft(false)
    }
  }

  /** Merkt sich, ob beim Start automatisch installiert werden soll. */
  const setzeSetupModus = async (modus: 'auto' | 'ask' | 'never'): Promise<void> => {
    try {
      const antwort = await fetch('/api/world/graphify/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setup: modus }),
      })
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
      setSetup((alt) => (alt === null ? alt : { ...alt, modus }))
    } catch (problem) {
      setSetupAusgabe(problem instanceof Error ? problem.message : String(problem))
    }
  }

  const hubsListe = useMemo(() => {
    if (graph === null) return []
    return hubs(index, 8)
      .map((id) => index.byId.get(id))
      .filter((knoten): knoten is ViewNode => knoten !== undefined)
  }, [graph, index])

  const sichtbar = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    const gesehen = new Set<string>()
    const liste: ViewNode[] = []
    for (const knoten of graph?.nodes ?? []) {
      if (begriff.length > 0) {
        const heu = `${knoten.label} ${knoten.kind ?? ''} ${knoten.path ?? ''}`.toLowerCase()
        if (!heu.includes(begriff)) continue
      }
      // Der Graph enthält denselben Namen aus mehreren Läufen/Quellen. In der
      // Liste wäre das nur Rauschen; angezeigt wird er einmal pro Name+Pfad.
      const schluessel = `${knoten.label}|${knoten.path ?? ''}`
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      liste.push(knoten)
      if (liste.length >= 300) break
    }
    return liste
  }, [graph, suche])

  const gewaehltKnoten = gewaehlt === null ? null : (index.byId.get(gewaehlt) ?? null)

  /**
   * Die Gruppe, die gerade offen ist.
   *
   * Ohne eigene Wahl die Gruppe des gewählten Knotens; gibt es auch die nicht,
   * die größte des Graphen. So öffnet „Gruppe" nie eine leere Fläche.
   */
  const gruppeAktuell = useMemo(() => {
    if (ebene !== 'gruppe') return null
    if (gruppe !== null) return gruppe
    if (gewaehltKnoten?.community !== undefined) return gewaehltKnoten.community
    return gemeinschaften.liste[0]?.id ?? null
  }, [ebene, gruppe, gewaehltKnoten, gemeinschaften])

  const ausschnitt = useMemo(
    () =>
      graph === null
        ? LEERER_AUSSCHNITT
        : ebene === 'gesamt'
          ? schneideGesamt(graph, index, gemeinschaften, anzeige.grenze)
          : ebene === 'gruppe' && gruppeAktuell !== null
            ? schneideGruppe(graph, index, gemeinschaften, gruppeAktuell, anzeige.grenze)
            : schneideAusschnitt(graph, index, gewaehlt, tiefe, anzeige.grenze),
    [graph, index, gemeinschaften, ebene, gruppeAktuell, gewaehlt, tiefe, anzeige.grenze],
  )

  const nachbarn = useMemo(() => {
    if (gewaehlt === null) return []
    const ids = index.neighbours.get(gewaehlt) ?? []
    const liste: ViewNode[] = []
    for (const id of ids.slice(0, 24)) {
      const knoten = index.byId.get(id)
      if (knoten !== undefined) liste.push(knoten)
    }
    return liste
  }, [index, gewaehlt])

  const legende = useMemo<readonly Legende[]>(() => {
    const zaehler = new Map<number, { anzahl: number; top: string; grad: number }>()
    for (const knoten of ausschnitt.nodes) {
      if (knoten.community === undefined) continue
      const grad = index.degree.get(knoten.id) ?? 0
      const eintrag = zaehler.get(knoten.community)
      if (eintrag === undefined) {
        zaehler.set(knoten.community, { anzahl: 1, top: knoten.id, grad })
      } else {
        eintrag.anzahl += 1
        if (grad > eintrag.grad) {
          eintrag.grad = grad
          eintrag.top = knoten.id
        }
      }
    }
    return [...zaehler.entries()]
      .sort((a, b) => b[1].anzahl - a[1].anzahl || a[0] - b[0])
      .slice(0, 6)
      .map(([id, eintrag]) => ({
        id,
        anzahl: eintrag.anzahl,
        top: eintrag.top,
        farbe: farbeNachGruppe(id),
      }))
  }, [ausschnitt, index])

  useEffect(() => {
    if (datei === null) setDateiGeaendert(false)
  }, [datei])

  const waehle = (id: string): void => {
    if (dateiGeaendert && !window.confirm(t('discardConfirm'))) return
    setGewaehlt(id)
    // In der Gruppenebene gehört die Auswahl zur Gruppe: ein Knoten aus einer
    // anderen Gruppe öffnet diese, statt eine Fläche zu zeigen, die ihn gar
    // nicht enthält.
    if (ebene === 'gruppe') {
      const eigene = gemeinschaften.nach.get(id)
      if (eigene !== undefined && eigene !== gruppeAktuell) setGruppe(eigene)
    }
  }

  /**
   * Wechselt die Ebene.
   *
   * **Warum „Gruppe" die Auswahl mitnimmt.** Wer einen Knoten ansieht und dann
   * „Gruppe" wählt, meint dessen Gruppe — nicht irgendeine. Ohne Auswahl gilt
   * die größte Gruppe.
   *
   * @param naechste - die Ebene, die geöffnet werden soll
   */
  const wechsleEbene = (naechste: Ebene): void => {
    if (naechste === 'gruppe') {
      setGruppe(gewaehltKnoten?.community ?? gemeinschaften.liste[0]?.id ?? null)
    }
    setEbene(naechste)
  }

  /**
   * Ein Klick auf die Legende.
   *
   * In der Gesamtkarte öffnet er die Gruppe selbst — die Legende ist dort der
   * schnellste Weg von der Landschaft ins Land. In den anderen Ebenen wählt er
   * nur den wichtigsten Knoten der Gruppe.
   *
   * @param eintrag - der Legendeneintrag
   */
  const oeffneLegende = (eintrag: Legende): void => {
    if (dateiGeaendert && !window.confirm(t('discardConfirm'))) return
    if (ebene === 'gesamt') {
      setGruppe(eintrag.id)
      setEbene('gruppe')
      setGewaehlt(eintrag.top)
      return
    }
    waehle(eintrag.top)
  }

  const schliessePanel = (): void => {
    if (dateiGeaendert && !window.confirm(t('discardConfirm'))) return
    close?.()
  }

  const oeffneDatei = async (bearbeiten = false): Promise<void> => {
    if (gewaehltKnoten?.path === undefined) return
    setStartBearbeiten(bearbeiten)
    setDateiLaden(true)
    setDateiFehler(null)
    try {
      const antwort = await hole<FileAntwort>(
        `/api/world/graphify/file?path=${encodeURIComponent(gewaehltKnoten.path)}`,
      )
      setDatei(antwort)
    } catch (problem) {
      setDatei(null)
      setDateiFehler(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setDateiLaden(false)
    }
  }

  const zeigtListe = anzeige.modus !== 'graph'
  const zeigtGraph = anzeige.modus !== 'list'
  const zeigtDetail = anzeige.inspektor !== 'off'

  return (
    <div className="pmh-gf">
      <header className="pmh-gf__head">
        <div className="pmh-gf__brand">
          <GraphifyIcon size={22} />
          <div className="pmh-gf__brandtext">
            <span className="pmh-gf__kicker">CODE GRAPH</span>
            <h2 className="pmh-gf__title">{t('title')}</h2>
          </div>
        </div>
        <div className="pmh-gf__actions">
          <span className={status?.available ? 'pmh-gf__dot is-on' : 'pmh-gf__dot'} />
          <span className="pmh-gf__state">{status?.available ? status.command : t('noCli')}</span>
          <button
            className="pmh-gf__btn pmh-gf__btn--run"
            type="button"
            onClick={() => void starte()}
            disabled={lauf === 'laeuft'}
          >
            {lauf === 'laeuft' ? t('running') : t('run')}
          </button>
          <button className="pmh-gf__btn" type="button" onClick={() => setNeu((n) => n + 1)} disabled={laden}>
            {t('refresh')}
          </button>
          {close === undefined ? null : (
            <button className="pmh-gf__btn pmh-gf__btn--ghost" type="button" onClick={schliessePanel}>
              {t('close')}
            </button>
          )}
        </div>
      </header>

      <div className="pmh-gf__stats">
        <div className="pmh-gf__stat">
          <b>{status?.nodes ?? graph?.nodes.length ?? 0}</b>
          <span>{t('nodes')}</span>
        </div>
        <div className="pmh-gf__stat">
          <b>{status?.edges ?? graph?.edges.length ?? 0}</b>
          <span>{t('edges')}</span>
        </div>
        <div className="pmh-gf__stat">
          <b>{gruppen.size}</b>
          <span>{t('communities')}</span>
        </div>
        <div className="pmh-gf__pfad" title={status?.graphFile}>
          {status?.graphFile ?? '—'}
        </div>
      </div>

      {ausgabe.length > 0 ? (
        <div className={lauf === 'fehler' ? 'pmh-gf__ausgabe is-fehler' : 'pmh-gf__ausgabe'}>
          <strong>{t('output')}</strong>
          <pre>{ausgabe.slice(0, 6000)}</pre>
        </div>
      ) : null}

      {setup !== null && setup.cli === null ? (
        <SetupBox
          setup={setup}
          laeuft={setupLaeuft}
          ausgabe={setupAusgabe}
          onInstall={() => void installiere()}
          onModus={(modus) => void setzeSetupModus(modus)}
          t={t}
        />
      ) : null}

      {fehler !== null ? (
        <div className="pmh-gf__fehler">
          <strong>{t('error')}</strong>
          <span>{fehler}</span>
          <button className="pmh-gf__btn" type="button" onClick={() => setNeu((n) => n + 1)}>
            {t('retry')}
          </button>
        </div>
      ) : (graph?.nodes.length ?? 0) === 0 ? (
        <div className="pmh-gf__leerbox">
          <GraphifyIcon size={30} />
          <p>{laden ? t('loading') : t('empty')}</p>
          <code>{t('hint')}</code>
        </div>
      ) : (
        <div className="pmh-gf__body" data-view={anzeige.modus} data-inspector={anzeige.inspektor}>
          {zeigtListe ? (
            <aside className="pmh-gf__list">
              <label className="pmh-gf__search">
                <SearchIcon />
                <input
                  type="search"
                  value={suche}
                  onChange={(event) => setSuche(event.target.value)}
                  placeholder={t('search')}
                  aria-label={t('search')}
                />
              </label>
              <div className="pmh-gf__items">
                {sichtbar.map((knoten) => (
                  <button
                    key={knoten.id}
                    type="button"
                    className={knoten.id === gewaehlt ? 'pmh-gf__item is-aktiv' : 'pmh-gf__item'}
                    onClick={() => waehle(knoten.id)}
                    title={knoten.path ?? knoten.label}
                  >
                    <span className="pmh-gf__itemname">{knoten.label}</span>
                    <span className="pmh-gf__itemmeta">
                      {knoten.kind ?? '—'} · {index.degree.get(knoten.id) ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          ) : null}

          {zeigtGraph ? (
            <section className="pmh-gf__stage">
              <div className="pmh-gf__graphbar">
                <div className="pmh-gf__seg pmh-gf__seg--ebene" role="group" aria-label={t('level')}>
                  {(['gesamt', 'gruppe', 'nachbarschaft'] as const).map((wert) => (
                    <button
                      key={wert}
                      type="button"
                      aria-pressed={ebene === wert}
                      title={wert === 'gesamt' ? t('overviewHint') : wert === 'gruppe' ? t('groupHint') : t('neighbourhoodHint')}
                      onClick={() => wechsleEbene(wert)}
                    >
                      {wert === 'gesamt' ? t('overview') : wert === 'gruppe' ? t('group') : t('neighbourhood')}
                    </button>
                  ))}
                </div>
                {ebene === 'nachbarschaft' ? (
                  <div className="pmh-gf__seg" role="group" aria-label={t('depth')}>
                    {([1, 2, 3] as const).map((wert) => (
                      <button
                        key={wert}
                        type="button"
                        aria-pressed={tiefe === wert}
                        title={`${t('depth')} ${wert}`}
                        onClick={() => setTiefe(wert)}
                      >
                        {wert}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={beschriftungen ? 'pmh-gf__toggle is-on' : 'pmh-gf__toggle'}
                  aria-pressed={beschriftungen}
                  onClick={() => setBeschriftungen((alt) => !alt)}
                >
                  {t('labels')}
                </button>
                <button
                  type="button"
                  className={bewegung ? 'pmh-gf__toggle is-on' : 'pmh-gf__toggle'}
                  aria-pressed={bewegung}
                  onClick={() => setBewegung((alt) => !alt)}
                >
                  {t('motion')}
                </button>
                <label className="pmh-gf__farbe">
                  <span>{t('colour')}</span>
                  <select
                    value={farbe}
                    onChange={(event) =>
                      setFarbe(event.target.value === 'kind' ? 'kind' : 'community')
                    }
                  >
                    <option value="community">{t('colourCommunity')}</option>
                    <option value="kind">{t('colourKind')}</option>
                  </select>
                </label>
                <button type="button" className="pmh-gf__btn" onClick={() => setSeed((s) => s + 1)}>
                  {t('arrange')}
                </button>
                <span className="pmh-gf__graphmeta">
                  {ebene === 'gruppe' && gruppeAktuell !== null ? `${t('group')} ${gruppeAktuell} · ` : ''}
                  {t('cut')} {ausschnitt.nodes.length} {t('of')} {index.byId.size}
                  {ausschnitt.gekuerzt ? ` · ${t('truncated')}` : ''}
                </span>
              </div>
              <GraphCanvas
                ausschnitt={ausschnitt}
                farbe={farbe}
                beschriftungen={beschriftungen}
                bewegung={bewegung}
                gewaehlt={gewaehlt}
                onSelect={waehle}
                seed={seed}
                t={t}
              />
              {legende.length > 0 ? (
                <div className="pmh-gf__legende" aria-label={t('legend')}>
                  {legende.map((eintrag) => (
                    <button
                      key={eintrag.id}
                      type="button"
                      title={`${eintrag.anzahl} ${t('nodes')}`}
                      onClick={() => oeffneLegende(eintrag)}
                    >
                      <span className="pmh-gf__legendenpunkt" style={{ background: eintrag.farbe }} />#
                      {eintrag.id}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {zeigtDetail ? (
            <aside className="pmh-gf__detail">
              <div className="pmh-gf__hubs">
                <span className="pmh-gf__hubshead">{t('hubs')}</span>
                <div className="pmh-gf__hubsrow">
                  {hubsListe.map((knoten) => (
                    <button
                      key={knoten.id}
                      type="button"
                      className={knoten.id === gewaehlt ? 'pmh-gf__hub is-aktiv' : 'pmh-gf__hub'}
                      onClick={() => waehle(knoten.id)}
                      title={knoten.label}
                    >
                      <span>{knoten.label}</span>
                      <b>{index.degree.get(knoten.id) ?? 0}</b>
                    </button>
                  ))}
                </div>
              </div>

              {gewaehltKnoten === null ? (
                <p className="pmh-gf__leer">{t('select')}</p>
              ) : (
                <div className="pmh-gf__knoten">
                  <div className="pmh-gf__knotenkopf">
                    <div className="pmh-gf__knotenname">
                      <h3>{gewaehltKnoten.label}</h3>
                      <code>{gewaehltKnoten.id}</code>
                    </div>
                    <div className="pmh-gf__kopfright">
                      <span className="pmh-gf__badge">
                        {t('degree')} {index.degree.get(gewaehltKnoten.id) ?? 0}
                      </span>
                      {gewaehltKnoten.path !== undefined ? (
                        <>
                          <button
                            className="pmh-gf__btn pmh-gf__btn--file"
                            type="button"
                            onClick={() => void oeffneDatei()}
                          >
                            {t('openFile')}
                          </button>
                          <button className="pmh-gf__btn" type="button" onClick={() => void oeffneDatei(true)}>
                            {t('edit')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {dateiLaden ? (
                    <p className="pmh-gf__leer">{t('loadingFile')}</p>
                  ) : dateiFehler !== null ? (
                    <div className="pmh-gf__dateifehler">
                      <p>{t('fileError')}</p>
                      <code>{dateiFehler}</code>
                      <button className="pmh-gf__btn" type="button" onClick={() => void oeffneDatei()}>
                        {t('retry')}
                      </button>
                    </div>
                  ) : datei !== null ? (
                    <CodeView
                      datei={datei}
                      startEdit={startBearbeiten}
                      onClose={() => {
                        setDatei(null)
                        setStartBearbeiten(false)
                      }}
                      onSaved={(neuerInhalt) => setDatei(neuerInhalt)}
                      onDirty={setDateiGeaendert}
                      t={t}
                    />
                  ) : (
                    <>
                      <dl className="pmh-gf__daten">
                        <div>
                          <dt>{t('kind')}</dt>
                          <dd>{gewaehltKnoten.kind ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>{t('path')}</dt>
                          <dd>{gewaehltKnoten.path ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>{t('community')}</dt>
                          <dd>{gewaehltKnoten.community ?? '—'}</dd>
                        </div>
                      </dl>
                      <div className="pmh-gf__nachbarn">
                        <span className="pmh-gf__hubshead">{t('degree')}</span>
                        <div className="pmh-gf__chips">
                          {nachbarn.length === 0 ? (
                            <span className="pmh-gf__leer">—</span>
                          ) : (
                            nachbarn.map((knoten) => (
                              <button
                                key={knoten.id}
                                type="button"
                                className={knoten.id === gewaehlt ? 'pmh-gf__chip is-aktiv' : 'pmh-gf__chip'}
                                onClick={() => waehle(knoten.id)}
                                title={knoten.path ?? knoten.label}
                              >
                                {knoten.label}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </aside>
          ) : null}
        </div>
      )}
    </div>
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
 * **Warum die Kurzfassung `panel` nennt.** Einen eigenen Text für die Karte gibt es nicht, und
 * einen zweiten Namen für dieselbe Sache braucht es auch nicht: die Zeile zeigt den Namen, den das
 * Plugin in der Leiste trägt.
 */
function GraphifyItem({ view, t, form }: PluginConfigViewProps & Props): ReactElement {
  if (view === 'summary') return <span>{t('panel')}</span>
  return <GraphifyPanel t={t} {...(form === undefined ? {} : { form })} />
}

/** Escaped Text für die eine Stelle, an der HTML erlaubt ist. */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * **Syntaxfarben ohne Bibliothek.**
 *
 * Kein Monaco, kein Shiki: der Bundle bleibt klein. Kommentare, Zeichenketten,
 * Zahlen und Schlüsselwörter bekommen eine Farbe; alles andere bleibt Text.
 * Das ist genug, um eine Datei nach Typ zu lesen, ohne sie zu entschlüsseln.
 */
function highlight(code: string, language: string): string {
  if (language === 'markdown') return escapeHtml(code)
  const muster =
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|class|interface|type|import|from|export|return|if|else|for|while|new|async|await|throw|try|catch|switch|case|break|continue|extends|implements|public|private|protected|readonly|static|this|true|false|null|undefined|void|number|string|boolean|in|of|as|default)\b|\b\d+(?:\.\d+)?\b/g
  let aus = ''
  let letzte = 0
  let treffer: RegExpExecArray | null
  while ((treffer = muster.exec(code)) !== null) {
    aus += escapeHtml(code.slice(letzte, treffer.index))
    const token = treffer[0]
    const art =
      token.startsWith('//') || token.startsWith('/*') || token.startsWith('#')
        ? 'kommentar'
        : /^["'`]/.test(token)
          ? 'text'
          : /^\d/.test(token)
            ? 'zahl'
            : 'wort'
    aus += `<span class="pmh-gf__tok-${art}">${escapeHtml(token)}</span>`
    letzte = treffer.index + token.length
  }
  return aus + escapeHtml(code.slice(letzte))
}

/** Ein Code-Viewer mit Zeilennummern, Sprache und Schließen. */
function CodeView({
  datei,
  startEdit,
  onClose,
  onSaved,
  onDirty,
  t,
}: {
  readonly datei: FileAntwort
  readonly startEdit: boolean
  readonly onClose: () => void
  readonly onSaved: (neu: FileAntwort) => void
  readonly onDirty: (dirty: boolean) => void
  readonly t: TranslateNS<'graphify'>
}): ReactElement {
  const [bearbeiten, setBearbeiten] = useState(startEdit)
  const [entwurf, setEntwurf] = useState(datei.content)
  const [speichert, setSpeichert] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)

  useEffect(() => {
    setEntwurf(datei.content)
    setBearbeiten(startEdit)
    setHinweis(null)
  }, [datei.path, startEdit])

  const anzahl = bearbeiten ? Math.max(1, entwurf.split('\n').length) : Math.max(1, datei.lines)
  const zeilen = Array.from({ length: anzahl }, (_, index) => index + 1)
  const geaendert = bearbeiten && entwurf !== datei.content

  useEffect(() => {
    onDirty(geaendert)
  }, [geaendert, onDirty])

  const verwerfen = (): void => {
    setBearbeiten(false)
    setEntwurf(datei.content)
    setHinweis(null)
  }

  const schliesseDatei = (): void => {
    if (geaendert && !window.confirm(t('discardConfirm'))) return
    onClose()
  }

  const speichere = async (): Promise<void> => {
    setSpeichert(true)
    setHinweis(null)
    try {
      const antwort = await fetch('/api/world/graphify/file', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: datei.path, content: entwurf }),
      })
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`)
      const daten = (await antwort.json()) as { lines?: number }
      onSaved({ ...datei, content: entwurf, lines: daten.lines ?? anzahl })
      setBearbeiten(false)
      setHinweis(t('saved'))
    } catch (problem) {
      setHinweis(`${t('saveError')}: ${problem instanceof Error ? problem.message : String(problem)}`)
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <div className="pmh-gf__datei">
      <div className="pmh-gf__dateikopf">
        <div className="pmh-gf__dateiname">
          <span className="pmh-gf__lang">{datei.language}</span>
          <code>{datei.path}</code>
          <span className="pmh-gf__zeilen">
            {anzahl} {t('lines')}
          </span>
        </div>
        <div className="pmh-gf__dateiaktionen">
          {bearbeiten ? (
            <>
              <button className="pmh-gf__btn pmh-gf__btn--file" type="button" onClick={() => void speichere()} disabled={speichert}>
                {speichert ? t('loadingFile') : t('save')}
              </button>
              <button className="pmh-gf__btn" type="button" onClick={verwerfen}>
                {t('discard')}
              </button>
            </>
          ) : (
            <button
              className="pmh-gf__btn"
              type="button"
              onClick={() => {
                setEntwurf(datei.content)
                setBearbeiten(true)
                setHinweis(null)
              }}
            >
              {t('edit')}
            </button>
          )}
          <button className="pmh-gf__btn" type="button" onClick={schliesseDatei}>
            {t('closeFile')}
          </button>
        </div>
      </div>
      {bearbeiten ? (
        <textarea
          className="pmh-gf__editor"
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
      ) : (
        <div className="pmh-gf__codewrap">
          <div className="pmh-gf__gutter" aria-hidden="true">
            {zeilen.map((nummer) => (
              <span key={nummer}>{nummer}</span>
            ))}
          </div>
          <pre className="pmh-gf__codepre">
            <code dangerouslySetInnerHTML={{ __html: highlight(datei.content, datei.language) }} />
          </pre>
        </div>
      )}
      {hinweis !== null ? (
        <p className={hinweis.startsWith(t('saveError')) ? 'pmh-gf__hinweis is-fehler' : 'pmh-gf__hinweis'}>
          {hinweis}
        </p>
      ) : null}
    </div>
  )
}

/** Drei verbundene Punkte — der Graph als Zeichen. */
export function GraphifyIcon({ size = 20 }: { readonly size?: number }): ReactElement {
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
    >
      <path d="M6 7.2 12 4l6 3.2M6 7.2v8.6L12 20l6-4.2V7.2M12 4v16" opacity=".55" />
      <circle cx="6" cy="7.2" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="7.2" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none" />
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

/** Hängt Panel, Sidebar-Eintrag und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhGraphify = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'graphify: Stil')

  const close = (): void => {
    ctx.layout.selectPanel(null)
  }

  /*
   * **Ein Einstellungseintrag, zwei Leser.**
   *
   * Die Anmeldung in `main` und die in `plugins.item` zeigen dasselbe Panel; beide brauchen
   * dieselbe Einstellung. Der Eintrag wird deshalb einmal geholt und weitergereicht, statt in
   * jedem Bereich neu gelesen zu werden.
   *
   * **Warum erst beim ersten Zugriff.** `configForms.get` stößt den Abgleich mit dem Host an.
   * Der gehört nicht in den Plugin-Körper: der soll auch dann stehen, wenn der Host noch nicht
   * geantwortet hat. Der Wert wird gemerkt — ein zweiter Aufruf liefert dieselbe Form.
   */
  let eintrag: SettingsForm<DisplayConfig> | undefined
  const einstellungen = (): SettingsForm<DisplayConfig> => {
    eintrag ??= ctx.configForms.get<DisplayConfig>(ENTRY_ID)
    return eintrag
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
        inject: () => ({ close, form: einstellungen() }),
      },
      GraphifyPanel,
    )
  })

  /*
   * **Die Anzeige kommt aus den Einstellungen.**
   *
   * Vorher stand hier `order: 12` fest und `sidebar.panellist` wurde immer angemeldet. Jetzt liest
   * dieser Block den Eintrag `pmh-graphify` über `configForms` und meldet **je nach `surface`** an:
   * die Seitenleiste, die Karte in der Plugin-Liste, oder beides — oder nichts.
   *
   * **Warum neu angemeldet statt nur umgeschaltet.** `order` ist Teil der Anmeldung; ein Eintrag
   * mit geänderter Reihenfolge ist ein anderer Eintrag. Deshalb wird bei jeder Änderung abgemeldet
   * und neu angemeldet — aber nur, wenn sich der **Wirkschlüssel** wirklich geändert hat, sonst
   * würde jeder Schnappschuß des Hosts die Oberfläche neu bauen.
   */
  ctx.effect(() => {
    const form = einstellungen()
    let abgemeldet: (() => void)[] = []
    let zuletzt = ''

    const anmelden = (): void => {
      const anzeige = liesAnsicht(form.getSnapshot().value)
      const schluessel = JSON.stringify({
        oberflaeche: anzeige.oberflaeche,
        reihenfolge: anzeige.reihenfolge,
        beschriftung: anzeige.beschriftung,
      })
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
              GraphifyIcon,
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
                inject: () => ({ form: einstellungen() }),
              },
              GraphifyItem,
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
  }, 'graphify: Anzeige nach den Einstellungen')
}

const CSS = `
.pmh-gf,.pmh-gf *{box-sizing:border-box}
.pmh-gf{
  display:flex;flex-direction:column;height:100%;width:100%;max-width:100%;min-width:0;overflow:hidden;
  background:radial-gradient(120% 80% at 10% 0%,#0d1a1b 0%,#080d10 55%,#07090b 100%);
  color:#e9f3f0;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
}
.pmh-gf__head{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-gf__brand{display:flex;align-items:center;gap:11px;color:#8fe3c6}
.pmh-gf__brandtext{display:flex;flex-direction:column;gap:1px}
.pmh-gf__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(143,227,198,.55)}
.pmh-gf__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f0fbf7}
.pmh-gf__actions{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap;justify-content:flex-end}
.pmh-gf__dot{width:6px;height:6px;border-radius:50%;background:#5f8f80;box-shadow:0 0 0 4px rgba(95,143,128,.12)}
.pmh-gf__dot.is-on{background:#58e0ae;box-shadow:0 0 0 4px rgba(88,224,174,.12)}
.pmh-gf__state{font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.5);white-space:nowrap}
.pmh-gf__btn{
  appearance:none;border:1px solid rgba(143,227,198,.2);background:rgba(14,30,28,.55);
  color:#e6f7f1;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor:pointer;transition:border-color .18s ease,background .18s ease;
}
.pmh-gf__btn:hover:not(:disabled){border-color:rgba(143,227,198,.6);background:rgba(24,48,44,.7)}
.pmh-gf__btn:disabled{opacity:.45;cursor:default}
.pmh-gf__btn--run{background:rgba(88,224,174,.14);border-color:rgba(88,224,174,.35);color:#c8ffe9}
.pmh-gf__btn--ghost{border-color:transparent;background:transparent;color:rgba(233,243,240,.6)}
.pmh-gf__stats{display:flex;align-items:center;flex-wrap:wrap;gap:12px 22px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.06)}
.pmh-gf__stat{display:flex;align-items:baseline;gap:6px;white-space:nowrap}
.pmh-gf__stat b{font:600 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f2fff9}
.pmh-gf__stat span{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.48);letter-spacing:.04em}
.pmh-gf__pfad{margin-left:auto;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.5)}
.pmh-gf__ausgabe{margin:12px 20px 0;padding:10px 12px;border:1px solid rgba(143,227,198,.18);border-radius:9px;background:rgba(8,18,16,.65);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.7)}
.pmh-gf__ausgabe.is-fehler{border-color:rgba(255,120,120,.28);background:rgba(45,16,20,.45);color:#ffdada}
.pmh-gf__ausgabe strong{display:block;margin-bottom:5px;color:rgba(143,227,198,.75);font-weight:600;letter-spacing:.08em}
.pmh-gf__ausgabe pre{margin:0;max-height:160px;overflow:auto;white-space:pre-wrap}
.pmh-gf__fehler{display:flex;align-items:center;gap:12px;margin:18px 20px;padding:12px 14px;border:1px solid rgba(255,120,120,.25);border-radius:10px;background:rgba(60,20,30,.35);color:#ffd9d9}
.pmh-gf__body{display:grid;flex:1;min-width:0;width:100%;min-height:0;grid-template-rows:minmax(0,1fr)}
.pmh-gf__body[data-view="split"]{grid-template-columns:minmax(210px,260px) minmax(0,1fr) minmax(280px,330px);grid-template-areas:"list stage detail"}
.pmh-gf__body[data-view="graph"]{grid-template-columns:minmax(0,1fr) minmax(280px,340px);grid-template-areas:"stage detail"}
.pmh-gf__body[data-view="list"]{grid-template-columns:minmax(220px,300px) minmax(0,1fr);grid-template-areas:"list detail"}
.pmh-gf__body[data-inspector="off"][data-view="split"]{grid-template-columns:minmax(210px,260px) minmax(0,1fr);grid-template-areas:"list stage"}
.pmh-gf__body[data-inspector="off"][data-view="graph"]{grid-template-columns:minmax(0,1fr);grid-template-areas:"stage"}
.pmh-gf__body[data-inspector="off"][data-view="list"]{grid-template-columns:minmax(0,1fr);grid-template-areas:"list"}
.pmh-gf__body[data-inspector="below"][data-view="split"]{grid-template-columns:minmax(210px,260px) minmax(0,1fr);grid-template-rows:minmax(220px,1fr) auto;grid-template-areas:"list stage" "detail detail"}
.pmh-gf__body[data-inspector="below"][data-view="graph"]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(220px,1fr) auto;grid-template-areas:"stage" "detail"}
.pmh-gf__body[data-inspector="below"][data-view="list"]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(200px,1fr) auto;grid-template-areas:"list" "detail"}
.pmh-gf__list{grid-area:list;display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.06)}
.pmh-gf__search{display:flex;align-items:center;gap:8px;margin:12px 12px 8px;padding:7px 9px;border:1px solid rgba(143,227,198,.16);border-radius:8px;color:rgba(233,243,240,.5);background:rgba(6,14,12,.5)}
.pmh-gf__search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#e9f3f0;font:12px/1.3 "Segoe UI", system-ui, sans-serif}
.pmh-gf__search input::placeholder{color:rgba(233,243,240,.35)}
.pmh-gf__items{flex:1;min-height:0;overflow:auto;padding:2px 8px 12px}
.pmh-gf__item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:7px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:#dfeee8;cursor:pointer}
.pmh-gf__item:hover{background:rgba(88,224,174,.06)}
.pmh-gf__item.is-aktiv{background:rgba(88,224,174,.12);border-color:rgba(143,227,198,.22)}
.pmh-gf__itemname{font-size:12.5px;font-weight:500;color:#f0fbf7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-gf__itemmeta{font:10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.38);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-gf__stage{grid-area:stage;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
.pmh-gf__graphbar{display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap}
.pmh-gf__seg{display:inline-flex;border:1px solid rgba(143,227,198,.2);border-radius:8px;overflow:hidden}
.pmh-gf__seg button{appearance:none;border:0;background:rgba(14,30,28,.55);color:rgba(233,243,240,.6);width:26px;height:24px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer}
.pmh-gf__seg button + button{border-left:1px solid rgba(143,227,198,.14)}
.pmh-gf__seg button[aria-pressed="true"]{background:rgba(88,224,174,.18);color:#c8ffe9}
.pmh-gf__seg--ebene button{width:auto;padding:0 9px}
.pmh-gf__toggle{appearance:none;border:1px solid rgba(143,227,198,.18);background:rgba(14,30,28,.4);color:rgba(233,243,240,.62);border-radius:8px;padding:5px 9px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer}
.pmh-gf__toggle.is-on{border-color:rgba(88,224,174,.45);background:rgba(88,224,174,.12);color:#c8ffe9}
.pmh-gf__farbe{display:inline-flex;align-items:center;gap:6px;color:rgba(233,243,240,.5);font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace}
.pmh-gf__farbe select{appearance:none;border:1px solid rgba(143,227,198,.18);background:rgba(8,18,16,.8);color:#dff7ee;border-radius:7px;padding:4px 8px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
.pmh-gf__graphmeta{margin-left:auto;flex:1 1 150px;font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.38);text-align:right;overflow-wrap:anywhere}
.pmh-gf__leinwand{position:relative;flex:1;min-height:0}
.pmh-gf__canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
.pmh-gf__canvas:active{cursor:grabbing}
.pmh-gf__leinwandleer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;color:rgba(233,243,240,.42);font-size:12px;pointer-events:none}
.pmh-gf__zoombar{position:absolute;right:10px;bottom:10px;display:flex;gap:4px;padding:4px;border:1px solid rgba(143,227,198,.16);border-radius:9px;background:rgba(6,14,12,.82);backdrop-filter:blur(6px)}
.pmh-gf__zoombar button{appearance:none;border:0;background:transparent;color:rgba(233,243,240,.7);width:24px;height:24px;border-radius:6px;cursor:pointer;font:13px/1 ui-monospace, SFMono-Regular, Menlo, monospace}
.pmh-gf__zoombar button:hover{background:rgba(88,224,174,.14);color:#c8ffe9}
.pmh-gf__zoomwert{position:absolute;right:12px;bottom:44px;font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.55);pointer-events:none}
.pmh-gf__legende{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid rgba(143,227,198,.12);border-radius:9px;background:rgba(6,14,12,.72);backdrop-filter:blur(6px)}
.pmh-gf__legende button{display:flex;align-items:center;gap:6px;appearance:none;border:0;background:transparent;color:rgba(233,243,240,.58);font:9.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;padding:2px 4px;border-radius:5px;cursor:pointer}
.pmh-gf__legende button:hover{background:rgba(88,224,174,.12);color:#dff7ee}
.pmh-gf__legendenpunkt{width:8px;height:8px;border-radius:2px;flex:none}
.pmh-gf__detail{grid-area:detail;min-height:0;overflow:auto;padding:16px 18px;border-left:1px solid rgba(255,255,255,.06)}
.pmh-gf__body[data-inspector="below"] .pmh-gf__detail{border-left:0;border-top:1px solid rgba(255,255,255,.06);max-height:42vh}
.pmh-gf__hubs{margin-bottom:18px}
.pmh-gf__hubshead{display:block;margin-bottom:8px;font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(143,227,198,.55)}
.pmh-gf__hubsrow{display:flex;flex-wrap:wrap;gap:6px}
.pmh-gf__hub{display:inline-flex;align-items:center;gap:7px;max-width:240px;border:1px solid rgba(143,227,198,.16);border-radius:999px;background:rgba(10,24,21,.5);color:#dff7ee;padding:5px 9px;font:11px/1.2 "Segoe UI", system-ui, sans-serif;cursor:pointer}
.pmh-gf__hub:hover{border-color:rgba(143,227,198,.5)}
.pmh-gf__hub.is-aktiv{border-color:rgba(88,224,174,.55);background:rgba(88,224,174,.14)}
.pmh-gf__hub span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-gf__hub b{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
.pmh-gf__knotenkopf{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px;flex-wrap:wrap}
.pmh-gf__knotenname{min-width:0}
.pmh-gf__knotenkopf h3{margin:0 0 4px;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#f2fff9;word-break:break-word}
.pmh-gf__knotenkopf code{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.6);word-break:break-all}
.pmh-gf__badge{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;color:rgba(143,227,198,.7);border:1px solid rgba(143,227,198,.18);border-radius:999px;padding:5px 8px;white-space:nowrap}
.pmh-gf__daten{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 18px;padding:12px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.02)}
.pmh-gf__daten div{min-width:0}
.pmh-gf__daten dt{margin:0 0 3px;font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(233,243,240,.4)}
.pmh-gf__daten dd{margin:0;font:11.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-gf__chips{display:flex;flex-wrap:wrap;gap:5px}
.pmh-gf__chip{appearance:none;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:4px 8px;font:10.5px/1.2 "Segoe UI", system-ui, sans-serif;color:rgba(233,243,240,.65);background:rgba(255,255,255,.02);cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-gf__chip:hover{border-color:rgba(143,227,198,.45);color:#dff7ee}
.pmh-gf__chip.is-aktiv{border-color:rgba(88,224,174,.5);background:rgba(88,224,174,.12);color:#c8ffe9}
.pmh-gf__leerbox{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;flex:1;color:rgba(233,243,240,.45);padding:40px 20px}
.pmh-gf__leerbox p{margin:0;font-size:12px}
.pmh-gf__leerbox code{font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.65);border:1px solid rgba(143,227,198,.14);border-radius:7px;padding:6px 9px;background:rgba(8,18,16,.6)}
.pmh-gf__kopfright{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.pmh-gf__btn--file{border-color:rgba(143,227,198,.35);background:rgba(88,224,174,.1);color:#c8ffe9}
.pmh-gf__datei{margin-top:2px}
.pmh-gf__dateikopf{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px;padding:9px 11px;border:1px solid rgba(143,227,198,.16);border-radius:9px;background:rgba(8,18,16,.55)}
.pmh-gf__dateiname{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap}
.pmh-gf__dateiname code{font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmh-gf__lang{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:#8fe3c6;border:1px solid rgba(143,227,198,.25);border-radius:4px;padding:4px 6px}
.pmh-gf__zeilen{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.4)}
.pmh-gf__codewrap{display:grid;grid-template-columns:auto minmax(0,1fr);max-height:58vh;overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(4,10,9,.78)}
.pmh-gf__gutter{position:sticky;left:0;display:flex;flex-direction:column;padding:12px 9px 12px 12px;border-right:1px solid rgba(255,255,255,.06);background:rgba(6,14,12,.9);text-align:right;user-select:none;font:11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.28)}
.pmh-gf__codepre{margin:0;padding:12px 16px 12px 12px;font:11.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.82);white-space:pre;tab-size:2}
.pmh-gf__tok-kommentar{color:#6e8f86;font-style:italic}
.pmh-gf__tok-text{color:#e4c88f}
.pmh-gf__tok-zahl{color:#a8c7ff}
.pmh-gf__tok-wort{color:#8fe3c6}
.pmh-gf__dateiaktionen{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pmh-gf__editor{display:block;width:100%;min-height:56vh;resize:vertical;border:1px solid rgba(143,227,198,.2);border-radius:10px;background:rgba(4,10,9,.78);color:rgba(233,243,240,.9);padding:13px 16px;font:11.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;tab-size:2}
.pmh-gf__editor:focus{border-color:rgba(143,227,198,.55);box-shadow:0 0 0 3px rgba(88,224,174,.08)}
.pmh-gf__hinweis{margin:10px 0 0;font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
.pmh-gf__hinweis.is-fehler{color:#ffb4b4}
.pmh-gf__dateifehler{margin:10px 0;padding:12px;border:1px solid rgba(255,120,120,.25);border-radius:9px;background:rgba(45,16,20,.35);color:#ffdada;font-size:12px}
.pmh-gf__dateifehler code{display:block;margin:6px 0 10px;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,218,218,.7)}
.pmh-gf__leer{margin:14px 0;color:rgba(233,243,240,.42);font-size:12px}
.pmh-gf__setup{margin:12px 20px 0;padding:12px 14px;border:1px solid rgba(232,178,74,.3);border-radius:10px;background:rgba(48,36,12,.32);display:flex;flex-direction:column;gap:9px}
.pmh-gf__setupkopf{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;color:#f4e3bb}
.pmh-gf__setupkopf b{font-size:12.5px}
.pmh-gf__setupkopf span{font-size:11.5px;color:rgba(244,227,187,.68)}
.pmh-gf__setupzeile{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pmh-gf__setupweg{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(244,227,187,.65)}
.pmh-gf__setupweg code{color:#ffd98a}
.pmh-gf__setupauto{display:inline-flex;align-items:center;gap:6px;font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(244,227,187,.7);cursor:pointer}
.pmh-gf__setupauto input{accent-color:#e8b24a;margin:0}
.pmh-gf__setuphilfe{margin:0;padding-left:18px;font:10.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(244,227,187,.62)}
.pmh-gf__setupausgabe{margin:0;max-height:170px;overflow:auto;white-space:pre-wrap;font:10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.68);background:rgba(0,0,0,.28);border-radius:7px;padding:8px 10px}
@media (max-width:1150px){
  .pmh-gf__body[data-view="split"]{grid-template-columns:minmax(180px,210px) minmax(0,1fr) minmax(230px,270px)}
  .pmh-gf__body[data-view="graph"]{grid-template-columns:minmax(0,1fr) minmax(230px,270px)}
}
@media (max-width:900px){
  .pmh-gf__body[data-view]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(260px,1fr) auto;grid-template-areas:"stage" "detail"}
  .pmh-gf__body[data-view="list"]{grid-template-areas:"list" "detail"}
  .pmh-gf__body[data-view="split"]{grid-template-areas:"stage" "list" "detail"}
  .pmh-gf__body[data-inspector="off"][data-view="split"]{grid-template-areas:"stage" "list"}
  .pmh-gf__body[data-inspector="off"][data-view="graph"]{grid-template-areas:"stage"}
  .pmh-gf__body[data-inspector="off"][data-view="list"]{grid-template-areas:"list"}
  .pmh-gf__list{border-right:0;border-top:1px solid rgba(255,255,255,.06);max-height:38vh}
  .pmh-gf__detail{border-left:0;max-height:44vh}
  .pmh-gf__state{display:none}
  .pmh-gf__pfad{max-width:100%;margin-left:0}
  .pmh-gf__stats{flex-wrap:wrap;gap:12px 18px}
  .pmh-gf__legende{display:none}
}
`

/**
 * Der Stil des Panels.
 *
 * **Warum das heraussteht.** `apply` hängt ihn beim Laden in den Kopf; eine
 * Prüfseite ohne den Plugin-Kontext braucht denselben Text und soll ihn nicht
 * abschreiben. Eine zweite Kopie des Stils wäre beim nächsten Farbwechsel
 * falsch — und zwar still.
 */
export const PANEL_CSS = CSS
