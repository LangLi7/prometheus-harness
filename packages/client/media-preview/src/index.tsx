/**
 * **`@prometheus-harness/client-media-preview` — Video und Ton in der rechten
 * Seitenleiste.**
 *
 * ## Der Auftrag (Betreiber, 28.10.2026)
 *
 * > *„kannst du das hier beheben? das man alle formate richtig nutzen kann in dem
 * > rechte seite des tap?"* — mit einem Bild der Vorschau, die für
 * > `brag-output-…/brag.mp4` nur noch *„Für diesen Dateityp ist noch keine
 * > Vorschau verfügbar."* zeigte.
 *
 * Der Kern bringt Renderer für Text, Markdown, Code, Bilder, PDF, HTML und
 * Tabellen mit; Video und Ton stehen in seiner Liste der **nicht darstellbaren**
 * Binärformate. Diese Lücke schließt das Plugin — nicht durch einen Eingriff in
 * den Kern, sondern über dessen offener Schnittstelle:
 * `ctx.documentPreviews.register(...)` meldet einen Renderer an, und der Schlüssel
 * `sidebar.right.tab.document` nimmt seinen Körper auf.
 *
 * ## Wie die Datei zum Player kommt
 *
 * Der Kern liest die Bytes (`loading: 'bytes-complete'`) und reicht sie als
 * `content.data` herein. Daraus wird ein Blob mit dem Medientyp der Endung und
 * daraus eine Objekt-URL für `<video>`/`<audio>` — derselbe Weg, den der
 * Bild-Renderer des Kerns für `<img>` geht. Die Bytes bleiben im Speicher der
 * Seite; die URL wird beim Abbau freigegeben.
 *
 * **Die Grenze steht beim Host**, nicht hier: `maxFileBytes` (Vorgabe 32 MiB)
 * begrenzt, was gelesen wird. Eine größere Datei bekommt die ehrliche Meldung
 * „zu groß" des Kerns statt eines abgeschnittenen Players.
 *
 * ## Was hier ausdrücklich nicht passiert
 *
 * * **Kein zweiter Leseweg.** Kein `/api/file`, kein `fetch`: die Bytes kommen
 *   über den Weg, den der Kern schon für PDF und Bilder benutzt.
 * * **Keine Vorschau über die Zeit.** Kein Vollbild, keine Untertitel, kein
 *   Umskalieren — der Player ist der des Browsers.
 * * **Kein Codec-Versprechen.** Annahme heißt „der Browser soll es versuchen";
 *   scheitert er, sagt das Panel warum (§ `failed`).
 *
 * @module @prometheus-harness/client-media-preview
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
// Die Dienste stehen am `Context` erst, wenn ihre Pakete im Programm sind:
// `locale` kommt vom Sprachpaket, `slots` vom Renderer, `documentPreviews` von der
// Dokumentvorschau. Ohne diese Zeilen ist `ctx.locale` kein Teil des Vertrags.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { DE, EN } from './locales.ts'
import { MEDIA_EXTENSIONS, fileNameOf, mediaTypeOf } from './media.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    mediaPreview: keyof typeof DE
  }
}

/** Der Namensraum der Texte — er steht in `locales.ts` und in der Typ-Erweiterung oben. */
const NS = 'mediaPreview'

/** Die Kennung des Renderers: Anmeldung **und** Schlüssel des Körpers. */
export const MEDIA_BODY_ID = '@prometheus-harness/client-media-preview/media'

/**
 * Die Dienste, die dieses Plugin braucht.
 *
 * `documentPreviews` gehört hierher: ohne `inject` wirft Cordis beim Zugriff auf
 * `ctx.documentPreviews`.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/** Die Props des Körpers: die des Kerns plus die Wörter dieses Plugins. */
export type MediaBodyProps = DocumentPreviewProps & PropsLocale<'mediaPreview'>

