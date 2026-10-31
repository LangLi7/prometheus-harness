/**
 * Die Texte des Starters — **je Sprache eine Datei, keine zweite Liste im Code**.
 *
 * Dieselbe Begründung wie bei `@prometheus-harness/usage`: die Quelle ist `locale/de.json` (und
 * `locale/en.json`), diese Datei ist nur der Zugang dazu. Das Sprachpaket übernimmt die Fächer
 * über `scripts/language-merge.mjs`.
 *
 * Der Namensraum heißt `launcher`, wie `NS` in `index.tsx`.
 *
 * @module @prometheus-harness/launcher/locales
 */

import de from '../locale/de.json' with { type: 'json' }
import en from '../locale/en.json' with { type: 'json' }

/** Die deutschen Texte. */
export const DE: Record<keyof typeof de.launcher, string> = de.launcher

/** Die englischen Texte — dieselben Schlüssel. */
export const EN: Record<keyof typeof de.launcher, string> = en.launcher
