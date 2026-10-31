/**
 * Werkszeug: **die Naht am laufenden Code beweisen — nicht an ihrem Text.**
 *
 * ## Warum das nicht der Bau allein kann
 *
 * `build.mjs` prüft, daß die Datei der Palette die Frage `this.glyphFor(c.name)` enthält. Das ist
 * Text. Ob die Frage **etwas bewirkt**, zeigt erst ein Lauf: hier wird das ausgelieferte Bündel der
 * Palette ausgewertet, ihre `CommandUiRuntime` in einen echten Cordis-Kontext gehängt (mit
 * Attrappen für die Dienste) und `candidates()` aufgerufen — mit einem Katalog aus eingebauten und
 * eigenen Befehlen.
 *
 * Erwartet wird Zeile für Zeile:
 *
 * | Befehl | Zeichen |
 * |---|---|
 * | `compact` (eingebaut, mit Herkunft) | das Zeichen des Kerns — **nicht** unseres |
 * | `ui`, `bild`, `image`, `usage`, `verbrauch` | unser Zeichen aus `pmhCommandGlyphs` |
 * | `skills` (ohne Eintrag) | keins |
 *
 * **Die Primitives werden gestellt.** Das ausgelieferte Bündel verlangt sie beim Laden; in dieser
 * Umgebung fehlt ihnen `clsx`. Für diesen Beweis genügt eine Attrappe: geprüft wird, **welches**
 * Zeichen an einer Zeile landet, nicht wie es aussieht (das tut `build.mjs`, an echtem React).
 *
 * @module @prometheus-harness/client-command-glyphs/pruefe-naht
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Das Verzeichnis dieses Pakets. */
const HIER = dirname(fileURLToPath(import.meta.url))

/** Wo das Bündel der Palette liegt (und wo die Naht sitzt). */
const PALETTE = resolve(HIER, '../../../node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js')

/** Der Name des Dienstes. */
const DIENST = 'pmhCommandGlyphs'

/** Der Katalog, den der gefälschte Server liefert. */
const KATALOG = [
  {
    name: 'compact',
    description: 'Älteren Gesprächsverlauf verdichten',
    definitionId: '@deepseek-ai/dsh-command-compact',
  },
  { name: 'bild', description: 'Erzeugt ein Bild aus einem Text.' },
  { name: 'image', description: 'Draws an image from text.' },
  { name: 'ui', description: 'Visuelle Karten im Chat ein- oder ausschalten.' },
  { name: 'usage', description: 'Shows how much the AI key has spent.' },
  { name: 'verbrauch', description: 'Zeigt, wieviel der KI-Schlüssel verbraucht hat.' },
  { name: 'skills', description: 'Fähigkeiten suchen.' },
]

/**
 * Mischt ein Bündel aus und befragt seine Zeilen.
 *
 * @param zeichnungen - die Zeichen, die der Dienst liefern soll (`name → Komponente`)
 * @returns die Befunde; leer heißt „bestanden"
 */
