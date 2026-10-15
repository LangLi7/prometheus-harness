/**
 * Der Wächter — **rein** geprüft: kein Netz, kein Modell, kein Dateisystem.
 *
 * ## Die Prüfvorlage ist ein echter Unfall
 *
 * Am 15.10.2026 habe ich den Schlüsselspeicher `~/.dsh/.credentials.yaml` mit einem Filter
 * ausgelesen, der nur `secret:`-Zeilen maskierte. Die Schlüssel stehen dort unter `refs:` —
 * **alle 14** standen danach im Klartext im Gesprächsverlauf.
 *
 * Der Text unten hat **genau die Form**, die damals durchging. Wäre der Wächter davor gewesen,
 * hätte er angeschlagen — und dieser Text ist deshalb die wichtigste Prüfung der Datei.
 *
 * **Alle Werte hier sind erfunden.** Sie sehen aus wie Schlüssel und sind keine: eine Attrappe, die
 * einen echten Wert enthielte, wäre selbst das Leck. Und der Wächter würde sie melden — was er
 * soll.
 *
 * ## Was diese Datei NICHT beweist
 *
 * Daß ein echtes Modell einen echten Text richtig beurteilt. Stufe 2 wird hier mit einer Attrappe
 * geprüft, die **vorgegebene** Zahlen liefert. Ob die Zahlen im Betrieb taugen, ist eine Messung am
 * echten Modell und eine Frage der Schwellen.
 */

import { describe, expect, test } from 'bun:test'
import type { Entscheider, EntscheidungsEingabe, Urteil } from '@prometheus-harness/capabilities'
import { waechter, type Eintrag } from '../src/index.ts'

// ---------------------------------------------------------------------------
// Erfundene Werte, die wie Schlüssel AUSSEHEN — und keine sind
// ---------------------------------------------------------------------------

const OR_WERT = `sk-or-v1-${'a'.repeat(64)}`
const DS_WERT = `sk-${'b'.repeat(32)}`
const GROQ_WERT = `gsk_${'c'.repeat(40)}`
const SLACK_WERT = `xoxb-${'1'.repeat(12)}-${'d'.repeat(20)}`
const DB_WERT = 'postgres://pmh:streng-geheim-4711@127.0.0.1:5432/pmh'

/** Der Text in der Form, die am 15.10.2026 durchging. */
const LECK = [
  'version: 1',
  'refs:',
  `  FIRECRAWL_FALLBACK_API_KEY: fc-${'e'.repeat(32)}`,
  `  OPENROUTER_API_KEY: ${OR_WERT}`,
  `  DEEPSEEK_API_KEY: ${DS_WERT}`,
  `  GROQ_API_KEY: ${GROQ_WERT}`,
  `  SLACK_BOT_TOKEN: ${SLACK_WERT}`,
  'records:',
  '  client-connection/browser-session:',
  '    kind: grant',
  '    payload:',
  '      secret: ' + 'f'.repeat(43),
].join('\n')

/** Alle erfundenen Werte — zum Beweis, daß **keiner** in einer Meldung steht. */
const ALLE_WERTE = [OR_WERT, DS_WERT, GROQ_WERT, SLACK_WERT, DB_WERT]

/** Was der Wächter als eingetragen kennen soll. */
const EINGETRAGEN: readonly Eintrag[] = [
  { name: 'OPENROUTER_API_KEY', wert: OR_WERT },
  { name: 'DEEPSEEK_API_KEY', wert: DS_WERT },
  { name: 'GROQ_API_KEY', wert: GROQ_WERT },
  { name: 'SLACK_BOT_TOKEN', wert: SLACK_WERT },
  // Zu kurz, um ein Geheimnis zu sein — darf NIE anschlagen.
  { name: 'SPRACHE', wert: 'de' },
]

/**
 * Prüft, daß in einem Text **kein** erfundener Wert steht.
 *
 * @param text - der zu prüfende Text
 * @returns die Werte, die doch darin stehen (leer heißt gut)
 */
