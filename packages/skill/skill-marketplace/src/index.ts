/**
 * `@prometheus-harness/skill-marketplace` — die öffentliche Fläche.
 *
 * Vier Aufgaben, vier Module: fremde Manifeste lesen (`manifest`), Quellen holen
 * und entpacken (`remote`, `archive`), Zustand führen (`state`), installieren und
 * MCP eintragen (`install`, `mcp`).
 *
 * @module @prometheus-harness/skill-marketplace
 */

export * from './types.ts'
export {
  discoverPlugin,
  parseMarketplaceJson,
  parseMcpConfig,
  parsePluginManifest,
  parseSource,
  parseTomlLite,
  readMarketplace,
  readPluginManifest,
  serversFromMap,
} from './manifest.ts'
export { extractTar, extractTarGz, extractZip, safePath, stripTopLevel } from './archive.ts'
export type { ArchiveEntry } from './archive.ts'
export {
  copyTree,
  download,
  fetchArchive,
  fetchGitHubRepository,
  isDirectory,
  materialize,
  parseSourceSpec,
  splitRepo,
  withTempDir,
} from './remote.ts'
export type { FetchedRepository } from './remote.ts'
export { emptyState, mutateState, readState, statePath, writeState } from './state.ts'
export {
  MCP_PLUGIN_NAME,
  applyMcpServers,
  listMcpServers,
  mcpClientConfig,
  patchEntryId,
  removeMcpServer,
} from './mcp.ts'
export type { McpApplyResult } from './mcp.ts'
export {
  adaptInstalledPlugin,
  addMarketplace,
  installPlugin,
  installSkills,
  listMarketplaces,
  listPlugins,
  listSkills,
  removeMarketplace,
  removePlugin,
  renameSkill,
  scanPath,
  summarize,
} from './install.ts'
export type { AddedMarketplace } from './install.ts'
export { sanitizeSkillName, skillNameFor } from './names.ts'
export { adaptPlugin } from './adapter.ts'
export type { AdaptOptions, AdaptedSkill, AdapterResult } from './adapter.ts'
