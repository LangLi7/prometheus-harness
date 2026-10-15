/**
 * `@prometheus-harness/secrets` — Umschlagverschlüsselung für die Geheimnisse
 * des Benutzers.
 *
 * ## Was hier entsteht
 *
 * Die Zeile in `user_secrets` — und zwar genau die Spalten, die das Schema seit
 * Migration 0001 vorsieht:
 *
 * ```
 * value_cipher        -- version || nonce || ciphertext || tag   (mit dem DATENSCHLUESSEL)
 * wrapped_key         -- derselbe Datenschluessel, mit dem HAUPTSCHLUESSEL verschluesselt
 * master_key_version  -- welche Hauptschluessel-Fassung den Umschlag geoeffnet hat
 * key_hint            -- ein Hinweis, der das Geheimnis NICHT verraet
 * ```
 *
 * ## Warum zwei Stufen — und was das meßbar einbringt
 *
 * Es gibt **einen** Hauptschlüssel (KEK) und **je Geheimnis einen** Datenschlüssel
 * (DEK). Der Nutzinhalt ist mit dem DEK verschlüsselt, der DEK mit dem KEK. Der
 * Umschlag ist damit der Preis dafür, daß eine **Rotation** nur die kleine
 * Spalte `wrapped_key` anfaßt und nicht den ganzen Geheimtext:
 *
 * ```
 * Rotation:  value_cipher bleibt BYTE-GLEICH   (bewiesen in tests/crypto.test.ts)
 *            wrapped_key  wird neu geschrieben
 *            master_key_version steigt
 * ```
 *
 * Ohne die zweite Stufe müßte man bei jeder Rotation jedes Geheimnis
 * entschlüsseln **und neu verschlüsseln** — und dabei läge für einen Moment jeder
 * Klartext im Speicher, statt nur der 32-Byte-Datenschlüssel.
 *
 * ## Was `key_hint` ist — und was es nicht ist
 *
 * Ein **kurzer Fingerabdruck** des Klartexts (SHA-256, erste 8 Hexzeichen). Er
 * läßt den Betreiber erkennen, ob das gespeicherte Geheimnis noch dasselbe ist
 * wie das, das er in der Hand hat — ohne es zu entschlüsseln.
 *
 * **Was er nicht ist: kein Ersatz für ein Geheimnis.** Wer die Datenbank liest,
 * kann damit ein **geratenes** Geheimnis bestätigen. Für Anbieterschlüssel mit
 * 256 Bit Zufall ist das bedeutungslos; für ein **Paßwort** wäre es das nicht.
 * Deshalb steht an {@link fingerabdruck} ausdrücklich, wofür er gedacht ist.
 *
 * @module @prometheus-harness/secrets
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { KryptoFehler, entschluessele, erzeugeSchluessel, verschluessele } from './crypto.ts'
import type { Hauptschluessel } from './key-provider.ts'
// **Werte-Import zusätzlich zur Weitergabe unten.** `export … from` führt die
// Namen **nicht** in den Gültigkeitsbereich dieses Moduls ein — `standardQuellen`
// braucht sie aber als Werte. Beides ist nötig: die Weitergabe für den Aufrufer,
// der Import für den eigenen Gebrauch.
import {
  DOCKER_SECRET_PFAD,
  dateiQuelle,
  dockerSecretQuelle,
  umgebungsQuelle,
  type Schluesselquelle,
} from './key-provider.ts'

// **Der Fehler wird importiert UND ausgeführt.** Beides ist nötig: dieses Modul
// wirft ihn selbst (`verpacke`, `rotiere`), und der Aufrufer muß ihn fangen
// können. Zuerst stand er nur im Import — der Ladelauf des Tests meldete
// `Export named 'KryptoFehler' not found`.
export { KryptoFehler }

export {
  FORMAT_FASSUNG,
  KOPF_BYTES,
  NONCE_BYTES,
  SCHLUESSEL_BYTES,
  TAG_BYTES,
  entschluessele,
  erzeugeSchluessel,
  pruefeSchluessel,
  verschluessele,
} from './crypto.ts'

export {
  DOCKER_SECRET_PFAD,
  dateiQuelle,
  dockerSecretQuelle,
  erzeugeHauptschluesselText,
  holeHauptschluessel,
  pruefeDateirechte,
  textZuSchluessel,
  umgebungsQuelle,
  type Hauptschluessel,
  type Schluesselart,
  type Schluesselquelle,
} from './key-provider.ts'

/** Der Name der Datei, in der der Hauptschlüssel liegen darf. */
export const HAUPTSSCHLUESSELDATEI = 'master.key'

