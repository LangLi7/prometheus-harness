/**
 * `@prometheus-harness/skill-marketplace` — Typen.
 *
 * **Der Vertrag ist fremd, die Form ist unsere.** Claude Code beschreibt einen
 * Marketplace mit `.claude-plugin/marketplace.json` und ein Plugin mit
 * `.claude-plugin/plugin.json`. Diese Datei bildet beide Formen ab, ohne ihre
 * Feldnamen zu erfinden: was dort `plugins`, `source` und `strict` heißt, heißt
 * hier genauso.
 *
 * Codex kennt kein Marketplace-Format, aber dieselbe MCP-Form (`mcp_servers`).
 * Deshalb ist der MCP-Teil bewusst formatneutral: {@link McpServerSpec} ist das
 * Ziel, aus dem die Claude- und die Codex-Schreibweise übersetzt werden.
 *
 * @module @prometheus-harness/skill-marketplace/types
 */

/** Ein Eintrag in `owner` eines Marketplace. */
export interface MarketplaceOwner {
  readonly name: string
  readonly email?: string
  readonly url?: string
}

/** Woher ein Plugin kommt. */
export type PluginSource =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'github'; readonly repo: string; readonly ref?: string }
  | { readonly kind: 'git-subdir'; readonly url: string; readonly path: string; readonly ref?: string }
  | { readonly kind: 'url'; readonly url: string; readonly ref?: string }
  | { readonly kind: 'archive'; readonly url: string }
  | { readonly kind: 'npm'; readonly package: string; readonly version?: string }
  | { readonly kind: 'command'; readonly command: string }

/** Ein Plugin-Eintrag im Marketplace. */
export interface MarketplaceEntry {
  readonly name: string
  readonly source: PluginSource
  readonly description?: string
  readonly version?: string
  readonly strict?: boolean
  /** Unbekannte Felder bleiben erhalten; sie gehören dem Autor. */
  readonly extra?: Readonly<Record<string, unknown>>
}

/** Ein gelesener Marketplace. */
export interface Marketplace {
  readonly name: string
  readonly description?: string
  readonly owner?: MarketplaceOwner
  readonly plugins: readonly MarketplaceEntry[]
  /** Nicht fatale Befunde beim Lesen (unbekannte Felder, doppelte Namen). */
  readonly warnings: readonly string[]
}

/** Das Manifest eines Plugins. */
export interface PluginManifest {
  readonly name: string
  readonly displayName?: string
  readonly version?: string
  readonly description?: string
  readonly author?: { readonly name: string; readonly email?: string; readonly url?: string }
  readonly homepage?: string
  readonly repository?: string
  readonly license?: string
  readonly keywords?: readonly string[]
  readonly defaultEnabled?: boolean
  readonly dependencies?: readonly unknown[]
  readonly skills?: string | readonly string[]
  readonly commands?: unknown
  readonly agents?: string | readonly string[]
  readonly hooks?: unknown
  readonly mcpServers?: unknown
  readonly lspServers?: unknown
  readonly userConfig?: Readonly<Record<string, unknown>>
  readonly warnings: readonly string[]
}

/** Ein gefundenes Skill im Plugin. */
export interface PluginSkill {
  /** Name aus dem Frontmatter, falls lesbar. */
  readonly name: string
  /** Pfad relativ zum Plugin-Wurzelverzeichnis. */
  readonly path: string
}

/** Was ein Plugin an Bestandteilen mitbringt. */
export interface PluginComponents {
  readonly skills: readonly PluginSkill[]
  readonly commands: readonly string[]
  readonly agents: readonly string[]
  readonly hooks: readonly string[]
  readonly mcpServers: readonly McpServerSpec[]
  readonly lsp: readonly string[]
  readonly warnings: readonly string[]
}

