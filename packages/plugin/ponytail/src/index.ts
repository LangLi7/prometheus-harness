/**
 * **Ponytail als DSH-Plugin.**
 *
 * Ein Prompt-Abschnitt, ein Skill, ein Schalter. Der Abschnitt wirkt in jeder Antwort (das ist
 * Ponytails Bauart: *„ACTIVE EVERY RESPONSE"*), der Skill wird geladen, wenn jemand ihn aufruft.
 * Beides hängt an **einem** Zustand — `off` meldet beide ab, nicht nur die Anzeige.
 *
 * ## Warum der Zustand eine Datei ist und keine Umgebungsvariable
 *
 * Der Schalter wird im Browser gedrückt, der Abschnitt entsteht im Host. Eine Env-Variable
 * könnte das nur mit einem Neustart. Eine Datei ist lesbar, sicherbar und von Hand änderbar —
 * dieselbe Wahl wie bei `zugaenge.json`.
 *
 * ## Warum `resolveEigenesHome` und nicht `resolvePmhHome`
 *
 * `resolvePmhHome` fällt auf `DSH_HOME` zurück. `~/.dsh` gehört dem anderen Harness und ist als
 * „niemals verändern" gekennzeichnet; `resolveEigenesHome` wirft, statt dorthin zu schreiben.
 *
 * ## Was das Plugin nicht tut
 *
 * Es baut keine zweite Skill-Registry und keinen zweiten Prompt: es meldet einen Abschnitt an
 * `ctx.systemPrompt` und einen Laufzeit-Skill an `ctx.skills` an — beides die vorgesehenen
 * Erweiterungen des Kerns.
 *
 * @module @prometheus-harness/ponytail
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'

import { abweisung } from '@prometheus-harness/ai-capabilities'
import { resolveEigenesHome } from '@prometheus-harness/home-paths'

import { MODI, istModus, leseModus, schreibeModus, type Modus } from './modus.ts'
import { promptText, skillBeschreibung, skillInhalt } from './text.ts'

/**
 * Der Name des Cordis-Eintrags.
 *
 * **Warum nicht `pmh-ponytail-panel`.** Der Name ist die Kennung im Loader; zwei Pakete mit
 * demselben Namen ergeben keinen zweiten Eintrag, sondern einen toten.
 */
export const name = 'pmh-ponytail'

/** Ohne diese drei Dienste gibt es nichts anzumelden und nichts zu schalten. */
export const inject = ['systemPrompt', 'skills', 'webServer'] as const

/** Der Weg des Schalters. */
export const WEG = '/api/pmh/ponytail'

/** Der Dateiname im eigenen Home. */
export const DATEINAME = 'ponytail.json'

/** Der Name des Skills im Katalog. */
export const SKILL_NAME = 'ponytail'

/** Der Name des Prompt-Abschnitts. */
export const ABSCHNITT = 'pmh:ponytail'

/**
 * Wo der Abschnitt im Prompt steht.
 *
 * 5000 liegt nach der Persona (0) und vor den Herkunftszeilen des Harness (10000). Die Zahl ist
 * eine Wahl, keine Messung: der Kern erlaubt jeder externen Abschnittsstelle eine endliche Zahl.
 */
const ORDNUNG = 5000

/** Die Konfiguration des Plugins. */
export interface Konfiguration {
  /** Eigenes Home für `ponytail.json`; Vorgabe `~/.pmh` (nie `~/.dsh`). */
  readonly home?: string
}

/**
 * Baut den Einstieg.
 *
 * @param ctx - der Host-Kontext
 * @param konfiguration - optionales Home
 * @returns die Rücknahme
 */
