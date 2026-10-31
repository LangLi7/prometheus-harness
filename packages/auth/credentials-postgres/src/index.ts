/**
 * `@prometheus-harness/dsh-credentials-postgres` — **die Credential-Seam des
 * Harness, abgelegt in Postgres.**
 *
 * ## Was dieses Paket ist
 *
 * Der Harness fragt `ctx.credentials` nach einem Wert (`DEEPSEEK_API_KEY`) oder
 * einem Record (`llm-pi-ai/openai`). Der mitgelieferte Provider legt beides in
 * `$DSH_HOME/.credentials.yaml` ab. Dieser Provider legt beides in
 * `user_secrets` / `credential_records` ab — verschlüsselt mit demselben
 * Hauptschlüssel wie die Prometheus-Geheimnisse.
 *
 * **Die Models-Seite bleibt unverändert.** Sie ruft weiter `set`, `unset` und
 * `describe`; nur die Ablage ist eine andere. Genau dafür ist die Seam da.
 *
 * ## Zwei Ebenen, dieselbe Grenze
 *
 * Die Werte liegen in Postgres; der **Hauptschlüssel** bleibt außerhalb
 * (`PMH_MASTER_KEY`, `master.key`, KMS). Ein Provider, der den Hauptschlüssel
 * aus derselben Datenbank läse, würde die Umschlagverschlüsselung aufheben.
 *
 * ## Ein Benutzer, nicht viele
 *
 * Der Harness ist ein Host-Prozess; ein Modellaufruf trägt keine
 * Prometheus-Sitzung. Der Provider arbeitet deshalb für **ein** Konto:
 * `benutzer` aus der Config oder der einzige Administrator. Die per-User-Ablage
 * gehört in die Prometheus-Oberfläche (`/token`), nicht in die Models-Seite.
 *
 * @module @prometheus-harness/dsh-credentials-postgres
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import {
  CredentialProvider,
  parseCredentialKey,
} from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo,
  CredentialKey,
  CredentialRecord,
  CredentialRecordEntry,
  CredentialRecordInfo,
  CredentialRef,
  ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'
import postgres from 'postgres'
import {
  entpacke,
  holeHauptschluessel,
  standardQuellen,
  verpacke,
  type Hauptschluessel,
} from '@prometheus-harness/secrets'
import {
  ladeCredentialRecord,
  ladeGeheimnis,
  listeCredentialRecords,
  listeGeheimnisse,
  loescheCredentialRecord,
  loescheGeheimnis,
  speichereGeheimnis,
  type SqlZugang,
} from '@prometheus-harness/store-postgres'

/** Nur für den Profil-Rauchtest; wird nach dem Test wieder entfernt. */
const PROBE = 'C:\\Users\\Chang\\prometheus-harness\\.pmh-build\\provider-probe.log'
appendFileSync(PROBE, 'module-geladen\n')

/** Die Konfiguration des Providers. */
export interface Config {
  /** Das Konto, dessen `user_secrets` gelten — E-Mail. Fehlt sie, muß es genau einen Admin geben. */
  benutzer?: string
  /** Die Datenbankadresse; Vorgabe `DATABASE_URL`. */
  databaseUrl?: string
  /** Das Home, in dem `master.key` liegt; Vorgabe `PMH_HOME`, dann `~/.pmh`. */
  dshHome?: string
}

/** Ein Provider, der einen Record-Rumpf als JSON verpackt. */
function alsRecord(wert: unknown): CredentialRecord {
  if (wert === null || typeof wert !== 'object') {
    throw new Error('credential-record: der gespeicherte Rumpf ist kein Objekt')
  }
  const art = (wert as { kind?: unknown }).kind
  if (art !== 'api-key' && art !== 'grant') {
    throw new Error('credential-record: der gespeicherte Rumpf hat keine bekannte Art')
  }
  return wert as CredentialRecord
}

export default class PostgresCredentialProvider extends CredentialProvider {
  static Config: z<Config> = z.object({
    benutzer: z.string(),
    databaseUrl: z.string(),
    dshHome: z.string(),
  })

  private readonly databaseUrl: string
  private readonly sql: ReturnType<typeof postgres>
  private readonly benutzer: string | undefined
  private readonly dshHome: string
  private haupt: Hauptschluessel | undefined
  private userIdPromise: Promise<string> | undefined
  private closed = false

