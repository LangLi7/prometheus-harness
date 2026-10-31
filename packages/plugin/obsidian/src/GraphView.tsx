/**
 * **Die Graph-Ansicht — gezeichnet auf Canvas, nicht als SVG.**
 *
 * Der erste Wurf war eine `<svg>` mit einem fertig gerechneten Layout: ein Bild,
 * kein Graph. Bei 678 Notizen und 3 937 Kanten ist SVG außerdem der falsche
 * Unterbau — jede Linie ist ein DOM-Knoten, und beim Ziehen ruckelt es.
 *
 * Was jetzt passiert, ist dasselbe, was Obsidians eigene Graph-Ansicht tut:
 *
 * | Geste | Wirkung |
 * |---|---|
 * | ziehen auf der Fläche | verschieben |
 * | Rad | zoomen um den Zeiger |
 * | Knoten ziehen | festhalten; die Nachbarn folgen über die Federn |
 * | Klick auf Knoten | Notiz öffnen |
 * | Zeiger über Knoten | seine Kanten und Nachbarn treten hervor |
 *
 * Gerechnet wird **schrittweise** ({@link starteLauf} / {@link schreibeSchritt}):
 * der Graph schwingt ein, statt zu springen — und ein gezogener Knoten bewegt
 * das Bild weiter, weil die Federn jede Runde neu ziehen.
 *
 * @module @prometheus-harness/obsidian/GraphView
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Lauf, VaultGraph } from './graph.ts'
import { baueAusschnitt, istRuhig, nachbarschaft, schreibeSchritt, starteLauf } from './graph.ts'

/** Was die Ansicht braucht. */
interface Props {
  readonly graph: VaultGraph
  readonly gewaehlt: string | null
  readonly onSelect: (pfad: string) => void
  readonly t: TranslateNS<'obsidian'>
}

/** Die Zeichenfläche in Benutzerkoordinaten. */
const BREITE = 760
const HOEHE = 470

/** Eine Sicht: Zoom und Verschiebung. */
interface Sicht {
  k: number
  tx: number
  ty: number
}

/**
 * Die Ansicht.
 *
 * @param props - Graph, Auswahl, Rückruf und Übersetzer
 * @returns Bild, Filter und Verweislisten
 */
