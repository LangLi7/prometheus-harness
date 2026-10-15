/**
 * Die Browser-Hälfte des Ordnerdialogs — **die Einhängung am Host**.
 *
 * ## Was hier steht und was noch nicht
 *
 * Eingehängt wird in **`shell.overlay`**: gemessen eine **Listen**-Eintragung **ohne** Owner-Props
 * (`ui-layout/src/client/index.ts:83`: `{ kind: 'list', scope: 'root' }`). Das ist der Punkt mit
 * der kleinsten Fläche zum Verwechseln — ein `list`-Eintrag braucht `name`, `id` und optional
 * `label`, sonst nichts.
 *
 * **`sidebar.footer.action` wurde bewußt NICHT genommen:** er trägt Owner-Props
 * (`SidebarFooterActionOwnerProps`), und was darin steht, habe ich **nicht** gemessen. Etwas
 * einzuhängen, dessen Eigenschaften man nicht kennt, ist Raten — und Raten ist hier verboten.
 * Der Dialog bringt seinen eigenen Knopf mit und braucht keinen zweiten Einstiegspunkt.
 *
 * ## Der CSRF-Wert — und was daran OFFEN ist
 *
 * Die drei ändernden Wege verlangen den Kopf `x-pmh-csrf`. **Woher die Seite ihn nimmt, ist
 * NICHT gemessen.** Deshalb steht hier kein geratener Weg, sondern ein **deutlich benannter
 * Platz**: {@link csrfAusSeite} liest ihn aus einem Meta-Feld, das der Host setzen muß. Fehlt es,
 * gibt die Datenschicht einen klaren Fehler — und sendet **gar nicht**.
 *
 * **Das ist der offene Punkt dieser Datei**, und er steht hier, statt überspielt zu werden.
 *
 * @module @prometheus-harness/client-quellordner/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { useState } from 'react'
import { QuellordnerDialog, type Ordner } from './dialog.tsx'
import { type WegeOptionen } from './wege.ts'

/** Kennung des Plugins. */
export const name = 'quellordner'

/** Was der Client-Kern bereitstellen muß. */
export const inject: readonly string[] = ['slots']

/**
 * Liest den CSRF-Wert aus der Seite.
 *
 * **Offen:** daß der Host ein solches Meta-Feld setzt, ist **nicht** gemessen. Der Name
 * `pmh-csrf` ist eine Festlegung dieser Datei, keine vorgefundene Tatsache.
 *
 * @returns der Wert oder `undefined`
 */
export function csrfAusSeite(): string | undefined {
  const dokument = globalThis.document
  if (dokument === undefined) return undefined
  const feld = dokument.querySelector('meta[name="pmh-csrf"]')
  const wert = feld?.getAttribute('content')
  return wert === null || wert === undefined || wert.trim() === '' ? undefined : wert
}

/** Was die Komponente an Diensten bekommt. */
export interface QuellordnerDienste {
  /** Die Quellen für die Wege. */
  readonly optionen: WegeOptionen
}

/**
 * Die Schicht im Fenster: ein Knopf und — wenn offen — der Dialog.
 *
 * **Warum sie den Zustand selbst hält.** `shell.overlay` übergibt keine Eigenschaften; ohne
 * eigenen Zustand wüßte die Schicht nicht, ob der Dialog offen ist.
 *
 * @param eigenschaften - die eingehängten Dienste
 * @returns die Schicht
 */
export function QuellordnerSchicht({ optionen }: QuellordnerDienste): React.ReactElement {
  const [offen, setOffen] = useState(false)
  const [ordner] = useState<readonly Ordner[]>([])
  const [fehler, setFehler] = useState<string | undefined>(undefined)

  if (!offen) {
    return (
      <button
        type="button"
        className="pmh-quellordner-knopf"
        onClick={() => {
          // **Durch dieselbe Quelle, die auch die Wege benutzen** — nicht durch einen zweiten Weg
          // zur Seite. Sonst könnte die Warnung hier ausbleiben, während der ändernde Aufruf
          // später mit 403 scheitert.
          if (optionen.csrf() === undefined) {
            setFehler('Kein CSRF-Wert in der Seite (meta name="pmh-csrf") — es kann nichts geändert werden.')
          }
          setOffen(true)
        }}
      >
        Quellordner
      </button>
    )
  }

  return (
    <QuellordnerDialog
      name=""
      ordner={ordner}
      {...(fehler === undefined ? {} : { fehler })}
      beiSchliessen={() => {
        setOffen(false)
      }}
    />
  )
}

/**
 * Hängt die Schicht ein.
 *
 * @param ctx - der Client-Kontext des Kerns
 */
export function apply(ctx: Context): void {
  const slots = (ctx as unknown as { slots: { inject: (key: string, f: () => unknown) => void; register: (o: unknown, c: unknown) => unknown } }).slots
  slots.inject('shell.overlay', () =>
    slots.register(
      {
        name: 'shell.overlay',
        // Ein Listeneintrag BRAUCHT eine eigene id — ohne sie wirft die Registratur.
        id: 'quellordner',
        label: 'Quellordner',
        inject: (): QuellordnerDienste => ({ optionen: { csrf: csrfAusSeite } }),
      },
      QuellordnerSchicht,
    ),
  )
}
