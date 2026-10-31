/**
 * `@prometheus-harness/skillspector` — Typen des Sicherheits-Scanners.
 *
 * **Warum diese Datei getrennt ist.** Ein Bericht ist ein Vertrag: das Install-Gate,
 * der CLI-Ausdruck, die SARIF-Ausgabe und ein Baseline-Vergleich lesen dieselben
 * Felder. Wer sie an vier Stellen deklariert, hat vier Wahrheiten.
 *
 * Die Namen folgen dem Bericht von NVIDIA SkillSpector (`risk_assessment`,
 * `recommendation`, `severity`), damit ein fremder Bericht und dieser hier
 * vergleichbar bleiben. Die Schreibweise im Code bleibt deutsch-frei: englische
 * Bezeichner, deutsche Erklärung.
 *
 * @module @prometheus-harness/skillspector/types
 */

/** Schweregrad eines Befunds. */
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/** Handlungsempfehlung, abgeleitet aus dem Risikoband. */
export type Recommendation = 'SAFE' | 'CAUTION' | 'DO_NOT_INSTALL'

/** Die Regel-Familien — dieselben Kürzel wie im Vorbild. */
export type Category =
  | 'prompt-injection'
  | 'data-exfiltration'
  | 'privilege-escalation'
  | 'supply-chain'
  | 'excessive-agency'
  | 'output-handling'
  | 'system-prompt-leakage'
  | 'memory-poisoning'
  | 'tool-misuse'
  | 'rogue-agent'
  | 'anti-refusal'
  | 'trigger-abuse'
  | 'dangerous-code'
  | 'taint-tracking'
  | 'mcp-least-privilege'
  | 'mcp-tool-poisoning'

/** Eine Datei, wie sie dem Scanner übergeben wird. */
export interface ScanFile {
  /** Pfad relativ zur gescannten Wurzel, immer mit `/` als Trenner. */
  readonly path: string
  /** Vollständiger Textinhalt. Binärdateien erscheinen nicht hier. */
  readonly text: string
  /** Ob die Datei ausführbar ist (Shebang, `.sh`, `.ps1`, `.py`, `.js`, `.ts`, `.exe`). */
  readonly executable?: boolean
}

/** Ein Bestandteil des gescannten Artefakts. */
export interface ScanComponent {
  readonly path: string
  readonly type: string
  readonly lines: number
  readonly executable: boolean
  readonly sizeBytes: number
}

/** Ein einzelner Befund. */
export interface Finding {
  /** Regel-Kennung, z. B. `PI2`. Stabil über Fassungen. */
  readonly id: string
  readonly category: Category
  readonly severity: Severity
  /** 0..1 — wie sicher die Regel ist, nicht wie schwer der Schaden ist. */
  readonly confidence: number
  /** Kurzzeile für die Anzeige. */
  readonly message: string
  /** Datei relativ zur Wurzel. */
  readonly file: string
  /** 1-basierte Zeile. */
  readonly line: number
  /** Gekürzter, normalisierter Belegtext. */
  readonly evidence: string
  /** Stabile Kennung für Baselines: `sha256` über Regel, Datei und Beleg. */
  readonly fingerprint: string
}

/** Warum eine Datei nicht geprüft wurde. */
export interface SkippedFile {
  readonly path: string
  readonly reason: 'binary' | 'too-large' | 'unreadable' | 'symlink-escape'
}

/** Abdeckung des Laufs — der Unterschied zwischen „sauber“ und „nicht geprüft“. */
export interface Coverage {
  /** Ob jede gefundene Datei geprüft werden konnte. */
  readonly complete: boolean
  readonly scannedFiles: number
  readonly skippedFiles: readonly SkippedFile[]
}

/** Der Risikoteil des Berichts. */
export interface RiskAssessment {
  /** 0..100. */
  readonly score: number
  readonly severity: Severity
  readonly recommendation: Recommendation
}

/** Kopf des Berichts: was wurde wann geprüft. */
export interface ScannedSkill {
  readonly name: string
  /** Woher der Inhalt kam: Pfad oder `inline`. */
  readonly source: string
  /** ISO-8601 in UTC. */
  readonly scannedAt: string
  /** `sha256` über alle Dateien, inhaltsgebunden und reihenfolgeunabhängig. */
  readonly digest: string
}

/** Der vollständige Bericht. */
export interface ScanReport {
  readonly skill: ScannedSkill
  readonly risk: RiskAssessment
  readonly components: readonly ScanComponent[]
  readonly issues: readonly Finding[]
  /** Wie viele Befunde eine Baseline unterdrückt hat. */
  readonly suppressed: number
  readonly coverage: Coverage
  readonly metadata: ScanMetadata
}

/** Herkunft und Grenzen des Laufs. */
export interface ScanMetadata {
  readonly scanner: 'pmh-skillspector'
  readonly version: string
  /** Immer `false`: dieser Scanner führt keinen LLM-Schritt aus. */
  readonly llmRequested: false
  readonly llmAvailable: false
  /** Anzahl ausführbarer Bestandteile; treibt den 1,3-Multiplikator. */
  readonly executableComponents: number
  /** Angewandte Baseline, falls eine übergeben wurde. */
  readonly baseline?: string
}

/** Optionen eines Laufs. */
export interface ScanOptions {
  /** Anzeigename; Vorgabe: Verzeichnisname oder `inline`. */
  readonly name?: string
  /** Woher der Inhalt kam; Vorgabe: `inline`. */
  readonly source?: string
  /** Zeitpunkt des Laufs; Vorgabe: jetzt. Nur für Prüfungen gesetzt. */
  readonly now?: Date
  /** Ausdrücklich ausgeschlossene Pfade (POSIX-Globs relativ zur Wurzel). */
  readonly exclude?: readonly string[]
  /** Höchstgröße einer Datei in Bytes; Vorgabe 1 MiB wie im Vorbild. */
  readonly maxFileBytes?: number
  /** Geladene Baseline; unterdrückt passende Befunde. */
  readonly baseline?: Baseline
  /** Wenn gesetzt, wird dieser Bericht zusätzlich als Baseline-Ausgabe vorbereitet. */
  readonly baselineLabel?: string
}

/** Ein Eintrag einer Baseline. */
export interface BaselineEntry {
  readonly fingerprint: string
  readonly ruleId: string
  readonly file: string
  readonly reason?: string
  readonly acceptedAt?: string
}

/** Eine glob-basierte Unterdrückungsregel — für bewusst akzeptierte Muster. */
export interface BaselineRule {
  readonly ruleId?: string
  readonly path?: string
  readonly message?: string
}

/** Die Baseline-Datei. */
export interface Baseline {
  readonly version: 1
  readonly scanner: 'pmh-skillspector'
  readonly entries: readonly BaselineEntry[]
  readonly rules?: readonly BaselineRule[]
}

/** Das Ergebnis eines Gates: darf installiert werden? */
export interface GateDecision {
  readonly allowed: boolean
  /** `block` bei `DO_NOT_INSTALL`, `warn` bei `CAUTION`, `allow` bei `SAFE`. */
  readonly action: 'allow' | 'warn' | 'block'
  readonly report: ScanReport
  /** Menschelesbare Begründung. */
  readonly reason: string
}
