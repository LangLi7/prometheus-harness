/**
 * **Der Obsidian-Vault in der Datenbank — die Schreib- und Leseoperationen.**
 *
 * ## Woher diese Datei kommt
 *
 * Der Betreiber: *„ich dachte obsidian wird genutzt mit Postgresql?"* — und er hatte recht. Die
 * Migrationen `0006_wissensspeicher` und `0007_obsidian` lagen längst im Repo **und waren angewendet**
 * (gemessen: 21 Tabellen im Schema `pmh`, `vector 0.8.7`, `pg_trgm 1.6`, Migrationen 1–10). Was fehlte,
 * war der Code, der sie **füllt**: `store-postgres` hatte **keine** Funktion für `vaults`, `notes`,
 * `links` oder `tags`.
 *
 * ## Die drei Regeln, die aus dem Schema folgen
 *
 * 1. **Der Mandant steht in jeder Zeile.** `user_id` ist `NOT NULL`, und jeder Verweis ist ein
 *    **zusammengesetzter** Fremdschlüssel über `(…, user_id)`. Hier wird `user_id` deshalb bei **jeder**
 *    Anweisung mitgegeben — auch dort, wo der Primärschlüssel schon eindeutig wäre. Das ist keine
 *    Redundanz, sondern die Mauer: eine Notiz von Mandant B kann strukturell nicht in einem Vault von
 *    Mandant A liegen.
 * 2. **Der Abgleich braucht `content_hash` und `mtime`.** Ohne sie liest man jede Datei bei jedem Lauf
 *    neu ein. Beide kommen aus dem Dateisystem, nicht aus unserem Zugriff.
 * 3. **Ein Verweis ist roh *und* aufgelöst.** `ziel_text` bleibt stehen, auch wenn es das Ziel nicht
 *    gibt (in Obsidian völlig normal); `ziel_note_id` ist `NULL` und heißt „noch nicht geschrieben".
 *
 * ## Was hier NICHT passiert
 *
 * Kein Löschen. Wer eine Datei aus dem Vault entfernt, dessen Zeile bleibt vorerst stehen — das ist ein
 * **Abgleich** („was ist weg?") und gehört in den Einleser, nicht in eine Schreibfunktion. Eine
 * Schreibfunktion, die nebenbei löscht, ist die Sorte Funktion, nach der niemand mehr weiß, was sie tut.
 *
 * @module @prometheus-harness/store-postgres/notizen
 */

import type { SqlZugang } from './index.ts'

/** Ein Vault, wie er in der Datenbank steht. */
export interface VaultZeile {
  readonly id: string
  readonly pfad: string
  readonly name: string
}

/** Eine Notiz zum Schreiben. */
export interface NotizEingabe {
  /** Pfad relativ zum Vault (mit `/`). */
  readonly pfad: string
  readonly titel: string
  /** SHA-256 des Inhalts, 64 Hex-Zeichen — die Form, die `notes_hash_shape` verlangt. */
  readonly contentHash: string
  /** Die Änderungszeit **der Datei** (Millisekunden seit der Epoche). */
  readonly mtime: number
  readonly bytes: number
  readonly tags: readonly string[]
  /** Zielnamen der Verweise (roh, vor der Auflösung). */
  readonly ziele: readonly string[]
}

/** Eine gelesene Notiz. */
export interface NotizZeile {
  readonly id: string
  readonly pfad: string
  readonly titel: string
  readonly bytes: number | null
  readonly tags: readonly string[]
  readonly verweise: number
  readonly offeneVerweise: number
}

/** Führt eine Anweisung aus und gibt die Zeilen zurück — die eine Stelle, die `unsafe` kennt. */
async function zeilen<T>(sql: SqlZugang, anweisung: string, werte: readonly unknown[] = []): Promise<readonly T[]> {
  return (await sql.unsafe(anweisung, werte)) as readonly T[]
}

/**
 * **Den Vault eines Benutzers eintragen oder auffrischen.**
 *
 * Der Schlüssel ist `(user_id, pfad)` — zweimal derselbe Vault wäre zweimal dieselben Notizen, und der
 * Abgleich wüßte nicht, welche Zeile gilt. `zuletzt_gesehen_am` wird bei jedem Aufruf gesetzt: es ist
 * die Angabe, mit der man später fragt, welcher Vault lange nicht angesehen wurde.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Mandant
 * @param pfad - das Verzeichnis auf der Platte (absolut, ohne `..` — das prüft die Datenbank)
 * @param name - ein Anzeigename (Vorgabe: der letzte Pfadteil)
 * @returns der Vault
 */
