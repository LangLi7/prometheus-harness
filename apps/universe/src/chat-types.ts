/**
 * Die Formen, die der Chat **bekommen** wird — hier bleiben sie stehen.
 *
 * **Warum die Typen nicht mit der Implementierung verschwinden.** Der nächste Agent baut den
 * Verlauf, aber die **Schnittstelle zur Hülle** steht schon: `main.ts` ruft `mountChat(host, …)` und
 * bekommt eine Funktion zum Anhängen von Nachrichten zurück. Wären die Typen mit der
 * Implementierung gelöscht, müsste er auch die Hülle anfassen — und die ist fertig.
 *
 * **Was hier bewusst NICHT steht:** die Form der **Schnittstelle zum Harness**. Ob Nachrichten über
 * HTTP, über einen Strom oder über ein Plugin kommen, ist die erste Entscheidung des nächsten
 * Agenten; eine geratene Form wäre eine Vorgabe, die niemand geprüft hat.
 */

/** Eine Nachricht im Verlauf. */
export interface Message {
  readonly who: 'you' | 'prometheus'
  readonly text: string
  /** Denk-Karte über der Antwort. */
  readonly thought?: string
  /** Befehl, der als Codeblock erscheint. */
  readonly code?: string
  /** Speicher-Verweis, z. B. `#a41f`. */
  readonly memoryRef?: string
}
