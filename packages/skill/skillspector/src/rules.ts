/**
 * `@prometheus-harness/skillspector/rules` — der Regelbestand.
 *
 * **Was eine Regel ist.** Eine Regel ist eine benannte, prüfbare Aussage über
 * Text: „hier wird eine Anweisung überschrieben“, „hier werden Umgebungsvariablen
 * gesammelt“, „hier wird ein Skript aus dem Netz ausgeführt“. Sie liefert
 * **Belege**, keine Urteile — Schweregrad und Score rechnet der Aufrufer.
 *
 * **Warum die Kennungen stabil sind.** Eine Baseline und ein Bericht verweisen auf
 * `PI2`, nicht auf „Regel 17“. Wer eine Regel umbenennt, macht jede akzeptierte
 * Stelle wieder auf — deshalb sind die Kennungen hier eingefroren.
 *
 * **Warum Markdown vorsichtiger bewertet wird.** In einer Anleitung stehen
 * Shellbefehle als Beispiel. Ein `curl | bash` in einem Codeblock ist dokumentiert,
 * nicht ausgeführt. Deshalb senkt `markdownConfidence` das Vertrauen, statt den
 * Befund zu verschweigen: der Bericht zeigt die Stelle, der Leser entscheidet.
 *
 * @module @prometheus-harness/skillspector/rules
 */

import type { Category, ScanFile, Severity } from './types.ts'
import {
  findAll,
  findSuspiciousBase64,
  findUnicodeTricks,
  lineOfIndex,
  normalizeEvidence,
} from './text.ts'

/** Ein Treffer einer Regel, noch ohne Kennung und Fingerabdruck. */
export interface RuleHit {
  /** Datei; fehlt sie, gilt die Datei des Kontexts. */
  readonly file?: string
  /** 1-basierte Zeile. */
  readonly line: number
  /** Normalisierter Beleg. */
  readonly evidence: string
  /** Abweichende Meldung. */
  readonly message?: string
  /** Abweichendes Vertrauen (0..1). */
  readonly confidence?: number
}

/** Der Kontext einer Regelprüfung. */
export interface RuleContext {
  /** Die aktuelle Datei bei Datei-Regeln; die erste Datei bei Skill-Regeln. */
  readonly file: ScanFile
  /** Alle Dateien des Artefakts. */
  readonly files: readonly ScanFile[]
}

/** Eine Regel. */
export interface Rule {
  readonly id: string
  readonly category: Category
  readonly severity: Severity
  readonly title: string
  /** Grundvertrauen, wenn der Treffer nichts anderes sagt. */
  readonly confidence: number
  /** `file`: je Datei; `skill`: einmal über alle Dateien. Vorgabe `file`. */
  readonly scope?: 'file' | 'skill'
  find(context: RuleContext): RuleHit[]
}

/** Dateiarten, auf denen eine Regel sinnvoll läuft. */
type Kind = 'markdown' | 'code' | 'json' | 'yaml' | 'config'

interface PatternRuleOptions {
  readonly confidence?: number
  readonly kinds?: readonly Kind[]
  readonly message?: string
  /** Nur Treffer, deren Volltext zusätzlich diesem Ausdruck entspricht. */
  readonly require?: RegExp
  /** Zusätzliche Bedingung an die Datei — etwa „nur MCP-Konfigurationen“. */
  readonly when?: (file: ScanFile) => boolean
  /** Höchstzahl gemeldeter Treffer je Datei. */
  readonly max?: number
}

const CODE_EXTENSIONS = ['.sh', '.bash', '.ps1', '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.rb', '.pl', '.go']
const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx']

/** Bestimmt die grobe Art einer Datei für `kinds`-Filter. */
function kindOf(path: string): Kind {
  const lower = path.toLowerCase()
  if (MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension))) return 'markdown'
  if (CODE_EXTENSIONS.some((extension) => lower.endsWith(extension))) return 'code'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  return 'config'
}

