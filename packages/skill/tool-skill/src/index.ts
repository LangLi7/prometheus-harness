/**
 * `@prometheus-harness/tool-skill` — der Katalog und das Werkzeug `skill`.
 *
 * **Die zwei Hälften, die zusammengehören.**
 *
 * | Hälfte | Wann sie wirkt | Was sie kostet |
 * |---|---|---|
 * | **Katalog** | in jeder Anfrage | wenige Zeilen je Fähigkeit (Name + Beschreibung) |
 * | **Werkzeug `skill`** | nur wenn das Modell es ruft | der volle Rumpf, einmal |
 *
 * Der Katalog ist damit die Bedingung dafür, daß das Modell überhaupt weiß, was es laden
 * kann. Ohne ihn wäre das Werkzeug ein Ratespiel; mit dem Rumpf in jeder Anfrage wäre jede
 * Anfrage teuer. Deshalb steht im Katalog **nur** der Name und eine gekürzte Beschreibung —
 * kein Pfad, keine Quelle, kein Anbieter.
 *
 * **Was dieses Paket bewußt nicht tut.** Es hängt sich nicht in einen Step-Hook und schreibt
 * keine Sitzungsereignisse: Prometheus' `AgentLoop` kennt keine Vor-Step-Einfügung. Der
 * Katalog wird deshalb **als Text** geliefert, den der Aufrufer in seine Systemanweisung
 * einsetzt; die Entscheidung, wann ein neuer Katalog fällig ist, trifft er mit
 * {@link katalogDigest}. Ein Hook, der Ereignisse schreibt, wäre eine zweite Wahrheit über
 * den Sitzungsverlauf — genau die Doppelung, die dieses Projekt vermeidet.
 *
 * @module @prometheus-harness/tool-skill
 */

import { createHash } from 'node:crypto'

import type { AgentTool, ToolContext } from '@prometheus-harness/agent-tools'
import {
  escapeText,
  isModelInvocable,
  isSkillName,
  isUserInvocable,
  renderSkillContent,
  type SkillRegistry,
  type SkillSummary,
} from '@prometheus-harness/skill'
import type { Scope } from '@prometheus-harness/scope'

/** Vorgabe für die Länge einer Katalogbeschreibung. */
export const DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500

/** Ein Eintrag, wie ihn der Katalog zeigt und der Digest bindet. */
export interface CatalogEntry {
  readonly name: string
  readonly description: string
}

/** Einstellungen des Katalogs. */
export interface CatalogOptions {
  /** Höchstlänge der gekürzten Beschreibung; mindestens 3. Vorgabe 500. */
  readonly maxDescriptionLength?: number
}

/** Einstellungen des Werkzeugs. */
export interface SkillToolOptions {
  /** Arbeitsverzeichnis für die Suche — fest oder je Aufruf bestimmt. */
  readonly cwd?: string | (() => string | undefined)
  /** Betrachtender Scope; fehlt er, gilt die globale Schicht. */
  readonly scope?: Scope
}

/**
 * Baut das Modell-Werkzeug `skill`.
 *
 * Der Name ist bewußt `skill` — dieselbe Adresse, die der Katalog nennt. Ein anderer Name
 * würde den Katalogtext und die Werkzeugliste auseinanderlaufen lassen.
 *
 * @param registry - die Registry, aus der geladen wird
 * @param options - Arbeitsverzeichnis und Scope
 * @returns ein {@link AgentTool}, das eine Fähigkeit als `<skill_content>` zurückgibt
 */
export function skillWerkzeug(registry: SkillRegistry, options: SkillToolOptions = {}): AgentTool {
  return {
    name: 'skill',
    description:
      'Lädt die vollständigen Anweisungen einer verfügbaren Fähigkeit. Rufe dieses Werkzeug mit dem genauen Namen aus dem Fähigkeitskatalog auf, bevor du eine Aufgabe bearbeitest, die eine Fähigkeit nennt oder eindeutig zu ihrer Beschreibung paßt.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Der genaue Fähigkeitsname aus der Liste der verfügbaren Fähigkeiten.',
        },
      },
    },
    async execute(args: Readonly<Record<string, unknown>>, context: ToolContext): Promise<string> {
      const angefragt = args['name']
      if (typeof angefragt !== 'string') {
        throw new Error('skill: das Argument "name" fehlt oder ist kein Text')
      }
      if (!isSkillName(angefragt)) {
        throw new Error(`skill: ungültiger Fähigkeitsname "${angefragt}"`)
      }

      const cwd = typeof options.cwd === 'function' ? options.cwd() : options.cwd
      const lookup = {
        ...(cwd === undefined ? {} : { cwd }),
        ...(options.scope === undefined ? {} : { scope: options.scope }),
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      }
      const summary = (await registry.list(lookup)).find((entry) => entry.name === angefragt)
      if (summary === undefined) {
        throw new Error(`skill: "${angefragt}" ist unbekannt oder nicht mehr verfügbar`)
      }
      if (!isModelInvocable(summary)) {
        throw new Error(`skill: "${angefragt}" ist für den Modell-Aufruf nicht freigegeben`)
      }

      const geladen = await registry.get(angefragt, lookup)
      if (geladen === undefined) {
        throw new Error(`skill: "${angefragt}" ist unbekannt oder nicht mehr verfügbar`)
      }
      if (!isModelInvocable(geladen)) {
        throw new Error(`skill: "${angefragt}" ist für den Modell-Aufruf nicht freigegeben`)
      }
      return renderSkillContent(geladen)
    },
  }
}

