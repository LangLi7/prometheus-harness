/**
 * Das Debug-Terminal — und zugleich der **erste Beweis**, dass Plugins tragen.
 *
 * **Warum ein Terminal und nicht ein Fenster mit Zahlen:** Ein Terminal kann man erweitern,
 * ohne die Oberflaeche anzufassen. Jedes weitere Plugin bringt seine eigenen Befehle mit — das
 * Terminal muss sie nicht kennen. Genau das ist der Sinn von „alles ist ein Plugin".
 *
 * **Die Befehle sind reine Funktionen** (`runCommand`), mit einer kleinen Umgebung als Eingabe.
 * Deshalb lassen sie sich **ohne Browser** pruefen (`tests/terminal.test.ts`) — und das ist der
 * Grund, warum sie hier stehen und nicht im Panel-Aufbau.
 */
import type { CommandContext, HealthReport, PluginRegistry } from './plugins'
import type { Body, Level } from './universe'
import { LEVELS, countBodies, rankHits, search } from './universe'

/** Was die Befehle ueber die Welt und das Geraet wissen duerfen. */
export interface TerminalEnv {
  readonly readUniverse: () => Body
  readonly registry: PluginRegistry
  readonly device: () => Readonly<Record<string, string | number>>
  /** Erzeugt eine Tabelle mit ausgerichteten Spalten — im Terminal ohne Rahmen. */
  readonly formatReport?: (reports: readonly HealthReport[]) => readonly string[]
  /**
   * Der Uebersetzer.
   *
   * **Warum er hier hereingehoert und nicht in den Aufbau des Fensters.** Die **Ausgabe** eines
   * Befehls ist Text, und Text haengt an der Sprache. Wer die Uebersetzung erst im Panel erledigt,
   * muesste die Zeilen nachtraeglich durchsuchen — und ein Objektname (`Neptun`) waere nicht von
   * einem Satz zu unterscheiden. Deshalb uebersetzt der Befehl selbst, an der Stelle, an der er
   * weiss, was Satz und was Name ist.
   *
   * Fehlt er, bleibt alles wie vorher — die Befehle sind auch ohne Sprache pruefbar.
   */
  readonly tr?: (key: string, vars?: Readonly<Record<string, string | number>>) => string
}

/**
 * Der Rueckfall des Terminals — **ohne** Sprachpaket.
 *
 * **Warum hier ueberhaupt deutsche Saetze stehen, wo doch sonst keine Sprache im Code sein soll.**
 * Es ist ein Unterschied, ob eine Zeichenkette die **einzige** Quelle eines Satzes ist (dann ist
 * sie eine Sprache im Code) oder ob sie der **letzte** Rueckfall einer Kette ist. Hier ist sie
 * der letzte: Sprachpaket → diese Tabelle → der Schluessel selbst.
 *
 * **Was diese Tabelle wirklich sicherstellt.** Die Befehle sind **reine Funktionen** und lassen
 * sich ohne Browser pruefen (`tests/terminal.test.ts`). Waere die Uebersetzung die einzige Quelle,
 * haetten die Tests zwei Moeglichkeiten: sie bauen eine Sprachverwaltung nach — oder sie pruefen
 * auf Schluesselnamen wie `term.usage`, was die Ausgabe unlesbar macht. Beides ist schlechter als
 * eine kurze Tabelle. Der Prototyp bleibt damit auch **ohne** Sprachpakete bedienbar.
 */
const FALLBACK: Readonly<Record<string, string>> = {
  'term.help.title': 'Befehle:',
  'term.usage': 'Verwendung',
  'term.unknown': 'Unbekannter Befehl: {name}',
  'term.hits': '{n} Treffer.',
  'term.noHits': 'Nichts gefunden für „{query}".',
  'term.bodies': 'Objekte im Universum: {n}',
  'term.prompt': 'Befehl',
  'health.ok': 'ok',
  'health.fail': 'FEHL',
  'health.none': 'Keine Prüfungen vorhanden.',
  'health.summary': '{n} Prüfungen · {ok} in Ordnung · {bad} Befund(e)',
  'term.disabled': '{id} ausgeschaltet.',
  'term.enabled': '{id} eingeschaltet.',
  'term.lang.set': 'Sprache: {locale}',
  'term.lang.unknown': 'Kein Sprachpaket für „{id}".',
  'term.lang.missing': '{n} Schlüssel fehlen in {locale}.',
  'term.lang.complete': '{locale} ist vollständig.',
  'term.setting.set': '{key} = {value}',
  'term.setting.unknown': 'Unbekannte Einstellung: {key}',
  'term.universe': 'Universum',
  'term.levelHint': '1 = Kleinkörper … 7 = Überblick',
}

/**
 * Fuehrt einen Befehl aus.
 *
 * Rueckgabe sind **Zeilen**, keine formatierte Flaeche: so bleibt die Ausgabe pruefbar und das
 * Panel entscheidet nur noch ueber Farbe und Monospace.
 */
