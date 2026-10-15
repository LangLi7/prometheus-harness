/**
 * Die Einstellungen — rein geprüft, und der Dateizugriff in einem **Wegwerf-Verzeichnis**.
 *
 * ## Der Fall, der am leichtesten still bleibt
 *
 * Ein **Tippfehler im Fähigkeitsnamen** (`entscheiden` statt `entscheiden` — ein Buchstabe daneben).
 * Würde er durchgehen, läse er sich wie „nichts gewählt": der Anbieter meldete „nicht bereit", die
 * Entscheidungen gingen zum Menschen, und **niemand erführe warum**. Deshalb wird ein unbekannter
 * Name abgelehnt — laut, mit der Liste der erlaubten.
 *
 * ## Und der zweite: die kaputte Datei
 *
 * Eine **fehlende** Datei ist kein Fehler (der Zustand vor der ersten Einrichtung). Eine **kaputte**
 * ist einer: wer eine Datei hat, hat etwas gewollt. Sie stillschweigend durch die Vorgabe zu
 * ersetzen hieße, seine Wahl lautlos verschwinden zu lassen.
 *
 * ## Was diese Datei NICHT beweist
 *
 * Daß die Einstellungen **wirken** — daß also ein Anbieter die Wahl wirklich benutzt. Das steht in
 * `@prometheus-harness/openrouter` (`modelle`, `bereit`) und wird dort geprüft.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DATEINAME,
  EinstellungenFehler,
  FASSUNG,
  VORGABE,
  denkhilfeAn,
  ladeEinstellungen,
  leseEinstellungen,
  mitDenkhilfe,
  mitStufen,
  mitWahl,
  modelleFuer,
  ohneWahl,
  pfadDerEinstellungen,
  schreibeEinstellungen,
  sichereEinstellungen,
  wahlFuer,
} from '../src/index.ts'

/** Die Wegwerf-Verzeichnisse — nach **jedem** Test entfernt. */
const offen: string[] = []

afterEach(() => {
  for (const d of offen.splice(0)) rmSync(d, { recursive: true, force: true })
})

/**
 * Ein frisches Wegwerf-Verzeichnis.
 *
 * @returns der Pfad
 */
function wegwerf(): string {
  const d = mkdtempSync(join(tmpdir(), 'pmh-einst-'))
  offen.push(d)
  return d
}

/**
 * Führt etwas aus, das werfen soll, und gibt den Fehler zurück.
 *
 * @param tu - was ausgeführt wird
 * @returns der Fehler
 * @throws Error - wenn nichts geworfen wurde
 */
function fange(tu: () => unknown): unknown {
  try {
    tu()
  } catch (fehler: unknown) {
    return fehler
  }
  throw new Error('Es wurde nichts geworfen — diese Prüfung erwartet einen Fehler.')
}

/** Brauchbare Einstellungen für die Prüfungen. */
const GEFUELLT = mitWahl(
  mitStufen(VORGABE, { automatisch: 0.9, rueckfrage: 0.5 }),
  'entscheiden',
  { anbieter: 'openrouter', modell: 'openai/gpt-oss-20b' },
)

// ---------------------------------------------------------------------------
// 1. Die Vorgabe
// ---------------------------------------------------------------------------

