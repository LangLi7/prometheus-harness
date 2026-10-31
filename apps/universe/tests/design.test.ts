/**
 * **Die Gestaltungsregeln der Welt — als Prüfung, nicht als Vorsatz.**
 *
 * ## Warum das geprüft wird
 *
 * Am 15.10.2026 bat der Betreiber: *„alles was mit design und animation … smooth und modern
 * professionell ist"*. Gezählt waren damals in `app.css`:
 *
 *   * **13** Übergänge mit **neun** verschiedenen Dauerangaben, drei davon `linear`,
 *   * **37** `border-radius`-Angaben mit **acht** freien Werten neben den Tokens,
 *   * **neun** verschiedene Schatten für dieselbe Aussage („liegt über der Fläche"),
 *   * **null** Vorkommen von `prefers-reduced-motion`.
 *
 * Nichts davon ist ein Fehler, den ein Test „findet", wenn er ihn nicht **sucht**. Und nichts davon
 * fällt im Bild auf — man sieht nur, daß es unruhig aussieht, und weiß nicht warum. Deshalb steht hier
 * die Zählung.
 *
 * ## Was hier NICHT geprüft wird
 *
 * **Daß sich etwas bewegt.** Das ist eine Aussage über gerenderte Bilder und steht in
 * `tools/motion.js` (mit einem echten Browser: 20 Breiten zwischen 360 und 560 px, und bei
 * `prefers-reduced-motion` genau zwei). Ein Test, der das nachbauen wollte, prüfte den Stub.
 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'app.css'), 'utf8')

/**
 * Der Quelltext **ohne** Erklärungen — gesucht wird, was gilt, nicht was erklärt wird.
 *
 * **Die Zeilenumbrüche bleiben stehen.** Ein Kommentar wird durch genauso viele **Leerzeichen**
 * (und dieselben Umbrüche) ersetzt: damit stimmt die Zeilennummer in einer Fehlermeldung mit der
 * Datei überein. Wer sie wegwirft, meldet „Zeile 42" für etwas, das in Zeile 90 steht — und schickt
 * den nächsten auf die Suche.
 */
const OHNE_KOMMENTARE = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

/** Alle Regeln mit ihrem Selektor, in der Reihenfolge des Blattes. */
function regeln(text: string): readonly { readonly zeile: number; readonly selektor: string; readonly koerper: string }[] {
  const raus: { zeile: number; selektor: string; koerper: string }[] = []
  for (const treffer of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selektor = (treffer[1] ?? '').trim().replace(/\s+/g, ' ')
    const vor = text.slice(0, treffer.index ?? 0)
    raus.push({ zeile: vor.split('\n').length, selektor, koerper: treffer[2] ?? '' })
  }
  return raus
}

const REGELN = regeln(OHNE_KOMMENTARE)

/** Ein Token aus dem `:root`-Block — gelesen, nicht abgeschrieben. */
function token(name: string): string {
  const treffer = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS)
  if (!treffer?.[1]) throw new Error(`Das Token --${name} steht nicht in app.css`)
  return treffer[1].trim()
}

// ── Bewegung ────────────────────────────────────────────────────────────────────────────────

/**
 * **Ausnahmen, jede mit einem Grund.**
 *
 * **Warum es sie gibt.** Ein Teil dieses Blattes ist die **Vorlage des Betreibers** (`.1:1` aus
 * `apps/web`, siehe den Abschnitt „Die Vorlage" in `app.css`). Sie wird **nicht** angefaßt — auch
 * nicht, um sie zu verbessern: eine Kopie, die vom Original abweicht, ist der Fehler, den die
 * Vorlage vermeiden soll. Ihre Dauern stehen deshalb hier, mit Grund.
 *
 * Wer etwas hinzufügt, nennt den Grund. Wer keinen nennen kann, hat eine zweite Dauer gefunden.
 */
const AUSNAHMEN_DAUER: Readonly<Record<string, string>> = {
  '#screen-web .isl':
    'Die Vorlage (apps/web) — 1:1 übernommen und bewusst nicht angetastet; ihre Bewegungskurve ist die des Originals.',
}