  constructor(ctx: Context, public config: Config = {}) {
    appendFileSync(PROBE, `ctor-start db=${process.env.DATABASE_URL === undefined ? 'nein' : 'ja'}\n`)
    super(ctx)
    appendFileSync(PROBE, 'ctor-super\n')
    try {
      this.databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL?.trim() ?? ''
      if (this.databaseUrl === '') {
        throw new Error(
          'credentials-postgres: DATABASE_URL fehlt. Der Provider braucht die Anwendungsrolle (`pmh_app`), ' +
            'weil er Daten liest und schreibt.',
        )
      }
      this.benutzer = config.benutzer?.trim() || undefined
      this.dshHome = config.dshHome?.trim() || process.env.PMH_HOME?.trim() || join(homedir(), '.pmh')
      this.sql = postgres(this.databaseUrl, { max: 2, connect_timeout: 5, onnotice: () => undefined })
      ctx.effect(() => () => {
        this.closed = true
        void this.sql.end({ timeout: 5 }).catch(() => undefined)
      })
      appendFileSync(PROBE, 'ctor-ok\n')
    } catch (fehler) {
      appendFileSync(PROBE, `ctor-fehler ${fehler instanceof Error ? fehler.stack ?? fehler.message : String(fehler)}\n`)
      throw fehler
    }
  }

  /** Der Hauptschlüssel — erst beim ersten Zugriff, damit der Boot nicht an ihm hängt. */
  private hauptschluessel(): Hauptschluessel {
    if (this.haupt !== undefined) return this.haupt
    const roh = Number(process.env.PMH_MASTER_KEY_VERSION ?? '1')
    this.haupt = holeHauptschluessel(
      standardQuellen(process.env, this.dshHome),
      Number.isInteger(roh) && roh > 0 ? roh : 1,
    )
    return this.haupt
  }

  /** Das eine Konto — aus der Config oder der einzige Administrator. */
  private userId(): Promise<string> {
    if (this.userIdPromise !== undefined) return this.userIdPromise
    this.userIdPromise = (async () => {
      if (this.benutzer !== undefined) {
        const zeilen = await this.sql.unsafe('SELECT id FROM pmh.users WHERE lower(email) = lower($1)', [this.benutzer])
        const id = (zeilen as { id?: string }[])[0]?.id
        if (id === undefined) throw new Error(`credentials-postgres: kein Benutzer mit der Adresse ${this.benutzer}`)
        return id
      }
      const zeilen = await this.sql.unsafe("SELECT id FROM pmh.users WHERE role = 'admin'")
      const ids = (zeilen as { id?: string }[]).map((zeile) => zeile.id).filter((id): id is string => id !== undefined)
      if (ids.length !== 1) {
        throw new Error(
          `credentials-postgres: ohne \`benutzer\` braucht es genau einen Administrator, gefunden: ${String(ids.length)}`,
        )
      }
      return ids[0]!
    })()
    return this.userIdPromise
  }

  /** Der Wert aus der **Prozeßumgebung** — die einzige Schicht über der Datenbank. */
  private ausUmgebung(ref: CredentialRef): string | undefined {
    const wert = process.env[ref]
    return wert !== undefined && wert.length > 0 ? wert : undefined
  }

  private assertNichtSchattiert(ref: CredentialRef, tat: string): void {
    if (this.ausUmgebung(ref) !== undefined) {
      throw new Error(
        `credentials-postgres: "${ref}" wird von der Prozeßumgebung überdeckt; ${tat} würde wirkungslos bleiben.`,
      )
    }
  }

