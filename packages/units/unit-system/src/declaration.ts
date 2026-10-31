/**
 * Die Deklaration — `harness/units.json`.
 *
 * **Was diese Datei ist.** Das Gegenstück zu `configuration.nix`: die eine
 * Stelle, an der steht, **was gelten soll** — welche Units, welche Fassungen,
 * welche Schichtdateien, welche Datenbankfassung. Sie ist versioniert, von Hand
 * lesbar und vom Agenten schreibbar.
 *
 * **Was sie ausdrücklich nicht ist.** Kein Zustand. In `.pmh/` liegt, was aus ihr
 * **herstellbar** ist. Diese Trennung ist die einzige Regel, die „weitergeben"
 * überhaupt möglich macht: wer Zustand mitschickt, verschickt Geheimnisse und
 * fremde Sitzungen; wer ihn wegläßt, kann „alles behalten" nicht behaupten —
 * deshalb bleibt der Zustand, wo er ist, und die Generation tauscht nur
 * Deklaration und Code.
 *
 * **Warum keine neue Konfigurationssprache.** Drei belegte Gründe stehen in
 * `docs/design/harness-generationen.md` §3.3: die Schichtensemantik des Cores
 * existiert schon, eine zweite Sprache wäre eine zweite Wahrheit, und was fehlt,
 * ist nicht Ausdrucksstärke, sondern Prüfung, Buchführung und Rückweg. Diese
 * Datei ist deshalb JSON in der Form, die dieses Projekt schon überall benutzt.
 *
 * @module @prometheus-harness/unit-system/declaration
 */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import {
  invalid,
  isContractRange,
  unitError,
  valid,
  type UnitError,
  type UnitReload,
  type Validation,
} from '@prometheus-harness/unit-export'

/** Der Dateiname der Deklaration. */
export const DECLARATION_FILE = 'units.json'

/** Der Ordner, in dem die Deklaration liegt, relativ zur Projektwurzel. */
export const DECLARATION_DIR = 'harness'

/** Die Fassung des Deklarationsformats, die dieser Stand liest. */
export const DECLARATION_FORMAT = 1

/**
 * Die Wurzeln, die gelten, wenn die Deklaration keine nennt.
 *
 * **Warum es überhaupt einen Vorgabewert gibt.** Eine Deklaration, die keine
 * Wurzel nennt, hätte einen leeren Bestand zur Folge — und ein leerer Bestand
 * sieht aus wie ein erfolgreicher Bau. Die Vorgabe ist der Bestand, den dieses
 * Projekt tatsächlich hat; sie ist damit eine Aussage über **hier** und nicht
 * über „irgendwo".
 */
export const VORGABE_WURZELN: readonly string[] = ['units', 'services', 'native']

const TAKTE: readonly UnitReload[] = ['hot', 'idle', 'boot']

/** Ein Unit, wie die Deklaration es nennt. */
export interface DeclaredUnit {
  readonly name: string
  /** `false` heißt: deklariert, aber nicht Teil der Generation. */
  readonly enabled: boolean
  /** Fassung oder Spanne; fehlt sie, gilt die höchste verfügbare. */
  readonly version?: string
  /** Überschreibt den Takt aus `unit.json` — die Deklaration gewinnt. */
  readonly reload?: UnitReload
}

/** Eine Datei, die zur Implementierung gehört (Schicht, Pin, Vorlage). */
export interface DeclaredFile {
  /** Relativ zur Projektwurzel, immer mit `/`. */
  readonly path: string
  /** `true` heißt: fehlt sie, ist die Generation nicht baubar. */
  readonly required: boolean
}

