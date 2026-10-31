/**
 * Die Vorgänge des Plugin-Managers — bauen, prüfen, zeigen, umschalten,
 * zurückrollen, aufräumen.
 *
 * **Die Haltung dieses Moduls ist Vorsicht, nicht Bequemlichkeit.** Drei
 * Entscheidungen, die deshalb so und nicht anders aussehen:
 *
 *  1. **Bauen wirkt nicht.** `baue` schreibt eine Generation und rührt keinen
 *     Zeiger an. Das ist `nixos-rebuild build`. Ein Bau, der nebenbei scharf
 *     wird, ist ein Bau, den niemand mehr prüfen kann.
 *  2. **Einbahnstraßen verlangen eine Freigabe.** Ändert sich die
 *     Datenbankfassung oder tritt ein `irreversible`-Unit hinzu, wird der
 *     Wechsel **abgelehnt**, solange niemand ihn ausdrücklich freigibt. Ein
 *     Rückweg, der Daten zerstört, ist kein Rückweg.
 *  3. **Gleicher Fingerabdruck baut nicht neu.** „Nichts geändert" ist eine
 *     Auskunft und keine neue Generation — sonst wächst die Liste bei jedem
 *     Aufruf, und die Rückrolltiefe wird zu einer Frage der Geduld.
 *
 * @module @prometheus-harness/unit-system/operations
 */

import { resolve } from 'node:path'

import {
  findUnit,
  scanRegistry,
  unitError,
  type HostContract,
  type UnitError,
  type UnitReload,
} from '@prometheus-harness/unit-export'

import { loeseAbschluss, type Closure, type ClosureResult } from './closure.ts'
import { declarationPath, readDeclaration, type Declaration } from './declaration.ts'
import { fuehrePruefbauAus, type Pruefbau, type Schrittauffuehrung } from './pruefbau.ts'
import {
  deklarationsDigest,
  fingerabdruck,
  journalAnhaengen,
  layoutFor,
  leseGeneration,
  leseZeiger,
  listGenerationen,
  raeumeAuf,
  schreibeGeneration,
  schreibePruefung,
  schreibeZeiger,
  vergleiche,
  type GenerationInhalt,
  type GenerationRecord,
  type GenerationsVergleich,
  type StateLayout,
} from './generation.ts'

/** Die gemeinsame Eingabe aller Vorgänge. */
export interface BasisAnfrage {
  /** Die Projektwurzel; enthält `harness/` und `.pmh/`. */
  readonly projectRoot: string
  /** Der Zustandsordner, relativ zur Projektwurzel (Vorgabe `.pmh`). */
  readonly stateDir?: string
  /** Der Zeitpunkt, der in Datensatz und Journal steht (prüfbar mit fester Uhr). */
  readonly jetzt?: string
  /** Wer handelt — steht im Journal. */
  readonly actor?: string
  /**
   * Die Datenbankfassung, die **gemessen** wurde. Ist sie angegeben und weicht
   * von der erwarteten ab, sperrt das den Wechsel — statt sie anzunehmen.
   */
  readonly schemaStand?: number
}

/** Das Ergebnis einer Prüfung. */
export interface PrufBericht {
  readonly ok: boolean
  readonly befunde: readonly UnitError[]
  readonly warnungen: readonly UnitError[]
  readonly declaration?: Declaration
  readonly closure?: Closure
}

function layoutVon(request: BasisAnfrage): StateLayout {
  return layoutFor(resolve(request.projectRoot), request.stateDir ?? undefined)
}

/**
 * Baut den Generationsinhalt aus Deklaration und Abschluß.
 *
 * **Eine Stelle, nicht zwei.** Der Inhalt entsteht sowohl beim Bau als auch bei
 * der Drift-Prüfung; zwei Kopien würden irgendwann verschieden rechnen, und der
 * Drift-Befund wäre dann über eine andere Sache als die Generation.
 */
function inhaltAus(declaration: Declaration, closure: Closure): GenerationInhalt {
  return {
    core: declaration.core,
    platform: declaration.platform ?? process.platform,
    schema: declaration.schema ?? null,
    units: closure.units,
    files: closure.files,
    takt: closure.takt,
    irreversible: closure.irreversible,
    declarationDigest: deklarationsDigest(declaration),
    requireCheck: declaration.policy.requireCheck,
    checks: declaration.checks,
    ...(declaration.reason === undefined ? {} : { reason: declaration.reason }),
  }
}

/**
 * Baut die Quittung eines Wechsels.
 *
 * **Drei Auskünfte, und keine wird geraten.** Ob der Prozeß wechselt, steht im
 * Vergleich (Takt der **geänderten** Units, nicht der ganzen Generation). Ob eine
 * Sitzung fortgesetzt werden kann, weiß nur, wer es sagt — fehlt die Auskunft,
 * steht `unbekannt` da und nicht `moeglich`.
 */