/**
 * Die Katalogeinträge, die das Modell sehen darf.
 *
 * Filter und Sortierung liegen **hier**, nicht beim Aufrufer: zwei Aufrufer, die
 * unterschiedlich filtern, hätten zwei Kataloge — und der Digest würde sie nicht bemerken.
 *
 * @param skills - die Kurzfassungen aus {@link SkillRegistry.list}
 * @param options - Längengrenze
 * @returns die Einträge in Namensreihenfolge
 * @throws RangeError bei einer Längengrenze unter 3
 */
export function katalogEintraege(
  skills: readonly SkillSummary[],
  options: CatalogOptions = {},
): CatalogEntry[] {
  const maxLength = options.maxDescriptionLength ?? DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH
  assertMaxLength(maxLength)
  return skills
    .filter(isModelInvocable)
    .map((skill) => ({
      name: skill.name,
      description: beschreibungKuerzen(skill.description, maxLength),
    }))
    .sort((left, right) => compareCodePoints(left.name, right.name))
}

/**
 * Der erste Katalog einer Sitzung.
 *
 * Ein leerer Katalog ergibt `''`: nichts zu sagen ist besser als eine Rahmung ohne Inhalt.
 * Der Aufrufer setzt das Ergebnis in seine Systemanweisung oder hängt es als Nachricht an.
 *
 * @param skills - die Kurzfassungen
 * @param options - Längengrenze der Beschreibungen
 * @returns der `<system-reminder>`-Block oder `''`
 */
export function katalogText(skills: readonly SkillSummary[], options: CatalogOptions = {}): string {
  const entries = katalogEintraege(skills, options)
  if (entries.length === 0) return ''
  return [
    '<system-reminder>',
    'Eine Fähigkeit ist ein wiederverwendbarer Satz aufgabenbezogener Anweisungen. In dieser Sitzung sind verfügbar:',
    '',
    '<available_skills>',
    ...renderCatalogEntries(entries),
    '</available_skills>',
    '',
    'Wenn der Benutzer eine Fähigkeit nennt oder die Aufgabe eindeutig zu ihrer Beschreibung paßt, rufe das Werkzeug `skill` mit dem genauen Namen auf, bevor du handelst. Lade alle zutreffenden Fähigkeiten und folge ihren vollständigen Anweisungen. Dieser Katalog enthält nur Kurzfassungen; folge den Anweisungen einer Fähigkeit erst, nachdem du sie geladen hast.',
    'Ein Benutzer kann eine Fähigkeit auch direkt aufrufen; ihr <skill_content>-Block erscheint dann in diesem Gespräch. Folge ihm und rufe das Werkzeug `skill` für diese Fähigkeit nicht erneut auf.',
    '</system-reminder>',
  ].join('\n')
}

/**
 * Ein **vollständiger** Ersatzkatalog.
 *
 * Die Form ist die der Vorlage: sie sagt ausdrücklich, daß sie jede frühere Liste ersetzt.
 * Ein leerer Ersatzkatalog ist ebenfalls eine Aussage — „es gibt jetzt keine" — und darf
 * nicht verschwiegen werden, sonst hielte das Modell die alten Namen für gültig.
 *
 * @param skills - die Kurzfassungen
 * @param options - Längengrenze der Beschreibungen
 * @returns der `<system-reminder>`-Block
 */