/**
 * Ob eine Datei eine MCP-Konfiguration ist.
 *
 * **Warum das nötig ist.** Ein Datenbestand mit Website-Einträgen enthält
 * `"url": "http://…"` — das ist keine MCP-Adresse. Die MCP-Regeln dürfen nur auf
 * Dateien wirken, die MCP-Server **erklären**, sonst meldet der Scanner fremde
 * Daten als Konfigurationsfehler.
 */
function isMcpFile(file: ScanFile): boolean {
  const lower = file.path.toLowerCase()
  const name = lower.split('/').pop() ?? ''
  if (name === '.mcp.json' || name === 'mcp.json' || name === 'mcp-servers.json') return true
  if (!lower.endsWith('.json')) return false
  return /"mcpServers"\s*:/.test(file.text) || /"mcp_servers"\s*:/.test(file.text)
}

/**
 * Baut eine Musterregel.
 *
 * @param id - stabile Kennung
 * @param category - Familie
 * @param severity - Schweregrad
 * @param title - Kurztitel
 * @param pattern - globaler Ausdruck
 * @param options - Vertrauen, Dateiarten, Meldung
 * @returns die Regel
 */
function patternRule(
  id: string,
  category: Category,
  severity: Severity,
  title: string,
  pattern: RegExp,
  options: PatternRuleOptions = {},
): Rule {
  const confidence = options.confidence ?? 0.8
  const kinds = options.kinds
  const max = options.max ?? 5
  return {
    id,
    category,
    severity,
    title,
    confidence,
    find(context) {
      const kind = kindOf(context.file.path)
      if (kinds !== undefined && !kinds.includes(kind)) return []
      if (options.when !== undefined && !options.when(context.file)) return []
      const lowered = kind === 'markdown' ? 0.75 : 1
      const hits: RuleHit[] = []
      for (const { index, match } of findAll(pattern, context.file.text)) {
        if (options.require !== undefined && !options.require.test(match[0])) continue
        hits.push({
          line: lineOfIndex(context.file.text, index),
          evidence: normalizeEvidence(match[0]),
          ...(options.message === undefined ? {} : { message: options.message }),
          confidence: Math.max(0.3, Math.min(0.99, confidence * lowered)),
        })
        if (hits.length >= max) break
      }
      return hits
    },
  }
}

