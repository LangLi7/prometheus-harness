/**
 * Die Regeln des Passwort-Resets — **ohne** Datenbank, **ohne** HTTP.
 *
 * ## Was hier angegriffen wird
 *
 * Die Weisung des Betreibers lautet: *„für einen DB-Administrator unlesbar,
 * Passwort trotzdem zurücksetzbar."* Daraus folgen vier Eigenschaften, und jede
 * hat hier ihre eigene Prüfung:
 *
 * | Eigenschaft | Prüfung |
 * |---|---|
 * | **nur der Hash liegt in der Ablage** | „Die Ablage sieht das Klartext-Token nie" |
 * | **ein Token gilt genau einmal** | „Ein Token wirkt nicht zweimal" |
 * | **es läuft ab** | „Nach fünfzehn Minuten gilt es nicht mehr" |
 * | **alle Sitzungen werden widerrufen** | „Nach dem Zurücksetzen sind alle Sitzungen widerrufen" |
 *
 * Dazu die Fälle, die man leicht übersieht: ein gesperrtes Konto, ein zu
 * schwaches Passwort (und was dann mit dem Token geschieht), und die Grenze für
 * die Zahl der Anfragen.
 */

import { describe, expect, test } from 'bun:test'
import {
  RESET_GUELTIG_SEKUNDEN,
  RESET_ZWECK,
  erzeugeResetToken,
  loeseResetTokenEin,
  pruefeResetToken,
  type TokenAblage,
  type TokenEintrag,
} from '../src/index.ts'
import type { PasswordHasher, SessionStore, UserRecord, UserStore } from '@prometheus-harness/auth'

const JETZT = new Date('2026-10-13T20:00:00.000Z')
const NUTZER_ID = '11111111-1111-4111-8111-111111111111'

// ---------------------------------------------------------------------------
// Attrappen
// ---------------------------------------------------------------------------

interface AblageMitSpur extends TokenAblage {
  readonly eintraege: TokenEintrag[]
  readonly verbrauchsversuche: string[]
}

function ablage(): AblageMitSpur {
  const eintraege: TokenEintrag[] = []
  const verbraucht = new Set<string>()
  const verbrauchsversuche: string[] = []
  return {
    eintraege,
    verbrauchsversuche,
    async legeAb(eintrag) {
      eintraege.push(eintrag)
    },
    async finde(hash, zweck) {
      const e = eintraege.find((x) => x.tokenHash === hash && x.zweck === zweck)
      if (e === undefined) return undefined
      return { id: e.id, userId: e.userId, laeuftAb: e.laeuftAb, verbraucht: verbraucht.has(e.id) }
    },
    async verbrauche(id, _at) {
      verbrauchsversuche.push(id)
      // **Atomar wie das UPDATE mit Bedingung.** Wer zuerst kommt, bekommt true.
      if (verbraucht.has(id)) return false
      verbraucht.add(id)
      return true
    },
    async zaehleSeit(userId, zweck, seit) {
      // **Nach dem Anlegezeitpunkt, nicht nach dem Verfall.** Die echte Ablage
      // zählt `created_at >= $3`; ein Fenster von einer Stunde und ein Token von
      // vor 65 Minuten ergeben dort **null**. Zählte diese Attrappe nach
      // `laeuftAb`, ergäbe dasselbe Token `laeuftAb = Anlage + 15 min` und damit
      // **eins** — die Attrappe wäre großzügiger als die Sache, und die
      // Ratenbegrenzung sähe im Test schärfer aus, als sie ist. Der Anlegezeit-
      // punkt steht nicht im Eintrag; er ist `laeuftAb − Gültigkeit`, genau so
      // erzeugt ihn `erzeugeResetToken`.
      const anlegezeit = (x: TokenEintrag): Date => new Date(x.laeuftAb.getTime() - RESET_GUELTIG_SEKUNDEN * 1000)
      return eintraege.filter((e) => e.userId === userId && e.zweck === zweck && anlegezeit(e) >= seit).length
    },
  }
}

