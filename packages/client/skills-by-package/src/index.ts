/**
 * `@prometheus-harness/client-skills-by-package` — Sammlungen im `/`-Menü **und** als
 * durchsuchbares Popup.
 *
 * ## Der Befund
 *
 * Der Katalog hat 307 Fähigkeiten. Die eingebaute Quelle (`dsh-client-ui-skill`) listet sie
 * flach, und ihr Rangierer `rankByName` liest **nur den Namen**: ein `/emilkowalski` findet
 * nichts, obwohl vier Fähigkeiten aus genau diesem Repository stammen — die Sammlung steht in
 * keinem Feld, das die Palette kennt.
 *
 * ## Zwei Zugänge, ein Katalog
 *
 * 1. **Quelle am `/`** (Weg A und D): antwortet nur bei Sammlungstreffern. Leere Eingabe zeigt
 *    die Sammlungen (je mit `drill`), ein Sammlungsname ihre Fähigkeiten mit `section`-Kopf.
 * 2. **Befehl `/skills`** (Popup wie `/model`): ein Panel mit Suchfeld, gruppiert nach
 *    Sammlung. Die Suche läuft über `substring` und prüft damit **Name und Beschreibung** —
 *    das ist der Fall „ich weiß ungefähr, was ich suche".
 *
 * Ein Pick im Popup schreibt `/<name>` in den Entwurf und gibt den Fokus zurück. Das Einfügen
 * läuft über `SessionInput.setDraft` am Sitzungs-Kontext (`SessionBinding.ctx`) — nicht über
 * einen `TokenSpan`, den `onSelect` nicht kennt. Absenden bleibt beim Menschen: eine Fähigkeit
 * braucht meist noch eine Aufgabe („/animate baue mir …").
 *
 * ## Woher die Zuordnung kommt
 *
 * Nicht aus einem Pfad. `units/skills/link-skills.ps1` schreibt beim Verknüpfen
 * `units/skills/index.json` mit Name, Sammlung und Aliassen je Fähigkeit; `build.mjs` gießt
 * daraus `src/register.ts`. Ein neuer Sammlungslauf ändert das Register, ein neuer Bau das
 * Bündel — dazwischen liegt keine Heuristik.
 *
 * @module @prometheus-harness/client-skills-by-package
 */

import { COLLECTIONS, TOTAL, type CollectionIndex } from './register.ts'

/** Der Name, unter dem der Kern dieses Plugin führt. */
export const name = 'skills-by-package'

/**
 * Die Dienste, ohne die weder Quelle noch Popup arbeiten können: der Katalog, die Sitzungen,
 * die Anmeldung am `/` und der Weg in den Entwurf.
 */
export const inject = ['inputTriggers', 'commandUi', 'conversation', 'sessions', 'remote.skills'] as const

/** Eine Zeile, wie die Trigger-Pipeline sie erwartet. */
interface Candidate {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly section?: string
  readonly icon?: 'file' | 'folder' | 'session'
  readonly drill?: boolean
}

/** Eine Zeile, wie das Popup sie erwartet. */
interface SelectOption {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly group?: { readonly name: string; readonly label: string }
}

/** Was der Katalog je Fähigkeit liefert — nur die Felder, die hier zählen. */
interface CatalogSkill {
  readonly name: string
  readonly description?: string
  readonly modelInvocable?: boolean
}

/** Der Sitzungs-Kontext, den `SessionBinding.ctx` trägt — nur der Weg zum Eingabefeld. */
interface SessionInputFace {
  readonly state: { getSnapshot: () => { draft: string } }
  setDraft: (text: string) => void
  focus: () => void
}

/** Was dieses Plugin vom Client erwartet. Bewusst schmal: es gibt keinen Typimport. */
interface ClientContext {
  effect: (run: () => unknown, label: string) => void
  inputTriggers: { registerSource: (source: Record<string, unknown>) => () => void }
  commandUi: {
    register: (contribution: Record<string, unknown>) => () => void
  }
  conversation: { input: { for: (actx: unknown) => SessionInputFace } }
  sessions: {
    binding: (sessionId: string) => { ctx: unknown } | undefined
    using: (
      sessionId: string,
      options: { source: string; signal: AbortSignal },
      run: (reference: {
        binding: { session: { getSnapshot: () => { openState: string; openError?: unknown } } }
      }) => Promise<CatalogSkill[]>,
    ) => Promise<CatalogSkill[]>
  }
  remote: {
    skills: {
      list: (
        input: { sessionId: string },
        signal: AbortSignal,
      ) => Promise<{ ok: boolean; value?: { skills: CatalogSkill[] }; error?: { code: string; message: string } }>
    }
  }
}

