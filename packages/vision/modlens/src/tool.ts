/**
 * Das Werkzeug: `modlens_read_image` für den Loop.
 *
 * ## Warum es „beschreiben" durch „belegen" ersetzt
 *
 * Ein Bildmodell, das frei antwortet, erfindet gern. Die modlens-Evidenz trennt drei Dinge, die
 * sonst verschwimmen: den **erkannten Text** (OCR), die **Anordnung** (Layout) und was **unsicher**
 * bleibt. Ein Modell, das diese drei liest, kann sich auf Transkribiertes berufen statt darauf, daß
 * es „etwas gesehen" hat.
 *
 * ## Warum ein Fehlschlag geworfen und nicht als Text zurückgegeben wird
 *
 * Der Loop macht aus einem geworfenen Werkzeugfehler ein **Werkzeugergebnis** mit `failed: true`,
 * und das Modell kann sich korrigieren (etwa einen anderen Pfad nehmen). Ein als Erfolg getarnter
 * Fehlertext wäre dagegen eine Behauptung über ein Bild, das niemand gelesen hat.
 *
 * @module @prometheus-harness/modlens/tool
 */

import type { AgentTool } from '@prometheus-harness/agent-tools'

import { entschaerfe } from './config.ts'
import { baueAufruf, liesAntwort, type Bildauftrag } from './engine.ts'

/** Wie ein Kindprozeß ausgeführt wird — austauschbar, damit die Prüfung ohne CLI läuft. */
export type Ausfuehren = (
  programm: string,
  argumente: string[],
  zeitlimitMs: number,
) => Promise<{ stdout: string; stderr: string; code: number }>

/** Wie das Werkzeug gebaut wird. */
export interface ModlensOptionen {
  /** Der Pfad zu `dist/main.js` der modlens-CLI. */
  cliPfad: string
  /** Wie Prozesse laufen; im Test eine Attrappe. */
  ausfuehren: Ausfuehren
  /** Das Programm, das die CLI startet (Vorgabe: `process.execPath`). */
  programm?: string
  /** Zeitlimit je Aufruf (Vorgabe: das der CLI, 180 s). */
  timeoutMs?: number
  /** Der Werkzeugname (Vorgabe `modlens_read_image`). */
  name?: string
}

/** Der Standardname des Werkzeugs. */
export const WERKZEUGNAME = 'modlens_read_image'

/**
 * Baut das Werkzeug.
 *
 * @param optionen - CLI-Pfad, Ausführung und Grenzen
 * @returns ein `AgentTool`, das Evidenz als JSON liefert
 */
export function modlensWerkzeug(optionen: ModlensOptionen): AgentTool {
  if (optionen.cliPfad.trim() === '') {
    throw new Error('ohne Pfad zur modlens-CLI wird kein Werkzeug gebaut')
  }
  const name = optionen.name ?? WERKZEUGNAME

  return {
    name,
    description:
      'Lies ein Bild (lokaler Pfad oder http(s)-URL) und erhalte STRUKTURIERTE Evidenz: erkannter '
      + 'Text (OCR), Anordnung der Bereiche, was zu sehen ist, und was unsicher bleibt. Nutze das '
      + 'Werkzeug, statt ueber ein Bild zu spekulieren — und behaupte nur, was in der Evidenz steht.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Lokaler Pfad oder http(s)-URL des Bildes.' },
        prompt: { type: 'string', description: 'Optionaler Fokus, z. B. "achte auf die Achsenbeschriftung".' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      const bild = args['path']
      if (typeof bild !== 'string' || bild.trim() === '') {
        throw new Error(`${name}: das Argument "path" fehlt`)
      }
      const prompt = typeof args['prompt'] === 'string' && args['prompt'].trim() !== ''
        ? args['prompt']
        : undefined
      const auftrag: Bildauftrag = {
        bild: bild.trim(),
        ...(prompt === undefined ? {} : { prompt }),
        timeoutMs: optionen.timeoutMs ?? 180_000,
      }
      const aufruf = baueAufruf(optionen.cliPfad, auftrag, optionen.programm)
      const lauf = await optionen.ausfuehren(aufruf.programm, aufruf.argumente, auftrag.timeoutMs ?? 180_000)
      if (lauf.code !== 0) {
        const meldung = entschaerfe(lauf.stderr.trim()).slice(0, 400)
        throw new Error(
          `${name}: die modlens-CLI endete mit Code ${String(lauf.code)}`
            + (meldung === '' ? '' : ` — ${meldung}`),
        )
      }
      const antwort = liesAntwort(lauf.stdout)
      return JSON.stringify({
        bild: antwort.bild,
        provider: antwort.provider,
        model: antwort.model,
        warnungen: antwort.warnungen,
        evidenz: antwort.evidenz,
      })
    },
  }
}
