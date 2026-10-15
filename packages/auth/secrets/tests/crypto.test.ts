/**
 * Die Umschlagverschlüsselung — und die Behauptungen, die sie tragen soll.
 *
 * ## Was hier bewiesen wird
 *
 * Nicht „es läuft", sondern die Eigenschaften, die den Unterschied machen:
 *
 * | Behauptung | Prüfung |
 * |---|---|
 * | das Byteformat ist das des Schemas | {@link describe} „Das Format" |
 * | eine Veränderung wird ERKANNT, statt Unsinn zu liefern | „Veränderung" |
 * | ein falscher Schlüssel scheitert, statt zu raten | „falscher Schlüssel" |
 * | ein wiederverwendeter Nonce kommt nicht vor | „frischer Nonce" |
 * | die Rotation läßt den Geheimtext BYTE-GLEICH | „Rotation" |
 * | ein falsch langer Schlüssel wird abgelehnt (kein AES-128) | „Schlüssellänge" |
 * | `key_hint` verrät das Geheimnis nicht | „Fingerabdruck" |
 *
 * ## Und was hier NICHT geprüft werden kann — ehrlich benannt
 *
 * Der POSIX-Zweig von {@link pruefeDateirechte} (eine 0644-Datei ist ein
 * **Fehler**) läßt sich auf diesem Rechner **nicht** ausführen: `platform()` ist
 * `win32`, und NTFS meldet für jede Datei `0o666` (gemessen, siehe
 * `src/key-provider.ts`). Geprüft wird deshalb der Windows-Zweig — und der
 * POSIX-Zweig steht als **ungeprüft** im Nachweis, statt als „getestet".
 */

import { describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FORMAT_FASSUNG,
  HAUPTSSCHLUESSELDATEI,
  KryptoFehler,
  NONCE_BYTES,
  SCHLUESSEL_BYTES,
  TAG_BYTES,
  dateiQuelle,
  entschluessele,
  entpacke,
  erzeugeHauptschluesselText,
  erzeugeSchluessel,
  fingerabdruck,
  holeHauptschluessel,
  pruefeDateirechte,
  rotiere,
  textZuSchluessel,
  umgebungsQuelle,
  verpacke,
  verschluessele,
  type Hauptschluessel,
} from '../src/index.ts'

const KLARTEXT = new TextEncoder().encode('sk-ein-erlaufener-anbieterschluessel-0123456789')
const haupt = (version = 1): Hauptschluessel => ({ schluessel: erzeugeSchluessel(), version, herkunft: 'Prüfung' })

// ---------------------------------------------------------------------------
// Das Format
// ---------------------------------------------------------------------------

describe('Das Format ist das des Schemas', () => {
  test('version || nonce || ciphertext || tag — und die Längen stimmen', () => {
    // Das Schema schreibt es vor (Migration 0002): 1 Byte Fassung, 12 Byte Nonce,
    // 16 Byte Anhang. Ein abweichendes Format wäre eine zweite Wahrheit über
    // dieselben Bytes — und die andere Hälfte des Systems liest sie.
    const schluessel = erzeugeSchluessel()
    const geheim = verschluessele(KLARTEXT, schluessel)
    expect(geheim[0]).toBe(FORMAT_FASSUNG)
    expect(geheim.length).toBe(1 + NONCE_BYTES + KLARTEXT.length + TAG_BYTES)
  })

  test('hin und zurück ergibt genau den Klartext', () => {
    const schluessel = erzeugeSchluessel()
    const zurueck = entschluessele(verschluessele(KLARTEXT, schluessel), schluessel)
    expect([...zurueck]).toEqual([...KLARTEXT])
  })

  test('auch ein leerer Klartext geht', () => {
    const schluessel = erzeugeSchluessel()
    const leer = new Uint8Array(0)
    expect(entschluessele(verschluessele(leer, schluessel), schluessel).length).toBe(0)
  })

  test('eine unbekannte Fassung wird VOR dem Entschlüsseln erkannt', () => {
    // Die Fassung steht vorne, damit man das Verfahren kennt, **bevor** man
    // entschlüsselt. Sonst sähe ein falsches Verfahren aus wie ein falscher
    // Schlüssel.
    const schluessel = erzeugeSchluessel()
    const geheim = verschluessele(KLARTEXT, schluessel)
    geheim[0] = 99
    const fehler = (() => {
      try {
        entschluessele(geheim, schluessel)
        return undefined
      } catch (ursache) {
        return ursache
      }
    })()
    expect(fehler).toBeInstanceOf(KryptoFehler)
    expect((fehler as KryptoFehler).grund).toBe('falsche-fassung')
  })

  test('zu kurze Eingabe wird benannt, nicht als „falscher Schlüssel" gemeldet', () => {
    const fehler = (() => {
      try {
        entschluessele(new Uint8Array(5), erzeugeSchluessel())
        return undefined
      } catch (ursache) {
        return ursache
      }
    })()
    expect((fehler as KryptoFehler).grund).toBe('zu-kurz')
  })
})