export function apply(ctx: Context, konfiguration: Konfiguration = {}): () => void {
  const pfad = join(resolveEigenesHome(konfiguration.home), DATEINAME)
  let modus: Modus = leseModus(lese(pfad) ?? '')
  let abmelden: (() => void) | undefined

  /**
   * Meldet den alten Stand ab und den neuen an.
   *
   * **Warum vollständig ab- und wieder anmelden.** Der Skill-Rumpf trägt die Stufe, und ein
   * gemerkter Abschnitt bliebe sonst auf dem alten Text stehen. Ein Ab- und Anmelden ist die
   * einzige Form, die ohne Kernänderung wirklich wechselt.
   */
  const anwenden = (): void => {
    abmelden?.()
    abmelden = undefined
    if (modus === 'off') return

    const teile: (() => void)[] = [
      ctx.systemPrompt.section({ name: ABSCHNITT, order: ORDNUNG, text: promptText(modus) }),
      ctx.skills.register({
        name: SKILL_NAME,
        description: skillBeschreibung(modus),
        content: skillInhalt(modus),
        source: 'runtime',
        invocation: { modelInvocable: true, userInvocable: true },
      }),
    ]
    abmelden = (): void => {
      for (const teil of teile) teil()
    }
  }

  /** Setzt den Zustand: schreiben, dann anwenden. */
  const setze = (neu: Modus): void => {
    modus = neu
    try {
      schreibe(pfad, schreibeModus(modus, lese(pfad), new Date()))
    } catch (fehler) {
      protokoll(`konnte ${DATEINAME} nicht schreiben: ${fehlerText(fehler)}`)
    }
    anwenden()
  }

  ctx.effect(() => {
    const route = ctx.webServer.register({
      kind: 'exact',
      path: WEG,
      handler: macheSchalter(ctx, () => modus, setze),
    })
    return () => {
      route()
      abmelden?.()
      abmelden = undefined
    }
  }, `${name} Schalter`)

  anwenden()
  protokoll(`eingehängt — Stufe ${modus}`)
  return () => {
    abmelden?.()
    abmelden = undefined
  }
}

/**
 * Macht den Handler für `GET` und `POST`.
 *
 * **Warum eine Route und nicht zwei.** Beides ist derselbe Gegenstand: der Zustand. Zwei Wege
 * (`/status`, `/setzen`) hießen zwei Antwortformen für eine Sache.
 *
 * @param ctx - der Host-Kontext für die Anmeldefrage
 * @param aktuell - liest den Zustand
 * @param setze - setzt ihn
 * @returns der Handler
 */
function macheSchalter(
  ctx: Context,
  aktuell: () => Modus,
  setze: (modus: Modus) => void,
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const status = abweisung(ctx, req.headers)
    if (status !== undefined) {
      antworte(res, status, { fehler: status === 401 ? 'nicht angemeldet' : 'kein Verbindungsdienst' })
      return
    }

    if (req.method === 'GET') {
      antworte(res, 200, { modus: aktuell(), modi: MODI })
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'GET, POST')
      antworte(res, 405, { fehler: 'nur GET und POST' })
      return
    }

    let koerper: unknown
    try {
      koerper = await liesKoerper(req)
    } catch (fehler) {
      antworte(res, 400, { fehler: fehlerText(fehler) })
      return
    }
    const gewuenscht = (koerper as { modus?: unknown } | null)?.modus
    if (!istModus(gewuenscht)) {
      antworte(res, 400, { fehler: `modus fehlt oder ist unbekannt — erlaubt: ${MODI.join(', ')}` })
      return
    }
    setze(gewuenscht)
    antworte(res, 200, { modus: gewuenscht, modi: MODI })
  }
}

/**
 * Antwortet mit JSON.
 */
function antworte(res: ServerResponse, status: number, koerper: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(koerper))
}

/** Liest einen kleinen JSON-Körper. */
async function liesKoerper(req: IncomingMessage): Promise<unknown> {
  const teile: Buffer[] = []
  let groesse = 0
  for await (const teil of req) {
    const puffer = teil as Buffer
    groesse += puffer.length
    if (groesse > 4096) throw new Error('Körper zu groß')
    teile.push(puffer)
  }
  if (groesse === 0) throw new Error('Körper fehlt')
  return JSON.parse(Buffer.concat(teile).toString('utf8'))
}

/** Liest einen Text, oder `undefined`, wenn es ihn nicht gibt. */
function lese(pfad: string): string | undefined {
  try {
    return readFileSync(pfad, 'utf8')
  } catch {
    return undefined
  }
}

/** Schreibt atomar: erst daneben, dann umbenennen. */
function schreibe(pfad: string, text: string): void {
  mkdirSync(dirname(pfad), { recursive: true })
  const zwischen = `${pfad}.${String(process.pid)}.tmp`
  writeFileSync(zwischen, text, 'utf8')
  renameSync(zwischen, pfad)
}

/** Eine Zeile ins Protokoll — der Kern-Logger verschluckt erfolgreiche Einhängungen. */
function protokoll(meldung: string): void {
  process.stderr.write(`[pmh] ${name}: ${meldung}\n`)
}

/** Macht aus einem unbekannten Fehler einen Text. */
function fehlerText(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler)
}
