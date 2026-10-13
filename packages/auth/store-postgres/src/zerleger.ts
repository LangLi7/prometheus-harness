/**
 * Der Zerleger — Text in Stücke, die in `chunks` passen.
 *
 * ## Warum das eine reine Funktion ist und bleibt
 *
 * **Kein Modell, keine Datenbank, keine Datei.** Wer Text zerlegt, trifft
 * Entscheidungen (Größe, Überlappung, Grenzen) — und die sollen **prüfbar** sein,
 * ohne daß ein Einbettungsdienst läuft. Genau das fehlt hier ohnehin: `freellmapi`
 * antwortet **401**, `ollama` hat **keinen** veröffentlichten Port (gemessen am
 * 13.10.2026). Ein Zerleger, der ein Modell bräuchte, wäre **unprüfbar** — und
 * damit eine Behauptung.
 *
 * ## Die vier Entscheidungen
 *
 * | Entscheidung | Warum |
 * |---|---|
 * | **Absätze zuerst** | Ein Absatz ist eine **sinntragende** Einheit. Mitten im Satz zu trennen zerreißt den Sinn an der Stelle, an der gesucht wird |
 * | **Überlappung** (Vorgabe 15 %) | Ein Satz, der genau an einer Grenze liegt, steht sonst in **keinem** Stück vollständig — und wird nicht gefunden. Die Überlappung kostet **doppelten** Text; das ist der Preis |
 * | **Sätze, dann hart** | Ein Absatz, der länger ist als ein Stück, wird an **Satzenden** geteilt; erst wenn ein einzelner Satz zu lang ist, wird **hart** geschnitten. Ein hart geschnittener Satz ist die letzte Möglichkeit, nicht die erste |
 * | **`token` ist eine SCHÄTZUNG** | 4 Zeichen je Token ist eine Faustregel, kein Tokenizer. Wer genaue Zahlen braucht, muß den Tokenizer des Modells nehmen — und der gehört zum Einbetter, nicht hierher |
 *
 * ## Was der Zerleger NICHT tut
 *
 * Er **verschlüsselt nicht** (`chunks.content_cipher` erwartet `bytea` — das ist
 * Sache des Speichers), er **bettet nicht ein**, und er **schreibt nichts**.
 *
 * @module @prometheus-harness/store-postgres/zerleger
 */

/** Ein Stück, wie es aus dem Zerleger kommt — **vor** der Verschlüsselung. */
export interface Stueck {
  /** Die Reihenfolge im Dokument, bei 0 beginnend. */
  readonly ordnung: number
  /** Der reine Text **ohne** die Überlappung? Nein: **mit**, siehe `u eberlappung`. */
  readonly text: string
  readonly zeichen: number
  /** **Schätzung**, kein Tokenizer: `ceil(zeichen / 4)`. */
  readonly token: number
}

/** Die Vorgaben. */
export const ZERLEGER_VORGABEN = {
  /** Wie viele Zeichen ein Stück höchstens hat. */
  maxZeichen: 1200,
  /** Wie viel vom Vorgänger wiederholt wird — **Anteil**, nicht Zeichenzahl. */
  ueberlappung: 0.15,
} as const

/**Warum die Überlappung in **Zeichen** gerechnet wird und nicht in Token: die Tokenzahl ist geschätzt. */
function ueberlappungZeichen(maxZeichen: number, anteil: number): number {
  if (!Number.isFinite(anteil) || anteil < 0 || anteil >= 1) {
    // **Kein stilles Zurechtbiegen.** Ein Anteil von 1 oder mehr ergäbe eine
    // Endlosschleife: jedes Stück enthielte den ganzen Vorgänger.
    throw new Error(`die Überlappung muß zwischen 0 und 1 liegen (ausschließlich), ist aber ${String(anteil)}`)
  }
  return Math.floor(maxZeichen * anteil)
}

/**
 * Zerlegt einen Absatz, der zu lang ist — an **Satzenden**, sonst hart.
 *
 * @param absatz - der Text
 * @param max - die Höchstlänge
 * @returns die Teile
 */
function zerlegeAbsatz(absatz: string, max: number): string[] {
  if (absatz.length <= max) return [absatz]
  // Satzenden: `.`, `!`, `?` — jeweils mit dem folgenden Leerzeichen zusammen.
  const saetze = absatz.split(/(?<=[.!?])\s+/u)
  const teile: string[] = []
  let laufend = ''
  for (const satz of saetze) {
    if (satz.length > max) {
      // **Ein einzelner Satz ist zu lang** — die letzte Möglichkeit: hart schneiden.
      if (laufend !== '') {
        teile.push(laufend)
        laufend = ''
      }
      for (let i = 0; i < satz.length; i += max) teile.push(satz.slice(i, i + max))
      continue
    }
    if (`${laufend} ${satz}`.trim().length > max) {
      teile.push(laufend)
      laufend = satz
      continue
    }
    laufend = laufend === '' ? satz : `${laufend} ${satz}`
  }
  if (laufend !== '') teile.push(laufend)
  return teile
}

/**
 * Zerlegt einen Text in Stücke.
 *
 * @param text - der Text
 * @param vorgaben - Höchstlänge und Überlappungsanteil
 * @returns die Stücke, in Reihenfolge; **leer**, wenn der Text keinen Inhalt hat
 */
export function zerlege(
  text: string,
  vorgaben: { readonly maxZeichen?: number; readonly ueberlappung?: number } = {},
): readonly Stueck[] {
  const max = vorgaben.maxZeichen ?? ZERLEGER_VORGABEN.maxZeichen
  const anteil = vorgaben.ueberlappung ?? ZERLEGER_VORGABEN.ueberlappung
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`die Höchstlänge muß eine positive ganze Zahl sein, ist aber ${String(max)}`)
  }
  const wieder = ueberlappungZeichen(max, anteil)

  // **Absätze sind die erste Grenze.** `\r\n` und `\n` beide, und mehrere
  // Leerzeilen zählen als eine.
  const absaetze = text
    .replace(/\r\n/gu, '\n')
    .split(/\n\s*\n/u)
    .map((a) => a.trim())
    .filter((a) => a !== '')
  if (absaetze.length === 0) return []

  // Rohstücke: jeder Absatz, notfalls in Teile zerlegt.
  const roh = absaetze.flatMap((a) => zerlegeAbsatz(a, max))

  const stuecke: Stueck[] = []
  for (const [i, teil] of roh.entries()) {
    // **Die Überlappung kommt VORNE dran** — sie ist der Übergang vom Vorgänger.
    const vorgaenger = stuecke[i - 1]
    const schwanz = vorgaenger === undefined || wieder === 0 ? '' : `…${vorgaenger.text.slice(-wieder)}`
    const mitUeberlappung = `${schwanz}${schwanz === '' ? '' : ' '}${teil}`
    stuecke.push({
      ordnung: i,
      text: mitUeberlappung,
      zeichen: mitUeberlappung.length,
      token: Math.ceil(mitUeberlappung.length / 4),
    })
  }
  return stuecke
}
