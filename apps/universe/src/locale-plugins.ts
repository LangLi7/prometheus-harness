/**
 * Die Sprachpakete — als **Plugins**.
 *
 * **Was der Betreiber gesagt hat:** „sprache nicht vergessen das wir auf englisch standard und
 * deutsch unterstuetzen diese sprache fuer den harness wird durch eine language package/plugin
 * implementiert, wie beim Visual studio code extension verstehst du?"
 *
 * Genau so steht es hier. Der Kern (`i18n.ts`) kennt **keine** Sprache. Jedes Paket ist ein
 * eigenes Plugin:
 *
 *   `locale-en`  — Englisch, der Standard. **Nicht absteckbar**, siehe unten.
 *   `locale-de`  — Deutsch. Absteckbar wie jedes andere Plugin.
 *
 * **Warum Englisch nicht absteckbar ist.** Es ist der **Rueckfall**, gegen den alle anderen Pakete
 * gemessen werden (`Locales.missing()`). Wer den Rueckfall absteckt, bekommt auf einmal
 * Schluesselnamen statt Saetze — und zwar an allen Stellen gleichzeitig. Ein Plugin, dessen
 * Abschalten die Oberflaeche zerlegt, ist kein Plugin, sondern ein Fundament. Deshalb hat der
 * Befehl `disable locale-en` eine Begruendung statt einer stillen Wirkung.
 *
 * **Warum das die richtige Form fuer den Harness ist.** Der Harness wird Sprachen nicht als
 * Liste im Code fuehren, sondern als Pakete, die man dazulegt. Wer Japanisch will, legt `ja.ts`
 * daneben und traegt ein Plugin ein — an `i18n.ts` aendert sich nichts. Und ein Nutzer kann ein
 * Paket **ueberschreiben** (`Locales.register` ersetzt), ohne den Kern anzufassen.
 */
import type { Plugin, PluginRegistry, SettingContribution } from './plugins'
import type { Locales, LocalePack } from './i18n'
import { detectLocale } from './i18n'
import type { Settings } from './settings'
import { de } from './locales/de'
import { en } from './locales/en'

export interface LocaleEnv {
  readonly locales: Locales
  /**
   * Die Einstellungen.
   *
   * **Warum die Sprachwahl sie liest.** „Welche Sprache gilt" ist eine Einstellung — sie gehoert in
   * dieselbe Verwaltung wie Drehgeschwindigkeit und Zoom. Laege sie daneben in einem eigenen
   * Speicher, gaebe es zwei Orte fuer „was der Nutzer eingestellt hat", und der zweite waere der
   * falsche.
   */
  readonly settings: Settings
  /** Wird gerufen, wenn sich die Sprache aendert — die Oberflaeche muss neu beschriften. */
  readonly onSwitch: () => void
}

/** Die Kennung, die den Rueckfall traegt. */
export const BASE_LOCALE = 'en'

/**
 * Ein Sprachpaket als Plugin.
 *
 * **Beim Abschalten wird das Paket wirklich entfernt** (`unregister`), nicht nur „ausgeblendet".
 * Damit ist die Behauptung pruefbar: wer `disable locale-de` tippt, sieht die Oberflaeche
 * **wirklich** auf Englisch — nicht nur den Eintrag aus einer Liste verschwinden.
 *
 * **Was ein Sprachpaket bewusst NICHT tut:** es beschreibt **keine** Einstellung. Die Auswahl der
 * Sprache ist ein eigenes Plugin (`ui-language`), sonst gaebe es sie zweimal — einmal je Paket,
 * mit derselben Kennung. Ein Paket liefert **Saetze**, sonst nichts. Das ist die Grenze, die es
 * klein haelt: eine neue Sprache ist eine Datei mit Zeilen, kein Bildschirm.
 */
