/**
 * Die Regeln des API-Schlüssels — gegen eine Attrappe, ohne Datenbank.
 *
 * ## Was hier angegriffen wird
 *
 * Die Weisung lautet: *„Erzeuger mit erzwungener Entropie (≥ 112 Bit) und
 * Pfeffer."* Daraus folgen fünf Eigenschaften, jede mit eigener Prüfung:
 *
 * | Eigenschaft | Prüfung |
 * |---|---|
 * | die Form ist **genau** die des Schemas | 12 Zeichen Kennung, 43 Zeichen Geheimnis |
 * | die Entropie ist **erzwungen**, nicht zugesichert | 256 Bit erzeugt, 112 Bit als Sperre im Modul |
 * | das Klartext-Token erreicht die Ablage **nie** | die Attrappe sieht nur den HMAC |
 * | der Pfeffer ist **abgeleitet**, nicht der Hauptschlüssel | verschiedener Hauptschlüssel → verschiedener Pfeffer |
 * | ein abgewiesener Schlüssel verrät **nichts** | alle fünf Abweisungen tragen denselben Satz |
 */

import { describe, expect, test } from 'bun:test'
import {
  GEHEIMNIS_BYTES,
  KENNUNG_ZEICHEN,
  MIN_ENTROPIE_BITS,
  SCHLUESSEL_ABWEISUNG,
  SCHLUESSEL_PRAEFIX,
  erzeugeApiSchluessel,
  hasheToken,
  pfefferAus,
  pruefeApiSchluessel,
  zerlegeToken,
  type SchluesselAblage,
  type SchluesselEintrag,
} from '../src/index.ts'

const JETZT = new Date('2026-10-13T20:00:00.000Z')
const NUTZER = '11111111-1111-4111-8111-111111111111'

/** Ein Hauptschlüssel mit 32 Byte — wie ihn `packages/auth/secrets` liefert. */
const HAUPT = new Uint8Array(32).fill(7)
const PFEFFER = pfefferAus(HAUPT)

// ---------------------------------------------------------------------------
// Attrappen
// ---------------------------------------------------------------------------

interface AblageMitSpur extends SchluesselAblage {
  readonly eintraege: SchluesselEintrag[]
  readonly suchungen: string[]
  readonly benutzt: string[]
}

function ablage(eintrag?: Partial<SchluesselEintrag>): AblageMitSpur {
  const eintraege: SchluesselEintrag[] = []
  const suchungen: string[] = []
  const benutzt: string[] = []
  const basis: SchluesselEintrag = {
    id: 'aaaa',
    userId: NUTZER,
    keyId: 'abcdefghijkl',
    tokenHash: 'f'.repeat(64),
    displayPrefix: 'pmh_abcdefgh',
    name: 'Test',
    scopes: ['chat'],
    laeuftAb: new Date(JETZT.getTime() + 86_400_000),
    ...eintrag,
  }
  eintraege.push(basis)
  return {
    eintraege,
    suchungen,
    benutzt,
    async legeAb(e) {
      // Die `id` vergibt sonst die Tabelle; die Attrappe muß eine erfinden.
      eintraege.push({ id: `erfunden-${String(eintraege.length)}`, ...e })
    },
    async finde(keyId) {
      suchungen.push(keyId)
      return eintraege.find((e) => e.keyId === keyId)
    },
    async merkeBenutzt(keyId) {
      benutzt.push(keyId)
    },
  }
}

// ---------------------------------------------------------------------------
// Form — das Schema schreibt sie vor
// ---------------------------------------------------------------------------

