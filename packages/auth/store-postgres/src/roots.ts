/**
 * `@prometheus-harness/store-postgres/wurzeln` — die **Zugriffspfade** eines Arbeitsbereichs.
 *
 * ## Warum es diese Datei gibt
 *
 * Der Sandkasten des Kerns kennt **einen** Wurzelpfad: `SandboxExecutionPolicy.workspaceRoot`
 * (*„Absolute root directory `workspace-write` may write under"*). Daraus rechnet er die Liste,
 * unter der geschrieben werden darf (`writableRoots` — Wurzel plus Temp-Bereiche).
 *
 * Der Betreiber hat das Modell klargestellt: **eine Hauptwurzel** — der Arbeitsplatz — und die
 * weiteren Ordner als **Zusatz-Zugriff**, nicht als zweite gleichrangige Wurzeln. So ist es auch
 * in der Vorlage gelöst.
 *
 * Diese Datei übersetzt unsere Tabelle `workspace_folders` in genau diese Form. Sie ist die
 * **Brücke**, nicht der Sandkasten: sie sagt, welche Pfade es gibt und was in ihnen erlaubt ist.
 * Wer sie in die Durchsetzung trägt, ist ein eigener Schritt (und ein eigener Nachweis).
 *
 * ## Warum die Abfrage über `mitMandant` läuft
 *
 * `workspace_folders` hat Row Level Security. Ohne Mandanten wäre die Abfrage **laut** (42704)
 * — das ist Absicht. Mit `mitMandant` gilt der Mandant **innerhalb einer Transaktion**, und
 * jede Abfrage darin läuft unter ihm.
 *
 * @module @prometheus-harness/store-postgres/wurzeln
 */

import { mitMandant, type SqlZugang } from './index.ts'

/** Die Zugriffspfade eines Arbeitsbereichs. */
export interface Wurzeln {
  /** Der Arbeitsplatz: die **eine** Hauptwurzel. Immer schreibbar. */
  readonly hauptwurzel: string
  /** Zusatzordner, in denen auch **geschrieben** werden darf. */
  readonly weitereSchreibbar: readonly string[]
  /** Zusatzordner, in denen nur **gelesen** werden darf. */
  readonly weitereLesbar: readonly string[]
}

/** Eine Zeile, wie die Abfrage sie liefert. */
interface Ordnerzeile {
  readonly pfad: string
  readonly ist_primaer: boolean
  readonly zugriff: string
}

/**
 * Liest die Zugriffspfade eines Arbeitsbereichs.
 *
 * @param sql - Zugang **mit** `begin` (der echte Treiber)
 * @param userId - der Mandant
 * @param workspaceId - der Arbeitsbereich
 * @returns die Pfade, oder `undefined`, wenn der Arbeitsbereich keinen Hauptordner hat
 */
export async function ladeWurzeln(
  sql: SqlZugang,
  userId: string,
  workspaceId: string,
): Promise<Wurzeln | undefined> {
  const zeilen = await mitMandant(sql, userId, async (innerhalb) => {
    const ergebnis = await innerhalb.unsafe(
      `select pfad, ist_primaer, zugriff
         from workspace_folders
        where workspace_id = $1
        order by ist_primaer desc, sortierung asc, pfad asc`,
      [workspaceId],
    )
    return (ergebnis ?? []) as readonly Ordnerzeile[]
  })

  const haupt = zeilen.find((zeile) => zeile.ist_primaer)
  // **Ohne Hauptwurzel gibt es keinen Arbeitsplatz.** Dann wird nichts erfunden: der Aufrufer
  // soll den Fall behandeln, nicht eine leere Zeichenkette als Pfad bekommen.
  if (haupt === undefined) return undefined

  return {
    hauptwurzel: haupt.pfad,
    weitereSchreibbar: zeilen.filter((z) => !z.ist_primaer && z.zugriff === 'schreiben').map((z) => z.pfad),
    weitereLesbar: zeilen.filter((z) => !z.ist_primaer && z.zugriff !== 'schreiben').map((z) => z.pfad),
  }
}

/**
 * Die Liste, die der Sandkasten braucht — in der Form von `writableRoots`.
 *
 * **Was hier NICHT passiert.** Der Hauptordner steht **zuerst**; die Temp-Bereiche, die der Kern
 * ohnehin dazunimmt, sind **nicht** enthalten — sie kommen aus `writableRoots` des Kerns. Diese
 * Funktion liefert nur, was **wir** beitragen: den Arbeitsplatz und die ausdrücklich erlaubten
 * Zusatzordner. Wer beides zusammenführt, muß sie **vereinigen**, nicht ersetzen — sonst nimmt
 * er dem Kern seine eigenen Pfade weg.
 *
 * @param wurzeln - die gelesenen Pfade
 * @returns die schreibbaren Wurzeln, Hauptwurzel zuerst
 */
export function schreibbareWurzeln(wurzeln: Wurzeln): readonly string[] {
  return [wurzeln.hauptwurzel, ...wurzeln.weitereSchreibbar]
}