function localePlugin(pack: LocalePack, env: LocaleEnv, removable: boolean): Plugin {
  return {
    id: `locale-${pack.id}`,
    name: `${pack.label} (Sprachpaket)`,
    version: '0.1.0',
    description: `${pack.english} — ${Object.keys(pack.messages).length} Schlüssel.`,
    commands: [
      {
        name: 'lang',
        help: 'Sprache: lang [list|<kennung>|missing|<kennung>]',
        run: (args) => {
          // **Die Ausgabe eines Sprachbefehls gehoert in die Sprache.** Vorher standen hier deutsche
          // Saetze — auch dann, wenn die Oberflaeche auf Englisch lief. Wer `lang en` tippt und
          // danach deutsche Antworten bekommt, zweifelt zu Recht daran, dass es gewirkt hat.
          const sagen = (key: string, vars?: Readonly<Record<string, string | number>>): string =>
            env.locales.lookup(key, vars)
          const [sub = 'list', rest = ''] = args
          if (sub === 'list') {
            return env.locales
              .list()
              .map((vorhanden) => {
                const aktiv = vorhanden.id === env.locales.locale ? '→' : ' '
                return `${aktiv} ${vorhanden.id.padEnd(4)} ${vorhanden.label.padEnd(12)} ${vorhanden.english.padEnd(12)} ${Object.keys(vorhanden.messages).length} keys`
              })
          }
          if (sub === 'missing') {
            const id = rest || env.locales.locale
            const fehlend = env.locales.missing(id)
            const ueberzaehlig = env.locales.extra(id)
            const zeilen =
              fehlend.length === 0
                ? [sagen('term.lang.complete', { locale: id })]
                : [sagen('term.lang.missing', { n: fehlend.length, locale: id })]
            if (fehlend.length) zeilen.push(...fehlend.slice(0, 40).map((key) => `  −  ${key}`))
            if (ueberzaehlig.length) zeilen.push(...ueberzaehlig.slice(0, 40).map((key) => `  +  ${key}`))
            return zeilen
          }
          if (env.locales.set(sub)) {
            env.onSwitch()
            return [sagen('term.lang.set', { locale: sub })]
          }
          return [
            sagen('term.lang.unknown', { id: sub, list: env.locales.list().map((pack) => pack.id).join(', ') }),
          ]
        },
      },
    ],
    healthChecks: [
      () => {
        const aktiv = env.locales.locale
        const fehlend = env.locales.missing(aktiv)
        const paket = env.locales.list().find((p) => p.id === aktiv)
        return {
          name: `locale-${pack.id}:paket`,
          ok: Boolean(paket),
          message: paket
            ? `${paket.id} · ${Object.keys(paket.messages).length} Schlüssel · ${fehlend.length} offen`
            : `${aktiv} hat kein Paket`,
          ...(fehlend.length ? { details: { fehlend: fehlend.slice(0, 6).join(', ') } } : {}),
        }
      },
    ],
    onEnable: () => {
      env.locales.register(pack)
      env.onSwitch()
    },
    onDisable: () => {
      if (removable) env.locales.unregister(pack.id)
    },
  }
}

/**
 * Die **Auswahl** der Sprache — ein eigenes Plugin.
 *
 * **Warum getrennt vom Sprachpaket.** Die Einstellung `language.locale` gehoert keinem Paket:
 * sie zeigt auf **alle** Pakete. Laege sie in `locale-de`, waere die Liste der Sprachen bei
 * abgeschaltetem Deutsch um eine kuerzer — und die Einstellung verschwaende mit ihm. Ein Paket
 * liefert **Saetze**, die Auswahl liefert die **Menge**. Das sind zwei Dinge, also zwei Plugins.
 *
 * **Die Optionen sind eine Funktion.** Beim Eintragen sind die Pakete da, aber ihre Anzahl kann
 * sich aendern, sobald jemand ein Paket absteckt. Eine feste Liste waere nach dem ersten
 * Abschalten falsch.
 *
 * ── Der Fehler, der hier stand (gefunden am 16.10.2026) ──────────────────────────────────
 *
 * **Dieses Plugin beschrieb zwei Einstellungen und meldete sie nie an.** Der Kommentar weiter unten
 * in `main.ts` behauptete das Gegenteil („die Spracheinstellung ist eine gewoehnliche Einstellung im
 * Einstellungsbildschirm, `ui-language` beschreibt sie") — gemessen war sie **nicht** dort.
 *
 * Die Verwaltung kennt ein Feld erst nach `describe` (`settings.ts`). Ohne diesen Aufruf ist der
 * Wert **unbekannt**, und dann folgt Fehler auf Fehler:
 *
 * | Was | Wirkung |
 * |---|---|
 * | `Settings.set('language.locale', …)` | gibt `false` zurueck, der Sprachbildschirm der Insel ist ein **Blindgänger** |
 * | `Settings.get('language.locale', '')` beim Start | liefert den Rueckfall `''`, die Wahl ist **nicht gemerkt** |
 * | Der Einstellungsabschnitt „Sprache" | **fehlt** ganz (der Bildschirm zeigt nur, was einen Text hat) |
 *
 * Gemessen im Browser: der Sprachbildschirm listet „English (154)" und „Deutsch (154)", Deutsch ist
 * aktiv — ein Klick auf „English" aendert **nichts**: die Oberflaeche bleibt deutsch, `lang` bleibt
 * `de`, im Browserspeicher entsteht kein Eintrag, und nach dem Neuladen ist alles wie vorher.
 *
 * **Warum es niemandem auffiel.** Der Befehl `lang en` im Terminal **wirkt** (er ruft
 * `locales.set` unmittelbar) — nur gemerkt wird er nicht, weil `onSwitch` lediglich `relabel()` ruft.
 * Wer die Sprache auf diesem Weg umstellt, sieht sie wechseln und haelt die Sache fuer in Ordnung;
 * beim naechsten Start entscheidet wieder der Browser.
 *
 * Deshalb steht `onEnable` jetzt hier — genau wie bei `ui-controls`, wo derselbe Fehler schon einmal
 * gefunden wurde (`control-settings.ts`). Die Felder liegen dafuer in einer eigenen Konstanten:
 * zweimal dasselbe Feld zu beschreiben waere die naechste Gelegenheit, sie auseinanderlaufen zu lassen.
 */