export function runCommand(
  input: string,
  env: TerminalEnv,
  context: CommandContext,
): readonly string[] {
  // Die Kette: Sprachpaket → Rueckfall → Schluessel. Drei Stufen, und die letzte ist sichtbar —
  // ein fehlender Satz faellt auf, statt ein leeres Feld zu lassen.
  const tr = makeTr(env)
  const trimmed = input.trim()
  if (trimmed === '') return []
  /*
   * **`/` ist ein Präfix, kein Teil des Namens.**
   *
   * Der Betreiber wollte den Weg „als `/` oder so". Ein eigener Befehl namens `/token`
   * wäre ein zweiter Name für `token` — und die Hilfe müsste beide zeigen. Stattdessen
   * wird ein führender Schrägstrich **vor** dem Nachschlagen entfernt: `/token` und
   * `token` sind derselbe Befehl, und `/` ist die gewohnte Geste.
   */
  const ohneSlash = trimmed.startsWith('/') ? trimmed.slice(1).trim() : trimmed
  if (ohneSlash === '') return []
  const [name = '', ...args] = ohneSlash.split(/\s+/)
  const command = env.registry
    .commands()
    .find((entry) => entry.command.name === name.toLowerCase())

  if (!command) {
    // Unbekannter Befehl: **sagen**, was es gibt. Ein Terminal, das nur „unbekannt" sagt,
    // zwingt zum Raten.
    const known = env.registry.commands().map((entry) => entry.command.name)
    return [tr('term.unknown', { name }), `${tr('term.help.title')} ${known.join(', ') || '(—)'}`]
  }

  try {
    return command.command.run(args, context)
  } catch (error) {
    return [`FEHL ${name}: ${error instanceof Error ? error.message : String(error)}`]
  }
}

/**
 * Formatiert einen Gesundheitsbericht als Zeilen, mit ausgerichteter Spalte.
 *
 * **Warum die Uebersetzung hereinkommt.** Der Bericht war die letzte Flaeche, die **immer** deutsch
 * war: „4 Pruefungen · 3 in Ordnung · 1 Befund(e)". Auf einer englischen Oberflaeche ist das der
 * Moment, in dem man anfaengt zu zweifeln, ob die Sprache ueberhaupt greift. Die Marken `OK` und
 * `FEHL` bleiben: sie sind **Kennungen** in einer Spalte, keine Saetze — und die Breite der Spalte
 * haengt an ihnen.
 */
export function formatHealth(
  reports: readonly HealthReport[],
  tr?: (key: string, vars?: Readonly<Record<string, string | number>>) => string,
): readonly string[] {
  const sagen = (key: string, vars?: Readonly<Record<string, string | number>>): string => {
    if (tr) return tr(key, vars)
    const satz = FALLBACK[key] ?? key
    if (!vars) return satz
    return satz.replace(/\{(\w+)\}/g, (ganz, name: string) => {
      const value = vars[name]
      return value === undefined ? ganz : String(value)
    })
  }
  if (reports.length === 0) return [sagen('health.none')]
  const bad = reports.filter((report) => !report.ok).length
  const lines = [sagen('health.summary', { n: reports.length, ok: reports.length - bad, bad }), '']
  for (const report of reports) {
    // **`OK` und `FEHL` bleiben kurz und fest.** Sie stehen in einer Spalte, an der sich alles
    // ausrichtet; ein laengeres Wort verschiebt die ganze Tabelle. Und ein Befund muss auf einen
    // Blick auffallen — das ist der Zweck der Marke, nicht ihre Sprache.
    const mark = report.ok ? 'OK  ' : 'FEHL'
    lines.push(`${mark} ${report.name.padEnd(28)} ${report.message}`)
    for (const [key, value] of Object.entries(report.details ?? {})) {
      lines.push(`     ${''.padEnd(28)} ${key}: ${value}`)
    }
  }
  return lines
}

/** Zeigt, was auf einer Bezugsebene zu sehen ist. */
export function describeLevel(universe: Body, level: Level): readonly string[] {
  const meta = LEVELS.find((entry) => entry.level === level)
  const names: string[] = []
  const walk = (body: Body): void => {
    if (body.level === level) {
      names.push(body.name)
      return
    }
    if (body.level > level) {
      for (const child of body.children ?? []) walk(child)
    }
  }
  walk(universe)
  return [
    `Ebene ${level}: ${meta?.label ?? '—'} (${meta?.item ?? '—'})`,
    names.length ? names.join(', ') : '(leer)',
  ]
}

// ── Die Befehle des Terminals ────────────────────────────────────────────────────────────

/**
 * Uebersetzt wie `runCommand` — Sprachpaket, dann Rueckfall, dann der Schluessel.
 *
 * Sie steht hier **einmal** und wird von allen Befehlen benutzt. Der Grund ist derselbe wie
 * ueberall in diesem Prototyp: zwei Stellen, die dasselbe tun, laufen auseinander — und dann
 * steht in einem Befehl „Verwendung" und im anderen `term.usage`.
 */