export async function vaultSichern(
  sql: SqlZugang,
  userId: string,
  pfad: string,
  name = '',
): Promise<VaultZeile> {
  const anzeige = name === '' ? (pfad.split(/[\\/]/u).filter((t) => t !== '').pop() ?? pfad) : name
  const rows = await zeilen<{ id: string; pfad: string; name: string }>(
    sql,
    `INSERT INTO pmh.vaults (id, user_id, pfad, name, zuletzt_gesehen_am)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, pfad) DO UPDATE
       SET name = EXCLUDED.name, updated_at = now(), zuletzt_gesehen_am = now()
     RETURNING id::text, pfad, name`,
    [crypto.randomUUID(), userId, pfad, anzeige],
  )
  const erste = rows[0]
  if (erste === undefined) throw new Error('Der Vault wurde nicht gespeichert — die Datenbank gab keine Zeile zurück.')
  return erste
}

/**
 * **Eine Notiz schreiben oder auffrischen** — wiederholbar über `(vault_id, pfad)`.
 *
 * **Warum `gelesen_am` mitgeschrieben wird.** `mtime > gelesen_am` ist die Frage „seit dem letzten
 * Einlesen geändert?" — die häufigste Frage an diese Tabelle (`notes_abgleich_idx`).
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Mandant
 * @param vaultId - der Vault
 * @param notiz - die Notiz
 * @returns die Kennung der Zeile
 */
export async function notizSichern(
  sql: SqlZugang,
  userId: string,
  vaultId: string,
  notiz: NotizEingabe,
): Promise<string> {
  const rows = await zeilen<{ id: string }>(
    sql,
    `INSERT INTO pmh.notes (id, user_id, vault_id, pfad, titel, content_hash, mtime, bytes, gelesen_am)
     VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::double precision / 1000), $8, now())
     ON CONFLICT (vault_id, pfad) DO UPDATE
       SET titel = EXCLUDED.titel,
           content_hash = EXCLUDED.content_hash,
           mtime = EXCLUDED.mtime,
           bytes = EXCLUDED.bytes,
           gelesen_am = now(),
           updated_at = now()
     RETURNING id::text`,
    [crypto.randomUUID(), userId, vaultId, notiz.pfad, notiz.titel, notiz.contentHash, notiz.mtime, notiz.bytes],
  )
  const erste = rows[0]
  if (erste === undefined) throw new Error(`Die Notiz "${notiz.pfad}" wurde nicht gespeichert.`)
  return erste.id
}

/**
 * **Die Etiketten einer Notiz setzen** — Etiketten anlegen, wo sie fehlen, und verknüpfen.
 *
 * **Warum die Verknüpfung ersetzt und nicht ergänzt wird.** Eine Notiz hat genau die Etiketten, die in
 * ihr stehen. Wer nur hinzufügt, behält ein Etikett, das jemand aus der Datei gelöscht hat — und dann
 * zeigt die Suche ein Etikett, das es nicht mehr gibt.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Mandant
 * @param noteId - die Notiz
 * @param namen - die Etikettennamen
 */
export async function etikettenSetzen(
  sql: SqlZugang,
  userId: string,
  noteId: string,
  namen: readonly string[],
): Promise<number> {
  await zeilen(sql, 'DELETE FROM pmh.note_tags WHERE note_id = $1 AND user_id = $2', [noteId, userId])
  let gesetzt = 0
  for (const name of new Set(namen)) {
    const rows = await zeilen<{ id: string }>(
      sql,
      `INSERT INTO pmh.tags (id, user_id, name) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id::text`,
      [crypto.randomUUID(), userId, name],
    )
    const tag = rows[0]?.id
    if (tag === undefined) continue
    await zeilen(
      sql,
      `INSERT INTO pmh.note_tags (note_id, tag_id, user_id) VALUES ($1, $2, $3)
       ON CONFLICT (note_id, tag_id) DO NOTHING`,
      [noteId, tag, userId],
    )
    gesetzt += 1
  }
  return gesetzt
}

/**
 * **Die Verweise einer Notiz setzen** — roh und, wo möglich, aufgelöst.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Mandant
 * @param noteId - die Notiz, von der die Verweise ausgehen
 * @param ziele - die Zielnamen (`[[roh]]`) mit ihrer aufgelösten Kennung, wenn es sie gibt
 */