/** Die eingehängte Gestaltung — nur Theme-Variablen, keine festen Farben. */
const CSS = `
.pmh-media{box-sizing:border-box;width:100%;min-width:100%;height:100%;min-height:100%;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;font-family:var(--dsw-font,sans-serif)}
.pmh-media__surface{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:0}
.pmh-media__video{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:var(--dsw-radius-md);background:#000;display:block}
.pmh-media__audio{width:100%;max-width:560px}
.pmh-media__status{margin:0;padding:16px;max-width:44em;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;text-align:center}
`

/**
 * Der Player: Bytes hinein, `<video>`/`<audio>` heraus.
 *
 * @param props - Dateiadresse, gelesene Bytes und der Übersetzer
 * @returns der Player, ein Ladetext oder eine Erklärung
 */
export function MediaBody(props: MediaBodyProps): ReactElement {
  const { content, resourceAddress, t } = props

  /**
   * **Der Pfad, nicht die Adresse.** Die Endung entscheidet über den Medientyp,
   * und `parseFileAddress` liefert den bereits dekodierten Pfad. Eine Adresse,
   * die nicht zum Dateischema paßt, ergibt `''` — dann greift der Hinweis unten.
   */
  const path = useMemo(() => parseFileAddress(resourceAddress)?.path ?? '', [resourceAddress])
  const media = mediaTypeOf(path)
  const name = fileNameOf(path)
  const data = content.kind === 'bytes' ? content.data : undefined

  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (data === undefined || media === undefined) {
      setUrl(undefined)
      return
    }
    const next = URL.createObjectURL(new Blob([data], { type: media.mime }))
    setUrl(next)
    setFailed(false)
    return () => {
      URL.revokeObjectURL(next)
    }
  }, [data, media?.mime])

  if (media === undefined) {
    return (
      <p className="pmh-media pmh-media__status" role="alert">
        {t('unsupported')}
      </p>
    )
  }
  if (failed) {
    return (
      <p className="pmh-media pmh-media__status" role="alert">
        {t('failed')}
      </p>
    )
  }
  if (url === undefined) {
    return (
      <p className="pmh-media pmh-media__status" role="status">
        {t('loading')}
      </p>
    )
  }

  /**
   * Der Player ist der des Browsers. `scrollportRef` gehört an den scrollenden
   * Rahmen: der Kern stellt damit die Scroll-Lage des Tabs wieder her.
   */
  return (
    <div className="pmh-media" ref={props.scrollportRef}>
      <div className="pmh-media__surface">
        {media.kind === 'video' ? (
          <video
            className="pmh-media__video"
            src={url}
            controls
            playsInline
            preload="metadata"
            aria-label={t('video', { name })}
            onError={() => setFailed(true)}
          />
        ) : (
          <audio
            className="pmh-media__audio"
            src={url}
            controls
            preload="metadata"
            aria-label={t('audio', { name })}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Hängt Texte, Gestaltung, Renderer-Anmeldung und Körper ein.
 *
 * @param ctx - der Client-Kontext
 */
export function apply(ctx: Context): void {
  const t: TranslateNS<typeof NS> = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, 'de', DE), 'media-preview: Texte de')
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'media-preview: Texte en')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.pmhMediaPreview = ''
    style.textContent = CSS
    document.head.append(style)
    return () => style.remove()
  }, 'media-preview: Stil')

  /**
   * **Die Anmeldung als Renderer.** `binaryExtensions` ist die halbe Miete: ohne
   * sie böte der Kern zusätzlich „Reiner Text" an, und für eine MP4 wäre das ein
   * Editor voller Steuerzeichen.
   */
  ctx.effect(
    () =>
      ctx.documentPreviews.register({
        id: MEDIA_BODY_ID,
        extensions: MEDIA_EXTENSIONS,
        binaryExtensions: MEDIA_EXTENSIONS,
        title: () => t('title'),
        loading: 'bytes-complete',
        wrap: false,
      }),
    'media-preview: Renderer',
  )

  ctx.slots.inject('sidebar.right.tab.document', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.tab.document',
        key: MEDIA_BODY_ID,
        locale: NS,
      },
      MediaBody,
    ),
  )
}
