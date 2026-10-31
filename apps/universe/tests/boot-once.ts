/**
 * Startet die Huelle **einmal** und gibt sie zurueck.
 *
 * **Warum das eine eigene Datei ist.** `tests/boot.test.ts` prueft, dass der Start durchlaeuft;
 * `tests/chat-dom.test.ts` prueft, **was dabei entstanden ist**. Beide brauchen denselben Ablauf, und
 * ein Modul laesst sich in Bun nur **einmal** importieren — wer ihn zweimal startet, misst beim
 * zweiten Mal den Zustand des ersten.
 *
 * **`requestAnimationFrame` tut nichts** (siehe `dom-stub.ts`): hier wird der **Aufbau** geprueft,
 * nicht das Zeichnen. Und die Welt selbst scheitert an der fehlenden Grafikkarte — das ist erwartet
 * und wird **nicht** als Fehler gewertet.
 */
import { aktiviereGeruest, document_ } from './dom-stub'

export interface BootResult {
  /** Ist die Huelle bis zur Marke `__prometheusGestartet__` gekommen? */
  readonly gestartet: boolean
  /** Was danach geworfen wurde — in dieser Umgebung immer der fehlende WebGL-Kontext. */
  readonly fehler: string
}

let ergebnis: BootResult | null = null

/** Startet die Huelle genau einmal und merkt sich das Ergebnis. */
export async function bootOnce(): Promise<BootResult> {
  /*
   * **Erst das Geruest aufstellen — bei jedem Aufruf.**
   *
   * Bun faehrt die Testdateien in **einem** Prozesz, und jede bringt eigene globale Namen mit; wer
   * zuletzt kommt, gewinnt (`settings-modal.test.ts` setzt ein eigenes `document`). Die Huelle liest
   * `document` **zur Laufzeit** — wer nach dem Start noch in sie hineingreift, greift sonst in ein
   * fremdes Dokument. Gemessen: „within.querySelector is not a function", nur im ganzen Lauf, nie
   * allein. Siehe `aktiviereGeruest()` in `dom-stub.ts`.
   */
  aktiviereGeruest()
  if (ergebnis) {
    /**
     * **Die Marke wird wieder gesetzt.**
     *
     * Das Modul laeuft nur **einmal** — beim zweiten Aufruf ist es schon geladen, und die Marke, die
     * es gesetzt hat, wurde vom ersten Aufruf geloescht. Ohne diese Zeile scheitert jeder weitere
     * Test mit „der Startweg wurde nicht erreicht", obwohl der Start laengst durch ist. Ein
     * geloeschter Zustand, den man nicht zuruecksetzt, ist ein Fehler, der auf seinen zweiten
     * Aufrufer wartet.
     */
    setzeMarke()
    return ergebnis
  }
  Reflect.deleteProperty(globalThis, '__prometheusGestartet__')
  let fehler: unknown
  try {
    await import('../src/main')
  } catch (error) {
    fehler = error
  }
  ergebnis = {
    gestartet: (globalThis as Record<string, unknown>)['__prometheusGestartet__'] === true,
    fehler: fehler instanceof Error ? `${fehler.constructor.name}: ${fehler.message}` : '',
  }
  setzeMarke()
  return ergebnis
}

function setzeMarke(): void {
  Object.defineProperty(globalThis, '__prometheusGestartet__', {
    value: true,
    configurable: true,
    writable: true,
  })
}

export { document_ }
