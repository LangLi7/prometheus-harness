/**
 * Die eingebauten Plugins.
 *
 * **Kein Plugin ist fest verdrahtet.** Diese Datei baut sie nur zusammen; die Oberflaeche
 * liest ausschliesslich die **Registry**. Wer ein Plugin abschaltet, dessen Panel verschwindet
 * und dessen Befehle verschwinden — nicht durch eine Sonderregel, sondern weil die Registry
 * nichts mehr liefert.
 *
 * Die drei hier sind der Anfang:
 *
 *   `debug-terminal`  — Befehle, Ausgabe, Eingabe. Das Werkzeug, mit dem man die anderen prueft.
 *   `health-check`    — der Gesundheitsbericht. Sammelt Pruefungen **aller** Plugins ein.
 *   `device-info`     — zeigt, worauf man gerade schaut (Bildschirm, Bildrate, WebGL-Geraet).
 *
 * `device-info` ist bewusst ein **eigenes** Plugin: es zeigt, wie klein ein Plugin sein darf.
 */
import type { CommandContribution, HealthReport, Plugin, PluginRegistry } from './plugins'
import { fuelleRangliste } from './rang-ansicht'
import { mountTokenPanel } from './token-panel'
import { formatHealth, runCommand, terminalCommands } from './terminal'
import type { TerminalEnv } from './terminal'
import type { Body } from './universe'
import { LEVELS } from './universe'
// Die Zeichen kommen aus EINER Quelle (packages/assets/icons) — keine Schriftzeichen mehr.
import { iconMarkup } from '@prometheus-harness/icons'

/** Was der Wirt (die Anwendung) den Plugins zur Verfuegung stellt. */
export interface HostServices {
  readonly registry: PluginRegistry
  /**
   * Holt ein Panel in die Fläche — der Weg für einen Befehl, der eine Fläche braucht.
   * Fehlt er, bleibt der Befehl bei einer Textantwort (Tests, Einbettung ohne Dock).
   */
  readonly oeffnePanel?: (id: string) => void
  readonly readUniverse: () => Body
  /** Messwerte des Geräts und der Darstellung. Wird bei jedem Aufruf frisch gelesen. */
  readonly metrics: () => Readonly<Record<string, string | number>>
  /**
   * Der **Uebersetzer** — die Sprache des Nutzers.
   *
   * **Warum eine Funktion und kein Text.** Die Sprache kann sich im Lauf aendern (`lang de`). Ein
   * Plugin, das sich beim Eintragen einen fertigen Satz holt, zeigt danach die alte Sprache — an
   * genau der Stelle, an der es ihn geholt hat. Wer `tr('panel.debug')` schreibt, bekommt bei
   * jedem Aufruf die **aktuelle** Sprache.
   */
  readonly tr: (key: string, vars?: Readonly<Record<string, string | number>>) => string
  /**
   * Die **Schnittstelle zur Harness**.
   *
   * Heute nicht verbunden — deshalb liefert sie `null` und der Bericht sagt das **ausdrücklich**.
   * Eine Prüfung, die „in Ordnung" meldet, obwohl sie nichts geprüft hat, ist schlimmer als
   * keine Prüfung: sie erzeugt Vertrauen, wo keins hingehört.
   */
  readonly healthApi: () => Promise<HealthReport> | null
  /**
   * Die **5D-Ansicht** — fuenf Freiheitsgrade: drei Raumachsen, die Drehlage und die Zeit.
   *
   * Der Wirt haelt sie, weil sie jeden Bildlauf gebraucht wird; die Plugins duerfen sie
   * **lesen und ändern**. Das ist der Punkt: die Rotation ist kein Sonderfall der Maus, sondern
   * ein Zustand, den jedes Werkzeug anfassen kann.
   */
  readonly view5d: () => {
    readonly bivector: readonly number[]
    readonly time: number
    readonly running: boolean
    readonly speed: number
    /**
     * Wie viele Dimensionen **wirken** — 3 bis 5.
     *
     * Sie ist Teil der Antwort und nicht eine Nebenbemerkung: bei 3 sind es drei Drehflaechen,
     * bei 5 zehn. Ein Bericht, der „10 von SO(5)" sagt, obwohl drei eingestellt sind, waere
     * eine Falschaussage ueber den eigenen Zustand.
     */
    readonly dimension: number
    /** Die volle Drehmatrix — der **Nachweis**, dass es echte n-dimensionale Rotation ist. */
    readonly matrix: readonly (readonly number[])[]
  }
  /** Die Zeit der **Bahnen** — getrennt von der Weltdrehung. */
  readonly orbits: () => { readonly seconds: number; readonly running: boolean; readonly speed: number }
  readonly setOrbits: (patch: { readonly running?: boolean; readonly speed?: number; readonly seconds?: number }) => void
  /**
   * Prueft **alle** Sonnensysteme auf Ueberlagerung und zu enge Bahnen.
   *
   * Liefert die Befunde als Zeilen; leer heisst in Ordnung. Der Wirt rechnet das, weil nur er
   * die Szene kennt — die Plugins sollen die Welt nicht selbst auseinandernehmen muessen.
   */
  readonly checkCrowding: () => readonly string[]
  readonly setView5d: (patch: { readonly bivector?: readonly number[]; readonly running?: boolean; readonly speed?: number; readonly time?: number }) => void
}

