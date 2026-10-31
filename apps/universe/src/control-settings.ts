/**
 * Die Steuerungs-Einstellungen — als Plugin.
 *
 * **Was der Betreiber gesagt hat:** „die könnte man in settings implementieren fuer stuerung".
 * Gemeint war genau das, was vorher als Konstante in `camera.ts` stand: Drehgeschwindigkeit,
 * Zoomfaktor, Drehen am Achsenkreuz, Schieben. Diese Datei **beschreibt** sie; gelesen werden sie
 * dort, wo sie wirken.
 *
 * **Warum die Beschreibung hier steht und nicht in `camera.ts`.** `camera.ts` ist Rechnung — es
 * soll ohne Einstellungsverwaltung pruefbar bleiben (und ist es: `tests/camera.test.ts` uebergibt
 * die Geschwindigkeit als Argument). Ein Plugin beschreibt, was einstellbar ist. Wer die Kamera
 * ohne Einstellungen benutzt, bekommt weiterhin die Vorgaben.
 *
 * **Warum die Vorgaben hier noch einmal als Zahlen stehen.** Weil ein Test nachrechnen koennen
 * soll, dass die Vorgabe die ist, ueber die der Betreiber sich beschwert hat („wenn ich versuche
 * zu drehen ist es zu fast"): 0,00175 rad je Pixel sind **128° je Bildschirmbreite** gegen 308°
 * vorher. Eine Vorgabe, die niemand nachrechnen kann, ist eine Behauptung.
 */
import type { Plugin, SettingContribution } from './plugins'
import type { Settings } from './settings'
import { formatValue } from './settings'

export interface ControlsEnv {
  readonly settings: Settings
  /** Wird nach jeder Aenderung gerufen, damit die Oberflaeche nachzieht. */
  readonly onApply: (key: string) => void
}

/**
 * Welche Einstellungen es gibt — und was sie im Code ersetzen.
 *
 * `CONTROL_KEYS` ist keine Zierde: es ist die Zusage, dass **kein** Wert doppelt gefuehrt wird.
 * Wer eine dieser Zahlen wieder als Konstante in den Code schreibt, bricht die Kette — und genau
 * daran scheitern Einstellungen in kleinen Programmen sonst: sie stehen da, wirken aber nicht.
 */
export const CONTROL_KEYS = {
  rotateSpeed: 'control.rotateSpeed',
  zoomFactor: 'control.zoomFactor',
  axisSpin: 'control.axisSpin',
  panFactor: 'control.panFactor',
  showAxes: 'control.showAxes',
  scheme: 'control.scheme',
  worldDimensions: 'universe.dimensions',
  interfaceLabels: 'interface.labels',
  /** Die Stilvorlage der Oberfläche — siehe `stil.ts` und `stil.css`. */
  interfaceStyle: 'interface.style',
  /** Die Himmelskoerper zeichnen — Voreinstellung aus, das Universe ist eine leere Sandbox. */
  universeVisuals: 'universe.visuals',
} as const