function quittungFuer(
  von: GenerationRecord | undefined,
  nach: GenerationRecord,
  vergleich: GenerationsVergleich,
  request: { readonly zug?: ZugLage; readonly fortsetzbar?: boolean },
): Quittung {
  const prozessWechsel = vergleich.benoetigt === 'boot'
  const fortsetzung: Quittung['fortsetzung'] = !prozessWechsel
    ? 'nicht-noetig'
    : request.fortsetzbar === true ? 'moeglich' : 'unbekannt'

  const zugTeil = request.zug === undefined
    ? 'über laufende Züge ist nichts bekannt'
    : request.zug.laeuftEinZug
      ? `es lief ein Zug${request.zug.offeneWerkzeuge === undefined ? '' : ` (${String(request.zug.offeneWerkzeuge)} Werkzeug(e) offen)`}`
      : 'es lief kein Zug'

  // **Der Satz nennt beides.** Der erste Entwurf sagte bei Takt `hot` nur „kein
  // Prozeßwechsel" — und verschwieg damit, ob ein Zug lief, obwohl der Aufrufer
  // es gesagt hatte. Eine Quittung, die eine übergebene Auskunft nicht
  // weitergibt, ist keine Quittung.
  const hinweis = !prozessWechsel
    ? `Kein Prozeßwechsel nötig (Takt "${vergleich.benoetigt}") — dieser Wechsel berührt eine laufende Sitzung nicht; ${zugTeil}.`
    : fortsetzung === 'moeglich'
      ? `Prozeßwechsel nötig (Takt "boot"); die Sitzung kann aus dem Protokoll fortgesetzt werden — ${zugTeil}.`
      : `Prozeßwechsel nötig (Takt "boot"); ob die Sitzung fortgesetzt werden kann, hat niemand gesagt — ${zugTeil}.`

  return {
    von: von?.number ?? null,
    nach: nach.number,
    fingerprint: nach.fingerprint,
    takt: vergleich.benoetigt,
    prozessWechsel,
    fortsetzung,
    ...(request.zug === undefined ? {} : { zug: request.zug }),
    hinweis,
  }
}

/** Der Host-Vertrag, den die Deklaration beschreibt. */
export function hostAus(declaration: Declaration): HostContract {
  return {
    coreVersion: declaration.core.version,
    ...(declaration.core.contract === undefined ? {} : { defaultContract: declaration.core.contract }),
    platform: declaration.platform ?? process.platform,
  }
}

/**
 * Prüft die Deklaration gegen den Bestand — ohne etwas zu schreiben.
 *
 * Das ist der Trockenlauf: er beantwortet „würde dieser Bau gelingen, und wenn
 * nicht, warum genau". Er berührt weder Zustand noch Zeiger.
 */
export async function pruefe(request: BasisAnfrage & { readonly declarationPath?: string }): Promise<PrufBericht> {
  const pfad = request.declarationPath ?? declarationPath(request.projectRoot)
  const gelesen = await readDeclaration(pfad)
  if (!gelesen.ok) {
    return { ok: false, befunde: gelesen.errors, warnungen: gelesen.warnings }
  }
  const declaration = gelesen.value
  const abschluss = await loeseAbschluss({
    projectRoot: request.projectRoot,
    declaration,
    host: hostAus(declaration),
  })
  if (!abschluss.ok) {
    return { ok: false, befunde: abschluss.errors, warnungen: abschluss.warnings, declaration }
  }
  return {
    ok: true,
    befunde: [],
    warnungen: abschluss.closure.warnings,
    declaration,
    closure: abschluss.closure,
  }
}

/** Eine gebaute Generation samt Bericht. */
export interface BauErgebnis extends PrufBericht {
  readonly generation?: GenerationRecord
  /** `true`, wenn der Fingerabdruck schon als aktive Generation vorlag. */
  readonly uebersprungen: boolean
  /** Der Vergleich zur aktiven Generation. */
  readonly vergleich?: GenerationsVergleich
  /** Das Ergebnis des Prüfbaus, wenn einer verlangt wurde. */
  readonly pruefung?: Pruefbau
}

/**
 * Baut eine Generation — und wirkt ausdrücklich **nicht**.
 *
 * Liegt derselbe Fingerabdruck schon als aktive Generation vor, wird nichts
 * geschrieben: die Antwort ist „unverändert", nicht eine neue Nummer.
 */
