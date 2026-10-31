/**
 * **Die KI-Rangliste — was sie zeigt und was sie sagt, wenn sie nichts zeigen kann.**
 *
 * ## Warum diese Prüfung so aufgebaut ist
 *
 * Die Ansicht liest **über das Netz**. Zwei Dinge sind deshalb nicht mit einem Browser zu prüfen und
 * trotzdem das Wichtigste:
 *
 *   1. **Was bei einer gültigen Antwort im Bild steht** — Rang, Familie, Modell, Kostenart, Preis und
 *      die bevorzugte Wahl samt Begründung.
 *   2. **Was bei einer Antwort steht, die es nicht gibt**: 401, 503, ein Netzfehler, Unsinn. Der
 *      Unterschied zwischen „es gibt nichts" und „ich kam nicht heran" ist die ganze Aussage dieser
 *      Ansicht — wer beides gleich malt, schickt den Leser an die falsche Stelle.
 *   3. **Daß die Oberfläche sie überhaupt anbietet.** Alles andere hier prüft eine Funktion; ohne
 *      diese eine Prüfung wäre die Ansicht gebaut, geprüft — und unerreichbar.
 *
 * Beides ist **ohne** Browser prüfbar, weil die Ansicht ihr Dokument **gereicht bekommt**
 * (`Rangumgebung.dokument`) und ihren Abruf ebenso (`Rangumgebung.hole`). Der Knoten unten ist
 * deshalb klein: er kann anhängen, leeren und Text tragen — mehr verlangt die Ansicht nicht.
 *
 * **Was hier NICHT geprüft wird.** Daß es im Browser gut **aussieht** (Abstände, Umbruch in einer
 * 280 px breiten Spalte) — das ist eine Aussage über gerenderte Bilder und gehört in die Messung mit
 * einem echten Browser, nicht in diese Datei.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RANGLISTE_PFAD,
  alsKostenart,
  alsStand,
  istPreisBekannt,
  ladeRangliste,
  preisText,
  pruefeAntwort,
} from '../src/ai-rangliste'
import {
  GRUENDE_ANZEIGE,
  fuelleRangliste,
  maleGrund,
  maleRangliste,
  merkerChips,
  zahlenAus,
} from '../src/rang-ansicht'
import { registerBuiltinPlugins } from '../src/builtin-plugins'
import type { HostServices } from '../src/builtin-plugins'
import { PluginRegistry } from '../src/plugins'
import { de } from '../src/locales/de'
import type { Antwortartig, Rangantwort, Ranglisteneintrag, Rangumgebung } from '../src/ai-rangliste'

// ---------------------------------------------------------------------------
// Ein winziges DOM — nur für diese Prüfung
// ---------------------------------------------------------------------------

/**
 * Ein Knoten, der anhängen, leeren und Text tragen kann.
 *
 * **Warum kein fremder Stub.** `dom-stub.ts` baut die **Hülle** nach und stellt dabei globale Namen
 * auf (`document`, `window`, `MutationObserver`). Für diese Ansicht wird nichts davon gebraucht: sie
 * bekommt ihr Dokument gereicht. Ein Stub, der mehr kann als nötig, verdeckt mehr als er prüft — und
 * ein zweiter globaler `document` in einem Lauf, in dem schon einer steht, ist genau die Sorte
 * Nebenwirkung, die `dom-stub.ts` in seinem Kopf beschreibt.
 */
interface Knoten {
  tagName: string
  className: string
  textContent: string
  title: string
  type: string
  hidden: boolean
  dataset: Record<string, string>
  attributes: Record<string, string>
  isConnected: boolean
  children: Knoten[]
  appendChild: (kind: Knoten) => void
  append: (...kinder: Knoten[]) => void
  replaceChildren: (...kinder: Knoten[]) => void
  setAttribute: (name: string, wert: string) => void
  getAttribute: (name: string) => string | undefined
  addEventListener: (typ: string, rueckruf: () => void) => void
  klick: () => void
  readonly vollerText: string
}

/** Die Rückrufe der Prüfknoten — ein Klick ist im Stub ein Aufruf, kein Ereignis. */
const klickRueckrufe = new WeakMap<Knoten, () => void>()

function knoten(tagName = 'div'): Knoten {
  const el: Knoten = {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    title: '',
    type: '',
    hidden: false,
    dataset: {},
    attributes: {},
    isConnected: true,
    children: [],
    appendChild(kind) {
      el.children.push(kind)
    },
    append(...kinder) {
      el.children.push(...kinder)
    },
    replaceChildren(...kinder) {
      el.children = kinder
    },
    setAttribute(name, wert) {
      el.attributes[name] = wert
    },
    getAttribute(name) {
      return el.attributes[name]
    },
    addEventListener(typ, rueckruf) {
      if (typ === 'click') el.attributes['data-klick'] = '1'
      el.attributes[`data-${typ}`] = '1'
      klickRueckrufe.set(el, rueckruf)
    },
    klick() {
      klickRueckrufe.get(el)?.()
    },
    get vollerText(): string {
      return [el.textContent, ...el.children.map((kind) => kind.vollerText)].join(' ').replace(/\s+/g, ' ').trim()
    },
  }
  return el
}

