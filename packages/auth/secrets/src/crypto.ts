/**
 * `@prometheus-harness/secrets` — die Kryptographie der Umschlagverschlüsselung.
 *
 * ## Was dieses Modul ist — und was es ausdrücklich nicht ist
 *
 * Es **baut keine Kryptographie**. `createCipheriv` und `createDecipheriv` kommen
 * aus `node:crypto` (in Bun enthalten), der Zufall aus `randomBytes`. Wer AES
 * selbst schreibt, schreibt es falsch; wer einen Zufallsgenerator selbst
 * schreibt, schreibt ihn noch falscher.
 *
 * Was hier entsteht, ist die **Form**: wie die Bytes einer verschlüsselten
 * Nachricht aussehen. Und diese Form steht **nicht hier zum ersten Mal** —
 * sie steht schon im Schema, in `packages/auth/db-schema/migrations/0002`:
 *
 * ```
 * content_cipher traegt version (1 Byte) || nonce (12 Byte) || ciphertext ||
 * tag (16 Byte) aus AES-256-GCM.
 * ```
 *
 * Diese Datei **erfüllt** das, was dort aufgeschrieben wurde. Ein zweites,
 * abweichendes Format wäre eine zweite Wahrheit über dieselben Bytes.
 *
 * ## Warum AES-256-GCM und nicht AES-CBC
 *
 * GCM ist **authentifiziert**: es erkennt eine Veränderung. Wer ein Byte im
 * Geheimtext umdreht, bekommt beim Entschlüsseln einen **Fehler** — und nicht
 * etwa stillschweigend Unsinn. Bei CBC bräuchte man dafür einen eigenen
 * Prüfwert, und wer ihn vergißt, merkt es nie: der Klartext ist dann Müll, und
 * niemand weiß, ob das an der Veränderung liegt oder am Schlüssel.
 *
 * ## Warum die Fassungsnummer VORNE steht
 *
 * Damit ein späteres Verfahren erkennbar ist, **bevor** entschlüsselt wird. Ohne
 * sie müßte man raten, welches Verfahren gemeint ist — und ein Ratversuch mit dem
 * falschen Verfahren sieht wie „falscher Schlüssel" aus.
 *
 * ## Die Regel, die dieses Modul durchsetzt
 *
 * **Für jede Verschlüsselung ein frischer Nonce.** Bei GCM ist ein
 * wiederverwendeter Nonce mit demselben Schlüssel kein Schönheitsfehler, sondern
 * das Ende der Vertraulichkeit: zwei Nachrichten mit gleichem Nonce und gleichem
 * Schlüssel verraten ihren Unterschied. Der Nonce kommt deshalb aus
 * `randomBytes` und wird **nie** hereingereicht.
 *
 * @module @prometheus-harness/secrets/krypto
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** Die Fassung des Formats. Steht als erstes Byte im Geheimtext. */
export const FORMAT_FASSUNG = 1

/** Die Länge eines Schlüssels in Bytes — 32, also AES-256. */
export const SCHLUESSEL_BYTES = 32

/** Die Länge des Nonce in Bytes. Für GCM sind 12 der Standard. */
export const NONCE_BYTES = 12

/** Die Länge des Authentifizierungsanhangs (tag) in Bytes. */
export const TAG_BYTES = 16

/** Der kleinste sinnvolle Geheimtext: Kopf plus Anhang, ohne Inhalt. */
export const KOPF_BYTES = 1 + NONCE_BYTES

/**
 * Ein Fehler beim Entschlüsseln.
 *
 * **Warum eine eigene Klasse.** „Der Geheimtext wurde verändert", „der Schlüssel
 * ist falsch" und „das Format kenne ich nicht" sind drei verschiedene Lagen, und
 * ein Aufrufer muß sie unterscheiden können. `node:crypto` wirft bei allen dreien
 * denselben `Error` mit dem Text `Unsupported state or unable to authenticate
 * data` — eine Meldung, die niemandem sagt, was zu tun ist.
 */
export class KryptoFehler extends Error {
  readonly grund: 'falsche-fassung' | 'zu-kurz' | 'nicht-entschluesselbar' | 'falsche-schluessellaenge'

  constructor(grund: KryptoFehler['grund'], message: string) {
    super(message)
    this.name = 'KryptoFehler'
    this.grund = grund
  }
}

