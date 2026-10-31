/**
 * Der Starter — die Browser-Hälfte.
 *
 * ## Was diese Fläche tut
 *
 * Sie zeigt **eine** Zeile in der Seitenleiste und **eine** Fläche im Hauptfeld. Die Fläche ist
 * eine Liste der Panels, deren Kennungen in den Einstellungen stehen; ein Klick öffnet das Panel
 * über `ctx.layout.selectPanel`.
 *
 * ## Warum die Beschriftung aus dem fremden Namensraum kommt
 *
 * Jedes der gelisteten Plugins hat einen eigenen Namensraum (`obsidian`, `konten`, …) mit dem
 * Schlüssel `panel`. Diese Beschriftung ist die, die auch in der Leiste stünde — sie hier zu
 * wiederholen wäre eine zweite Wahrheit, und nach der ersten Umbenennung wäre sie falsch. Fehlt
 * der Namensraum, steht die Kennung da; das ist ehrlicher als ein leerer Knopf.
 *
 * @module @prometheus-harness/launcher
 */

import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { DE } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    launcher: keyof typeof DE
  }
}

/** Die Kennung der Hauptfläche und des Leisten-Eintrags. */
export const PANEL_ID = 'launcher'

/** Der Eintrag im Profil — der Schlüssel der Einstellungen. */
export const ENTRY_ID = 'pmh-launcher'

/** Der Namensraum der Texte. */
const NS = 'launcher'

/** Was dieses Plugin vom Client verlangt. */
export const inject = ['slots', 'locale', 'layout', 'configForms']

/** Die Einstellungen, wie die Host-Hälfte sie beschreibt. */
interface StarterConfig {
  readonly entries?: readonly string[]
}

/** Die aufgelöste Liste — Vorgaben schon eingesetzt. */
interface Liste {
  readonly eintraege: readonly string[]
}

/**
 * Setzt die Vorgaben in die Einstellungen ein.
 *
 * **Warum eine eigene Funktion.** Ohne Einträge sähe die Fläche leer aus, obwohl die Vorgabe fünf
 * Panels nennt. Wer den Unterschied zwischen „nichts eingestellt" und „absichtlich leer" verwischt,
 * zeigt dem Nutzer einen Fehler, den er nicht gemacht hat.
 *
 * @param config - der gelesene Abschnitt, oder `undefined`, solange der Host nicht geantwortet hat
 * @returns die geltende Liste
 */
function liesListe(config: StarterConfig | undefined): Liste {
  const roh = config?.entries
  const eintraege = Array.isArray(roh) ? roh.filter((id): id is string => typeof id === 'string' && id.trim() !== '') : []
  return { eintraege }
}

/** Ein Lesegerät über den Formwerten — `t` und `form` reicht der Slot durch. */
interface Props {
  readonly close?: () => void
  readonly t: TranslateNS<'launcher'>
  readonly form: {
    getSnapshot: () => { readonly value: StarterConfig | undefined }
    subscribe: (listener: () => void) => () => void
  }
  /** Holt eine fremde Beschriftung aus dem Namensraum des Panels. */
  readonly beschriftung: (id: string) => string
}