/** Das Dokument, das die Ansicht gereicht bekommt. */
function dokumentStub(): Document {
  return { createElement: (tag: string) => knoten(tag) } as unknown as Document
}

/** Alle Knoten unterhalb — damit eine Prüfung eine Klasse **suchen** kann statt sie zu raten. */
function alle(wurzel: Knoten): readonly Knoten[] {
  return wurzel.children.flatMap((kind) => [kind, ...alle(kind)])
}

/** Alle Knoten mit dieser Klasse. */
function nachKlasse(wurzel: Knoten, klasse: string): readonly Knoten[] {
  return alle(wurzel).filter((k) => k.className.split(/\s+/).includes(klasse))
}

// ---------------------------------------------------------------------------
// Ein Dienst zum Anfassen
// ---------------------------------------------------------------------------

/** Die angefragten Pfade des letzten Abrufs — die Ansicht soll den richtigen fragen. */
let gefragt: string[] = []

/** Ein Abruf, der eine feste Antwort gibt — oder wirft, wenn ein Netzfehler geprüft wird. */
function abruf(antwort: Antwortartig | Error): (pfad: string) => Promise<Antwortartig> {
  return async (pfad) => {
    gefragt.push(pfad)
    if (antwort instanceof Error) throw antwort
    return antwort
  }
}

/** Eine Antwort, wie sie der Dienst gibt: ein Status und ein Körper. */
function dienst(koerper: unknown, status = 200): Antwortartig {
  const text = typeof koerper === 'string' ? koerper : JSON.stringify(koerper)
  return { ok: status >= 200 && status < 300, status, text: async () => text }
}

/** Die Umgebung einer Prüfung: ein Dokument und ein Abruf. */
function umgebung(antwort: Antwortartig | Error, dokument: Document = dokumentStub()): Rangumgebung {
  return { hole: abruf(antwort), dokument }
}

// ---------------------------------------------------------------------------
// Eine gültige Antwort — die Vorlage aller Anzeigeprüfungen
// ---------------------------------------------------------------------------

/**
 * Ein Kandidat, wie der Dienst ihn nennt.
 *
 * **Die Abweichung ist ein `Record`, und das ist Absicht.** Der Dienst schickt **JSON**: er kann
 * einen Wert nennen, den diese Ansicht nicht kennt (`kostenart: 'gratis'`), und er kann ein Feld
 * **weglassen** (`modell`). Eine Vorlage, die nur gültige Werte zuließe, könnte genau die beiden
 * Fälle nicht bauen, um die es hier geht — geprüft wird die **Anzeige**, nicht der Dienst.
 *
 * @param patch - was von der Vorlage abweicht
 * @returns der Kandidat
 */
function eintrag(patch: Record<string, unknown> = {}): Ranglisteneintrag {
  const basis: Ranglisteneintrag = {
    rang: 1,
    faehigkeit: 'text',
    familie: 'openrouter',
    familienname: 'OpenRouter',
    modell: 'openai/gpt-4o-mini',
    verdrahtet: true,
    funktionalitaet: 'vorhanden',
    kostenart: 'kostenpflichtig',
    preis: { hinein: 0.15, heraus: 0.6 },
    gemessenAm: '2026-10-15',
    veraltet: false,
    gruende: [
      'Verdrahtet: der Anbieter „openrouter" nennt diese Fähigkeit selbst.',
      'Weg gemessen vorhanden (2026-10-15).',
      'Preis GEMESSEN: 0.15 / 0.60 USD je 1 Mio Token — die Messung schlägt die Tabelle.',
      'Freibetrag: 1000 Anfragen — Beleg: AGB.',
    ],
  }
  return { ...basis, ...patch } as Ranglisteneintrag
}

/**
 * **Die bevorzugte Wahl ist eine ZWEITE KOPIE desselben Eintrags** — und das ist Absicht.
 *
 * Über JSON gibt es keine gemeinsamen Objekte: der Dienst schreibt `empfehlung` als eigenes Objekt
 * mit denselben Werten. Eine Anzeige, die ihren Eintrag mit `===` sucht, findet ihn deshalb **nie**
 * — und die Marke „bevorzugt" stünde nie im Bild. Genau dieser Fall steht hier.
 */