export async function verweiseSetzen(
  sql: SqlZugang,
  userId: string,
  noteId: string,
  ziele: readonly { readonly zielText: string; readonly zielNoteId?: string }[],
): Promise<number> {
  await zeilen(sql, 'DELETE FROM pmh.links WHERE von_note_id = $1 AND user_id = $2', [noteId, userId])
  let gesetzt = 0
  for (const ziel of ziele) {
    if (ziel.zielText === '') continue
    await zeilen(
      sql,
      `INSERT INTO pmh.links (von_note_id, ziel_text, ziel_note_id, user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (von_note_id, ziel_text) DO UPDATE SET ziel_note_id = EXCLUDED.ziel_note_id`,
      [noteId, ziel.zielText, ziel.zielNoteId ?? null, userId],
    )
    gesetzt += 1
  }
  return gesetzt
}

/**
 * **Notizen eines Benutzers lesen — mit Suche.**
 *
 * **Die Suche ist die, die das Schema schon kann — ohne Erweiterung.**
 *
 * **Der Fehler, der hier zuerst stand (gemessen am 16.10.2026).** Die Sortierung benutzte
 * `similarity(titel, $2)` aus `pg_trgm`. Die Erweiterung **ist** installiert (`1.6`), aber ihre
 * Funktionen lagen nicht im `search_path` der Verbindung — die Abfrage scheiterte mit
 * `function similarity(text, text) does not exist` (`42883`). Ein Suchfeld, das bei jedem Wort abbricht,
 * ist schlimmer als eines ohne Ähnlichkeitsmaß.
 *
 * Jetzt ordnet die Abfrage **nach der Art des Treffers**: exakt, „beginnt mit", „enthält", dann
 * alphabetisch. Das ist eine Rangfolge, die jeder versteht, keine Erweiterung braucht — und die bei
 * einem Vault mit tausenden Notizen genau das tut, was man von einem Suchfeld erwartet.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Mandant
 * @param suche - Suchbegriff (darf leer sein) und Grenze
 * @returns die Notizen, bei Suche nach der Art des Treffers geordnet
 */
export async function notizenLesen(
  sql: SqlZugang,
  userId: string,
  suche: { readonly q?: string; readonly grenze?: number; readonly vaultId?: string } = {},
): Promise<readonly NotizZeile[]> {
  const q = (suche.q ?? '').trim()
  const grenze = Math.min(500, Math.max(1, suche.grenze ?? 100))
  const rows = await zeilen<{
    id: string
    pfad: string
    titel: string
    bytes: number | null
    tags: string[] | null
    verweise: string
    offene: string
  }>(
    sql,
    `SELECT n.id::text,
            n.pfad,
            n.titel,
            n.bytes,
            array_remove(array_agg(DISTINCT t.name), NULL) AS tags,
            (SELECT count(*) FROM pmh.links l WHERE l.von_note_id = n.id AND l.user_id = n.user_id)::text AS verweise,
            (SELECT count(*) FROM pmh.links l WHERE l.von_note_id = n.id AND l.user_id = n.user_id
               AND l.ziel_note_id IS NULL)::text AS offene
       FROM pmh.notes n
       LEFT JOIN pmh.note_tags nt ON nt.note_id = n.id AND nt.user_id = n.user_id
       LEFT JOIN pmh.tags t ON t.id = nt.tag_id AND t.user_id = n.user_id
      WHERE n.user_id = $1
        AND ($4::uuid IS NULL OR n.vault_id = $4::uuid)
        AND ($2 = '' OR n.titel ILIKE '%' || $2 || '%' OR n.pfad ILIKE '%' || $2 || '%' OR t.name ILIKE '%' || $2 || '%')
      GROUP BY n.id, n.pfad, n.titel, n.bytes, n.user_id
      ORDER BY
        CASE WHEN $2 = '' THEN 0
             WHEN n.titel ILIKE $2 THEN 0
             WHEN n.titel ILIKE $2 || '%' THEN 1
             WHEN n.titel ILIKE '%' || $2 || '%' THEN 2
             ELSE 3 END,
        lower(n.titel), n.pfad
      LIMIT $3`,
    [userId, q, grenze, suche.vaultId ?? null],
  )
  return rows.map((r) => ({
    id: r.id,
    pfad: r.pfad,
    titel: r.titel,
    bytes: r.bytes,
    tags: r.tags ?? [],
    verweise: Number(r.verweise),
    offeneVerweise: Number(r.offene),
  }))
}

