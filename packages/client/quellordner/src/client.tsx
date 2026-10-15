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
 * ## Der CSRF-Wert — jetzt GEMESSEN statt festgelegt
 *
 * **Meine erste Fassung las ihn aus einem Meta-Feld** (`meta[name="pmh-csrf"]`) und nannte das
 * ausdrücklich eine „Festlegung dieser Datei". Sie war **falsch**: die Anmeldeseite liest ihn seit
 * jeher aus dem **Keks** (`packages/api/auth-http/src/seite.ts:274`, Name in
 * `packages/auth/auth/src/session.ts:450`). Jetzt steht hier {@link csrfWert} — aus dem Keks.
 *
 * ## Was NOCH offen ist
 *
 * Der Container lädt **keine** Ordner. Dafür braucht er die **Arbeitsbereichs-Kennung**, und die
 * kommt aus den Client-Diensten `workspaces` und `sessions` — die müßte diese Datei erst
 * **einbinden** (`inject`), und **das ist nicht gemessen**. Die Regel selbst steht bereit und ist
 * geprüft: {@link arbeitsbereichId} in `stand.ts`, nachgebaut aus `ui-git/src/client/index.ts:204`.
 *
 * @module @prometheus-harness/client-quellordner/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { useState } from 'react'
import { QuellordnerDialog, type Ordner } from './dialog.tsx'
import { csrfWert } from './stand.ts'
import { type WegeOptionen } from './wege.ts'

/** Kennung des Plugins. */
export const name = 'quellordner'

/** Was der Client-Kern bereitstellen muß. */
export const inject: readonly string[] = ['slots']

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
        inject: (): QuellordnerDienste => ({ optionen: { csrf: csrfWert } }),
      },
      QuellordnerSchicht,
    ),
  )
}