const GUELTIG = {
  status: 'ok',
  service: '@prometheus-harness/ai-ranking',
  zahlen: { eintraege: 4, verdrahtet: 2, gemessen: 2, kostenlos: 1, ohnePreis: 1 },
  rangliste: {
    erstelltAm: '2026-10-16T09:00:00.000Z',
    listen: [
      {
        faehigkeit: 'text',
        name: 'Text',
        eintraege: [
          eintrag(),
          eintrag({
            rang: 2,
            familie: 'local',
            familienname: 'Lokal',
            modell: 'qwen2.5:7b',
            kostenart: 'kostenlos',
            preis: { hinein: 0, heraus: 0 },
            gruende: ['Verdrahtet: der Anbieter „local" nennt diese Fähigkeit selbst.'],
          }),
          // **Ohne Modell und ohne Preis** — der Fall, der nie als „leer" erscheinen darf.
          // `modell: undefined` fällt beim Weg über JSON heraus; genau so kommt es an.
          eintrag({
            rang: 3,
            familie: 'beispiel',
            familienname: 'Beispiel',
            modell: undefined,
            verdrahtet: false,
            funktionalitaet: 'unbekannt',
            kostenart: 'unbekannt',
            preis: { hinein: -1, heraus: -1 },
            veraltet: true,
            gruende: ['NICHT verdrahtet: es gibt keine Umsetzung „beispiel", die diese Fähigkeit nennt.'],
          }),
          eintrag({ rang: 4, familie: 'fremd', familienname: 'Fremd', modell: 'mistral-nemo', kostenart: 'gratis' }),
        ],
        empfehlung: eintrag(),
      },
      {
        faehigkeit: 'bild',
        name: 'Bild',
        eintraege: [eintrag({ rang: 1, faehigkeit: 'bild', familie: 'beispiel', familienname: 'Beispiel', verdrahtet: false, funktionalitaet: 'unbekannt' })],
        ohneEmpfehlung: 'Kein Eintrag ist verdrahtet: es gibt keine Umsetzung, die diese Fähigkeit mit dieser Familie verbindet.',
      },
    ],
    hinweise: ['Es ist KEIN Katalog gereicht worden. Damit ist jede Fähigkeit `unbekannt`.'],
  },
}

/** Die Vorlage ohne das Modell des dritten Eintrags — `undefined` fällt aus JSON heraus. */
function ohneModell(): unknown {
  return JSON.parse(JSON.stringify(GUELTIG))
}

// ---------------------------------------------------------------------------
// 1. Der Abruf
// ---------------------------------------------------------------------------

