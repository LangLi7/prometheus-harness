/**
 * Prüfungen für die Einladung — die Regeln und die Zustände.
 *
 * **Was hier nachgewiesen wird.** Die Weisung des Betreibers war:
 *
 * > *„das der user sich selbst anmelden kann sein eigenes harness"*
 *
 * Der Nachweis dafür ist nicht, daß ein Link funktioniert, sondern daß er
 * **aufhört** zu funktionieren: nach Ablauf, nach Einlösung, nach Widerruf. Und
 * daß er **einmal** gilt. Jeder dieser Fälle steht hier einzeln — mit der
 * Grenze, nicht nur mit einem Wert weit daneben.
 *
 * **Was hier NICHT geprüft wird.** Daß die Datenbank ein zweites Einlösen
 * verhindert. Das ist eine Eigenschaft von `invitations.ts` und braucht die
 * Datenbank (das `UPDATE … WHERE consumed_at IS NULL`). Hier wird die
 * **Entscheidung** geprüft, dort die **Durchsetzung**.
 */
import { describe, expect, test } from 'bun:test'
import type { EinladungRecord } from '@prometheus-harness/store-postgres'
import {
  EINLADUNG_MAX_SEKUNDEN,
  EINLADUNG_MIN_SEKUNDEN,
  EINLADUNG_VORGABE_SEKUNDEN,
  einladungHash,
  erzeugeEinladungToken,
  gleicherHash,
  pruefeEinladung,
  waehleDauer,
} from '../src/einladung.ts'
import { einladungZustand, type EinladungZustand } from '../src/paths.ts'

const JETZT = new Date('2026-10-21T12:00:00.000Z')

