/**
 * `@prometheus-harness/store-postgres/ordner` — Quellordner **ändern**.
 *
 * ## Was hier gilt
 *
 * Die Regeln stehen in der Datenbank (Migration 9 und 10); diese Datei **benutzt** sie und
 * verläßt sich nicht auf sie:
 *
 * | Regel | Wo sie durchgesetzt wird |
 * |---|---|
 * | Genau **ein** Primärordner je Arbeitsbereich | Teilindex — ein zweiter ist ein Verstoß |
 * | Der Arbeitsplatz ist immer **schreibbar** | Prüfregel der Tabelle |
 * | Derselbe Pfad nicht zweimal im selben Arbeitsbereich | eindeutiger Schlüssel |
 * | Nur der eigene Mandant | Row Level Security; hier zusätzlich `mitMandant` |
 *
 * ## Warum der Primärwechsel in EINER Transaktion läuft
 *
 * „Genau ein Primärordner" ist ein **Zustand**, keine Zeile: wer den alten zuerst auf
 * `false` setzt und dann stürzt, hinterläßt einen Arbeitsbereich **ohne** Arbeitsplatz. Wer
 * den neuen zuerst setzt, verstößt gegen den Teilindex. Deshalb: abgeben und übernehmen
 * **in derselben** Transaktion — und der Teilindex prüft am Ende, daß es genau einer ist.
 *
 * @module @prometheus-harness/store-postgres/ordner
 */

import { mitMandant, type SqlZugang } from './index.ts'
import { ladeWurzeln, type Wurzeln } from './roots.ts'

/** Die Zugriffsart eines Ordners. */
export type Zugriff = 'lesen' | 'schreiben'

/** Ein Ordner, wie er aus der Tabelle kommt. */
export interface Ordner {
  readonly id: string
  readonly workspaceId: string
  readonly pfad: string
  readonly istPrimaer: boolean
  readonly zugriff: Zugriff
  readonly sortierung: number
  readonly bezeichnung: string | undefined
}

/** Eine Zeile, wie die Abfrage sie liefert. */
interface Zeile {
  readonly id: string
  readonly workspace_id: string
  readonly pfad: string
  readonly ist_primaer: boolean
  readonly zugriff: string
  readonly sortierung: number
  readonly bezeichnung: string | null
}

/**
 * Wandelt eine Zeile in einen Ordner.
 *
 * **Ein unbekannter Zugriffswert wird zu `lesen`** — die sichere Richtung. Die Prüfregel der
 * Tabelle läßt nur zwei Werte zu; sollte sie einmal umgangen werden, gibt diese Funktion
 * **keine** Schreibrechte aus.
 *
 * @param zeile - die Zeile aus der Datenbank
 * @returns der Ordner
 */
function alsOrdner(zeile: Zeile): Ordner {
  return {
    id: zeile.id,
    workspaceId: zeile.workspace_id,
    pfad: zeile.pfad,
    istPrimaer: zeile.ist_primaer,
    zugriff: zeile.zugriff === 'schreiben' ? 'schreiben' : 'lesen',
    sortierung: zeile.sortierung,
    bezeichnung: zeile.bezeichnung ?? undefined,
  }
}

/** Die Spalten, die jede Abfrage dieser Datei zurückgibt. */
const SPALTEN = 'id, workspace_id, pfad, ist_primaer, zugriff, sortierung, bezeichnung'

/**
 * Liest alle Ordner eines Arbeitsbereichs.
 *
 * @param sql - Zugang mit `begin`
 * @param userId - der Mandant
 * @param workspaceId - der Arbeitsbereich
 * @returns die Ordner, Arbeitsplatz zuerst
 */
export async function listeOrdner(sql: SqlZugang, userId: string, workspaceId: string): Promise<readonly Ordner[]> {
  const zeilen = await mitMandant(sql, userId, async (innerhalb) => {
    const ergebnis = await innerhalb.unsafe(
      `select ${SPALTEN} from workspace_folders
        where workspace_id = $1
        order by ist_primaer desc, sortierung asc, pfad asc`,
      [workspaceId],
    )
    return (ergebnis ?? []) as readonly Zeile[]
  })
  return zeilen.map(alsOrdner)
}

