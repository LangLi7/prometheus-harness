/**
 * `@prometheus-harness/world-knowledge` — der Wissensspeicher als Agent-Werkzeug.
 *
 * ## Die Lücke, die es schließt
 *
 * `obsidian_search` durchsucht **Titel und Pfad** einer Notiz. Wer fragt „wo steht
 * das mit dem Retry-Backoff?" und das Wort steht nicht im Titel, findet nichts,
 * obwohl die Notiz existiert. Der Vektorweg (`chunks`, pgvector, HNSW) war gebaut,
 * aber ohne Aufrufer — dieser hier ist der Aufrufer.
 *
 * ## Warum der Treffer seinen Text mitbringt
 *
 * `suche` vergleicht Vektoren und liefert Kennungen. Für den Agenten ist das
 * wertlos: er kann das Stück nicht zitieren und nicht nachlesen. Deshalb geht der
 * Weg über **zwei** Schritte — suchen, dann die Stücke lesen und entschlüsseln.
 * Das ist keine Umständlichkeit, sondern die Zuständigkeit: der Speicher sieht
 * keinen Klartext, der Hauptschlüssel liegt beim Aufrufer.
 *
 * ## Was hereingereicht wird und was nicht
 *
 * Wie beim Einleser (`world-obsidian/src/einleser.ts`) kommen **Mandant, Modell,
 * Einbetter und Hauptschlüssel von außen**. Das Werkzeug errät keinen Mandanten —
 * ein Vorgabewert wäre der Weg zum Leck (Hausregel: der Mandant steht im Filter,
 * nicht in der Sortierung).
 *
 * @module @prometheus-harness/world-knowledge
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import postgres from 'postgres'
import {
  entpacke,
  entpackeUmschlag,
  holeHauptschluessel,
  standardQuellen,
  type Hauptschluessel,
} from '@prometheus-harness/secrets'
import { resolveEigenesHome } from '@prometheus-harness/home-paths'
import {
  erzeugeWissensspeicher,
  type SqlZugang,
  type Wissensspeicher,
} from '@prometheus-harness/store-postgres'
import { kostet, waehleEinbetter, type Einbetter } from './einbetter.ts'

/** Stabiler Cordis-Plugin-Name. */
export const name = 'pmh-world-knowledge'

/** Ohne Werkzeug-Registry gibt es nichts zu registrieren. */
export const inject = ['tools'] as const

/** Der Name, unter dem der Agent das Werkzeug sieht. */
export const WERKZEUG = 'knowledge_search'

/** Wie viele Stücke ohne Angabe zurückkommen. */
export const GRENZE_VORGABE = 5

/** Mehr als das liefert ein Aufruf nicht — sonst ist der Kontext voll, bevor er nützt. */
export const GRENZE_HOECHSTENS = 20

/** Ein Treffer, wie der Agent ihn sieht. */
export interface Fundstelle {
  /** Der Titel des Dokuments — die Auskunft, die man zitieren kann. */
  readonly titel: string
  /** Woher das Dokument stammt (Vault-Pfad), sofern vermerkt. */
  readonly herkunft: string | null
  /** Der entschlüsselte Text des Stücks. */
  readonly text: string
  /** Position im Dokument. */
  readonly ordnung: number
  /** Kosinus-Ähnlichkeit: 1 = gleich, 0 = orthogonal. */
  readonly aehnlichkeit: number
}

/**
 * Die Suche, die das Werkzeug benutzt.
 *
 * **Mandant, Modell und Schlüssel sind beim Bau gebunden** — die Signatur kennt
 * nur Text und Grenze. So kann kein Aufruf einen fremden Mandanten einschmuggeln.
 */
export type Suche = (text: string, grenze: number) => Promise<readonly Fundstelle[]>

/** Was das Werkzeug über sich sagen kann. */
export interface Wissen {
  readonly suche: Suche
  /** Die Modellkennung der Vektoren — gehört in die Antwort, sonst ist sie nicht deutbar. */
  readonly modell: string
}

/** Ein Fehler, den der Agent sehen soll — kein Absturz, eine Auskunft. */
export class WissensFehler extends Error {
  override readonly name = 'WissensFehler'
}

