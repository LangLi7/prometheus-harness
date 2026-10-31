/**
 * Die Texte des Obsidian-Panels — **je Sprache eine Datei, keine zweite Liste im Code**.
 *
 * Dieselbe Begründung wie bei `@prometheus-harness/usage`: ein Text, den nur das Plugin kennt,
 * taucht in keiner Sprachprüfung auf, und ein fehlender Schlüssel fällt erst auf, wenn ihn jemand
 * liest. Die Quelle ist `locale/de.json` (und `locale/en.json` für die zweite Sprache); diese
 * Datei ist nur noch der **Zugang** dazu.
 *
 * Der Namensraum heißt `obsidian`, wie `NS` in `index.tsx`; die `meta`-Angaben daneben sind für die
 * Plugin-Verwaltung und gehören nicht zum Wörterbuch.
 *
 * @module @prometheus-harness/obsidian/locales
 */

import de from '../locale/de.json' with { type: 'json' }
import en from '../locale/en.json' with { type: 'json' }

/** Die deutschen Texte. */
export const DE: Record<keyof typeof de.obsidian, string> = de.obsidian

/** Die englischen Texte — dieselben Schlüssel. */
export const EN: Record<keyof typeof de.obsidian, string> = en.obsidian