describe('der Abruf', () => {
  test('eine gültige Antwort wird gelesen — und der richtige Pfad gefragt', async () => {
    gefragt = []
    const ladung = await ladeRangliste(umgebung(dienst(GUELTIG)))
    expect(ladung.art).toBe('ok')
    if (ladung.art !== 'ok') return
    expect(ladung.antwort.rangliste.listen).toHaveLength(2)
    expect(ladung.antwort.rangliste.listen[0]?.eintraege).toHaveLength(4)
    expect(ladung.antwort.rangliste.listen[0]?.empfehlung?.rang).toBe(1)
    expect(ladung.antwort.zahlen?.ohnePreis).toBe(1)
    expect(gefragt).toEqual([RANGLISTE_PFAD])
  })

  test('ein Netzfehler wird zum Grund — nicht zu einer Ausnahme', async () => {
    const ladung = await ladeRangliste(umgebung(new Error('Failed to fetch')))
    expect(ladung.art).toBe('fehler')
    if (ladung.art !== 'fehler') return
    expect(ladung.grund).toContain('nicht erreichbar')
    expect(ladung.grund).toContain('Failed to fetch')
    // **Der Pfad steht im Satz** — sonst sucht der Leser an der falschen Stelle.
    expect(ladung.grund).toContain(RANGLISTE_PFAD)
  })

  test('401 nennt die Anmeldung, 403 die Herkunft, 503 den fehlenden Dienst', async () => {
    const eins = await ladeRangliste(umgebung(dienst({ status: 'error', error: 'unauthenticated' }, 401)))
    const drei = await ladeRangliste(umgebung(dienst({ status: 'error', error: 'untrusted_origin' }, 403)))
    const fuenf = await ladeRangliste(umgebung(dienst({ status: 'error', error: 'unavailable' }, 503)))
    const gruende = [eins, drei, fuenf].map((ladung) => (ladung.art === 'fehler' ? ladung.grund : ''))
    expect(gruende[0]).toContain('HTTP 401')
    expect(gruende[0]).toContain('Anmeldung')
    // **Der eigene Begriff des Dienstes wird mitgenannt** — er ist das, was im Protokoll steht.
    expect(gruende[0]).toContain('unauthenticated')
    expect(gruende[1]).toContain('HTTP 403')
    expect(gruende[1]).toContain('Herkunft')
    expect(gruende[2]).toContain('HTTP 503')
    expect(gruende[2]).toContain('nicht verbunden')
    expect(gruende.join(' ')).not.toContain('undefined')
  })

  test('ein Körper, der kein JSON ist, wird als solcher benannt', async () => {
    const ladung = await ladeRangliste(umgebung(dienst('<html>Tor oder Fehler</html>')))
    expect(ladung.art).toBe('fehler')
    if (ladung.art !== 'fehler') return
    expect(ladung.grund).toContain('kein JSON')
  })

  test('ein falscher Aufbau wird benannt statt halb angezeigt', async () => {
    const faelle: readonly (readonly [unknown, string])[] = [
      [[], 'kein Objekt'],
      [{}, 'keine `rangliste`'],
      [{ rangliste: {} }, 'fehlt `listen`'],
      [{ rangliste: { listen: [{}] } }, 'weder `name` noch `faehigkeit`'],
      [{ rangliste: { listen: [{ name: 'Text', eintraege: 'nein' }] } }, 'fehlt `eintraege`'],
      [{ rangliste: { listen: [{ name: 'Text', eintraege: [{}] }] } }, 'keinen lesbaren Rang'],
      [{ rangliste: { listen: [{ name: 'Text', eintraege: [{ rang: 1 }] }] } }, 'keinen Familiennamen'],
      [{ rangliste: { listen: [] }, zahlen: { eintraege: 1 } }, 'In `zahlen` fehlt'],
    ]
    const fehler: string[] = []
    for (const [koerper, erwartet] of faelle) {
      const geprueft = pruefeAntwort(koerper)
      if (geprueft.art !== 'fehler') fehler.push(`${JSON.stringify(koerper)} wurde ANGENOMMEN`)
      else if (!geprueft.grund.includes(erwartet)) fehler.push(`${erwartet} fehlt in: ${geprueft.grund}`)
    }
    expect(fehler.join('\n')).toBe('')
  })

  test('was Beiwerk ist, darf fehlen — ohne daß die Liste verschwindet', () => {
    const geprueft = pruefeAntwort({ rangliste: { listen: [{ faehigkeit: 'text', eintraege: [{ rang: 1, familie: 'a' }] }] } })
    expect(geprueft.art).toBe('ok')
    if (geprueft.art !== 'ok') return
    // Kein `name`, kein `erstelltAm`, kein `zahlen`, kein `hinweise` — und trotzdem eine Liste.
    expect(geprueft.antwort.rangliste.listen[0]?.name).toBe('text')
    expect(geprueft.antwort.rangliste.erstelltAm).toBe('')
    expect(geprueft.antwort.zahlen).toBeUndefined()
    expect(geprueft.antwort.rangliste.hinweise).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. Was im Bild steht
// ---------------------------------------------------------------------------

describe('die Anzeige', () => {
  test('die Liste steht im Bild: je Fähigkeit die Kandidaten mit Rang, Familie, Modell', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(GUELTIG)))
    expect(nachKlasse(host, 'rang-faehigkeit')).toHaveLength(2)
    expect(nachKlasse(host, 'rang-eintrag')).toHaveLength(5)
    expect(nachKlasse(host, 'rang-titel').map((k) => k.vollerText)).toEqual(['Text', 'Bild'])
    expect(nachKlasse(host, 'rang-platz').map((k) => k.vollerText)).toEqual(['01', '02', '03', '04', '01'])
    expect(host.vollerText).toContain('OpenRouter')
    expect(host.vollerText).toContain('openai/gpt-4o-mini')
    expect(host.vollerText).toContain('kostenpflichtig')
    expect(host.vollerText).toContain('0.15')
    expect(host.vollerText).toContain('0.60')
    // Die Zahlen des Dienstes stehen als Kacheln über der Liste, die Quelle im Kopf.
    expect(nachKlasse(host, 'rang-zahlen')[0]?.vollerText).toContain('4 Kandidaten')
    expect(nachKlasse(host, 'rang-quelle')[0]?.vollerText).toBe(`GET ${RANGLISTE_PFAD}`)
  })

  test('die bevorzugte Wahl steht mit ihrer Begründung da', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(GUELTIG)))
    const block = nachKlasse(host, 'rang-empfehlung')[0]
    expect(block?.vollerText).toContain('Bevorzugt')
    expect(block?.vollerText).toContain('OpenRouter')
    expect(block?.vollerText).toContain('openai/gpt-4o-mini')
    expect(block?.vollerText).toContain('kostenpflichtig')
    expect(block?.vollerText).toContain('Weg gemessen vorhanden')
    // Die Begründung ist ein Satz, keine Zahl — und sie kommt vom Dienst, nicht aus dieser Datei.
    expect(block?.vollerText).toContain('die Messung schlägt die Tabelle')
    // **Und ein Hinweis auf das, was nicht gezeigt wird.** Vier Gründe, drei passen in die Zeile.
    expect(GRUENDE_ANZEIGE).toBe(3)
    expect(block?.vollerText).toContain('und 1 weitere Gründe')
    // Der bevorzugte Eintrag der Fähigkeit ist **markiert** — und zwar genau einer.
    const markiert = nachKlasse(host, 'rang-eintrag').filter((zeile) => zeile.dataset['bevorzugt'] === '1')
    expect(markiert).toHaveLength(1)
    expect(markiert[0]?.dataset['rang']).toBe('1')
  })

  test('ohne Empfehlung steht der GRUND des Dienstes da — und keine leere Stelle', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(GUELTIG)))
    const ohne = nachKlasse(host, 'rang-empfehlung').filter((k) => k.dataset['ohne'] === '1')
    expect(ohne).toHaveLength(1)
    expect(ohne[0]?.vollerText).toContain('Bevorzugt')
    expect(ohne[0]?.vollerText).toContain('KEINE')
    expect(ohne[0]?.vollerText).toContain('Kein Eintrag ist verdrahtet')
  })

  test('ein Eintrag OHNE Modell sagt das — er zeigt kein leeres Feld', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(ohneModell())))
    const modelle = nachKlasse(host, 'rang-modell').map((k) => k.vollerText)
    expect(modelle).toContain('kein Modell genannt')
    // Genau **ein** Eintrag hat kein Modell — die anderen vier tragen ihres.
    expect(modelle.filter((m) => m === 'kein Modell genannt')).toHaveLength(1)
  })

  test('ein unbekannter Preis heißt „unbekannt" — nicht 0.00 und nicht -1.00', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(ohneModell())))
    const zeilen = nachKlasse(host, 'rang-eintrag')
    const dritte = zeilen[2]
    expect(dritte?.dataset['rang']).toBe('3')
    /*
     * **Geprüft wird das PREISFELD, nicht die Zeile.** Der erste Anlauf suchte `-1` in der ganzen
     * Zeile — und fand es im Datum (`gemessen am 2026-10-15`). Ein Test, der irgendwo trifft, prüft
     * irgendwo; dieser hier nennt den Wert, der dastehen soll.
     */
    expect(nachKlasse(dritte ?? knoten(), 'rang-kosten')[0]?.vollerText).toContain('unbekannt')
    expect(dritte?.vollerText).not.toContain('0.00')
    expect(dritte?.vollerText).not.toContain('-1.00')
  })

  test('ein gemessener Preis von 0.00 bleibt 0.00 — „unbekannt" wird nicht zum Vorwand', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(ohneModell())))
    const zweite = nachKlasse(host, 'rang-eintrag')[1]
    expect(zweite?.dataset['rang']).toBe('2')
    expect(zweite?.vollerText).toContain('kostenlos')
    expect(zweite?.vollerText).toContain('0.00')
  })

  test('eine Kostenart, die diese Ansicht nicht kennt, gilt als unbekannt — nicht als kostenlos', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(ohneModell())))
    const vierte = nachKlasse(host, 'rang-eintrag')[3]
    expect(vierte?.dataset['rang']).toBe('4')
    // Der Dienst hat `kostenart: 'gratis'` geschickt — eine Angabe, die es nicht gibt.
    expect(vierte?.vollerText).toContain('unbekannt')
    expect(vierte?.vollerText).not.toContain('kostenlos')
    expect(alsKostenart('gratis')).toBe('unbekannt')
    expect(alsStand('vielleicht')).toBe('unbekannt')
    expect(alsKostenart('kostenlos')).toBe('kostenlos')
    expect(alsStand('vorhanden')).toBe('vorhanden')
  })

  test('die Merker nennen Verdrahtung, Messung und Alter', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(ohneModell())))
    const merker = nachKlasse(host, 'rang-eintrag').map((zeile) => nachKlasse(zeile, 'rang-merker')[0]?.vollerText ?? '')
    expect(merker[0]).toContain('verdrahtet')
    expect(merker[0]).toContain('gemessen')
    expect(merker[0]).toContain('Stand 15.10.2026')
    expect(merker[0]).not.toContain('veraltet')
    expect(merker[2]).toContain('nicht verdrahtet')
    expect(merker[2]).toContain('nicht gemessen')
    expect(merker[2]).toContain('veraltet')
    // Und der ausführliche Satz steht am Merker selbst — nicht nur in der Empfehlung.
    const chips = nachKlasse(nachKlasse(host, 'rang-eintrag')[0] ?? knoten(), 'rang-chip')
    expect(chips.map((chip) => chip.title).join(' ')).toContain('Weg gemessen vorhanden')
  })

  test('ein leerer Dienst sagt, daß er leer ist — und die Hinweise stehen dabei', async () => {
    const host = knoten('div')
    // **`listen: []` — nicht ein fehlendes `listen`.** Ein fehlendes Feld wäre ein Grund („das ist
    // nicht die Antwort, die ich kenne"); eine leere Liste ist eine **Aussage** und wird angezeigt.
    await fuelleRangliste(
      host as unknown as HTMLElement,
      umgebung(dienst({ rangliste: { listen: [], hinweise: ['Es ist KEIN Katalog gereicht worden.'] } })),
    )
    expect(nachKlasse(host, 'rang-leer')[0]?.vollerText).toContain('für keine Fähigkeit einen Eintrag')
    expect(nachKlasse(host, 'rang-hinweis')[0]?.vollerText).toContain('KEIN Katalog')
  })

  test('ein abgestecktes Panel wird nicht mehr bemalt', async () => {
    // Das Laden dauert; in der Zwischenzeit kann der Nutzer das Panel abstecken. Wer dann in einen
    // abgehängten Knoten malt, arbeitet für ein Fenster, das niemand mehr sieht.
    const host = knoten('div')
    const laeuft = fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(GUELTIG)))
    host.isConnected = false
    await laeuft
    expect(nachKlasse(host, 'rang-eintrag')).toHaveLength(0)
  })

  /*
   * **Die Auswahl ist eine Anzeige-Frage, keine Daten-Frage.**
   *
   * Der Dienst liefert alle Fähigkeiten. Welche man ansieht, entscheidet der Leser — und „Alle" ist
   * die Voreinstellung. Diese Prüfung hält beides fest: daß die Leiste die Karten filtert, und daß
   * sie dabei **nichts umsortiert**.
   */
  test('die Fähigkeits-Leiste filtert die Karten — und „Alle" holt sie zurück', async () => {
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(GUELTIG)))
    expect(nachKlasse(host, 'rang-faehigkeit')).toHaveLength(2)

    const tabs = nachKlasse(host, 'rang-tab')
    expect(tabs.map((tab) => tab.vollerText)).toEqual(['Alle', 'Text', 'Bild'])
    const bild = tabs.find((tab) => tab.dataset['rangTab'] === 'bild#1')
    expect(bild, 'der Bild-Reiter fehlt').toBeDefined()
    bild?.klick()
    expect(nachKlasse(host, 'rang-faehigkeit')).toHaveLength(1)
    expect(nachKlasse(host, 'rang-titel').map((k) => k.vollerText)).toEqual(['Bild'])

    const alle = nachKlasse(host, 'rang-tab').find((tab) => tab.dataset['rangTab'] === 'alle')
    alle?.klick()
    expect(nachKlasse(host, 'rang-faehigkeit')).toHaveLength(2)
  })

  test('mehr Kandidaten als Platz sind einen Klick entfernt — keine weggelassene Zeile', () => {
    const viele = Array.from({ length: 7 }, (_, index) => eintrag({ rang: index + 1, familienname: `F${String(index + 1)}` }))
    const antwort: Rangantwort = {
      rangliste: {
        erstelltAm: '2026-10-16T09:00:00.000Z',
        listen: [{ faehigkeit: 'text', name: 'Text', eintraege: viele }],
        hinweise: [],
      },
    }
    const host = knoten('div')
    maleRangliste(host as unknown as HTMLElement, antwort, { dokument: dokumentStub() })
    expect(nachKlasse(host, 'rang-eintrag')).toHaveLength(5)
    const mehr = nachKlasse(host, 'rang-mehr')[0]
    expect(mehr?.vollerText).toContain('2 weitere Kandidaten')
    mehr?.klick()
    expect(nachKlasse(host, 'rang-eintrag')).toHaveLength(7)
    expect(nachKlasse(host, 'rang-mehr')[0]?.vollerText).toBe('Weniger anzeigen')
  })
})