/**
 * Baut die Werkzeugdefinition.
 *
 * @param wissen - Suche und Modell
 * @returns die Definition für `ctx.tools.register`
 */
export function baueWerkzeug(wissen: Wissen): ToolDefinition {
  const parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Die Frage in eigenen Worten. Unscharf ist hier richtig — gesucht wird nach Bedeutung, ' +
          'nicht nach einem Bezeichner. Für „wo wird X benutzt?" ist der Graph das bessere Werkzeug.',
      },
      limit: {
        type: 'number',
        description: `Höchstens ${String(GRENZE_HOECHSTENS)} Treffer (Vorgabe ${String(GRENZE_VORGABE)}).`,
      },
    },
    required: ['query'],
  }

  return {
    name: WERKZEUG,
    description:
      'Durchsucht den Wissensspeicher nach Bedeutung: Vault-Notizen und Dokumente, die ' +
      'sinngemäß passen, auch wenn der Suchbegriff nicht wörtlich vorkommt. Liefert Titel, ' +
      'Herkunft und Textstelle. Für exakte Strukturfragen („wo wird X benutzt?") ist der ' +
      'Code-Graph zuständig, für Entscheidungen der Vault.',
    parameters: parameters as ToolDefinition['parameters'],
    output: {
      schema: { type: 'object' } as ToolDefinition['output']['schema'],
      render: (_args, wert) => [
        { type: 'text', text: typeof wert === 'string' ? wert : JSON.stringify(wert) },
      ] as ToolDefinition['output'] extends { render: (...args: never[]) => infer R } ? R : never,
    },
    execute: async (argumente) => {
      const roh = (typeof argumente === 'object' && argumente !== null
        ? argumente
        : {}) as Readonly<Record<string, unknown>>
      const text = typeof roh['query'] === 'string' ? roh['query'] : ''
      const gewuenscht = Number(roh['limit'] ?? GRENZE_VORGABE)
      const grenze = Number.isFinite(gewuenscht)
        ? Math.min(GRENZE_HOECHSTENS, Math.max(1, Math.trunc(gewuenscht)))
        : GRENZE_VORGABE

      // **Leer heißt leer — und das wird gesagt.** Eine leere Anfrage einzubetten
      // liefert einen Vektor ohne Bedeutung und damit Treffer ohne Wert.
      if (text.trim().length === 0) {
        return { ok: false, error: 'die Anfrage ist leer', modell: wissen.modell }
      }
      try {
        const treffer = await wissen.suche(text, grenze)
        return {
          ok: true,
          modell: wissen.modell,
          anfrage: text,
          anzahl: treffer.length,
          // **Kein Treffer ist eine Auskunft, kein Fehler.** Der Agent soll wissen,
          // daß gesucht wurde und nichts paßte — sonst sucht er dasselbe nochmal.
          treffer,
        }
      } catch (fehler) {
        return {
          ok: false,
          modell: wissen.modell,
          error: fehler instanceof Error ? fehler.message : String(fehler),
        }
      }
    },
  }
}

/** Was `baueSuche` zum Arbeiten braucht. */
export interface SucheOptionen {
  readonly speicher: Wissensspeicher
  /** Der Mandant — beim Bau gebunden, nicht beim Aufruf. */
  readonly benutzerId: string
  readonly modell: string
  /** Aus Texten werden Vektoren, einer je Text, in derselben Reihenfolge. */
  readonly einbetten: (texte: readonly string[]) => Promise<readonly (readonly number[])[]>
  /** Der Hauptschlüssel für die Umschläge der Stücke. */
  readonly haupt: Hauptschluessel
  /** Das Alphabet der Stücke. Vorgabe: UTF-8, wie beim Einlesen. */
  readonly dekodieren?: (bytes: Uint8Array) => string
}

/**
 * Baut die Suche: Anfrage → Vektor → Treffer → entschlüsselter Text.
 *
 * @param optionen - Speicher, Mandant, Modell, Einbetter, Schlüssel
 * @returns die gebundene Suche
 */
