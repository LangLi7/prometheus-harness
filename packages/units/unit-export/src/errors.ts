/**
 * Fehlermodell dieses Pakets.
 *
 * Ein Validierungslauf liefert **alle** Befunde, nicht nur den ersten. Deshalb
 * ist jeder Befund ein eigener Datensatz mit stabilem `code`, und geworfen wird
 * erst am Ende — mit der vollständigen Liste. Ein Aufrufer (CLI, Plugin,
 * HTTP-Handler) kann damit antworten, ohne die Validierung zu wiederholen.
 */

/** Stabile Fehlercodes. Nie umbenennen, nur ergänzen — Aufrufer verzweigen darauf. */
export type UnitErrorCode =
  // --- Manifest (`unit.json`) ---
  | 'manifest_missing'
  | 'manifest_unreadable'
  | 'manifest_not_json'
  | 'manifest_not_object'
  | 'manifest_unknown_field'
  | 'manifest_field_missing'
  | 'manifest_field_type'
  | 'manifest_field_value'
  | 'unit_name_illegal_character'
  | 'unit_name_empty'
  | 'unit_name_too_long'
  | 'unit_name_uppercase'
  | 'unit_name_leading_dot'
  | 'unit_name_trailing_dot'
  | 'unit_name_reserved_device'
  | 'unit_name_directory_mismatch'
  | 'unit_version_not_semver'
  | 'unit_kind_unknown'
  | 'unit_language_unknown'
  | 'unit_platform_unknown'
  | 'unit_self_dependency'
  | 'unit_dependency_duplicate'
  | 'unit_contract_range_invalid'
  // --- Registry ---
  | 'registry_root_missing'
  | 'registry_duplicate_name'
  | 'registry_duplicate_name_case'
  | 'registry_dependency_missing'
  | 'registry_version_conflict'
  | 'registry_dependency_cycle'
  | 'registry_core_contract_incompatible'
  | 'registry_core_contract_unknown'
  | 'registry_provides_collision'
  | 'registry_platform_unsupported'
  // --- Bündel ---
  | 'bundle_missing'
  | 'bundle_unreadable'
  | 'bundle_header_invalid'
  | 'bundle_format_version_unsupported'
  | 'bundle_manifest_not_json'
  | 'bundle_manifest_not_object'
  | 'bundle_manifest_field_missing'
  | 'bundle_manifest_field_type'
  | 'bundle_manifest_field_value'
  | 'bundle_truncated'
  | 'bundle_length_mismatch'
  | 'bundle_digest_mismatch'
  | 'bundle_component_digest_mismatch'
  | 'bundle_file_digest_mismatch'
  | 'bundle_file_size_mismatch'
  | 'bundle_duplicate_entry'
  | 'bundle_source_manifest_invalid'
  | 'bundle_dependency_missing'
  // --- Pfadsicherheit (Sicherheitsgrenze) ---
  | 'path_empty'
  | 'path_absolute'
  | 'path_traversal'
  | 'path_drive_letter'
  | 'path_backslash'
  | 'path_unc'
  | 'path_nul_byte'
  | 'path_empty_segment'
  | 'path_segment_reserved_device'
  | 'path_segment_trailing_dot'
  | 'path_too_long'
  | 'path_escape'
  // --- Installation ---
  | 'install_target_exists'
  | 'install_target_not_directory'
  | 'install_manifest_name_mismatch'
  | 'install_is_no_unit'
  | 'install_rollback'
  // --- Plugin-Host (laden, prüfen, einhängen, abstecken) ---------------------
  // Diese Codes gehören zum Einhängen, nicht zum Bündel: ein Unit kann als
  // Bündel einwandfrei sein und trotzdem als Plugin abgewiesen werden.
  | 'plugin-native-addon'
  | 'plugin-einstieg'
  | 'plugin-kein-plugin'
  | 'plugin-vertrag'
  | 'plugin-abhaengigkeit'
  | 'plugin-lebenszyklus'
  | 'plugin-manifest'
  // --- Generationen, Deklaration, Plugin-Manager (unit-system) ---------------
  // Diese Codes gehören zur Buchführung über Units, nicht zum Unit selbst: ein
  // Unit kann einwandfrei sein und die Generation trotzdem scheitern.
  | 'generation_declaration_missing'
  | 'generation_declaration_unreadable'
  | 'generation_declaration_not_json'
  | 'generation_declaration_not_object'
  | 'generation_declaration_unknown_field'
  | 'generation_declaration_field_missing'
  | 'generation_declaration_field_type'
  | 'generation_declaration_field_value'
  | 'generation_declaration_format_unsupported'
  | 'generation_declaration_unit_unknown'
  | 'generation_declaration_unit_duplicate'
  | 'generation_declaration_unit_disabled'
  | 'generation_declaration_file_missing'
  | 'generation_declaration_root_missing'
  | 'generation_store_unreadable'
  | 'generation_missing'
  | 'generation_number_invalid'
  | 'generation_pointer_missing'
  | 'generation_pointer_invalid'
  | 'generation_nothing_to_do'
  | 'generation_approval_required'
  | 'generation_check_missing'
  | 'generation_check_failed'
  | 'generation_zug_laeuft'
  | 'generation_schema_mismatch'
  | 'generation_prune_refused'
  | 'generation_journal_unreadable'
  | 'generation_fingerprint_mismatch'
  // --- Implementierungsbündel (Rezept statt Inhalt) -------------------------
  | 'implbundle_missing'
  | 'implbundle_unreadable'
  | 'implbundle_not_json'
  | 'implbundle_not_object'
  | 'implbundle_format_unsupported'
  | 'implbundle_field_missing'
  | 'implbundle_field_type'
  | 'implbundle_file_digest_mismatch'
  | 'implbundle_digest_mismatch'
  | 'implbundle_signature_missing'
  | 'implbundle_signature_invalid'
  | 'implbundle_key_missing'
  | 'implbundle_key_invalid'
  | 'implbundle_unit_not_in_closure'
  | 'usage'

