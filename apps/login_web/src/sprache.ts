/**
 * `@prometheus-harness/login-web/sprache` — welche Sprache die Seite zeigt.
 *
 * ## Woher die Wahl kommt
 *
 * 1. **Der Keks** (`pmh_sprache`) — die Wahl des Menschen, sie schlägt alles. Denselben Keks
 *    liest der Rechner für `/start`; wer dort umschaltet, findet die Anmeldeseite in derselben
 *    Sprache vor.
 * 2. **Die Sprache des Browsers** (`navigator.language`) — nur der erste Teil vor dem
 *    Bindestrich, also `de` aus `de-CH`.
 * 3. **Die Vorgabe** aus dem Sprachpaket.
 *
 * **Ein unbekannter Wert ist kein Fehler.** Der Keks kommt vom Aufrufer und kann veraltet sein;
 * `istSprache` aus dem Paket entscheidet, und was nicht angeboten wird, gilt nicht.
 *
 * ## Warum die Liste vom Rechner kommt
 *
 * Die angebotenen Sprachen holt die Seite über `/api/pmh/auth/sprachen`. So steht die Liste an
 * **einer** Stelle (dem Sprachpaket des Rechners). Ist er nicht erreichbar, gilt die
 * mitgebündelte Liste — die Seite soll nicht leer bleiben, nur weil eine Abfrage scheitert.
 *
 * @module @prometheus-harness/login-web/sprache
 */

import {
  KEKS_SPRACHE,
  SPRACHEN,
  VORGABE_SPRACHE,
  istSprache,
  texteFuer,
  type Sprache,
  type Texte,
} from '@prometheus-harness/languages'
import { keksWert } from './api.ts'

export { KEKS_SPRACHE, SPRACHEN, texteFuer, type Sprache, type Texte }

/** Wo der Rechner die angebotenen Sprachen nennt. */
export const PFAD_SPRACHEN = '/api/pmh/auth/sprachen'

/**
 * Wählt die Sprache aus Keks und Browser.
 *
 * **Rein und deshalb prüfbar**: kein `document`, kein `navigator` — beides wird hereingereicht.
 *
 * @param ausKeks - der Wert aus dem Keks (darf fehlen oder unbekannt sein)
 * @param browser - `navigator.language` (darf fehlen)
 * @returns die Kennung einer **angebotenen** Sprache
 */
export function waehleSprache(ausKeks: string | undefined, browser: string | undefined): string {
  if (ausKeks !== undefined && istSprache(ausKeks)) return ausKeks
  if (browser !== undefined && browser !== '') {
    // `de-CH` und `de` sind dieselbe Sprache — der Zusatz ist eine Region, keine Sprache.
    const kurz = (browser.split('-')[0] ?? '').toLowerCase()
    if (istSprache(kurz)) return kurz
  }
  return VORGABE_SPRACHE
}

/**
 * Die Wahl beim Laden der Seite.
 *
 * @returns die Kennung der Sprache
 */
export function gewaehlteSprache(): string {
  const ausKeks = keksWert(KEKS_SPRACHE)
  const browser = typeof navigator === 'undefined' ? undefined : navigator.language
  return waehleSprache(ausKeks === '' ? undefined : ausKeks, browser)
}

/**
 * Merkt die Wahl im Keks.
 *
 * **Nicht `HttpOnly`** — die Seite muß ihn lesen und setzen können. Er enthält auch nichts
 * Geheimes: eine Sprache ist keine Berechtigung. `SameSite=Strict` wie die anderen Kekse,
 * damit er nicht mit fremden Anfragen mitgeschickt wird.
 *
 * @param id - die Kennung der gewählten Sprache
 */
export function merkeSprache(id: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${KEKS_SPRACHE}=${encodeURIComponent(id)}; Path=/; SameSite=Strict`
}

/**
 * Holt die angebotenen Sprachen vom Rechner.
 *
 * @returns die Liste; ohne brauchbare Antwort die mitgebündelte
 */
export async function ladeSprachliste(): Promise<readonly Sprache[]> {
  try {
    const antwort = await fetch(PFAD_SPRACHEN, { credentials: 'include' })
    const koerper = (await antwort.json()) as { readonly ok?: boolean; readonly value?: { readonly sprachen?: Sprache[] } }
    const liste = koerper.value?.sprachen
    if (koerper.ok === true && Array.isArray(liste) && liste.length > 0) return liste
  } catch {
    // Der Rechner antwortet nicht — dann gilt die mitgebündelte Liste. Kein Fehler für den Nutzer.
  }
  return SPRACHEN
}