/**
 * Prüft eine Schlüssellänge.
 *
 * **Warum hier und nicht in `createCipheriv`.** Der Treiber nimmt auch 16 oder
 * 24 Bytes (AES-128, AES-192). Ein 16-Byte-Schlüssel aus einer falsch
 * abgeschnittenen Datei würde also **funktionieren** — nur mit halber Stärke.
 * Das ist die Sorte Fehler, die nie auffällt.
 *
 * @param schluessel - der zu prüfende Schlüssel
 * @param wo - woher er kommt, für die Fehlermeldung
 * @throws KryptoFehler, wenn die Länge nicht 32 Byte ist
 */
export function pruefeSchluessel(schluessel: Uint8Array, wo: string): void {
  if (schluessel.length !== SCHLUESSEL_BYTES) {
    throw new KryptoFehler(
      'falsche-schluessellaenge',
      `${wo}: ein Schlüssel muß genau ${String(SCHLUESSEL_BYTES)} Byte lang sein, ` +
        `hier sind es ${String(schluessel.length)}. ` +
        'AES-256 braucht 32 Byte; ein kürzerer Schlüssel wäre AES-128 mit halber Stärke.',
    )
  }
}

/**
 * Verschlüsselt und packt das Ergebnis in die Form des Schemas.
 *
 * @param klartext - was verschlüsselt werden soll
 * @param schluessel - 32 Byte
 * @returns `version || nonce || ciphertext || tag`
 * @throws KryptoFehler, wenn die Schlüssellänge nicht stimmt
 */
export function verschluessele(klartext: Uint8Array, schluessel: Uint8Array): Uint8Array {
  pruefeSchluessel(schluessel, 'verschluessele')
  // **Frischer Nonce, immer.** Siehe die Regel im Kopf dieser Datei.
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', schluessel, nonce)
  const geheim = Buffer.concat([cipher.update(klartext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([FORMAT_FASSUNG]), nonce, geheim, tag])
}

/**
 * Entschlüsselt eine Nachricht in der Form des Schemas.
 *
 * @param geheim - `version || nonce || ciphertext || tag`
 * @param schluessel - 32 Byte
 * @returns der Klartext
 * @throws KryptoFehler bei unbekannter Fassung, zu kurzer Eingabe, falschem
 *   Schlüssel oder verändertem Geheimtext
 */
export function entschluessele(geheim: Uint8Array, schluessel: Uint8Array): Uint8Array {
  pruefeSchluessel(schluessel, 'entschluessele')
  if (geheim.length < KOPF_BYTES + TAG_BYTES) {
    throw new KryptoFehler(
      'zu-kurz',
      `ein Geheimtext braucht mindestens ${String(KOPF_BYTES + TAG_BYTES)} Byte ` +
        `(1 Fassung + ${String(NONCE_BYTES)} Nonce + ${String(TAG_BYTES)} Anhang), ` +
        `hier sind es ${String(geheim.length)}`,
    )
  }
  const fassung = geheim[0]
  if (fassung !== FORMAT_FASSUNG) {
    throw new KryptoFehler(
      'falsche-fassung',
      `unbekannte Formatfassung ${String(fassung)}; diese Fassung kennt nur ${String(FORMAT_FASSUNG)}. ` +
        'Die Fassung steht VORNE, damit das erkannt wird, bevor entschlüsselt wird.',
    )
  }

  const nonce = geheim.subarray(1, 1 + NONCE_BYTES)
  const tag = geheim.subarray(geheim.length - TAG_BYTES)
  const inhalt = geheim.subarray(1 + NONCE_BYTES, geheim.length - TAG_BYTES)

  try {
    const decipher = createDecipheriv('aes-256-gcm', schluessel, nonce)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(inhalt), decipher.final()])
  } catch (ursache) {
    // **Der Anhang hat nicht gepaßt.** Das heißt entweder: der Schlüssel ist
    // falsch, oder der Geheimtext wurde verändert. Beides ist ein Fehler und
    // beides darf **nicht** als „hier ist der Klartext" durchgehen — genau das
    // ist der Unterschied zwischen GCM und einem ungeprüften Verfahren.
    throw new KryptoFehler(
      'nicht-entschluesselbar',
      'der Anhang paßt nicht: entweder ist der Schlüssel falsch oder der Geheimtext wurde verändert. ' +
        `(${ursache instanceof Error ? ursache.message : String(ursache)})`,
    )
  }
}

/**
 * Erzeugt einen neuen Schlüssel — 32 Zufallsbytes.
 *
 * @returns der Schlüssel
 */
export function erzeugeSchluessel(): Uint8Array {
  return randomBytes(SCHLUESSEL_BYTES)
}