export async function pruefeNahtAmLauf(zeichnungen) {
  const befunde = []
  const require = createRequire(join(HIER, 'package.json'))

  // ---- 1. Das Bündel der Palette so auswerten, wie es der Browser tut. ----
  let geladen
  const text = readFileSync(PALETTE, 'utf8')
  // eslint-disable-next-line no-new-func
  new Function('window', text)({ __ModuleLoader__: { load: (eintrag) => { geladen = eintrag } } })
  if (geladen === undefined) return ['Das Bündel der Palette ruft den Modullader nicht auf.']

  /**
   * **Zwei Attrappen, und warum sie nötig sind.**
   *
   * Das ausgelieferte Bündel verlangt beim Laden die Primitives (Zeichen) und den Client-Speicher
   * (Zustand). Beide lassen sich in dieser Umgebung nicht laden: den Primitives fehlt `clsx`, dem
   * Speicher `zustand/vanilla` — Lücken der Umgebung, nicht des Programms, denn im Browser liefert
   * beides die Shell. Für diesen Beweis genügt ihre **Form**: die Primitives müssen Komponenten
   * liefern (unterscheidbar von unseren), und der Speicher kommt in `candidates()` gar nicht vor
   * (nur im Popup).
   */
  const primaeres = new Map()
  const primitiveAttrappe = new Proxy(
    {},
    {
      get: (_ziel, schluessel) => {
        if (typeof schluessel !== 'string') return undefined
        if (!primaeres.has(schluessel)) {
          const komponente = () => null
          komponente.displayName = `Kern(${schluessel})`
          primaeres.set(schluessel, komponente)
        }
        return primaeres.get(schluessel)
      },
    },
  )
  const attrappen = {
    '@deepseek-ai/dsh-client-ui-primitives': primitiveAttrappe,
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (start) => ({ getSnapshot: () => start, set: () => undefined, subscribe: () => () => undefined }),
    },
  }

  const palette = geladen.factory((modul) => attrappen[modul] ?? require(modul))

  // ---- 2. Ein echter Cordis-Kontext mit Attrappen für die Dienste. ----
  const { Context } = require('@deepseek-ai/cordis')
  const { CommandUiRuntime } = palette
  if (typeof CommandUiRuntime !== 'function') return ['Das Bündel exportiert CommandUiRuntime nicht.']

  /**
   * Baut die Palette in einem eigenen Kontext.
   *
   * **Warum `new` und nicht `ctx.plugin()`.** `ctx.plugin()` fährt ein Plugin in einem **eigenen
   * Faden** hoch; dessen Dienst ist am Wurzelkontext nicht mehr sichtbar (gemessen: `ctx.get`
   * liefert `undefined`, obwohl das Plugin startet). Geprüft werden soll hier **eine** Sache: was
   * `candidates()` aus einem Katalog und einem Zeichendienst macht. Der Start der Anwendung ist
   * nicht Gegenstand dieses Beweises.
   *
   * @param mitDienst - ob der Zeichendienst bereitsteht
   * @returns die Palette
   */
  function bauePalette(mitDienst) {
    const ctx = new Context()
    ctx.provide('locale', { bind: () => (schluessel) => schluessel })
    ctx.provide('inputTriggers', { registerSource: () => () => undefined })
    ctx.provide('sessions', {
      subagentAddress: () => undefined,
      binding: (id) => ({ ctx: {}, sessionId: id }),
      using: async (_id, _optionen, lauf) =>
        lauf({ binding: { session: { getSnapshot: () => ({ openState: 'open' }) } } }),
    })
    ctx.provide('remote', {
      $on: () => () => undefined,
      commands: {
        list: async () => ({ ok: true, value: KATALOG }),
      },
    })
    if (mitDienst) ctx.provide(DIENST, { for: (befehl) => zeichnungen[befehl] })
    return new CommandUiRuntime(ctx)
  }

  // ---- 3. Die Zeilen bauen. ----
  const runtime = bauePalette(true)

  let zeilen
  try {
    zeilen = await runtime.candidates({ sessionId: 'sitzung' }, { query: '', signal: new AbortController().signal })
  } catch (fehler) {
    return [`candidates() warf: ${fehler instanceof Error ? fehler.message : String(fehler)}`]
  }

  const je = new Map(zeilen.map((zeile) => [zeile.name, zeile]))

  // ---- 4. Was an welcher Zeile landet. ----
  const kernZeichen = primaeres.get('IconCompactOutlineRegular')
  if (je.get('compact')?.icon !== kernZeichen) {
    befunde.push('Die eingebaute Zeile compact trägt nicht das Zeichen des Kerns (oder die Attrappe wurde nicht erkannt).')
  }
  for (const befehl of ['bild', 'image', 'ui', 'usage', 'verbrauch']) {
    if (je.get(befehl) === undefined) {
      befunde.push(`Der Katalog kennt "${befehl}" nicht — die Palette hat die Zeile nicht gebaut.`)
      continue
    }
    if (je.get(befehl).icon !== zeichnungen[befehl]) {
      befunde.push(`Die Zeile "${befehl}" trägt nicht das Zeichen aus ${DIENST}.`)
    }
  }
  if (je.get('skills')?.icon !== undefined) befunde.push('Die Zeile "skills" hat ein Zeichen bekommen — sie hat keins.')

  // Ohne den Dienst bleiben die Zeilen, wie sie sind (nichts wirft, nichts wird erfunden).
  const ohneRuntime = bauePalette(false)
  const ohneZeilen = await ohneRuntime.candidates(
    { sessionId: 'sitzung' },
    { query: '', signal: new AbortController().signal },
  )
  const ohneUi = ohneZeilen.find((zeile) => zeile.name === 'ui')
  if (ohneUi === undefined) befunde.push('Ohne den Dienst fehlt die Zeile "ui" ganz — sie darf nur ohne Zeichen dastehen.')
  else if (ohneUi.icon !== undefined) befunde.push('Ohne den Dienst hat "ui" trotzdem ein Zeichen.')

  return befunde
}