describe('Die Form ist genau die des Schemas', () => {
  test('Präfix, 12 Zeichen Kennung, 43 Zeichen Geheimnis', () => {
    const s = erzeugeApiSchluessel(JETZT)
    // Wörtlich der `CHECK`: `key_id ~ '^[A-Za-z0-9_-]{12}$'`.
    expect(s.token).toMatch(/^pmh_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/u)
    expect(s.keyId).toHaveLength(KENNUNG_ZEICHEN)
    const teile = zerlegeToken(s.token)
    expect(teile?.keyId).toBe(s.keyId)
    // 43 Zeichen base64url ohne Auffüllung sind **32 Byte**.
    expect(teile?.secret).toHaveLength(43)
    expect(Buffer.from(teile?.secret ?? '', 'base64url')).toHaveLength(GEHEIMNIS_BYTES)
  })

  test('zwei Schlüssel sind verschieden — Kennung UND Geheimnis', () => {
    const eins = erzeugeApiSchluessel(JETZT)
    const zwei = erzeugeApiSchluessel(JETZT)
    expect(eins.keyId).not.toBe(zwei.keyId)
    expect(eins.token).not.toBe(zwei.token)
  })

  test('das Anzeigepräfix zeigt acht Zeichen der Kennung — nie das Geheimnis', () => {
    const s = erzeugeApiSchluessel(JETZT)
    expect(s.displayPrefix).toBe(`${SCHLUESSEL_PRAEFIX}_${s.keyId.slice(0, 8)}`)
    expect(s.displayPrefix).toHaveLength(12)
    const secret = zerlegeToken(s.token)?.secret ?? 'x'
    expect(s.displayPrefix).not.toContain(secret)
    // Und es ist kürzer als die Kennung — nicht die halbe Kennung, sondern acht.
    expect(s.displayPrefix.length).toBeLessThan(SCHLUESSEL_PRAEFIX.length + 1 + KENNUNG_ZEICHEN)
  })
})

// ---------------------------------------------------------------------------
// Entropie — erzwungen
// ---------------------------------------------------------------------------

describe('Die Entropie ist erzwungen, nicht zugesichert', () => {
  test('erzeugt werden 256 Bit, verlangt sind mindestens 112', () => {
    expect(GEHEIMNIS_BYTES * 8).toBe(256)
    expect(MIN_ENTROPIE_BITS).toBe(112)
    // **Die Sperre, nicht die Zahl.** Ein zu kurzes Geheimnis würde das Modul
    // beim Laden abbrechen lassen (siehe die Selbstprüfung in `src/index.ts`);
    // hier steht die Zusicherung, daß die Sperre nicht ins Leere greift.
    expect(GEHEIMNIS_BYTES * 8).toBeGreaterThanOrEqual(MIN_ENTROPIE_BITS)
  })

  test('1000 Schlüssel sind paarweise verschieden', () => {
    // Eine schwache Zufallsquelle (feste Uhrzeit, Zähler) fiele hier auf. 1000
    // Kennungen aus 9 Byte: die Wahrscheinlichkeit einer Dopplung ist rund
    // 1000²/2 / 2^72 — praktisch null, und wenn doch, ist es ein Befund.
    const gesehen = new Set()
    for (let i = 0; i < 1000; i += 1) gesehen.add(erzeugeApiSchluessel(JETZT).token)
    expect(gesehen.size).toBe(1000)
  })

  test('eine Geltungsdauer von null oder weniger wird abgewiesen', () => {
    // Das Schema hat `CHECK (expires_at > created_at)`; der Fehler soll hier
    // auffallen und nicht als `23514` aus PostgreSQL kommen.
    for (const tage of [0, -1, Number.NaN]) {
      expect(() => erzeugeApiSchluessel(JETZT, tage)).toThrow()
    }
    expect(erzeugeApiSchluessel(JETZT, 1).laeuftAb.getTime()).toBe(JETZT.getTime() + 86_400_000)
  })
})

// ---------------------------------------------------------------------------
// Der Pfeffer
// ---------------------------------------------------------------------------

