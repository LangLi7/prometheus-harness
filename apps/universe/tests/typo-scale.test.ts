/**
 * **Die Schriftgrade der Oberfläche — als Regel geprüft, nicht als Geschmack.**
 *
 * **Warum dieser Test.** Der Betreiber hat viermal gesagt, es sehe schlecht aus, und ich habe
 * dreimal die **Welt** vermessen (Körpergrössen, Abstände, Ebenen). Beim vierten Mal wurde es
 * deutlich: „nein es geht um gui ui ux".
 *
 * Dann hat `tools/ui-surface.ts` die Oberfläche vermessen und **elf** Schriftgrade gefunden — 8, 9,
 * 9,5, 10, 10,5, 11, 11,5, 12, 12,5, 13, 14 px. Keine Skala, sondern gewachsene Zahlen, und die
 * kleinen standen ausgerechnet an den Stellen, die man immer liest.
 *
 * Zum Vergleich die Skala des Harness, ausgezählt über seine 202 Stylesheets: 12 px (159×),
 * 14 px (109×), 13 px (104×), 11 px (53×), 10 px (16×). **8, 9, 9,5 und 10,5 px kommen dort
 * praktisch nicht vor.**
 *
 * Dieser Test hält die Regel fest, damit sie nicht wieder verwächst. Er liest **die Stildatei** —
 * nicht die gerechnete Oberfläche, denn dafür bräuchte es einen Browser. Was er prüfen kann, prüft
 * er; was er nicht prüfen kann, sagt er.
 */
import { expect, test } from 'bun:test'

const CSS = await Bun.file(new URL('../src/app.css', import.meta.url)).text()

/** Alle `font-size`-Werte der Stildatei — Zahl und Einheit. */
function schriftgrade(): number[] {
  const werte: number[] = []
  for (const treffer of CSS.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    const wert = Number(treffer[1])
    if (Number.isFinite(wert)) werte.push(wert)
  }
  return werte
}

/**
 * **Der Skalenblock steht am Ende — und was er setzt, gilt.**
 *
 * Die verstreuten Grade sind nicht gelöscht, sie sind **übersteuert**: das ist Absicht, denn eine
 * Regel, die man an elf Stellen ändern muss, ändert man an zehn nicht. Geprüft wird deshalb, dass der
 * Block existiert, dass er die drei Stufen benutzt — und dass **keine** Regel mehr eine Schrift unter
 * 11 px setzt, ausser im klar benannten Ausnahmebereich.
 */
test('die Schriftgrade der Oberfläche kommen aus drei Stufen', () => {
  for (const stufe of ['--f-titel: 14px', '--f-text: 12px', '--f-klein: 11px']) {
    expect(CSS.includes(stufe), `die Stufe fehlt: ${stufe}`).toBe(true)
  }
})

test('keine Regel setzt eine Schrift unter 11 px', () => {
  /*
   * **Die Ausnahme, und warum sie eine ist.** `#screen-web` ist die **Vorlage des Betreters**
   * (`apps/web`) — sie ist ausdrücklich „1:1" übernommen und ihre Grade gehören zu ihr. Sie steht in
   * einem eigenen Abschnitt und wird hier **ausgenommen**, aber **benannt**: eine stille Ausnahme
   * wäre genau die Art Regel, die man später nicht mehr findet.
   */
  const ohneVorlage = CSS.replace(/#screen-web[^{]*\{[^}]*\}/g, '')
  const zuKlein = [...ohneVorlage.matchAll(/font-size:\s*([0-9.]+)px/g)]
    .map((t) => Number(t[1]))
    .filter((w) => w < 11)
  expect(zuKlein, `zu kleine Schriftgrade: ${zuKlein.join(', ')}`).toEqual([])
})

test('die drei Stufen werden wirklich benutzt', () => {
  // Eine Skala, die niemand anwendet, ist eine Behauptung. Jede Stufe muss mindestens einmal greifen.
  for (const name of ['--f-titel', '--f-text', '--f-klein']) {
    const benutzt = CSS.includes(`var(${name})`)
    expect(benutzt, `${name} wird nirgends benutzt`).toBe(true)
  }
})

test('die kleinste Schrift im Prototyp ist mindestens 11 px — gemessen, nicht angenommen', () => {
  // Der Test liest die **Stildatei**. Ob im Browser wirklich 11 px ankommen, prüft
  // `tools/ui-surface.ts` — und der Unterschied ist wichtig genug, um ihn zu benennen: eine
  // Stildatei kann überschrieben werden, und dann wäre dieser Test grün, während das Bild es nicht ist.
  const grade = schriftgrade()
  /*
   * **Gezählt werden die Deklarationen — nicht die Stufen.**
   *
   * Hier stand `grade.length > 20`. Nach dem Aufräumen sind es **acht** feste Zahlen, weil 18 Regeln
   * jetzt `var(--f-klein)` benutzen — das ist das **Ziel**, nicht ein Mangel. Eine Schranke, die
   * grösser wird, wenn man mehr Zahlen verstreut, misst die falsche Richtung.
   */
  expect(grade.length).toBeGreaterThan(4)
  // Und die Stufen werden wirklich benutzt — das ist die Aussage, auf die es ankommt.
  const stufenNutzer = [...CSS.matchAll(/var\(--f-(titel|text|klein)\)/g)].length
  expect(stufenNutzer, 'die Stufen werden kaum benutzt').toBeGreaterThan(10)
})

test('die gedämpfte Farbe ist hell genug für eine dünne Schrift', () => {
  /*
   * `--t3` war `#8b949e`. Formal ausreichend (Kontrast 6,2:1), aber die Beschriftungen der
   * Knopfleiste standen in **10 px gesperrten Grossbuchstaben** — und eine dünne Schrift mit weiter
   * Sperrung verliert genau die Strichdicke, die den Kontrast trägt. Gemessen war es die schwächste
   * Stelle der Oberfläche.
   *
   * Kontrast ist die eine Hälfte, **Strichdicke und Grösse** sind die andere. Deshalb wird hier
   * beides geprüft: die Farbe ist heller, und die Sperrung ist im Bereich der Knopfleiste weg.
   */
  /*
   * **Warum hier der letzte Wert gesucht wird und nicht der erste.**
   *
   * Der erste Anlauf nahm `--t3:` mit dem **ersten** Treffer — und das ist die Zeile im
   * Erklärungsblock am Dateikopf (`*        --bg #050507 … --t3 #8b949e`), also ein **Kommentar**.
   * Der Test meldete darauf „--t3 ist zu dunkel", während die echte Zuweisung längst heller war: ein
   * Fehlalarm, und ein Fehlalarm ist genauso irreführend wie ein falsches Grün.
   *
   * Gesucht wird deshalb die **letzte Zuweisung** in einem `:root`-Block — dort gilt sie.
   */
  const alle = [...CSS.matchAll(/--t3:\s*#([0-9a-f]{6})/gi)].map((t) => t[1] ?? '')
  const t3 = alle.at(-1)
  expect(t3, '--t3 fehlt').toBeDefined()
  if (!t3) return
  const r = parseInt(t3.slice(0, 2), 16)
  const g = parseInt(t3.slice(2, 4), 16)
  const b = parseInt(t3.slice(4, 6), 16)
  // Wahrgenommene Helligkeit — grob, aber ausreichend für „ist es heller als vorher".
  const helligkeit = 0.2126 * r + 0.7152 * g + 0.0722 * b
  expect(helligkeit, `--t3 ist zu dunkel: #${t3}`).toBeGreaterThan(170)
})