// ---------------------------------------------------------------------------
// Veränderung und falscher Schlüssel
// ---------------------------------------------------------------------------

describe('Veränderung wird erkannt — GCM statt CBC', () => {
  test('ein umgedrehtes Byte im Geheimtext scheitert', () => {
    // **Das ist der ganze Grund für GCM.** Ohne den Anhang käme hier Müll heraus,
    // und niemand wüßte, ob das an der Veränderung liegt oder am Schlüssel.
    const schluessel = erzeugeSchluessel()
    const geheim = verschluessele(KLARTEXT, schluessel)
    const stelle = 1 + NONCE_BYTES + 3
    geheim[stelle] = (geheim[stelle] ?? 0) ^ 0xff

    const fehler = (() => {
      try {
        entschluessele(geheim, schluessel)
        return undefined
      } catch (ursache) {
        return ursache
      }
    })()
    expect(fehler).toBeInstanceOf(KryptoFehler)
    expect((fehler as KryptoFehler).grund).toBe('nicht-entschluesselbar')
  })

  test('ein umgedrehtes Byte im Anhang scheitert', () => {
    const schluessel = erzeugeSchluessel()
    const geheim = verschluessele(KLARTEXT, schluessel)
    geheim[geheim.length - 1] = (geheim[geheim.length - 1] ?? 0) ^ 0x01
    expect(() => entschluessele(geheim, schluessel)).toThrow(KryptoFehler)
  })

  test('ein anderer Schlüssel liefert KEINEN Unsinn, sondern einen Fehler', () => {
    const geheim = verschluessele(KLARTEXT, erzeugeSchluessel())
    expect(() => entschluessele(geheim, erzeugeSchluessel())).toThrow(KryptoFehler)
  })
})

// ---------------------------------------------------------------------------
// Nonce und Schlüssellänge
// ---------------------------------------------------------------------------

describe('Frischer Nonce, geprüfte Länge', () => {
  test('zweimal derselbe Klartext ergibt zwei verschiedene Geheimtexte', () => {
    // Ein wiederverwendeter Nonce mit demselben Schlüssel ist bei GCM kein
    // Schönheitsfehler, sondern das Ende der Vertraulichkeit.
    const schluessel = erzeugeSchluessel()
    const a = verschluessele(KLARTEXT, schluessel)
    const b = verschluessele(KLARTEXT, schluessel)
    expect([...a]).not.toEqual([...b])
    // Der Nonce ist der Teil, der sich unterscheidet.
    expect([...a.subarray(1, 1 + NONCE_BYTES)]).not.toEqual([...b.subarray(1, 1 + NONCE_BYTES)])
  })

  test('ein zu kurzer Schlüssel wird abgelehnt — kein stilles AES-128', () => {
    // **Der Fehler, den das verhindert.** `createCipheriv` nimmt auch 16 Byte.
    // Ein falsch abgeschnittener Schlüssel würde also FUNKTIONIEREN — mit halber
    // Stärke. Das fällt nie auf.
    const kurz = new Uint8Array(16)
    const fehler = (() => {
      try {
        verschluessele(KLARTEXT, kurz)
        return undefined
      } catch (ursache) {
        return ursache
      }
    })()
    expect((fehler as KryptoFehler).grund).toBe('falsche-schluessellaenge')
  })

  test('ein zu langer Schlüssel ebenfalls', () => {
    expect(() => verschluessele(KLARTEXT, new Uint8Array(SCHLUESSEL_BYTES + 1))).toThrow(KryptoFehler)
  })
})

// ---------------------------------------------------------------------------
// Der Umschlag
// ---------------------------------------------------------------------------