/**
 * Ein **Prüfschritt** des Prüfbaus.
 *
 * **Warum Befehle und keine eingebauten Prüfungen.** Der Prüfbau ist das Tor vor
 * jedem Wechsel („bauen und prüfen frei, umschalten nur nach grünem Prüfbau").
 * Wäre die Liste der Prüfungen im Manager fest verdrahtet, könnte der Agent eine
 * **neue** Prüfung nicht deklarieren, ohne den Manager selbst zu ändern — und
 * genau das ist der Punkt der Selbstverbesserung: die Prüfung wächst mit dem
 * System, nicht mit dem Werkzeug.
 *
 * Ein Schritt ist ein Prozeß mit Exit-Code. Das ist die kleinste gemeinsame Form
 * von `bun run typecheck`, `bun test`, `go test ./...` und einem Schema-Abgleich —
 * und sie ist für **jede** Sprache dieselbe.
 */
export interface DeclaredCheck {
  /** Kurzer, stabiler Name — er steht in der Generation und in der Auskunft. */
  readonly name: string
  /** Das Programm. */
  readonly command: string
  readonly args: readonly string[]
  /**
   * Das Arbeitsverzeichnis, **relativ zur Projektwurzel**. Vorgabe: die Wurzel.
   *
   * Ein Schritt, der nur innerhalb eines Unterbaums sinnvoll ist (`go test ./...`
   * in `services/pmh-research`), braucht diesen Ort. Er ist relativ und ohne
   * `..` — ein Prüfbau, der aus dem Projekt ausbrechen kann, wäre ein Werkzeug,
   * das mehr darf als der, der es aufruft.
   */
  readonly cwd?: string
  /**
   * Umgebungswerte für den Schritt.
   *
   * **Ein relativer Wert wird gegen die Projektwurzel aufgelöst**, ein absoluter
   * bleibt wie er ist. Damit kann eine Deklaration `GOCACHE` in den Bauordner
   * legen, ohne einen maschinengebundenen Pfad zu nennen — und genau das war der
   * erste gemessene Fehlschlag des Prüfbaus auf diesem Rechner: `go test` suchte
   * seinen Cache unter `%LOCALAPPDATA%` und bekam „Access is denied".
   */
  readonly env?: Readonly<Record<string, string>>
  /** Frist; danach gilt der Schritt als gescheitert. Vorgabe 300 000 ms. */
  readonly timeoutMs: number
  /**
   * `false` heißt: ein Fehlschlag ist ein **Befund** und sperrt nicht.
   * Die Vorgabe ist `true` — wer eine Prüfung für unverbindlich erklärt, sagt
   * das ausdrücklich.
   */
  readonly required: boolean
}

/** Die Vorgabe-Frist eines Prüfschritts (fünf Minuten). */
export const STANDARD_PRUEF_FRIST_MS = 300_000

/** Die Richtlinie einer Generation. */
export interface DeclarationPolicy {
  /**
   * Ob ein Wechsel einen grünen Prüfbau verlangt.
   *
   * **Vorgabe `true`, und das ist die wichtige Stelle.** Ohne sie ist der Rückweg
   * blind: eine Generation, die niemand geprüft hat, ist von einer geprüften
   * nicht zu unterscheiden — und `rollback` rollt auf etwas zurück, von dem
   * niemand weiß, ob es trug.
   */
  readonly requireCheck: boolean
}

/** Die geprüfte Deklaration. */
export interface Declaration {
  readonly format: 1
  readonly core: {
    readonly version: string
    readonly contract?: string
  }
  /** Die Plattform, gegen die geprüft wird; fehlt sie, gilt die des Aufrufers. */
  readonly platform?: string
  readonly roots: readonly string[]
  readonly units: readonly DeclaredUnit[]
  readonly files: readonly DeclaredFile[]
  /** Die Prüfschritte des Prüfbaus, in Ausführungsreihenfolge. */
  readonly checks: readonly DeclaredCheck[]
  /** Die Richtlinie; fehlt sie, gilt `requireCheck: true`. */
  readonly policy: DeclarationPolicy
  /**
   * Die Datenbankfassung, die diese Generation **erwartet**.
   *
   * Das ist die Zahl, die eine Einbahnstraße erzeugt: eine Generation mit einer
   * höheren Fassung als die laufende Datenbank ist nicht „neu", sondern
   * unbrauchbar. Sie wird am Tor **gemessen**, nicht angenommen.
   */
  readonly schema?: number
  /** Ein Satz, warum es diese Deklaration gibt — wandert ins Journal. */
  readonly reason?: string
}