/**
 * Legt einen Ordner an.
 *
 * **Wird der neue Ordner der Arbeitsplatz**, gibt der bisherige ihn in derselben Transaktion
 * ab (siehe Kopf). Ohne `istPrimaer` entsteht ein **Zusatzordner** — und der ist nach der
 * Vorgabe **nur lesbar**, wenn nichts anderes gesagt wird.
 *
 * @param sql - Zugang mit `begin`
 * @param userId - der Mandant
 * @param eingabe - Arbeitsbereich, Pfad und was gelten soll
 * @returns der angelegte Ordner
 */
export async function legeOrdnerAn(
  sql: SqlZugang,
  userId: string,
  eingabe: {
    readonly workspaceId: string
    readonly pfad: string
    readonly istPrimaer?: boolean
    readonly zugriff?: Zugriff
    readonly bezeichnung?: string
  },
): Promise<Ordner> {
  const primaer = eingabe.istPrimaer === true
  // **Der Arbeitsplatz ist immer schreibbar** — die Datenbank erzwingt es, hier wird es
  // entschieden: ein primärer Ordner mit „lesen" wäre ein Widerspruch, kein Fehler des Aufrufers.
  const zugriff: Zugriff = primaer ? 'schreiben' : (eingabe.zugriff ?? 'lesen')

  const zeilen = await mitMandant(sql, userId, async (innerhalb) => {
    if (primaer) {
      // **Der bisherige Arbeitsplatz gibt ab** — in derselben Transaktion, siehe Kopf.
      await innerhalb.unsafe(`update workspace_folders set ist_primaer = false where workspace_id = $1 and ist_primaer`, [
        eingabe.workspaceId,
      ])
    }
    const ergebnis = await innerhalb.unsafe(
      `insert into workspace_folders (id, workspace_id, user_id, pfad, ist_primaer, zugriff, bezeichnung, sortierung)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
               coalesce((select max(sortierung) + 1 from workspace_folders where workspace_id = $1), 0))
       returning ${SPALTEN}`,
      [
        eingabe.workspaceId,
        userId,
        eingabe.pfad,
        primaer,
        zugriff,
        eingabe.bezeichnung ?? null,
      ],
    )
    return (ergebnis ?? []) as readonly Zeile[]
  })

  const erste = zeilen[0]
  if (erste === undefined) throw new Error('Der Ordner wurde nicht angelegt.')
  return alsOrdner(erste)
}

/**
 * Setzt die Zugriffsart eines Ordners.
 *
 * @param sql - Zugang mit `begin`
 * @param userId - der Mandant
 * @param ordnerId - der Ordner
 * @param zugriff - die neue Art
 * @returns ob eine Zeile geändert wurde
 */
export async function setzeZugriff(
  sql: SqlZugang,
  userId: string,
  ordnerId: string,
  zugriff: Zugriff,
): Promise<boolean> {
  const zeilen = await mitMandant(sql, userId, async (innerhalb) => {
    const ergebnis = await innerhalb.unsafe(
      `update workspace_folders set zugriff = $2
        where id = $1 and not ist_primaer
        returning id`,
      [ordnerId, zugriff],
    )
    return (ergebnis ?? []) as readonly { readonly id: string }[]
  })
  // **Der Arbeitsplatz bleibt schreibbar.** Die Bedingung `not ist_primaer` in der Anweisung
  // ist die Absicht: er wird hier gar nicht erst angeboten.
  return zeilen.length > 0
}

/**
 * Entfernt einen **Zusatzordner**.
 *
 * **Der Arbeitsplatz bleibt.** `and not ist_primaer` in der Anweisung: ohne ihn hätte der
 * Arbeitsbereich keinen Ort mehr — und die Prüfregel der Datenbank („der Arbeitsplatz ist
 * schreibbar") hätte nichts mehr, worauf sie sich bezieht. Wer den Arbeitsplatz loswerden will,
 * löscht den **Arbeitsbereich**.
 *
 * @param sql - Zugang mit `begin`
 * @param userId - der Mandant
 * @param ordnerId - der Ordner
 * @returns ob eine Zeile entfernt wurde
 */