/**
 * Die **Leiter** der Hauptschlüssel-Quellen — an genau einer Stelle.
 *
 * ## Warum das hier steht und nicht in jedem Skript
 *
 * Die Kette
 *
 * ```ts
 * [dateiQuelle(join(home, HAUPTSSCHLUESSELDATEI)), umgebungsQuelle(umgebung)]
 * ```
 *
 * stand **zweimal** im Baum (`scripts/geheimnis.mjs`, `scripts/apischluessel.mjs`) —
 * und mit der Docker-Stufe wäre sie **dreimal** dagestanden. Drei Kopien einer
 * Reihenfolge sind drei Gelegenheiten, sie verschieden zu ändern: dann liest ein
 * Skript den Schlüssel aus der Datei und das andere aus der Umgebung, und **beide
 * sehen richtig aus**.
 *
 * ## Die Reihenfolge ist eine Sicherheitsaussage, keine Bequemlichkeit
 *
 * | Stufe | Wo | Wie gut |
 * |---|---|---|
 * | 1 | `master.key` im Home (0600) | die beste verfügbare: außerhalb der Datenbank, aus dem Baum heraus |
 * | 2 | Docker-Secret `/run/secrets/…` | gleichwertig, anderer Ort — für den Containerbetrieb |
 * | 3 | `PMH_MASTER_KEY` in der Umgebung | die **schwächste**: Umgebungen landen in `docker inspect`, in Protokollen, in Fehlerberichten. Sie bleibt **zuletzt** |
 *
 * **Die Reihenfolge ist die Botschaft:** wer die bequeme Stufe nimmt, obwohl eine
 * bessere da ist, soll das **merken** — die Herkunft steht in jeder Ausgabe
 * (`haupt.herkunft`).
 *
 * **Ein unbrauchbarer Wert bricht ab, er fällt nicht durch.** Steht in der Datei
 * etwas, das kein Schlüssel ist, wird **nicht** zur Umgebungsvariablen
 * durchgefallen — sonst verdeckte eine kaputte Datei still (siehe
 * {@link holeHauptschluessel}).
 *
 * @param umgebung - die Umgebungsvariablen
 * @param home - das Harness-Home
 * @param dockerPfad - wo das Docker-Secret liegt; Vorgabe {@link DOCKER_SECRET_PFAD}
 * @param warnung - wohin Hinweise gehen
 * @returns die Quellen **in der Reihenfolge, in der sie versucht werden**
 */
export function standardQuellen(
  umgebung: Readonly<Record<string, string | undefined>>,
  home: string,
  dockerPfad: string = DOCKER_SECRET_PFAD,
  warnung?: (text: string) => void,
): readonly Schluesselquelle[] {
  return [
    // `join` kommt aus `node:path`; dieses Modul soll keine Plattform annehmen.
    dateiQuelle(join(home, HAUPTSSCHLUESSELDATEI), warnung),
    dockerSecretQuelle(dockerPfad, warnung),
    umgebungsQuelle(umgebung),
  ]
}

/** Die Umgebungsvariable der Hauptschlüssel-Fassung. */
export const VERSION_VARIABLE = 'PMH_MASTER_KEY_VERSION'

/** Eine verschlüsselte Zeile, so wie sie in `user_secrets` steht. */
export interface Umschlag {
  /** `version || nonce || ciphertext || tag`, verschlüsselt mit dem Datenschlüssel. */
  readonly valueCipher: Uint8Array
  /** Der Datenschlüssel, verschlüsselt mit dem Hauptschlüssel. */
  readonly wrappedKey: Uint8Array
  /** Welche Hauptschlüssel-Fassung den Umschlag geöffnet hat. */
  readonly masterKeyVersion: number
  /** Ein Hinweis, der das Geheimnis nicht verrät. */
  readonly keyHint: string
}

/**
 * Ein kurzer Fingerabdruck — **kein** Geheimnis, und nicht für schwache Geheimnisse.
 *
 * @param klartext - das Geheimnis
 * @returns die ersten 8 Hexzeichen von SHA-256
 */
export function fingerabdruck(klartext: Uint8Array): string {
  return createHash('sha256').update(klartext).digest('hex').slice(0, 8)
}