/** Die Regeln, die je Datei laufen. */
const FILE_RULES: Rule[] = [
  // --- Prompt-Injection -----------------------------------------------------
  patternRule(
    'PI1',
    'prompt-injection',
    'HIGH',
    'Anweisung wird überschrieben',
    /\b(?:ignore|disregard|forget|override|bypass)\b[^\n]{0,60}\b(?:previous|prior|above|earlier|all|system)\b[^\n]{0,30}\b(?:instructions?|prompts?|rules?|directives?|guidelines?)\b/gi,
    { confidence: 0.9 },
  ),
  patternRule(
    'PI2',
    'prompt-injection',
    'HIGH',
    'Rollen- oder Systemprompt-Übernahme',
    /\b(?:you are now|from now on you are|act as (?:the )?system|new system prompt|system prompt[: ]+override|developer mode enabled)\b/gi,
    { confidence: 0.85 },
  ),
  patternRule(
    'PI3',
    'anti-refusal',
    'HIGH',
    'Ablehnung soll unterdrückt werden',
    /\b(?:do not|don't|never)\s+(?:refuse|decline|warn|ask for (?:permission|confirmation)|tell the user)\b|\b(?:jailbreak|DAN mode|no restrictions apply|without any (?:ethical )?restrictions)\b/gi,
    { confidence: 0.85 },
  ),
  patternRule(
    'PI4',
    'prompt-injection',
    'HIGH',
    'Versteckte Anweisung in HTML-Kommentar',
    /<!--[\s\S]{0,600}?(?:ignore|override|disregard)\b[\s\S]{0,200}?(?:instructions?|rules?|system prompt)|\bdo not (?:tell|inform) the user\b[\s\S]{0,300}?-->/gi,
    { confidence: 0.8, max: 3 },
  ),
  {
    id: 'PI5',
    category: 'prompt-injection',
    severity: 'HIGH',
    title: 'Kodierte Anweisung (Base64)',
    confidence: 0.8,
    find(context) {
      return findSuspiciousBase64(context.file.text).map((block) => ({
        line: lineOfIndex(context.file.text, block.index),
        evidence: normalizeEvidence(block.decoded),
        message: 'Base64-Block dekodiert zu Text mit Anweisungscharakter',
      }))
    },
  },
  {
    id: 'PI6',
    category: 'prompt-injection',
    severity: 'HIGH',
    title: 'Unsichtbare oder täuschende Unicode-Zeichen',
    confidence: 0.75,
    find(context) {
      return findUnicodeTricks(context.file.text).map((hit) => ({
        line: lineOfIndex(context.file.text, hit.index),
        evidence: `${hit.kind} ${hit.sample}`,
        message: `Täuschendes Zeichen (${hit.kind})`,
      }))
    },
  },
  patternRule(
    'SL1',
    'system-prompt-leakage',
    'HIGH',
    'Systemprompt soll ausgegeben werden',
    /\b(?:print|reveal|show|output|repeat|dump|leak)\b[^\n]{0,40}\b(?:system prompt|hidden instructions|your instructions|initial prompt|developer message)\b/gi,
    { confidence: 0.85 },
  ),
  patternRule(
    'SL2',
    'system-prompt-leakage',
    'MEDIUM',
    'Gesprächsverlauf soll weitergegeben werden',
    /\b(?:send|upload|post|transmit|share)\b[^\n]{0,40}\b(?:conversation|chat history|message history|transcript)\b/gi,
    { confidence: 0.75 },
  ),
  patternRule(
    'MP1',
    'memory-poisoning',
    'HIGH',
    'Dauerhafte Agenten-Konfiguration wird verändert',
    /\b(?:write|append|modify|overwrite|create|edit)\b[^\n]{0,50}(?:CLAUDE\.md|AGENTS\.md|\.cursorrules|\.windsurfrules|settings\.json|\.claude\/)/gi,
    { confidence: 0.75 },
  ),
  patternRule(
    'TA1',
    'trigger-abuse',
    'MEDIUM',
    'Versteckter Auslöser (Keyword-Backdoor)',
    /\b(?:when|if)\b[^\n]{0,40}\b(?:user|human|prompt)\b[^\n]{0,40}\b(?:says|mentions|types|contains)\b[^\n]{0,60}\b(?:then|run|execute|send|delete|exfiltrate)\b/gi,
    { confidence: 0.7 },
  ),
  patternRule(
    'AR1',
    'rogue-agent',
    'HIGH',
    'Verdecktes Handeln',
    /\b(?:do not|never)\s+(?:tell|inform|notify|mention (?:this )?to)\s+(?:the )?(?:user|human)\b/gi,
    { confidence: 0.8 },
  ),

  // --- Datenabfluss ---------------------------------------------------------
  patternRule(
    'E1',
    'data-exfiltration',
    'LOW',
    'Netzwerkaufruf im Code',
    /\b(?:requests?\.(?:post|put|patch)|axios\.(?:post|put)|\bfetch\(|http\.request|urllib\.request|Invoke-RestMethod|Invoke-WebRequest|\bcurl\b|\bwget\b)/gi,
    { confidence: 0.6, kinds: ['code'], max: 10 },
  ),
  patternRule(
    'E2',
    'data-exfiltration',
    'HIGH',
    'Umgebungsvariablen werden gesammelt',
    /(?:Object\.(?:entries|keys|values)\(\s*process\.env\s*\)|for\s+\w+\s+in\s+os\.environ|os\.environ\.items\(\)|Get-ChildItem\s+env:|printenv\b)/gi,
    { confidence: 0.9, kinds: ['code'] },
  ),
  patternRule(
    'E3',
    'data-exfiltration',
    'HIGH',
    'Zugangsdaten werden gelesen',
    /(?:\.ssh\/id_[a-z0-9]+|\.ssh\/config|\.aws\/credentials|\.npmrc|\.netrc|\.git-credentials|id_rsa|credentials\.json|Login Data)/gi,
    { confidence: 0.75, kinds: ['code'] },
  ),
  patternRule(
    'E5',
    'data-exfiltration',
    'HIGH',
    'Datenabfluss über DNS',
    /(?:nslookup|dig|host)\s+[^\n]{0,40}\$\(|dns\.lookup\(|dns\.resolve\(/gi,
    { confidence: 0.7, kinds: ['code'] },
  ),

  // --- Rechteausweitung ----------------------------------------------------
  patternRule(
    'PE1',
    'privilege-escalation',
    'HIGH',
    'Rechteausweitung angefordert',
    /\b(?:sudo|doas|pkexec|Start-Process[^\n]{0,60}-Verb\s+RunAs)\b/gi,
    { confidence: 0.85, kinds: ['code'] },
  ),
  patternRule(
    'PE2',
    'privilege-escalation',
    'HIGH',
    'Offene Dateirechte',
    /chmod\s+(?:-R\s+)?(?:777|666|\+s)|SetAccessRule[^\n]{0,80}FullControl/gi,
    { confidence: 0.9, kinds: ['code'] },
  ),
  patternRule(
    'PE3',
    'privilege-escalation',
    'HIGH',
    'Dauerhafte Ausführung eingerichtet',
    /(?:>>?\s*~?\/?\.(?:bashrc|zshrc|bash_profile|profile)|crontab\s+-(?:e|r)|schtasks\s+\/create|LaunchAgents|LaunchDaemons|systemctl\s+enable)/gi,
    { confidence: 0.8, kinds: ['code'] },
  ),

  // --- Lieferkette ---------------------------------------------------------
  patternRule(
    'SC1',
    'supply-chain',
    'CRITICAL',
    'Skript aus dem Netz wird ausgeführt',
    /(?:(?:curl|wget)[^\n|]{0,200}\|\s*(?:sudo\s+)?(?:ba|z|k)?sh)|(?:iwr|Invoke-WebRequest)[^\n|]{0,120}\|\s*iex|Invoke-Expression\s*\(/gi,
    { confidence: 0.95, max: 3 },
  ),
  patternRule(
    'SC2',
    'supply-chain',
    'MEDIUM',
    'Ungepinnte Installation aus dem Netz',
    /\b(?:pip3?|npm|bun|pnpm|yarn)\s+(?:install|add)\s+(?:-g\s+|--global\s+)?(?:git\+|https?:\/\/)/gi,
    { confidence: 0.8 },
  ),
  patternRule(
    'SC4',
    'supply-chain',
    'MEDIUM',
    'Fremde Paketquelle',
    /registry\s*=\s*["']?https?:\/\/(?!registry\.npmjs\.org|pypi\.org)/gi,
    { confidence: 0.7 },
  ),
  {
    id: 'SC3',
    category: 'supply-chain',
    severity: 'MEDIUM',
    title: 'Installations-Hook im Paketmanifest',
    confidence: 0.85,
    find(context) {
      if (kindOf(context.file.path) !== 'json') return []
      if (!/(?:^|\/)package\.json$/.test(context.file.path)) return []
      let parsed: unknown
      try {
        parsed = JSON.parse(context.file.text)
      } catch {
        return []
      }
      if (typeof parsed !== 'object' || parsed === null) return []
      const scripts = (parsed as { scripts?: unknown }).scripts
      if (typeof scripts !== 'object' || scripts === null) return []
      const hits: RuleHit[] = []
      for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
        const value = (scripts as Record<string, unknown>)[name]
        if (typeof value !== 'string' || value.trim() === '') continue
        if (!/(?:curl|wget|node\s+-e|powershell|bash|sh\s)/i.test(value)) continue
        hits.push({
          line: lineOfIndex(context.file.text, context.file.text.indexOf(value)),
          evidence: normalizeEvidence(`${name}: ${value}`),
          message: `Lebenszyklus-Skript "${name}" führt Netzbefehl aus`,
        })
      }
      return hits
    },
  },

  // --- Gefährlicher Code ---------------------------------------------------
  patternRule(
    'DC1',
    'dangerous-code',
    'MEDIUM',
    'Dynamische Codeausführung',
    /\b(?:eval|exec|Function)\s*\(|\bos\.system\s*\(|subprocess\.(?:run|call|Popen)\s*\([^\n]{0,120}shell\s*=\s*True|child_process\.exec\s*\(/g,
    { confidence: 0.8, kinds: ['code'] },
  ),
  patternRule(
    'DC2',
    'dangerous-code',
    'HIGH',
    'Unsicheres Deserialisieren',
    /pickle\.loads?\s*\(|marshal\.loads?\s*\(|yaml\.load\s*\([^\n)]*\)|unserialize\s*\(|node-serialize/gi,
    { confidence: 0.8, kinds: ['code'] },
  ),
  patternRule(
    'OH1',
    'output-handling',
    'HIGH',
    'Shell-Aufruf mit interpolierter Eingabe',
    /(?:exec|execSync|spawn|system|popen)\s*\([^\n)]{0,120}(?:\$\{|`|\+\s*(?:input|query|prompt|args?))/gi,
    { confidence: 0.8, kinds: ['code'] },
  ),

  // --- Übermäßige Handlungsmacht ------------------------------------------
  patternRule(
    'EA1',
    'excessive-agency',
    'HIGH',
    'Sicherheitsabfragen werden abgeschaltet',
    /(?:--dangerously-skip-permissions|bypassPermissions|autoApprove|alwaysAllow|(?:allow|permit)\s+all\s+tools)/gi,
    { confidence: 0.9 },
  ),
  patternRule(
    'EA4',
    'excessive-agency',
    'LOW',
    'Sandbox des Browsers abgeschaltet',
    /--no-sandbox\b/gi,
    { confidence: 0.7 },
  ),
  patternRule(
    'EA2',
    'excessive-agency',
    'CRITICAL',
    'Zerstörerischer Löschbefehl',
    /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(?:\/|~|\$HOME|\*)|Remove-Item[^\n]{0,80}-Recurse[^\n]{0,40}-Force|\bmkfs\.\w+|\bdd\s+if=/gi,
    { confidence: 0.95, max: 3 },
  ),
  patternRule(
    'EA3',
    'excessive-agency',
    'LOW',
    'Unbegrenzte Schleife',
    /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)|while\s+True\s*:/g,
    { confidence: 0.55, kinds: ['code'] },
  ),
  patternRule(
    'TM1',
    'tool-misuse',
    'HIGH',
    'Zerstörerischer Git-Befehl',
    /git\s+(?:push\s+(?:--force|-f)|reset\s+--hard|clean\s+-[a-z]*f[a-z]*d)/gi,
    { confidence: 0.9 },
  ),
  patternRule(
    'RA1',
    'rogue-agent',
    'MEDIUM',
    'Selbstvervielfachung oder Agenten-Ketten',
    /\b(?:spawn|fork|create)\b[^\n]{0,40}\b(?:another|new|additional)\s+(?:agent|instance|copy of yourself)\b|\breplicate yourself\b|\bcopy this skill\b/gi,
    { confidence: 0.7 },
  ),

  // --- MCP ----------------------------------------------------------------
  patternRule(
    'MCP1',
    'mcp-least-privilege',
    'MEDIUM',
    'Unverschlüsselter MCP-Endpunkt außerhalb von localhost',
    /"url"\s*:\s*"http:\/\/(?!127\.0\.0\.1|localhost|\[::1\])[^"]*"/gi,
    { confidence: 0.85, when: isMcpFile },
  ),
  patternRule(
    'MCP2',
    'mcp-least-privilege',
    'HIGH',
    'Zugangsdatum im Klartext im MCP-Header',
    /"headers?"\s*:\s*\{[^}]{0,400}?"(?:Authorization|X-Api-Key|api-key)"\s*:\s*"(?:Bearer\s+)?[A-Za-z0-9_\-.]{20,}"/gi,
    { confidence: 0.9, when: isMcpFile },
  ),
  patternRule(
    'MCP3',
    'mcp-least-privilege',
    'MEDIUM',
    'MCP-Server erhält Zugriff auf das gesamte Dateisystem',
    /"(?:path|paths|directory|root)"\s*:\s*"(?:\/|~|\*|[A-Za-z]:\\\\)"/gi,
    { confidence: 0.7, when: isMcpFile },
  ),
  {
    id: 'MCP4',
    category: 'mcp-tool-poisoning',
    severity: 'HIGH',
    title: 'Werkzeugbeschreibung enthält Anweisungen',
    confidence: 0.85,
    find(context) {
      if (!isMcpFile(context.file)) return []
      let parsed: unknown
      try {
        parsed = JSON.parse(context.file.text)
      } catch {
        return []
      }
      const hits: RuleHit[] = []
      const visit = (value: unknown, key: string): void => {
        if (typeof value === 'string') {
          if (key !== 'description' && key !== 'title' && key !== 'instructions') return
          if (
            /\b(?:ignore|override|disregard)\b[^\n]{0,40}\b(?:instructions?|rules?|system)\b|\byou must (?:always|never)\b|\bdo not (?:tell|inform) the user\b/i.test(
              value,
            )
          ) {
            hits.push({
              line: lineOfIndex(context.file.text, Math.max(0, context.file.text.indexOf(value.slice(0, 40)))),
              evidence: normalizeEvidence(value),
              message: `Feld "${key}" enthält eine Anweisung statt einer Beschreibung`,
            })
          }
          return
        }
        if (Array.isArray(value)) {
          for (const item of value) visit(item, key)
          return
        }
        if (typeof value === 'object' && value !== null) {
          for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey)
        }
      }
      visit(parsed, '')
      return hits.slice(0, 5)
    },
  },
  {
    id: 'MCP5',
    category: 'mcp-least-privilege',
    severity: 'LOW',
    title: 'MCP-Server mit Werkzeug-Allowlist statt Denylist prüfen',
    confidence: 0.5,
    find(context) {
      if (kindOf(context.file.path) !== 'json') return []
      if (!/"mcpServers"\s*:/.test(context.file.text)) return []
      if (/"allowedTools"\s*:/.test(context.file.text)) return []
      const index = context.file.text.indexOf('"mcpServers"')
      return [
        {
          line: lineOfIndex(context.file.text, index),
          evidence: '"mcpServers" ohne "allowedTools"',
          message: 'MCP-Server ohne ausdrückliche Werkzeugfreigabe',
        },
      ]
    },
  },
]

/** Regeln, die das ganze Artefakt betrachten. */
const SKILL_RULES: Rule[] = [
  {
    id: 'TT1',
    category: 'taint-tracking',
    severity: 'HIGH',
    title: 'Gesammelte Umgebung wird nach außen gesendet',
    confidence: 0.9,
    scope: 'skill',
    find(context) {
      const harvest = /(?:Object\.(?:entries|keys|values)\(\s*process\.env\s*\)|os\.environ\.items\(\)|Get-ChildItem\s+env:)/i
      const send = /(?:requests?\.post|axios\.post|\bfetch\(|Invoke-RestMethod)/i
      const harvester = context.files.find((file) => kindOf(file.path) === 'code' && harvest.test(file.text))
      const sender = context.files.find((file) => kindOf(file.path) === 'code' && send.test(file.text))
      if (harvester === undefined || sender === undefined) return []
      return [
        {
          file: sender.path,
          line: lineOfIndex(sender.text, Math.max(0, sender.text.search(send))),
          evidence: normalizeEvidence(`${harvester.path} sammelt Umgebung; ${sender.path} sendet nach außen`),
          message: 'Kombination aus Umgebungsvariablen-Sammlung und Netzversand',
          confidence: 0.9,
        },
      ]
    },
  },
]

/** Alle Regeln in Anzeigereihenfolge. */
export const RULES: readonly Rule[] = [...FILE_RULES, ...SKILL_RULES]

/** Regelverzeichnis nach Kennung — für Berichte und Baselines. */
export const RULES_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((rule) => [rule.id, rule]))

/** Die Regelkennungen in stabiler Reihenfolge. */
export const RULE_IDS: readonly string[] = RULES.map((rule) => rule.id)