/** Woher der Text stammt, für Befundorte. */
export interface DeclarationSource {
  readonly json: unknown
  readonly at?: string
}

/**
 * Prüft eine rohe Deklaration.
 *
 * Sammelt **alle** Befunde. Ein Aufrufer, der nur den ersten meldet, zwingt den
 * Menschen zu einer Sitzung „Fehler, Fehler, Fehler" — und genau das ist der
 * Grund, warum dieses Projekt sein Fehlermodell überall gleich hält.
 */
export function parseDeclaration(source: DeclarationSource): Validation<Declaration> {
  const at = source.at ?? DECLARATION_FILE
  const errors: UnitError[] = []
  const raw = source.json

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalid([unitError('generation_declaration_not_object', 'Die Deklaration muß ein JSON-Objekt sein.', at)])
  }

  const record = raw as Record<string, unknown>
  const bekannt = new Set(['format', 'core', 'platform', 'roots', 'units', 'files', 'schema', 'reason', 'checks', 'policy'])
  for (const feld of Object.keys(record)) {
    if (!bekannt.has(feld)) {
      errors.push(unitError('generation_declaration_unknown_field', `Unbekanntes Feld "${feld}".`, `${at}#/${feld}`))
    }
  }

  // --- format ---
  const format = record.format
  if (format === undefined) {
    errors.push(unitError('generation_declaration_field_missing', 'Das Pflichtfeld "format" fehlt.', `${at}#/format`))
  }
  else if (format !== DECLARATION_FORMAT) {
    errors.push(unitError(
      'generation_declaration_format_unsupported',
      `Dieser Stand liest Format ${String(DECLARATION_FORMAT)}, die Deklaration nennt ${JSON.stringify(format)}. Ein höheres Format wird abgelehnt statt geraten.`,
      `${at}#/format`,
    ))
  }

  // --- core ---
  let core: Declaration['core'] | undefined
  const coreRaw = record.core
  if (coreRaw === undefined) {
    errors.push(unitError('generation_declaration_field_missing', 'Das Pflichtfeld "core" fehlt; ohne Core-Fassung ist keine Verträglichkeit prüfbar.', `${at}#/core`))
  }
  else if (typeof coreRaw !== 'object' || coreRaw === null || Array.isArray(coreRaw)) {
    errors.push(unitError('generation_declaration_field_type', '"core" muß ein Objekt sein.', `${at}#/core`))
  }
  else {
    const coreRecord = coreRaw as Record<string, unknown>
    for (const feld of Object.keys(coreRecord)) {
      if (feld !== 'version' && feld !== 'contract') {
        errors.push(unitError('generation_declaration_unknown_field', `Unbekanntes Feld "core.${feld}".`, `${at}#/core/${feld}`))
      }
    }
    const version = coreRecord.version
    if (typeof version !== 'string' || version.trim().length === 0) {
      errors.push(unitError('generation_declaration_field_missing', '"core.version" fehlt oder ist leer.', `${at}#/core/version`))
    }
    const contract = coreRecord.contract
    if (contract !== undefined && typeof contract !== 'string') {
      errors.push(unitError('generation_declaration_field_type', '"core.contract" muß eine Zeichenkette sein.', `${at}#/core/contract`))
    }
    else if (typeof contract === 'string' && !isContractRange(contract)) {
      errors.push(unitError('generation_declaration_field_value', `"core.contract" ist keine gültige Spanne: "${contract}".`, `${at}#/core/contract`))
    }
    if (typeof version === 'string' && version.trim().length > 0) {
      core = { version, ...(typeof contract === 'string' ? { contract } : {}) }
    }
  }

  // --- platform ---
  let platform: string | undefined
  const platformRaw = record.platform
  if (platformRaw !== undefined) {
    if (typeof platformRaw !== 'string' || platformRaw.trim().length === 0) {
      errors.push(unitError('generation_declaration_field_type', '"platform" muß eine nicht-leere Zeichenkette sein.', `${at}#/platform`))
    }
    else {
      platform = platformRaw
    }
  }

  // --- roots ---
  let roots: readonly string[] = VORGABE_WURZELN
  const rootsRaw = record.roots
  if (rootsRaw !== undefined) {
    if (!Array.isArray(rootsRaw)) {
      errors.push(unitError('generation_declaration_field_type', '"roots" muß eine Liste sein.', `${at}#/roots`))
    }
    else {
      const gesammelt: string[] = []
      rootsRaw.forEach((element, index) => {
        if (typeof element !== 'string' || element.trim().length === 0) {
          errors.push(unitError('generation_declaration_field_type', `"roots[${index}]" muß eine nicht-leere Zeichenkette sein.`, `${at}#/roots/${index}`))
          return
        }
        gesammelt.push(element)
      })
      if (gesammelt.length === 0) {
        // Eine leere Wurzelliste ist kein leeres Ergebnis, sondern ein Fehler:
        // sie würde eine Generation mit null Units bauen, und die sieht aus wie
        // ein Erfolg. Wer nichts will, schreibt keine Deklaration.
        errors.push(unitError('generation_declaration_field_value', '"roots" ist leer; ohne Wurzel gibt es keinen Bestand.', `${at}#/roots`))
      }
      roots = gesammelt
    }
  }

  // --- units ---
  const units: DeclaredUnit[] = []
  const unitsRaw = record.units
  if (unitsRaw === undefined) {
    errors.push(unitError('generation_declaration_field_missing', 'Das Pflichtfeld "units" fehlt.', `${at}#/units`))
  }
  else if (!Array.isArray(unitsRaw)) {
    errors.push(unitError('generation_declaration_field_type', '"units" muß eine Liste sein.', `${at}#/units`))
  }
  else {
    const gesehen = new Map<string, number>()
    unitsRaw.forEach((element, index) => {
      const ort = `${at}#/units/${index}`
      if (typeof element !== 'object' || element === null || Array.isArray(element)) {
        errors.push(unitError('generation_declaration_field_type', `"units[${index}]" muß ein Objekt sein.`, ort))
        return
      }
      const eintrag = element as Record<string, unknown>
      for (const feld of Object.keys(eintrag)) {
        if (feld !== 'name' && feld !== 'enabled' && feld !== 'version' && feld !== 'reload') {
          errors.push(unitError('generation_declaration_unknown_field', `Unbekanntes Feld "units.${feld}".`, `${ort}/${feld}`))
        }
      }
      const name = eintrag.name
      if (typeof name !== 'string' || name.trim().length === 0) {
        errors.push(unitError('generation_declaration_field_missing', `"units[${index}].name" fehlt.`, `${ort}/name`))
        return
      }
      const schluessel = name.toLowerCase()
      const vorher = gesehen.get(schluessel)
      if (vorher !== undefined) {
        errors.push(unitError(
          'generation_declaration_unit_duplicate',
          `"${name}" steht mehrfach in der Deklaration (Eintrag ${String(vorher)} und ${String(index)}).`,
          `${ort}/name`,
        ))
      }
      gesehen.set(schluessel, index)

      let enabled = true
      if (eintrag.enabled !== undefined) {
        if (typeof eintrag.enabled !== 'boolean') {
          errors.push(unitError('generation_declaration_field_type', `"units[${index}].enabled" muß true oder false sein.`, `${ort}/enabled`))
        }
        else {
          enabled = eintrag.enabled
        }
      }

      let version: string | undefined
      if (eintrag.version !== undefined) {
        if (typeof eintrag.version !== 'string' || !isContractRange(eintrag.version)) {
          errors.push(unitError(
            'generation_declaration_field_value',
            `"units[${index}].version" ist keine gültige Fassung oder Spanne: ${JSON.stringify(eintrag.version)}.`,
            `${ort}/version`,
          ))
        }
        else {
          version = eintrag.version
        }
      }

      let reload: UnitReload | undefined
      if (eintrag.reload !== undefined) {
        if (typeof eintrag.reload !== 'string' || !TAKTE.includes(eintrag.reload as UnitReload)) {
          errors.push(unitError('generation_declaration_field_value', `"units[${index}].reload" muß ${TAKTE.join(', ')} sein.`, `${ort}/reload`))
        }
        else {
          reload = eintrag.reload as UnitReload
        }
      }

      units.push({
        name,
        enabled,
        ...(version === undefined ? {} : { version }),
        ...(reload === undefined ? {} : { reload }),
      })
    })
  }

  // --- files ---
  const files: DeclaredFile[] = []
  const filesRaw = record.files
  if (filesRaw !== undefined) {
    if (!Array.isArray(filesRaw)) {
      errors.push(unitError('generation_declaration_field_type', '"files" muß eine Liste sein.', `${at}#/files`))
    }
    else {
      filesRaw.forEach((element, index) => {
        const ort = `${at}#/files/${index}`
        if (typeof element === 'object' && element !== null && !Array.isArray(element)) {
          const eintrag = element as Record<string, unknown>
          for (const feld of Object.keys(eintrag)) {
            if (feld !== 'path' && feld !== 'required') {
              errors.push(unitError('generation_declaration_unknown_field', `Unbekanntes Feld "files.${feld}".`, `${ort}/${feld}`))
            }
          }
          const path = eintrag.path
          if (typeof path !== 'string' || path.trim().length === 0) {
            errors.push(unitError('generation_declaration_field_missing', `"files[${index}].path" fehlt.`, `${ort}/path`))
          }
          else {
            let required = true
            if (eintrag.required !== undefined) {
              if (typeof eintrag.required !== 'boolean') {
                errors.push(unitError('generation_declaration_field_type', `"files[${index}].required" muß true oder false sein.`, `${ort}/required`))
              }
              else {
                required = eintrag.required
              }
            }
            files.push({ path, required })
          }
          return
        }
        // Kurzform: eine Zeichenkette gilt als Pflichtdatei. Das ist die Form,
        // die ein Mensch beim Schreiben von Hand tatsächlich tippt.
        if (typeof element === 'string' && element.trim().length > 0) {
          files.push({ path: element, required: true })
          return
        }
        errors.push(unitError('generation_declaration_field_type', `"files[${index}]" muß ein Pfad oder ein Objekt sein.`, ort))
      })
    }
  }

  // --- checks (der Prüfbau) ---
  const checks: DeclaredCheck[] = []
  const checksRaw = record.checks
  if (checksRaw !== undefined) {
    if (!Array.isArray(checksRaw)) {
      errors.push(unitError('generation_declaration_field_type', '"checks" muß eine Liste sein.', `${at}#/checks`))
    }
    else {
      const gesehen = new Map<string, number>()
      checksRaw.forEach((element, index) => {
        const ort = `${at}#/checks/${index}`
        if (typeof element !== 'object' || element === null || Array.isArray(element)) {
          errors.push(unitError('generation_declaration_field_type', `"checks[${index}]" muß ein Objekt sein.`, ort))
          return
        }
        const eintrag = element as Record<string, unknown>
        for (const feld of Object.keys(eintrag)) {
          if (feld !== 'name' && feld !== 'command' && feld !== 'args' && feld !== 'timeoutMs' && feld !== 'required' && feld !== 'cwd' && feld !== 'env') {
            errors.push(unitError('generation_declaration_unknown_field', `Unbekanntes Feld "checks.${feld}".`, `${ort}/${feld}`))
          }
        }
        const checkName = eintrag.name
        if (typeof checkName !== 'string' || checkName.trim().length === 0) {
          errors.push(unitError('generation_declaration_field_missing', `"checks[${index}].name" fehlt.`, `${ort}/name`))
          return
        }
        const vorher = gesehen.get(checkName)
        if (vorher !== undefined) {
          // Zwei Schritte mit demselben Namen wären im Ergebnis nicht
          // unterscheidbar — und der zweite würde den ersten verdecken.
          errors.push(unitError(
            'generation_declaration_field_value',
            `Der Prüfschritt "${checkName}" steht mehrfach (Eintrag ${String(vorher)} und ${String(index)}).`,
            `${ort}/name`,
          ))
        }
        gesehen.set(checkName, index)

        const command = eintrag.command
        if (typeof command !== 'string' || command.trim().length === 0) {
          errors.push(unitError('generation_declaration_field_missing', `"checks[${index}].command" fehlt.`, `${ort}/command`))
          return
        }
        const argsRoh = eintrag.args
        const args: string[] = []
        if (argsRoh !== undefined) {
          if (!Array.isArray(argsRoh)) {
            errors.push(unitError('generation_declaration_field_type', `"checks[${index}].args" muß eine Liste sein.`, `${ort}/args`))
          }
          else {
            argsRoh.forEach((arg, argIndex) => {
              if (typeof arg !== 'string') {
                errors.push(unitError('generation_declaration_field_type', `"checks[${index}].args[${String(argIndex)}]" muß eine Zeichenkette sein.`, `${ort}/args`))
                return
              }
              args.push(arg)
            })
          }
        }
        let timeoutMs = STANDARD_PRUEF_FRIST_MS
        if (eintrag.timeoutMs !== undefined) {
          if (typeof eintrag.timeoutMs !== 'number' || !Number.isInteger(eintrag.timeoutMs) || eintrag.timeoutMs <= 0) {
            errors.push(unitError('generation_declaration_field_value', `"checks[${index}].timeoutMs" muß eine ganze Zahl > 0 sein.`, `${ort}/timeoutMs`))
          }
          else {
            timeoutMs = eintrag.timeoutMs
          }
        }
        let required = true
        if (eintrag.required !== undefined) {
          if (typeof eintrag.required !== 'boolean') {
            errors.push(unitError('generation_declaration_field_type', `"checks[${index}].required" muß true oder false sein.`, `${ort}/required`))
          }
          else {
            required = eintrag.required
          }
        }
        let cwd: string | undefined
        if (eintrag.cwd !== undefined) {
          if (typeof eintrag.cwd !== 'string' || eintrag.cwd.trim().length === 0) {
            errors.push(unitError('generation_declaration_field_type', `"checks[${index}].cwd" muß eine nicht-leere Zeichenkette sein.`, `${ort}/cwd`))
          }
          else if (eintrag.cwd.startsWith('/') || eintrag.cwd.startsWith('\\') || /^[A-Za-z]:/.test(eintrag.cwd)) {
            // Absolut heißt: maschinengebunden. Der Befund E4 dieses Projekts
            // zählt 357 solcher Pfade — eine Deklaration, die nur auf einem
            // Rechner gilt, ist keine Deklaration.
            errors.push(unitError('generation_declaration_field_value', `"checks[${index}].cwd" darf nicht absolut sein.`, `${ort}/cwd`))
          }
          else if (eintrag.cwd.split(/[\\/]/).includes('..')) {
            errors.push(unitError('generation_declaration_field_value', `"checks[${index}].cwd" darf nicht aus dem Projekt zeigen.`, `${ort}/cwd`))
          }
          else {
            cwd = eintrag.cwd
          }
        }

        let env: Record<string, string> | undefined
        if (eintrag.env !== undefined) {
          if (typeof eintrag.env !== 'object' || eintrag.env === null || Array.isArray(eintrag.env)) {
            errors.push(unitError('generation_declaration_field_type', `"checks[${index}].env" muß ein Objekt sein.`, `${ort}/env`))
          }
          else {
            const werte: Record<string, string> = {}
            for (const [schluessel, wert] of Object.entries(eintrag.env as Record<string, unknown>)) {
              if (schluessel.trim().length === 0 || /[\s=]/.test(schluessel)) {
                errors.push(unitError('generation_declaration_field_value', `"checks[${index}].env" hat einen unbrauchbaren Namen "${schluessel}".`, `${ort}/env`))
                continue
              }
              if (typeof wert !== 'string') {
                errors.push(unitError('generation_declaration_field_type', `"checks[${index}].env.${schluessel}" muß eine Zeichenkette sein.`, `${ort}/env/${schluessel}`))
                continue
              }
              werte[schluessel] = wert
            }
            env = werte
          }
        }

        checks.push({
          name: checkName,
          command,
          args,
          timeoutMs,
          required,
          ...(cwd === undefined ? {} : { cwd }),
          ...(env === undefined ? {} : { env }),
        })
      })
    }
  }

  // --- policy ---
  let policy: DeclarationPolicy = { requireCheck: true }
  const policyRaw = record.policy
  if (policyRaw !== undefined) {
    if (typeof policyRaw !== 'object' || policyRaw === null || Array.isArray(policyRaw)) {
      errors.push(unitError('generation_declaration_field_type', '"policy" muß ein Objekt sein.', `${at}#/policy`))
    }
    else {
      const policyRecord = policyRaw as Record<string, unknown>
      for (const feld of Object.keys(policyRecord)) {
        if (feld !== 'requireCheck') {
          errors.push(unitError('generation_declaration_unknown_field', `Unbekanntes Feld "policy.${feld}".`, `${at}#/policy/${feld}`))
        }
      }
      let requireCheck = true
      if (policyRecord.requireCheck !== undefined) {
        if (typeof policyRecord.requireCheck !== 'boolean') {
          errors.push(unitError('generation_declaration_field_type', '"policy.requireCheck" muß true oder false sein.', `${at}#/policy/requireCheck`))
        }
        else {
          requireCheck = policyRecord.requireCheck
        }
      }
      policy = { requireCheck }
    }
  }

  // --- schema ---
  let schema: number | undefined
  const schemaRaw = record.schema
  if (schemaRaw !== undefined) {
    if (typeof schemaRaw !== 'number' || !Number.isInteger(schemaRaw) || schemaRaw < 0) {
      errors.push(unitError('generation_declaration_field_type', '"schema" muß eine ganze Zahl ≥ 0 sein.', `${at}#/schema`))
    }
    else {
      schema = schemaRaw
    }
  }

  // --- reason ---
  let reason: string | undefined
  const reasonRaw = record.reason
  if (reasonRaw !== undefined) {
    if (typeof reasonRaw !== 'string') {
      errors.push(unitError('generation_declaration_field_type', '"reason" muß eine Zeichenkette sein.', `${at}#/reason`))
    }
    else {
      reason = reasonRaw
    }
  }

  if (errors.length > 0 || core === undefined) return invalid(errors)

  return valid({
    format: DECLARATION_FORMAT,
    core,
    ...(platform === undefined ? {} : { platform }),
    roots,
    units,
    files,
    checks,
    policy,
    ...(schema === undefined ? {} : { schema }),
    ...(reason === undefined ? {} : { reason }),
  })
}

/** Der Standardpfad der Deklaration in einem Projekt. */
export function declarationPath(projectRoot: string): string {
  return join(resolve(projectRoot), DECLARATION_DIR, DECLARATION_FILE)
}

/** Liest und prüft die Deklaration aus einer Datei. */
export async function readDeclaration(path: string): Promise<Validation<Declaration>> {
  const at = DECLARATION_FILE
  let text: string
  try {
    text = await readFile(path, 'utf8')
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR') {
      return invalid([unitError(
        'generation_declaration_missing',
        `Keine Deklaration unter "${path}". Ohne sie gibt es nichts zu bauen — und ein leerer Bau wäre eine Lüge.`,
        at,
      )])
    }
    return invalid([unitError('generation_declaration_unreadable', `Deklaration nicht lesbar: ${(error as Error).message}`, at)])
  }

  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  }
  catch (error) {
    return invalid([unitError('generation_declaration_not_json', `Deklaration ist kein gültiges JSON: ${(error as Error).message}`, at)])
  }
  return parseDeclaration({ json, at })
}
