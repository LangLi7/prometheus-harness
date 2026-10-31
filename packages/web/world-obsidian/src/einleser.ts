/**
 * **Der Einleser: Vault → Datenbank.**
 *
 * ## Die Entscheidung, die dahinter steht
 *
 * Der Betreiber, 16.10.2026: *„zur diese frage jeder user hat sein eigenes also userbasierend same logic
 * mit Workspaces, admin hat auch sein eigenes"*.
 *
 * Also: **jeder Benutzer hat seinen Vault**, so wie jeder seine Workspaces hat — der Administrator auch
 * seinen eigenen. Das paßt zur Migration `0007`: `vaults.user_id` ist `NOT NULL`, und
 * `UNIQUE (user_id, pfad)` sagt, daß ein Pfad **je Benutzer** einmal vorkommt.
 *
 * ## Warum hier gelesen UND geschrieben wird
 *
 * Der Leser (`./index.ts`) macht aus einem Verzeichnis Notizen; dieses Modul legt sie in die Tabellen
 * `vaults`, `notes`, `tags`, `note_tags` und `links`. Getrennt gehalten, weil das eine **Text** ist und
 * das andere **Datenbank** — und weil der Leser ohne Datenbank prüfbar bleiben soll (12 Tests tun das).
 *
 * ## Wiederholbar, und zwar über `content_hash`
 *
 * Ein zweiter Lauf ändert nichts. Deshalb wird **vor** dem Schreiben gelesen, welche Hashes schon in der
 * Datenbank stehen: gleicher Hash → überspringen. Wer das ignoriert, schreibt bei jedem Lauf jede Notiz
 * neu — und die Datenbank tut Arbeit, die nichts ändert.
 *
 * **Was dieser Einleser NICHT tut: löschen.** Eine Notiz, deren Datei verschwunden ist, bleibt stehen.
 * Das ist ein eigener Schritt („was ist weg?") mit eigener Entscheidung — und er gehört nicht in ein
 * Werkzeug, das „einlesen" heißt.
 *
 * @module @prometheus-harness/world-obsidian/einleser
 */

import type { SqlZugang } from '@prometheus-harness/store-postgres'
import {
  etikettenSetzen,
  notizKennungen,
  notizSichern,
  vaultSichern,
  verweiseSetzen,
} from '@prometheus-harness/store-postgres'
import { leseVault } from './index.ts'
import { packeUmschlag, verpacke, type Hauptschluessel } from '@prometheus-harness/secrets'
import { zerlege, type Wissensspeicher } from '@prometheus-harness/store-postgres'

/**
 * **Was zum Einbetten nötig ist** — hereingereicht, nicht selbst gebaut.
 *
 * ## Warum der Einbetter hereinkommt und nicht hier entsteht
 *
 * Er braucht einen Schlüssel je Benutzer (aus `user_secrets`) und ein Modell. Beides weiß der
 * Wirt, nicht das Vault-Lesen. Mit einem **hereingereichten** Einbetter ist die Kette prüfbar, ohne
 * daß ein Schlüssel im Spiel ist — im Prüfstand ist es eine deterministische Funktion, im Betrieb
 * der Anbieter (`packages/ai/capabilities`, Fähigkeit `einbetten`).
 *
 * ## Warum `haupt` hier steht
 *
 * Die Stücke werden **verschlüsselt** abgelegt (`chunks.content_cipher`). Ohne Hauptschlüssel gäbe
 * es keinen Umschlag — und ein Klartextstück wäre eine zweite Kopie desselben Inhalts.
 */
export interface Einbettung {
  /** Der Wissensspeicher (Dokumente, Stücke, Einbettungen). */
  readonly speicher: Wissensspeicher
  /** Der Hauptschlüssel für die Umschläge der Stücke. */
  readonly haupt: Hauptschluessel
  /** Die Modellkennung, die in `chunks.embedding_model` steht. */
  readonly modell: string
  /** Aus Stücktexten werden Vektoren — einer je Text, in derselben Reihenfolge. */
  readonly einbetten: (texte: readonly string[]) => Promise<readonly (readonly number[])[]>
}

/** Was ein Lauf getan hat. */
export interface EinleseBericht {
  readonly vaultId: string
  readonly pfad: string
  /** Notizen, die neu in der Datenbank sind. */
  readonly neu: number
  /** Notizen, deren Inhalt sich geändert hat. */
  readonly geaendert: number
  /** Notizen, die schon mit demselben Hash dastanden. */
  readonly unveraendert: number
  readonly etiketten: number
  readonly verweise: number
  /** Verweise, deren Ziel es im Vault nicht gibt (in Obsidian völlig normal). */
  readonly offeneVerweise: number
}

/** Die vorhandenen Hashes eines Vaults — Pfad → Hash, für den Vergleich. */
async function vorhandeneHashes(
  sql: SqlZugang,
  userId: string,
  vaultId: string,
): Promise<ReadonlyMap<string, string>> {
  const rows = (await sql.unsafe(
    'SELECT pfad, content_hash FROM pmh.notes WHERE user_id = $1 AND vault_id = $2',
    [userId, vaultId],
  )) as readonly { pfad: string; content_hash: string | null }[]
  const karte = new Map<string, string>()
  for (const r of rows) if (r.content_hash !== null) karte.set(r.pfad, r.content_hash)
  return karte
}

