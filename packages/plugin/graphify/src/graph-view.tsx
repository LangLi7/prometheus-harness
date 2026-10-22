/**
 * **Der gezeichnete Graph.**
 *
 * Ein Canvas, kein SVG: einige hundert Knoten und ihre Kanten sollen beim
 * Ziehen und Zoomen flüssig bleiben. Gezeichnet wird in drei Schichten —
 * Kanten, Knoten, Namen —, und die Namen nur dort, wo sie lesbar bleiben.
 *
 * **Was hier bewußt fehlt.** Keine Legende, keine Werkzeugleiste: beides steht
 * im Panel, damit dieselben Schalter auch für die Liste gelten und die Fläche
 * nicht zwei Bedienungen hat.
 *
 * @module @prometheus-harness/graphify/graph-view
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { baueSim, grenzen, schritt, type Sim } from './sim.ts'
import { farbeFuer, type Ansicht, type Ausschnitt } from './view.ts'

/** Was gerade gezogen wird. */
type Griff =
  | { readonly art: 'knoten'; readonly stelle: number; mx: number; my: number; bewegt: boolean }
  | { readonly art: 'flaeche'; mx: number; my: number; bewegt: boolean }

/** Die Sicht auf den Layoutraum: Maßstab und Verschiebung in Pixeln. */
interface Sicht {
  k: number
  x: number
  y: number
}

interface Props {
  readonly ausschnitt: Ausschnitt
  readonly farbe: Ansicht['farbe']
  readonly beschriftungen: boolean
  readonly bewegung: boolean
  readonly gewaehlt: string | null
  readonly onSelect: (id: string) => void
  /** Zählt hoch, wenn „Anordnen" gedrückt wurde — ein neuer Start derselben Knoten. */
  readonly seed: number
  readonly t: TranslateNS<'graphify'>
}

/** So nah muß der Zeiger an einem Knoten sein, um ihn zu treffen. */
const TREFFER = 13

/** So viele Schritte rechnet ein ruhendes Layout, bevor es stillsteht. */
const VORLAUF = 360

/**
 * Die gezeichnete Fläche.
 *
 * @param props - Ausschnitt, Anzeigeregeln und der gewählte Knoten
 * @returns das Canvas mit seinen Griffen
 */
