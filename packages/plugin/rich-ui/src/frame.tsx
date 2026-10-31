/**
 * The frame every card shares: headline, body, footnote.
 *
 * Split out of `card.tsx` because a prose card measures its own width and
 * therefore has to own the section element it puts that width on. Keeping the
 * frame here lets both paths render the same markup instead of drifting apart.
 */

import type { ReactElement, ReactNode } from 'react'
import type { RichSpec } from './spec.ts'

/**
 * Render one card frame.
 *
 * @param spec - validated description; supplies the kind for styling.
 * @param width - measured content width in CSS px, when the card hugs its text.
 * @param children - the card body.
 * @returns the section element.
 */
export function CardFrame({
  spec,
  width,
  children,
}: {
  readonly spec: RichSpec
  readonly width?: number
  readonly children: ReactNode
}): ReactElement {
  return (
    <section
      className={`pmh-rich pmh-rich--${spec.kind}`}
      data-pmh-rich={spec.kind}
      {...(width === undefined ? {} : { style: { width: `${String(width)}px` } })}
    >
      {spec.title === undefined && spec.subtitle === undefined ? null : (
        <header className="pmh-rich__head">
          {spec.title === undefined ? null : <h3 className="pmh-rich__title">{spec.title}</h3>}
          {spec.subtitle === undefined ? null : <p className="pmh-rich__subtitle">{spec.subtitle}</p>}
        </header>
      )}
      <div className="pmh-rich__body">{children}</div>
      {spec.footer === undefined ? null : <p className="pmh-rich__footer">{spec.footer}</p>}
    </section>
  )
}
