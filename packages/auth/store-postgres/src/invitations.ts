/**
 * `@prometheus-harness/store-postgres/einladungen` — die Ablage der Einladungen.
 *
 * ## Was hier entschieden wird und was nicht
 *
 * Diese Datei **speichert** und **verbraucht** — sie sagt **nicht**, ob eine
 * Einladung gut ist. Die Regeln (abgelaufen? schon eingelöst? zurückgezogen?)
 * stehen in `@prometheus-harness/auth-http/einladung` und sind dort **ohne
 * Datenbank** prüfbar. Dieselbe Trennung wie beim Claim
 * (`packages/auth/claim`): eine Prüfung, die nur mit laufender Datenbank läuft,
 * wird nicht geprüft.
 *
 * ## Was die Datenbank trotzdem sicherstellt
 *
 * Zwei Dinge kann nur sie:
 *
 * | Regel | Wie |
 * |---|---|
 * | **Ein Token gilt genau einmal** | {@link EinladungAblage.verbrauche} ist ein `UPDATE … WHERE consumed_at IS NULL` und liefert die Zahl der geänderten Zeilen zurück. Zwei gleichzeitige Einlösungen: eine gewinnt, die andere bekommt `false` |
 * | **Ein Hash kommt nur einmal vor** | der eindeutige Index `invitations_token_hash_key` |
 *
 * Der erste Punkt ist der wichtige. Ein „erst lesen, dann prüfen, dann
 * schreiben" in der Anwendung hätte ein Zeitfenster, in dem zwei Aufrufer
 * dieselbe Einladung für gültig halten — und dann entstehen **zwei** Konten aus
 * **einem** Link.
 *
 * @module @prometheus-harness/store-postgres/einladungen
 */

import { randomUUID } from 'node:crypto'
import { alsIso, alsIsoOderNichts, type SqlZugang } from './index.ts'

// ---------------------------------------------------------------------------
// Die Form einer Einladung
// ---------------------------------------------------------------------------

/** Eine gespeicherte Einladung — **ohne** Klartext-Token. */
export interface EinladungRecord {
  readonly id: string
  /** SHA-256 des Tokens, hexadezimal. Mehr gibt es nicht. */
  readonly tokenHash: string
  /** Wer sie erzeugt hat. */
  readonly createdBy: string
  /** Die Rolle, die das eingelöste Konto bekommt. */
  readonly role: 'user' | 'admin'
  /** Ein Merker für den Admin. */
  readonly note: string
  readonly createdAt: string
  readonly expiresAt: string
  /**
   * Gesetzt heißt: eingelöst — und von wem.
   *
   * **`string | undefined` statt `?`.** Das Haus schaltet
   * `exactOptionalPropertyTypes` ein; danach wäre ein optionales Feld „darf
   * fehlen, aber nicht `undefined` sein". Diese Werte fehlen aber regelmäßig,
   * und die Aufrufer prüfen auf `undefined`. Dieselbe Form wie
   * `UserRecord.disabledAt`.
   */
  readonly consumedAt: string | undefined
  readonly consumedBy: string | undefined
  /** Gesetzt heißt: vom Ersteller zurückgezogen. */
  readonly revokedAt: string | undefined
}

/** Eine Einladung, die gerade entsteht. Die Kennung vergibt der Speicher. */
export interface NeueEinladung {
  readonly tokenHash: string
  readonly createdBy: string
  readonly role: 'user' | 'admin'
  readonly note: string
  readonly expiresAt: Date
  readonly jetzt: Date
}