describe('Der Umschlag', () => {
  test('verpacken und entpacken ergibt den Klartext', () => {
    const h = haupt()
    const umschlag = verpacke(KLARTEXT, h)
    expect([...entpacke(umschlag, h)]).toEqual([...KLARTEXT])
    expect(umschlag.masterKeyVersion).toBe(1)
  })

  test('der umhüllte Datenschlüssel ist NICHT der Klartext und nicht der Hauptschlüssel', () => {
    const h = haupt()
    const umschlag = verpacke(KLARTEXT, h)
    expect([...umschlag.wrappedKey]).not.toEqual([...KLARTEXT])
    expect([...umschlag.wrappedKey]).not.toEqual([...h.schluessel])
  })

  test('zweimal verpackt ergibt zwei verschiedene Umschläge', () => {
    // Je Geheimnis ein FRISCHER Datenschlüssel — sonst wäre ein wiederverwendeter
    // Datenschlüssel derselbe Fehler wie ein wiederverwendeter Nonce.
    const h = haupt()
    const a = verpacke(KLARTEXT, h)
    const b = verpacke(KLARTEXT, h)
    expect([...a.valueCipher]).not.toEqual([...b.valueCipher])
    expect([...a.wrappedKey]).not.toEqual([...b.wrappedKey])
  })

  test('ein falscher Hauptschlüssel scheitert', () => {
    const umschlag = verpacke(KLARTEXT, haupt())
    expect(() => entpacke(umschlag, haupt())).toThrow(KryptoFehler)
  })

  test('die falsche FASSUNG wird als falsche Fassung gemeldet, nicht als falscher Schlüssel', () => {
    // Eine andere Handlung: der Betreiber muß den Schlüssel DIESER Fassung
    // herbeischaffen, nicht einen neuen erzeugen.
    const umschlag = verpacke(KLARTEXT, haupt(1))
    const fehler = (() => {
      try {
        entpacke(umschlag, haupt(2))
        return undefined
      } catch (ursache) {
        return ursache
      }
    })()
    expect((fehler as KryptoFehler).grund).toBe('falsche-fassung')
    expect((fehler as Error).message).toContain('Fassung 1')
  })
})

// ---------------------------------------------------------------------------
// Rotation — die Behauptung, die den Umschlag rechtfertigt
// ---------------------------------------------------------------------------

describe('Rotation', () => {
  test('der Geheimtext bleibt BYTE-GLEICH — nur der Umschlag ändert sich', () => {
    // **Das ist der Zweck der zweiten Stufe.** Ohne sie müßte man bei jeder
    // Rotation jedes Geheimnis entschlüsseln und neu verschlüsseln — und dabei
    // läge jeder Klartext im Speicher.
    const alt = haupt(1)
    const neu = haupt(2)
    const vorher = verpacke(KLARTEXT, alt)

    const nachher = rotiere(vorher, alt, neu)

    expect([...nachher.valueCipher]).toEqual([...vorher.valueCipher]) // byte-gleich
    expect(nachher.keyHint).toBe(vorher.keyHint)
    expect([...nachher.wrappedKey]).not.toEqual([...vorher.wrappedKey])
    expect(nachher.masterKeyVersion).toBe(2)

    // Und der neue Umschlag öffnet sich mit dem NEUEN Schlüssel …
    expect([...entpacke(nachher, neu)]).toEqual([...KLARTEXT])
    // … und der alte Umschlag mit dem ALTEN.
    expect([...entpacke(vorher, alt)]).toEqual([...KLARTEXT])
  })

  test('eine Rotation auf dieselbe Fassung wird abgelehnt', () => {
    const h = haupt(1)
    const umschlag = verpacke(KLARTEXT, h)
    expect(() => rotiere(umschlag, h, haupt(1))).toThrow(KryptoFehler)
  })
})

// ---------------------------------------------------------------------------
// Der Fingerabdruck
// ---------------------------------------------------------------------------

describe('Der Fingerabdruck', () => {
  test('ist acht Hexzeichen und enthält den Klartext nicht', () => {
    const abdruck = fingerabdruck(KLARTEXT)
    expect(abdruck).toMatch(/^[0-9a-f]{8}$/u)
    const alsText = new TextDecoder().decode(KLARTEXT)
    expect(alsText).not.toContain(abdruck)
    expect(abdruck).not.toContain(alsText.slice(0, 8))
  })

  test('ist stabil und unterscheidet zwei Geheimnisse', () => {
    expect(fingerabdruck(KLARTEXT)).toBe(fingerabdruck(KLARTEXT))
    expect(fingerabdruck(KLARTEXT)).not.toBe(fingerabdruck(new TextEncoder().encode('etwas anderes')))
  })
})

// ---------------------------------------------------------------------------
// Der Schlüsseltext und seine Herkunft
// ---------------------------------------------------------------------------