function languagePlugin(env: LocaleEnv): Plugin {
  const felder: readonly SettingContribution[] = [
    {
      field: {
        kind: 'choice',
        key: 'language.locale',
        category: 'language',
        default: BASE_LOCALE,
        options: () =>
          env.locales.list().map((vorhanden) => ({
            value: vorhanden.id,
            label: `${vorhanden.label} (${vorhanden.english})`,
          })),
        keywords: ['language', 'sprache', 'locale', 'english', 'deutsch', 'i18n'],
      },
    },
    {
      field: {
        kind: 'boolean',
        key: 'language.chosen',
        category: 'language',
        default: false,
        /**
         * **Eine Marke, keine Einstellung — und deshalb ohne Text.**
         *
         * Ein Schalter „hat der Nutzer die Sprache selbst gewaehlt" waere unsinnig: er beschreibt
         * eine **Tatsache**, keine Vorliebe. Der Einstellungsbildschirm zeigt nur, was einen Text
         * hat (`settings-screen.ts`), also erscheint sie dort nicht. Lesen und setzen laesst sie
         * sich trotzdem — mit `settings language.chosen true`.
         */
        internal: true,
        keywords: ['language', 'sprache', 'gewaehlt', 'chosen', 'erkannt'],
      },
    },
  ]

  return {
    id: 'ui-language',
    name: 'Sprachauswahl',
    version: '0.1.0',
    description: 'Die Sprache der Oberfläche. Jede Sprache ist ein eigenes Paket.',
    settings: felder,
    /*
     * **Der Aufruf, der bis zum 16.10.2026 fehlte.** Ohne ihn kennt die Verwaltung die beiden Felder
     * nicht: `set` gibt `false` zurück (das Sprachpanel der Insel ist ein Blindgänger), `get` liefert
     * den Rückfall (die Wahl wird nicht gemerkt), und der Abschnitt erscheint nicht im
     * Einstellungsbildschirm. Die ganze Herleitung steht im Dateikopf von `languagePlugin`.
     *
     * **Warum beim Einschalten und nicht beim Bauen.** Ein abgeschaltetes Plugin darf seine Felder
     * nicht in der Verwaltung lassen — sonst stünde im Bildschirm eine Einstellung, die niemand mehr
     * liest. Dieselbe Regel wie bei `ui-controls` (`control-settings.ts`).
     */
    onEnable: () => {
      for (const eintrag of felder) env.settings.describe(eintrag.field)
    },
  }
}

/**
 * Wo der Start entschieden wird.
 *
 * **Warum das hier steht und nicht in `main.ts`.** Beim ersten Anlauf stand die Wahl in der Huelle,
 * **bevor** die Sprach-Plugins eingetragen waren — und griff deshalb ins Leere: `Locales.set()`
 * kannte kein Paket, `Settings.set('language.locale', …)` kannte keine Beschreibung. Zwei stille
 * Fehlschlaege, beide unsichtbar, weil danach alles aussah wie „Englisch, wie vorgesehen".
 *
 * Jetzt entscheidet die Wahl **hier**, nach dem Eintragen der Pakete. Die Huelle ruft nur noch und
 * kuemmert sich um das Beschriften.
 */