function makeTr(env: TerminalEnv): (key: string, vars?: Readonly<Record<string, string | number>>) => string {
  return (key, vars) => {
    const gefunden = env.tr?.(key, vars)
    if (gefunden !== undefined && gefunden !== key) return gefunden
    const satz = FALLBACK[key] ?? key
    if (!vars) return satz
    return satz.replace(/\{(\w+)\}/g, (ganz, name: string) => {
      const value = vars[name]
      return value === undefined ? ganz : String(value)
    })
  }
}

/** Baut die Befehlsliste, die das Terminal-Plugin beisteuert. */
export function terminalCommands(env: TerminalEnv) {
  const tr = makeTr(env)
  return [
    {
      name: 'help',
      help: 'zeigt alle Befehle',
      run: () =>
        [
          tr('term.help.title'),
          ...env.registry
            .commands()
            .map((entry) => `  ${entry.command.name.padEnd(10)} ${entry.command.help}  [${entry.pluginId}]`),
        ] as readonly string[],
    },
    {
      name: 'plugins',
      help: 'zeigt alle Plugins und ihren Zustand',
      run: () => {
        const liste = env.registry.list()
        const lines = [tr('term.plugins', { n: liste.length })]
        for (const entry of liste) {
          const state = entry.enabled ? 'an ' : 'aus'
          const missing = entry.missing.length ? `  (fehlt: ${entry.missing.join(', ')})` : ''
          lines.push(
            `  ${state} ${entry.plugin.id.padEnd(20)} ${entry.plugin.version.padEnd(8)} ${entry.plugin.description}${missing}`,
          )
        }
        return lines
      },
    },
    {
      name: 'enable',
      help: 'schaltet ein Plugin ein: enable <id>',
      run: (args: readonly string[], inner: CommandContext) => {
        const id = args[0]
        if (!id) return [`${tr('term.usage')}: enable <id>`]
        const ok = env.registry.enable(id)
        inner.refresh()
        return ok
          ? [tr('term.enabled', { id })]
          : [`${id} lässt sich nicht einschalten — Abhängigkeit fehlt oder unbekannt.`]
      },
    },
    {
      name: 'disable',
      help: 'schaltet ein Plugin aus: disable <id>',
      run: (args: readonly string[], inner: CommandContext) => {
        const id = args[0]
        if (!id) return [`${tr('term.usage')}: disable <id>`]
        const ok = env.registry.disable(id)
        inner.refresh()
        return ok ? [tr('term.disabled', { id })] : [`${id} ist nicht eingetragen.`]
      },
    },
    {
      name: 'health',
      help: 'führt alle Gesundheitsprüfungen aus',
      run: () => {
        const reports = env.registry.health()
        // Die Uebersetzung wird **durchgereicht**, nicht im Bericht nachgeholt: der Bericht weiss,
        // was Satz und was Kennung ist.
        return env.formatReport ? env.formatReport(reports) : formatHealth(reports, env.tr)
      },
    },
    {
      name: 'level',
      help: 'zeigt eine Bezugsebene: level <1-7>',
      run: (args: readonly string[]) => {
        const raw = Number(args[0])
        if (!Number.isInteger(raw) || raw < 1 || raw > 7) {
          return [`${tr('term.usage')}: level <1-7>  ·  ${tr('term.levelHint')}`]
        }
        return describeLevel(env.readUniverse(), raw as Level)
      },
    },
    {
      name: 'find',
      help: 'sucht ein Objekt im Universum: find <name>',
      run: (args: readonly string[]) => {
        const query = args.join(' ')
        if (!query) return [`${tr('term.usage')}: find <name>`]
        const hits = rankHits(search(env.readUniverse(), query), query)
        if (hits.length === 0) return [tr('term.noHits', { query })]
        return [
          tr('term.hits', { n: hits.length }),
          ...hits.slice(0, 12).map((hit) => {
            const where = hit.path.length ? hit.path.join(' / ') : tr('term.universe')
            const world = hit.world.map((n) => Math.round(n)).join(' · ')
            return `  ${hit.body.name.padEnd(16)} ${hit.body.kind.padEnd(12)} ${where}   @ ${world}`
          }),
        ]
      },
    },
    {
      name: 'stats',
      help: 'zeigt Größe und Zustand des Universe und des Geräts',
      run: () => {
        const universe = env.readUniverse()
        // Die Objektzahl bekommt eine **Beschriftung**, nicht nur eine Zahl: eine nackte Zahl am
        // Anfang einer Liste ist die Stelle, an der man spaeter raet, was sie bedeutet.
        const lines = [tr('term.bodies', { n: countBodies(universe) })]
        for (const [key, value] of Object.entries(env.device())) lines.push(`${key}: ${value}`)
        lines.push(tr('term.plugins', { n: env.registry.list().filter((e) => e.enabled).length }))
        return lines
      },
    },
    {
      name: 'speak',
      help: 'spricht einen Text: speak <text>',
      run: (args: readonly string[], inner: CommandContext) => {
        const text = args.join(' ')
        if (!text) return [`${tr('term.usage')}: speak <text>`]
        inner.speak(text)
        return [`${text}`]
      },
    },
    {
      name: 'clear',
      help: 'leert das Terminal',
      run: () => ['__CLEAR__'] as readonly string[],
    },
  ]
}