export async function baue(
  request: BasisAnfrage & {
    readonly declarationPath?: string
    readonly force?: boolean
    /** `true` = nach dem Bau den Prüfbau ausführen und in der Generation ablegen. */
    readonly mitPruefung?: boolean
    /** Wie die Prüfschritte ausgeführt werden (austauschbar für Prüfungen). */
    readonly ausfuehren?: Schrittauffuehrung
  },
): Promise<BauErgebnis> {
  const bericht = await pruefe(request)
  if (!bericht.ok || bericht.closure === undefined || bericht.declaration === undefined) {
    return { ...bericht, uebersprungen: false }
  }

  const layout = layoutVon(request)
  const declaration = bericht.declaration
  const closure = bericht.closure
  const inhalt = inhaltAus(declaration, closure)
  const abdruck = fingerabdruck(inhalt)

  // **Wogegen dedupliziert wird: gegen die NEUESTE Generation, nicht gegen die
  // aktive.** Die aktive ist der falsche Anker — solange nichts umgeschaltet
  // ist, gäbe es sonst bei jedem Aufruf eine neue Nummer für unveränderten
  // Inhalt, und die Liste wüchse, ohne daß sich etwas geändert hätte. „Nichts
  // geändert seit dem letzten Bau" ist die Auskunft, die hier gebraucht wird;
  // ob sie auch *aktiv* ist, sagt `zustand` und nicht der Bau.
  const vorhandene = await listGenerationen(layout)
  const neuesteNummer = vorhandene.length === 0 ? undefined : vorhandene[vorhandene.length - 1]
  const currentNummer = await leseZeiger(layout, 'current')
  const aktuelle = currentNummer === undefined ? undefined : await leseGeneration(layout, currentNummer).catch(() => undefined)

  if (neuesteNummer !== undefined && request.force !== true) {
    const letzte = await leseGeneration(layout, neuesteNummer).catch(() => undefined)
    if (letzte !== undefined && letzte.fingerprint === abdruck) {
      return {
        ...bericht,
        generation: letzte,
        uebersprungen: true,
        vergleich: vergleiche(aktuelle, letzte),
      }
    }
  }

  const generation = await schreibeGeneration(layout, inhalt, request.jetzt ?? new Date().toISOString())
  await journalAnhaengen(layout, {
    at: request.jetzt ?? new Date().toISOString(),
    event: 'build',
    generation: generation.number,
    fingerprint: generation.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: declaration.reason ?? 'Generation gebaut',
  })

  const pruefung = request.mitPruefung === true
    ? await fuehrePruefbauAus(declaration.checks, layout.projectRoot, {
      ...(request.ausfuehren === undefined ? {} : { ausfuehren: request.ausfuehren }),
      ...(request.jetzt === undefined ? {} : { jetzt: () => request.jetzt as string }),
    })
    : undefined

  if (pruefung === undefined) {
    return { ...bericht, generation, uebersprungen: false, vergleich: vergleiche(aktuelle, generation) }
  }

  // **Ein roter Prüfbau löscht die Generation nicht.** Sie wird geschrieben, und
  // das Ergebnis wird mitgeschrieben — sonst wäre „geprüft und durchgefallen"
  // nicht von „nie geprüft" zu unterscheiden. Das Tor steht beim **Wechsel**
  // (`schalte`), nicht beim Bau.
  const geprueft = await schreibePruefung(layout, generation.number, pruefung)
  await journalAnhaengen(layout, {
    at: request.jetzt ?? new Date().toISOString(),
    event: 'build',
    generation: geprueft.number,
    fingerprint: geprueft.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: pruefung.ok
      ? `Prüfbau grün (${String(pruefung.schritte.length)} Schritt(e))`
      : `Prüfbau ROT — ${pruefung.grund}`,
  })

  return {
    ...bericht,
    generation: geprueft,
    uebersprungen: false,
    vergleich: vergleiche(aktuelle, geprueft),
    pruefung,
  }
}

/** Wie eine Umschaltung wirkt. */
export type UmschaltArt = 'switch' | 'boot' | 'test'

/**
 * Was der Aufrufer über **laufende Arbeit** weiß.
 *
 * **Warum das der Aufrufer liefert und nicht dieser Manager ermittelt.** Ob
 * gerade ein Zug läuft, weiß nur der Host — offene Züge, laufende Werkzeuge,
 * laufende Subagenten. Der Manager kennt nur Generationen und Zeiger. Er kann
 * die Frage deshalb **nicht selbst beantworten**, aber er kann sie
 * **verlangen**: ohne Antwort gilt „unbekannt", und „unbekannt" ist nicht „ruhig".
 */
export interface ZugLage {
  /** `true` heißt: es läuft gerade ein Zug. */
  readonly laeuftEinZug: boolean
  /** Wie viele Werkzeugaufrufe offen sind, wenn der Host es weiß. */
  readonly offeneWerkzeuge?: number
  /** Wie viele Subagenten laufen, wenn der Host es weiß. */
  readonly offeneSubagenten?: number
}