// ---------------------------------------------------------------------------
// 3. Der Grund im Bild — der Kern dieser Ansicht
// ---------------------------------------------------------------------------

describe('der Grund im Bild', () => {
  test('401, 503 und ein Netzfehler erscheinen als Satz im Panel', async () => {
    const faelle: readonly (readonly [Antwortartig | Error, string])[] = [
      [dienst({ status: 'error', error: 'unauthenticated' }, 401), 'HTTP 401'],
      [dienst({ status: 'error', error: 'unavailable' }, 503), 'HTTP 503'],
      [new Error('Failed to fetch'), 'nicht erreichbar'],
    ]
    const fehler: string[] = []
    for (const [antwort, erwartet] of faelle) {
      const host = knoten('div')
      await fuelleRangliste(host as unknown as HTMLElement, umgebung(antwort))
      const grund = nachKlasse(host, 'rang-grund')[0]
      if (grund === undefined) fehler.push(`kein Grund im Bild für ${erwartet}`)
      else if (!grund.vollerText.includes(erwartet)) fehler.push(`${erwartet} fehlt in: ${grund.vollerText}`)
      // **Und die Fläche ist nicht leer.** Genau das ist der Unterschied, um den es hier geht.
      if (host.vollerText.length < 20) fehler.push(`leere Fläche statt Grund für ${erwartet}`)
    }
    expect(fehler.join('\n')).toBe('')
  })

  test('ein Grund ohne Text ist kein Grund — die Anzeige sagt trotzdem etwas', () => {
    const host = knoten('div')
    maleGrund(host as unknown as HTMLElement, 'Der Dienst ist nicht verbunden (HTTP 503).', { dokument: dokumentStub() })
    expect(nachKlasse(host, 'rang-fehler-titel')[0]?.vollerText).toContain('konnte nicht gelesen werden')
    expect(host.vollerText).toContain('HTTP 503')
  })

  test('wenn selbst das Bauen von Knoten scheitert, bleibt der Grund als Text', async () => {
    /*
     * **Der letzte Rückfall.** Er ist unschön und selten — aber ohne ihn stünde bei einem Fehler in
     * der Anzeige ein Fenster mit „Liest GET …" für immer da, und niemand wüßte, warum. `textContent`
     * ist die eine Schreibweise, die kein `createElement` braucht.
     */
    const kaputt = {
      createElement: () => {
        throw new Error('kein Dokument')
      },
    } as unknown as Document
    const host = knoten('div')
    await fuelleRangliste(host as unknown as HTMLElement, umgebung(dienst(GUELTIG), kaputt))
    expect(host.textContent).toContain('gescheitert')
    expect(host.textContent).toContain('kein Dokument')
  })
})