/**
 * Verpackt einen Klartext in einen Umschlag.
 *
 * **Der Datenschlüssel ist je Aufruf neu.** Er wird nie hereingereicht: ein
 * wiederverwendeter Datenschlüssel wäre derselbe Fehler wie ein wiederverwendeter
 * Nonce, nur eine Ebene höher.
 *
 * @param klartext - das zu schützende Geheimnis
 * @param haupt - der Hauptschlüssel samt Fassung
 * @returns der Umschlag
 */
export function verpacke(klartext: Uint8Array, haupt: Hauptschluessel): Umschlag {
  const datenschluessel = erzeugeSchluessel()
  return {
    valueCipher: verschluessele(klartext, datenschluessel),
    wrappedKey: verschluessele(datenschluessel, haupt.schluessel),
    masterKeyVersion: haupt.version,
    keyHint: fingerabdruck(klartext),
  }
}

/**
 * Öffnet einen Umschlag.
 *
 * **Warum die Fassung geprüft wird, bevor entschlüsselt wird.** Der Umschlag
 * nennt die Fassung, mit der er gepackt wurde. Paßt sie nicht zum vorgelegten
 * Hauptschlüssel, ist die Antwort **nicht** „falscher Schlüssel", sondern „falsche
 * Fassung" — und das ist eine andere Handlung: der Betreiber muß den Schlüssel
 * **der genannten Fassung** herbeischaffen, nicht einen neuen erzeugen.
 *
 * @param umschlag - der Umschlag aus der Datenbank
 * @param haupt - der Hauptschlüssel samt Fassung
 * @returns der Klartext
 * @throws KryptoFehler bei falscher Fassung oder wenn der Anhang nicht paßt
 */
export function entpacke(
  umschlag: { readonly valueCipher: Uint8Array; readonly wrappedKey: Uint8Array; readonly masterKeyVersion: number },
  haupt: Hauptschluessel,
): Uint8Array {
  if (umschlag.masterKeyVersion !== haupt.version) {
    throw new KryptoFehler(
      'falsche-fassung',
      `der Umschlag wurde mit Hauptschlüssel-Fassung ${String(umschlag.masterKeyVersion)} gepackt, ` +
        `vorgelegt ist Fassung ${String(haupt.version)}. ` +
        'Das ist kein falscher Schlüssel, sondern der falsche — es wird der Schlüssel dieser Fassung gebraucht.',
    )
  }
  const datenschluessel = entschluessele(umschlag.wrappedKey, haupt.schluessel)
  return entschluessele(umschlag.valueCipher, datenschluessel)
}

/**
 * Hebt einen Umschlag auf eine neue Hauptschlüssel-Fassung — **ohne den Geheimtext anzufassen**.
 *
 * Das ist der Zweck der zweiten Stufe: `valueCipher` und `keyHint` werden
 * **unverändert** durchgereicht, nur der umhüllte Datenschlüssel und die Fassung
 * ändern sich. Der Geheimtext bleibt byte-gleich — nachgewiesen in
 * `tests/crypto.test.ts`.
 *
 * @param umschlag - der alte Umschlag
 * @param alt - der alte Hauptschlüssel
 * @param neu - der neue Hauptschlüssel
 * @returns der neue Umschlag
 */
export function rotiere(
  umschlag: { readonly valueCipher: Uint8Array; readonly wrappedKey: Uint8Array; readonly masterKeyVersion: number; readonly keyHint: string },
  alt: Hauptschluessel,
  neu: Hauptschluessel,
): Umschlag {
  if (alt.version === neu.version) {
    throw new KryptoFehler(
      'falsche-fassung',
      `die neue Fassung ist dieselbe wie die alte (${String(neu.version)}). ` +
        'Eine Rotation auf dieselbe Fassung würde den Umschlag Umschlag sein lassen, ' +
        'aber niemand könnte später sagen, welcher Schlüssel gilt.',
    )
  }
  const datenschluessel = entschluessele(umschlag.wrappedKey, alt.schluessel)
  return {
    // **Byte-gleich durchgereicht.** Nicht neu verschlüsselt.
    valueCipher: umschlag.valueCipher,
    wrappedKey: verschluessele(datenschluessel, neu.schluessel),
    masterKeyVersion: neu.version,
    keyHint: umschlag.keyHint,
  }
}
