/**
 * Sprachpaket **Deutsch** — ein Plugin über den Erweiterungspunkt des Kerns.
 *
 * ## Was dieses Modul ist — und was es **nicht** ist
 *
 * Es ist der **Trichter**: es meldet beim Kern eine Sprache an und hängt je Namensraum ein
 * Wörterbuch ein. Die Form ist die, die der Kern selbst vorgibt (`dsh-client-locale`,
 * README): `inject = ['locale']`, dann `addLanguage` und `register`.
 *
 * **[NOCH NICHT KOMPONIERT.]** Dieses Paket steht in **keiner** Profil-Zeile. Es läuft
 * heute **nicht**. Was geprüft ist, ist die **Logik des Trichters** — gegen einen
 * mitgeschriebenen `ctx` in `scripts/tests/sprachpaket.test.mjs` — und die
 * **Vollständigkeit** des Wörterbuchs gegen den Kern.
 *
 * Was **nicht** geprüft ist: daß der echte `LocaleRuntime` diese Anmeldung annimmt. Dafür
 * bräuchte es einen `ClientContext`; ein selbstgebauter wäre eine Attrappe, die nur beweist,
 * daß es mit **ihr** läuft. Das steht als offener Punkt in
 * `docs/status/live-anbindung.md` und in der Sprach-Bestandsaufnahme.
 *
 * ## Warum die Rückfallkette bei `en` enden **muß**
 *
 * Der Kern verlangt es: `fallback` zeigt auf die nächste Sprache, und Englisch ist die
 * letzte. Fehlt in `de` ein Schlüssel, wird englischer Text gezeigt — **nie** ein leerer
 * Platz und **nie** der Schlüsselname. Deshalb ist die Vollständigkeit meßbar und nicht
 * Geschmack: `bun scripts/sprachtrichter.mjs --pruefen packages/client/locale/de.json`
 *
 * @module @prometheus-harness/locale/de
 */

import type { Context } from '@deepseek-ai/cordis'
import de from '../de.json' with { type: 'json' }

/** Kennung des Pakets. */
export const name = 'locale-de'

/** Die Sprache, die dieses Paket anmeldet. */
export const SPRACHE = 'de'

/** Die Sprache, auf die zurückgefallen wird. **Muß** die des Kerns sein. */
export const RUECKFALL = 'en'

/**
 * Die Fächer des Pakets — ohne die reservierten Schlüssel (`_…`, Metadaten).
 *
 * Der erste Entwurf der Datei legte die Metadaten auf dieselbe Ebene wie die Namensräume;
 * die Vollständigkeitsprüfung meldete sie deshalb als „Namensräume, die der Kern nicht
 * kennt". Das war ein Fehler im **Format**, und er ist hier und im Trichter berichtigt.
 *
 * @returns die Namensräume mit ihrem Wörterbuch
 */
export function faecher(): Record<string, Record<string, string>> {
  const raus: Record<string, Record<string, string>> = {}
  for (const [schluessel, wert] of Object.entries(de)) {
    if (schluessel.startsWith('_')) continue
    raus[schluessel] = wert as Record<string, string>
  }
  return raus
}

/**
 * Meldet die Sprache an und hängt jedes Fach ein.
 *
 * Jede Anmeldung liegt in einem eigenen `ctx.effect`, damit sie beim Abbau **einzeln**
 * zurückgenommen wird — so, wie es das Rezept des Kerns zeigt.
 *
 * @param ctx - Kontext mit dem `locale`-Dienst
 */
export function apply(ctx: Context): void {
  // **Der Typ wird hier bewusst nicht erfunden.** `ctx.locale` ist der Dienst des Kerns;
  // seine genaue Gestalt steht in `dsh-client-locale/lib/types/client/index.d.ts`. Solange
  // dieses Paket nicht komponiert ist, wird es auch nicht typgeprüft (kein `package.json`,
  // kein `tsconfig.json`) — und das wird hier gesagt, statt es zu verschweigen.
  const locale = (ctx as unknown as { locale: Schnittstelle }).locale
  ctx.effect(
    () => locale.addLanguage({ id: SPRACHE, label: 'Deutsch', fallback: RUECKFALL }),
    'locale-de: Sprache',
  )
  for (const [namensraum, woerterbuch] of Object.entries(faecher())) {
    ctx.effect(
      () => locale.register(namensraum, SPRACHE, woerterbuch),
      `locale-de: ${namensraum}`,
    )
  }
}

/** Der Ausschnitt des `locale`-Dienstes, den dieses Paket benutzt. */
export interface Schnittstelle {
  addLanguage(definition: {
    readonly id: string
    readonly label: string
    readonly fallback: string
  }): () => void
  register(namespace: string, locale: string, dictionary: Record<string, string>): () => void
}