/**
 * Die Quittung eines Wechsels — der ehrliche Teil.
 *
 * **Der Anlaß.** In Socket.IO heißt das Feld `recovered`: *„The `recovered`
 * attribute indicates whether this recovery was successful."* Es gibt keine
 * ehrliche Umschaltung ohne diese Auskunft, denn „die Sitzung wurde fortgesetzt"
 * und „die Sitzung wurde **nicht** fortgesetzt" sehen für den Aufrufer gleich aus,
 * wenn niemand es sagt.
 */
export interface Quittung {
  readonly von: number | null
  readonly nach: number
  readonly fingerprint: string
  /** Der Takt, den dieser Wechsel mindestens braucht. */
  readonly takt: UnitReload
  /** `true` heißt: der Wechsel verlangt einen neuen Prozess (Takt `boot`). */
  readonly prozessWechsel: boolean
  /**
   * `nicht-noetig` — der Prozess bleibt, keine Sitzung muß fortgesetzt werden.
   * `moeglich` — der Prozess wechselt; die Sitzung **kann** aus dem Protokoll fortgesetzt werden.
   * `unbekannt` — der Prozess wechselt und niemand hat gesagt, ob die Fortsetzung trägt.
   */
  readonly fortsetzung: 'nicht-noetig' | 'moeglich' | 'unbekannt'
  /** Was über laufende Arbeit bekannt war. */
  readonly zug?: ZugLage
  /** Ein Satz, den ein Mensch lesen und verstehen kann. */
  readonly hinweis: string
}

/** Das Ergebnis einer Umschaltung. */
export interface UmschaltErgebnis {
  readonly ok: boolean
  readonly befunde: readonly UnitError[]
  readonly generation?: GenerationRecord
  readonly vergleich?: GenerationsVergleich
  /** Welcher Zeiger gesetzt wurde. */
  readonly zeiger?: 'current' | 'next' | 'beide'
  /** Woher die Nummer stammt — damit „irgendetwas" nie stillschweigend geschieht. */
  readonly quelle?: 'nummer' | 'next' | 'current' | 'neueste'
  /** Die ehrliche Auskunft über diesen Wechsel. */
  readonly quittung?: Quittung
}

/**
 * Legt einen Zeiger um — die einzige Stelle, an der etwas „scharf" wird.
 *
 * Die drei NixOS-Zeitpunkte, auf dieses System abgebildet:
 *
 * | Art | Wirkung |
 * |---|---|
 * | `switch` | `current` **und** `next` — es gilt jetzt und beim nächsten Start |
 * | `test`   | nur `current` — jetzt ausprobieren, beim nächsten Start zurück |
 * | `boot`   | nur `next` — vorbereiten, nicht scharf machen |
 */