export function katalogErsetzung(skills: readonly SkillSummary[], options: CatalogOptions = {}): string {
  const entries = katalogEintraege(skills, options)
  const hinweis = entries.length === 0
    ? [
        'Es sind derzeit keine Fähigkeiten über das Werkzeug `skill` verfügbar. Benutze keine Namen aus früheren Katalogen.',
        'Ein Benutzer kann eine Fähigkeit weiterhin direkt aufrufen; ihr <skill_content>-Block erscheint dann in diesem Gespräch. Folge ihm und rufe das Werkzeug `skill` dafür nicht auf.',
      ]
    : [
        'Benutze nur Namen aus diesem Ersatzkatalog. Wenn der Benutzer eine gelistete Fähigkeit nennt oder die Aufgabe eindeutig zu ihrer Beschreibung paßt, rufe das Werkzeug `skill` mit dem genauen Namen auf, bevor du handelst.',
        'Ein Benutzer kann eine Fähigkeit auch direkt aufrufen; ihr <skill_content>-Block erscheint dann in diesem Gespräch. Folge ihm und rufe das Werkzeug `skill` für diese Fähigkeit nicht erneut auf.',
      ]
  return [
    '<system-reminder>',
    'Der Katalog der verfügbaren Fähigkeiten hat sich geändert. Dieser vollständige Katalog ersetzt jede frühere Liste in dieser Sitzung:',
    '',
    '<available_skills>',
    ...renderCatalogEntries(entries),
    '</available_skills>',
    '',
    ...hinweis,
    '</system-reminder>',
  ].join('\n')
}

/**
 * Der Identitätswert eines Katalogs.
 *
 * Gebunden an die **Einträge**, nicht an den gerenderten Text: die Rahmung ist für das Modell
 * geschrieben und darf nicht entscheiden, ob neu veröffentlicht wird. Jeder Eintrag wird als
 * JSON-Paar gebunden — ein Trennzeichen allein wäre selbst ein gültiges Zeichen einer
 * Beschreibung, und zwei verschiedene Kataloge könnten denselben Digest tragen.
 *
 * @param entries - die Einträge in Katalogreihenfolge
 * @returns SHA-256 in Hex
 */
export function katalogDigest(entries: readonly CatalogEntry[]): string {
  const kanonisch = entries.map((entry) => JSON.stringify([entry.name, entry.description])).join('\n')
  return createHash('sha256').update(kanonisch).digest('hex')
}

/**
 * Kürzt und normalisiert eine Beschreibung für den Katalog.
 *
 * Weißraum wird zu einem Leerzeichen zusammengezogen: eine Beschreibung mit Zeilenumbrüchen
 * würde den Katalograhmen sonst optisch zerlegen. Gekürzt wird auf `maxLength` Zeichen
 * einschließlich der drei Punkte.
 */
export function beschreibungKuerzen(value: string, maxLength = DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH): string {
  assertMaxLength(maxLength)
  const normalisiert = value.replaceAll(/\s+/g, ' ').trim()
  return normalisiert.length <= maxLength ? normalisiert : `${normalisiert.slice(0, maxLength - 3)}...`
}

/**
 * Findet `/name`-Gesten in einem Text.
 *
 * Die Form ist die der Vorlage: ein durch Weißraum begrenztes `/name` mit der öffentlichen
 * Namensgrammatik. Ein zweiter Schrägstrich oder ein anderes Zeichen bricht die Übereinstimmung
 * — damit bleiben Pfade (`/usr/bin`) und Brüche (`5/8`) außen vor.
 *
 * @param text - der Text, etwa eine Benutzernachricht
 * @returns die Namen in Reihenfolge des ersten Auftretens, ohne Doppel
 */
export function aufgerufeneSkills(text: string): string[] {
  const namen: string[] = []
  for (const treffer of text.matchAll(SKILL_GESTURE)) {
    const name = treffer[2]
    if (name !== undefined && !namen.includes(name)) namen.push(name)
  }
  return namen
}

/**
 * Filtert eine Fähigkeitsliste auf die, die ein Mensch aufrufen darf.
 *
 * @param skills - Kandidaten oder Kurzfassungen
 * @returns dieselbe Reihenfolge, nur benutzeraufrufbare Einträge
 */
export function benutzerSkills<T extends Pick<SkillSummary, 'invocation'>>(skills: readonly T[]): T[] {
  return skills.filter(isUserInvocable)
}

const SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g

function renderCatalogEntries(entries: readonly CatalogEntry[]): string[] {
  return entries.map((entry) => `- \`${entry.name}\`: ${escapeText(entry.description)}`)
}

function assertMaxLength(value: number): void {
  if (!Number.isInteger(value) || value < 3) {
    throw new RangeError(`tool-skill: maxDescriptionLength muss eine ganze Zahl ≥ 3 sein, ist ${String(value)}`)
  }
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