describe('Die Vorgabe', () => {
  test('nichts gewählt — und die Denkhilfe ist AUS', () => {
    expect(VORGABE.fassung).toBe(FASSUNG)
    expect(VORGABE.wahl).toEqual({})
    // Der Betreiber hat den Standard so festgelegt: der Schalter ist ein Angebot, keine
    // Einstellung, die jemand still für ihn trifft.
    expect(denkhilfeAn(VORGABE)).toBe(false)
  })

  test('für eine Fähigkeit ohne Wahl gibt es keine Wahl — kein stiller Ersatz', () => {
    expect(wahlFuer(VORGABE, 'entscheiden')).toBeUndefined()
    expect(wahlFuer(VORGABE, 'bild')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Lesen und Schreiben
// ---------------------------------------------------------------------------

describe('Lesen und Schreiben', () => {
  test('hin und zurück', () => {
    const gelesen = leseEinstellungen(schreibeEinstellungen(GEFUELLT))
    expect(gelesen).toEqual(GEFUELLT)
  })

  test('dieselben Einstellungen ergeben DENSELBEN Text', () => {
    // Eine Datei, die ein Mensch ändert, wird verglichen und versioniert. Bei zufälliger
    // Reihenfolge sähe jede Änderung wie ein Umbau aus.
    expect(schreibeEinstellungen(GEFUELLT)).toBe(schreibeEinstellungen(GEFUELLT))
  })

  test('die Reihenfolge folgt der Fähigkeitsliste — nicht der Einfügereihenfolge', () => {
    const a = mitWahl(mitWahl(VORGABE, 'einbetten', { anbieter: 'x', modell: 'y' }), 'entscheiden', {
      anbieter: 'x',
      modell: 'z',
    })
    const b = mitWahl(mitWahl(VORGABE, 'entscheiden', { anbieter: 'x', modell: 'z' }), 'einbetten', {
      anbieter: 'x',
      modell: 'y',
    })
    // Anders eingefügt, gleich geschrieben.
    expect(schreibeEinstellungen(a)).toBe(schreibeEinstellungen(b))
    expect(schreibeEinstellungen(a).indexOf('entscheiden')).toBeLessThan(
      schreibeEinstellungen(a).indexOf('einbetten'),
    )
  })

  test('die Datei hat NUR die bekannten Felder — für einen Schlüssel ist kein Platz', () => {
    const roh = JSON.parse(schreibeEinstellungen(GEFUELLT)) as Record<string, unknown>
    expect(Object.keys(roh).sort()).toEqual(['fassung', 'stufen', 'wahl'])
    expect(Object.keys(roh)).not.toContain('schluessel')
    expect(Object.keys(roh)).not.toContain('apiKey')
  })

  test('ein Text mit Zeilenumbruch am Ende — damit ein Vergleich nicht meckert', () => {
    expect(schreibeEinstellungen(VORGABE).endsWith('\n')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Was abgelehnt wird — und mit welcher Meldung
// ---------------------------------------------------------------------------

describe('Was abgelehnt wird', () => {
  test('DER STILLE FEHLER: ein Tippfehler im Fähigkeitsnamen fliegt auf', () => {
    // **Beim ersten Schreiben dieser Prüfung stand hier `entscheiden` — richtig geschrieben.** Die
    // Prüfung war damit grün und prüfte **nichts**: sie lief in den Zweig „alles in Ordnung".
    // Erst als `fange` warf („es wurde nichts geworfen"), fiel es auf.
    //
    // Jetzt stehen hier zwei echte Vertipper, und beide sind plausibel.
    for (const tippfehler of ['entscheide', 'Entscheiden']) {
      const text = JSON.stringify({
        fassung: 1,
        wahl: { [tippfehler]: { anbieter: 'x', modell: 'y' } },
      })
      const fehler = fange(() => leseEinstellungen(text))
      expect({ tippfehler, art: fehler instanceof EinstellungenFehler }).toEqual({
        tippfehler,
        art: true,
      })
      const maengel = (fehler as EinstellungenFehler).maengel.join(' ')
      expect(maengel).toContain(tippfehler)
      // Und die Meldung nennt die erlaubten Namen — der Leser soll nicht nachschlagen müssen.
      expect(maengel).toContain('Erlaubt')
    }
  })

  test('eine unbekannte Fassung wird nicht gedeutet', () => {
    const fehler = fange(() => leseEinstellungen(JSON.stringify({ fassung: 99, wahl: {} })))
    expect((fehler as EinstellungenFehler).maengel.join(' ')).toContain('99')
  })

  test('ein fehlendes Anbieter- oder Modellfeld fliegt auf', () => {
    const fehler = fange(() =>
      leseEinstellungen(JSON.stringify({ fassung: 1, wahl: { entscheiden: { anbieter: 'x' } } })),
    )
    expect((fehler as EinstellungenFehler).maengel.join(' ')).toContain('modell')
  })

  test('ein leeres Modell fliegt auf — „nichts" ist keine Kennung', () => {
    const fehler = fange(() =>
      leseEinstellungen(JSON.stringify({ fassung: 1, wahl: { entscheiden: { anbieter: 'x', modell: '   ' } } })),
    )
    expect((fehler as EinstellungenFehler).maengel.length).toBeGreaterThan(0)
  })

  test('ein unbekanntes Feld auf oberster Ebene fliegt auf', () => {
    // Wer „schwellen" statt „stufen" schreibt, hat etwas gemeint — und würde sonst nie erfahren,
    // daß es nicht angekommen ist.
    const fehler = fange(() =>
      leseEinstellungen(JSON.stringify({ fassung: 1, wahl: {}, schwellen: { automatisch: 1 } })),
    )
    expect((fehler as EinstellungenFehler).maengel.join(' ')).toContain('schwellen')
  })

  test('Schwellen außerhalb 0…1 und verkehrt herum fliegen auf', () => {
    const a = fange(() =>
      leseEinstellungen(JSON.stringify({ fassung: 1, wahl: {}, stufen: { automatisch: 1.5, rueckfrage: 0.5 } })),
    )
    expect((a as EinstellungenFehler).maengel.join(' ')).toContain('zwischen 0 und 1')

    const b = fange(() =>
      leseEinstellungen(JSON.stringify({ fassung: 1, wahl: {}, stufen: { automatisch: 0.4, rueckfrage: 0.9 } })),
    )
    expect((b as EinstellungenFehler).maengel.join(' ')).toContain('nie nachgefragt')
  })

  test('„denkhilfe" muß wahr oder falsch sein', () => {
    const fehler = fange(() => leseEinstellungen(JSON.stringify({ fassung: 1, wahl: {}, denkhilfe: 'ja' })))
    expect((fehler as EinstellungenFehler).maengel.join(' ')).toContain('denkhilfe')
  })

  test('kein JSON, kein Objekt — beides fliegt auf', () => {
    expect(fange(() => leseEinstellungen('nicht json'))).toBeInstanceOf(EinstellungenFehler)
    expect(fange(() => leseEinstellungen('[1,2]'))).toBeInstanceOf(EinstellungenFehler)
  })

  test('ALLE Mängel werden auf einmal genannt', () => {
    // Bei einer Datei, die ein Mensch von Hand schreibt: beim ersten Fehler abzubrechen hieße
    // „Fehler beheben, nächster Fehler, Fehler beheben …".
    const fehler = fange(() =>
      leseEinstellungen(
        JSON.stringify({ fassung: 7, wahl: { quatsch: { anbieter: 'x', modell: 'y' } }, unbekannt: 1 }),
      ),
    )
    expect((fehler as EinstellungenFehler).maengel.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// 4. Verändern ohne Verändern
// ---------------------------------------------------------------------------

describe('Verändern verändert das Alte nicht', () => {
  test('mitWahl und ohneWahl lassen das Original in Ruhe', () => {
    const vorher = VORGABE
    const nachher = mitWahl(vorher, 'einbetten', { anbieter: 'a', modell: 'b' })
    expect(vorher.wahl).toEqual({})
    expect(nachher.wahl).toEqual({ einbetten: { anbieter: 'a', modell: 'b' } })

    const zurueck = ohneWahl(nachher, 'einbetten')
    expect(nachher.wahl).toEqual({ einbetten: { anbieter: 'a', modell: 'b' } })
    expect(zurueck.wahl).toEqual({})
  })

  test('ohneWahl für etwas, das nicht gewählt war, ist kein Fehler', () => {
    expect(ohneWahl(VORGABE, 'bild').wahl).toEqual({})
  })

  test('mitWahl mit leerem Anbieter oder Modell fliegt auf', () => {
    expect(fange(() => mitWahl(VORGABE, 'bild', { anbieter: ' ', modell: 'x' }))).toBeInstanceOf(EinstellungenFehler)
    expect(fange(() => mitWahl(VORGABE, 'bild', { anbieter: 'x', modell: '' }))).toBeInstanceOf(EinstellungenFehler)
  })

  test('mitWahl schneidet Leerzeichen ab', () => {
    expect(wahlFuer(mitWahl(VORGABE, 'bild', { anbieter: ' a ', modell: ' b ' }), 'bild')).toEqual({
      anbieter: 'a',
      modell: 'b',
    })
  })

  test('mitStufen prüft DIESELBE Regel wie umgangFuer — nur früher', () => {
    expect(fange(() => mitStufen(VORGABE, { automatisch: 0.4, rueckfrage: 0.9 }))).toBeInstanceOf(EinstellungenFehler)
    expect(mitStufen(VORGABE, { automatisch: 0.9, rueckfrage: 0.5 }).stufen).toEqual({
      automatisch: 0.9,
      rueckfrage: 0.5,
    })
  })

  test('die Denkhilfe an- und ausschalten', () => {
    expect(denkhilfeAn(mitDenkhilfe(VORGABE, true))).toBe(true)
    expect(denkhilfeAn(mitDenkhilfe(mitDenkhilfe(VORGABE, true), false))).toBe(false)
  })

  test('modelleFuer gibt NUR die Wahl des gefragten Anbieters — keine fremde Kennung', () => {
    // Der Anbieter soll das Format dieser Datei nicht kennen; er bekommt eine Zuordnung.
    // **Und nur seine eigene.** Landete die Kennung eines anderen Anbieters hier, würde der
    // Anbieter mit einem fremden Modell aufgerufen und scheiterte erst beim Dienst.
    const e = mitWahl(
      mitWahl(VORGABE, 'entscheiden', { anbieter: 'openrouter', modell: 'openai/gpt-oss-20b' }),
      'einbetten',
      { anbieter: 'zai', modell: 'embedding-3' },
    )
    expect(modelleFuer(e, 'openrouter')).toEqual({ entscheiden: 'openai/gpt-oss-20b' })
    expect(modelleFuer(e, 'zai')).toEqual({ einbetten: 'embedding-3' })
    expect(modelleFuer(e, 'gibtsnicht')).toEqual({})
  })

  test('der Weg von der Datei zum Anbieter trägt die Wahl wirklich', async () => {
    // Die ganze Kette: speichern, laden, in Modellkennungen übersetzen.
    const d = wegwerf()
    const pfad = pfadDerEinstellungen(d)
    await sichereEinstellungen(
      pfad,
      mitWahl(VORGABE, 'text-zu-sprache', { anbieter: 'openrouter', modell: 'google/gemini-3.8-flash-tts' }),
    )
    const geladen = await ladeEinstellungen(pfad)
    expect(modelleFuer(geladen, 'openrouter')).toEqual({ 'text-zu-sprache': 'google/gemini-3.8-flash-tts' })
  })

})

// ---------------------------------------------------------------------------
// 5. Die Datei
// ---------------------------------------------------------------------------

describe('Die Datei', () => {
  test('ein fehlendes Verzeichnis und eine fehlende Datei sind KEIN Fehler', async () => {
    const d = wegwerf()
    const pfad = pfadDerEinstellungen(join(d, 'gibts', 'noch', 'nicht'))
    expect(await ladeEinstellungen(pfad)).toEqual(VORGABE)
  })

  test('speichern legt das Verzeichnis an, und laden gibt dasselbe zurück', async () => {
    const d = wegwerf()
    const pfad = pfadDerEinstellungen(join(d, 'tief', 'drin'))
    await sichereEinstellungen(pfad, GEFUELLT)
    expect(existsSync(pfad)).toBe(true)
    expect(await ladeEinstellungen(pfad)).toEqual(GEFUELLT)
    expect(pfad.endsWith(DATEINAME)).toBe(true)
  })

  test('nach dem Speichern bleibt KEINE Nachbardatei liegen', async () => {
    // Eine liegengebliebene `.neu`-Datei sähe wie eine Einstellungsdatei aus und wäre keine.
    const d = wegwerf()
    await sichereEinstellungen(pfadDerEinstellungen(d), GEFUELLT)
    expect(readdirSync(d)).toEqual([DATEINAME])
  })

  test('eine KAPUTTE Datei ist ein Fehler — kein stiller Rückfall auf die Vorgabe', async () => {
    const d = wegwerf()
    const pfad = pfadDerEinstellungen(d)
    writeFileSync(pfad, '{ das ist kein json', 'utf8')
    const fehler = await ladeEinstellungen(pfad).catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(EinstellungenFehler)
    // **Der wichtigste Punkt.** Fiele das still auf die Vorgabe zurück, wäre die Wahl des Nutzers
    // lautlos verschwunden — und die Entscheidungen gingen zum Menschen, ohne daß es jemand sagt.
    expect(await ladeEinstellungen(pfad).catch(() => 'geworfen')).toBe('geworfen')
  })

  test('ein zweites Speichern überschreibt, ohne zu häufen', async () => {
    const d = wegwerf()
    const pfad = pfadDerEinstellungen(d)
    await sichereEinstellungen(pfad, VORGABE)
    await sichereEinstellungen(pfad, GEFUELLT)
    expect(await ladeEinstellungen(pfad)).toEqual(GEFUELLT)
    expect(readdirSync(d)).toEqual([DATEINAME])
  })
})
