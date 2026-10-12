import { useEffect, useRef, useState } from 'react'
import type { IslandGroup, IslandItem } from './island-data'
import './ChannelsIsland.css'

export interface ChannelsIslandProps {
  /** Text rechts neben dem Titel, in der Vorlage `projekt: prometheus`. */
  readonly project: string
  readonly groups: readonly IslandGroup[]
  /** `id` des hervorgehobenen Eintrags (`a.on` in der Vorlage). */
  readonly activeId: string | null
  readonly onSelect: (item: IslandItem) => void
  /** Text rechts in der eingeklappten Pille — in der Vorlage `#main · ornith-9b`. */
  readonly summary: string
  /** Startzustand: false = eingeklappte Pille (so startet die Vorlage), true = aufgeklappt. */
  readonly defaultOpen?: boolean
  /** Nach der Wahl eines Eintrags wieder einklappen — Verhalten der Vorlage (150 ms). */
  readonly collapseOnSelect?: boolean
}

/** Wartezeit zwischen Wahl und Einklappen — Zahl aus der Vorlage (`setTimeout(…, 150)`). */
const COLLAPSE_DELAY_MS = 150

/**
 * Dynamic Island: eingeklappte Pille ⇄ CHANNELS-Fläche.
 *
 * Markup und Form sind aus der Vorlage übernommen:
 * H:\Projekt\Programmieren\Prometheus\webui\src\App.svelte (Zeilen 313–337) samt der
 * zugehörigen Regeln aus deren <style>-Block (Zeilen 530–548).
 *
 * Nachgebaut ist auch die **Funktion** der Vorlage:
 *   - Start eingeklappt als Pille: Punkt, `PROMETHEUS`, Zustand (`#main · ornith-9b`)
 *   - Klick auf die Pille → aufgeklappte CHANNELS-Fläche (Breite/Höhe animiert über die
 *     Übergänge aus dem Vorlagen-CSS)
 *   - Wahl eines Eintrags → Eintrag wird aktiv (`.on`) und die Insel klappt nach 150 ms ein
 *   - ✕ klappt sofort ein
 *   - Escape klappt ein, der Fokus wandert zurück auf die Pille
 *
 * Bewusste Abweichungen gegenüber der Vorlage:
 *  - Die Einträge sind `<button>` statt `<a>` ohne `href`: klickbare Elemente brauchen
 *    Rolle und Tastaturweg (Befund „Barrierefreiheit" in docs/design/ui-keep-cut.md).
 *    Klassen und Aussehen bleiben gleich. Ebenso hat die Pille `role="button"` und
 *    `aria-expanded`.
 *  - Die Einträge kommen aus `groups` statt aus fest verdrahtetem Markup; dadurch heißen
 *    die Präfix- und Marken-Spans `.sigil` und `.badge` statt `.h` und `.b`.
 *  - Die Vorlage holt den Zustandstext per `textContent` aus dem angeklickten Element
 *    (`pickChannel`); hier kommt er als `summary` von außen — dasselbe Ergebnis ohne
 *    Zugriff auf das DOM.
 *  - Die Vorlage setzt `projekt: prometheus` und den Modellnamen fest; beides ist hier
 *    Eingabe (`project`, `summary`).
 */
export default function ChannelsIsland({
  project,
  groups,
  activeId,
  onSelect,
  summary,
  defaultOpen = false,
  collapseOnSelect = true,
}: ChannelsIslandProps) {
  const [open, setOpen] = useState(defaultOpen)
  const miniRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const wasOpen = useRef(open)
  const collapseTimer = useRef<number | null>(null)

  // Nach dem Einklappen den Fokus auf die Pille setzen, damit die Tastatur nicht in
  // einem unsichtbaren Element hängt.
  useEffect(() => {
    if (wasOpen.current && !open) miniRef.current?.focus()
    wasOpen.current = open
  }, [open])

  // Solange die Fläche offen ist: Escape klappt ein, und der Fokus wandert in die Fläche.
  // Am Dokument statt am Container, weil die zuvor fokussierte Pille beim Aufklappen aus
  // dem DOM verschwindet — der Fokus läge sonst auf <body> und Tastendrücke kämen nie an
  // (genau das hat der Verhaltenstest als Fehler aufgedeckt).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') collapse()
    }
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => () => {
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current)
  }, [])

  function collapse() {
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current)
    setOpen(false)
  }

  function pick(item: IslandItem) {
    onSelect(item)
    if (!collapseOnSelect) return
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current)
    collapseTimer.current = window.setTimeout(() => setOpen(false), COLLAPSE_DELAY_MS)
  }

  return (
    <div className={open ? 'isl max' : 'isl'} ref={panelRef} tabIndex={-1}>
      {open ? (
        <div className="full">
          <div className="head">
            <b>◆ CHANNELS</b>
            <span>projekt: {project}</span>
            <button type="button" className="x" aria-label="Insel schließen" onClick={collapse}>
              ✕
            </button>
          </div>
          <div className="ch">
            {groups.map((group) => (
              <div className="group" key={group.title}>
                <div className="grp">{group.title}</div>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === activeId ? 'item on' : 'item'}
                    aria-current={item.id === activeId ? 'true' : undefined}
                    onClick={() => pick(item)}
                  >
                    <span className="sigil">{item.sigil}</span>
                    {item.label}
                    {item.badge ? <span className="badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="mini"
          ref={miniRef}
          role="button"
          tabIndex={0}
          aria-expanded={false}
          aria-label="Kanäle öffnen"
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          <span className="dot" />
          <b>PROMETHEUS</b>
          <span>{summary}</span>
        </div>
      )}
    </div>
  )
}