/** Die Notizen eines Vaults **als Tabelle Pfad → Kennung** — für die Auflösung der Verweise. */
export async function notizKennungen(sql: SqlZugang, userId: string, vaultId: string): Promise<ReadonlyMap<string, string>> {
  const rows = await zeilen<{ id: string; pfad: string; titel: string }>(
    sql,
    'SELECT id::text, pfad, titel FROM pmh.notes WHERE user_id = $1 AND vault_id = $2',
    [userId, vaultId],
  )
  const karte = new Map<string, string>()
  for (const r of rows) {
    // Zwei Schlüssel, wie Obsidian auflöst: der Pfad **und** der Dateiname ohne `.md`.
    karte.set(r.pfad.toLowerCase(), r.id)
    const name = (r.pfad.split('/').pop() ?? r.pfad).replace(/\.md$/iu, '')
    if (!karte.has(name.toLowerCase())) karte.set(name.toLowerCase(), r.id)
  }
  return karte
}

/** Wie viel in einem Vault liegt — für die Anzeige. */
export async function vaultStand(
  sql: SqlZugang,
  userId: string,
): Promise<{ readonly vaults: number; readonly notizen: number; readonly verweise: number; readonly etiketten: number }> {
  const rows = await zeilen<{ vaults: string; notizen: string; verweise: string; etiketten: string }>(
    sql,
    `SELECT (SELECT count(*) FROM pmh.vaults WHERE user_id = $1)::text AS vaults,
            (SELECT count(*) FROM pmh.notes WHERE user_id = $1)::text AS notizen,
            (SELECT count(*) FROM pmh.links WHERE user_id = $1)::text AS verweise,
            (SELECT count(*) FROM pmh.tags WHERE user_id = $1)::text AS etiketten`,
    [userId],
  )
  const r = rows[0]
  return {
    vaults: Number(r?.vaults ?? 0),
    notizen: Number(r?.notizen ?? 0),
    verweise: Number(r?.verweise ?? 0),
    etiketten: Number(r?.etiketten ?? 0),
  }
}

/** Die Vaults eines Kontos — Kennung, Pfad und Anzahl Notizen, für Auswahl und Anzeige. */export async function vaultsLesen(
  sql: SqlZugang,
  userId: string,
): Promise<readonly { readonly id: string; readonly pfad: string; readonly notizen: number }[]> {
  const rows = await zeilen<{ id: string; pfad: string; notizen: string }>(
    sql,
    `SELECT v.id::text AS id,
            v.pfad AS pfad,
            (SELECT count(*) FROM pmh.notes n WHERE n.vault_id = v.id AND n.user_id = v.user_id)::text AS notizen
       FROM pmh.vaults v
      WHERE v.user_id = $1
      ORDER BY v.pfad`,
    [userId],
  )
  return rows.map((r) => ({ id: r.id, pfad: r.pfad, notizen: Number(r.notizen) }))
}

/**
 * **Der Besitzer dieser Maschine — aber nur, wenn es genau einen gibt.**
 *
 * ## Warum das gebraucht wird
 *
 * Der Rechner hat zwei Türen: den **Token des Wirts** (er öffnet Dateien, Prozesse, Werkzeuge)
 * und die **Konto-Sitzung** (unser `pmh_session`). Wer mit dem Token arbeitet, ist der Besitzer
 * der Maschine — er soll nicht für ein Notizfenster ein zweites Konto aufmachen müssen; der
 * Betreiber hat genau das gemeldet („ich bin ja schon im Harness drinn warum nochmals ein login?").
 *
 * ## Warum genau einer
 *
 * Bei **einem** Verwalterkonto ist die Zuordnung eindeutig: der Token gehört diesem Konto. Bei
 * **zwei oder mehr** ist sie es nicht — dann könnte jeder Token-Inhaber die Notizen des anderen
 * lesen. Deshalb liefert diese Funktion bei 0 oder ≥2 Verwaltern `undefined`, und der Aufrufer
 * fällt auf „nicht angemeldet" zurück, statt zu raten.
 *
 * @param sql - der Datenbankzugang
 * @returns die Kennung des einzigen Verwalterkontos oder `undefined`
 */
export async function alleinigerVerwalter(sql: SqlZugang): Promise<string | undefined> {
  const rows = await zeilen<{ id: string }>(
    sql,
    `SELECT id::text AS id FROM pmh.users WHERE role = 'admin' LIMIT 2`,
    [],
  )
  return rows.length === 1 ? rows[0]?.id : undefined
}
