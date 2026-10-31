/**
 * **`@prometheus-harness/client-world` — die echte Universe-App als Panel.**
 *
 * ## Was hier drin ist — und was nicht
 *
 * Das Panel bettet **genau** die bestehende Universe-App unter `/universe/`
 * ein. Damit sind Oberfläche und Logik identisch: 3D-Welt, 5D-Rotation,
 * Zoom-Ebenen, Docking, Terminal, Notizen, Health, Token, KI-Rangliste, Suche
 * und Einstellungen.
 *
 * **Der frühere native 3D-Ausschnitt ist bewusst entfernt.** Er benutzte zwar
 * `UniverseView`, aber nur einen Teil der Szene und keine der echten
 * Universe-Flächen — er sah ähnlich aus und war trotzdem nicht dasselbe.
 * Ein Ersatz, der „fast" wie das Original ist, ist schlechter als keiner.
 *
 * Eine **native** Portierung müßte `apps/universe/src/main.ts` in ein
 * mountbares Modul refaktorieren und `app.css` kapseln; das ist ein eigener,
 * großer Schritt. Bis dahin ist der `iframe` die verlustfreie Brücke.
 *
 * @module @prometheus-harness/client-world
 */

import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { DE, EN } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    world: keyof typeof DE
  }
}

/** Die Kennung — sie steht im Sidebar-Eintrag **und** im main-Slot. */
export const PANEL_ID = 'world'

/** Der Namensraum der Texte. */
const NS = 'world'

/**
 * Die Dienste, die dieses Plugin braucht.
 *
 * `layout` gehört hierher: der Rückweg ruft `ctx.layout.selectPanel(null)`
 * direkt; ohne `inject` wirft Cordis beim Zugriff.
 */
export const inject = ['slots', 'locale', 'layout']

/** Die Props, die der Slot-Inject beisteuert. */
interface WorldPanelProps {
  readonly close: () => void
  readonly t: TranslateNS<'world'>
}

/**
 * Das Panel: die echte Universe-App, vollflächig.
 *
 * @param props - `close` und der Übersetzer
 * @returns das Panel
 */
export function WorldPanel({ close, t }: WorldPanelProps): ReactElement {
  return (
    <div className="pmh-world">
      <iframe
        className="pmh-world__frame"
        src="/universe/"
        title={t('title')}
        allow="fullscreen"
        onLoad={(event) => {
          /*
           * Die eingebettete App hat einen eigenen „Chat"-Weg auf `/`.
           * Wer ihn drückt, will den echten DSH-Chat — also schließt das Panel.
           * Der Zugriff ist same-origin; bei fremder Herkunft gibt es nichts
           * zu schließen und der `catch` ist die richtige Antwort.
           */
          try {
            if (event.currentTarget.contentWindow?.location.pathname === '/') close()
          } catch {
            /* Fremde Herkunft: nichts zu tun. */
          }
        }}
      />
      <div className="pmh-world__float">
        <button className="pmh-world__control" type="button" onClick={close}>
          {t('chat')}
        </button>
      </div>
    </div>
  )
}

/** Das Zeichen in der Seitenleiste — zwei Bahnen und ein Körper. */
export function WorldIcon({ size = 20 }: { readonly size?: number }): ReactElement {
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
    >
      <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-24 12 12)" />
      <ellipse cx="12" cy="12" rx="4.2" ry="8.6" transform="rotate(-24 12 12)" />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="19.2" cy="8.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * Hängt Panel, Sidebar-Eintrag und Texte ein.
 *
 * @param ctx - der Client-Kontext
 */
export function apply(ctx: Context): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, 'de', DE), 'world: Texte de')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'world: Texte en')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhWorld = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'world: Stil')

  const close = (): void => {
    ctx.layout.selectPanel(null)
  }

  ctx.slots.inject('main', function* () {
    yield ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ close }),
      },
      WorldPanel,
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
      WorldIcon,
    ),
  )
}

/** Der Stil — nur der Rahmen; die App bringt ihre eigene Oberfläche mit. */
const CSS = `
.pmh-world{
  position:relative;width:100%;height:100%;min-height:0;overflow:hidden;
  background:#05060c;
}
.pmh-world__frame{display:block;width:100%;height:100%;border:0;background:#05060c}
.pmh-world__float{position:absolute;top:10px;right:10px;z-index:6;display:flex;gap:6px}
.pmh-world__control{
  border:1px solid rgba(180,170,230,.28);background:rgba(12,10,20,.72);
  color:rgba(240,242,255,.92);border-radius:9px;padding:6px 10px;
  font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;
  backdrop-filter:blur(6px);
}
.pmh-world__control:hover{border-color:rgba(190,170,255,.65);background:rgba(28,22,44,.85)}
`
