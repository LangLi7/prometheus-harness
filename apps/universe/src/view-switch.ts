/**
 * **Der Ansichtswechsel — eine Stelle für alle Wege.**
 *
 * ## Warum es diese Datei gibt
 *
 * Seit dem 14.10.2026 gibt es **vier** Wege, zwischen Chat, Vorlage und Universum zu wechseln:
 *
 * | Weg | Wo |
 * |---|---|
 * | die **Marke** oben links (`◆ PROMETHEUS`) | `main.ts`, `hudMarke` |
 * | der Eintrag **Chat / Universe** in der Dynamic Island | `main.ts`, `choose()` |
 * | der Befehl **`view`** im Terminal | `main.ts`, Plugin `ui-view` |
 * | der Knopf **„Zur Welt"** im Chat-Platzhalter | `chat-placeholder.ts` |
 *
 * Die ersten drei taten **dasselbe auf zwei verschiedene Arten** — und das war ein Fehler mit Folge:
 *
 * * `setMode(…)` blendet um und legt den Zustand im **Raum-Speicher** ab (`world.v1`).
 * * Die **Einstellung** `interface.mode` ist die ausdrueckliche Wahl des Nutzers und **gewinnt beim
 *   naechsten Laden** gegen diesen Speicher (`main.ts`, Abschnitt 2 des Starts:
 *   `mode = settings.getString('interface.mode', mode) === 'chat' ? 'chat' : 'os'`).
 *
 * Der Befehl `view` schrieb **beides**, die Insel-Eintraege nur `setMode`. Wer also ueber die Insel
 * in den Chat wechselte und die Seite neu lud, stand **wieder im Universum** — ein Wechsel, der
 * aussieht, als haette er nicht stattgefunden.
 *
 * **Die Lehre, und deshalb steht der Wechsel jetzt hier:** zwei Zustände, die dasselbe bedeuten,
 * muessen **zusammen** geschrieben werden — an einer Stelle, nicht an dreien.
 *
 * ## Warum reine Funktionen mit uebergebenen Wirkungen
 *
 * Diese Datei kennt weder Einstellungen noch Bildschirme. Sie bekommt sie als **Wirkungen**
 * (`Wechsel`) herein und gibt nichts zurueck ausser der Reihenfolge, in der sie geschehen. Damit ist
 * pruefbar, was sonst nur im Browser sichtbar waere: **dass gemerkt *und* umgeblendet wird**
 * (`tests/view-switch.test.ts`). Dasselbe Muster wie `mitBereich` in
 * `scripts/profile-patch.mjs` — und derselbe Grund.
 *
 * @module view-switch
 */

import type { Ansicht } from './camera'

/**
 * Die beiden Wirkungen eines Wechsels.
 *
 * **Warum zwei Namen und nicht ein `settings`-Objekt.** Der Aufrufer hier ist die Huelle; sie hat
 * beides. Was diese Datei braucht, ist nur *was* geschieht, nicht *womit* — und genau darum laesst
 * sich das im Test mit zwei Zaehlern nachstellen.
 */
export interface Wechsel {
  /** Blendet um — `setMode` in der Huelle. */
  readonly setze: (ziel: Ansicht) => void
  /** Merkt die Wahl — `settings.set('interface.mode', …)` in der Huelle. */
  readonly merke: (ziel: Ansicht) => void
}

/**
 * Wechselt die Ansicht: **erst merken, dann umblenden**.
 *
 * **Warum diese Reihenfolge.** Das Merken kann eine Aenderungsmeldung ausloesen (der
 * Einstellungsbildschirm und die Einstellung `interface.mode` haengen daran), und die ruft
 * ihrerseits `setMode`. Stuende das Umblenden zuerst, gaebe es zwei Wechsel in zwei Richtungen —
 * sichtbar als kurzes Zucken. So ist der letzte Aufruf der gemeinte.
 *
 * @param an - die Wirkungen der Huelle
 * @param ziel - die Ansicht, die es werden soll
 */
export function wechsleAnsicht(an: Wechsel, ziel: Ansicht): void {
  an.merke(ziel)
  an.setze(ziel)
}

/**
 * Der Wert, unter dem eine Ansicht in den **Einstellungen** steht.
 *
 * **Warum die beiden Worte nicht gleich heissen.** Im Befehl und im Speicher heisst die Welt `os`
 * (sie ist ein Zustand des Rechners), in den Einstellungen `world` (dort geht es um die Sache). Der
 * Wert stand vorher an jeder Schreibstelle einzeln als `naechste === 'os' ? 'world' : naechste` —
 * zweimal dieselbe Umrechnung, und wer eine dritte Schreibstelle anlegt, vergisst sie.
 *
 * @param ziel - die Ansicht
 * @returns der Einstellungswert
 */
export function alsEinstellung(ziel: Ansicht): string {
  return ziel === 'os' ? 'world' : ziel
}
