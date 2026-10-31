/**
 * The code card: one excerpt with its provenance, numbers, and a copy action.
 *
 * ## Why this is not the transcript's code fence
 *
 * A fence belongs to prose and has no name, no line numbers, and no source. This
 * card answers "which file, which lines, can I take it" — the questions a
 * generated patch raises. The transcript's own renderer cannot be extended here
 * (its slots carry no code-fence seat), so the card is the honest way to add it.
 *
 * ## Why no syntax highlighting
 *
 * A real highlighter is a grammar set of 100 KB to 800 KB, and the markdown
 * fences already cover code that merely illustrates prose. What a reader needs
 * from an excerpt is the line number and the way back into the file, so this
 * card stays `<pre><code>` and spends nothing on colours.
 *
 * The copy button is the only stateful part, which is why this module has the
 * hook and `card.tsx` stays hook-free.
 */

import { useState } from 'react'
import type { ReactElement } from 'react'
import type { CodeSpec } from './spec.ts'

/** How long the button reports "Kopiert" before returning to its label. */
const COPIED_MS = 1600

/**
 * Render one code excerpt.
 *
 * @param code - validated excerpt.
 * @returns the code block.
 */
export function CodeBlock({ code }: { readonly code: CodeSpec }): ReactElement {
  const [copied, setCopied] = useState(false)
  const lines = code.content.split('\n')
  const firstLine = code.startLine ?? 1
  const title = code.filename ?? code.language ?? 'Code'

  const copy = (): void => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (clipboard === undefined) return
    void clipboard
      .writeText(code.content)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), COPIED_MS)
      })
      .catch(() => undefined)
  }

  return (
    <div className="pmh-rich-code">
      <div className="pmh-rich-code__bar">
        <span className="pmh-rich-code__name">{title}</span>
        {code.filename === undefined || code.language === undefined ? null : (
          <span className="pmh-rich-code__lang">{code.language}</span>
        )}
        {code.truncated === true ? <span className="pmh-rich-code__cut">gekürzt</span> : null}
        <button type="button" className="pmh-rich-code__copy" onClick={copy}>
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      {/*
        `tabIndex` is what makes a scrollable region reachable without a mouse;
        the WCAG rule for scrolling containers asks for exactly this.
      */}
      <pre className="pmh-rich-code__pre" tabIndex={0}>
        <code>
          {lines.map((line, index) => (
            <span key={String(index)} className="pmh-rich-code__line">
              <span className="pmh-rich-code__no" aria-hidden="true">
                {String(firstLine + index)}
              </span>
              <span className="pmh-rich-code__text">{line.length === 0 ? ' ' : line}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
