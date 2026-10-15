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
 * **KORREKTUR vom 15.10.2026.** Hier stand: *„es gibt kein `pickDirectory()`; der Host bietet ein
 * `directory-flow`-Loch … wie ein Plugin das von außen öffnet, ist NICHT gemessen."*
 *
 * **Das war falsch.** `ctx.workspaces.pickDirectory()` **gibt es**:
 *
 * | Fundstelle | Was dort steht |
 * |---|---|
 * | `packages/client/runtime/src/client/contract/workspaces.ts:41` | `pickDirectory(): Promise<string \| null>` |
 * | `packages/client/runtime/src/client/workspaces/service.ts:209` | ruft `api.host.pickDirectory({})` |
 * | `ui-directory-picker-native/src/client/index.ts:27` | `pick: () => ctx.workspaces.pickDirectory()` |
 *
 * **Wie der Fehler entstand:** ich habe den Vertrag von **`ui-workspace`** gelesen, dort nur das
 * `directory-flow`-**Loch** gefunden und daraus geschlossen, es gebe die Methode nicht. Sie steht
 * im **`dsh-client-runtime`** — einem anderen Paket. **Eine Abwesenheit an einer Stelle ist kein
 * Beweis für Abwesenheit.** Dasselbe habe ich an diesem Tag schon zweimal falsch gemacht (die
 * Modellliste von OpenRouter; die Parameterliste von granite). Jetzt ist es verdrahtet.
 *
 * @module @prometheus-harness/client-quellordner/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useState } from 'react'
import { QuellordnerDialog, type Ordner } from './dialog.tsx'
import { arbeitsbereichId, csrfWert, type Arbeitsbereichsstand } from './stand.ts'
import { listeOrdner, legeOrdnerAn, entferneOrdner, setzeZugriff, type WegeOptionen } from './wege.ts'

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
  /**
   * Öffnet den Verzeichniswähler des Rechners.
   *
   * **Gemessen:** `ctx.workspaces.pickDirectory(): Promise<string | null>`
   * (`dsh-client-runtime`, Vertrag und Dienst). `null` heißt: der Nutzer hat **abgebrochen** —
   * das ist **kein** Fehler und darf keine Meldung erzeugen.
   *
   * @returns der gewählte Pfad oder `null`
   */
  readonly waehleVerzeichnis: () => Promise<string | null>
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
  waehleVerzeichnis,
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
        const bereich = arbeitsbereich()
        if (bereich === undefined) {
          setFehler('Es gibt keinen Arbeitsbereich — es kann kein Ordner eingetragen werden.')
          return
        }
        setFehler(undefined)
        waehleVerzeichnis()
          .then(async (pfad) => {
            // **`null` heißt abgebrochen — kein Fehler, kein Neuladen.** Eine Meldung für einen
            // bewußten Abbruch wäre eine Lüge: der Nutzer hat nichts falsch gemacht. Und neu zu
            // laden, obwohl sich nichts geändert hat, wäre eine Fahrt zum Server umsonst.
            if (pfad === null) return
            await legeOrdnerAn({ workspaceId: bereich, pfad }, optionen)
            setRunde((r) => r + 1)
          })
          .catch((e: unknown) => {
            setFehler(e instanceof Error ? e.message : 'Der Ordner ließ sich nicht eintragen.')
          })
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
    workspaces: {
      list: { getSnapshot: () => { items: readonly Arbeitsbereichsstand[] } }
      pickDirectory: () => Promise<string | null>
    }
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
          // **Nicht gebunden, sondern durchgereicht.** Die Methode gehört dem Dienst; sie hier
          // abzuschreiben hieße, sie an zwei Stellen zu pflegen.
          waehleVerzeichnis: () => kern.workspaces.pickDirectory(),
        }),
      },
      QuellordnerSchicht,
    ),
  )
}