export async function schalte(
  request: BasisAnfrage & {
    readonly nummer?: number
    readonly art: UmschaltArt
    readonly freigabe?: boolean
    readonly erzwinge?: boolean
    /** Was der Host über laufende Arbeit weiß. Fehlt es, gilt „unbekannt". */
    readonly zug?: ZugLage
    /** Ob eine laufende Sitzung aus dem Protokoll fortgesetzt werden kann. */
    readonly fortsetzbar?: boolean
  },
): Promise<UmschaltErgebnis> {
  const layout = layoutVon(request)

  // **Woher die Nummer kommt, wird gesagt und nicht geraten.** Ohne Angabe gilt:
  // erst was vorbereitet ist (`next`), dann was läuft (`current`), zuletzt das
  // zuletzt Gebaute. Die Reihenfolge ist die vorsichtige: ein vorbereiteter
  // Stand gewinnt gegen einen alten, und „das Neueste" ist die letzte Wahl —
  // nicht die erste.
  let nummer = request.nummer
  let quelle: 'nummer' | 'next' | 'current' | 'neueste' = 'nummer'
  if (nummer === undefined) {
    const vorgemerkt = await leseZeiger(layout, 'next')
    const aktiv = await leseZeiger(layout, 'current')
    if (vorgemerkt !== undefined) {
      nummer = vorgemerkt
      quelle = 'next'
    }
    else if (aktiv !== undefined) {
      nummer = aktiv
      quelle = 'current'
    }
    else {
      const alle = await listGenerationen(layout)
      nummer = alle.length === 0 ? undefined : alle[alle.length - 1]
      quelle = 'neueste'
    }
  }
  if (nummer === undefined) {
    return {
      ok: false,
      befunde: [unitError(
        'generation_nothing_to_do',
        'Es gibt keine Generation: weder "next" noch "current" ist gesetzt, und gebaut wurde auch nichts.',
      )],
    }
  }

  let generation: GenerationRecord
  try {
    generation = await leseGeneration(layout, nummer)
  }
  catch (error) {
    return { ok: false, befunde: [(error as { error?: UnitError }).error ?? unitError('generation_missing', String(error))] }
  }

  // --- Das Tor: die Datenbankfassung wird gemessen, nicht angenommen -------
  if (request.schemaStand !== undefined && generation.schema !== null && request.schemaStand !== generation.schema) {
    return {
      ok: false,
      generation,
      quelle,
      befunde: [unitError(
        'generation_schema_mismatch',
        `Generation ${String(nummer)} erwartet Datenbankschema ${String(generation.schema)}, gemessen ist ${String(request.schemaStand)}.`,
        undefined,
        { erwartet: generation.schema, gemessen: request.schemaStand },
      )],
    }
  }

  const currentNummer = await leseZeiger(layout, 'current')
  const aktuelle = currentNummer === undefined ? undefined : await leseGeneration(layout, currentNummer).catch(() => undefined)
  const vergleich = vergleiche(aktuelle, generation)
  const quittung = quittungFuer(aktuelle, generation, vergleich, request)

  // --- Kein Takt darf einen laufenden Zug töten --------------------------
  //
  // Der Satz steht wörtlich in `harness-generationen.md` §2.1. Nur der Takt, der
  // einen Zug überhaupt berührt (`boot`), wartet auf dessen Ende — die anderen
  // beiden merkt der Zug nicht. Und **„unbekannt" ist nicht „ruhig"**: ohne
  // Auskunft wird nicht gesperrt, aber es wird gesagt (siehe Quittung).
  if (vergleich.benoetigt === 'boot' && request.zug?.laeuftEinZug === true
    && request.freigabe !== true && request.erzwinge !== true) {
    const offen = request.zug.offeneWerkzeuge
    return {
      ok: false,
      generation,
      vergleich,
      quelle,
      quittung,
      befunde: [unitError(
        'generation_zug_laeuft',
        `Es läuft ein Zug${offen === undefined ? '' : ` (${String(offen)} Werkzeug(e) offen)`}; ein Wechsel mit Takt "boot" würde ihn abreißen. Warte auf das Zugende oder gib ausdrücklich frei.`,
        undefined,
        { generation: nummer, ...(offen === undefined ? {} : { offeneWerkzeuge: offen }) },
      )],
    }
  }

  // --- Das Tor: kein Wechsel ohne grünen Prüfbau -------------------------
  //
  // Das ist der Satz aus `harness-generationen.md` §4.1, in Code gegossen:
  // *„bauen und prüfen frei, umschalten nur mit Freigabe."* Ohne dieses Tor ist
  // der Rückweg blind — eine ungeprüfte Generation ist von einer geprüften nicht
  // zu unterscheiden, und `rollback` rollt auf etwas zurück, von dem niemand
  // weiß, ob es trug.
  // **`!== false` und nicht `=== true`.** Generationen, die vor der Einführung
  // des Feldes gebaut wurden, tragen `requireCheck` gar nicht. Ein Wahrheitswert,
  // der fehlt, ist hier **kein Nein** — sonst hätte jedes alte Vorbild das Tor
  // stillschweigend umgangen, und genau die Generation, über die niemand etwas
  // weiß, wäre die einzige, die ohne Prüfung scharf würde.
  if (generation.requireCheck !== false && request.freigabe !== true && request.erzwinge !== true) {
    if (generation.pruefung === undefined) {
      return {
        ok: false,
        generation,
        vergleich,
        quelle,
        quittung,
        befunde: [unitError(
          'generation_check_missing',
          `Generation ${String(nummer)} wurde nie geprüft. "pmh-gen pruefe ${String(nummer)}" holt das nach — oder --freigabe nimmt das Risiko ausdrücklich auf sich.`,
          undefined,
          { generation: nummer },
        )],
      }
    }
    if (!generation.pruefung.ok) {
      return {
        ok: false,
        generation,
        vergleich,
        quelle,
        quittung,
        befunde: [unitError(
          'generation_check_failed',
          `Der Prüfbau von Generation ${String(nummer)} ist rot: ${generation.pruefung.grund}`,
          undefined,
          { generation: nummer },
        )],
      }
    }
  }

  // --- Einbahnstraßen verlangen ausdrückliche Freigabe -------------------
  if (vergleich.irreversible && request.freigabe !== true && request.erzwinge !== true) {
    return {
      ok: false,
      generation,
      vergleich,
      quelle,
      befunde: [unitError(
        'generation_approval_required',
        `Der Wechsel auf Generation ${String(nummer)} ist eine Einbahnstraße (Schema-Wechsel oder "irreversible"-Unit). Er verlangt ausdrückliche Freigabe.`,
        undefined,
        { generation: nummer },
      )],
    }
  }

  const zeiger: 'current' | 'next' | 'beide' = request.art === 'boot' ? 'next' : request.art === 'test' ? 'current' : 'beide'
  if (zeiger === 'current' || zeiger === 'beide') await schreibeZeiger(layout, 'current', nummer)
  if (zeiger === 'next' || zeiger === 'beide') await schreibeZeiger(layout, 'next', nummer)

  await journalAnhaengen(layout, {
    at: request.jetzt ?? new Date().toISOString(),
    event: request.art === 'boot' ? 'boot' : request.art === 'test' ? 'test' : 'switch',
    generation: nummer,
    fingerprint: generation.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: `${String(vergleich.aenderungen.length)} Änderung(en), Takt ${vergleich.benoetigt}, Nummer aus "${quelle}" · ${quittung.hinweis}`,
  })

  return { ok: true, befunde: [], generation, vergleich, zeiger, quelle, quittung }
}