/** Baut die eingebauten Plugins und traegt sie in die Registry ein. */
export function registerBuiltinPlugins(registry: PluginRegistry, host: HostServices): readonly string[] {
  const env: TerminalEnv = {
    readUniverse: host.readUniverse,
    registry,
    device: host.metrics,
    // **Die Uebersetzung wird durchgereicht, nicht im Bericht nachgeholt.** Der Bericht kennt die
    // Saetze; die Huelle kennt die Sprache.
    formatReport: (reports) => formatHealth(reports, host.tr),
    tr: host.tr,
  }

  const speak = (text: string): void => {
    // Sprachausgabe ueber die eingebaute Browser-Schnittstelle — **keine** neue Abhaengigkeit.
    // Fehlt sie (oder ist sie gesperrt), bleibt der Befehl still: er meldet trotzdem, was er
    // gesprochen haette, damit die Ausgabe pruefbar bleibt.
    try {
      const synth = globalThis.speechSynthesis
      if (!synth) return
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'de-DE'
      synth.speak(utterance)
    } catch {
      // Kein Grund, das Terminal zu stoeren.
    }
  }

  const context = {
    speak,
    refresh: () => registry.enable('health-check'),
    oeffnePanel: (id: string) => host.oeffnePanel?.(id),
  }

  // ── 1. Debug-Terminal ──────────────────────────────────────────────────────────────────
  const terminal: Plugin = {
    id: 'debug-terminal',
    name: 'Debug-Terminal',
    version: '0.1.0',
    description: 'Befehle, Ausgabe und Eingabe — das Werkzeug, mit dem man die anderen prüft.',
    panel: {
      title: () => host.tr('panel.debug'),
      /*
       * **Abgesteckt, nicht angedockt — wie Suche und Zustand.**
       *
       * Der Betreiber: „die andere stuff ist immer noch da: terminal, suche, zustand und abgedeckt??".
       * Hier stand `zone: 'bottom'`, also lag das Terminal von Anfang an über der unteren Bildhälfte.
       * Jetzt startet es `closed` und wird über die Leiste („+ Terminal") oder den `terminal`-Befehl
       * geholt — sichtbar, wenn man es braucht.
       */
      zone: 'closed',
      size: 280,
      render: (host_) => mountTerminal(host_, env, context, host.tr),
    },
    commands: terminalCommands(env) as readonly CommandContribution[],
    healthChecks: [
      () => ({
        name: 'debug-terminal:befehle',
        ok: registry.commands().length > 0,
        message:
          registry.commands().length > 0
            ? `${registry.commands().length} Befehle aus ${new Set(registry.commands().map((c) => c.pluginId)).size} Plugins`
            : 'keine Befehle vorhanden',
      }),
    ],
  }

  // ── 1b. Die 5D-Rotation als eigenes Plugin ─────────────────────────────────────────────
  //
  // Eigene Einheit, weil sie sich **abstecken** laesst: wer nur die Struktur ansehen will,
  // schaltet die Eigenrotation aus und bekommt eine ruhende Welt. Der Befehl dazu bleibt —
  // `disable rotation` nimmt ihn mit, wie es sich fuer ein Plugin gehoert.
  const rotation: Plugin = {
    id: 'world-rotation',
    name: 'Universe-Rotation (5D)',
    version: '0.1.0',
    description: 'Dreht das Universe als Ganzes: fünf Freiheitsgrade, zehn Drehflächen, Zeit als Antrieb.',
    commands: [
      {
        name: 'rotation',
        help: 'zeigt oder ändert die Universumdrehung: rotation [pause|run|tempo <n>|plane <0-9> <wert>|time 0]',
        run: (args) => {
          const view = host.view5d()
          const [sub = '', a = '', b = ''] = args
          if (sub === 'pause') {
            host.setView5d({ running: false })
            return ['Universumdrehung angehalten.']
          }
          if (sub === 'run') {
            host.setView5d({ running: true })
            return ['Universumdrehung läuft.']
          }
          if (sub === 'tempo') {
            const value = Number(a)
            if (!Number.isFinite(value)) return ['Verwendung: rotation tempo <Zahl>  ·  z. B. 0.05']
            host.setView5d({ speed: value })
            return [`Tempo: ${value} je Sekunde.`]
          }
          if (sub === 'time') {
            const value = Number(a)
            if (!Number.isFinite(value)) return ['Verwendung: rotation time <Zahl>  ·  0 = Ausgangslage']
            host.setView5d({ time: value })
            return [`Zeit auf ${value} gesetzt.`]
          }
          if (sub === 'plane') {
            const index = Number(a)
            const value = Number(b)
            if (!Number.isInteger(index) || index < 0 || index > 9 || !Number.isFinite(value)) {
              return ['Verwendung: rotation plane <0-9> <Wert>  ·  z. B. rotation plane 3 0.4']
            }
            const next = [...view.bivector]
            next[index] = value
            host.setView5d({ bivector: next })
            return [`Drehfläche ${index} auf ${value} gesetzt.`]
          }
          // Ohne Argument: den Zustand zeigen — mit allen zehn Flächen, auch den ruhenden,
          // und der **fertigen Matrix**. Ohne die Matrix waere „5D" eine Behauptung; mit ihr
          // kann jeder nachrechnen, dass es eine echte Drehung im Fünf-dimensionalen ist.
          const aktiv = view.bivector
            .map((value, index) => ({ index, value }))
            .filter((entry) => entry.value !== 0)
          // **Nur die Flaechen zeigen, die auch wirken.** Bei drei Dimensionen gibt es drei
          // Flaechen; die uebrigen sieben Werte liegen zwar im Bivektor, haben aber keine
          // Entsprechung. Sie mitzuzaehlen waere eine Aussage ueber eine Welt, die es gerade
          // nicht gibt.
          const wirksam = (view.dimension * (view.dimension - 1)) / 2
          const matrixZeilen = view.matrix.map(
            (row) => '  ' + row.map((value) => (value >= 0 ? ' ' : '') + value.toFixed(3)).join(' '),
          )
          return [
            `${view.running ? 'läuft' : 'angehalten'} · Zeit ${view.time.toFixed(2)} · Tempo ${view.speed}`,
            `Dimensionen: ${view.dimension} · Drehflächen: ${wirksam} von ${view.bivector.length} (SO(5)) · aktiv: ${aktiv.filter((e) => e.index < wirksam).length}`,
            ...aktiv
              .filter((entry) => entry.index < wirksam)
              .map((entry) => `  Fläche ${String(entry.index).padStart(2)}  Wert ${entry.value}`),
            '',
            `Die Matrix (${view.dimension}×${view.dimension}, orthonormal, Determinante +1):`,
            ...matrixZeilen,
          ]
        },
      },
    ],
    healthChecks: [
      () => {
        const view = host.view5d()
        return {
          name: 'world-rotation:zustand',
          // Eine ruhende Welt ist **kein** Fehler — sie ist eine gültige Einstellung. Ein Fehler
          // waere ein Bivektor, der nicht zu SO(5) passt: dann stimmt die Rechnung nicht.
          ok: view.bivector.length === 10 && view.dimension >= 3 && view.dimension <= 5,
          message: `${view.dimension}D · ${(view.dimension * (view.dimension - 1)) / 2} Drehflächen · ${view.running ? 'läuft' : 'angehalten'}`,
          details: { Zeit: view.time.toFixed(2), Tempo: view.speed },
        }
      },
    ],
  }

  // ── 1c. Die Bahnen — die Planeten ───────────────────────────────────────────────────────
  const orbits: Plugin = {
    id: 'planet-orbits',
    name: 'Planetenbahnen',
    version: '0.1.0',
    description: 'Bewegt die Planeten nach ihrer echten Umlaufzeit — gestaucht, damit alles zugleich sichtbar ist.',
    commands: [
      {
        name: 'orbits',
        help: 'zeigt oder ändert den Umlauf: orbits [pause|run|tempo <n>|time <n>]',
        run: (args) => {
          const state = host.orbits()
          const [sub = '', a = ''] = args
          if (sub === 'pause') {
            host.setOrbits({ running: false })
            return ['Bahnen angehalten.']
          }
          if (sub === 'run') {
            host.setOrbits({ running: true })
            return ['Bahnen laufen.']
          }
          if (sub === 'tempo') {
            const value = Number(a)
            if (!Number.isFinite(value) || value < 0) return ['Verwendung: orbits tempo <Zahl ≥ 0>']
            host.setOrbits({ speed: value })
            return [`Bahntempo: ${value}`]
          }
          if (sub === 'time') {
            const value = Number(a)
            if (!Number.isFinite(value)) return ['Verwendung: orbits time <Sekunden>  ·  0 = Ausgangslage']
            host.setOrbits({ seconds: value })
            return [`Bahnzeit auf ${value} gesetzt.`]
          }
          return [
            `Bahnen: ${state.running ? 'laufen' : 'angehalten'} · Zeit ${state.seconds.toFixed(1)} s · Tempo ${state.speed}`,
            'Ein Erdenjahr dauert 24 Sekunden. Merkur rast, Neptun kriecht — die Reihenfolge ist echt,',
            'die Geschwindigkeit gestaucht (sonst wären es 680 : 1 statt 17 : 1).',
            'Die Zeit der Bahnen ist **unabhängig** von der Drehlage des Universe.',
          ]
        },
      },
    ],
    healthChecks: [
      () => {
        const state = host.orbits()
        return {
          name: 'planet-orbits:zustand',
          ok: true,
          message: `${state.running ? 'laufen' : 'angehalten'} · Zeit ${state.seconds.toFixed(1)} s`,
          details: { Tempo: state.speed },
        }
      },
    ],
  }

  // ── 1d. Das Gedraenge — die Wache ───────────────────────────────────────────────────────
  //
  // Eigene Einheit, obwohl sie klein ist: sie prueft eine Eigenschaft, die der Betreiber
  // **gesehen** hat, bevor es einen Test gab („die masse der sonne gross und dann noch sehr
  // sehr nah beinander"). Als Gesundheitspruefung laeuft sie bei jedem `health` mit — damit
  // derselbe Fehler nicht wieder unbemerkt entsteht.
  const crowding: Plugin = {
    id: 'crowding-guard',
    name: 'Gedränge-Wache',
    version: '0.1.0',
    description: 'Meldet, wenn sich zwei Körper berühren oder zwei Bahnen zu dicht liegen.',
    healthChecks: [
      () => {
        const befunde = host.checkCrowding()
        return {
          name: 'crowding-guard:abstand',
          ok: befunde.length === 0,
          message:
            befunde.length === 0
              ? 'keine Überlagerung, jede Bahn hat Abstand'
              : `${befunde.length} Befund(e)`,
          ...(befunde.length ? { details: { erster: befunde[0] ?? '' } } : {}),
        }
      },
    ],
    commands: [
      {
        name: 'crowding',
        help: 'prüft alle Sonnensysteme auf Überlagerung und zu enge Bahnen',
        run: () => {
          const befunde = host.checkCrowding()
          if (befunde.length === 0) {
            return ['Keine Überlagerung. Jede Bahn hat Abstand zu ihren Nachbarn.']
          }
          return [`${befunde.length} Befund(e):`, ...befunde.map((b) => `  ! ${b}`)]
        },
      },
    ],
  }

  // ── 2. Health-Check ───────────────────────────────────────────────────────────────────
  const health: Plugin = {
    id: 'health-check',
    name: 'Health-Check',
    version: '0.1.0',
    description: 'Sammelt die Prüfungen aller Plugins zu einem Bericht.',
    panel: {
      title: () => host.tr('panel.health'),
      /*
       * **Abgesteckt.** Der Bericht ist ein **Werkzeug**, kein Zierrat: er gehört aufgerufen, nicht
       * dauerhaft über der Welt. Der Betreiber: „die andere stuff ist immer noch da: terminal, suche,
       * zustand und abgedeckt??". Hier stand `zone: 'right'`.
       */
      zone: 'closed',
      size: 340,
      render: (host_) => {
        host_.replaceChildren()
        const box = document.createElement('pre')
        box.className = 'health'
        host_.appendChild(box)
        const paint = (): void => {
          box.textContent = formatHealth(registry.health()).join('\n')
        }
        paint()
        const stop = registry.onChange(paint)
        // Wenn das Panel neu gebaut wird, haengt der Zuhoerer am alten Knoten. Deshalb wird er
        // beim Zerstoeren geloest — sonst waechst die Zuhoererliste bei jedem Umbau.
        const observer = new MutationObserver(() => {
          if (!host_.isConnected) {
            stop()
            observer.disconnect()
          }
        })
        observer.observe(host_, { childList: true })
        void stop
      },
    },
    healthChecks: [
      () => {
        const reports = registry.health()
        const bad = reports.filter((report) => !report.ok).length
        return {
          name: 'health-check:gesamt',
          ok: bad === 0,
          message: bad === 0 ? `${reports.length} Prüfungen, keine Befunde` : `${bad} von ${reports.length} mit Befund`,
          details: { Befunde: bad },
        }
      },
      () => {
        const enabled = registry.list().filter((entry) => entry.enabled).length
        const total = registry.list().length
        return {
          name: 'health-check:plugins',
          ok: enabled > 0,
          message: `${enabled} von ${total} Plugins eingeschaltet`,
          details: { eingeschaltet: enabled, eingetragen: total },
        }
      },
    ],
  }

  // ── 3. Geräte-Info ────────────────────────────────────────────────────────────────────
  const device: Plugin = {
    id: 'device-info',
    name: 'Geräte-Info',
    version: '0.1.0',
    description: 'Worauf schaut man gerade: Bildschirm, Bildrate, Zeichenweg, Raum.',
    panel: {
      title: () => host.tr('panel.device'),
      zone: 'closed',
      size: 280,
      render: (host_) => {
        host_.replaceChildren()
        const box = document.createElement('pre')
        box.className = 'health'
        host_.appendChild(box)
        const paint = (): void => {
          const entries = Object.entries(host.metrics())
          box.textContent = entries.map(([key, value]) => `${key.padEnd(18)} ${value}`).join('\n')
        }
        paint()
        // Der Bericht soll **leben**, solange er sichtbar ist.
        const timer = globalThis.setInterval(paint, 700)
        const observer = new MutationObserver(() => {
          if (!host_.isConnected) {
            globalThis.clearInterval(timer)
            observer.disconnect()
          }
        })
        observer.observe(host_, { childList: true })
      },
    },
    healthChecks: [
      () => {
        const metrics = host.metrics()
        const webgl = String(metrics['Zeichenweg'] ?? '—')
        return {
          name: 'device-info:zeichenweg',
          ok: webgl.includes('WebGL'),
          message: `Zeichenweg: ${webgl}`,
          details: { Bildrate: String(metrics['Bildrate'] ?? '—') },
        }
      },
    ],
    commands: [
      {
        name: 'speak',
        help: 'spricht einen Text: speak <text> (STT/TTS-Prüfung)',
        run: (args, context) => {
          const text = args.join(' ')
          if (!text) {
            return [
              'Verwendung: speak <text>',
              'Prüft die Sprachausgabe. Die Stimme kommt vom Browser — es wurde nichts installiert.',
            ]
          }
          context.speak(text)
          return [`gesprochen: ${text}`, `Stimmen verfügbar: ${speechVoiceCount()}`]
        },
      },
    ],
  }

  // ── 3b. Die KI-Rangliste — **lesend** ────────────────────────────────────────────────
  //
  // Eine eigene Einheit, weil sie eine eigene Quelle hat: sie zeigt, was
  // `GET /api/ai/ranking` (`packages/api/ai-ranking`) liefert — Rang, Familie, Modell, Kostenart,
  // Preis und die bevorzugte Wahl **mit Begründung**.
  //
  // **Kein Befehl, kein Schalter, keine Auswahl.** Die Welt wächst zwar über Befehle, aber dieser
  // Gegenstand hat keine Handlung: er liest. Ein Befehl, der nichts ändert, wäre eine zweite
  // Bedienung für dasselbe Fenster.
  const rangliste: Plugin = {
    id: 'ai-rangliste',
    name: 'KI-Rangliste',
    version: '0.1.0',
    description: 'Die bevorzugte Wahl je Fähigkeit — gelesen von GET /api/ai/ranking. Nur lesend.',
    panel: {
      title: () => host.tr('panel.ranking'),
      /*
       * **Abgesteckt, nicht angedockt** — dieselbe Voreinstellung wie Terminal und Zustand.
       *
       * Der Betreiber: „**bitte die ausblenden bzw sollte nicht da sein sollange man es per button
       * oder per command idk what ever macht erst dann auftaucht**". Ein Fenster, das von Anfang an
       * über der Welt liegt, deckt sie ab. Geholt wird es über die Insel (Gruppe „Panels") — dort
       * steht es mit jedem anderen Panel, ohne dass hier eine Zeile dafür nötig wäre.
       */
      zone: 'closed',
      size: 680,
      /*
       * **Gelesen wird beim Aufbau, nicht beim Einschalten.**
       *
       * Hier steht `render`, und **nicht** `onEnable`: ein Plugin, das beim Start eine Verbindung
       * aufbaut, macht den Start von einem Dienst abhängig, der nichts mit dem Start zu tun hat —
       * und die Prüfung der Hülle hinge dann am Netz. Was der Dienst nicht hergibt, sagt das Panel
       * selbst (siehe `ai-rangliste.ts` und `rang-ansicht.ts`).
       */
      render: (host_) => {
        void fuelleRangliste(host_)
      },
    },
  }

  // ── 3c. API-Token — **der Schlüssel kommt über eine Fläche, nicht über ein Argument** ──
  //
  // Der Befehl `/token` öffnet dieses Panel. Der Wert selbst wird **nie** als Argument
  // angenommen: er stünde im Verlauf, in der Prozeßliste und im Protokoll. Das Panel
  // schickt ihn per `POST` an `/api/pmh/token`; der Host verpackt ihn in `user_secrets`.
  const token: Plugin = {
    id: 'token',
    name: 'API-Token',
    version: '0.1.0',
    description: 'Setzt je Konto einen Anbieter-Schlüssel — verschlüsselt auf dem Host, nie im Browser gespeichert.',
    panel: {
      title: () => host.tr('panel.token'),
      zone: 'closed',
      size: 420,
      render: (host_) => {
        mountTokenPanel(host_, { tr: host.tr })
      },
    },
    commands: [
      {
        name: 'token',
        help: 'öffnet die API-Token (auch als /token)',
        run: (_args, inner) => {
          if (inner.oeffnePanel === undefined) {
            return ['Das Token-Panel braucht die Oberfläche — hier gibt es keinen Weg, es zu öffnen.']
          }
          inner.oeffnePanel('plugin:token')
          return [host.tr('token.command.help')]
        },
      },
    ],
  }

  // ── 4. Harness-Verbindung — **abgeschaltet**, bis es etwas zu verbinden gibt ──────────
  const harness: Plugin = {
    id: 'harness-health',
    name: 'Harness-Health',
    version: '0.0.0',
    description: 'Verbindet die Gesundheitsprüfung mit der Harness-Schnittstelle. Noch nicht verbunden.',
    healthChecks: [
      () => {
        const pending = host.healthApi()
        if (pending === null) {
          return {
            name: 'harness-health:api',
            // **Nicht** „in Ordnung": es wurde nichts geprüft.
            ok: false,
            message: 'nicht verbunden — die Schnittstelle ist noch nicht angeschlossen',
            details: { Zustand: 'geplant', Wirkung: 'keine Prüfung möglich' },
          }
        }
        return { name: 'harness-health:api', ok: true, message: 'verbunden' }
      },
    ],
  }

  const ids: string[] = []
  for (const plugin of [terminal, rotation, orbits, crowding, health, device, rangliste, token, harness]) {
    registry.register(plugin)
    ids.push(plugin.id)
  }
  // Das Harness-Plugin wird gleich wieder **abgesteckt**: es hat nichts zu tun, und ein
  // eingeschaltetes Plugin ohne Wirkung waere eine Behauptung.
  registry.disable('harness-health')
  return ids
}

