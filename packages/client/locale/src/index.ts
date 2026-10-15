/**
 * Sprachpaket **Deutsch** — ein Plugin über den Erweiterungspunkt des Kerns.
 *
 * ## Was dieses Modul ist — und was es **nicht** ist
 *
 * Es ist der **Trichter**: es meldet beim Kern eine Sprache an und hängt je Namensraum ein
 * Wörterbuch ein. Die Form ist die, die der Kern selbst vorgibt (`dsh-client-locale`,
 * README): `inject = ['locale']`, dann `addLanguage` und `register`.
 *
 * **[KOMPONIERT seit dem 14.10.2026.]** Das Paket steht als Zeile in der Patch-Schicht des
 * Profils (eingetragen von `scripts/profile-patch.mjs`, id `pmh-client-locale`), erscheint in
 * der Startliste des Browsers und wird unter `/plugins/…/client.js` ausgeliefert — alles drei
 * gemessen mit `docs/status/messsonden/client-komposition-sonde.mjs`.
 *
 * **Der Zeuge für die Laufzeit** ist `docs/status/messsonden/sprachpaket-laufzeit-sonde.mjs`:
 * dort läuft die **Originalklasse** `LocaleRuntime` aus
 * `node_modules/@deepseek-ai/dsh-client-locale/lib/client.js` — nicht eine nachgebaute — und
 * unser **gebautes** Bündel wird an ihr ausgeführt. Ergebnis: die Sprachliste führt
 * `{ id: "de", label: "Deutsch", fallback: "en" }`, `setLocale("de")` greift, und sieben Proben
 * liefern genau den Text aus `de.json`.
 *
 * **Die Grenze dieser Messung.** Der Cordis-Kontext um die Laufzeit ist mitgeschrieben
 * (`new Context()`), und die Anzeige-sitze des Kerns (`ctx.slots`, `document`) werden nicht
 * besetzt. Gemessen ist damit die **Laufzeit und ihre Regeln**, nicht was ein Browser
 * **anzeigt**. Bis zum 14.10.2026 stand hier, es sei „nicht geprüft" — das war richtig,
 * solange es keine Sonde gab; jetzt ist es **gemessen mit benannter Grenze**.
 *
 * Was weiterhin **nicht** gemessen ist: das Verhalten des vollen Client-Kerns im Browser
 * (React-Mount, Einstellungszeile, HMR).
 *
 * ## Warum die Rückfallkette bei `en` enden **muß**
 *
 * Der Kern verlangt es: `fallback` zeigt auf die nächste Sprache, und Englisch ist die
 * letzte. Fehlt in `de` ein Schlüssel, wird englischer Text gezeigt — **nie** ein leerer
 * Platz und **nie** der Schlüsselname. Deshalb ist die Vollständigkeit meßbar und nicht
 * Geschmack: `bun scripts/language-funnel.mjs --pruefen packages/client/locale/de.json`
 *
 * @module @prometheus-harness/locale/de
 */

import type { Context } from '@deepseek-ai/cordis'
import de from '../de.json' with { type: 'json' }

/** Kennung des Pakets. */
export const name = 'locale-de'

/**
 * Die Dienste, die dieses Plugin braucht — **der Client-Kern liest das**.
 *
 * **Gemessen, nicht geraten.** Ein Client-Bündel des Kerns endet mit
 * `exports.apply = apply; exports.inject = inject;` (z. B.
 * `node_modules/@deepseek-ai/dsh-client-locale/lib/client.js`, dort
 * `const inject = ["slots", "remote", "configForms"]`). Diese Datei exportierte `apply`,
 * aber **kein `inject`** — der Kern hätte nicht gewußt, daß das Plugin den Dienst `locale`
 * braucht. Der Dienst heißt `locale`: der Kern legt ihn selbst an (`ctx.provide("locale", …)`
 * im Bündel des Sprach-Plugins).
 *
 * Nicht zu verwechseln mit `dsh.client.inject` in der `package.json`: dort stehen
 * **Paketnamen** (Ladereihenfolge), hier **Dienstnamen**.
 */
export const inject = ['locale']

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
