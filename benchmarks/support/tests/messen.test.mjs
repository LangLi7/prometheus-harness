/**
 * Prüfungen für {@link module:benchmarks/support/messen}.
 *
 * **Warum die Meßbausteine geprüft werden und nicht nur die Benchmarks.** Ein
 * Benchmark ist eine Zahl mit einem Urteil. Ist die **Statistik** falsch, ist das
 * Urteil falsch — und zwar grün. Genau die Sorte Fehler, die monatelang niemand
 * bemerkt, weil ein Benchmark selten rot wird, wenn seine Grenze nie erreicht
 * wird.
 */
import { describe, expect, test } from 'bun:test'

import {
  alsGroesse,
  einmal,
  fuehreAus,
  messe,
  messeSpeicher,
  pruefeBudget,
  pruefeSkalierung,
  statistik,
} from '../messen.mjs'

describe('statistik', () => {
  test('rechnet die Grundwerte aus einer bekannten Reihe', () => {
    // 1..10: Median 5,5 · Minimum 1 · Maximum 10 · p95 = 10 (ceil(0.95*10)-1 = 9)
    const m = statistik([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(m.min).toBe(1)
    expect(m.max).toBe(10)
    expect(m.median).toBe(5.5)
    expect(m.p95).toBe(10)
    expect(m.laeufe).toBe(10)
  })

  test('ist unempfindlich gegen die Reihenfolge der Eingabe', () => {
    // Eine Statistik, die von der Eingabereihenfolge abhängt, ist keine.
    const a = statistik([5, 1, 9, 3, 7])
    const b = statistik([9, 7, 5, 3, 1])
    expect(a).toEqual(b)
  })

  test('verändert die übergebene Reihe nicht', () => {
    const reihe = [5, 1, 9]
    statistik(reihe)
    expect(reihe).toEqual([5, 1, 9])
  })

  test('der Median ist robuster als der Mittelwert — der ganze Grund für ihn', () => {
    // Neun Läufe um 10 ms und **ein** Ausreißer mit 1000 ms: der Mittelwert
    // wandert auf ~109 ms, der Median bleibt bei 10 ms. Auf einem gewöhnlichen
    // Rechner entstehen solche Ausreißer ständig (fremder Prozess,
    // Speicherbereinigung, Taktwechsel).
    const reihe = [10, 10, 10, 10, 10, 10, 10, 10, 10, 1000]
    const m = statistik(reihe)
    const mittel = reihe.reduce((s, x) => s + x, 0) / reihe.length
    expect(mittel).toBeGreaterThan(100)
    expect(m.median).toBe(10)
  })

  test('bei gerader Anzahl liegt der Median zwischen den beiden Mittleren', () => {
    expect(statistik([1, 2, 3, 4]).median).toBe(2.5)
  })

  test('ein einzelner Lauf ist erlaubt, aber die Streuung ist dann 0', () => {
    // Der Aufrufer sieht an `laeufe: 1`, daß er nicht auf die Streuung bauen darf.
    const m = statistik([7])
    expect(m.median).toBe(7)
    expect(m.streuung).toBe(0)
    expect(m.laeufe).toBe(1)
  })

  test('rechnet die Streuung als Stichprobenstreuung', () => {
    // Bei [2,4,4,4,5,5,7,9] ist die Stichprobenstreuung (N-1) ≈ 2,138.
    expect(statistik([2, 4, 4, 4, 5, 5, 7, 9]).streuung).toBeCloseTo(2.138, 2)
  })

  test('eine leere Reihe ist ein Fehler, keine Null', () => {
    // **Fail-loud.** Ein Benchmark ohne Läufe darf nicht „0 ms, alles gut"
    // melden — das wäre ein grünes Urteil ohne Messung.
    expect(() => statistik([])).toThrow(/mindestens eine Dauer/u)
  })

  test('unsinnige Werte werden abgelehnt, nicht mitgerechnet', () => {
    for (const schlecht of [[Number.NaN], [Number.POSITIVE_INFINITY], [-1], ['5']]) {
      expect(() => statistik(schlecht)).toThrow(/ungültige Dauer/u)
    }
  })

  test('eine Null ist ein gültiger Wert', () => {
    expect(statistik([0, 0, 0]).median).toBe(0)
  })
})

describe('einmal', () => {
  test('mißt eine bekannte Arbeit als positive Zahl', async () => {
    const dauer = await einmal(() => {
      let s = 0
      for (let i = 0; i < 100_000; i += 1) s += i
    })
    expect(dauer).toBeGreaterThan(0)
    expect(Number.isFinite(dauer)).toBe(true)
  })

  test('eine leere Arbeit ist nicht negativ', async () => {
    expect(await einmal(() => undefined)).toBeGreaterThanOrEqual(0)
  })

  test('eine werfende Arbeit wirft weiter — sie wird nicht verschluckt', async () => {
    // Ein verschluckter Fehler würde als „sehr schnell" gemessen.
    //
    // **Und ein asynchroner Fehler ebenso.** Seit `einmal` Versprechen abwartet:
    // eine Arbeit, die ein abgelehntes Versprechen liefert, muß **weiterwerfen**.
    // Würde sie verschluckt, meldete der Benchmark eine hervorragende Zahl für
    // eine Arbeit, die gar nicht gelaufen ist — genau der Fehler, der in
    // `session-open` dazu führte, daß `readSession` 0,00 ms maß.
    await expect(
      einmal(async () => {
        throw new Error('absichtlich')
      }),
    ).rejects.toThrow('absichtlich')
  })

  test('ein abgelehntes Versprechen wird NICHT als schnelle Messung verbucht', async () => {
    await expect(einmal(() => Promise.reject(new Error('abgelehnt')))).rejects.toThrow('abgelehnt')
  })
})

describe('messe', () => {
  test('wärmt auf und zählt die Aufwärmläufe nicht mit', async () => {
    let aufrufe = 0
    const m = await messe(
      () => {
        aufrufe += 1
      },
      { aufwaermen: 3, laeufe: 7 },
    )
    expect(aufrufe).toBe(10)
    expect(m.laeufe).toBe(7)
  })

  test('die Vorgaben sind fünf Aufwärmläufe und zwanzig Messungen', async () => {
    // **Der eigene Fehler, der hier stand.** Die Prüfung rief `messe(...)` ohne
    // `await` auf und sah danach **einen** Aufruf statt fünfundzwanzig — die
    // Funktion ist asynchron, und ohne `await` war sie nach der ersten Zeile
    // „fertig". Derselbe Fehler, den `einmal` im Betrieb erzeugt hätte und gegen
    // den die Aufwärmphase und das Warten gebaut sind: er versteckt sich in der
    // Prüfung genauso wie im Benchmark.
    let aufrufe = 0
    const m = await messe(() => {
      aufrufe += 1
    })
    expect(aufrufe).toBe(25)
    expect(m.laeufe).toBe(20)
  })

  test('die Aufwärmphase senkt den gemessenen Wert — der gemessene JIT-Effekt', async () => {
    // **Der Befund aus dem Dateikopf, hier als Prüfung.** Ohne Aufwärmen ist der
    // erste Lauf deutlich teurer als die folgenden. Diese Prüfung hält fest, daß
    // die Aufwärmphase überhaupt etwas bewirkt — wäre sie wirkungslos, könnte man
    // sie weglassen und der Benchmark wäre einfacher.
    //
    // **Der eigene Fehler, der hier stand.** `messe` wurde ohne `await` gerufen;
    // `mit` war ein Versprechen, und der Vergleich zweier Versprechen scheiterte
    // an „Expected and actual values must be numbers". Eine Prüfung, die ihren
    // eigenen Gegenstand nicht abwartet, prüft ihn nicht.
    const arbeit = () => {
      let s = 0
      for (let i = 0; i < 200_000; i += 1) s += i % 7
      return s
    }
    // Der erste Lauf **ohne** Aufwärmen: genau der Wert, den ein Benchmark ohne
    // Aufwärmphase als Median bekommen würde.
    const ersterLauf = await einmal(arbeit)
    const mit = await messe(arbeit, { aufwaermen: 5, laeufe: 5 })
    expect(typeof mit.median).toBe('number')
    expect(mit.median).toBeLessThanOrEqual(ersterLauf)
  })
})

describe('pruefeBudget', () => {
  const messung = statistik([10, 11, 12, 13, 14])

  test('unter der Grenze ist grün', () => {
    const r = pruefeBudget({ name: 'x', grenzeMs: 20 }, messung)
    expect(r.ok).toBe(true)
    expect(r.text).toMatch(/^ok/u)
  })

  test('über der Grenze ist rot', () => {
    const r = pruefeBudget({ name: 'x', grenzeMs: 5 }, messung)
    expect(r.ok).toBe(false)
    expect(r.text).toMatch(/^ROT/u)
  })

  test('prüft den Median, nicht das Maximum', () => {
    // Der Median dieser Reihe ist 12. Gegen 13 ist das grün, obwohl das Maximum
    // 14 ist — und genau das ist gewollt: ein Budget auf das Maximum wäre ein
    // Budget auf den schlechtesten Lauf auf einem beliebigen Rechner.
    const r = pruefeBudget({ name: 'x', grenzeMs: 13 }, messung)
    expect(r.ok).toBe(true)
  })

  test('mit `wert` läßt sich gegen das 95. Perzentil prüfen', () => {
    const r = pruefeBudget({ name: 'x', grenzeMs: 13, wert: (m) => m.p95 }, messung)
    expect(r.ok).toBe(false)
  })

  test('der Text nennt Wert, Streuung, Läufe und Grenze', () => {
    // Eine Zahl ohne Streuung ist eine Behauptung. Der Text muß sie tragen.
    const r = pruefeBudget({ name: 'Session öffnen', grenzeMs: 20, warum: 'Nutzerpfad' }, messung)
    expect(r.text).toContain('Session öffnen')
    expect(r.text).toContain('Streuung')
    expect(r.text).toContain('5 Läufe')
    expect(r.text).toContain('20.00 ms')
  })

  test('die Begründung wird durchgereicht', () => {
    const r = pruefeBudget({ name: 'x', grenzeMs: 1, warum: 'weil es ein Nutzerpfad ist' }, messung)
    expect(r.warum).toBe('weil es ein Nutzerpfad ist')
  })
})

describe('pruefeSkalierung', () => {
  /**
   * Eine Messung, die **vorgegebene** Dauern liefert.
   *
   * **Warum hier nicht echt gemessen wird.** Diese Prüfungen standen in `bun test`
   * und maßen 2.000.000 gegen 20.000.000 Einträge — **echt**. Gemessen am
   * 13.10.2026: `bun test` läuft über 30 Dateien **gleichzeitig**, der
   * Speicherdruck verschob den Median der großen Messung, und dieselbe
   * unveränderte Datei war einmal grün und einmal rot (`0 fail` im ersten Lauf,
   * `pruefeSkalierung > lineare Arbeit skaliert grün` rot im zweiten, 828 ms).
   *
   * Ein Test, dessen Ergebnis von der Auslastung des Rechners abhängt, prüft den
   * Rechner und nicht den Code. Geprüft wird hier deshalb das **Urteil** gegen
   * bekannte Zahlen; die **echte** Messung steht als Gate
   * `benchmarks/messtechnik/lauf.mjs`, wo rot ein Befund ist statt ein Fehler im
   * Testlauf.
   *
   * **Was hier bewußt NICHT passiert: das Urteil wird nicht abgeschwächt.** Die
   * Grenzen sind dieselben (Vorgabetoleranz 1,25, Mindestdauer 1 ms); nur die
   * Zahlen, gegen die sie greifen, sind vorgegeben statt gemessen.
   */
  const vorgegeben = (kleinMs, grossMs) => {
    // **Nach Aufrufreihenfolge, nicht nach Werten geraten.** `pruefeSkalierung`
    // mißt erst die kleine, dann die große Eingabe. Eine Attrappe, die den
    // Körper ansieht, würde raten; eine, die mitzählt, weiß es. Sie zählt auch
    // mit, **wie oft** sie gerufen wurde — sonst wäre nicht zu sehen, ob der
    // Einspeisepunkt überhaupt zweimal benutzt wird.
    let aufrufe = 0
    const attrappe = async () => {
      aufrufe += 1
      if (aufrufe > 2) throw new Error(`messen wurde ${String(aufrufe)}-mal gerufen — erwartet sind zwei`)
      return statistik([aufrufe === 1 ? kleinMs : grossMs])
    }
    attrappe.aufrufe = () => aufrufe
    return attrappe
  }

  /** Der Körper wird bei eingeschalteter Messung nie gerufen — das ist Absicht. */
  const nieGerufen = () => () => {
    throw new Error('der Körper darf bei vorgegebener Messung nicht laufen')
  }

  test('lineare Arbeit skaliert grün', async () => {
    // Eingabe ×10, Zeit ×10 — genau linear, also unter der Grenze ×12,5.
    const messen = vorgegeben(4, 40)
    const r = await pruefeSkalierung({
      von: 2_000_000,
      bis: 20_000_000,
      koerper: nieGerufen,
      messen,
    })
    expect(r.text).not.toContain('nicht beurteilbar')
    expect(r.ok).toBe(true)
    expect(r.text).toMatch(/^ok/u)
    expect(r.klein.median).toBe(4)
    expect(r.gross.median).toBe(40)
    expect(messen.aufrufe()).toBe(2)
  })

  test('eine zu kurze kleine Messung wird als nicht beurteilbar gemeldet', async () => {
    // **Der Befund, der diese Grenze erzwungen hat.** Bei 0,15 ms für die kleine
    // Eingabe schwankte dasselbe Programm zwischen ×8,81 und ×16,05 — und die
    // Prüfung war zweimal rot und einmal grün. Eine Prüfung, die von der Last des
    // Rechners abhängt, wird abgeschaltet statt beachtet.
    const r = await pruefeSkalierung({
      von: 100,
      bis: 1_000,
      koerper: nieGerufen,
      messen: vorgegeben(0.15, 1.5),
    })
    expect(r.ok).toBe(false)
    expect(r.text).toContain('nicht beurteilbar')
    expect(r.text).toContain('Größere Eingabe')
  })

  test('quadratische Arbeit wird rot — der Fehler, den das fangen soll', async () => {
    // **Warum diese Prüfung der Kern der Sache ist.** Eine quadratische Umsetzung
    // ist bei zwanzig Einträgen schnell und bei zwanzigtausend unbrauchbar. Ein
    // Zeitbudget für eine feste Eingabegröße fängt das nie. Eingabe ×10, Zeit
    // ×100 — weit über der Grenze ×12,5.
    const r = await pruefeSkalierung({
      von: 300,
      bis: 3_000,
      koerper: nieGerufen,
      messen: vorgegeben(2, 200),
    })
    expect(r.ok).toBe(false)
    expect(r.text).toMatch(/^ROT/u)
  })

  test('genau auf der Grenze ist noch grün, ein Deut darüber nicht', async () => {
    // **Beide Seiten der Grenze, sonst prüft die Prüfung nur eine.** Grenze ist
    // ×10 × 1,25 = ×12,5. Die Zahlen sind so gewählt, daß die Grenze exakt
    // getroffen bzw. überschritten wird — kein Rauschen, keine Ausrede.
    const knapp = await pruefeSkalierung({
      von: 1,
      bis: 10,
      koerper: nieGerufen,
      messen: vorgegeben(1, 12.5),
    })
    expect(knapp.verhaeltnis).toBe(12.5)
    expect(knapp.ok).toBe(true)

    const drueber = await pruefeSkalierung({
      von: 1,
      bis: 10,
      koerper: nieGerufen,
      messen: vorgegeben(1, 12.6),
    })
    expect(drueber.verhaeltnis).toBeCloseTo(12.6, 5)
    expect(drueber.ok).toBe(false)
  })

  test('die Toleranz ist einstellbar und wirkt', async () => {
    // Ohne diese Prüfung wäre nicht zu sehen, ob der zweite Parameter überhaupt
    // ankommt. ×12,6 ist gegen die Vorgabe rot und gegen Toleranz 1,3 grün.
    const streng = await pruefeSkalierung(
      { von: 1, bis: 10, koerper: nieGerufen, messen: vorgegeben(1, 12.6) },
      1.3,
    )
    expect(streng.ok).toBe(true)
    expect(streng.text).toContain('erlaubt ×13.00')
  })

  test('ohne `messen` wird wirklich gemessen — die Vorgabe ist die echte Messung', async () => {
    // **Die Gegenprobe zum Einspeisen.** Wenn `messen` versehentlich immer
    // gesetzt wäre, wären alle Prüfungen darüber grün und der Benchmark maß
    // nichts. Hier läuft der Körper wirklich, und die Zahl kommt von der Uhr.
    //
    // **Warum hier kein Urteil geprüft wird.** Diese Prüfung fragt nicht, ob die
    // Arbeit schnell genug ist — das hinge wieder an der Auslastung. Sie fragt,
    // ob der **echte** Weg überhaupt genommen wurde: der Körper lief, und die
    // Zahl hat mehr als einen Lauf gesehen.
    let gerufen = 0
    const r = await pruefeSkalierung({
      von: 1_000_000,
      bis: 10_000_000,
      koerper: (n) => () => {
        gerufen += 1
        const a = new Array(n)
        for (let i = 0; i < n; i += 1) a[i] = i % 251
        let s = 0
        for (let i = 0; i < n; i += 1) s += a[i]
        return s
      },
      aufwaermen: 2,
      laeufe: 3,
    })
    // 2 Aufwärmläufe + 3 Messungen, zweimal (klein und groß).
    expect(gerufen).toBe(10)
    expect(r.klein.laeufe).toBe(3)
    expect(r.gross.laeufe).toBe(3)
    expect(r.klein.median).toBeGreaterThan(0)
    expect(r.gross.median).toBeGreaterThan(0)
    // Beide Zweige des Urteils tragen das Wort — geprüft wird, daß ein Urteil
    // gefällt wurde, nicht welches.
    expect(r.text).toContain('Skalierung')
  })

  test('der Text nennt beide Verhältnisse', async () => {
    const r = await pruefeSkalierung({
      von: 2_000_000,
      bis: 20_000_000,
      koerper: nieGerufen,
      messen: vorgegeben(4, 40),
    })
    expect(r.text).toContain('Eingabe ×10.0')
    expect(r.text).toContain('erlaubt ×')
    // Die beiden gemessenen Werte stehen im Text — sonst ist das Verhältnis
    // nicht nachprüfbar.
    expect(r.text).toMatch(/\d+\.\d+ → \d+\.\d+ ms/u)
  })
})

describe('messeSpeicher', () => {
  test('ohne --expose-gc wird gemeldet, nicht gerechnet', () => {
    // **Fail-loud statt erfundene Zahl.** Eine erfundene Speicherzahl ist
    // schlimmer als keine: sie sieht aus wie ein Ergebnis.
    const r = messeSpeicher(() => undefined)
    if (typeof globalThis.gc === 'function') {
      expect(r.verfuegbar).toBe(true)
    } else {
      expect(r.verfuegbar).toBe(false)
      expect(r.hinweis).toContain('--expose-gc')
      expect(r.zuwachsBytes).toBe(0)
    }
  })
})

describe('alsGroesse', () => {
  test('formt Bytes, Kilobytes und Megabytes', () => {
    expect(alsGroesse(512)).toBe('512 B')
    expect(alsGroesse(2048)).toBe('2,0 kB')
    expect(alsGroesse(1024 * 1024 * 3)).toBe('3,0 MB')
  })

  test('negative Werte behalten das Vorzeichen', () => {
    // Ein negativer Zuwachs heißt: mehr freigegeben als belegt. Das ist ein
    // Ergebnis und darf nicht als Betrag erscheinen.
    expect(alsGroesse(-2048)).toBe('-2,0 kB')
  })
})

describe('fuehreAus', () => {
  test('zählt rote Teile und setzt den Exit-Code darüber', async () => {
    const zeilen = []
    const rot = await fuehreAus(
      'Probe',
      [() => ({ ok: true, text: 'ok   eins' }), () => ({ ok: false, text: 'ROT  zwei' })],
      { schreibe: (t) => zeilen.push(t) },
    )
    expect(rot).toBe(1)
    expect(zeilen.join('')).toContain('1 Befund(e)')
  })

  test('ein werfender Teil wird gezählt, nicht durchgereicht', async () => {
    // Sonst reißt ein einzelner Fehler den ganzen Lauf mit, und die übrigen
    // Messungen fehlen — man sieht nur den Absturz, nicht die Zahlen.
    const zeilen = []
    const rot = await fuehreAus(
      'Probe',
      [
        () => {
          throw new Error('absichtlich kaputt')
        },
        () => ({ ok: true, text: 'ok   danach' }),
      ],
      { schreibe: (t) => zeilen.push(t) },
    )
    expect(rot).toBe(1)
    expect(zeilen.join('')).toContain('absichtlich kaputt')
    expect(zeilen.join('')).toContain('ok   danach')
  })

  test('nennt die Laufzeit — eine Zahl ohne Laufzeit ist nicht vergleichbar', () => {
    const zeilen = []
    fuehreAus('Probe', [], { schreibe: (t) => zeilen.push(t) })
    expect(zeilen.join('')).toContain(process.version)
    expect(zeilen.join('')).toContain(process.platform)
  })
})