/** Das Ergebnis eines Prüfbaus an einer bestehenden Generation. */
export interface PruefGenerationErgebnis {
  readonly ok: boolean
  readonly befunde: readonly UnitError[]
  readonly generation?: GenerationRecord
  readonly pruefung?: Pruefbau
}

/**
 * Führt den Prüfbau für eine **bestehende** Generation aus und legt das Ergebnis ab.
 *
 * **Warum die Prüfliste aus der Generation kommt und nicht aus der Deklaration.**
 * Eine Generation von gestern gegen die Zusagen von heute zu prüfen wäre ein
 * Befund über eine andere Sache. Die Liste steht deshalb im Datensatz
 * (`generation.checks`).
 */
export async function pruefeGeneration(
  request: BasisAnfrage & { readonly nummer?: number; readonly ausfuehren?: Schrittauffuehrung },
): Promise<PruefGenerationErgebnis> {
  const layout = layoutVon(request)

  // Dieselbe Reihenfolge wie beim Umschalten und beim Export: erst was läuft,
  // dann was vorbereitet ist, zuletzt das zuletzt Gebaute. Ohne den Rückfall
  // ließe sich die Generation, die man gerade gebaut hat, nicht prüfen — und
  // genau das ist der nächste Griff nach einem Bau.
  let nummer = request.nummer
  if (nummer === undefined) {
    nummer = (await leseZeiger(layout, 'current'))
      ?? (await leseZeiger(layout, 'next'))
      ?? (await listGenerationen(layout).then((alle) => (alle.length === 0 ? undefined : alle[alle.length - 1])))
  }
  if (nummer === undefined) {
    return {
      ok: false,
      befunde: [unitError('generation_nothing_to_do', 'Es gibt keine Generation zu prüfen: weder "current" noch "next" ist gesetzt, und gebaut wurde auch nichts.')],
    }
  }
  let generation: GenerationRecord
  try {
    generation = await leseGeneration(layout, nummer)
  }
  catch (error) {
    return { ok: false, befunde: [(error as { error?: UnitError }).error ?? unitError('generation_missing', String(error))] }
  }

  const pruefung = await fuehrePruefbauAus(generation.checks, layout.projectRoot, {
    ...(request.ausfuehren === undefined ? {} : { ausfuehren: request.ausfuehren }),
    ...(request.jetzt === undefined ? {} : { jetzt: () => request.jetzt as string }),
  })
  const geprueft = await schreibePruefung(layout, nummer, pruefung)
  await journalAnhaengen(layout, {
    at: request.jetzt ?? new Date().toISOString(),
    event: 'build',
    generation: nummer,
    fingerprint: geprueft.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: pruefung.ok ? 'Prüfbau grün' : `Prüfbau ROT — ${pruefung.grund}`,
  })

  return { ok: pruefung.ok, befunde: [], generation: geprueft, pruefung }
}

/** Das Ergebnis eines Rückwegs. */
export interface RueckwegErgebnis {
  readonly ok: boolean
  readonly befunde: readonly UnitError[]
  readonly von?: GenerationRecord
  readonly nach?: GenerationRecord
}

/**
 * Rollt auf die vorige vorhandene Generation zurück.
 *
 * **Was ein Rückweg nicht ist.** Er stellt keine Daten wieder her. Eine
 * geschehene Schema-Migration bleibt geschehen; wer zurück will, braucht eine
 * Generation, die mit dem **neuen** Schema läuft. Genau deshalb steht in der
 * Auskunft, ob die betroffene Generation eine Einbahnstraße war.
 */