export function GraphCanvas({
  ausschnitt,
  farbe,
  beschriftungen,
  bewegung,
  gewaehlt,
  onSelect,
  seed,
  t,
}: Props): ReactElement {
  const huelle = useRef<HTMLDivElement | null>(null)
  const leinwand = useRef<HTMLCanvasElement | null>(null)
  const sim = useRef<Sim | null>(null)
  const sicht = useRef<Sicht>({ k: 1, x: 0, y: 0 })
  const kasten = useRef({ w: 0, h: 0 })
  const zeiger = useRef<{ x: number; y: number } | null>(null)
  const griff = useRef<Griff | null>(null)
  const waerme = useRef(0)
  const schmutzig = useRef(true)
  const brauchtFit = useRef(true)
  const zeichneRef = useRef<() => void>(() => undefined)
  const [zoom, setZoom] = useState(1)

  /** Setzt Maßstab und Verschiebung so, daß der Ausschnitt in die Fläche paßt. */
  const passeEin = useCallback((layout: Sim, breite: number, hoehe: number) => {
    const raum = grenzen(layout, 0.02)
    const weit = Math.max(1, raum.maxX - raum.minX)
    const hoch = Math.max(1, raum.maxY - raum.minY)
    const rand = 46
    const k = Math.max(0.06, Math.min((breite - rand * 2) / weit, (hoehe - rand * 2) / hoch, 2.4))
    sicht.current = {
      k,
      x: -((raum.minX + raum.maxX) / 2) * k,
      y: -((raum.minY + raum.maxY) / 2) * k,
    }
    setZoom(k)
  }, [])

  const passt = useCallback(() => {
    const layout = sim.current
    const { w, h } = kasten.current
    if (layout === null || w === 0 || h === 0) return
    passeEin(layout, w, h)
    schmutzig.current = true
  }, [passeEin])

  /** Ändert den Maßstab um einen Faktor, um die Mitte der Fläche. */
  const zoome = useCallback((faktor: number) => {
    const k = Math.max(0.06, Math.min(4, sicht.current.k * faktor))
    sicht.current = { ...sicht.current, k }
    setZoom(k)
    schmutzig.current = true
  }, [])

  /** Rechnet Bildschirmpixel in den Layoutraum um. */
  const welt = useCallback((mx: number, my: number) => {
    const { w, h } = kasten.current
    const { k, x, y } = sicht.current
    return { x: (mx - w / 2 - x) / k, y: (my - h / 2 - y) / k }
  }, [])

  /** Sucht den nächsten Knoten unter dem Zeiger. */
  const treffer = useCallback((mx: number, my: number): number | null => {
    const layout = sim.current
    if (layout === null) return null
    const { w, h } = kasten.current
    const { k, x, y } = sicht.current
    let bestes: number | null = null
    let naehe = TREFFER
    for (const [stelle, knoten] of layout.nodes.entries()) {
      const px = knoten.x * k + w / 2 + x
      const py = knoten.y * k + h / 2 + y
      const abstand = Math.hypot(px - mx, py - my)
      if (abstand < naehe) {
        naehe = abstand
        bestes = stelle
      }
    }
    return bestes
  }, [])

  /** Zeichnet die aktuelle Sicht. */
  const zeichne = useCallback(() => {
    const el = leinwand.current
    const layout = sim.current
    if (el === null) return
    const ctx = el.getContext('2d')
    if (ctx === null) return
    const { w, h } = kasten.current
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (layout === null || layout.nodes.length === 0) return

    const { k, x: sx, y: sy } = sicht.current
    const mitteX = w / 2 + sx
    const mitteY = h / 2 + sy
    const stelleVon = new Map<string, number>()
    const px: number[] = []
    const py: number[] = []
    for (const [stelle, knoten] of layout.nodes.entries()) {
      stelleVon.set(knoten.id, stelle)
      px.push(knoten.x * k + mitteX)
      py.push(knoten.y * k + mitteY)
    }
    const zeigerKnoten = zeiger.current === null ? null : treffer(zeiger.current.x, zeiger.current.y)
    const gewaehltStelle = gewaehlt === null ? undefined : stelleVon.get(gewaehlt)

    // Ein feines Raster gibt der Fläche Tiefe, ohne den Knoten Konkurrenz zu machen.
    ctx.fillStyle = 'rgba(143,227,198,.055)'
    const raster = 46
    for (let gx = (mitteX % raster) - raster; gx < w; gx += raster) {
      for (let gy = (mitteY % raster) - raster; gy < h; gy += raster) {
        ctx.fillRect(gx, gy, 1, 1)
      }
    }

    // Kanten: erst alle blassen, dann die des gewählten Knotens.
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(143,227,198,.15)'
    ctx.beginPath()
    for (const kante of layout.edges) {
      const a = kante.a
      const b = kante.b
      if (a === gewaehltStelle || b === gewaehltStelle) continue
      const ax = px[a]
      const ay = py[a]
      const bx = px[b]
      const by = py[b]
      if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
    }
    ctx.stroke()

    if (gewaehltStelle !== undefined) {
      ctx.strokeStyle = 'rgba(88,224,174,.42)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      for (const kante of layout.edges) {
        if (kante.a !== gewaehltStelle && kante.b !== gewaehltStelle) continue
        const a = kante.a
        const b = kante.b
        const ax = px[a]
        const ay = py[a]
        const bx = px[b]
        const by = py[b]
        if (ax === undefined || ay === undefined || bx === undefined || by === undefined) continue
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
      }
      ctx.stroke()
    }

    // Knoten.
    for (const [stelle, knoten] of layout.nodes.entries()) {
      const x = px[stelle]
      const y = py[stelle]
      if (x === undefined || y === undefined) continue
      const radius = 2.3 + Math.min(5.8, Math.sqrt(knoten.degree) * 0.85)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = farbeFuer(knoten, farbe)
      ctx.fill()
      if (stelle === gewaehltStelle) {
        ctx.strokeStyle = '#f2fff9'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
        ctx.stroke()
      } else if (stelle === zeigerKnoten) {
        ctx.strokeStyle = 'rgba(255,255,255,.55)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // Namen — nur wo Platz bleibt.
    const kandidaten = layout.nodes
      .map((knoten, stelle) => ({ knoten, stelle }))
      .filter(
        ({ knoten, stelle }) =>
          stelle === gewaehltStelle ||
          stelle === zeigerKnoten ||
          (beschriftungen && knoten.degree >= 7),
      )
      .sort((a, b) => b.knoten.degree - a.knoten.degree)
      .slice(0, 18)

    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'middle'
    const belegt: { x: number; y: number; w: number; h: number }[] = []
    for (const { knoten, stelle } of kandidaten) {
      const x = px[stelle]
      const y = py[stelle]
      if (x === undefined || y === undefined) continue
      const breite = ctx.measureText(knoten.label).width
      const radius = 2.3 + Math.min(5.8, Math.sqrt(knoten.degree) * 0.85)
      const links = x + radius + 5
      const oben = y - 5
      const kollision = belegt.some(
        (feld) =>
          links < feld.x + feld.w + 4 &&
          links + breite + 4 > feld.x &&
          oben < feld.y + feld.h &&
          oben + 11 > feld.y,
      )
      if (kollision && stelle !== gewaehltStelle && stelle !== zeigerKnoten) continue
      belegt.push({ x: links, y: oben, w: breite, h: 11 })
      ctx.fillStyle =
        stelle === gewaehltStelle ? '#f2fff9' : stelle === zeigerKnoten ? '#d8fff1' : 'rgba(233,243,240,.66)'
      ctx.fillText(knoten.label, links, y + 0.5)
    }
  }, [beschriftungen, farbe, gewaehlt, treffer])

  useEffect(() => {
    zeichneRef.current = zeichne
    schmutzig.current = true
  }, [zeichne])

  // Größe der Fläche folgt dem Behälter, nicht dem Fenster.
  useEffect(() => {
    const el = huelle.current
    if (el === null) return
    const beobachter = new ResizeObserver((eintraege) => {
      const feld = eintraege[0]?.contentRect
      if (feld === undefined) return
      const breite = Math.max(1, feld.width)
      const hoehe = Math.max(1, feld.height)
      kasten.current = { w: breite, h: hoehe }
      const canvas = leinwand.current
      if (canvas !== null) {
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(breite * dpr)
        canvas.height = Math.round(hoehe * dpr)
      }
      const layout = sim.current
      if (layout !== null && brauchtFit.current) {
        passeEin(layout, breite, hoehe)
        brauchtFit.current = false
      }
      schmutzig.current = true
    })
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [passeEin])

  // Neuer Ausschnitt oder neuer Start: Layout bauen.
  useEffect(() => {
    const layout = baueSim(ausschnitt.nodes, ausschnitt.edges)
    sim.current = layout
    if (bewegung) {
      // Ein paar Schritte vor dem ersten Bild: sonst sieht man kurz die Spirale,
      // aus der sich das Layout erst noch löst.
      for (let i = 0; i < 90; i += 1) schritt(layout)
      waerme.current = 1
    } else {
      for (let i = 0; i < VORLAUF; i += 1) schritt(layout)
      waerme.current = 0
    }
    const { w, h } = kasten.current
    if (w > 0 && h > 0) {
      passeEin(layout, w, h)
      brauchtFit.current = false
    } else {
      brauchtFit.current = true
    }
    schmutzig.current = true
  }, [ausschnitt, seed, bewegung, passeEin])

  // Der einzige Takt: rechnen, wenn Wärme da ist, zeichnen, wenn etwas anders ist.
  useEffect(() => {
    let rahmen = 0
    let weiter = true
    const takt = (): void => {
      if (!weiter) return
      if (!document.hidden) {
        const layout = sim.current
        const zieht = griff.current !== null
        if (layout !== null && (waerme.current > 0 || zieht)) {
          schritt(layout)
          waerme.current = Math.max(0, waerme.current * 0.986)
          if (waerme.current < 0.004 && !zieht) waerme.current = 0
          schmutzig.current = true
        }
        if (schmutzig.current) {
          zeichneRef.current()
          schmutzig.current = false
        }
      }
      rahmen = requestAnimationFrame(takt)
    }
    rahmen = requestAnimationFrame(takt)
    return () => {
      weiter = false
      cancelAnimationFrame(rahmen)
    }
  }, [])

  const zeige = (mx: number, my: number): void => {
    zeiger.current = { x: mx, y: my }
    const el = leinwand.current
    if (el !== null) {
      const naehe = treffer(mx, my)
      el.style.cursor = naehe === null ? 'grab' : 'pointer'
    }
    schmutzig.current = true
  }

  const unten = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const el = leinwand.current
    if (el === null) return
    const feld = el.getBoundingClientRect()
    const mx = event.clientX - feld.left
    const my = event.clientY - feld.top
    const naehe = treffer(mx, my)
    el.setPointerCapture(event.pointerId)
    if (naehe === null) {
      griff.current = { art: 'flaeche', mx, my, bewegt: false }
      el.style.cursor = 'grabbing'
    } else {
      griff.current = { art: 'knoten', stelle: naehe, mx, my, bewegt: false }
      const knoten = sim.current?.nodes[naehe]
      if (knoten !== undefined) knoten.fix = true
      waerme.current = Math.max(waerme.current, 0.45)
    }
  }

  const bewege = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const el = leinwand.current
    if (el === null) return
    const feld = el.getBoundingClientRect()
    const mx = event.clientX - feld.left
    const my = event.clientY - feld.top
    const jetzt = griff.current
    if (jetzt === null) {
      zeige(mx, my)
      return
    }
    const dx = mx - jetzt.mx
    const dy = my - jetzt.my
    if (Math.abs(dx) + Math.abs(dy) > 3) jetzt.bewegt = true
    if (jetzt.art === 'flaeche') {
      sicht.current = { ...sicht.current, x: sicht.current.x + dx, y: sicht.current.y + dy }
    } else {
      const knoten = sim.current?.nodes[jetzt.stelle]
      if (knoten !== undefined) {
        const ziel = welt(mx, my)
        knoten.x = ziel.x
        knoten.y = ziel.y
        knoten.vx = 0
        knoten.vy = 0
      }
    }
    jetzt.mx = mx
    jetzt.my = my
    zeiger.current = { x: mx, y: my }
    schmutzig.current = true
  }

  const oben = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const el = leinwand.current
    const jetzt = griff.current
    griff.current = null
    if (el !== null) {
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
      el.style.cursor = 'grab'
    }
    if (jetzt === null) return
    if (jetzt.art === 'knoten') {
      const knoten = sim.current?.nodes[jetzt.stelle]
      if (knoten !== undefined) knoten.fix = false
      if (!jetzt.bewegt) {
        const id = knoten?.id
        if (id !== undefined) onSelect(id)
      }
      waerme.current = Math.max(waerme.current, 0.25)
    }
    schmutzig.current = true
  }

  // Das Mausrad zoomt um den Zeiger, nicht um die Mitte. Nativ, weil ein
  // React-Wheel-Handler passiv am Wurzelelement hängt und `preventDefault`
  // dort wirkungslos bliebe — die Seite würde mitscrollen.
  useEffect(() => {
    const el = leinwand.current
    if (el === null) return
    const behandeln = (event: WheelEvent): void => {
      event.preventDefault()
      const feld = el.getBoundingClientRect()
      const mx = event.clientX - feld.left
      const my = event.clientY - feld.top
      const { w, h } = kasten.current
      const vorher = sicht.current
      const punkt = {
        x: (mx - w / 2 - vorher.x) / vorher.k,
        y: (my - h / 2 - vorher.y) / vorher.k,
      }
      const k = Math.max(0.06, Math.min(4, vorher.k * Math.exp(-event.deltaY * 0.0014)))
      sicht.current = { k, x: mx - w / 2 - punkt.x * k, y: my - h / 2 - punkt.y * k }
      setZoom(k)
      schmutzig.current = true
    }
    el.addEventListener('wheel', behandeln, { passive: false })
    return () => el.removeEventListener('wheel', behandeln)
  }, [])

  return (
    <div className="pmh-gf__leinwand" ref={huelle}>
      <canvas
        ref={leinwand}
        className="pmh-gf__canvas"
        onPointerDown={unten}
        onPointerMove={bewege}
        onPointerUp={oben}
        onPointerCancel={oben}
        onPointerLeave={() => {
          zeiger.current = null
          const el = leinwand.current
          if (el !== null) el.style.cursor = 'grab'
          schmutzig.current = true
        }}
        role="application"
        aria-label={t('graph')}
      />
      {ausschnitt.nodes.length === 0 ? <p className="pmh-gf__leinwandleer">{t('noNodes')}</p> : null}
      <div className="pmh-gf__zoombar" role="group" aria-label={t('zoom')}>
        <button type="button" onClick={() => zoome(1.35)} title={t('zoomIn')} aria-label={t('zoomIn')}>
          +
        </button>
        <button type="button" onClick={() => zoome(1 / 1.35)} title={t('zoomOut')} aria-label={t('zoomOut')}>
          −
        </button>
        <button type="button" onClick={passt} title={t('fit')} aria-label={t('fit')}>
          ⤢
        </button>
      </div>
      <span className="pmh-gf__zoomwert">{Math.round(zoom * 100)} %</span>
    </div>
  )
}