export function GraphView({ graph, gewaehlt, onSelect, t }: Props): ReactElement {
  const [weit, setWeit] = useState(false)
  const [suche, setSuche] = useState('')
  const leinwand = useRef<HTMLCanvasElement | null>(null)
  const lauf = useRef<Lauf | null>(null)
  const sicht = useRef<Sicht>({ k: 1, tx: 0, ty: 0 })
  const ziehen = useRef<{ art: 'knoten' | 'flaeche'; index: number; x: number; y: number; bewegt: boolean } | null>(null)
  const ueber = useRef<number>(-1)
  const schmutzig = useRef(true)

  const mitte = useMemo(() => {
    if (gewaehlt === null) return null
    const treffer = graph.nodes.find((knoten) => knoten.path === gewaehlt || knoten.id === gewaehlt)
    return treffer?.id ?? `obsidian:${gewaehlt}`
  }, [graph, gewaehlt])

  const ausschnitt = useMemo(
    () => baueAusschnitt(graph, mitte, weit ? Number.POSITIVE_INFINITY : 2),
    [graph, mitte, weit],
  )
  const verweise = useMemo(() => nachbarschaft(graph, mitte), [graph, mitte])
  const trifft = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (begriff === '') return null
    const treffer = new Set<string>()
    for (const knoten of ausschnitt.knoten) {
      if (`${knoten.label} ${knoten.path ?? ''}`.toLowerCase().includes(begriff)) treffer.add(knoten.id)
    }
    return treffer
  }, [suche, ausschnitt])

  // Ein neuer Ausschnitt ist ein neues Bild: Layout und Sicht beginnen neu.
  useEffect(() => {
    lauf.current = starteLauf(ausschnitt, BREITE, HOEHE)
    sicht.current = { k: 1, tx: 0, ty: 0 }
    schmutzig.current = true
  }, [ausschnitt])

  useEffect(() => {
    let raf = 0
    const zeichne = (): void => {
      const canvas = leinwand.current
      const zustand = lauf.current
      if (canvas === null || zustand === null) return
      const dpr = window.devicePixelRatio || 1
      const breite = canvas.clientWidth
      const hoehe = canvas.clientHeight
      if (breite === 0 || hoehe === 0) return
      if (canvas.width !== Math.round(breite * dpr) || canvas.height !== Math.round(hoehe * dpr)) {
        canvas.width = Math.round(breite * dpr)
        canvas.height = Math.round(hoehe * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (ctx === null) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, breite, hoehe)
      const { k, tx, ty } = sicht.current
      ctx.save()
      ctx.translate(tx, ty)
      ctx.scale(k, k)

      const fokus = ueber.current >= 0 ? zustand.knoten[ueber.current] : undefined
      const nachbar = new Set<string>()
      if (fokus !== undefined) {
        for (const kante of zustand.kanten) {
          const a = zustand.knoten[kante.a]
          const b = zustand.knoten[kante.b]
          if (a?.id === fokus.id && b !== undefined) nachbar.add(b.id)
          if (b?.id === fokus.id && a !== undefined) nachbar.add(a.id)
        }
      }

      for (const kante of zustand.kanten) {
        const a = zustand.knoten[kante.a]
        const b = zustand.knoten[kante.b]
        if (a === undefined || b === undefined) continue
        const aktiv = fokus !== undefined && (a.id === fokus.id || b.id === fokus.id)
        const gedimmt = (trifft !== null && !trifft.has(a.id) && !trifft.has(b.id)) || (fokus !== undefined && !aktiv)
        ctx.strokeStyle = aktiv ? 'rgba(196,175,255,0.75)' : gedimmt ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.13)'
        ctx.lineWidth = (aktiv ? 1.5 : 0.8) / k
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      for (let i = 0; i < zustand.knoten.length; i += 1) {
        const knoten = zustand.knoten[i]
        if (knoten === undefined) continue
        const gedimmt =
          (trifft !== null && !trifft.has(knoten.id)) ||
          (fokus !== undefined && knoten.id !== fokus.id && !nachbar.has(knoten.id))
        const radius = knoten.r / Math.max(0.6, Math.sqrt(k))
        ctx.beginPath()
        ctx.arc(knoten.x, knoten.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = knoten.mitte
          ? '#c9b8ff'
          : gedimmt
            ? 'rgba(190,190,210,0.18)'
            : fokus !== undefined && nachbar.has(knoten.id)
              ? '#e4dcff'
              : 'rgba(200,200,220,0.62)'
        ctx.fill()
        if (knoten.mitte) {
          ctx.strokeStyle = '#f2ecff'
          ctx.lineWidth = 1.5 / k
          ctx.stroke()
        }

        const zeigeLabel = knoten.mitte || knoten.grad >= 4 || fokus?.id === knoten.id
        if (zeigeLabel && k > 0.55) {
          const text = knoten.label.length > 28 ? `${knoten.label.slice(0, 27)}…` : knoten.label
          ctx.font = `${String(Math.round(11 / k))}px ui-monospace, SFMono-Regular, Menlo, monospace`
          ctx.textAlign = 'center'
          ctx.fillStyle = gedimmt ? 'rgba(236,238,248,0.18)' : 'rgba(236,238,248,0.78)'
          ctx.fillText(text, knoten.x, knoten.y + radius + 13 / k)
        }
      }
      ctx.restore()
    }

    const schleife = (): void => {
      const zustand = lauf.current
      if (zustand !== null && (!istRuhig(zustand) || ziehen.current !== null)) {
        schreibeSchritt(zustand)
        schmutzig.current = true
      }
      if (schmutzig.current) {
        zeichne()
        schmutzig.current = false
      }
      raf = requestAnimationFrame(schleife)
    }
    raf = requestAnimationFrame(schleife)
    return () => cancelAnimationFrame(raf)
  }, [trifft])

  const welt = (ereignis: { clientX: number; clientY: number }): { x: number; y: number } => {
    const canvas = leinwand.current
    if (canvas === null) return { x: 0, y: 0 }
    const kasten = canvas.getBoundingClientRect()
    const { k, tx, ty } = sicht.current
    return { x: (ereignis.clientX - kasten.left - tx) / k, y: (ereignis.clientY - kasten.top - ty) / k }
  }

  const knotenUnter = (punkt: { x: number; y: number }): number => {
    const zustand = lauf.current
    if (zustand === null) return -1
    for (let i = zustand.knoten.length - 1; i >= 0; i -= 1) {
      const knoten = zustand.knoten[i]
      if (knoten === undefined) continue
      const dx = knoten.x - punkt.x
      const dy = knoten.y - punkt.y
      if (dx * dx + dy * dy <= (knoten.r + 6) ** 2) return i
    }
    return -1
  }

  return (
    <div className="pmh-ob__graph">
      <div className="pmh-ob__graphleiste">
        <button className={weit ? 'pmh-ob__tool' : 'pmh-ob__tool is-aktiv'} type="button" onClick={() => setWeit(false)}>
          {t('neighbourhood')}
        </button>
        <button className={weit ? 'pmh-ob__tool is-aktiv' : 'pmh-ob__tool'} type="button" onClick={() => setWeit(true)}>
          {t('wholeVault')}
        </button>
        <input
          className="pmh-ob__graphsuche"
          type="search"
          value={suche}
          onChange={(ereignis) => setSuche(ereignis.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
        />
        <span className="pmh-ob__graphstand">
          {ausschnitt.knoten.length} / {ausschnitt.gesamt} {t('notes')}
          {ausschnitt.gekappt ? ` · ${t('truncated')}` : ''}
        </span>
      </div>

      {ausschnitt.knoten.length === 0 ? (
        <p className="pmh-ob__leer">{t('select')}</p>
      ) : (
        <canvas
          ref={leinwand}
          className="pmh-ob__canvas"
          role="img"
          aria-label={t('graph')}
          onPointerDown={(ereignis) => {
            const punkt = welt(ereignis)
            const index = knotenUnter(punkt)
            ereignis.currentTarget.setPointerCapture?.(ereignis.pointerId)
            if (index >= 0) {
              const knoten = lauf.current?.knoten[index]
              if (knoten !== undefined) knoten.fest = true
              ziehen.current = { art: 'knoten', index, x: punkt.x, y: punkt.y, bewegt: false }
            } else {
              ziehen.current = { art: 'flaeche', index: -1, x: ereignis.clientX, y: ereignis.clientY, bewegt: false }
            }
            schmutzig.current = true
          }}
          onPointerMove={(ereignis) => {
            const punkt = welt(ereignis)
            const griff = ziehen.current
            if (griff !== null) {
              griff.bewegt = true
              if (griff.art === 'knoten') {
                const knoten = lauf.current?.knoten[griff.index]
                if (knoten !== undefined) {
                  knoten.x = punkt.x
                  knoten.y = punkt.y
                }
              } else {
                sicht.current.tx += ereignis.clientX - griff.x
                sicht.current.ty += ereignis.clientY - griff.y
                griff.x = ereignis.clientX
                griff.y = ereignis.clientY
              }
            } else {
              ueber.current = knotenUnter(punkt)
            }
            schmutzig.current = true
          }}
          onPointerUp={(ereignis) => {
            const griff = ziehen.current
            ziehen.current = null
            if (griff !== null && griff.art === 'knoten') {
              const knoten = lauf.current?.knoten[griff.index]
              // Die Mitte bleibt fest, ein gezogener Knoten wird wieder frei.
              if (knoten !== undefined && !knoten.mitte) knoten.fest = false
              if (!griff.bewegt) {
                const pfad = knoten?.path
                if (pfad !== null && pfad !== undefined) onSelect(pfad)
              }
            }
            ereignis.currentTarget.releasePointerCapture?.(ereignis.pointerId)
            schmutzig.current = true
          }}
          onPointerLeave={() => {
            ueber.current = -1
            schmutzig.current = true
          }}
          onWheel={(ereignis) => {
            const canvas = leinwand.current
            if (canvas === null) return
            const kasten = canvas.getBoundingClientRect()
            const sx = ereignis.clientX - kasten.left
            const sy = ereignis.clientY - kasten.top
            const alt = sicht.current.k
            const neu = Math.min(4, Math.max(0.25, alt * (ereignis.deltaY < 0 ? 1.12 : 0.89)))
            // Der Punkt unter dem Zeiger bleibt stehen.
            sicht.current.tx = sx - ((sx - sicht.current.tx) / alt) * neu
            sicht.current.ty = sy - ((sy - sicht.current.ty) / alt) * neu
            sicht.current.k = neu
            schmutzig.current = true
          }}
        />
      )}

      <div className="pmh-ob__verweise">
        <section>
          <h4>
            {t('linksIn')} <span className="pmh-ob__zahl">{verweise.eingehend.length}</span>
          </h4>
          {verweise.eingehend.length === 0 ? (
            <p className="pmh-ob__leer">{t('none')}</p>
          ) : (
            <ul>
              {verweise.eingehend.map((knoten) => (
                <li key={knoten.id}>
                  <button
                    type="button"
                    onClick={() => knoten.path !== undefined && onSelect(knoten.path)}
                    title={knoten.path ?? knoten.label}
                  >
                    {knoten.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h4>
            {t('linksOut')} <span className="pmh-ob__zahl">{verweise.ausgehend.length}</span>
          </h4>
          {verweise.ausgehend.length === 0 ? (
            <p className="pmh-ob__leer">{t('none')}</p>
          ) : (
            <ul>
              {verweise.ausgehend.map((knoten) => (
                <li key={knoten.id}>
                  <button
                    type="button"
                    onClick={() => knoten.path !== undefined && onSelect(knoten.path)}
                    title={knoten.path ?? knoten.label}
                  >
                    {knoten.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
