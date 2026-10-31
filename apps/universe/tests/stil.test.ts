/**
 * **Die Stilvorlagen — Wahl, Herkunft, Vollständigkeit.**
 *
 * ## Warum das geprüft wird
 *
 * Die Umschaltung hat **drei** Zulieferer, die auseinanderlaufen können, ohne daß es jemandem
 * auffällt:
 *
 *   1. die Liste der Vorlagen (`STILE` in `stil.ts`),
 *   2. die Auswahlliste der Einstellung (`control-settings.ts`, `options`),
 *   3. die Sprachpakete (`locales/de.ts`, `locales/en.ts` — ein Wert ohne Text ist eine leere Zeile).
 *
 * Eine vierte Zuliefererin ist das Blatt (`stil.css`), und sie hat ihre eigenen Prüfungen in
 * `design.test.ts`. Hier stehen die ersten drei — und der Zusammenhang zwischen ihnen.
 *
 * **Was hier NICHT geprüft wird: ob es gut aussieht.** Das ist eine Aussage über gerenderte Bilder;
 * sie steht in einem Bild (`tools/shot.js`) und nicht in einem Test. Ein Test, der Farben „schön"
 * nennt, prüft den Geschmack des Prüfers.
 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  STILE,
  STIL_ATTRIBUT,
  STIL_PARAMETER,
  STIL_QUELLE_ATTRIBUT,
  STIL_SCHLUESSEL,
  STIL_VORGABE,
  istStil,
  setzeStil,
  stilAusAdresse,
  stilMarke,
  stilWahl,
} from '../src/stil'
import { CONTROL_KEYS, CONTROLS_SETTINGS } from '../src/control-settings'
import { ICON_NAMES } from '@prometheus-harness/icons'

/** Ein Wurzelelement, wie `setzeStil` es braucht — mehr als `setAttribute` wird nicht benutzt. */
function wurzelAttrappen(): { readonly werte: Record<string, string>; setAttribute(n: string, w: string): void } {
  const werte: Record<string, string> = {}
  return { werte, setAttribute: (n, w) => { werte[n] = w } }
}

// ── Die Adresse ─────────────────────────────────────────────────────────────────────────────

test('die Adresse nennt eine Vorlage — oder nichts', () => {
  expect(stilAusAdresse('')).toBeUndefined()
  expect(stilAusAdresse('?')).toBeUndefined()
  expect(stilAusAdresse(`?${STIL_PARAMETER}=prometheus`)).toBe('prometheus')
  expect(stilAusAdresse(`?${STIL_PARAMETER}=base`)).toBe('base')
  // Mit führendem Fragezeichen und ohne — beides kommt vor, je nach Aufrufer.
  expect(stilAusAdresse(`${STIL_PARAMETER}=prometheus`)).toBe('prometheus')
  // Zwischen anderen Angaben.
  expect(stilAusAdresse(`?room=alice&${STIL_PARAMETER}=prometheus`)).toBe('prometheus')
  expect(stilAusAdresse(`?${STIL_PARAMETER}=prometheus&room=alice`)).toBe('prometheus')
  // Prozentkodiert — eine Adresse ist keine Zeichenkette, sondern eine Kodierung.
  expect(stilAusAdresse(`?${STIL_PARAMETER}=%70rometheus`)).toBe('prometheus')
})

test('eine unbrauchbare Angabe wird verworfen, nicht geraten', () => {
  /*
   * **Warum das die wichtigere Hälfte ist.** Ein unbekannter Wert darf **nicht** durchgereicht
   * werden: er landete als Attribut im Dokument, dort träfe ihn keine Regel, und die Welt stünde
   * ohne Farben da — die Vorlage **ersetzt** den Grundsatz und ergänzt ihn nicht. Lieber die Vorgabe
   * als ein halb gesetztes Bild.
   */
  expect(stilAusAdresse(`?${STIL_PARAMETER}=`)).toBeUndefined()
  expect(stilAusAdresse(`?${STIL_PARAMETER}=nonsense`)).toBeUndefined()
  expect(stilAusAdresse('?stilvorlage=prometheus')).toBeUndefined()
  expect(stilAusAdresse(`?${STIL_PARAMETER}=%zz`)).toBeUndefined()
  // **Groß- und Kleinschreibung ist keine Freiheit**: `Prometheus` ist eine andere Zeichenkette, und
  // wer sie stillschweigend kleinschreibt, hat eine zweite Schreibweise derselben Sache erfunden.
  expect(stilAusAdresse(`?${STIL_PARAMETER}=Prometheus`)).toBeUndefined()
  expect(istStil('Prometheus')).toBe(false)
})