describe('Aus Text wird ein Schlüssel — drei Formen', () => {
  test('base64url, base64 und Hex ergeben DENSELBEN Schlüssel', () => {
    const schluessel = erzeugeSchluessel()
    const b64url = Buffer.from(schluessel).toString('base64url')
    const b64 = Buffer.from(schluessel).toString('base64')
    const hex = Buffer.from(schluessel).toString('hex')

    expect([...textZuSchluessel(b64url, 'probe')]).toEqual([...schluessel])
    expect([...textZuSchluessel(b64, 'probe')]).toEqual([...schluessel])
    expect([...textZuSchluessel(hex, 'probe')]).toEqual([...schluessel])
  })

  test('ein leerer Wert und ein zu kurzer Wert werden abgelehnt', () => {
    expect(() => textZuSchluessel('', 'probe')).toThrow(KryptoFehler)
    expect(() => textZuSchluessel('kurz', 'probe')).toThrow(KryptoFehler)
  })

  test('erzeugeHauptschluesselText ergibt 43 Zeichen und einen brauchbaren Schlüssel', () => {
    // 43 Zeichen base64url = 32 Byte — dasselbe Format wie der vorhandene Wert in
    // `.env` (gemessen), damit ein Umstieg keine Zeile unlesbar macht.
    const text = erzeugeHauptschluesselText()
    expect(text).toHaveLength(43)
    expect(textZuSchluessel(text, 'probe')).toHaveLength(SCHLUESSEL_BYTES)
  })
})

