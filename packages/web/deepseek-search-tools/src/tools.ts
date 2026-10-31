/**
 * Die beiden Werkzeuge: `tools_search` und `tools_fetch`.
 *
 * ## Warum eigene Namen und nicht `web_search`
 *
 * Der Kern bringt bereits `web_search` mit — über den **Server-Werkzeug-Weg** (Anthropic-kompatibel,
 * bis 2026-10-31 16:00 UTC kostenfrei). Zwei Werkzeuge mit demselben Namen wären im Loop nicht
 * unterscheidbar, und das Modell könnte nicht wählen, welchen Preis es auslöst. Hier heißen sie
 * **`tools_search`** und **`tools_fetch`** — sie gehen die **direkten** Endpunkte und kosten
 * **je Anfrage**.
 *
 * ## Warum das Ergebnis die Kosten nennt
 *
 * Der Harness planiert Kosten gern weg. Ein Werkzeug, das eine Rechnung auslöst und sie
 * verschweigt, macht den Unterschied zwischen „der Agent hat gesucht" und „der Agent hat 40 Cent
 * ausgegeben" unsichtbar. Jedes Ergebnis trägt `kostenUsd` und `abrechenbar`; der Loop reicht das an
 * das Modell, und der Betreiber sieht es im Verlauf.
 *
 * @module @prometheus-harness/deepseek-search-tools/tools
 */

import type { AgentTool } from '@prometheus-harness/agent-tools'

import { abruf, suche, type Hole } from './client.ts'

/** Wie die Werkzeuge gebaut werden. */
export interface WerkzeugOptionen {
  /** Der Schlüssel — **wird nicht protokolliert**. */
  apiKey: string
  /** Der HTTP-Weg; im Test eine Attrappe. */
  hole: Hole
  /** Die Basisadresse (Vorgabe `https://api.deepseek.com`). */
  basis?: string
}

/** Der Name des Suchwerkzeugs. */
export const SUCHWERKZEUG = 'tools_search'

/** Der Name des Abrufwerkzeugs. */
export const ABRUFWERKZEUG = 'tools_fetch'

/**
 * Baut die beiden Werkzeuge.
 *
 * @param optionen - Schlüssel, HTTP-Weg und Basis
 * @returns Such- und Abrufwerkzeug
 */
export function suchWerkzeuge(optionen: WerkzeugOptionen): AgentTool[] {
  if (optionen.apiKey.trim() === '') {
    throw new Error('ohne Schluessel werden keine Suchwerkzeuge gebaut')
  }
  const basis = optionen.basis

  const suchen: AgentTool = {
    name: SUCHWERKZEUG,
    description:
      'Durchsuche das Web ueber die DeepSeek-Search-API. Jede ERFOLGREICHE Anfrage kostet Geld '
      + '(0,00075 USD); leere Suchergebnisse und Fehler kosten nichts. Gib an, was du suchst — '
      + 'Operatoren wie site:, -begriff und "exakte Wendung" werden unterstuetzt.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Die Suchanfrage (1–128 Zeichen).' },
        count: { type: 'integer', description: 'Wie viele Treffer (1–50, Vorgabe 10) — preisneutral.' },
        need_content: { type: 'boolean', description: 'Den Seiteninhalt mitliefern (Vorgabe aus).' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      const query = typeof args['query'] === 'string' ? args['query'] : ''
      if (query.trim() === '') throw new Error(`${SUCHWERKZEUG}: das Argument "query" fehlt`)
      const count = typeof args['count'] === 'number' && Number.isSafeInteger(args['count'])
        ? args['count']
        : undefined
      const needContent = args['need_content'] === true
      const ergebnis = await suche(optionen.hole, {
        apiKey: optionen.apiKey,
        query,
        ...(count === undefined ? {} : { count }),
        needContent,
        ...(basis === undefined ? {} : { basis }),
      })
      return JSON.stringify({
        treffer: ergebnis.treffer,
        kostenUsd: ergebnis.kosten.kostenUsd,
        abrechenbar: ergebnis.kosten.abrechenbar,
      })
    },
  }

  const abrufen: AgentTool = {
    name: ABRUFWERKZEUG,
    description:
      'Rufe eine Seite als Markdown ab (DeepSeek-Fetch-API). Jeder ERFOLGREICHE Abruf kostet Geld '
      + '(0,00075 USD); Fehler und Seiten ohne verwertbaren Inhalt kosten nichts.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Die http(s)-Adresse (bis 8192 Zeichen, keine Zugangsdaten).' },
      },
      required: ['url'],
    },
    execute: async (args) => {
      const url = typeof args['url'] === 'string' ? args['url'] : ''
      if (url.trim() === '') throw new Error(`${ABRUFWERKZEUG}: das Argument "url" fehlt`)
      const ergebnis = await abruf(optionen.hole, {
        apiKey: optionen.apiKey,
        url,
        ...(basis === undefined ? {} : { basis }),
      })
      return JSON.stringify({
        title: ergebnis.title,
        inhalt: ergebnis.content,
        kostenUsd: ergebnis.kostenUsd,
        abrechenbar: ergebnis.abrechenbar,
      })
    },
  }

  return [suchen, abrufen]
}