  /** Eine Zeile nachschlagen, ohne den Klartext zu entschlüsseln. */
  private async vorhanden(ref: CredentialRef): Promise<boolean> {
    const zeilen = await listeGeheimnisse(this.sql as SqlZugang, await this.userId())
    return zeilen.some((zeile) => zeile.ref === ref)
  }

  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const umgebung = this.ausUmgebung(ref)
    if (umgebung !== undefined) return { value: umgebung, source: 'process' }
    const bytes = await ladeGeheimnis(this.sql as SqlZugang, this.hauptschluessel(), {
      userId: await this.userId(),
      ref,
    })
    if (bytes === undefined) return undefined
    const wert = new TextDecoder().decode(bytes)
    return wert === '' ? undefined : { value: wert, source: 'postgres' }
  }

  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const umgebung = this.ausUmgebung(ref)
    if (umgebung !== undefined) return { configured: true, source: 'process', writable: false }
    const da = await this.vorhanden(ref)
    return da
      ? { configured: true, source: 'postgres', writable: true }
      : { configured: false, writable: true }
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    if (this.closed) throw new Error('credentials-postgres ist beendet')
    if (value === '') throw new Error(`credentials-postgres: leerer Wert für "${ref}" — dafür gibt es unset`)
    this.assertNichtSchattiert(ref, 'set')
    await speichereGeheimnis(this.sql as SqlZugang, this.hauptschluessel(), {
      userId: await this.userId(),
      ref,
      klartext: new TextEncoder().encode(value),
    })
    this.notifyUpdated(ref)
  }

  async unset(ref: CredentialRef): Promise<void> {
    if (this.closed) throw new Error('credentials-postgres ist beendet')
    this.assertNichtSchattiert(ref, 'unset')
    const entfernt = await loescheGeheimnis(this.sql as SqlZugang, await this.userId(), ref)
    if (entfernt) this.notifyUpdated(ref)
  }

  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    parseCredentialKey(key)
    const rumpf = await ladeCredentialRecord(this.sql as SqlZugang, this.hauptschluessel(), {
      userId: await this.userId(),
      key,
    })
    return rumpf === undefined ? undefined : alsRecord(rumpf)
  }

  async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    parseCredentialKey(key)
    const zeilen = await listeCredentialRecords(this.sql as SqlZugang, await this.userId())
    const zeile = zeilen.find((eintrag) => eintrag.key === key)
    return zeile === undefined
      ? { configured: false, writable: true }
      : { configured: true, kind: zeile.kind as CredentialRecord['kind'], writable: true }
  }

  async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    const zeilen = await listeCredentialRecords(this.sql as SqlZugang, await this.userId())
    return zeilen.map((zeile) => ({
      key: parseCredentialKey(zeile.key),
      kind: zeile.kind as CredentialRecord['kind'],
    }))
  }

  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    if (this.closed) throw new Error('credentials-postgres ist beendet')
    parseCredentialKey(key)
    const userId = await this.userId()
    const haupt = this.hauptschluessel()
    const ergebnis = await this.sql.begin(async (tx) => {
      // **Die Sperre gehört in die Abfrage.** Zwei Prozesse, die ein Refresh-Token
      // drehen, dürfen nicht beide denselben Stand lesen; `FOR UPDATE` macht aus
      // Lesen und Schreiben eine exklusive Entscheidung.
      const zeilen = (await tx.unsafe(
        `SELECT payload_cipher, wrapped_key, master_key_version
           FROM pmh.credential_records
          WHERE user_id = $1 AND key = $2
          FOR UPDATE`,
        [userId, key],
      )) as {
        payload_cipher: Uint8Array
        wrapped_key: Uint8Array
        master_key_version: number
      }[]
      const zeile = zeilen[0]
      const current =
        zeile === undefined
          ? undefined
          : alsRecord(
              JSON.parse(
                new TextDecoder().decode(
                  entpacke(
                    {
                      valueCipher: zeile.payload_cipher,
                      wrappedKey: zeile.wrapped_key,
                      masterKeyVersion: zeile.master_key_version,
                    },
                    haupt,
                  ),
                ),
              ),
            )
      const next = await mutate(current)
      if (next === undefined) return current
      if (next.kind !== 'api-key' && next.kind !== 'grant') {
        throw new Error(`credentials-postgres: unbekannte Record-Art für "${key}"`)
      }
      const umschlag = verpacke(new TextEncoder().encode(JSON.stringify(next)), haupt)
      await tx.unsafe(
        `INSERT INTO pmh.credential_records
           (id, user_id, key, kind, payload_cipher, wrapped_key, master_key_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, key) DO UPDATE
           SET kind = EXCLUDED.kind,
               payload_cipher = EXCLUDED.payload_cipher,
               wrapped_key = EXCLUDED.wrapped_key,
               master_key_version = EXCLUDED.master_key_version,
               updated_at = now()`,
        [
          randomUUID(),
          userId,
          key,
          next.kind,
          Buffer.from(umschlag.valueCipher),
          Buffer.from(umschlag.wrappedKey),
          umschlag.masterKeyVersion,
        ],
      )
      return next
    })
    if (ergebnis !== undefined) this.notifyRecordUpdated(key)
    return ergebnis
  }

  async deleteRecord(key: CredentialKey): Promise<void> {
    if (this.closed) throw new Error('credentials-postgres ist beendet')
    parseCredentialKey(key)
    const entfernt = await loescheCredentialRecord(this.sql as SqlZugang, await this.userId(), key)
    if (entfernt) this.notifyRecordUpdated(key)
  }
}