/**
 * Normalisiert eine Sammlung oder ein Suchwort auf eine vergleichbare Form.
 *
 * @param text - Rohform
 * @returns klein, mit Bindestrichen statt Trenner
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s_./]+/g, '-')
}

/**
 * Trifft die Eingabe diese Sammlung?
 *
 * @param collection - Sammlung mit Aliassen
 * @param query - bereits normalisierte Eingabe
 * @returns ob Name oder ein Alias passt
 */
function matchesCollection(collection: CollectionIndex, query: string): boolean {
  const needles = [collection.name, ...collection.aliases].map(normalize)
  return needles.some((needle) => needle.startsWith(query) || needle.includes(query))
}

/**
 * Ersetzt das führende Befehlswort im Entwurf durch den gewählten Skill.
 *
 * Der Entwurf ist beim Popup genau die Befehlszeile (`/skills`) — alles danach bleibt stehen,
 * denn wer schon getippt hat, soll es nicht verlieren.
 *
 * @param draft - aktueller Entwurf
 * @param token - einzusetzendes Wort, mit Schrägstrich
 * @returns der neue Entwurf
 */
function replaceLeadingToken(draft: string, token: string): string {
  const match = /^\s*\/[^\s]*/.exec(draft)
  if (match === null) return token
  return token + draft.slice(match[0].length)
}

/**
 * Meldet Quelle und Popup an.
 *
 * @param ctx - Wurzelkontext des Client-Plugins
 */
