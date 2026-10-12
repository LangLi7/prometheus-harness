/**
 * Öffentliche Fläche des Pakets `@prometheus-harness/unit-export`.
 *
 * Diese Datei ist der Grund, warum die Fähigkeit „Plugin-Export" nicht am
 * Terminal hängt: ein Cordis-Plugin, ein HTTP-Handler oder der Kern kann
 * dieselben vier Aufrufe machen, die die CLI macht. Es gibt genau **eine**
 * Umsetzung — `src/cli.ts` ist eine dünne Hülle darüber.
 *
 * ```
 * import { exportUnit, importBundle, inspectBundle, scanRegistry, planInstall } from '@prometheus-harness/unit-export'
 *
 * const registry = await scanRegistry({ roots: ['units', 'services', 'native'] })
 * const report = await exportUnit({ unit: 'services/pmh-supervisor', out: 'pmh-supervisor.pmhunit' })
 * const back = await importBundle({ bundle: report.out, into: '/tmp/units' })
 * ```
 */

// --- Manifest ---
export {
  MANIFEST_FILE,
  compareVersions,
  directoryNameFor,
  isContractRange,
  parseManifest,
  readManifest,
  readManifestOrThrow,
  satisfiesContract,
  serializeManifest,
  validateUnitName,
  type ManifestSource,
  type UnitEntry,
  type UnitKind,
  type UnitLanguage,
  type UnitManifest,
  type UnitPlatform,
} from './manifest.ts'

// --- Registry ---
export {
  PROVENANCE_FILE,
  SCAN_PRUNE_DIRECTORIES,
  checkCompatibility,
  findAllVersions,
  findUnit,
  planInstall,
  readProvenance,
  resolveDependencies,
  scanRegistry,
  unitsOfKind,
  type DependencyNode,
  type DependencyResolution,
  type FindOptions,
  type HostContract,
  type Installability,
  type InstallabilityReason,
  type Provenance,
  type Registry,
  type RegistryDiagnostic,
  type RegistryEntry,
  type RegistryRoot,
  type ScanRegistryConfig,
} from './registry.ts'

// --- Bündel ---
export {
  BUNDLE_EXTENSION,
  BUNDLE_FORMAT,
  BUNDLE_HEADER_BYTES,
  BUNDLE_MAGIC,
  DIGEST_PLACEHOLDER,
  EXPORT_SKIP_DIRECTORIES,
  EXPORT_SKIP_FILES,
  buildBundle,
  bundleDigestOf,
  checkBundle,
  computeBundleDigest,
  computeContentDigest,
  digestLabel,
  encodeBuiltBundle,
  encodeBundle,
  loadBundleFile,
  planExtract,
  serializeBundleManifest,
  validateRelativePath,
  writeBundleFile,
  type BuildBundleOptions,
  type BuiltBundle,
  type BundleCheck,
  type BundleFile,
  type BundleManifest,
  type BundleUnit,
  type ExtractPlan,
  type ExtractResult,
  type LoadedBundle,
} from './bundle.ts'

// --- Export / Import über die Harness ---
export {
  UnitExportFailure,
  exportUnit,
  importBundle,
  inspectBundle,
  installedEntry,
  listRegistry,
  planBundleInstall,
  planInstalledUnit,
  type BundleInstallPlan,
  type BundleSource,
  type ExportResult,
  type ExportUnitRequest,
  type ImportBundleRequest,
  type ImportFailure,
  type ImportResult,
  type InspectResult,
  type ScanRegistryRequest,
} from './operations.ts'

// --- Fehlermodell ---
export {
  UnitFailure,
  UnitValidationError,
  invalid,
  sortErrors,
  unitError,
  valid,
  type UnitError,
  type UnitErrorCode,
  type Validation,
} from './errors.ts'
