/**
 * Die zwei Ablagen: **die Datei** für die Einträge, **die Credential-Naht** für die Schlüssel.
 *
 * ## Warum zwei
 *
 * Ein Eintrag ist keine Absicht, sondern eine **Beschreibung**: welcher Anbieter, welche Fähigkeit,
 * welches Modell. So etwas gehört in eine Datei, die man lesen, sichern und von Hand ändern kann.
 *
 * Ein Schlüssel ist ein **Geheimnis**. Er gehört in den Speicher, den der Harness dafür hat
 * (`ctx.credentials`): dort ist er mit einem Provider verschlüsselt abgelegt – in unserem Betrieb
 * in Postgres (`user_secrets` / `credential_records`, Migration 0011), mit dem Hauptschlüssel
 * **außerhalb** der Datenbank. Er in dieselbe Datei zu schreiben wäre der Fehler, den
 * `@prometheus-harness/settings` an einer Stelle bereits benennt.
 *
 * ## Warum ein Record und keine Umgebungsvariable
 *
 * Die Naht kennt zwei Adressräume: **Referenzen** (`OPENROUTER_API_KEY`, ein Name, der auch aus
 * der Umgebung kommen kann) und **Records** (`<scope>/<id>`, ein Rumpf, den nur der Besitzer
 * versteht). Ein Zugang ist ein Record: `pmh-zugaenge/openrouter-privat`. Der Scope ist der
 * **registrierte Name dieses Plugins** — ein Record, dessen Scope kein Plugin gehört, ist eine
 * Waise, und die Oberfläche soll ihn als solche zeigen können.
 *
 * Die Umgebungsvariable bleibt als **Ausweichweg** ({@link Zugang.umgebung}): in einem Container
 * steht der Schlüssel absichtlich in der Umgebung. Die Ablage geht vor.
 *
 * @module @prometheus-harness/zugaenge/speicher
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'

import { LEER, leseZugaenge, schreibeZugaenge, type Zugangsdatei } from './vertrag.ts'

/** Der Scope der Records — **der registrierte Name dieses Plugins**. */
export const SCOPE = 'pmh-zugaenge'

/** Der Dateiname im Harness-Home. */
export const DATEINAME = 'zugaenge.json'

/**
 * Wo die Einträge liegen.
 *
 * **Warum `~/.pmh` und nicht `$DSH_HOME`.** Nach der Namensgrenze des Projekts
 * (`docs/decisions/naming-grenze.md`) ist `DSH_HOME` das Home des **fremden** Harness. Unsere
 * Dateien gehören in unser eigenes Home; sonst lägen sie in einem Verzeichnis, das ein
 * Upstream-Update mitnimmt.
 *
 * Reihenfolge: `PMH_ZUGAENGE_DATEI` (überstimmt alles, für Tests und Umzüge) → `PMH_HOME` →
 * `~/.pmh`.
 *
 * @param umgebung - die Umgebung (im Test setzbar)
 * @returns der Pfad
 */
export function zugaengePfad(umgebung: Readonly<Record<string, string | undefined>> = process.env): string {
  const gesetzt = umgebung['PMH_ZUGAENGE_DATEI']
  if (gesetzt !== undefined && gesetzt.trim() !== '') return gesetzt.trim()
  const home = umgebung['PMH_HOME']
  return join(home !== undefined && home.trim() !== '' ? home.trim() : join(homedir(), '.pmh'), DATEINAME)
}

/**
 * Liest die Datei.
 *
 * **Eine fehlende Datei ist kein Fehler**, sondern der Zustand vor dem ersten Eintrag. Eine
 * **kaputte** Datei ist einer: wer sie hat, hat etwas gewollt; sie still durch „nichts" zu ersetzen
 * hieße, seine Einträge verschwinden zu lassen, ohne es zu sagen.
 *
 * @param pfad - der Pfad
 * @returns der Inhalt
 * @throws Zugangsfehler - wenn die Datei da, aber unbrauchbar ist
 */
export async function liesDatei(pfad: string): Promise<Zugangsdatei> {
  let text: string
  try {
    text = await readFile(pfad, 'utf8')
  } catch (fehler) {
    if (istFehlend(fehler)) return LEER
    throw fehler
  }
  return leseZugaenge(text)
}