// ---------------------------------------------------------------------------
// 4. Die Einhängung — eine Ansicht, die niemand anbietet, gibt es nicht
// ---------------------------------------------------------------------------

/**
 * Ein Wirt **ohne Welt**.
 *
 * **Warum der genügt.** Beim Eintragen eines Plugins wird **nichts** davon aufgerufen: die
 * Rückrufe der eingebauten Plugins stehen alle in Verschlüssen und laufen erst, wenn jemand den
 * Befehl tippt oder das Panel malt. Hier wird nur **eingetragen** — und genau das ist die Frage:
 * bietet die Oberfläche das Panel an?
 *
 * Die werfenden Platzhalter sind Absicht: würde doch jemand die Welt abfragen, wäre das ein
 * **Befund** und keine stille leere Antwort.
 */
function wirtOhneWelt(registry: PluginRegistry): HostServices {
  const nicht = (): never => {
    throw new Error('Diese Prüfung hängt nur ein — sie fragt die Welt nicht ab.')
  }
  return {
    registry,
    readUniverse: nicht,
    metrics: () => ({}),
    tr: (key: string) => de.messages[key] ?? key,
    healthApi: () => null,
    view5d: nicht,
    orbits: nicht,
    setOrbits: () => {},
    checkCrowding: () => [],
    setView5d: () => {},
  } as unknown as HostServices
}