// ── Die Wahl und ihre Herkunft ──────────────────────────────────────────────────────────────

test('die Adresse gewinnt beim Laden, die Einstellung sonst, die Vorgabe zuletzt', () => {
  expect(stilWahl('prometheus', undefined)).toEqual({ stil: 'prometheus', quelle: 'einstellung' })
  expect(stilWahl('base', 'prometheus')).toEqual({ stil: 'prometheus', quelle: 'adresse' })
  expect(stilWahl(undefined, undefined)).toEqual({ stil: STIL_VORGABE, quelle: 'vorgabe' })
  // Ein beschädigter Speicher ist keine Wahl — und die Herkunft sagt das auch.
  expect(stilWahl(42, undefined)).toEqual({ stil: STIL_VORGABE, quelle: 'vorgabe' })
  expect(stilWahl('gruen', undefined)).toEqual({ stil: STIL_VORGABE, quelle: 'vorgabe' })
})

test('die Vorlage steht mit ihrer Herkunft im Dokument', () => {
  /*
   * **Warum zwei Attribute.** `data-stil` ist die Wahl, `data-stil-quelle` ihre Begründung. Fehlte
   * die zweite, sähe ein Prüflauf mit `?stil=…` genauso aus wie eine geänderte Einstellung — und
   * dann sucht jemand den Fehler in einer Einstellung, die niemand angefaßt hat.
   */
  const wurzel = wurzelAttrappen()
  setzeStil(wurzel, 'prometheus', 'adresse')
  expect(wurzel.werte[STIL_ATTRIBUT]).toBe('prometheus')
  expect(wurzel.werte[STIL_QUELLE_ATTRIBUT]).toBe('adresse')
  setzeStil(wurzel, 'base', 'vorgabe')
  expect(wurzel.werte[STIL_ATTRIBUT]).toBe('base')
  expect(wurzel.werte[STIL_QUELLE_ATTRIBUT]).toBe('vorgabe')
})

// ── Die Marke ───────────────────────────────────────────────────────────────────────────────

test('jede Vorlage hat eine Marke — und beide Zeichen gibt es wirklich', () => {
  /*
   * **Warum das eine Prüfung braucht.** Die Marke ist das **einzige**, was eine Vorlage an der
   * Struktur ändert. Ein Tippfehler im Zeichennamen fällt sonst erst beim Laden auf — und dann nicht
   * als Fehlermeldung, sondern als leere Stelle in der Kopfzeile. `iconMarkup` wirft bei einem
   * unbekannten Namen; hier wird vorher nachgesehen, damit die Meldung den Namen nennt.
   */
  const zeichen = STILE.map((stil) => stilMarke(stil))
  for (const name of zeichen) {
    expect(ICON_NAMES as readonly string[]).toContain(name)
  }
  // **Zwei Vorlagen, zwei Zeichen.** Dasselbe Zeichen für beide wäre keine Unterscheidung.
  expect(new Set(zeichen).size).toBe(STILE.length)
})

// ── Die drei Zulieferer müssen übereinstimmen ───────────────────────────────────────────────

test('die Einstellung kennt genau die Vorlagen, die es gibt', () => {
  const feld = CONTROLS_SETTINGS.map((eintrag) => eintrag.field).find((f) => f.key === CONTROL_KEYS.interfaceStyle)
  expect(feld, `Die Einstellung ${CONTROL_KEYS.interfaceStyle} wird von ui-controls nicht beschrieben`).toBeDefined()
  expect(feld?.kind).toBe('choice')
  if (feld?.kind !== 'choice') return
  // **Die Werte, nicht nur die Anzahl.** Eine Liste, die zufällig gleich lang ist, ist nicht dieselbe.
  expect(feld.options().map((o) => o.value)).toEqual([...STILE])
  expect(feld.default).toBe(STIL_VORGABE)
  // **Und jeder Wert braucht einen Text** — sonst steht im Auswahlfeld ein leerer Eintrag.
  for (const option of feld.options()) {
    expect(option.labelKey, `Der Wert ${option.value} hat keinen Sprachschlüssel`).toBeDefined()
  }
})