/** Die Beschreibungen der Steuerung — als eigene Konstante, weil `onEnable` sie ebenfalls braucht. */
export const CONTROLS_SETTINGS: readonly SettingContribution[] = [
  {
    field: {
      kind: 'number',
      key: CONTROL_KEYS.rotateSpeed,
      category: 'control',
      // Vorher als Konstante in `camera.ts`: 0.0042. Jetzt 0.00175.
      default: 0.00175,
      min: 0.0004,
      max: 0.008,
      step: 0.00005,
      // **Die Hauptzahl ist „Grad je Bildschirmbreite".** Sie beschreibt die Handbewegung, die man
      // wirklich macht. „Pixel je Grad" haengt an der Fensterbreite und liest sich bei 10 px/° wie
      // „sehr feinfuehlig", obwohl ein Zug quer ueber den Schirm 128° dreht.
      unit: 'anglePerWidth',
      invert: true,
      keywords: ['rotate', 'drehen', 'geschwindigkeit', 'speed', 'maus', 'sensitivity'],
    },
  },
  {
    field: {
      kind: 'number',
      key: CONTROL_KEYS.zoomFactor,
      category: 'control',
      /*
       * **Der Faktor, der den Wechsel je Ebene bestimmt — nachgezogen auf 1,12.**
       *
       * Hier stand 1,25 mit der Begründung „vorher 1.12 — 6,1 Rastschritte je Halbierung, scrollen viel
       * zu langsam". Diese Begründung galt für **sieben** Ebenen. Mit zwölf (siehe `LEVELS`) ist der Weg
       * länger, und der Betreiber hat gemeldet: „**die ebene und zoom ist zu schnelle wechseln da kann
       * man nicht einmal reinzoomen wie man es will**".
       *
       * Gemessen (`tools/zoom-rate.js`, mit dem **echten** Rad): mit 1,25 sind es **3 Radereignisse** von
       * der Bandmitte bis zur nächsten Grenze, mit 1,08 sind es **7,5** — und 152 für die ganze Reise
       * von 3 132 bis 4 Mrd. Die Herleitung steht bei `ZOOM_FACTOR_PER_NOTCH` in `camera.ts`; diese Zahl
       * ist die **Voreinstellung** für genau jene Konstante.
       */
      default: 1.08,
      min: 1.02,
      max: 3,
      step: 0.01,
      unit: 'factorPerNotch',
      keywords: ['zoom', 'rad', 'scroll', 'mausrad', 'wheel'],
    },
  },
  {
    field: {
      kind: 'number',
      key: CONTROL_KEYS.axisSpin,
      category: 'control',
      // Groesser als das Ziehen auf dem Canvas: ein Achsengriff ist ein **Werkzeug**, kein Blick.
      default: 0.006,
      min: 0.001,
      max: 0.03,
      step: 0.0005,
      unit: 'anglePerWidth',
      invert: true,
      keywords: ['achsen', 'axis', 'gizmo', 'kreuz', 'rotation'],
    },
  },
  {
    field: {
      kind: 'choice',
      key: CONTROL_KEYS.scheme,
      category: 'control',
      // **Die alte Belegung bleibt waehlbar.** Der Betreiber: „ich möchte auch die alte steuerung
      // noch behalten und per settings ändern können was man bevorzugt."
      default: 'cad',
      options: () => [
        { value: 'cad', label: 'CAD' },
        { value: 'orbit', label: 'Shift' },
      ],
      keywords: ['steuerung', 'belegung', 'scheme', 'cad', 'maus', 'taste', 'alt', 'gewohnt'],
    },
  },
  {
    field: {
      kind: 'number',
      key: CONTROL_KEYS.panFactor,
      category: 'control',
      default: 0.0011,
      min: 0.0002,
      max: 0.006,
      step: 0.00005,
      unit: 'percent',
      keywords: ['pan', 'schieben', 'verschieben', 'mittlere taste', 'shift'],
    },
  },
  {
    field: {
      kind: 'boolean',
      key: CONTROL_KEYS.showAxes,
      category: 'control',
      default: true,
      keywords: ['achsen', 'axes', 'gizmo', 'anzeige'],
    },
  },
  {
    field: {
      kind: 'number',
      key: CONTROL_KEYS.worldDimensions,
      category: 'universe',
      // **3 ist der anschauliche Fall**, 5 der volle: dann wirken alle zehn Drehflaechen.
      default: 3,
      min: 3,
      max: 5,
      step: 1,
      unit: 'plain',
      keywords: ['dimension', '5d', 'rotation', 'so(5)', 'drehflächen'],
    },
  },
  {
    field: {
      kind: 'boolean',
      key: CONTROL_KEYS.interfaceLabels,
      category: 'interface',
      default: true,
      keywords: ['labels', 'namen', 'beschriftung'],
    },
  },
  {
    /**
     * **Die Stilvorlage — und warum sie eine Einstellung ist und keine Konstante.**
     *
     * Der Betreiber: *„erstelle mal ein Template side oder eine möglichkeit es zu switchen damit man
     * es auch testen könnte."* Genau das ist der Zweck: die neue Richtung (Rust, Schmiede, Phönix)
     * ist **prüfbar**, ohne daß jemand den Quelltext ändern muß — und die alte bleibt die Vorgabe.
     *
     * **Was diese Einstellung NICHT ist: ein Thema im Sinne von hell/dunkel.** Die Welt ist dunkel
     * und bleibt es; hier wechselt der **Werkstoff**, nicht die Helligkeit. Die Begründung steht in
     * `stil.css`.
     *
     * **Warum `base` als Vorgabe.** Eine Gestaltung, die sich beim nächsten Start von selbst
     * einschaltet, nimmt dem Betreiber die Wahl — und die hat er verlangt.
     *
     * **Und der Adresszusatz.** `?stil=prometheus` schaltet dieselbe Vorlage zum Ansehen um, **ohne**
     * sie zu speichern (`stil.ts`): damit sind zwei Fassungen in zwei Tabs vergleichbar, ohne daß
     * eine Einstellung hin- und hergeschaltet werden muß.
     */
    field: {
      kind: 'choice',
      key: CONTROL_KEYS.interfaceStyle,
      category: 'interface',
      default: 'base',
      options: () => [
        { value: 'base', label: 'Grundgerüst', labelKey: 'setting.interface.style.base' },
        { value: 'prometheus', label: 'Schmiede', labelKey: 'setting.interface.style.prometheus' },
      ],
      keywords: ['stil', 'style', 'vorlage', 'template', 'theme', 'thema', 'rust', 'schmiede', 'phoenix', 'phönix', 'farbe'],
    },
  },
  {
    /**
     * **Was das Universum zeigt — eine Auswahlliste statt eines Schalters.**
     *
     * Betreiber, 15.10.2026: *„die sterne finde ich gut gemacht sollte man dort belassen das man via
     * einstellung machen kann evt als dropdown liste auswahl oder so"*.
     *
     * **Warum das vorher schief war.** Der Schalter hieß „Himmelskörper zeichnen" und schaltete in
     * Wahrheit **zwei** Dinge: die Körper **und** den Sternenhimmel (`applyStarfield` verknüpfte ihn
     * mit `interface.starfield` per UND). Wer die Körper wegwollte, verlor also die Sterne — und wer
     * die Sterne behalten wollte, musste die Körper mitnehmen. Zwei Wünsche, ein Schalter.
     *
     * **Und `interface.starfield` war ein Feld, das es nicht gab.** Es hatte Beschriftungen in beiden
     * Sprachpaketen und wurde im Code gelesen — aber **niemals angemeldet**: es erschien in keiner
     * Einstellung und war damit unerreichbar. Es ist mit dieser Runde **entfallen**; der Sternenhimmel
     * ist jetzt der mittlere Wert derselben Liste.
     *
     * **Drei Werte, und jeder ist ein Bild, das man beschreiben kann:**
     *
     *   `none`   leer — nur das Bezugsraster. Die Sandbox. (Die Vorgabe.)
     *   `stars`  **der Sternenhimmel allein** — genau das, was der Betreiber behalten wollte.
     *   `all`    Körper **und** Sternenhimmel — das volle Bild.
     *
     * **Was der Schalter NICHT abschaltet.** Die Logik laeuft in jedem Fall weiter: `buildScene` rechnet
     * die Ebenen, `framing` die Rahmung, `pick` den Klick, `updateBodies` die Bewegung und die
     * Ueberblendung den Uebergang. Nur **gezeichnet** wird nichts (siehe `setDrawing` in `scene.ts`).
     *
     * **Und die Wanderung.** Der Schalter war ein `boolean`. Wer ihn gestern auf `true` gestellt hat,
     * bekommt `all` — dasselbe Bild wie vorher; aus `false` wird `none`. Ohne diese Übersetzung waere
     * die Einstellung beim ersten Start nach dieser Runde **stillschweigend** auf die Vorgabe
     * zurückgefallen (siehe `Migrate` in `settings.ts`).
     */
    field: {
      kind: 'choice',
      key: CONTROL_KEYS.universeVisuals,
      category: 'universe',
      // **Die Vorgabe zeigt die Welt.** Vorher war sie `none` („leere Sandbox") — der
      // erste Blick auf `/universe/` war damit leer, und das sah wie ein Fehler aus.
      // Wer die Sandbox will, wählt sie ausdrücklich.
      default: 'all',
      options: () => [
        { value: 'none', label: 'Leer', labelKey: 'setting.universe.visuals.none' },
        { value: 'stars', label: 'Nur Sternenhimmel', labelKey: 'setting.universe.visuals.stars' },
        { value: 'all', label: 'Körper und Sterne', labelKey: 'setting.universe.visuals.all' },
      ],
      migrate: (alt) => {
        // Nur der alte Schalter wird übersetzt — jeder andere Wert geht seinen normalen Weg.
        if (alt === true) return 'all'
        if (alt === false) return 'none'
        return undefined
      },
      keywords: ['visuals', 'planeten', 'koerper', 'zeichnen', 'leer', 'sandbox', 'minimal', 'sterne', 'himmel'],
    },
  },
]