describe('Der Pfeffer wird abgeleitet', () => {
  test('derselbe Hauptschlüssel ergibt denselben Pfeffer', () => {
    expect(Buffer.from(pfefferAus(HAUPT).bytes).toString('hex')).toBe(
      Buffer.from(PFEFFER.bytes).toString('hex'),
    )
  })

  test('ein anderer Hauptschlüssel ergibt einen anderen Pfeffer', () => {
    const anders = pfefferAus(new Uint8Array(32).fill(8))
    expect(Buffer.from(anders.bytes).toString('hex')).not.toBe(Buffer.from(PFEFFER.bytes).toString('hex'))
  })

  test('der Pfeffer IST NICHT der Hauptschlüssel', () => {
    // **Die eigentliche Zusicherung der Ableitung.** Ohne sie wäre der Pfeffer
    // bloß eine Umbenennung, und derselbe Schlüssel würde für zwei Zwecke
    // benutzt — Verschlüsselung und Schlüsselprüfung.
    expect(Buffer.from(PFEFFER.bytes).toString('hex')).not.toBe(Buffer.from(HAUPT).toString('hex'))
    expect(PFEFFER.zweck).toBe('pmh-api-schluessel-pfeffer')
  })

  test('ein Hauptschlüssel mit falscher Länge wird abgewiesen', () => {
    // **Kein stilles Auffüllen und kein stilles Kürzen.**
    expect(() => pfefferAus(new Uint8Array(31))).toThrow(/32 Byte/u)
    expect(() => pfefferAus(new Uint8Array(33))).toThrow(/32 Byte/u)
    expect(() => pfefferAus(new Uint8Array(0))).toThrow(/32 Byte/u)
  })

  test('die Ablage sieht NUR den HMAC — nie das Token', async () => {
    const a = ablage()
    const s = erzeugeApiSchluessel(JETZT)
    const secret = zerlegeToken(s.token)?.secret ?? 'x'
    const hash = hasheToken(PFEFFER, s.token)
    await a.legeAb({
      userId: NUTZER,
      keyId: s.keyId,
      tokenHash: hash,
      displayPrefix: s.displayPrefix,
      name: 'Test',
      scopes: ['chat'],
      laeuftAb: s.laeuftAb,
    })
    expect(hash).toMatch(/^[0-9a-f]{64}$/u)
    expect(hash).not.toBe(s.token)
    // Weder das ganze Token noch sein Geheimnis steht in dem, was die Ablage hat.
    const alsText = JSON.stringify(a.eintraege)
    expect(alsText).not.toContain(s.token)
    expect(alsText).not.toContain(secret)
  })

  test('der HMAC gilt über das GANZE Token — die Kennung ist damit fälschungssicher', async () => {
    // **Die Begründung aus dem Schema, nachgerechnet.** Wäre nur das Geheimnis
    // gehasht, könnte jemand die Kennung eines fremden Schlüssels einsetzen und
    // sein eigenes Geheimnis behalten. Weil das ganze Token eingeht, ändert schon
    // eine andere Kennung den Hash — und die Prüfung schlägt fehl.
    const s = erzeugeApiSchluessel(JETZT)
    const teile = zerlegeToken(s.token)
    const hash = hasheToken(PFEFFER, s.token)
    const andereKennung = `${SCHLUESSEL_PRAEFIX}_zzzzzzzzzzzz_${teile?.secret ?? ''}`
    expect(hasheToken(PFEFFER, andereKennung)).not.toBe(hash)
    // Und ein anderer Pfeffer ebenso.
    expect(hasheToken(pfefferAus(new Uint8Array(32).fill(9)), s.token)).not.toBe(hash)
  })
})

// ---------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------

