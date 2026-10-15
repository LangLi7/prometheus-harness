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
import { useEffect, useState } from 'react'
import { QuellordnerDialog, type Ordner } from './dialog.tsx'
import { arbeitsbereichId, csrfWert, type Arbeitsbereichsstand } from './stand.ts'
import { listeOrdner, entferneOrdner, setzeZugriff, type WegeOptionen } from './wege.ts'

/** Kennung des Plugins. */
export const name = 'quellordner'

/**
 * Was der Client-Kern bereitstellen muß.
 *
 * **Gemessen an `ui-git/src/client/index.ts:40`** — dort steht
 * `['slots', 'sessions', 'workspaces', 'locale', 'connection']`. Die beiden mittleren sind die,
 * die dieser Dialog braucht; `locale` und `connection` braucht er nicht.
 */
export const inject: readonly string[] = ['slots', 'workspaces', 'sessions']

/** Was die Komponente an Diensten bekommt. */
export interface QuellordnerDienste {
  /** Die Quellen für die Wege. */
  readonly optionen: WegeOptionen
  /**
   * Welcher Arbeitsbereich gemeint ist.
   *
   * **Warum das eine Funktion ist und kein Wert.** Der Bereich kann sich **ändern**, während die
   * Schicht eingehängt bleibt. Ein beim Aufbau gelesener Wert wäre nach dem Wechsel falsch — und
   * der Dialog zeigte die Ordner eines anderen Bereichs an.
   *
   * @returns die Kennung, oder `undefined`, wenn es keinen Bereich gibt
   */
  readonly arbeitsbereich: () => string | undefined
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
export function QuellordnerSchicht({
  optionen,
  arbeitsbereich,
}: QuellordnerDienste): React.ReactElement {
  const [offen, setOffen] = useState(false)
  const [ordner, setOrdner] = useState<readonly Ordner[]>([])
  const [fehler, setFehler] = useState<string | undefined>(undefined)
  /** Zählt die Ladevorgänge — jede Änderung erhöht ihn und lädt neu. */
  const [runde, setRunde] = useState(0)

  // **Geladen wird beim Öffnen** — nicht beim Einbinden der Schicht. Die Schicht hängt dauerhaft
  // im Fenster; ohne diese Bedingung liefe bei jedem Aufbau ein Netzaufruf.
  useEffect(() => {
    if (!offen) return
    const bereich = arbeitsbereich()
    if (bereich === undefined) {
      setFehler('Es gibt keinen Arbeitsbereich — es kann nichts angezeigt werden.')
      return
    }
    let gilt = true
    listeOrdner(bereich, optionen)
      .then((liste) => {
        // **Nur setzen, wenn dieser Aufruf noch gilt.** Sonst überschriebe eine späte Antwort
        // eine neuere — und der Dialog zeigte etwas Veraltetes.
        if (gilt) {
          setOrdner(liste.ordner)
          setFehler(undefined)
        }
      })
      .catch((e: unknown) => {
        if (gilt) setFehler(e instanceof Error ? e.message : 'Die Ordner ließen sich nicht laden.')
      })
    return () => {
      gilt = false
    }
  }, [offen, runde, arbeitsbereich, optionen])

  /**
   * Führt eine Änderung aus und lädt danach neu.
   *
   * **Warum neu geladen wird, statt den Zustand selbst fortzuschreiben.** Der Server ist die
   * Wahrheit: er kennt Vorgaben (der primäre Ordner ist immer `schreiben`), die eine zweite,
   * selbstgebaute Wahrheit im Fenster nicht kennt. Wer selbst fortschreibt, baut die Regeln des
   * Servers ein zweites Mal — und irgendwann falsch.
   *
   * @param tu - was zu tun ist
   */
  const aendern = (tu: () => Promise<unknown>): void => {
    setFehler(undefined)
    tu()
      .then(() => {
        setRunde((r) => r + 1)
      })
      .catch((e: unknown) => {
        setFehler(e instanceof Error ? e.message : 'Die Änderung ließ sich nicht ausführen.')
      })
  }

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
            setFehler('Kein CSRF-Wert in der Seite (Keks pmh_csrf) — es kann nichts geändert werden.')
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
      beiZugriff={(id, zugriff) => {
        aendern(() => setzeZugriff(id, zugriff, optionen))
      }}
      beiEntfernen={(id) => {
        aendern(() => entferneOrdner(id, optionen))
      }}
      beiHinzufuegen={() => {
        // **Ehrlich statt still.** Ein Knopf, der nichts tut, ist schlimmer als keiner: der Nutzer
        // drückt und glaubt, es sei etwas geschehen. Das Hinzufügen braucht den
        // **Verzeichniswähler des Hosts** — und dafür gibt es kein `pickDirectory()`; der Host
        // bietet ein `directory-flow`-Loch (`conversation.hero.workspace.directoryFlow`). **Wie
        // ein Plugin das von außen öffnet, ist NICHT gemessen.**
        setFehler(
          'Das Hinzufügen braucht den Verzeichniswähler des Hosts. Wie ein Plugin ihn öffnet, ist ' +
            'noch nicht gemessen — dieser Knopf tut deshalb noch nichts.',
        )
      }}
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
  // Der Kontext, wie er hier gebraucht wird. **Als Typ ausgeschrieben**, weil `slots`,
  // `workspaces` und `sessions` erst durch die Einbindung entstehen und der Vertrag dafür in
  // `dsh-client-ui-slots` bzw. `dsh-client-ui-workspace` liegt.
  const kern = ctx as unknown as {
    slots: {
      inject: (key: string, f: () => unknown) => void
      register: (o: unknown, c: unknown) => unknown
    }
    workspaces: { list: { getSnapshot: () => { items: readonly Arbeitsbereichsstand[] } } }
    sessions: { list: { getSnapshot: () => { current: string | undefined } } }
  }

  kern.slots.inject('shell.overlay', () =>
    kern.slots.register(
      {
        name: 'shell.overlay',
        // Ein Listeneintrag BRAUCHT eine eigene id — ohne sie wirft die Registratur.
        id: 'quellordner',
        label: 'Quellordner',
        // **Die Fabrik schließt über `ctx`.** Der Vertrag sagt: *„Business data access happens
        // through the apply closure's ctx — no binding object parameter exists."* Deshalb bekommt
        // sie keine Parameter, sondern liest die Dienste hier.
        inject: (): QuellordnerDienste => ({
          optionen: { csrf: csrfWert },
          arbeitsbereich: () =>
            arbeitsbereichId(
              kern.workspaces.list.getSnapshot().items,
              kern.sessions.list.getSnapshot().current,
            ),
        }),
      },
      QuellordnerSchicht,
    ),
  )
}