/** Die Ablage. */
export interface EinladungAblage {
  /** Legt eine Einladung an und gibt sie zurück. */
  legeAb(eintrag: NeueEinladung): Promise<EinladungRecord>
  /**
   * Sucht eine Einladung anhand des vorgelegten **Hash**.
   *
   * Liefert auch abgelaufene, eingelöste und zurückgezogene Einträge: die
   * Anwendung muß den Unterschied zwischen „gibt es nicht" und „gibt es, aber
   * zu spät" **benennen** können. Wer die Antwort auf „unbekannt" verkürzt,
   * nimmt dem Eingeladenen die einzige Auskunft, die ihm hilft.
   */
  findeNachHash(tokenHash: string): Promise<EinladungRecord | undefined>
  /** Die Einladungen eines Admins, die jüngste zuerst. */
  liste(createdBy: string, grenze: number): Promise<readonly EinladungRecord[]>
  /** Wie viele **offene** Einladungen ein Admin hat. */
  zaehleOffen(createdBy: string, jetzt: Date): Promise<number>
  /**
   * **Belegt** eine Einladung — genau einmal.
   *
   * Setzt `consumed_at`, läßt `consumed_by` noch leer. Die Kennung des Kontos
   * gibt es in diesem Augenblick noch nicht: die Einladung wird **vor** dem
   * Anlegen verbraucht, damit nicht zwei gleichzeitige Einlösungen zwei Konten
   * erzeugen. `consumed_by` verweist auf `users` — ein Wert, den es hier noch
   * nicht geben kann. Deshalb zwei Schritte: belegen, dann (nach dem Anlegen)
   * {@link bestaetige}.
   *
   * @returns ob **diese** Ausführung die Einladung belegt hat
   */
  verbrauche(id: string, jetzt: Date): Promise<boolean>
  /**
   * Trägt das entstandene Konto ein.
   *
   * **Nur Buchführung, keine zweite Entscheidung.** Ob die Einladung gilt, hat
   * {@link verbrauche} entschieden; hier wird vermerkt, **wer** aus ihr
   * entstanden ist. Scheitert dieser Schritt (etwa weil der Prozeß dazwischen
   * endet), bleibt die Einladung „eingelöst ohne Konto" — ein sichtbarer,
   * harmloser Zustand, aber kein zweiter Einlöseweg.
   *
   * @returns ob ein Eintrag ergänzt wurde
   */
  bestaetige(id: string, userId: string): Promise<boolean>
  /**
   * Gibt eine **eigene, unbestätigte** Belegung wieder frei.
   *
   * **Wozu das nötig ist.** Scheitert das Anlegen nach der Belegung — zu
   * schwaches Paßwort, Adresse vergeben —, wäre der Link verbrannt, obwohl
   * niemand ein Konto bekam.
   *
   * **Warum `consumed_by IS NULL` geprüft wird.** Nur eine Belegung, die noch
   * kein Konto trägt, wird freigegeben. Eine bestätigte Einlösung bleibt
   * unberührt — sonst könnte ein später Fehlschlag eine gültige Einladung
   * wieder öffnen.
   *
   * @returns ob eine Belegung freigegeben wurde
   */
  gibFrei(id: string): Promise<boolean>
  /** Zieht eine Einladung zurück. Nur der Ersteller, nur solange offen. */
  ziehZurueck(id: string, createdBy: string, jetzt: Date): Promise<boolean>
}

// ---------------------------------------------------------------------------
// Die Zeilenform, wie der Treiber sie liefert
// ---------------------------------------------------------------------------

/** Eine Zeile aus `invitations`. */
interface Zeile {
  readonly id: string
  readonly token_hash: string
  readonly created_by: string
  readonly role: string
  readonly note: string
  readonly created_at: unknown
  readonly expires_at: unknown
  readonly consumed_at: unknown
  readonly consumed_by: unknown
  readonly revoked_at: unknown
}

/**
 * Deutet eine Zeile in einen Datensatz um — **an einer Stelle**.
 *
 * **Warum die Zeitpunkte durch {@link alsIso} gehen.** Der Treiber liefert für
 * `timestamptz` ein `Date`. Die Schnittstelle verlangt Text. Bliebe das `Date`
 * stehen, sähe der Wert richtig aus, bis ihn jemand mit einem Text vergleicht
 * oder in JSON schreibt — ein `Date` in einem Feld, das `…At` heißt und Text
 * sein soll, fällt nirgends auf.
 */
function deute(zeile: Zeile): EinladungRecord {
  const rolle: 'user' | 'admin' = zeile.role === 'admin' ? 'admin' : 'user'
  // **Die drei Felder stehen immer da — mit `undefined`, wenn sie fehlen.**
  // `EinladungRecord` verlangt sie als `string | undefined` (dieselbe Form wie
  // `UserRecord.disabledAt`). Ein bedingtes Weglassen machte sie optional, und
  // `exactOptionalPropertyTypes` unterscheidet „darf fehlen" von „darf
  // `undefined` sein" — ein Unterschied, den hier niemand braucht.
  return {
    id: zeile.id,
    tokenHash: zeile.token_hash,
    createdBy: zeile.created_by,
    role: rolle,
    note: zeile.note,
    createdAt: alsIso(zeile.created_at),
    expiresAt: alsIso(zeile.expires_at),
    consumedAt: alsIsoOderNichts(zeile.consumed_at),
    consumedBy:
      zeile.consumed_by === null || zeile.consumed_by === undefined ? undefined : String(zeile.consumed_by),
    revokedAt: alsIsoOderNichts(zeile.revoked_at),
  }
}

// ---------------------------------------------------------------------------
// Die Ablage
// ---------------------------------------------------------------------------

/** Spaltenliste — **einmal**, damit die Reihenfolge nicht auseinanderläuft. */
const SPALTEN = 'id, token_hash, created_by, role, note, created_at, expires_at, consumed_at, consumed_by, revoked_at'

/**
 * Baut die Ablage über einem Zugang.
 *
 * **Kein `mitMandant`.** Diese Tabelle trägt keine Mandantenspalte und keine
 * Row Level Security — sie wird gelesen, **bevor** es eine Identität gibt
 * (Begründung in Migration 0012). Ein `set_config` hier wäre nicht nur
 * unnötig, sondern falsch: es setzte einen Mandanten für eine Abfrage, die
 * gerade keinen hat.
 *
 * @param sql - der Datenbankzugang
 * @returns die Ablage
 */