export async function entferneOrdner(sql: SqlZugang, userId: string, ordnerId: string): Promise<boolean> {
  const zeilen = await mitMandant(sql, userId, async (innerhalb) => {
    const ergebnis = await innerhalb.unsafe(
      `delete from workspace_folders where id = $1 and not ist_primaer returning id`,
      [ordnerId],
    )
    return (ergebnis ?? []) as readonly { readonly id: string }[]
  })
  return zeilen.length > 0
}

/**
 * Der Ausdruck, den die Tabelle für einen absoluten Pfad verlangt (`workspace_folders_pfad_absolut`).
 *
 * **Hier gespiegelt, nicht erfunden:** dieselbe Regel steht in Migration 9. Sie wird nur benutzt,
 * um offensichtlich Unbrauchbares gar nicht erst zu senden — die Wahrheit bleibt die Datenbank.
 */
const ABSOLUT = /^([A-Za-z]:[\\/]|\/)/

/**
 * Stellt sicher, daß der Arbeitsbereich **dieses Mandanten** in der Datenbank steht.
 *
 * ## Warum das hier steht
 *
 * Die Arbeitsbereiche führt der **Host** (`dsh-workspace`): er kennt Kennung, Titel und Pfad.
 * Unsere Datenbank kannte ihn nicht — und `workspace_folders` verweist auf
 * `workspaces (id, user_id)`. Ein Ordner für einen Arbeitsbereich **ohne** Zeile lief deshalb in
 * einen Fremdschlüssel-Fehler (**23503**). Genau das war der Grund, warum die Quellordner gebaut,
 * aber nie benutzt wurden.
 *
 * ## Was sie ausdrücklich **nicht** tut
 *
 * * Sie **ändert keinen vorhandenen Namen** (`do nothing`): der Name gehört dem Host, und eine
 *   zweite Wahrheit darüber wäre eine, die irgendwann falsch ist.
 * * Sie legt den **Arbeitsplatz** nur an, wenn es noch **keinen** Ordner gibt. Eine bewußte Wahl
 *   des Betreibers (ein anderer Primärordner) wird nicht überschrieben.
 * * Sie erfindet **keine** Zeile für einen fremden Mandanten: der `insert` läuft unter
 *   `mitMandant`, die Zeile gehört also `userId`.
 *
 * @param sql - Zugang mit `begin`
 * @param userId - der Mandant
 * @param eingabe - Kennung und Titel des Arbeitsbereichs, dazu sein Pfad (falls bekannt)
 */
export async function stelleBereit(
  sql: SqlZugang,
  userId: string,
  eingabe: { readonly workspaceId: string; readonly name: string; readonly pfad?: string },
): Promise<void> {
  const name = eingabe.name.trim() === '' ? 'Arbeitsbereich' : eingabe.name.trim()
  const pfad = eingabe.pfad?.trim() ?? ''
  await mitMandant(sql, userId, async (innerhalb) => {
    await innerhalb.unsafe(
      `insert into workspaces (id, user_id, name) values ($1, $2, $3)
        on conflict (id) do nothing`,
      [eingabe.workspaceId, userId, name],
    )
    // **Der Arbeitsplatz.** Ohne ihn zeigte der Dialog eine leere Liste, obwohl der Bereich einen
    // Ordner hat — und „Ordner hinzufügen" wäre der einzige Weg zu einem Ziel, das es schon gibt.
    if (pfad === '' || !ABSOLUT.test(pfad)) return
    await innerhalb.unsafe(
      `insert into workspace_folders (id, workspace_id, user_id, pfad, ist_primaer, zugriff, sortierung)
       select gen_random_uuid(), $1, $2, $3, true, 'schreiben', 0
        where not exists (select 1 from workspace_folders where workspace_id = $1 and user_id = $2)
       on conflict do nothing`,
      [eingabe.workspaceId, userId, pfad],
    )
  })
}

/**
 * Die Zugriffspfade — für Aufrufer, die nur sie brauchen.
 *
 * @param sql - Zugang mit `begin`
 * @param userId - der Mandant
 * @param workspaceId - der Arbeitsbereich
 * @returns die Pfade, oder `undefined` ohne Arbeitsplatz
 */
export function ladeZugriffspfade(sql: SqlZugang, userId: string, workspaceId: string): Promise<Wurzeln | undefined> {
  return ladeWurzeln(sql, userId, workspaceId)
}