export interface LocaleStart {
  /** Ist dieser Raum schon eingerichtet? Siehe `hasSetup` in `room.ts`. */
  readonly hasSetup: () => boolean
  /** Merkt sich, dass eingerichtet wurde. */
  readonly markSetup: () => void
}

/**
 * Traegt die Sprachpakete ein und **entscheidet die Startsprache**.
 *
 * **Reihenfolge:** erst Englisch (der Rueckfall), dann Deutsch, dann die Auswahl, **danach** die
 * Entscheidung. Wird ein Paket abgeschaltet, faellt die Oberflaeche auf Englisch zurueck — nicht auf
 * Schluesselnamen, weil `Locales.unregister` die Standardsprache einspringen laesst.
 */
export function registerLocalePlugins(
  registry: PluginRegistry,
  env: LocaleEnv,
  start: LocaleStart,
): readonly string[] {
  const plugins: readonly Plugin[] = [
    localePlugin(en, env, false),
    localePlugin(de, env, true),
    languagePlugin(env),
  ]
  const ids: string[] = []
  for (const plugin of plugins) {
    registry.register(plugin)
    ids.push(plugin.id)
  }

  // ── Die Startsprache ────────────────────────────────────────────────────────────────────
  //
  // **Warum die Unterscheidung zwischen „erster Start" und „spaeter" noetig ist.** Ohne sie muesste
  // man raten, ob `en` im Speicher eine Entscheidung des Nutzers war oder nur die Vorgabe. Mit ihr
  // ist der erste Start freundlich (Deutsch auf einem deutschen System) und jede spaetere Wahl
  // **endgueltig** — auch Englisch.
  if (start.hasSetup()) {
    // **Der gespeicherte Wert gilt — und `Locales.set` prueft ihn.** Steht dort eine Sprache, zu der
    // es kein Paket gibt (weil es abgesteckt wurde), gibt `set` `false` zurueck und die Vorgabe bleibt
    // stehen. Stillschweigend etwas anderes zu tun waere die unangenehmste Form von Fehler.
    const gespeichert = env.settings.getString('language.locale', '')
    /**
     * **Und eine Ausnahme, die aus einem echten Aergernis entstanden ist.**
     *
     * Beim **ersten** Start wurde die Browsersprache nur *vorgeschlagen* und sofort als Entscheidung
     * gespeichert — auch dann, wenn sie Englisch war, weil die Erkennung nichts gefunden hatte. Ab
     * da galt sie als „vom Nutzer gewaehlt", und der Betreiber sah eine **englische** Oberflaeche auf
     * einem deutschen Rechner: „was hast du gemacht das es so leer und kapput aussieht".
     *
     * Nur eine **ausdrueckliche** Wahl des Nutzers zaehlt deshalb als Entscheidung
     * (`language.chosen`). Steht die Marke nicht, wird bei jedem Start neu erkannt — und wer die
     * Sprache im Einstellungsbildschirm umstellt, setzt sie.
     */
    const gewaehlt = env.settings.getBoolean('language.chosen', false)
    if (gewaehlt && gespeichert !== '' && env.locales.set(gespeichert)) return ids
  }

  // **Erster Start oder noch keine Wahl:** der Browser entscheidet.
  const vorschlag = detectLocale(env.locales.list().map((pack) => pack.id))
  env.locales.set(vorschlag)
  env.settings.set('language.locale', vorschlag)
  start.markSetup()

  return ids
}

/**
 * Die Sprache fuer den **ersten** Start: die des Browsers, wenn ein Paket dazu da ist.
 *
 * **Warum die Wahl gespeichert wird und nicht jedes Mal neu getroffen.** Wer auf einem deutschen
 * System Englisch einstellt, will Englisch — auch beim naechsten Laden. Deshalb schlaegt diese
 * Funktion nur vor; gespeichert ist die Entscheidung des Nutzers.
 */
export function initialLocale(locales: Locales): string {
  const vorhanden = locales.list().map((p) => p.id)
  if (vorhanden.includes(BASE_LOCALE)) return BASE_LOCALE
  return vorhanden[0] ?? BASE_LOCALE
}