export function erzeugeEinladungAblage(sql: SqlZugang): EinladungAblage {
  return {
    async legeAb(eintrag: NeueEinladung): Promise<EinladungRecord> {
      const zeilen = (await sql.unsafe(
        `INSERT INTO invitations (id, token_hash, created_by, role, note, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${SPALTEN}`,
        [
          randomUUID(),
          eintrag.tokenHash,
          eintrag.createdBy,
          eintrag.role,
          eintrag.note,
          eintrag.jetzt,
          eintrag.expiresAt,
        ],
      )) as readonly Zeile[]
      const angelegt = zeilen[0]
      if (angelegt === undefined) {
        // Kann eigentlich nicht vorkommen (INSERT … RETURNING liefert immer eine
        // Zeile). Wenn doch, ist es kein „leeres Ergebnis", sondern ein Fehler —
        // und ein stiller `undefined`-Rückgabewert sähe aus wie Erfolg.
        throw new Error('die Einladung wurde nicht angelegt (INSERT … RETURNING lieferte keine Zeile)')
      }
      return deute(angelegt)
    },

    async findeNachHash(tokenHash: string): Promise<EinladungRecord | undefined> {
      const zeilen = (await sql.unsafe(`SELECT ${SPALTEN} FROM invitations WHERE token_hash = $1`, [
        tokenHash,
      ])) as readonly Zeile[]
      const erste = zeilen[0]
      return erste === undefined ? undefined : deute(erste)
    },

    async liste(createdBy: string, grenze: number): Promise<readonly EinladungRecord[]> {
      // **Die Grenze kommt vom Aufrufer, nicht aus der Abfrage.** Ein `LIMIT`
      // ohne benannte Zahl wäre eine Entscheidung, die hier niemand sieht.
      const zeilen = (await sql.unsafe(
        `SELECT ${SPALTEN} FROM invitations WHERE created_by = $1 ORDER BY created_at DESC LIMIT $2`,
        [createdBy, grenze],
      )) as readonly Zeile[]
      return zeilen.map(deute)
    },

    async zaehleOffen(createdBy: string, jetzt: Date): Promise<number> {
      // `::int`, weil `count` als **Text** zurückkommt (bigint paßt nicht in eine
      // JavaScript-Zahl) — `Number('3')` wäre eine Umdeutung an der falschen Stelle.
      const zeilen = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM invitations
          WHERE created_by = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2`,
        [createdBy, jetzt],
      )) as readonly { n: number }[]
      return zeilen[0]?.n ?? 0
    },

    async verbrauche(id: string, jetzt: Date): Promise<boolean> {
      // **Der Vergleich steht im WHERE, nicht davor.** Nur so entscheidet die
      // Datenbank, wer gewinnt: die erste Ausführung ändert die Zeile, jede
      // weitere findet sie nicht mehr (consumed_at ist dann nicht NULL) und
      // bekommt `false`. Ein Lesen-Prüfen-Schreiben hätte dazwischen ein
      // Zeitfenster, in dem zwei Aufrufer dieselbe Einladung für gültig halten.
      const zeilen = (await sql.unsafe(
        `UPDATE invitations
            SET consumed_at = $2
          WHERE id = $1
            AND consumed_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > $2
         RETURNING id`,
        [id, jetzt],
      )) as readonly { id: string }[]
      return zeilen.length > 0
    },

    async bestaetige(id: string, userId: string): Promise<boolean> {
      // `consumed_by IS NULL` macht den Schritt einmalig: ein zweiter Aufruf —
      // etwa ein doppelt abgeschickter Weg — ändert nichts mehr.
      const zeilen = (await sql.unsafe(
        `UPDATE invitations
            SET consumed_by = $2
          WHERE id = $1
            AND consumed_at IS NOT NULL
            AND consumed_by IS NULL
         RETURNING id`,
        [id, userId],
      )) as readonly { id: string }[]
      return zeilen.length > 0
    },

    async gibFrei(id: string): Promise<boolean> {
      // **`consumed_by IS NULL` ist der Besitznachweis.** Nur eine Belegung, die
      // noch kein Konto trägt, wird freigegeben. Eine bestätigte Einlösung
      // bleibt unberührt — sonst könnte ein später Fehlschlag eine gültige
      // Einladung wieder öffnen.
      const zeilen = (await sql.unsafe(
        `UPDATE invitations
            SET consumed_at = NULL
          WHERE id = $1
            AND consumed_at IS NOT NULL
            AND consumed_by IS NULL
         RETURNING id`,
        [id],
      )) as readonly { id: string }[]
      return zeilen.length > 0
    },

    async ziehZurueck(id: string, createdBy: string, jetzt: Date): Promise<boolean> {
      // `created_by = $2` ist der Besitznachweis: ein Administrator darf die
      // Einladung **eines anderen** nicht zurückziehen. Das ist keine
      // Mißtrauensregel, sondern die Frage „wessen Versprechen ist das?".
      const zeilen = (await sql.unsafe(
        `UPDATE invitations
            SET revoked_at = $3
          WHERE id = $1
            AND created_by = $2
            AND consumed_at IS NULL
            AND revoked_at IS NULL
         RETURNING id`,
        [id, createdBy, jetzt],
      )) as readonly { id: string }[]
      return zeilen.length > 0
    },
  }
}