test('jede Vorlage ist in beiden Sprachen benannt', () => {
  /*
   * **Warum in beiden.** Ein Wert ohne Text in einem der Pakete erscheint in dieser Sprache als
   * leerer Eintrag — und `locale-keys.test.ts` sieht das nicht, weil es die *Symmetrie* der Pakete
   * prüft und nicht die **Vollständigkeit** gegenüber einer Liste im Quelltext. Genau diese Lücke
   * schließt der Test hier: die Liste ist `STILE`, und sie steht in `stil.ts`.
   */
  for (const datei of ['de.ts', 'en.ts']) {
    const text = readFileSync(join(import.meta.dirname, '..', 'src', 'locales', datei), 'utf8')
    expect(text).toContain("'setting.interface.style.label'")
    expect(text).toContain("'setting.interface.style.description'")
    for (const stil of STILE) {
      expect(text, `${datei} nennt die Vorlage ${stil} nicht`).toContain(`'setting.interface.style.${stil}':`)
    }
  }
})

test('der Befehl `stil` schaltet über die Einstellung — nicht daran vorbei', () => {  /*
   * **Warum das geprüft wird.** Ein Befehl, der den Wert direkt setzt (statt über `settings.set`),
   * wäre ein **zweiter Weg**: er speichert nicht, die Anzeige im Einstellungsbildern zieht nicht
   * nach, und der nächste Start zeigt wieder etwas anderes. Genau dieser Fehler ist beim
   * Sprachbefehl `lang` schon einmal passiert (er setzt `locales.set` direkt, und die Sprache ist
   * deshalb nach dem Neuladen wieder weg). Hier steht die Prüfung, bevor es passiert.
   */
  const quelle = readFileSync(join(import.meta.dirname, '..', 'src', 'control-settings.ts'), 'utf8')
  const ab = quelle.indexOf("name: 'stil'")
  expect(ab, 'ui-controls hat keinen Befehl `stil`').toBeGreaterThan(-1)
  const rumpf = quelle.slice(ab, ab + 900)
  expect(rumpf).toContain(`env.settings.set(CONTROL_KEYS.interfaceStyle, wert)`)
  expect(rumpf).toContain('env.onApply(CONTROL_KEYS.interfaceStyle)')
  expect(STIL_SCHLUESSEL).toBe(CONTROL_KEYS.interfaceStyle)
})

test('der Aufbau überschreibt die Adressangabe nicht — der gemessene Fehler', () => {
  /*
   * ## Der Fehler, den diese Prüfung festhält (16.10.2026)
   *
   * `controlsPlugin` trägt seine Felder beim **Einschalten** ein (`onEnable` → `settings.describe`),
   * und `describe` **meldet jede Eintragung** an die Zuhörer. Diese Meldung erreichte den Zweig, der
   * die Vorlage setzt — und der schrieb die **Einstellung** (Vorgabe `base`) über die **Adresse**.
   *
   * Gemessen im Browser: `?stil=prometheus` in der Adresse, `location.search` unversehrt, der Wert im
   * Raster — und im Dokument stand `data-stil="base"`, `data-stil-quelle="einstellung"`. Die
   * Umschaltung war richtig gebaut und wurde **beim Start überschrieben**.
   *
   * ## Warum hier ein Quelltext-Vergleich steht und kein Ablauf
   *
   * Die Hülle wird in dieser Testreihe **einmal** geladen (alle Dateien teilen ein Modul), und sie
   * liest die Adresse in genau diesem einen Moment. Ein Ablauftest müsste die Adresse **vor** das
   * Laden setzen — und das hieße, die Reihenfolge der Testdateien zu einer Bedingung zu machen.
   * Geprüft wird deshalb die **Bedingung** der Regel: der Zweig darf vor dem Aufbau nicht greifen.
   * Dieselbe Marke (`aufgebaut`) schützt seit dem ersten Tag `interface.labels` — die Regel ist also
   * nicht neu, sondern wird hier zum zweiten Mal angewandt.
   */
  const main = readFileSync(join(import.meta.dirname, '..', 'src', 'main.ts'), 'utf8')
  expect(
    main,
    'Der Stil-Zweig greift auch vor dem Aufbau — dann überschreibt die Einstellung die Adressangabe beim Start.',
  ).toContain(`if ((key === STIL_SCHLUESSEL || key === '*') && aufgebaut)`)
  // **Und die Marke gibt es wirklich** — sonst wäre der Vergleich oben gegenstandslos.
  expect(main).toContain('let aufgebaut = false')
  expect(main).toContain('aufgebaut = true')
})