export async function rolleZurueck(request: BasisAnfrage): Promise<RueckwegErgebnis> {
  const layout = layoutVon(request)
  const currentNummer = await leseZeiger(layout, 'current')
  if (currentNummer === undefined) {
    return { ok: false, befunde: [unitError('generation_pointer_missing', '"current" ist nicht gesetzt; es gibt nichts, wovon zurückgegangen werden könnte.')] }
  }
  const alle = await listGenerationen(layout)
  const vorherige = [...alle].filter((nummer) => nummer < currentNummer).pop()
  if (vorherige === undefined) {
    return {
      ok: false,
      befunde: [unitError('generation_nothing_to_do', `Vor Generation ${String(currentNummer)} liegt keine aufbewahrte Generation.`)],
    }
  }
  const von = await leseGeneration(layout, currentNummer).catch(() => undefined)
  const nach = await leseGeneration(layout, vorherige)
  await schreibeZeiger(layout, 'current', vorherige)
  await journalAnhaengen(layout, {
    at: request.jetzt ?? new Date().toISOString(),
    event: 'rollback',
    generation: vorherige,
    fingerprint: nach.fingerprint,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    detail: `zurück von ${String(currentNummer)}`,
  })
  return { ok: true, befunde: [], ...(von === undefined ? {} : { von }), nach }
}

/** Ein Eintrag der Generationsliste. */
export interface ListenEintrag {
  readonly number: number
  readonly createdAt: string
  readonly fingerprint: string
  readonly takt: UnitReload
  readonly irreversible: boolean
  readonly schema: number | null
  readonly units: number
  readonly aktiv: boolean
  readonly vorgemerkt: boolean
  /**
   * Der Stand des Prüfbaus: `gruen`, `rot` oder `nie`.
   *
   * **„nie" ist ein eigener Wert und nicht `rot`.** „Niemand hat hingesehen" ist
   * etwas anderes als „hingesehen und durchgefallen" — und genau diese
   * Unterscheidung ist der Grund, warum das Tor existiert.
   */
  readonly pruefung: 'gruen' | 'rot' | 'nie'
  /** Ob ein Wechsel diese Generation ohne Freigabe zuläßt. */
  readonly wechselbar: boolean
}

/** Listet alle Generationen. */
export async function liste(request: BasisAnfrage): Promise<readonly ListenEintrag[]> {
  const layout = layoutVon(request)
  const nummern = await listGenerationen(layout)
  const current = await leseZeiger(layout, 'current')
  const next = await leseZeiger(layout, 'next')
  const eintraege: ListenEintrag[] = []
  for (const nummer of nummern) {
    const generation = await leseGeneration(layout, nummer)
    eintraege.push({
      number: generation.number,
      createdAt: generation.createdAt,
      fingerprint: generation.fingerprint,
      takt: generation.takt,
      irreversible: generation.irreversible,
      schema: generation.schema,
      units: generation.units.length,
      aktiv: current === generation.number,
      vorgemerkt: next === generation.number,
      pruefung: generation.pruefung === undefined ? 'nie' : generation.pruefung.ok ? 'gruen' : 'rot',
      wechselbar: generation.requireCheck === false || generation.pruefung?.ok === true,
    })
  }
  return eintraege
}

/** Die Auskunft „wo stehen wir". */
export interface ZustandsBericht {
  readonly current?: ListenEintrag
  readonly next?: ListenEintrag
  readonly currentGeneration?: GenerationRecord
  readonly nextGeneration?: GenerationRecord
  /** Der Unterschied zwischen dem, was läuft, und dem, was vorbereitet ist. */
  readonly ausstehend?: GenerationsVergleich
  /** Der Unterschied zwischen Deklaration und laufender Generation. */
  readonly drift?: GenerationsVergleich
  /** `true`, wenn die Deklaration nicht mehr zur laufenden Generation paßt. */
  readonly hatDrift: boolean
  readonly befunde: readonly UnitError[]
}

/**
 * Beantwortet, was läuft, was vorbereitet ist — und ob die Wirklichkeit noch
 * zur Deklaration paßt.
 *
 * “Drift" heißt hier **nicht**, daß jemand etwas falsch gemacht hat. Sie heißt,
 * daß jemand die Deklaration geändert und **noch nicht gebaut** hat — oder daß
 * die laufende Generation aus einer anderen Deklaration stammt. Gemeldet, nicht
 * geglättet: entschieden wird von einem Menschen.
 */