/** Ein einzelner, benannter Befund. */
export interface UnitError {
  /** Stabile Kennung für Verzweigungen und Tests. */
  readonly code: UnitErrorCode
  /** Menschenlesbare Beschreibung, deutsch, ohne Pfad-Absolutheiten. */
  readonly message: string
  /** Wo der Befund sitzt, z. B. `unit.json#/requires/0` oder `bundle:files[3].path`. */
  readonly at?: string
  /** Zusätzliche, maschinenlesbare Angaben. */
  readonly detail?: Readonly<Record<string, string | number | boolean>>
}

/** Erzeugt einen Befund. */
export function unitError(
  code: UnitErrorCode,
  message: string,
  at?: string,
  detail?: Readonly<Record<string, string | number | boolean>>,
): UnitError {
  const error: { code: UnitErrorCode; message: string; at?: string; detail?: Readonly<Record<string, string | number | boolean>> } = { code, message }
  if (at !== undefined) error.at = at
  if (detail !== undefined) error.detail = detail
  return error
}

/**
 * Ein Fehler, der mehrere Befunde trägt.
 *
 * `bun` zeigt bei unbehandelten Fehlern nur `message`; die Befunde stehen
 * deshalb auch in der Botschaft, sortiert und durchnummeriert, damit die CLI
 * ohne Zusatzcode vollständig berichtet.
 */
export class UnitValidationError extends Error {
  readonly code: UnitErrorCode
  readonly errors: readonly UnitError[]

  constructor(code: UnitErrorCode, message: string, errors: readonly UnitError[] = []) {
    const sorted = sortErrors(errors)
    const rendered = sorted.length === 0
      ? message
      : `${message}\n${sorted.map((entry, index) => `  ${index + 1}. [${entry.code}] ${entry.at === undefined ? '' : `${entry.at}: `}${entry.message}`).join('\n')}`
    super(rendered)
    this.name = 'UnitValidationError'
    this.code = code
    this.errors = sorted
  }
}

/** Ein Fehler, der genau einen Befund trägt. */
export class UnitFailure extends Error {
  readonly error: UnitError

  constructor(error: UnitError) {
    super(`[${error.code}] ${error.message}`)
    this.name = 'UnitFailure'
    this.error = error
  }
}

/** Stabile Sortierung von Befunden: nach Code, dann Ort, dann Botschaft. */
export function sortErrors(errors: readonly UnitError[]): readonly UnitError[] {
  return [...errors].sort((a, b) =>
    a.code.localeCompare(b.code, 'en')
    || (a.at ?? '').localeCompare(b.at ?? '', 'en')
    || a.message.localeCompare(b.message, 'en'))
}

/** Ein Validierungsergebnis: entweder ein Wert oder mindestens ein Befund. */
export type Validation<T> =
  | { readonly ok: true; readonly value: T; readonly errors: readonly UnitError[]; readonly warnings: readonly UnitError[] }
  | { readonly ok: false; readonly value?: undefined; readonly errors: readonly UnitError[]; readonly warnings: readonly UnitError[] }

/** Erfolg mit optionalen Warnungen. */
export function valid<T>(value: T, warnings: readonly UnitError[] = []): Validation<T> {
  return { ok: true, value, errors: [], warnings: sortErrors(warnings) }
}

/** Fehlschlag mit mindestens einem Befund; Warnungen bleiben daneben sichtbar. */
export function invalid<T>(errors: readonly UnitError[], warnings: readonly UnitError[] = []): Validation<T> {
  if (errors.length === 0) {
    throw new TypeError('invalid() braucht mindestens einen Befund')
  }
  return { ok: false, errors: sortErrors(errors), warnings: sortErrors(warnings) }
}