/**
 * Baut die Terminal-Flaeche.
 *
 * Das Fenster kennt **keine** Befehle. Es kennt nur `runCommand` — und das fragt die Registry.
 * Deshalb funktioniert jeder Befehl eines spaeter hinzugefuegten Plugins sofort, ohne dass
 * hier eine Zeile geaendert wird.
 */
function mountTerminal(
  host: HTMLElement,
  env: TerminalEnv,
  context: {
    readonly speak: (text: string) => void
    readonly refresh: () => void
    readonly oeffnePanel?: (id: string) => void
  },
  tr: (key: string, vars?: Readonly<Record<string, string | number>>) => string,
): void {
  host.replaceChildren()
  host.classList.add('terminal')

  const out = document.createElement('div')
  out.className = 'term-out'
  const row = document.createElement('div')
  row.className = 'term-row'
  const prompt = document.createElement('span')
  prompt.className = 'term-prompt'
  prompt.innerHTML = iconMarkup('prompt')
  const input = document.createElement('input')
  input.className = 'term-in'
  input.placeholder = 'help · plugins · /token · health · settings list · lang de · find web'
  input.setAttribute('aria-label', tr('term.prompt'))
  row.append(prompt, input)
  host.append(out, row)

  const history: string[] = []
  let historyAt = -1

  /**
   * **Eine Zeile im Ausgabefeld.**
   *
   * Zwei Arten, und der Unterschied ist **kein** Aussehen: eine Ausgabezeile ist Text, eine
   * **Eingabezeile** trägt das Zeichen der Eingabeaufforderung davor.
   *
   * **Warum das ein eigener Typ ist und keine Zeichenkette mit Anhängsel.** Hier stand
   * `` write([`❯ ${value}`, …]) `` — die Eingabe wurde als **Text** mit einem Schriftzeichen davor
   * geschrieben. Seit die Zeichen gezeichnet sind (`@prometheus-harness/icons`), geht das nicht mehr:
   * ein eingegebener Befehl, in dem zufällig `<` steht, wäre über `innerHTML` **ausführbarer Inhalt**.
   * Der Text wird deshalb als Text gesetzt (`textContent`) und das Zeichen daneben als Zeichen.
   */
  type TermZeile = string | { readonly eingabe: string }

  const write = (lines: readonly TermZeile[]): void => {
    for (const line of lines) {
      if (typeof line === 'string' && line === '__CLEAR__') {
        out.replaceChildren()
        continue
      }
      const el = document.createElement('div')
      if (typeof line !== 'string') {
        el.className = 'term-line eingabe'
        el.innerHTML = `${iconMarkup('prompt', 'term-eingabe-zeichen')}<span></span>`
        const text = el.querySelector('span')
        // **Als Text, nicht als Markup** — der Wert kommt von der Tastatur.
        if (text) text.textContent = line.eingabe
        out.appendChild(el)
        continue
      }
      el.className = line.startsWith('FEHL') ? 'term-line bad' : line.startsWith('OK  ') ? 'term-line ok' : 'term-line'
      el.textContent = line
      out.appendChild(el)
    }
    out.scrollTop = out.scrollHeight
  }

  const submit = (): void => {
    const value = input.value
    input.value = ''
    if (value.trim() === '') return
    history.push(value)
    historyAt = history.length
    write([{ eingabe: value }, ...runCommand(value, env, context)])
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      submit()
      return
    }
    // Verlauf mit den Pfeiltasten — ohne das ist ein Terminal unbrauchbar.
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      historyAt = Math.max(0, historyAt - 1)
      input.value = history[historyAt] ?? ''
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      historyAt = Math.min(history.length, historyAt + 1)
      input.value = history[historyAt] ?? ''
    }
  })

  write([
    `Prometheus · ${tr('panel.debug')}`,
    // Ein Hinweis, der bleibt: dieses Fenster ist ein Beispiel dafuer, wie ein Plugin aussieht.
    tr('term.intro'),
    '',
  ])
  input.focus()
}

/** Zaehlt die Ebenen fuer den Bericht — klein gehalten, damit die Datei lesbar bleibt. */
export function levelSummary(universe: Body): readonly string[] {  return LEVELS.map((entry) => {
    let count = 0
    const walk = (body: Body): void => {
      if (body.level === entry.level) {
        count += 1
        return
      }
      if (body.level > entry.level) for (const child of body.children ?? []) walk(child)
    }
    walk(universe)
    return `${entry.label}: ${count}`
  })
}

/**
 * Wie viele Stimmen der Browser kennt.
 *
 * **Keine neue Abhaengigkeit:** die Sprachausgabe kommt aus dem Browser
 * (`speechSynthesis`). Fehlt sie, ist die Zahl 0 — und das ist ein **ehrlicher Befund**,
 * kein Fehler.
 */
function speechVoiceCount(): number {
  try {
    return globalThis.speechSynthesis?.getVoices().length ?? 0
  } catch {
    return 0
  }
}
