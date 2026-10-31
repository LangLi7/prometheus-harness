/**
 * Die Texte des Usage-Panels — **je Sprache eine Datei, keine zweite Liste im Code**.
 *
 * ## Warum die Dateien und nicht mehr `DE`/`EN` als Objektliterale
 *
 * Bis hierher standen die Texte in dieser Datei. Das war bequem und falsch: dasselbe Wort stand
 * damit an einer Stelle, die nur das Plugin kennt, während das Sprachpaket
 * (`packages/client/locale`) seine Wörterbücher aus Dateien zieht. Ein Text, den nur ein Plugin
 * kennt, taucht in keiner Sprachprüfung auf — und ein fehlender Schlüssel fällt erst auf, wenn ihn
 * jemand liest.
 *
 * Jetzt ist `locale/de.json` die Quelle, `locale/en.json` die zweite Sprache, und diese Datei ist
 * nur noch der **Zugang** dazu. Der Namensraum heißt `usage`, wie `NS` in `index.tsx`; die
 * `meta`-Angaben daneben sind für die Plugin-Verwaltung und gehören nicht zum Wörterbuch.
 *
 * ## Was daraus folgt
 *
 * Wer einen Text ändert, ändert ihn in der JSON-Datei. Wer einen Schlüssel hinzufügt, fügt ihn in
 * **beiden** Dateien hinzu — sonst zeigt die englische Anzeige den Schlüsselnamen. Genau diese
 * Vollständigkeit prüft später der Zusammenlauf im Sprachpaket.
 *
 * @module @prometheus-harness/usage/locales
 */

import de from '../locale/de.json' with { type: 'json' }
import en from '../locale/en.json' with { type: 'json' }

/** Die Schlüssel des Namensraums — abgeleitet aus der deutschen Datei, nicht gepflegt. */
export type UsageKey = keyof typeof de.usage

/** Die deutschen Texte. */
export const DE: Record<UsageKey, string> = de.usage

/** Die englischen Texte — dieselben Schlüssel. */
export const EN: Record<UsageKey, string> = en.usage