export async function zustand(request: BasisAnfrage & { readonly declarationPath?: string }): Promise<ZustandsBericht> {
  const layout = layoutVon(request)
  const befunde: UnitError[] = []
  const eintraege = await liste(request)
  const currentEintrag = eintraege.find((eintrag) => eintrag.aktiv)
  const nextEintrag = eintraege.find((eintrag) => eintrag.vorgemerkt)
  const currentGeneration = currentEintrag === undefined ? undefined : await leseGeneration(layout, currentEintrag.number).catch(() => undefined)
  const nextGeneration = nextEintrag === undefined ? undefined : await leseGeneration(layout, nextEintrag.number).catch(() => undefined)
  const ausstehend = nextGeneration === undefined ? undefined : vergleiche(currentGeneration, nextGeneration)

  let drift: GenerationsVergleich | undefined
  let hatDrift = false
  const bericht = await pruefe({ ...request })
  if (bericht.ok && bericht.closure !== undefined && bericht.declaration !== undefined) {
    const inhalt = inhaltAus(bericht.declaration, bericht.closure)
    const abdruck = fingerabdruck(inhalt)
    hatDrift = currentGeneration !== undefined && currentGeneration.fingerprint !== abdruck
    if (hatDrift) {
      // Der Drift wird als Vergleich „was läuft" gegen „was die Deklaration sagt"
      // gezeigt — nicht als Zahl. Eine Zahl sagt niemandem, was zu tun ist.
      const gewuenscht: GenerationRecord = {
        format: 1,
        number: -1,
        createdAt: request.jetzt ?? new Date().toISOString(),
        fingerprint: abdruck,
        ...inhalt,
      }
      drift = vergleiche(currentGeneration, gewuenscht)
    }
  }
  else {
    befunde.push(...bericht.befunde)
  }

  return {
    ...(currentEintrag === undefined ? {} : { current: currentEintrag }),
    ...(nextEintrag === undefined ? {} : { next: nextEintrag }),
    ...(currentGeneration === undefined ? {} : { currentGeneration }),
    ...(nextGeneration === undefined ? {} : { nextGeneration }),
    ...(ausstehend === undefined ? {} : { ausstehend }),
    ...(drift === undefined ? {} : { drift }),
    hatDrift,
    befunde,
  }
}

/** Räumt alte Generationen weg und protokolliert, was verschwindet. */
export async function raeume(
  request: BasisAnfrage & { readonly behalten: number },
): Promise<{ readonly behalten: readonly number[]; readonly entfernt: readonly number[] }> {
  const layout = layoutVon(request)
  const ergebnis = await raeumeAuf(layout, request.behalten)
  if (ergebnis.entfernt.length > 0) {
    await journalAnhaengen(layout, {
      at: request.jetzt ?? new Date().toISOString(),
      event: 'prune',
      ...(request.actor === undefined ? {} : { actor: request.actor }),
      detail: `entfernt: ${ergebnis.entfernt.join(', ')}`,
    })
  }
  return ergebnis
}

/** Vergleicht zwei Generationen (Nummer oder `undefined` für Generation 0). */
export async function vergleicheGenerationen(
  request: BasisAnfrage & { readonly von?: number; readonly nach?: number },
): Promise<GenerationsVergleich> {
  const layout = layoutVon(request)
  const von = request.von === undefined ? undefined : await leseGeneration(layout, request.von)
  const nach = request.nach === undefined ? undefined : await leseGeneration(layout, request.nach)
  return vergleiche(von, nach)
}

/** Prüft einen einzelnen Unit gegen den Bestand — für eine Oberfläche, die fragt. */
export async function unitImBestand(
  request: BasisAnfrage & { readonly declarationPath?: string; readonly unit: string },
): Promise<{ readonly gefunden: boolean; readonly name?: string; readonly version?: string }> {
  const pfad = request.declarationPath ?? declarationPath(request.projectRoot)
  const gelesen = await readDeclaration(pfad)
  if (!gelesen.ok) return { gefunden: false }
  const registry = await scanRegistry({
    roots: gelesen.value.roots.map((wurzel) => ({ path: resolve(request.projectRoot, wurzel), label: wurzel })),
    host: hostAus(gelesen.value),
  })
  const eintrag = findUnit(registry, request.unit)
  return eintrag === undefined
    ? { gefunden: false }
    : { gefunden: true, name: eintrag.manifest.name, version: eintrag.manifest.version }
}

/** Nur für Aufrufer, die den Abschluß ohne Bau sehen wollen. */
export async function abschluss(
  request: BasisAnfrage & { readonly declarationPath?: string },
): Promise<ClosureResult> {
  const pfad = request.declarationPath ?? declarationPath(request.projectRoot)
  const gelesen = await readDeclaration(pfad)
  if (!gelesen.ok) {
    const registry = await scanRegistry({ roots: [] })
    return { ok: false, errors: gelesen.errors, warnings: gelesen.warnings, registry }
  }
  return loeseAbschluss({
    projectRoot: request.projectRoot,
    declaration: gelesen.value,
    host: hostAus(gelesen.value),
  })
}