/**
 * Schreibt die Datei — **atomar** und mit engen Rechten.
 *
 * **Warum atomar.** Ein abgebrochener Schreibvorgang hinterläßt sonst eine halbe Datei — und die
 * liest beim nächsten Start niemand mehr. Geschrieben wird in eine Nachbardatei, dann umbenannt;
 * `rename` ersetzt auf beiden Plattformen (libuv: `MoveFileEx` mit `REPLACE_EXISTING`).
 *
 * **Warum Modus 0600.** Auch ohne Schlüssel steht hier, **welche** Anbieter jemand benutzt — und
 * welche Adresse ein lokaler Endpunkt hat. Das ist keine Kleinigkeit, die jeder lesen muß.
 *
 * @param pfad - der Pfad
 * @param datei - der Inhalt
 */
export async function schreibeDatei(pfad: string, datei: Zugangsdatei): Promise<void> {
  const text = schreibeZugaenge(datei)
  await mkdir(dirname(pfad), { recursive: true })
  const zwischen = `${pfad}.${randomUUID()}.tmp`
  try {
    await writeFile(zwischen, text, { encoding: 'utf8', mode: 0o600 })
    await rename(zwischen, pfad)
  } catch (fehler) {
    await unlink(zwischen).catch(() => undefined)
    throw fehler
  }
}

/**
 * Prüft, ob ein Fehler „die Datei gibt es nicht" bedeutet.
 *
 * @param fehler - der Fehler
 * @returns ob er ein ENOENT ist
 */
function istFehlend(fehler: unknown): boolean {
  return (
    typeof fehler === 'object' &&
    fehler !== null &&
    'code' in fehler &&
    (fehler as { code?: unknown }).code === 'ENOENT'
  )
}

// ---------------------------------------------------------------------------
// Die Schlüsselablage
// ---------------------------------------------------------------------------

/** Was die Oberfläche über einen Schlüssel wissen darf — **nie** den Wert. */
export interface Schluesselstand {
  /** Ob ein Wert hinterlegt ist. */
  readonly gesetzt: boolean
  /** Ob diese Ablage schreiben kann. */
  readonly schreibbar: boolean
  /** Woher der Wert käme, wenn er nicht aus der Ablage kommt (`umgebung`). */
  readonly quelle?: 'ablage' | 'umgebung'
}

/** Die Ablage eines Schlüssels. */
export interface Schluesselablage {
  /**
   * Beschreibt den Schlüssel eines Zugangs.
   *
   * @param id - die Kennung des Zugangs
   * @param umgebung - der Name der Ausweichvariable, wenn der Zugang eine nennt
   * @returns der Stand, **ohne** den Wert
   */
  beschreibe(id: string, umgebung?: string): Promise<Schluesselstand>
  /**
   * Liest den Schlüssel — **nur** für einen Anbieteraufbau oder eine Sonde.
   *
   * @param id - die Kennung des Zugangs
   * @param umgebung - der Name der Ausweichvariable
   * @returns der Wert oder `undefined`
   */
  lies(id: string, umgebung?: string): Promise<string | undefined>
  /**
   * Legt den Schlüssel ab.
   *
   * @param id - die Kennung des Zugangs
   * @param wert - der Wert; leer ist verboten (dafür gibt es {@link entferne})
   */
  setze(id: string, wert: string): Promise<void>
  /**
   * Entfernt den Schlüssel. Ein fehlender ist kein Fehler.
   *
   * @param id - die Kennung des Zugangs
   */
  entferne(id: string): Promise<void>
}

/** Warum eine Ablage nicht zur Verfügung steht. */
export class AblageFehler extends Error {
  /**
   * @param meldung - was fehlt
   */
  constructor(meldung: string) {
    super(meldung)
    this.name = 'AblageFehler'
  }
}

/** Was der Credential-Dienst können muß — strukturell, damit diese Datei ihn nicht importiert. */
interface Credentialdienst {
  readRecord?: (key: CredentialKey) => Promise<CredentialRecord | undefined>
  describeRecord?: (key: CredentialKey) => Promise<{ configured: boolean; writable: boolean }>
  modifyRecord?: (
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ) => Promise<CredentialRecord | undefined>
  deleteRecord?: (key: CredentialKey) => Promise<void>
}

/**
 * Die Ablage über die Credential-Naht des Harness.
 *
 * **Was sie nicht tut: den Wert anzeigen.** {@link beschreibe} fragt nur `describeRecord`; der Wert
 * verläßt die Naht ausschließlich über {@link lies}, und das ruft nur der Anbieteraufbau und die
 * Sonde.
 */
export class CredentialAblage implements Schluesselablage {
  /**
   * @param ctx - der Plugin-Kontext (nur `get('credentials')` wird benutzt)
   * @param scope - der Record-Scope; Vorgabe {@link SCOPE}
   */
  constructor(
    private readonly ctx: { get: (name: string) => unknown },
    private readonly scope: string = SCOPE,
  ) {}