export function apply(ctx: ClientContext): void {
  const skills = ctx.remote.skills
  const sessions = ctx.sessions

  /** Je Sitzung ein Abruf; ein Fehlschlag fällt aus dem Zwischenspeicher. */
  const cache = new Map<string, { promise: Promise<readonly CatalogSkill[]>; abort: AbortController }>()

  /**
   * Holt den Katalog einer Sitzung — dieselbe Form, die `dsh-client-ui-skill` benutzt:
   * eingehängte Sitzung, offener Verlauf, dann `skills/list`.
   *
   * @param sessionId - Sitzung
   * @returns die Fähigkeiten
   */
  function catalog(sessionId: string): Promise<readonly CatalogSkill[]> {
    const hit = cache.get(sessionId)
    if (hit !== undefined) return hit.promise
    const abort = new AbortController()
    const promise = (async () => {
      if (sessions.binding(sessionId) === undefined) {
        throw new Error(`skill catalog requires a retained session "${sessionId}"`)
      }
      return sessions.using(sessionId, { source: 'skillsByPackage', signal: abort.signal }, async (reference) => {
        abort.signal.throwIfAborted()
        const state = reference.binding.session.getSnapshot()
        if (state.openState !== 'open') throw new Error(`session "${sessionId}" is not open`)
        const result = await skills.list({ sessionId }, abort.signal)
        abort.signal.throwIfAborted()
        if (!result.ok) throw new Error(`skills/list failed: ${result.error?.code}: ${result.error?.message}`)
        return result.value?.skills ?? []
      })
    })()
    const entry = { promise, abort }
    cache.set(sessionId, entry)
    promise.catch(() => {
      if (cache.get(sessionId) === entry) cache.delete(sessionId)
    })
    return promise
  }

  /**
   * Ordnet eine Fähigkeit ihrer Sammlung zu — Register vor Katalog, weil der Katalog keine
   * Sammlung kennt.
   *
   * @param skillName - Name der Fähigkeit
   * @returns die Sammlung oder undefined
   */
  function collectionOf(skillName: string): CollectionIndex | undefined {
    return COLLECTIONS.find((collection) => collection.skills.includes(skillName))
  }

  /** Eine Sammlung als Zeile: Tab klappt sie auf, Enter lässt sie stehen. */
  function collectionRow(collection: CollectionIndex): Candidate {
    const count = collection.skills.length
    return {
      name: collection.name,
      label: collection.name,
      description: `${count} ${count === 1 ? 'Fähigkeit' : 'Fähigkeiten'} · Tab klappt die Sammlung auf`,
      icon: 'folder',
      drill: true,
    }
  }

  // ---------------------------------------------------------------------------------------
  // 1. Die Quelle am `/`
  // ---------------------------------------------------------------------------------------
  ctx.effect(
    () =>
      ctx.inputTriggers.registerSource({
        trigger: '/',
        name,
        // Vor der eingebauten Fähigkeitenliste (deren `order` ist 2): die Sammlungen sind
        // der kürzere Weg, die flache Liste bleibt darunter erreichbar.
        order: 1,
        showGroupTitle: true,
        async candidates(
          session: { sessionId: string },
          request: { query: string; signal: AbortSignal },
        ): Promise<readonly Candidate[]> {
          const query = normalize(request.query.trim())
          const treffer = COLLECTIONS.filter((collection) => matchesCollection(collection, query))

          // Leere Eingabe: nur die Sammlungen. Das ist der Einstieg (Weg D), und er braucht
          // keinen Katalog — die Anzahl steht im Register.
          if (query === '') return COLLECTIONS.map(collectionRow)

          // Kein Treffer: die eingebaute Quelle bleibt allein zuständig.
          if (treffer.length === 0) return []

          let catalogSkills: readonly CatalogSkill[]
          try {
            catalogSkills = await catalog(session.sessionId)
          } catch (error) {
            console.error('[skills-by-package] catalog failed:', error)
            return []
          }
          if (request.signal.aborted) return []

          const vorhanden = new Set(catalogSkills.map((skill) => skill.name))
          return treffer.flatMap((collection) =>
            collection.skills
              .filter((skillName) => vorhanden.has(skillName))
              .map((skillName) => {
                const skill = catalogSkills.find((entry) => entry.name === skillName)
                const description = skill?.description ?? ''
                return {
                  name: skillName,
                  label: skillName,
                  description:
                    skill?.modelInvocable === false ? `nur menschlich · ${description}` : description,
                  section: collection.name,
                }
              }),
          )
        },
      }),
    'skills-by-package: source',
  )

  // ---------------------------------------------------------------------------------------
  // 2. Das Popup `/skills` — Muster von `/model`: Suchfeld, Gruppen, Auswahl
  // ---------------------------------------------------------------------------------------
  ctx.effect(
    () =>
      ctx.commandUi.register({
        name: 'skills',
        label: () => 'Fähigkeiten suchen',
        description: () => `Alle ${TOTAL} Fähigkeiten durchsuchen, nach Sammlung gruppiert`,
        available: () => true,
        ui: {
          kind: 'popupSelect',
          // `substring` prüft Beschriftung **und** Detailtext — die Beschreibungen sind bei
          // „ich weiß ungefähr, was ich suche" die bessere Spur als der Name allein.
          searchMode: 'substring',
          searchLabels: () => ({
            placeholder: 'Fähigkeiten suchen…',
            empty: 'Keine Fähigkeiten installiert',
            noResults: 'Keine Fähigkeit paßt zu dieser Eingabe',
          }),
          async options(session: { sessionId: string }, signal: AbortSignal): Promise<readonly SelectOption[]> {
            let catalogSkills: readonly CatalogSkill[]
            try {
              catalogSkills = await catalog(session.sessionId)
            } catch (error) {
              console.error('[skills-by-package] catalog failed:', error)
              return []
            }
            if (signal.aborted) return []
            const bekannt = new Map(catalogSkills.map((skill) => [skill.name, skill]))
            // In Registerreihenfolge (größte Sammlung zuerst), damit die Köpfe stabil stehen;
            // Fähigkeiten ohne Sammlung schließen als eigener Block ab.
            const rows: SelectOption[] = []
            for (const collection of COLLECTIONS) {
              for (const skillName of collection.skills) {
                const skill = bekannt.get(skillName)
                if (skill === undefined) continue
                rows.push({
                  id: skillName,
                  label: skillName,
                  detail: skill.description ?? '',
                  group: { name: collection.name, label: collection.name },
                })
                bekannt.delete(skillName)
              }
            }
            for (const [skillName, skill] of bekannt) {
              rows.push({
                id: skillName,
                label: skillName,
                detail: skill.description ?? '',
              })
            }
            return rows
          },
          onSelect(option: SelectOption, session: { sessionId: string }): void {
            const binding = sessions.binding(session.sessionId)
            if (binding === undefined) return
            const input = ctx.conversation.input.for(binding.ctx)
            input.setDraft(replaceLeadingToken(input.state.getSnapshot().draft, `/${option.id}`))
            input.focus()
          },
        },
      }),
    'skills-by-package: popup',
  )
}