function werteImText(text: string): string[] {
  return ALLE_WERTE.filter((w) => text.includes(w))
}

// ---------------------------------------------------------------------------
// 1. Stufe 1 — die Formen
// ---------------------------------------------------------------------------

describe('Stufe 1 — die Formen, ohne Modell', () => {
  test('JEDE Geheimniszeile des Unfall-Textes wird gefunden — keine Lücke', () => {
    const befund = waechter().pruefe(LECK)
    expect(befund.darfRaus).toBe(false)
    if (befund.darfRaus) return

    // Die sechs Zeilen, die wirklich ein Geheimnis tragen: FIRECRAWL, OPENROUTER, DEEPSEEK, GROQ,
    // SLACK — und die Zeile `secret: …`, die **keine** Form hat und nur durch ihren eigenen Namen
    // auffällt.
    const geheim = [2, 3, 4, 5, 6, 11]
    const zeilen = LECK.split('\n')
    const grenzen: { von: number; bis: number }[] = []
    let ab = 0
    for (const zeile of zeilen) {
      grenzen.push({ von: ab, bis: ab + zeile.length })
      ab += zeile.length + 1
    }

    const ungedeckt = geheim.filter((nummer) => {
      const g = grenzen[nummer]
      if (g === undefined) return true
      return !befund.treffer.some((t) => t.stelle < g.bis && t.stelle + t.laenge > g.von)
    })
    // **Leer heißt gut.** Fände eine Zeile keinen Fund, stünde dort ein Geheimnis, das der Wächter
    // durchgelassen hätte — und die Zahl der Funde wäre trotzdem größer als null, also unauffällig.
    expect(ungedeckt).toEqual([])
    expect(befund.treffer.length).toBeGreaterThanOrEqual(6)
  })

  test('KEIN Wert steht in der Meldung und in keinem Fund — das ist der Zweck', () => {
    const befund = waechter().pruefe(LECK)
    expect(befund.darfRaus).toBe(false)
    if (befund.darfRaus) return
    // Ein Wächter, der meldet „hier steht sk-or-v1-aaa…", hat das Geheimnis selbst ausgegeben.
    expect(werteImText(befund.wegen)).toEqual([])
    expect(werteImText(JSON.stringify(befund.treffer))).toEqual([])
  })

  test('die Stelle ist WAHR — und der Fund umfaßt genau das Geheimnis', () => {
    const text = `harmlos ${DB_WERT} harmlos`
    const befund = waechter().pruefe(text)
    expect(befund.darfRaus).toBe(false)
    if (befund.darfRaus) return
    const fund = befund.treffer[0]
    if (fund === undefined) throw new Error('Es wurde nichts gefunden.')

    // **Meine erste Erwartung war falsch, und die Regel hat recht.** Ich hatte erwartet, daß der
    // Fund die GANZE Adresse umfaßt. Er umfaßt aber genau den Geheimnisteil: Form, Benutzer und
    // Paßwort. Der Wirt (`127.0.0.1:5432/pmh`) ist kein Geheimnis — und ihn mitzuschwärzen würde
    // Auskunft wegnehmen, die niemandem schadet.
    const gefunden = text.slice(fund.stelle, fund.stelle + fund.laenge)
    expect(gefunden).toBe('postgres://pmh:streng-geheim-4711@')
    expect(gefunden).toContain('streng-geheim-4711')

    // Und entschärft ist das Paßwort wirklich weg — nicht nur „teilweise".
    const entschaerft = waechter().entschaerfe(text).text
    expect(entschaerft).not.toContain('streng-geheim-4711')
    expect(entschaerft).not.toContain('pmh:')
  })

  test('ein sauberer Text wird durchgelassen', () => {
    const sauber = [
      'export function addiere(a: number, b: number): number {',
      '  return a + b',
      '}',
      'Der Commit 7069783a1b2c3d4e5f60718293a4b5c6d7e8f901 wurde geprüft.',
      'Siehe https://openrouter.ai/docs und http://127.0.0.1:3081/anmeldung/',
      'Die Sitzung dauerte 42 Minuten.',
    ].join('\n')
    // **Das ist so wichtig wie die Treffer.** Eine Regel, die bei jedem Git-Hash (40 Hexzeichen)
    // oder bei jeder Adresse anschlägt, wird abgeschaltet — und findet dann das echte Geheimnis
    // nicht mehr.
    expect(waechter().pruefe(sauber)).toEqual({ darfRaus: true })
  })

  test('jede Form wird einzeln erkannt', () => {
    const faelle: readonly (readonly [string, string])[] = [
      ['privater-schluessel', '-----BEGIN RSA PRIVATE KEY-----'],
      ['schluessel-form-sk', OR_WERT],
      ['schluessel-form-gsk', GROQ_WERT],
      ['kennung-aws', `AKIA${'A'.repeat(16)}`],
      ['schluessel-form-aiza', `AIza${'B'.repeat(35)}`],
      ['kennung-github', `ghp_${'C'.repeat(36)}`],
      ['kennung-slack', SLACK_WERT],
      ['kennung-jwt', `eyJ${'D'.repeat(10)}.eyJ${'E'.repeat(10)}.${'F'.repeat(10)}`],
      ['verbindung-mit-passwort', DB_WERT],
      ['feld-mit-geheimnisnamen', 'secret: eine-ziemlich-lange-zeichenkette'],
      ['feld-mit-geheimnisnamen', 'PASSWORD=ein-langes-passwort-4711'],
      // **Der Fall, der zuerst durchfiel.** `\b` verlangt eine Wortgrenze, und `_` ist ein
      // Wortzeichen: vor `API_KEY` steht ein `_`, also gab es keine. Die Regel griff bei
      // `secret: …` und NICHT bei `…_API_KEY:` — dem häufigsten Fall.
      ['feld-mit-geheimnisnamen', `FIRECRAWL_FALLBACK_API_KEY: fc-${'e'.repeat(32)}`],
      ['feld-mit-geheimnisnamen', `SLACK_BOT_TOKEN: ${SLACK_WERT}`],
    ]
    for (const [regel, text] of faelle) {
      const befund = waechter().pruefe(text)
      const namen = befund.darfRaus === false ? befund.treffer.map((t) => t.regel) : []
      expect({ regel, gefunden: namen.includes(regel) }).toEqual({ regel, gefunden: true })
    }
  })

  test('der ZWEITE Aufruf findet dasselbe — die `lastIndex`-Falle', () => {
    // Ein RegExp mit `g` merkt sich, wo es war. Wird dasselbe Objekt zweimal benutzt, findet der
    // zweite Lauf nichts mehr. Dieser Fehler tritt NUR beim zweiten Aufruf auf — eine einzelne
    // Prüfung sähe ihn nie.
    const w = waechter()
    const erster = w.pruefe(LECK)
    const zweiter = w.pruefe(LECK)
    expect(zweiter).toEqual(erster)
    expect(zweiter.darfRaus).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Stufe 1 — die eingetragenen Werte
// ---------------------------------------------------------------------------

describe('Stufe 1 — die eingetragenen Werte', () => {
  test('ein eingetragener Wert wird gefunden — MIT seinem Namen', () => {
    const befund = waechter({ bekannteWerte: () => EINGETRAGEN }).pruefe(`OPENROUTER_API_KEY: ${OR_WERT}`)
    expect(befund.darfRaus).toBe(false)
    if (befund.darfRaus) return
    // Der Name ist erlaubt — er ist kein Geheimnis und hilft dem Menschen.
    expect(befund.wegen).toContain('OPENROUTER_API_KEY')
    // Der Wert nicht.
    expect(werteImText(befund.wegen)).toEqual([])
  })

  test('ein zu kurzer Eintrag schlägt NICHT an — sonst wäre der Wächter unbrauchbar', () => {
    expect(waechter({ bekannteWerte: () => EINGETRAGEN }).pruefe('Die Sprache ist de.')).toEqual({ darfRaus: true })
  })

  test('dieselbe Stelle wird EINMAL gemeldet, und der Name gewinnt', () => {
    // Der eingetragene OpenRouter-Schlüssel hat auch eine Form — beide Stufen finden ihn.
    const befund = waechter({ bekannteWerte: () => EINGETRAGEN }).pruefe(`x ${OR_WERT} y`)
    expect(befund.darfRaus).toBe(false)
    if (befund.darfRaus) return
    const anDerStelle = befund.treffer.filter((t) => t.stelle === 2)
    expect(anDerStelle.length).toBe(1)
    expect(anDerStelle[0]?.bezeichnung).toBe('OPENROUTER_API_KEY')
  })

  test('ohne eingetragene Werte wird trotzdem geprüft', () => {
    expect(waechter().pruefe(`x ${OR_WERT} y`).darfRaus).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Entschärfen
// ---------------------------------------------------------------------------

describe('Entschärfen', () => {
  test('der Wert ist weg, die Länge bleibt, die Stellen stimmen weiter', () => {
    const w = waechter({ bekannteWerte: () => EINGETRAGEN })
    const vorher = `Anfang ${OR_WERT} Ende`
    const ergebnis = w.entschaerfe(vorher)

    expect(werteImText(ergebnis.text)).toEqual([])
    expect(ergebnis.text).not.toContain(OR_WERT)
    // Gleiche Länge: sonst verschöben sich alle nachfolgenden Stellen — und die Fundstellen im
    // Befund zeigten auf etwas anderes als gemeint.
    expect(ergebnis.text.length).toBe(vorher.length)
    expect(ergebnis.text.startsWith('Anfang ')).toBe(true)
    expect(ergebnis.text.endsWith(' Ende')).toBe(true)
    // Und die Erlaubnis bezieht sich auf das ORIGINAL — nicht auf das Entschärfte.
    expect(ergebnis.erlaubnis.darfRaus).toBe(false)
  })

  test('mehrere Funde hintereinander werden alle ersetzt', () => {
    const w = waechter({ bekannteWerte: () => EINGETRAGEN })
    const ergebnis = w.entschaerfe(`${OR_WERT} und ${GROQ_WERT} und ${DB_WERT}`)
    expect(werteImText(ergebnis.text)).toEqual([])
    expect(ergebnis.treffer.length).toBe(3)
  })

  test('ein sauberer Text bleibt unverändert', () => {
    const sauber = 'nichts zu verbergen'
    expect(waechter().entschaerfe(sauber).text).toBe(sauber)
  })
})

// ---------------------------------------------------------------------------
// 4. Stufe 2 — das Urteil
// ---------------------------------------------------------------------------

/**
 * Ein Entscheider, der **vorgegebene** Werte liefert — und zählt, ob er gefragt wurde.
 *
 * @param antwort - was er antwortet
 * @returns der Entscheider und der Zähler
 */
function attrappe(antwort: {
  geheimnis: boolean
  sicherheit: number
  modell?: string
}): Entscheider & { readonly gefragt: () => number } {
  let gefragt = 0
  const entscheider: Entscheider = {
    async entscheide<T>(_eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
      gefragt += 1
      return {
        wert: { geheimnis: antwort.geheimnis, sicherheit: antwort.sicherheit } as T,
        herkunft: { anbieter: 'openrouter', modell: antwort.modell ?? 'google/gemini-3.8-flash' },
      }
    },
  }
  return Object.assign(entscheider, { gefragt: () => gefragt })
}

/** Die Schwellen des Aufrufers. */
const STUFEN = { automatisch: 0.9, rueckfrage: 0.5 }

describe('Stufe 2 — das Urteil', () => {
  test('sicher kein Geheimnis: der Text darf hinaus', async () => {
    const a = attrappe({ geheimnis: false, sicherheit: 0.97 })
    const befund = await waechter().pruefeMitUrteil('Ein ganz gewöhnlicher Satz.', {
      entscheider: a,
      stufen: STUFEN,
    })
    expect(befund.darfRaus).toBe(true)
    expect(befund.umgang).toBe('handeln')
    expect(befund.sicherheit).toBe(0.97)
    // Wer geantwortet hat, steht im Befund.
    expect(befund.herkunft?.modell).toBe('google/gemini-3.8-flash')
  })

  test('sicher ein Geheimnis: der Text bleibt hier', async () => {
    const a = attrappe({ geheimnis: true, sicherheit: 0.95 })
    const befund = await waechter().pruefeMitUrteil('irgendein Text', { entscheider: a, stufen: STUFEN })
    expect(befund.geheimnis).toBe(true)
    expect(befund.umgang).toBe('handeln')
    // **Gehandelt** wird hier mit „nicht hinausgeben": das Urteil ist sicher, nur die Richtung ist
    // die andere.
    expect(befund.darfRaus).toBe(false)
  })

  test('unsicher: es wird NICHT gehandelt', async () => {
    const a = attrappe({ geheimnis: false, sicherheit: 0.6 })
    const befund = await waechter().pruefeMitUrteil('irgendein Text', { entscheider: a, stufen: STUFEN })
    expect(befund.umgang).toBe('rueckfrage')
    expect(befund.darfRaus).toBe(false)
  })

  test('zu unsicher: zum Menschen — und der Text bleibt hier', async () => {
    const a = attrappe({ geheimnis: false, sicherheit: 0.2 })
    const befund = await waechter().pruefeMitUrteil('irgendein Text', { entscheider: a, stufen: STUFEN })
    expect(befund.umgang).toBe('mensch')
    expect(befund.darfRaus).toBe(false)
  })

  test('DER WICHTIGSTE FALL: bei einem Fund wird das Modell GAR NICHT gefragt', async () => {
    // Der Urteilende ist ein Anbieter im Netz. Ihm einen Text mit Schlüssel zu schicken heißt,
    // den Schlüssel zu verschicken — der Wächter würde das Leck verursachen, das er verhindern
    // soll. Deshalb wirft diese Attrappe, wenn sie gefragt wird.
    const a: Entscheider = {
      async entscheide<T>(_eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
        throw new Error('Bei einem Fund darf kein Modell gefragt werden — der Text würde das Haus verlassen.')
      },
    }
    const befund = await waechter({ bekannteWerte: () => EINGETRAGEN }).pruefeMitUrteil(LECK, {
      entscheider: a,
      stufen: STUFEN,
    })
    expect(befund.umgang).toBe('mensch')
    expect(befund.darfRaus).toBe(false)
    expect(befund.geheimnis).toBeUndefined()
    expect(befund.wegen).toContain('KEIN Modell gefragt')
    // Und die Meldung nennt keinen Wert.
    expect(werteImText(befund.wegen)).toEqual([])
  })

  test('auch bei einem Fund ohne eingetragene Werte wird nicht gefragt', async () => {
    const a = attrappe({ geheimnis: false, sicherheit: 0.99 })
    const befund = await waechter().pruefeMitUrteil(`x ${DB_WERT} y`, { entscheider: a, stufen: STUFEN })
    expect(a.gefragt()).toBe(0)
    expect(befund.darfRaus).toBe(false)
  })

  test('bei sauberem Text wird GENAU EINMAL gefragt', async () => {
    const a = attrappe({ geheimnis: false, sicherheit: 0.99 })
    await waechter().pruefeMitUrteil('sauber', { entscheider: a, stufen: STUFEN })
    expect(a.gefragt()).toBe(1)
  })
})