  /**
   * Holt den Dienst — oder wirft mit einem Satz, der sagt, was fehlt.
   *
   * @returns der Dienst
   * @throws AblageFehler - wenn der Host keinen Credential-Dienst hat
   */
  #dienst(): Credentialdienst {
    const dienst = this.ctx.get('credentials') as Credentialdienst | undefined
    if (dienst === undefined || typeof dienst.readRecord !== 'function') {
      throw new AblageFehler(
        'Der Host hat keinen Credential-Dienst. Ohne ihn kann kein Schlüssel abgelegt werden — ' +
          'der Eintrag selbst bleibt möglich, aber nicht einsatzbereit.',
      )
    }
    return dienst
  }

  /**
   * Die Adresse eines Records.
   *
   * @param id - die Kennung des Zugangs
   * @returns der Schlüssel im Adressraum der Naht
   */
  #key(id: string): CredentialKey {
    return credentialKey(this.scope, id)
  }

  /**
   * Beschreibt den Schlüssel — Ablage vor Umgebung.
   *
   * @param id - die Kennung
   * @param umgebung - der Name der Ausweichvariable
   * @returns der Stand
   */
  async beschreibe(id: string, umgebung?: string): Promise<Schluesselstand> {
    const dienst = this.ctx.get('credentials') as Credentialdienst | undefined
    if (dienst === undefined || typeof dienst.describeRecord !== 'function') {
      const ersatz = umgebung !== undefined && (process.env[umgebung] ?? '').trim() !== ''
      return { gesetzt: ersatz, schreibbar: false, ...(ersatz ? { quelle: 'umgebung' as const } : {}) }
    }
    const info = await dienst.describeRecord(this.#key(id))
    if (info.configured) {
      return { gesetzt: true, schreibbar: info.writable, quelle: 'ablage' }
    }
    const ersatz = umgebung !== undefined && (process.env[umgebung] ?? '').trim() !== ''
    return {
      gesetzt: ersatz,
      schreibbar: info.writable,
      ...(ersatz ? { quelle: 'umgebung' as const } : {}),
    }
  }

  /**
   * Liest den Schlüssel — Ablage vor Umgebung.
   *
   * **Warum die Umgebung erst danach kommt.** Die Ablage ist der Ort, den der Nutzer in der
   * Oberfläche sieht; sie geht vor. Die Umgebung ist der Ausweichweg für Container und CI.
   *
   * @param id - die Kennung
   * @param umgebung - der Name der Ausweichvariable
   * @returns der Wert oder `undefined`
   */
  async lies(id: string, umgebung?: string): Promise<string | undefined> {
    const dienst = this.ctx.get('credentials') as Credentialdienst | undefined
    if (dienst !== undefined && typeof dienst.readRecord === 'function') {
      const record = await dienst.readRecord(this.#key(id))
      if (record !== undefined && record.kind === 'api-key' && typeof record.key === 'string') {
        const wert = record.key.trim()
        if (wert !== '') return wert
      }
    }
    if (umgebung !== undefined) {
      const wert = process.env[umgebung]
      if (wert !== undefined && wert.trim() !== '') return wert.trim()
    }
    return undefined
  }

  /**
   * Legt den Schlüssel ab.
   *
   * @param id - die Kennung
   * @param wert - der Wert
   * @throws AblageFehler - ohne Dienst, ohne Schreibrecht oder bei leerem Wert
   */
  async setze(id: string, wert: string): Promise<void> {
    if (wert.trim() === '') throw new AblageFehler('Ein leerer Schlüssel wird nicht abgelegt — dafür gibt es „entfernen".')
    const dienst = this.#dienst()
    if (typeof dienst.modifyRecord !== 'function') {
      throw new AblageFehler('Der Credential-Dienst kann keine Records schreiben.')
    }
    await dienst.modifyRecord(this.#key(id), async () => ({ kind: 'api-key', key: wert.trim() }))
  }

  /**
   * Entfernt den Schlüssel.
   *
   * @param id - die Kennung
   * @throws AblageFehler - ohne Dienst
   */
  async entferne(id: string): Promise<void> {
    const dienst = this.#dienst()
    if (typeof dienst.deleteRecord !== 'function') {
      throw new AblageFehler('Der Credential-Dienst kann keine Records löschen.')
    }
    await dienst.deleteRecord(this.#key(id))
  }
}