describe('Prüfen', () => {
  /** Baut eine Ablage, deren Eintrag zu einem echten Token paßt. */
  function passend(over: Partial<SchluesselEintrag> = {}) {
    const s = erzeugeApiSchluessel(JETZT)
    const a = ablage({
      id: 'cccc',
      keyId: s.keyId,
      tokenHash: hasheToken(PFEFFER, s.token),
      laeuftAb: new Date(JETZT.getTime() + 86_400_000),
      ...over,
    })
    return { a, s }
  }

  test('ein gültiger Schlüssel gilt — und wird als benutzt vermerkt', async () => {
    const { a, s } = passend()
    const urteil = await pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, s.token, JETZT)
    expect(urteil.gueltig).toBe(true)
    if (urteil.gueltig) {
      expect(urteil.userId).toBe(NUTZER)
      expect(urteil.keyId).toBe(s.keyId)
      expect(urteil.scopes).toEqual(['chat'])
    }
    expect(a.benutzt).toEqual([s.keyId])
  })

  test('ein falsches Geheimnis bei richtiger Kennung wird abgewiesen', async () => {
    const { a, s } = passend()
    const teile = zerlegeToken(s.token)
    const falsch = `${SCHLUESSEL_PRAEFIX}_${s.keyId}_${'A'.repeat(43)}`
    expect(teile?.secret).not.toBe('A'.repeat(43))
    const urteil = await pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, falsch, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('falsch')
    expect(a.benutzt).toHaveLength(0)
  })

  test('eine unbekannte Kennung wird abgewiesen', async () => {
    const a = ablage()
    const urteil = await pruefeApiSchluessel(
      { ablage: a, pfeffer: PFEFFER },
      `${SCHLUESSEL_PRAEFIX}_zzzzzzzzzzzz_${'B'.repeat(43)}`,
      JETZT,
    )
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('unbekannt')
  })

  test('ein widerrufener Schlüssel wird abgewiesen', async () => {
    const { a, s } = passend({ widerrufenAm: new Date(JETZT.getTime() - 1000) })
    const urteil = await pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, s.token, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('widerrufen')
  })

  test('ein abgelaufener Schlüssel wird abgewiesen — auch eine Sekunde zu spät', async () => {
    const { a, s } = passend()
    const knapp = new Date(JETZT.getTime() + 86_400_000 - 1)
    expect((await pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, s.token, knapp)).gueltig).toBe(true)

    const zuSpaet = new Date(JETZT.getTime() + 86_400_000)
    const urteil = await pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, s.token, zuSpaet)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('abgelaufen')
  })

  test('und JEDE Abweisung trägt denselben Satz — kein Orakel', async () => {
    // Ohne das verriete „widerrufen", daß es den Schlüssel einmal gab, und
    // „abgelaufen" verriete, daß die Kennung stimmt.
    const { a, s } = passend({ widerrufenAm: new Date(JETZT.getTime() - 1000) })
    const faelle = await Promise.all([
      pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, 'kein-token', JETZT),
      pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, `${SCHLUESSEL_PRAEFIX}_zzzzzzzzzzzz_${'B'.repeat(43)}`, JETZT),
      pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, s.token, JETZT),
      pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, s.token, new Date(JETZT.getTime() + 1e12)),
    ])
    // Die **Regeln** sind verschieden …
    const regeln = faelle.map((f) => (f.gueltig ? 'gueltig' : f.regel))
    expect(new Set(regeln).size).toBeGreaterThan(2)
    // … die **Sätze** nicht.
    for (const f of faelle) {
      if (!f.gueltig) expect(f.grund).toBe(SCHLUESSEL_ABWEISUNG)
    }
  })

  test('ein Token mit falscher Form löst KEINEN Datenbankzugriff aus', async () => {
    // **Meßbar, nicht behauptet.** Die Formprüfung steht vor dem Zugriff; ein
    // 10 000 Zeichen langes „Token" soll keine Abfrage kosten.
    const a = ablage()
    for (const mist of ['', 'pmh', 'pmh_x_y', `${SCHLUESSEL_PRAEFIX}_${'a'.repeat(12)}_kurz`, 'a'.repeat(10_000)]) {
      const urteil = await pruefeApiSchluessel({ ablage: a, pfeffer: PFEFFER }, mist, JETZT)
      expect(urteil.gueltig).toBe(false)
      if (!urteil.gueltig) expect(urteil.regel).toBe('form')
    }
    expect(a.suchungen).toHaveLength(0)
  })

  test('zerlegeToken weist alles ab, was nicht genau die Form hat', () => {
    const gut = erzeugeApiSchluessel(JETZT).token
    expect(zerlegeToken(gut)).toBeDefined()
    for (const mist of [
      '',
      gut.slice(0, -1),
      `${gut}x`,
      gut.toUpperCase(),
      `x${gut}`,
      gut.replace(/^pmh/u, 'pmx'),
      `${SCHLUESSEL_PRAEFIX}_${'a'.repeat(11)}_${'b'.repeat(43)}`,
      `${SCHLUESSEL_PRAEFIX}_${'a'.repeat(13)}_${'b'.repeat(43)}`,
      `${SCHLUESSEL_PRAEFIX}_${'a'.repeat(12)}_${'b'.repeat(42)}`,
    ]) {
      expect(zerlegeToken(mist)).toBeUndefined()
    }
  })
})