test('jede Dauer kommt aus einem Token — keine neun Zahlen für dieselbe Sache', () => {
  const fehler: string[] = []
  let geprueft = 0
  for (const regel of REGELN) {
    if (regel.selektor.startsWith('@') || regel.selektor === ':root') continue
    if (AUSNAHMEN_DAUER[regel.selektor] !== undefined) continue
    for (const treffer of regel.koerper.matchAll(/(transition|animation)(?:-duration)?:\s*([^;]+);/g)) {
      const wert = treffer[2] ?? ''
      // Nur die **Dauerangaben** zählen: `transition: width var(--t-feder) …` ist in Ordnung,
      // `transition: width 0.28s …` nicht.
      const dauern = [...wert.matchAll(/(^|[\s,(])\d*\.?\d+(ms|s)\b/g)]
      geprueft += 1
      for (const _ of dauern) {
        fehler.push(`${regel.selektor} (Zeile ${String(regel.zeile)}): ${wert.trim().slice(0, 70)}`)
      }
    }
  }
  // **Und die Prüfung sagt, daß sie etwas geprüft hat.** Ein Muster, das nie trifft, sieht grün aus.
  expect(geprueft).toBeGreaterThan(12)
  expect(fehler.join('\n')).toBe('')
})

test('es gibt genau vier Bewegungsdauern — und sie sind benannt', () => {
  const namen = ['t-schnell', 't-mittel', 't-gross', 't-feder']
  for (const name of namen) {
    expect(token(name)).toMatch(/^\d+(\.\d+)?m?s$/)
  }
  // Die Reihenfolge ist die Aussage: klein → groß. Wer sie verdreht, hat sie nicht verstanden.
  const zahlen = namen.map((n) => Number.parseFloat(token(n)))
  expect(zahlen).toEqual([...zahlen].sort((a, b) => a - b))
})

test('wer keine Bewegung will, bekommt keine — ohne `!important`', () => {
  /*
   * **Der übliche Weg ist ein Block mit `!important`**, der allen Elementen die Laufzeit nimmt. Der
   * Preis: er überschreibt **jede** spätere Regel mit — auch die, die jemand aus gutem Grund schreibt.
   *
   * Hier steht dieselbe Wahrheit auf **null**: die vier Dauern. Jeder Übergang liest sie (das ist der
   * Grund, warum es Token gibt) — also steht die Bewegung überall still, ohne eine Zeile zu
   * überschreiben. Diese Prüfung hält das fest.
   */
  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(CSS)
  expect(block, 'kein Block für prefers-reduced-motion').not.toBeNull()
  const inhalt = block?.[1] ?? ''
  for (const name of ['t-schnell', 't-mittel', 't-gross', 't-feder']) {
    expect(inhalt, `--${name} wird bei reduzierter Bewegung nicht auf null gesetzt`).toContain(`--${name}: 1ms`)
  }
  expect(inhalt).not.toContain('!important')
})

// ── Form und Höhe ───────────────────────────────────────────────────────────────────────────

test('jeder Radius kommt aus der Skala', () => {
  const erlaubt = ['var(--r-fein)', 'var(--r-xs)', 'var(--r-sm)', 'var(--r)', 'var(--r-lg)', 'var(--r-rund)', 'var(--dsw-radius-lg)', 'var(--dsw-radius-md)', 'var(--dsw-radius-sm)', 'var(--dsw-radius-xs)']
  const fehler: string[] = []
  for (const regel of REGELN) {
    if (regel.selektor.startsWith('@')) continue
    for (const treffer of regel.koerper.matchAll(/border-radius:\s*([^;]+);/g)) {
      const wert = (treffer[1] ?? '').trim()
      // **Drei Werte, die bleiben dürfen, und jeder hat einen Grund:**
      //   `50%`      ein Punkt ist rund, nicht „abgerundet" — kein Wert der Skala
      //   die Vorlage 1:1 (apps/web), unangetastet
      const ausnahme = wert === '50%' || wert === '0' || regel.selektor.startsWith('#screen-web')
      if (!ausnahme && !erlaubt.includes(wert)) {
        fehler.push(`${regel.selektor} (Zeile ${String(regel.zeile)}): ${wert}`)
      }
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('jeder Schatten ist eine der drei Stufen', () => {
  const erlaubt = ['var(--sch-1)', 'var(--sch-2)', 'var(--sch-3)']
  const fehler: string[] = []
  for (const regel of REGELN) {
    if (regel.selektor.startsWith('@')) continue
    for (const treffer of regel.koerper.matchAll(/box-shadow:\s*([^;]+);/g)) {
      const wert = (treffer[1] ?? '').trim()
      // **Die Leuchtringe bleiben.** `0 0 6px var(--g)` ist kein Schatten, sondern eine **Lampe**:
      // sie sagt „hier ist etwas an", nicht „hier liegt etwas darüber". Und die Vorlage ist 1:1.
      const lampe = /^0 0 [\d.]+px/.test(wert) || wert.includes('color-mix')
      if (!erlaubt.includes(wert) && !lampe && !regel.selektor.startsWith('#screen-web')) {
        fehler.push(`${regel.selektor} (Zeile ${String(regel.zeile)}): ${wert}`)
      }
    }
  }
  expect(fehler.join('\n')).toBe('')
})

// ── Farbe und Lesbarkeit ────────────────────────────────────────────────────────────────────

/** Relative Helligkeit nach WCAG 2.1. */
function helligkeit(hex: string): number {
  const s = hex.replace('#', '')
  const voll = s.length === 3 ? [...s].map((c) => c + c).join('') : s.slice(0, 6)
  const kanaele = [0, 2, 4].map((i) => Number.parseInt(voll.slice(i, i + 2), 16) / 255)
  const linear = kanaele.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

/** Der Kontrast zweier Farben (1 … 21). */
function kontrast(a: string, b: string): number {
  const [hell, dunkel] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x)
  return ((hell ?? 0) + 0.05) / ((dunkel ?? 0) + 0.05)
}

test('die Textfarben sind auf dem Grund lesbar — gemessen, nicht geschätzt', () => {
  /*
   * **Die Grenze ist 4,5 : 1** — die Stufe, die die WCAG für **normalen** Text verlangt (Stufe AA).
   * Kleine, dünne, gesperrte Schrift (11 px in Grossbuchstaben, wie die Etiketten hier) braucht sie
   * besonders: genau an dieser Stelle ist der Prototyp schon einmal durchgefallen (siehe die
   * Begründung bei `--t3` in `app.css`).
   */
  const grund = token('bg')
  const glas = token('glas').slice(0, 7)
  const paare: readonly (readonly [string, string, string])[] = [
    ['--t', grund, 'Haupttext'],
    ['--t2', grund, 'Nebentext'],
    ['--t3', grund, 'gedämpfter Text (Etiketten, Zusätze)'],
    ['--a2', grund, 'Akzent, hell (Marke, Überschriften)'],
    ['--a', grund, 'Akzent (Zeichen, aktive Zeile)'],
    ['--t2', glas, 'Nebentext auf der Insel'],
    ['--t3', glas, 'gedämpfter Text auf der Insel'],
    ['--a2', glas, 'Marke auf der Insel'],
  ]
  const schwach: string[] = []
  for (const [name, hinter, was] of paare) {
    const wert = token(name.slice(2))
    const quote = kontrast(wert, hinter)
    if (quote < 4.5) schwach.push(`${name} (${was}): ${quote.toFixed(2)} : 1 auf ${hinter}`)
  }
  expect(schwach.join('\n')).toBe('')
})

/**
 * **Kein Klassenname darf gleichzeitig ZUSTAND und SACHE sein.**
 *
 * ## Der Befund, der diese Prüfung erzwungen hat (15.10.2026)
 *
 * `#screen-os` trägt seit jeher die **Zustandsklasse** `himmel` — angeschaltet über `applyStarfield`,
 * gestylt über `#screen-os.himmel::before`. Die neue **Himmelsschicht** bekam **denselben** Namen.
 * Damit traf ihre Regel auch den Bildschirm:
 *
 * ```css
 * .himmel { pointer-events: none; z-index: 1; position: absolute; overflow: hidden; }
 * ```
 *
 * Gemessen im Browser — **mit eingeschaltetem Sternenhimmel**:
 *
 * ```
 * div#settingsOverlay.set-overlay.offen   pe=none   z=60
 * div#screen-os.screen.himmel             pe=none   z=1     ← alles darin war nicht mehr klickbar
 * elementFromPoint(Dialogmitte)  →  CANVAS        (statt des Dialogs)
 * ```
 *
 * Der Betreiber: *„ich kann das nicht einmal interagieren ;D"* — er hatte recht, und die Ursache war
 * **ein Name für zwei Dinge**: einen Zustand und eine Fläche.
 *
 * ## Warum das eine Prüfung ist und kein Vorsatz
 *
 * Der Fehler war **unsichtbar** im Quelltext (zwei Regeln, beide für sich richtig) und **sofort**
 * sichtbar in der Bedienung. Genau solche Fälle gehören in eine Prüfung: sie kostet nichts und findet
 * den nächsten Namensdoppler, bevor ihn jemand anklickt.
 */
test('kein Klassenname ist gleichzeitig Zustand des Bildschirms und eine eigene Fläche', () => {
  const zustaende = [...new Set([...CSS.matchAll(/#screen-os\.([a-z][a-z0-9-]*)/g)].map((m) => m[1] ?? ''))]
  // **Und die Prüfung sagt, daß sie etwas gefunden hat** — sonst wäre sie grün, ohne zu prüfen.
  expect(zustaende.length).toBeGreaterThan(0)
  const doppelt: string[] = []
  for (const zustand of zustaende) {
    // Eine **eigene Regel** für dieselbe Klasse (`.himmel { … }`) — nicht `#screen-os.himmel …`.
    const eigene = new RegExp(`^\\.${zustand}\\s*\\{`, 'm')
    if (eigene.test(CSS)) doppelt.push(zustand)
  }
  expect(
    doppelt.join(', '),
    'Derselbe Klassenname steht als Zustand an #screen-os UND als eigene Flaeche — die Regel der Flaeche trifft dann den ganzen Bildschirm (pointer-events, z-index, position). Zwei Dinge, zwei Namen.',
  ).toBe('')
})

/* ══ DIE VORLAGEN ═══════════════════════════════════════════════════════════════════════════════
 *
 * **Warum die Vorlage dieselben Prüfungen bekommt wie das Grundblatt.**
 *
 * Eine zweite Gestaltung ist der bequemste Ort, alle Regeln zu umgehen: sie ist neu, sie fällt
 * niemandem auf, und wenn sie häßlich ist, heißt es „das ist die andere Richtung". Genau deshalb
 * steht sie hier unter **denselben** vier Prüfungen — Dauer, Radius, Schatten, Lesbarkeit — und
 * zusätzlich unter dreien, die nur für sie gelten (Vollständigkeit, Schichtung, keine Ausrufe).
 *
 * Der Betreiber hat die Richtung vorgegeben („Rust, Prometheus Mythologie, flame like … like a
 * phoenix flame mit rust") — aber **eine Richtung ist keine Erlaubnis**. Wenn eine warme Palette den
 * Text unlesbar macht, ist sie falsch und nicht „gewollt".
 */
const VORLAGEN_CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'stil.css'), 'utf8')
const VORLAGEN_OHNE_KOMMENTARE = VORLAGEN_CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
const VORLAGEN_REGELN = regeln(VORLAGEN_OHNE_KOMMENTARE)

/** Der Selektor, unter dem die Vorlage steht — jede ihrer Regeln muß ihn tragen. */
const VORLAGEN_SCHICHT = "[data-stil='prometheus']"

/**
 * Ein Token aus **der Vorlage**, mit Rückfall auf das Grundblatt.
 *
 * **Warum mit Rückfall.** Die Vorlage ist **vollständig** (das prüft ein Test unten) — aber ein
 * Token, das nur die Form betrifft (`--r-lg`), darf fehlen, ohne daß die Lesbarkeitsprüfung daran
 * scheitert. Der Rückfall macht aus dem Fehler „Token nicht gefunden" die richtige Aussage: „dieser
 * Wert gilt unverändert".
 */
function vorlagenToken(name: string): string {
  const treffer = new RegExp(`--${name}:\\s*([^;]+);`).exec(VORLAGEN_CSS)
  return treffer?.[1]?.trim() ?? token(name)
}

test('die Vorlage hält die Bewegungsregel ein — auch sie hat keine freien Zahlen', () => {
  const fehler: string[] = []
  let geprueft = 0
  for (const regel of VORLAGEN_REGELN) {
    if (regel.selektor.startsWith('@')) continue
    for (const treffer of regel.koerper.matchAll(/(transition|animation)(?:-duration)?:\s*([^;]+);/g)) {
      const wert = treffer[2] ?? ''
      const dauern = [...wert.matchAll(/(^|[\s,(])\d*\.?\d+(ms|s)\b/g)]
      geprueft += 1
      for (const _ of dauern) {
        fehler.push(`${regel.selektor} (Zeile ${String(regel.zeile)}): ${wert.trim().slice(0, 70)}`)
      }
    }
  }
  expect(geprueft).toBeGreaterThan(0)
  expect(fehler.join('\n')).toBe('')
})

test('die Vorlage benutzt dieselbe Formen- und Höhenskala', () => {
  const radien = ['var(--r-fein)', 'var(--r-xs)', 'var(--r-sm)', 'var(--r)', 'var(--r-lg)', 'var(--r-rund)']
  const schatten = ['var(--sch-1)', 'var(--sch-2)', 'var(--sch-3)']
  const fehler: string[] = []
  for (const regel of VORLAGEN_REGELN) {
    if (regel.selektor.startsWith('@')) continue
    for (const treffer of regel.koerper.matchAll(/border-radius:\s*([^;]+);/g)) {
      const wert = (treffer[1] ?? '').trim()
      if (wert !== '50%' && wert !== '0' && !radien.includes(wert)) {
        fehler.push(`Radius ${regel.selektor} (Zeile ${String(regel.zeile)}): ${wert}`)
      }
    }
    for (const treffer of regel.koerper.matchAll(/box-shadow:\s*([^;]+);/g)) {
      const wert = (treffer[1] ?? '').trim()
      const lampe = /^0 0 [\d.]+px/.test(wert) || wert.includes('color-mix')
      if (!schatten.includes(wert) && !lampe) {
        fehler.push(`Schatten ${regel.selektor} (Zeile ${String(regel.zeile)}): ${wert}`)
      }
    }
  }
  expect(fehler.join('\n')).toBe('')
})

/**
 * **Eine Vorlage, die die Hälfte setzt, ist schlimmer als keine.**
 *
 * Der Selektor `:root[data-stil='prometheus']` hat eine **höhere Spezifität** als `:root`: was hier
 * steht, gewinnt; was hier **fehlt**, gilt weiter aus `app.css`. Eine halb gesetzte Vorlage sieht
 * deshalb nicht „fast richtig" aus, sondern falsch — ein einzelner kalter Grauton zwischen lauter
 * warmen fällt auf, und niemand findet ihn, weil er nicht in dieser Datei steht.
 *
 * Deshalb wird **Vollständigkeit** geprüft und nicht „ein paar Werte".
 */
test('die Vorlage setzt jeden Wert, der die Gestalt trägt — keine halbe Vorlage', () => {
  const noetig = [
    // Flächen und Striche
    'bg', 's', 's2', 'b', 'b2', 'glas', 'glas-unschaerfe',
    // Schrift
    't', 't2', 't3', 'a', 'a2', 'blue', 'g',
    // Form
    'r-fein', 'r-xs', 'r-sm', 'r', 'r-lg', 'r-rund',
    // Höhe
    'sch-1', 'sch-2', 'sch-3',
    // Bewegung
    't-schnell', 't-mittel', 't-gross', 't-feder', 'e-standard', 'e-ein', 'e-aus', 'e-feder',
  ]
  const fehlend = noetig.filter((name) => !new RegExp(`--${name}:`).test(VORLAGEN_CSS))
  expect(fehlend.join(', '), 'Diese Werte fehlen in stil.css — sie gelten dann weiter aus app.css, und die Vorlage wird zweifarbig.').toBe('')
})

/**
 * **Die Vorlage bleibt in ihrer Schicht.**
 *
 * Eine Regel ohne `[data-stil='prometheus']` in `stil.css` gälte **immer** — auch für das
 * Grundgerüst, das der Betreiber als Vorgabe behalten will. Damit wäre die Umschaltung keine
 * Umschaltung mehr, sondern eine stille Änderung am Bestehenden. Ausgenommen sind nur die
 * `@keyframes`-Blöcke: ein Keyframe-Name ist im ganzen Dokument gültig und hat keinen Selektor, an
 * den man die Schicht schreiben könnte — benutzt wird er ausschließlich aus einer Regel, die sie trägt.
 */
test('keine Regel der Vorlage gilt ohne die Vorlage', () => {
  /*
   * **Die Schritte eines `@keyframes` sind keine Regeln.** Der Zerleger liest `0%, 100% { … }` als
   * eigenen Block — er hat recht (es *ist* ein Block), aber er hat keinen **Selektor**, an den man
   * eine Schicht schreiben könnte. Erkannt wird das an der Form: ein Keyframe-Schritt heißt `from`,
   * `to` oder eine Prozentzahl und sonst nichts.
   */
  const keyframeSchritt = /^(from|to|\d+(\.\d+)?%)(,\s*(from|to|\d+(\.\d+)?%))*$/u
  const fehler: string[] = []
  for (const regel of VORLAGEN_REGELN) {
    if (regel.selektor.startsWith('@keyframes')) continue
    if (keyframeSchritt.test(regel.selektor)) continue
    if (!regel.selektor.includes(VORLAGEN_SCHICHT)) {
      fehler.push(`Zeile ${String(regel.zeile)}: ${regel.selektor}`)
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('die Vorlage ist lesbar — dieselbe Grenze wie das Grundblatt, auf ihrem eigenen Grund', () => {
  /*
   * **Warum das hier nicht verhandelbar ist.** Die Palette dieser Vorlage ist warm und dunkel — und
   * eine warme Palette verführt dazu, die gedämpften Töne „stimmungsvoll" zu machen. Genau daran ist
   * `--t3` im Grundblatt schon einmal gescheitert (siehe die Begründung dort): 6,2 : 1 formal
   * ausreichend, in 11 px gesperrten Großbuchstaben aber kaum zu sehen. Die Grenze ist **4,5 : 1**.
   */
  const grund = vorlagenToken('bg')
  const glas = vorlagenToken('glas').slice(0, 7)
  const paare: readonly (readonly [string, string, string])[] = [
    ['t', grund, 'Haupttext'],
    ['t2', grund, 'Nebentext'],
    ['t3', grund, 'gedämpfter Text'],
    ['a', grund, 'Akzent (Glut)'],
    ['a2', grund, 'Akzent, hell'],
    ['t2', glas, 'Nebentext auf der Insel'],
    ['t3', glas, 'gedämpfter Text auf der Insel'],
    ['a2', glas, 'Marke auf der Insel'],
  ]
  const schwach: string[] = []
  for (const [name, hinter, was] of paare) {
    const quote = kontrast(vorlagenToken(name), hinter)
    if (quote < 4.5) schwach.push(`--${name} (${was}): ${quote.toFixed(2)} : 1 auf ${hinter}`)
  }
  expect(schwach.join('\n')).toBe('')
})

test('die Vorlage kommt ohne `!important` aus', () => {
  // Wer eine Gestaltung mit `!important` durchsetzt, hat die **nächste** unmöglich gemacht: sie
  // müßte mit Ausrufezeichen gegen Ausrufezeichen antreten. Dieselbe Regel wie beim Grundblatt.
  expect(VORLAGEN_OHNE_KOMMENTARE).not.toContain('!important')
})

test('die Vorlage wird NACH dem Grundblatt geladen — sonst tut sie nichts', () => {
  /*
   * **Der Fehler, den diese Prüfung verhindert, ist unsichtbar.** Eine Vorlage belegt dieselben Token
   * mit anderen Werten; bei gleicher Spezifität gewinnt die **spätere** Regel. Stünde
   * `import './stil.css'` vor `import './app.css'`, gewänne der Grundsatz — und die Umschaltung wäre
   * wirkungslos, ohne daß irgendetwas rot würde: die Einstellung speichert, das Attribut steht im
   * Dokument, und das Bild ändert sich nicht. Genau die Sorte Fehler, die einen Nachmittag kostet.
   */
  const main = readFileSync(join(import.meta.dirname, '..', 'src', 'main.ts'), 'utf8')
  const grund = main.indexOf("import './app.css'")
  const vorlage = main.indexOf("import './stil.css'")
  expect(grund, "main.ts laedt app.css nicht").toBeGreaterThan(-1)
  expect(vorlage, "main.ts laedt stil.css nicht").toBeGreaterThan(-1)
  expect(vorlage).toBeGreaterThan(grund)
})
/**
 * **Der Himmel wird je Bild über `transform` bewegt — nicht über eine CSS-Variable.**
 *
 * ## Warum das eine Prüfung ist
 *
 * Die alte Fassung schrieb zwei CSS-Variablen (`--sky-x`, `--sky-y`) auf den **Elternknoten**; die
 * Transformation hing am Kind. Das sieht nach nichts aus und ist das Teuerste, was dieser Bildtakt
 * tun konnte: eine geänderte CSS-Variable muß für **jeden Nachfahren** neu aufgelöst werden.
 *
 * Gemessen am 16.10.2026 (`.pmh-build/himmel-last.mjs`, 100 Durchläufe, Stilberechnung erzwungen):
 *
 *     58,8 ms   CSS-Variable am Elternknoten      ← die alte Fassung
 *     50,1 ms   CSS-Variable am Kind selbst
 *      0,09 ms  `transform` unmittelbar am Kind   ← die jetzige Fassung
 *
 * Der Betreiber hat die Folge bemerkt, ohne den Grund zu kennen: *„es laggt und noch dazu wenn man
 * ganz raus zoomt ist es immer noch stock also kein change"*. Die Kosten hängen an der Zahl der
 * **Knoten im Baum** (4 053), nicht an der Zahl der sichtbaren Sterne — beim Rauszoomen wurde es
 * deshalb nicht besser.
 *
 * ## Warum der Quelltext und nicht ein Ablauf
 *
 * Die Wirkung ist eine **Zeit**, und eine Zeit in einem kopflosen Browser zu messen ist eine Aussage
 * über den kopflosen Browser (dort rechnet die Software, nicht die Grafikkarte — 58 ms dort sind auf
 * einer Grafikkarte vielleicht 3 ms). Was sich **übertragen** läßt, ist die **Bauweise**. Diese
 * Prüfung hält sie fest — die Zeiten stehen in `docs/status/himmel-physik.md` §4.6 und §4.8.
 *
 * **Und sie hält den Umbau vom 16.10.2026 fest:** der Himmel ist kein DOM mehr. Wer ihn zurückbaut,
 * baut die 58 ms zurück.
 */
test('der Himmel ist ein Feld im Raum — kein DOM', () => {
  /*
   * **Geprüft werden die REGELN, nicht die Erklärungen.** Der erste Anlauf dieser Prüfung sah im
   * ganzen Blatt nach `--sky-` — und schlug fehl, weil die Begründung darüber die Variable **nennt**
   * („hier stand `var(--sky-x)`"). Eine Prüfung, die ihre eigene Begründung verbietet, verbietet das
   * Denken. `OHNE_KOMMENTARE` ist derselbe Text mit geleerten Kommentaren.
   */
  expect(
    OHNE_KOMMENTARE,
    'app.css benutzt --sky-x/--sky-y in einer REGEL — das ist der Weg über den ganzen Sternenbaum',
  ).not.toContain('--sky-')
  const main = readFileSync(join(import.meta.dirname, '..', 'src', 'main.ts'), 'utf8')
  expect(main, 'main.ts schreibt wieder eine Himmels-Variable').not.toContain("setProperty('--sky-")
  expect(main, 'main.ts greift wieder je Bild in einen Himmelbaum').not.toContain('himmel-karte')
  /*
   * **Und das Feld wird wirklich gebaut.**
   *
   * Die ersten drei Prüfungen sind **Verbote** — sie wären auch dann grün, wenn es den Himmel gar nicht
   * mehr gäbe. Ein leerer Himmel ist aber kein Ergebnis, sondern ein Fehler, der wie eine Entscheidung
   * aussieht. Deshalb steht hier die **Zusage**: `main.ts` erzeugt das Feld, `scene.ts` zeichnet es als
   * Punktwolke.
   */
  expect(main, 'main.ts baut das Sternenfeld nicht').toContain('view.setzeSterne(')
  const scene = readFileSync(join(import.meta.dirname, '..', 'src', 'scene.ts'), 'utf8')
  expect(scene, 'die Szene nimmt kein Sternenfeld an').toContain('setzeSterne(')
  expect(scene, 'die Szene zeichnet keine Punkte').toContain('PointsMaterial(')
})