/** Ein MCP-Server in der Form, die der Host versteht. */
export interface McpServerSpec {
  readonly name: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  /** Ein Startfehler darf den Host nicht aufhalten (z. B. lokaler Figma-Server). */
  readonly optional?: boolean
  /** Warum ein Feld fehlt oder ersetzt wurde. */
  readonly warnings?: readonly string[]
}

/** Ein installierter Marketplace im Zustand. */
export interface InstalledMarketplace {
  readonly name: string
  /** Verzeichnis unterhalb von `<home>/marketplaces`. */
  readonly path: string
  readonly source: string
  readonly addedAt: string
  readonly pluginCount: number
}

/** Ein installiertes Plugin im Zustand. */
export interface InstalledPlugin {
  /** `name@marketplace`. */
  readonly id: string
  readonly name: string
  readonly marketplace: string
  readonly version?: string
  readonly path: string
  readonly installedAt: string
  readonly digest: string
  /** Namen der materialisierten Skills. */
  readonly skills: readonly string[]
  /** Aus Commands und Agents übersetzte Skills, falls der Adapter lief. */
  readonly adapted?: {
    readonly commands: readonly string[]
    readonly agents: readonly string[]
  }
  /** Ergebnis des Sicherheitslaufs, damit ein späterer `list` es zeigen kann. */
  readonly scan: PluginScanSummary
}

/** Kurzfassung eines Scan-Ergebnisses. */
export interface PluginScanSummary {
  readonly score: number
  readonly severity: string
  readonly recommendation: string
  /** Was das Gate entschieden hat: `allow`, `warn` oder `block`. */
  readonly action: 'allow' | 'warn' | 'block'
  readonly findings: number
}

/** Der gespeicherte Zustand. */
export interface MarketplaceState {
  readonly version: 1
  readonly marketplaces: Readonly<Record<string, InstalledMarketplace>>
  readonly plugins: Readonly<Record<string, InstalledPlugin>>
  readonly skills: Readonly<Record<string, InstalledSkill>>
}

/** Ein materialisiertes Skill. */
export interface InstalledSkill {
  readonly name: string
  readonly path: string
  readonly source: string
  /** Plugin-Id, wenn das Skill aus einem Plugin kam. */
  readonly plugin?: string
  readonly installedAt: string
  readonly digest: string
}

/** Optionen für Installationen. */
export interface InstallOptions {
  /** Harness-Home; Vorgabe `resolvePmhHome()`. */
  readonly home?: string
  /** Wurzel für materialisierte Skills; Vorgabe `<home>/skills`. */
  readonly skillsRoot?: string
  /** Ein `DO_NOT_INSTALL` trotzdem zulassen. */
  readonly force?: boolean
  /** Die strenge Gate-Politik des Vorbilds (HIGH blockt) statt `balanced`. */
  readonly strict?: boolean
  /** Präfix für materialisierte Skill-Namen — erlaubt zwei Fassungen desselben Skills. */
  readonly prefix?: string
  /** Commands und Agents zu Skills übersetzen; Vorgabe `true`. */
  readonly adapter?: boolean
  /** Sicherheitslauf überspringen — nur für Prüfungen sinnvoll. */
  readonly skipScan?: boolean
  /** Zeitpunkt; Vorgabe jetzt. */
  readonly now?: Date
  /** Fortschrittsmeldungen. */
  readonly log?: (message: string) => void
}

/** Ergebnis einer Installation. */
export interface InstallResult {
  readonly plugin?: InstalledPlugin
  readonly skills: readonly InstalledSkill[]
  readonly scan: PluginScanSummary
  readonly warnings: readonly string[]
}

/** Eine Fehlerklasse, die der CLI-Aufrufer unterscheiden kann. */
export class MarketplaceError extends Error {
  override readonly name = 'MarketplaceError'
}

/** Eine Quelle, wie sie auf der Kommandozeile steht. */
export type SourceSpec =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'github'; readonly repo: string; readonly ref?: string }
  | { readonly kind: 'url'; readonly url: string }