export function baueSuche(optionen: SucheOptionen): Suche {
  const dekodieren = optionen.dekodieren ?? ((bytes) => new TextDecoder().decode(bytes))

  return async (text, grenze) => {
    const anfrage = text.trim()
    if (anfrage.length === 0) throw new WissensFehler('eine leere Anfrage kann nichts finden')

    const vektoren = await optionen.einbetten([anfrage])
    const vektor = vektoren[0]
    if (vektor === undefined || vektor.length === 0) {
      throw new WissensFehler('der Einbetter hat keinen Vektor geliefert')
    }

    const treffer = await optionen.speicher.suche(optionen.benutzerId, { vektor, grenze })
    if (treffer.length === 0) return []

    const stuecke = await optionen.speicher.liesStuecke(
      optionen.benutzerId,
      treffer.map((t) => t.stueckId),
    )
    const nachId = new Map(stuecke.map((s) => [s.stueckId, s]))

    // **In der Reihenfolge der Treffer, nicht der Datenbank.** Die Ähnlichkeit hat
    // sortiert; wer sie umsortiert, macht die Suche wertlos.
    return treffer.flatMap((t) => {
      const stueck = nachId.get(t.stueckId)
      if (stueck === undefined) return []
      // **Ein unlesbares Stück fällt raus, es wirft nicht.** Ein einzelner
      // beschädigter Umschlag darf die ganze Suche nicht kosten.
      let inhalt: string
      try {
        inhalt = dekodieren(entpacke(entpackeUmschlag(stueck.inhaltVerschluesselt), optionen.haupt))
      } catch {
        return []
      }
      return [
        {
          titel: t.titel,
          herkunft: t.herkunft,
          text: inhalt,
          ordnung: t.ordnung,
          aehnlichkeit: t.aehnlichkeit,
        },
      ]
    })
  }
}

/**
 * Was der Betrieb noch nicht hat — und deshalb **nicht** stillschweigend fehlt.
 *
 * **Warum diese Funktion eine Auskunft gibt und nicht wirft.** Ein Host, der wegen
 * einer fehlenden Angabe nicht startet, macht die Fehlersuche schwerer als nötig
 * (dieselbe Entscheidung wie in `auth-http`). Er sagt es auf stderr und läuft.
 *
 * @param env - die Umgebung
 * @returns der Grund, oder `undefined`, wenn die Umgebung reicht
 */
export function fehlendeVoraussetzungen(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if ((env['DATABASE_URL'] ?? '').length === 0) {
    return 'DATABASE_URL fehlt — ohne Datenbank gibt es keinen Wissensspeicher.'
  }
  return undefined
}

/** Was `apply` von außen bekommt. */
export interface ApplyOptionen {
  /**
   * Der Benutzer der **aktuellen Sitzung** — hereingereicht, nicht geraten.
   *
   * **Warum eine Funktion und kein Wert.** Das Plugin wird einmal geladen, die
   * Sitzung wechselt. Ein beim Laden gelesener Benutzer wäre für jede spätere
   * Sitzung der falsche. Die Funktion wird beim **Aufruf** gefragt.
   */
  readonly benutzer?: () => string | undefined
  /** Ein fertiger Speicher (für Prüfungen). */
  readonly speicher?: Wissensspeicher
  /** Ein fertiger Einbetter (für Prüfungen). */
  readonly besser?: Einbetter
}

/**
 * Hängt das Werkzeug ein — **nur wenn alle Voraussetzungen da sind**, und sonst mit Grund.
 *
 * ## Die Kostenfrage
 *
 * Der lokale Einbetter kostet nichts und läuft ohne Rückfrage. Ein bezahlter Weg
 * braucht **zwei** Dinge: einen Schlüssel **und** `PMH_EINBETTER_FREIGABE=1`.
 * Fehlt die Freigabe, wird nicht eingehängt — lieber kein Werkzeug als eine
 * Rechnung, die niemand wollte.
 *
 * @param ctx - der Plugin-Kontext mit Werkzeug-Registry
 * @param optionen - Sitzungsbenutzer, fertiger Speicher, fertiger Einbetter
 */