/** Die Fläche: eine Liste von Panels. */
export function StarterPanel({ close, t, form, beschriftung }: Props): ReactElement {
  const [config, setConfig] = useState<StarterConfig | undefined>(form.getSnapshot().value)

  useEffect(() => {
    // Der Host kann seine Antwort erst nach dem ersten Aufbau schicken; ohne dieses Abonnement
    // bliebe die Vorgabe für immer stehen.
    return form.subscribe(() => setConfig(form.getSnapshot().value))
  }, [form])

  const { eintraege } = liesListe(config)

  return (
    <div className="pmh-sl">
      <header className="pmh-sl__head">
        <div className="pmh-sl__brand">
          <StarterIcon size={20} />
          <div>
            <span className="pmh-sl__kicker">LAUNCHER</span>
            <h2 className="pmh-sl__title">{t('title')}</h2>
          </div>
        </div>
        {close !== undefined && (
          <button type="button" className="pmh-sl__btn" onClick={close}>
            {t('close')}
          </button>
        )}
      </header>

      <div className="pmh-sl__scroll">
        <p className="pmh-sl__intro">{t('intro')}</p>
        {eintraege.length === 0 ? (
          <p className="pmh-sl__leer">{t('empty')}</p>
        ) : (
          <ul className="pmh-sl__liste">
            {eintraege.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className="pmh-sl__eintrag"
                  onClick={() => globalThis.dispatchEvent(new CustomEvent('pmh-launcher:oeffne', { detail: id }))}
                >
                  <span className="pmh-sl__punkt" aria-hidden="true" />
                  <span className="pmh-sl__name">{beschriftung(id)}</span>
                  <span className="pmh-sl__kennung">{id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Ein kleines Raster als Zeichen für „mehrere Flächen". */
function StarterIcon({ size = 16 }: { readonly size?: number }): ReactElement {
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
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  )
}

/** Hängt Leisten-Eintrag, Fläche und Texte ein. */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  const form = ctx.configForms.get<StarterConfig>(ENTRY_ID)

  /*
   * **Die Beschriftung eines fremden Panels.** `bind` liefert einen Übersetzer für einen
   * Namensraum; fehlt der Namensraum, kommt der Schlüssel zurück. Dann steht die Kennung da —
   * sichtbar, aber nicht erfunden.
   */
  const beschriftung = (id: string): string => {
    try {
      const fremd = ctx.locale.bind(id)('panel')
      return typeof fremd === 'string' && fremd !== '' && fremd !== 'panel' ? fremd : id
    } catch {
      return id
    }
  }

  /*
   * **Öffnen über den Layout-Dienst — und zwar in `apply`, nicht im Klick.**
   *
   * Ein Knopf, der `ctx.layout.selectPanel(id)` erst beim Klick aufruft, würde den Dienst aus dem
   * Klickpfad heraus greifen. Der Umweg über ein Ereignis hält die Fläche frei von Dienstwissen —
   * und macht sie ohne Browser prüfbar: ein Klick ist ein Ereignis, mehr nicht.
   */
  ctx.effect(() => {
    const zuhoerer = (ereignis: Event): void => {
      const id = (ereignis as CustomEvent<string>).detail
      if (typeof id !== 'string' || id === '') return
      /*
       * **Die Kennung kommt aus den Einstellungen, nicht aus dem Typ.** `MainPanelId` ist zur
       * Bauzeit eine Marke; welche Panels es gibt, weiß erst der Host. Eine unbekannte Kennung
       * öffnet deshalb nichts — sie steht sichtbar in der Liste, und der Klick bleibt folgenlos.
       * Den Typ hier zu „raten" hieße, eine Prüfung zu behaupten, die es nicht gibt.
       */
      ctx.layout.selectPanel(id as unknown as MainPanelId)
    }
    globalThis.addEventListener('pmh-launcher:oeffne', zuhoerer)
    return () => globalThis.removeEventListener('pmh-launcher:oeffne', zuhoerer)
  }, 'launcher: Klick öffnet das Panel')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhLauncher = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'launcher: Stil')

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ close: () => ctx.layout.selectPanel(null), form, beschriftung }),
      },
      StarterPanel,
    )
  })

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 10,
        label: () => t('panel'),
        locale: NS,
      },
      StarterIcon,
    ),
  )
}

const CSS = `
.pmh-sl{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:#0b0a12;color:#eceef8;font:13px/1.45 "Segoe UI","SF Pro Text",system-ui,sans-serif}
.pmh-sl__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.pmh-sl__brand{display:flex;align-items:center;gap:11px;color:#cfd3ea}
.pmh-sl__kicker{font:9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:rgba(207,211,234,.5)}
.pmh-sl__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f4f5fb}
.pmh-sl__btn{appearance:none;border:1px solid rgba(207,211,234,.22);background:rgba(22,22,36,.6);color:#eceef8;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.pmh-sl__btn:hover{border-color:rgba(207,211,234,.55)}
.pmh-sl__scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 24px}
.pmh-sl__intro{margin:0 0 14px;max-width:80ch;color:rgba(236,238,248,.55);font-size:12px}
.pmh-sl__leer{margin:12px 0;color:rgba(236,238,248,.45)}
.pmh-sl__liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-width:640px}
.pmh-sl__eintrag{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:11px 13px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.022);color:#eceef8;text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease}
.pmh-sl__eintrag:hover{border-color:rgba(207,211,234,.45);background:rgba(255,255,255,.05)}
.pmh-sl__punkt{width:8px;height:8px;border-radius:50%;background:rgba(207,211,234,.55)}
.pmh-sl__name{font-size:13px}
.pmh-sl__kennung{font:9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;color:rgba(236,238,248,.35)}
`