/** Der Anlegezeitpunkt eines Eintrags — siehe die Begründung in `zaehleSeit`. */
function angelegt(e: TokenEintrag): Date {
  return new Date(e.laeuftAb.getTime() - RESET_GUELTIG_SEKUNDEN * 1000)
}

function benutzer(over: Partial<UserRecord> = {}): UserRecord {
  return {
    id: NUTZER_ID,
    email: 'ada@example.org',
    passwordHash: 'argon2id$alt',
    displayName: 'Ada',
    role: 'user',
    disabledAt: undefined,
    ...over,
  }
}

function benutzerSpeicher(over: Partial<UserRecord> = {}): UserStore & { readonly geaendert: string[] } {
  const geaendert: string[] = []
  const daten = benutzer(over)
  return {
    geaendert,
    async findByEmail() {
      return daten
    },
    async findById() {
      return daten
    },
    async create() {
      return undefined
    },
    async updatePasswordHash(_id, hash) {
      geaendert.push(hash)
    },
    async count() {
      return 1
    },
  }
}

function sitzungsSpeicher(): SessionStore & { readonly sammelwiderrufe: string[] } {
  const sammelwiderrufe: string[] = []
  const nichts = async (): Promise<undefined> => undefined
  return {
    sammelwiderrufe,
    findByTokenHash: nichts,
    findById: nichts,
    create: nichts,
    touch: nichts,
    revoke: nichts,
    async revokeAllForUser(userId) {
      sammelwiderrufe.push(userId)
      return 3
    },
    replaceToken: nichts,
  }
}

const hasher: PasswordHasher = {
  async hash(passwort) {
    return `argon2id$${passwort.length}`
  },
  async verify() {
    return false
  },
}

const STARK = 'Korrektheit-ist-kein-Zufall-2026'

// ---------------------------------------------------------------------------
// Die Weisung: die Ablage sieht das Klartext-Token nie
// ---------------------------------------------------------------------------

describe('Die Ablage sieht das Klartext-Token nie', () => {
  test('in der Ablage steht ein Hash, nicht das Token', async () => {
    // **Das ist die Weisung des Betreibers, wörtlich geprüft.** Wer die Datenbank
    // liest, darf kein Passwort setzen können — und das geht nur, wenn dort nur
    // der Hash liegt.
    const a = ablage()
    const { token } = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    expect(a.eintraege).toHaveLength(1)
    const eintrag = a.eintraege[0]
    expect(eintrag?.tokenHash).not.toBe(token)
    expect(eintrag?.tokenHash).toMatch(/^[0-9a-f]{64}$/u)
    // Und das Token steht in **keinem** Feld.
    expect(JSON.stringify(a.eintraege)).not.toContain(token)
    expect(eintrag?.zweck).toBe(RESET_ZWECK)
  })

  test('das Klartext-Token hat 256 Bit Zufall — zwei Token sind verschieden', async () => {
    const a = ablage()
    const eins = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    const zwei = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    expect(eins.token).not.toBe(zwei.token)
    // 32 Zufallsbytes als base64url ohne Auffüllung sind 43 Zeichen.
    expect(eins.token).toHaveLength(43)
  })
})

// ---------------------------------------------------------------------------
// Gültigkeit
// ---------------------------------------------------------------------------