/** Eine Einladung, die zum Zeitpunkt {@link JETZT} gültig ist. */
function eintrag(teile: Partial<EinladungRecord> = {}): EinladungRecord {
  // **Feldweise statt `…teile`.** Ein `Partial` über ein erforderliches Feld
  // macht das Ergebnis optional; `exactOptionalPropertyTypes` unterscheidet dann
  // „darf fehlen" von „darf `undefined` sein". Feldweise ist es eindeutig.
  return {
    id: teile.id ?? '00000000-0000-4000-8000-000000000001',
    tokenHash: teile.tokenHash ?? 'a'.repeat(64),
    createdBy: teile.createdBy ?? '00000000-0000-4000-8000-000000000002',
    role: teile.role ?? 'user',
    note: teile.note ?? '',
    createdAt: teile.createdAt ?? '2026-10-21T11:00:00.000Z',
    expiresAt: teile.expiresAt ?? '2026-10-28T11:00:00.000Z',
    consumedAt: teile.consumedAt ?? undefined,
    consumedBy: teile.consumedBy ?? undefined,
    revokedAt: teile.revokedAt ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// Das Token
// ---------------------------------------------------------------------------

describe('erzeugeEinladungToken', () => {
  test('ist 43 Zeichen aus dem base64url-Alphabet', () => {
    // 32 Bytes → 43 Zeichen ohne Auffüllung. Die Länge ist kein Zufall: sie ist
    // 256 Bit, und ein kürzeres Token wäre erratbar.
    const token = erzeugeEinladungToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u)
  })

  test('ist in der Adresse ohne Prozent-Kodierung benutzbar', () => {
    // `+`, `/` und `=` kämen in base64 vor und müßten in einem Link kodiert
    // werden; base64url kommt ohne sie aus.
    for (let i = 0; i < 50; i += 1) {
      const token = erzeugeEinladungToken()
      expect(token).not.toContain('+')
      expect(token).not.toContain('/')
      expect(token).not.toContain('=')
      expect(encodeURIComponent(token)).toBe(token)
    }
  })

  test('wiederholt sich nicht', () => {
    // 200 Token, keine Kollision. Bei 256 Bit Zufall ist eine Kollision
    // praktisch ausgeschlossen — dieser Test fängt einen kaputten Zufall
    // (etwa `Math.random`) und keinen Zufallseinfall.
    const gesehen = new Set<string>()
    for (let i = 0; i < 200; i += 1) gesehen.add(erzeugeEinladungToken())
    expect(gesehen.size).toBe(200)
  })
})

describe('einladungHash', () => {
  test('ist SHA-256 in Hex', () => {
    expect(einladungHash('irgendwas')).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('ist für dieselbe Eingabe derselbe Wert — und für eine andere ein anderer', () => {
    expect(einladungHash('a')).toBe(einladungHash('a'))
    expect(einladungHash('a')).not.toBe(einladungHash('b'))
  })

  test('ist nicht der Klartext', () => {
    const token = erzeugeEinladungToken()
    expect(einladungHash(token)).not.toContain(token)
  })
})

describe('gleicherHash', () => {
  test('erkennt Gleichheit', () => {
    const h = einladungHash('a')
    expect(gleicherHash(h, h)).toBe(true)
  })

  test('erkennt Ungleichheit und verschiedene Längen', () => {
    expect(gleicherHash(einladungHash('a'), einladungHash('b'))).toBe(false)
    // **Die Längenprüfung steht vor `timingSafeEqual`** — die Funktion wirft bei
    // ungleicher Länge, statt `false` zu liefern.
    expect(gleicherHash('abc', 'abcdef')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Das Urteil
// ---------------------------------------------------------------------------

describe('pruefeEinladung', () => {
  test('eine offene Einladung ist gültig', () => {
    expect(pruefeEinladung(eintrag(), JETZT)).toEqual({ gueltig: true })
  })

  test('ohne Eintrag: unbekannt', () => {
    const urteil = pruefeEinladung(undefined, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('unbekannt')
  })

  test('abgelaufen — an der Grenze, nicht daneben', () => {
    // `jetzt < ablauf` ist die Bedingung. Genau am Ablaufpunkt gilt die
    // Einladung **nicht** mehr; ein Test eine Sekunde daneben würde diesen
    // Unterschied nicht sehen.
    const urteil = pruefeEinladung(eintrag({ expiresAt: JETZT.toISOString() }), JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) {
      expect(urteil.regel).toBe('abgelaufen')
      expect(urteil.grund).toContain(JETZT.toISOString())
    }
  })

  test('eine Sekunde vor Ablauf: noch gültig', () => {
    const knapp = new Date(JETZT.getTime() + 1000).toISOString()
    expect(pruefeEinladung(eintrag({ expiresAt: knapp }), JETZT)).toEqual({ gueltig: true })
  })

  test('eingelöst', () => {
    const urteil = pruefeEinladung(eintrag({ consumedAt: '2026-10-21T11:30:00.000Z' }), JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('eingeloest')
  })

  test('zurückgezogen', () => {
    const urteil = pruefeEinladung(eintrag({ revokedAt: '2026-10-21T11:30:00.000Z' }), JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('zurueckgezogen')
  })

  test('zurückgezogen schlägt eingelöst — die genauere Auskunft gewinnt', () => {
    // Beides kann zugleich dastehen (zurückgezogen nach dem Einlösen wäre
    // unsinnig, aber die Spalten erlauben es). Wer den Link zurückgezogen hat,
    // soll das hören — nicht „eingelöst".
    const urteil = pruefeEinladung(
      eintrag({ consumedAt: '2026-10-21T11:30:00.000Z', revokedAt: '2026-10-21T11:40:00.000Z' }),
      JETZT,
    )
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('zurueckgezogen')
  })

  test('eingelöst schlägt abgelaufen — benutzt ist nicht verfallen', () => {
    const urteil = pruefeEinladung(
      eintrag({ consumedAt: '2026-10-20T09:00:00.000Z', expiresAt: '2026-10-20T10:00:00.000Z' }),
      JETZT,
    )
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('eingeloest')
  })

  test('ein unlesbarer Ablauf gilt NICHT als gültig', () => {
    // Die sichere Richtung: ein Fehler in der Ablage darf keine Einladung
    // öffnen. `new Date('kaputt')` ergibt `NaN`; ein Vergleich damit ist immer
    // falsch — ohne diese Prüfung wäre die Einladung **unbegrenzt** gültig.
    const urteil = pruefeEinladung(eintrag({ expiresAt: 'kaputt' }), JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('unbekannt')
  })
})

// ---------------------------------------------------------------------------
// Der Zustand, den die Oberfläche zeigt
// ---------------------------------------------------------------------------

describe('einladungZustand', () => {
  test('stimmt mit der Prüfung überein', () => {
    // **Warum dieser Test wichtig ist.** Oberfläche und Einlösung bestimmen den
    // Zustand an zwei Stellen. Laufen sie auseinander, zeigt die Liste „offen"
    // und die Einlösung sagt „abgelaufen" — ein Widerspruch, den niemand mehr
    // erklären kann.
    const faelle: readonly { readonly e: EinladungRecord; readonly erwartet: EinladungZustand }[] = [
      { e: eintrag(), erwartet: 'offen' },
      { e: eintrag({ consumedAt: '2026-10-21T11:30:00.000Z' }), erwartet: 'eingeloest' },
      { e: eintrag({ revokedAt: '2026-10-21T11:30:00.000Z' }), erwartet: 'zurueckgezogen' },
      { e: eintrag({ expiresAt: JETZT.toISOString() }), erwartet: 'abgelaufen' },
    ]
    for (const fall of faelle) {
      expect(einladungZustand(fall.e, JETZT)).toBe(fall.erwartet)
      const urteil = pruefeEinladung(fall.e, JETZT)
      expect(urteil.gueltig).toBe(fall.erwartet === 'offen')
    }
  })
})

// ---------------------------------------------------------------------------
// Die Dauer
// ---------------------------------------------------------------------------

describe('waehleDauer', () => {
  test('nimmt die Grenzen an', () => {
    expect(waehleDauer(EINLADUNG_MIN_SEKUNDEN)).toBe(EINLADUNG_MIN_SEKUNDEN)
    expect(waehleDauer(EINLADUNG_MAX_SEKUNDEN)).toBe(EINLADUNG_MAX_SEKUNDEN)
    expect(waehleDauer(EINLADUNG_VORGABE_SEKUNDEN)).toBe(EINLADUNG_VORGABE_SEKUNDEN)
  })

  test('weist alles außerhalb ab — statt es still zu klemmen', () => {
    // Ein geklemmter Wert sähe wie Erfolg aus, und der Admin erführe nie, daß
    // seine Angabe nicht genommen wurde.
    expect(waehleDauer(EINLADUNG_MIN_SEKUNDEN - 1)).toBeUndefined()
    expect(waehleDauer(EINLADUNG_MAX_SEKUNDEN + 1)).toBeUndefined()
    expect(waehleDauer(0)).toBeUndefined()
    expect(waehleDauer(-60)).toBeUndefined()
  })

  test('weist Nicht-Zahlen und Brüche ab', () => {
    expect(waehleDauer(undefined)).toBeUndefined()
    expect(waehleDauer('3600')).toBeUndefined()
    expect(waehleDauer(1.5)).toBeUndefined()
    expect(waehleDauer(Number.NaN)).toBeUndefined()
  })

  test('die Vorgabe liegt im erlaubten Bereich', () => {
    expect(EINLADUNG_VORGABE_SEKUNDEN).toBeGreaterThanOrEqual(EINLADUNG_MIN_SEKUNDEN)
    expect(EINLADUNG_VORGABE_SEKUNDEN).toBeLessThanOrEqual(EINLADUNG_MAX_SEKUNDEN)
  })
})