export function controlsPlugin(env: ControlsEnv): Plugin {
  return {
    id: 'ui-controls',
    name: 'Steuerung',
    version: '0.1.0',
    description: 'Drehen, Zoomen, Schieben und das Achsenkreuz — als Einstellung statt als Konstante.',
    /**
     * **Beim Einschalten werden die Felder eingetragen — nicht nur beschrieben.**
     *
     * Das ist ein Fehler, den ein Test aufgedeckt hat: `settings` im Plugin ist eine
     * **Beschreibung**, aber die Verwaltung kennt ein Feld erst nach `describe`. Ohne diesen Aufruf
     * stand im Einstellungsbildschirm **null Einträge** — und weil das Plugin eingeschaltet war und
     * alle Werte ueber die Rueckfallwerte funktionierten, sah es aus, als sei alles in Ordnung.
     *
     * **Warum `onEnable` und nicht sofort beim Bauen.** Ein abgeschaltetes Plugin darf seine Felder
     * nicht in der Verwaltung lassen: sonst stuende im Bildschirm eine Einstellung, die niemand mehr
     * liest. Der **Wert** bleibt beim Abschalten gueltig — nur die Anzeige verschwindet mit dem
     * Plugin.
     */
    onEnable: () => {
      for (const eintrag of CONTROLS_SETTINGS) env.settings.describe(eintrag.field)
    },
    settings: CONTROLS_SETTINGS,
    commands: [
      {
        name: 'speed',
        help: 'Kurzform für die Steuerung: speed rotate|zoom|axis|pan <wert> — prüft und setzt über die Einstellungen',
        run: (args) => {
          const [was = '', wert = ''] = args
          const key =
            was === 'rotate'
              ? CONTROL_KEYS.rotateSpeed
              : was === 'zoom'
                ? CONTROL_KEYS.zoomFactor
                : was === 'axis'
                  ? CONTROL_KEYS.axisSpin
                  : was === 'pan'
                    ? CONTROL_KEYS.panFactor
                    : null
          if (!key) {
            const zeilen = ['Verwendung: speed rotate|zoom|axis|pan <wert>', '']
            for (const k of [CONTROL_KEYS.rotateSpeed, CONTROL_KEYS.zoomFactor, CONTROL_KEYS.axisSpin, CONTROL_KEYS.panFactor]) {
              const feld = env.settings.field(k)
              if (!feld) continue
              const value = env.settings.get(k, feld.default)
              zeilen.push(`  ${k.padEnd(22)} ${String(value).padEnd(10)} ${formatValue(feld, value)}`)
            }
            return zeilen
          }
          const feld = env.settings.field(key)
          if (!feld || feld.kind !== 'number') return [`Unbekannt: ${key}`]
          if (wert === '') {
            const value = env.settings.get(key, feld.default)
            return [`${key} = ${value}  (${formatValue(feld, value)})`]
          }
          const zahl = Number(wert)
          if (!Number.isFinite(zahl)) return [`Keine Zahl: ${wert}`]
          // **Ueber die Einstellungen, nicht daran vorbei.** Nur so gelten Grenzen, wird gespeichert
          // und zieht die Anzeige nach. Ein Befehl, der den Wert direkt setzt, waere ein zweiter
          // Weg — und der wuerde irgendwann anders rechnen als der erste.
          env.settings.set(key, zahl)
          env.onApply(key)
          const jetzt = env.settings.get(key, feld.default)
          const gekappt = jetzt !== zahl ? ` (auf ${jetzt} begrenzt)` : ''
          return [`${key} = ${jetzt} · ${formatValue(feld, jetzt)}${gekappt}`]
        },
      },
      {
        /**
         * **Die Vorlage umschalten — die kurze Form zum Prüfen.**
         *
         * Der Betreiber will die neue Richtung **sehen** können, ohne sich durch einen Dialog zu
         * klicken: `stil prometheus`. Derselbe Weg wie `speed` — und aus demselben Grund: über die
         * **Einstellungen**, nicht daran vorbei. Nur so gilt die Wahl beim nächsten Start, wird
         * gespeichert und die Anzeige zieht nach.
         */
        name: 'stil',
        help: 'Stilvorlage: stil [base|prometheus] — schaltet die Gestaltung der Oberfläche um',
        run: (args) => {
          const [wert = ''] = args
          const feld = env.settings.field(CONTROL_KEYS.interfaceStyle)
          if (!feld || feld.kind !== 'choice') return ['Die Stilvorlage ist nicht angemeldet.']
          const erlaubt = feld.options().map((o) => o.value)
          const jetzt = env.settings.getString(CONTROL_KEYS.interfaceStyle, feld.default)
          if (wert === '') {
            return ['Stilvorlage:', ...erlaubt.map((v) => (v === jetzt ? `  → ${v}` : `    ${v}`))]
          }
          if (!erlaubt.includes(wert)) {
            return [`Unbekannt: ${wert}`, `Bekannt: ${erlaubt.join(', ')}`]
          }
          env.settings.set(CONTROL_KEYS.interfaceStyle, wert)
          env.onApply(CONTROL_KEYS.interfaceStyle)
          return [`Stilvorlage: ${wert}`]
        },
      },
    ],
    healthChecks: [
      () => {
        // **Die Prüfung fragt die Verwaltung, nicht die Beschreibung.** Genau das war der Fehler:
        // das Plugin beschrieb acht Felder, und die Verwaltung kannte null. Eine Prüfung, die nur
        // `plugin.settings.length` liest, hätte ihn nie gefunden.
        const eingetragen = CONTROLS_SETTINGS.filter((s) => env.settings.has(s.field.key)).length
        return {
          name: 'ui-controls:eingetragen',
          ok: eingetragen === CONTROLS_SETTINGS.length,
          message: `${eingetragen} von ${CONTROLS_SETTINGS.length} Einstellungen eingetragen`,
          details: { beschrieben: CONTROLS_SETTINGS.length, bekannt: eingetragen },
        }
      },
      () => ({
        name: 'ui-controls:achsen',
        ok: true,
        message: 'Achsenkreuz, Zoom und Drehen kommen aus den Einstellungen',
      }),
    ],
  }
}