describe('Ein Token gilt genau einmal und nur eine Zeit lang', () => {
  test('ein frisches Token gilt', async () => {
    const a = ablage()
    const { token } = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    expect((await pruefeResetToken(a, token, JETZT)).gueltig).toBe(true)
  })

  test('nach fünfzehn Minuten gilt es nicht mehr', async () => {
    const a = ablage()
    const { token, laeuftAb } = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    expect(laeuftAb.getTime()).toBe(JETZT.getTime() + RESET_GUELTIG_SEKUNDEN * 1000)

    const knapp = new Date(laeuftAb.getTime() - 1)
    expect((await pruefeResetToken(a, token, knapp)).gueltig).toBe(true)

    const zuSpaet = new Date(laeuftAb.getTime())
    const urteil = await pruefeResetToken(a, token, zuSpaet)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('abgelaufen')
  })

  test('ein unbekanntes Token bekommt DIESELBE Meldung wie ein abgelaufenes', async () => {
    // Ein Unterschied wäre meßbar und verriete, ob ein geratenes Token je
    // existiert hat.
    const a = ablage()
    const { token } = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    const spaet = new Date(JETZT.getTime() + (RESET_GUELTIG_SEKUNDEN + 1) * 1000)

    const abgelaufen = await pruefeResetToken(a, token, spaet)
    const unbekannt = await pruefeResetToken(a, 'ein-voellig-anderes-token', JETZT)
    expect(abgelaufen.gueltig).toBe(false)
    expect(unbekannt.gueltig).toBe(false)
    if (!abgelaufen.gueltig && !unbekannt.gueltig) {
      expect(unbekannt.grund).toBe(abgelaufen.grund)
    }
  })

  test('ein leeres Token wird abgewiesen', async () => {
    expect((await pruefeResetToken(ablage(), '', JETZT)).gueltig).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Einlösen
// ---------------------------------------------------------------------------

describe('Einlösen', () => {
  async function vorbereitet(over: Partial<UserRecord> = {}) {
    const a = ablage()
    const b = benutzerSpeicher(over)
    const s = sitzungsSpeicher()
    const { token } = await erzeugeResetToken(a, NUTZER_ID, JETZT)
    return { a, b, s, token }
  }

  test('setzt das Passwort, verbraucht das Token und widerruft ALLE Sitzungen', async () => {
    const { a, b, s, token } = await vorbereitet()
    const urteil = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, STARK, JETZT)

    expect(urteil.ok).toBe(true)
    if (urteil.ok) {
      expect(urteil.userId).toBe(NUTZER_ID)
      // **Der Teil, der am häufigsten vergessen wird.** Ohne ihn behielte ein
      // Angreifer seinen Zugang über seine alten Sitzungen.
      expect(urteil.sitzungenWiderrufen).toBe(3)
    }
    expect(b.geaendert).toHaveLength(1)
    expect(b.geaendert[0]).toContain('argon2id$')
    expect(s.sammelwiderrufe).toEqual([NUTZER_ID])
  })

  test('ein Token wirkt NICHT zweimal', async () => {
    const { a, b, s, token } = await vorbereitet()
    const erste = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, STARK, JETZT)
    expect(erste.ok).toBe(true)

    const zweite = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, STARK, JETZT)
    expect(zweite.ok).toBe(false)
    if (!zweite.ok) expect(zweite.regel).toBe('verbraucht')

    // Und das Passwort wurde nur EINMAL geschrieben.
    expect(b.geaendert).toHaveLength(1)
  })

  test('ein abgelaufenes Token setzt kein Passwort', async () => {
    const { a, b, s, token } = await vorbereitet()
    const spaet = new Date(JETZT.getTime() + (RESET_GUELTIG_SEKUNDEN + 1) * 1000)
    const urteil = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, STARK, spaet)
    expect(urteil.ok).toBe(false)
    expect(b.geaendert).toHaveLength(0)
  })

  test('ein zu schwaches Passwort wird abgelehnt — und das Token BLEIBT gültig', async () => {
    // **Die Entscheidung.** Wer ein zu schwaches Passwort wählt, soll es noch
    // einmal versuchen dürfen. Wer das Token hier verbrauchte, bestrafte den
    // falschen: der Benutzer bräuchte ein neues Token, obwohl er nichts falsch
    // gemacht hat außer einer schwachen Wahl.
    const { a, b, s, token } = await vorbereitet()
    const schwach = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, 'kurz', JETZT)
    expect(schwach.ok).toBe(false)
    if (!schwach.ok) expect(schwach.regel).toBe('passwort-zu-schwach')
    expect(b.geaendert).toHaveLength(0)

    // Und jetzt mit einem starken Passwort — dasselbe Token.
    const stark = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, STARK, JETZT)
    expect(stark.ok).toBe(true)
    expect(b.geaendert).toHaveLength(1)
  })

  test('ein gesperrtes Konto bleibt gesperrt — auch mit gültigem Token', async () => {
    const { a, b, s, token } = await vorbereitet({ disabledAt: '2026-01-01T00:00:00.000Z' })
    const urteil = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, token, STARK, JETZT)
    expect(urteil.ok).toBe(false)
    if (!urteil.ok) expect(urteil.regel).toBe('konto-gesperrt')
    expect(b.geaendert).toHaveLength(0)
  })

  test('ein unbekanntes Token setzt nichts', async () => {
    const { a, b, s } = await vorbereitet()
    const urteil = await loeseResetTokenEin({ ablage: a, benutzer: b, sitzungen: s, hasher }, 'geraten', STARK, JETZT)
    expect(urteil.ok).toBe(false)
    expect(b.geaendert).toHaveLength(0)
    expect(s.sammelwiderrufe).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Die Grenze
// ---------------------------------------------------------------------------

describe('Die Grenze für die Zahl der Anfragen', () => {
  test('nach der Grenze wird kein weiteres Token erzeugt', async () => {
    // Ohne sie könnte ein Angreifer, der die Adresse kennt, beliebig viele Tokens
    // erzeugen — jedes ein weiterer Versuch, eines abzufangen.
    const a = ablage()
    await erzeugeResetToken(a, NUTZER_ID, JETZT, 3)
    await erzeugeResetToken(a, NUTZER_ID, JETZT, 3)
    await erzeugeResetToken(a, NUTZER_ID, JETZT, 3)
    expect(a.eintraege).toHaveLength(3)

    const fehler = await erzeugeResetToken(a, NUTZER_ID, JETZT, 3).catch((u: unknown) => u)
    expect(fehler).toBeInstanceOf(Error)
    expect((fehler as Error).message).toContain('zu viele Reset-Anfragen')
    expect(a.eintraege).toHaveLength(3)
  })

  test('ein anderer Benutzer ist von der Grenze nicht betroffen', async () => {
    const a = ablage()
    await erzeugeResetToken(a, NUTZER_ID, JETZT, 1)
    const anderer = await erzeugeResetToken(a, '22222222-2222-4222-8222-222222222222', JETZT, 1)
    expect(anderer.token).not.toBe('')
  })

  test('die Grenze zählt nur das FENSTER — ein altes Token zählt nicht mehr', async () => {
    // **Diese Prüfung hält die Attrappe auf der Seite der Sache.** Ein Token von
    // vor 65 Minuten liegt außerhalb eines Fensters von einer Stunde. Nach
    // `laeuftAb` gezählt ergäbe es einen Treffer (`laeuftAb = Anlage + 15 min`
    // läge 50 Minuten zurück und damit **im** Fenster); die echte Ablage zählt
    // `created_at` und sieht null. Genau dieser Unterschied war in der Attrappe
    // — hier ist er festgenagelt.
    const a = ablage()
    const vor65 = new Date(JETZT.getTime() - 65 * 60 * 1000)
    const eintrag: TokenEintrag = {
      id: 'alt',
      userId: NUTZER_ID,
      zweck: RESET_ZWECK,
      tokenHash: 'a'.repeat(64),
      laeuftAb: new Date(vor65.getTime() + RESET_GUELTIG_SEKUNDEN * 1000),
    }
    await a.legeAb(eintrag)
    expect(angelegt(eintrag).getTime()).toBe(vor65.getTime())

    const seit = new Date(JETZT.getTime() - 60 * 60 * 1000)
    expect(await a.zaehleSeit(NUTZER_ID, RESET_ZWECK, seit)).toBe(0)
    // Und ein frisches Token im selben Fenster zählt sehr wohl.
    await erzeugeResetToken(a, NUTZER_ID, JETZT)
    expect(await a.zaehleSeit(NUTZER_ID, RESET_ZWECK, seit)).toBe(1)
  })
})