describe('die Einhängung', () => {
  test('die Oberfläche bietet die Rangliste als Panel an — abgesteckt und benannt', () => {
    /*
     * **Der Unterschied zwischen „es gibt ein Modul" und „es gibt die Ansicht".** Alles andere in
     * dieser Datei prüft eine Funktion. Diese Prüfung prüft, daß die **Oberfläche** sie anbietet:
     * ohne sie wäre die Ansicht gebaut, geprüft — und unerreichbar. Kein Test hätte es gemerkt.
     */
    const registry = new PluginRegistry()
    registerBuiltinPlugins(registry, wirtOhneWelt(registry))
    const angebot = registry.panels().find((eintrag) => eintrag.pluginId === 'ai-rangliste')
    expect(angebot, 'die Rangliste wird von der Oberfläche nicht angeboten').toBeDefined()
    if (angebot === undefined) return
    /*
     * **Abgesteckt.** Dieselbe Voreinstellung wie Terminal und Zustand: ein Fenster, das von Anfang
     * an über der Welt liegt, deckt sie ab. Geholt wird es über die Insel (Gruppe „Panels") — dort
     * steht es mit jedem anderen Panel.
     */
    expect(angebot.panel.zone).toBe('closed')
    expect(angebot.panel.size).toBeGreaterThan(0)
    const titel = angebot.panel.title
    expect(typeof titel).toBe('function')
    // Der Titel kommt aus dem Sprachpaket — und der Schlüssel existiert dort wirklich.
    expect(typeof titel === 'function' ? titel() : titel).toBe('KI-Rangliste')
    expect(typeof angebot.panel.render).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// 5. Die Regeln, die man nicht sieht
// ---------------------------------------------------------------------------

describe('die Regeln', () => {
  test('die Zahlen kommen vom Dienst — oder werden aus derselben Liste gezählt', () => {
    const mitDienst = zahlenAus(GUELTIG as unknown as Rangantwort)
    expect(mitDienst.eintraege).toBe(4)
    expect(mitDienst.ohnePreis).toBe(1)
    // Ohne `zahlen` wird nicht geraten, sondern gezählt: vier Einträge, zwei verdrahtet, zwei
    // gemessen, einer kostenlos, einer ohne bekannten Preis.
    const ohneDienst = zahlenAus({
      rangliste: {
        erstelltAm: '',
        listen: (GUELTIG as unknown as Rangantwort).rangliste.listen,
        hinweise: [],
      },
    })
    expect(ohneDienst).toEqual({ eintraege: 5, verdrahtet: 3, gemessen: 3, kostenlos: 1, ohnePreis: 1 })
  })

  test('die Merker tragen ihre ausführliche Begründung als Titel', () => {
    const chips = merkerChips(eintrag())
    expect(chips.map((chip) => chip.text)).toEqual(['verdrahtet', 'gemessen', 'Stand 15.10.2026'])
    expect(chips.map((chip) => chip.art)).toEqual(['gut', 'info', 'leer'])
    expect(chips[1]?.titel).toContain('Weg gemessen vorhanden (2026-10-15)')
    const alt = merkerChips(eintrag({ verdrahtet: false, funktionalitaet: 'unbekannt', veraltet: true }))
    expect(alt.map((chip) => chip.text)).toContain('veraltet')
    expect(alt.find((chip) => chip.text === 'veraltet')?.art).toBe('warn')
  })

  test('ein Preis ist nur bekannt, wenn BEIDE Seiten bekannt sind', () => {
    expect(preisText({ hinein: 0.15, heraus: 0.6 })).toBe('0.15 / 0.60 USD je 1 Mio Token')
    expect(preisText({ hinein: 0, heraus: 0 })).toBe('0.00 / 0.00 USD je 1 Mio Token')
    expect(preisText({ hinein: -1, heraus: -1 })).toBe('unbekannt')
    expect(preisText(undefined)).toBe('unbekannt')
    // Eine halbe Angabe ist kein Preis — aber sie wird **genannt**, statt zu verschwinden.
    expect(preisText({ hinein: 0.15, heraus: -1 })).toBe('unbekannt (nur hinein 0.15)')
    expect(preisText({ hinein: -1, heraus: 0.6 })).toBe('unbekannt (nur heraus 0.60)')
    expect(istPreisBekannt({ hinein: 0, heraus: 0 })).toBe(true)
    expect(istPreisBekannt({ hinein: 0.15, heraus: -1 })).toBe(false)
    expect(istPreisBekannt(undefined)).toBe(false)
  })

  test('der Pfad ist derselbe, den der Dienst einhängt — verglichen, nicht abgeschrieben', () => {
    /*
     * **Warum ein Textvergleich und kein Import.** `@prometheus-harness/ai-ranking` zu importieren
     * ist in dieser Anwendung **rot** (`TS5097`: die Pakete importieren mit `.ts`-Endung, diese
     * Anwendung erlaubt das nicht — gemessen, siehe `src/ai-rangliste.ts`). Der Pfad steht deshalb
     * zweimal im Baum, und genau deshalb wird er hier **verglichen**: driftet einer, fällt diese
     * Prüfung rot aus, statt daß das Panel ins Leere fragt.
     */
    const quelle = readFileSync(
      join(import.meta.dir, '..', '..', '..', 'packages', 'api', 'ai-ranking', 'src', 'index.ts'),
      'utf8',
    )
    const treffer = /export const RANKING_PATH = '([^']+)'/.exec(quelle)
    expect(treffer?.[1]).toBe(RANGLISTE_PFAD)
    expect(RANGLISTE_PFAD).toBe('/api/ai/ranking')
  })

  test('die Felder, die diese Ansicht liest, gibt es im Paket wirklich', () => {
    /*
     * **Die Kopplung, die still driftet.** Diese Ansicht liest JSON: ein umbenanntes Feld wäre kein
     * Typfehler, sondern eine Zeile weniger im Bild — und das sähe aus wie ein Dienst, der nichts
     * weiß. Deshalb wird hier gegen die **Quelle** verglichen: was `Ranglisteneintrag` trägt, muß
     * dieser Leser erwarten dürfen.
     */
    const rang = readFileSync(join(import.meta.dir, '..', '..', '..', 'packages', 'ai', 'ranking', 'src', 'rang.ts'), 'utf8')
    const felder = [
      'rang',
      'faehigkeit',
      'familie',
      'familienname',
      'modell',
      'verdrahtet',
      'funktionalitaet',
      'kostenart',
      'preis',
      'gemessenAm',
      'veraltet',
      'gruende',
    ]
    const fehlend = felder.filter((feld) => !rang.includes(`readonly ${feld}`))
    expect(fehlend.join(', ')).toBe('')
    // Und die Liste einer Fähigkeit trägt genau die vier Felder, die der Block braucht.
    for (const feld of ['name', 'eintraege', 'empfehlung', 'ohneEmpfehlung']) {
      expect(rang, `${feld} fehlt in Faehigkeitsliste`).toContain(`readonly ${feld}`)
    }
    // Die Zahlen (`zahlen`) gehören zur Antwort des Endpunkts.
    const api = readFileSync(join(import.meta.dir, '..', '..', '..', 'packages', 'api', 'ai-ranking', 'src', 'index.ts'), 'utf8')
    expect(api).toContain('readonly zahlen')
    expect(api).toContain('readonly rangliste')
  })

  test('die Anzeige sortiert NICHT — sie gibt die Reihenfolge des Dienstes weiter', () => {
    /*
     * **Die wichtigste Regel dieses Fensters.** Die Rangfolge rechnet `@prometheus-harness/ranking`
     * (erst die Verdrahtung, dann der gemessene Befund, dann der Preis). Eine zweite Sortierung hier
     * wäre eine zweite Wahrheit über dieselbe Frage — und sie wäre still falsch, weil beide
     * Reihenfolgen für sich plausibel aussehen.
     *
     * Geprüft wird das an einer Antwort, deren Ränge in der Liste **durcheinander** stehen: genau so,
     * wie sie ankommt.
     */
    const host = knoten('div')
    const antwort: Rangantwort = {
      rangliste: {
        erstelltAm: '',
        listen: [
          {
            faehigkeit: 'text',
            name: 'Text',
            eintraege: [
              eintrag({ rang: 2, familie: 'b', familienname: 'B' }),
              eintrag({ rang: 1, familie: 'a', familienname: 'A' }),
              eintrag({ rang: 3, familie: 'c', familienname: 'C' }),
            ],
          },
        ],
        hinweise: [],
      },
    }
    maleRangliste(host as unknown as HTMLElement, antwort, { dokument: dokumentStub() })
    expect(nachKlasse(host, 'rang-familie').map((k) => k.vollerText)).toEqual(['B', 'A', 'C'])
  })
})