export function apply(ctx: Context, optionen: ApplyOptionen = {}): void {
  const env = process.env
  const grund = fehlendeVoraussetzungen(env)
  if (grund !== undefined) {
    process.stderr.write(`[pmh] ${WERKZEUG} NICHT eingehängt: ${grund}\n`)
    return
  }

  const benutzer = optionen.benutzer ?? (() => env['PMH_WISSEN_BENUTZER'])
  if ((benutzer() ?? '').length === 0) {
    process.stderr.write(
      `[pmh] ${WERKZEUG} NICHT eingehängt: der Sitzungsbenutzer ist unbekannt. ` +
        'Der Host muß `benutzer` hereinreichen — geraten wird er nicht.\n',
    )
    return
  }

  let besser: Einbetter
  try {
    besser = optionen.besser ?? waehleEinbetter(env)
  } catch (fehler) {
    process.stderr.write(
      `[pmh] ${WERKZEUG} NICHT eingehängt: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`,
    )
    return
  }

  // **Die Kostenfreigabe.** Ein bezahlter Einbetter ohne ausdrückliches Ja wird nicht
  // benutzt — auch wenn der Schlüssel da ist. Der lokale Weg fragt nicht.
  if (kostet(besser) && (env['PMH_EINBETTER_FREIGABE'] ?? '') !== '1') {
    process.stderr.write(
      `[pmh] ${WERKZEUG} NICHT eingehängt: der Einbetter „${besser.art}" kostet ` +
        `${String(besser.kostenProMio)} USD/Mio. Freigabe fehlt (PMH_EINBETTER_FREIGABE=1).\n`,
    )
    return
  }

  ctx.effect(() => {
    // Der Speicher wird beim Einhängen gebaut, der Benutzer beim **Aufruf** gefragt.
    // So bleibt eine Sitzung nicht am Benutzer der ersten hängen.
    const speicher = optionen.speicher ?? baueSpeicherAusUmgebung(env)
    if (speicher === undefined) {
      process.stderr.write(
        `[pmh] ${WERKZEUG} NICHT eingehängt: der Datenbankzugang ließ sich nicht bauen.\n`,
      )
      return () => undefined
    }
    const suche: Suche = async (text, grenze) => {
      const userId = benutzer()
      if (userId === undefined || userId.length === 0) {
        throw new WissensFehler('die Sitzung führt keinen Benutzer — es wird nicht gesucht')
      }
      return baueSuche({
        speicher,
        benutzerId: userId,
        modell: besser.modell,
        einbetten: (texte) => besser.einbetten(texte),
        haupt: ladeHauptschluessel(),
      })(text, grenze)
    }
    const abmeldung = ctx.tools.register(baueWerkzeug({ suche, modell: besser.modell }))
    return () => {
      abmeldung()
    }
  }, `${name} ${WERKZEUG}`)
}

/**
 * Baut den Speicher aus `DATABASE_URL` — oder gibt `undefined` zurück.
 *
 * **Warum `undefined` und nicht ein Wurf.** Ein fehlender Zugang ist eine Auskunft
 * über den Betrieb, kein Programmierfehler.
 *
 * @param env - die Umgebung
 * @returns der Speicher, oder `undefined`
 */
function baueSpeicherAusUmgebung(
  env: Readonly<Record<string, string | undefined>>,
): Wissensspeicher | undefined {
  const adresse = env['DATABASE_URL']
  if (adresse === undefined || adresse.length === 0) return undefined
  try {
    const zugang = postgres(adresse, { max: 2, connect_timeout: 5, onnotice: () => undefined })
    return erzeugeWissensspeicher(zugang as unknown as SqlZugang)
  } catch {
    return undefined
  }
}

/**
 * Lädt den Hauptschlüssel aus den Standardquellen.
 *
 * **Mit `resolveEigenesHome`, nicht `resolvePmhHome`.** Der Schlüssel ist unsere
 * Ablage; ein Rückfall auf `~/.dsh` wäre der fremde Harness (siehe
 * [`dsh-abhaengigkeit.md`](../../../../docs/status/dsh-abhaengigkeit.md)).
 *
 * @returns der Schlüssel für die Umschläge der Stücke
 */
function ladeHauptschluessel(): Hauptschluessel {
  const version = Number(process.env['PMH_MASTER_KEY_VERSION'] ?? '1')
  return holeHauptschluessel(
    standardQuellen(process.env, resolveEigenesHome()),
    Number.isFinite(version) ? version : 1,
  )
}

export default apply