describe('Die Reihenfolge der Quellen', () => {
  test('die Datei gewinnt gegen die Umgebungsvariable', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-schluessel-'))
    try {
      const pfad = join(ordner, HAUPTSSCHLUESSELDATEI)
      const ausDatei = erzeugeHauptschluesselText()
      const ausEnv = erzeugeHauptschluesselText()
      // **Der Modus gehört hier hin.** Auf POSIX legt `writeFileSync` ohne `mode`
      // eine Datei mit 0o644 an — gruppen- und weltlesbar. `pruefeDateirechte`
      // weist sie dann zu Recht ab, und die Prüfung war auf Linux rot, während sie
      // auf Windows grün war: NTFS kennt den Modus nicht, dort meldet jede Datei
      // 0o666 und die Prüfung greift gar nicht erst. Das war kein Fehler im Code,
      // sondern einer in dieser Vorlage — und CI hat ihn gefunden.
      writeFileSync(pfad, `${ausDatei}\n`, { encoding: 'utf8', mode: 0o600 })

      const gefunden = holeHauptschluessel(
        [dateiQuelle(pfad, () => undefined), umgebungsQuelle({ PMH_MASTER_KEY: ausEnv })],
        1,
      )
      expect([...gefunden.schluessel]).toEqual([...textZuSchluessel(ausDatei, 'probe')])
      expect(gefunden.herkunft).toContain('Datei')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('ohne Datei greift die Umgebungsvariable', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-schluessel-leer-'))
    try {
      const text = erzeugeHauptschluesselText()
      const gefunden = holeHauptschluessel(
        [dateiQuelle(join(ordner, HAUPTSSCHLUESSELDATEI), () => undefined), umgebungsQuelle({ PMH_MASTER_KEY: text })],
        1,
      )
      expect(gefunden.herkunft).toContain('Umgebungsvariable')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('ohne jede Quelle kommt ein Fehler MIT dem nächsten Schritt', () => {
    // „Kein Hauptschlüssel" ohne Anleitung kostet den Betreiber eine halbe Stunde.
    const fehler = (() => {
      try {
        holeHauptschluessel([dateiQuelle(join(tmpdir(), 'gibt-es-nicht-12345', 'master.key'), () => undefined), umgebungsQuelle({})], 1)
        return undefined
      } catch (ursache) {
        return ursache
      }
    })()
    expect(fehler).toBeInstanceOf(KryptoFehler)
    expect((fehler as Error).message).toContain('scripts/schluessel.mjs')
  })

  test('eine KAPUTTE Datei führt NICHT zur Umgebungsvariable', () => {
    // **Der Fehler, den das verhindert.** Würde ein unbrauchbarer Wert
    // übersprungen, deckte die Umgebungsvariable eine kaputte Schlüsseldatei
    // stillschweigend zu — und der Betreiber glaubte, seine Datei werde benutzt.
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-schluessel-kaputt-'))
    try {
      const pfad = join(ordner, HAUPTSSCHLUESSELDATEI)
      writeFileSync(pfad, 'zu-kurz\n', 'utf8')
      expect(() =>
        holeHauptschlusselQuellen(pfad, erzeugeHauptschluesselText()),
      ).toThrow(KryptoFehler)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})

/** Hilft beim Aufbau der zwei Quellen für die Prüfung oben. */
function holeHauptschlusselQuellen(pfad: string, ausEnv: string): Hauptschluessel {
  return holeHauptschluessel([dateiQuelle(pfad, () => undefined), umgebungsQuelle({ PMH_MASTER_KEY: ausEnv })], 1)
}

// ---------------------------------------------------------------------------
// Die Dateirechte — und was auf dieser Plattform meßbar ist
// ---------------------------------------------------------------------------

describe('Die Dateirechte', () => {
  test('auf Windows wird GESAGT, daß die Prüfung nicht möglich ist — auf POSIX wird sie durchgesetzt', () => {
    // **Kein stilles „bestanden".** Gemessen: NTFS meldet für jede Datei 0o666,
    // unabhängig von chmod. Eine Prüfung, die hier „ok" sagt, sieht aus wie ein
    // Schutz und ist keiner.
    //
    // **Und kein stiller Durchlauf.** Der erste Entwurf kehrte auf POSIX einfach
    // zurück — die Prüfung wäre dort grün gewesen, **ohne etwas zu behaupten**.
    // Jetzt behauptet sie auf beiden Plattformen etwas, und zwar das jeweils
    // andere: hier ein Hinweis, dort ein Fehler.
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-rechte-'))
    try {
      const pfad = join(ordner, HAUPTSSCHLUESSELDATEI)
      const text = erzeugeHauptschluesselText()

      if (process.platform === 'win32') {
        writeFileSync(pfad, text, { mode: 0o600 })
        // Die Messung, auf der die ganze Entscheidung beruht:
        expect(statSync(pfad).mode & 0o777).toBe(0o666)
        const hinweis = pruefeDateirechte(pfad)
        expect(hinweis).toBeDefined()
        expect(hinweis).toContain('NICHT prüfen')
        expect(hinweis).toContain('Benutzerprofil')
      } else {
        // Auf POSIX ist der Modus eine echte Aussage — eine weltlesbare
        // Schlüsseldatei ist ein Fehler und keine Warnung.
        writeFileSync(pfad, text, { mode: 0o644 })
        expect(() => pruefeDateirechte(pfad)).toThrow(KryptoFehler)
        // **`chmodSync`, nicht noch einmal `writeFileSync` mit `mode`.** `mode`
        // wirkt nur beim **Anlegen**. Die Datei steht an dieser Stelle schon mit
        // 0o644 auf der Platte, der zweite Aufruf änderte also nichts — sie blieb
        // weltlesbar, `pruefeDateirechte` warf weiterhin, und die Prüfung war auf
        // Linux rot. Auf Windows läuft dieser Zweig nie, deshalb fiel es hier nie
        // auf. Die zusätzliche Behauptung über den Modus stellt sicher, daß die
        // Voraussetzung des nächsten Schritts wirklich eingetreten ist.
        chmodSync(pfad, 0o600)
        expect(statSync(pfad).mode & 0o777).toBe(0o600)
        expect(pruefeDateirechte(pfad)).toBeUndefined()
      }
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('der POSIX-Zweig ist auf dieser Maschine NICHT ausführbar — und das steht so da', () => {
    // **Eine Prüfung, die sich selbst überspringt, ist keine.** Deshalb steht
    // hier keine Behauptung über POSIX, sondern der Nachweis, daß dieser Zweig
    // hier nicht laufen kann. Auf Linux prüft ihn die CI.
    //
    // **Nachtrag: die CI hat ihn geprüft — und diese Zeile war rot.** Sie war
    // selbst die Windows-Annahme, die sie beschreiben sollte: `toEqual('win32')`
    // behauptet über die Maschine, statt über den Code. Auf Linux ist der
    // POSIX-Zweig sehr wohl ausführbar, und dann muß hier das Gegenteil stehen
    // und geprüft werden — sonst behauptet die Prüfung auf einer Plattform
    // nichts und auf der anderen etwas Falsches.
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-zweig-'))
    try {
      const pfad = join(ordner, HAUPTSSCHLUESSELDATEI)
      writeFileSync(pfad, erzeugeHauptschluesselText(), { mode: 0o600 })
      const modus = statSync(pfad).mode & 0o777
      if (process.platform === 'win32') {
        // NTFS: kein echter Modus, der POSIX-Zweig kann hier nicht greifen.
        expect(modus).toBe(0o666)
      } else {
        // POSIX: der Modus ist echt, also greift der Zweig — nachgewiesen daran,
        // daß 0o600 ankommt und 0o644 abgelehnt wird.
        expect(modus).toBe(0o600)
        expect(pruefeDateirechte(pfad)).toBeUndefined()
        chmodSync(pfad, 0o644)
        expect(() => pruefeDateirechte(pfad)).toThrow(KryptoFehler)
      }
      expect(existsSync(tmpdir())).toBe(true)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})