/**
 * **Einen Vault einlesen.**
 *
 * ## Zwei Durchläufe, und der zweite braucht den ersten
 *
 * Ein Verweis zeigt auf eine **Kennung** (`links.ziel_note_id`), nicht auf einen Pfad. Die Kennung
 * entsteht aber erst beim Schreiben. Also: erst alle Notizen schreiben (Durchlauf 1), dann die Kennungen
 * lesen und die Verweise auflösen (Durchlauf 2). Andersherum zeigte jeder Verweis auf eine Notiz, die im
 * selben Lauf noch nicht existierte — und der Graph hätte beim ersten Lauf **keine** Kanten.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Mandant (der Eigentümer des Vaults)
 * @param wurzel - das Verzeichnis
 * @returns der Bericht
 */
export async function einlesen(
  sql: SqlZugang,
  userId: string,
  wurzel: string,
  einbettung?: Einbettung,
): Promise<EinleseBericht> {
  const graph = leseVault(wurzel)
  const vault = await vaultSichern(sql, userId, graph.wurzel)
  const bekannt = await vorhandeneHashes(sql, userId, vault.id)

  let neu = 0
  let geaendert = 0
  let unveraendert = 0

  // ── Durchlauf 1: die Notizen ────────────────────────────────────────────────────────────
  const zuSchreiben = new Set<string>()
  for (const notiz of graph.notizen) {
    const hash = notiz.contentHash ?? ''
    const vorher = bekannt.get(notiz.id)
    if (vorher !== undefined && vorher === hash) {
      unveraendert += 1
      continue
    }
    await notizSichern(sql, userId, vault.id, {
      pfad: notiz.id,
      titel: notiz.titel,
      contentHash: hash,
      mtime: notiz.mtime ?? Date.now(),
      bytes: notiz.groesse,
      tags: notiz.tags,
      ziele: notiz.links.map((l) => l.ziel),
    })
    zuSchreiben.add(notiz.id)
    if (vorher === undefined) neu += 1
    else geaendert += 1
  }

  // ── Durchlauf 2: Etiketten und Verweise (nur für das, was geschrieben wurde) ────────────
  const kennungen = await notizKennungen(sql, userId, vault.id)
  let etiketten = 0
  let verweise = 0
  for (const notiz of graph.notizen) {
    if (!zuSchreiben.has(notiz.id)) continue
    const noteId = kennungen.get(notiz.id.toLowerCase())
    if (noteId === undefined) continue
    etiketten += await etikettenSetzen(sql, userId, noteId, notiz.tags)
    verweise += await verweiseSetzen(
      sql,
      userId,
      noteId,
      notiz.links.map((l) => {
        const ziel = kennungen.get(l.ziel.toLowerCase()) ?? kennungen.get(`${l.ziel.toLowerCase()}.md`)
        return { zielText: l.ziel, ...ziel === undefined ? {} : { zielNoteId: ziel } }
      }),
    )
  }

  // ── Durchlauf 3: Stücke und Vektoren — nur wenn ein Einbetter hereingereicht wurde ────────
  //
  // **Warum optional, und warum nach den Notizen.** Ohne Schlüssel gibt es keine Einbettung; der
  // Vault muß trotzdem eingelesen werden — also bleibt der bisherige Weg unverändert, wenn niemand
  // eine `einbettung` übergibt. Und die Stücke kommen **nach** den Notizen, weil ein Stück ohne
  // Dokument nichts ist (`chunks.document_id NOT NULL`) und weil ein Fehler beim Einbetten die
  // Notiz nicht mitreißen darf.
  if (einbettung !== undefined) {
    for (const notiz of graph.notizen) {
      if (!zuSchreiben.has(notiz.id)) continue
      const dokumentId = await einbettung.speicher.legeDokumentAb({
        userId,
        art: 'notiz',
        herkunft: `${vault.pfad}/${notiz.id}`,
        titel: notiz.titel,
        bytes: notiz.groesse,
        ...(notiz.contentHash === undefined ? {} : { inhaltsHash: notiz.contentHash }),
      })
      const stuecke = zerlege(notiz.text)
      if (stuecke.length === 0) continue
      await einbettung.speicher.legeStueckeAb(
        userId,
        stuecke.map((stueck) => ({
          dokumentId,
          ordnung: stueck.ordnung,
          inhaltVerschluesselt: packeUmschlag(verpacke(new TextEncoder().encode(stueck.text), einbettung.haupt)),
        })),
      )
      const vektoren = await einbettung.einbetten(stuecke.map((s) => s.text))
      // Die frisch abgelegten Stücke haben Kennungen, die erst die Datenbank vergibt — sie kommen
      // über `offeneStuecke` zurück, gefiltert auf **dieses** Dokument.
      const eigene = (await einbettung.speicher.offeneStuecke(userId, stuecke.length * 4 + 10)).filter(
        (s) => s.dokumentId === dokumentId,
      )
      for (const [i, stueck] of eigene.entries()) {
        const vektor = vektoren[i]
        if (vektor === undefined) continue
        await einbettung.speicher.setzeEinbettung(userId, stueck.id, vektor, einbettung.modell, new Date())
      }
    }
  }

  return {
    vaultId: vault.id,
    pfad: vault.pfad,
    neu,
    geaendert,
    unveraendert,
    etiketten,
    verweise,
    offeneVerweise: graph.offeneVerweise,
  }
}
