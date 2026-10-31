/**
 * **Die Browser-Hälfte: ein Pill im Composer.**
 *
 * Der ganze Schalter ist ein Knopf — kein Panel, kein Fenster, keine zweite Seite. Er sitzt in
 * `conversation.input.left`, der Werkzeugzeile des Eingabefelds, weil er dorthin gehört: er
 * ändert, wie der Agent **schreibt**, nicht was die Anwendung kann.
 *
 * **Klick schaltet an und aus. Alt+Klick wechselt die Stufe.** Beides zusammen wäre eine
 * Auswahlliste mit vier Zeilen — für einen Schalter zu viel. Die Stufe steht am Pill; wer sie
 * ändern will, findet sie im Titel.
 *
 * @module @prometheus-harness/ponytail/client
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dieselbe Adresse wie in `src/index.ts`. */
const WEG = '/api/pmh/ponytail'

/** Die vier Zustände — bewußt hier noch einmal: das Bündel teilt keinen Code mit dem Host. */
const MODI = ['off', 'lite', 'full', 'ultra'] as const

/** Ein Zustand. */
type Modus = (typeof MODI)[number]

/** Der nächste im Kreis. */
function naechster(modus: Modus): Modus {
  return MODI[(MODI.indexOf(modus) + 1) % MODI.length] ?? 'full'
}

/** Ist der Wert ein bekannter Zustand? */
function istModus(wert: unknown): wert is Modus {
  return typeof wert === 'string' && (MODI as readonly string[]).includes(wert)
}

/**
 * Der Pill.
 *
 * **Warum der Zustand optimistisch gesetzt wird.** Ein Schalter, der erst nach der Antwort
 * umspringt, fühlt sich kaputt an. Schlägt die Anfrage fehl, springt er zurück — das ist die
 * einzige ehrliche Reihenfolge.
 *
 * @returns der Knopf
 */
export function PonytailPill(): ReactElement {
  const [modus, setModus] = useState<Modus>('off')
  const [fehler, setFehler] = useState<string | null>(null)
  const letzteStufe = useRef<Modus>('full')
  const [bereit, setBereit] = useState(false)

  useEffect(() => {
    let ab = false
    fetch(WEG, { headers: { accept: 'application/json' } })
      .then(async (antwort) => {
        if (!antwort.ok) throw new Error(`HTTP ${String(antwort.status)}`)
        const daten: unknown = await antwort.json()
        const gelesen = (daten as { modus?: unknown }).modus
        if (!ab && istModus(gelesen)) {
          setModus(gelesen)
          if (gelesen !== 'off') letzteStufe.current = gelesen
        }
      })
      .catch((problem: unknown) => {
        if (!ab) setFehler(problem instanceof Error ? problem.message : String(problem))
      })
      .finally(() => {
        if (!ab) setBereit(true)
      })
    return () => {
      ab = true
    }
  }, [])

  const setze = async (neu: Modus): Promise<void> => {
    const vorher = modus
    setModus(neu)
    if (neu !== 'off') letzteStufe.current = neu
    setFehler(null)
    try {
      const antwort = await fetch(WEG, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ modus: neu }),
      })
      if (!antwort.ok) throw new Error(`HTTP ${String(antwort.status)}`)
    } catch (problem) {
      setModus(vorher)
      setFehler(problem instanceof Error ? problem.message : String(problem))
    }
  }

  const an = modus !== 'off'
  const titel = fehler !== null
    ? `Ponytail: ${fehler}`
    : `Ponytail ${modus} · Klick: ${an ? 'aus' : 'an'} · Alt+Klick: Stufe`

  return (
    <button
      type="button"
      className={`pmh-pt${an ? ' is-an' : ''}`}
      data-modus={modus}
      aria-pressed={an}
      aria-label={titel}
      title={titel}
      disabled={!bereit}
      onClick={(ereignis) => {
        const neu = ereignis.altKey ? naechster(modus) : an ? 'off' : letzteStufe.current
        void setze(neu)
      }}
    >
      <i className="pmh-pt__dot" aria-hidden="true" />
      <span className="pmh-pt__name">Pony</span>
      {an && <span className="pmh-pt__stufe">{modus}</span>}
    </button>
  )
}

/**
 * Hängt den Pill ein.
 *
 * @param ctx - der Client-Kontext
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const stil = document.createElement('style')
    stil.dataset.pmhPonytail = ''
    stil.textContent = CSS
    document.head.append(stil)
    return () => stil.remove()
  }, 'ponytail: Stil')

  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register({ name: 'conversation.input.left', id: 'pmh-ponytail', order: 12 }, PonytailPill),
  )
}

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots']

const CSS = `
.pmh-pt{
  display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;
  border:1px solid rgba(255,255,255,.09);border-radius:999px;
  background:rgba(255,255,255,.03);color:rgba(236,238,248,.55);
  font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;
  cursor:pointer;transition:border-color .16s ease,background .16s ease,color .16s ease;
}
.pmh-pt:hover:not(:disabled){border-color:rgba(233,198,143,.32);color:#efe6d5}
.pmh-pt:focus-visible{outline:2px solid rgba(233,198,143,.55);outline-offset:2px}
.pmh-pt:disabled{opacity:.35;cursor:default}
.pmh-pt__dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.22);flex:none}
.pmh-pt__name{letter-spacing:.02em}
.pmh-pt__stufe{
  padding:1px 5px;border-radius:999px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;
  color:#e9c68f;background:rgba(233,198,143,.1);border:1px solid rgba(233,198,143,.22);
}
.pmh-pt.is-an{color:#f2ead9;border-color:rgba(233,198,143,.28);background:rgba(233,198,143,.06)}
.pmh-pt.is-an .pmh-pt__dot{background:#e9c68f;box-shadow:0 0 0 3px rgba(233,198,143,.14)}
.pmh-pt[data-modus="ultra"] .pmh-pt__dot{background:#d98f5a;box-shadow:0 0 0 3px rgba(217,143,90,.16)}
`
