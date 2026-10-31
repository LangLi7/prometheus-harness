#!/usr/bin/env bun
/**
 * Die Auskunft der **echten** Kette — ohne Host, ohne Netz.
 *
 * ## Was diese Sonde beantwortet
 *
 * „Würde das Plugin im Host etwas können?" — mit der **echten** Einstellungsdatei
 * (`~/.pmh/einstellungen.json`) und dem **echten** Schlüsselspeicher
 * (`~/.dsh/.credentials.yaml`). Sie baut dieselbe Kette, die das Plugin je Anfrage baut, und gibt
 * dieselbe Auskunft aus, die `GET /api/ai/capabilities` liefert.
 *
 * ## Was sie NICHT tut
 *
 * Kein Modellaufruf. `bereit()` ist eine Auskunft über Schlüssel und Modellwahl — kein Netz. Ein
 * Lauf kostet deshalb nichts.
 *
 * ## Und der Schlüssel
 *
 * Er wird gelesen und **nie ausgegeben**. Die Ausgabe nennt nur „gesetzt" oder „nicht gesetzt".
 *
 * @module docs/status/messsonden/kette-auskunft
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { auskunft } from '../../../packages/api/ai-capabilities/src/flaechen.ts'
import { baueKette } from '../../../packages/api/ai-capabilities/src/kette.ts'

/**
 * Liest den Schlüssel aus dem Speicher des Harness — wie es `ctx.credentials` im Host tut.
 *
 * @returns der Schlüssel oder `undefined`
 */
async function schluesselAusSpeicher() {
  try {
    const text = await readFile(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
    const treffer = /^\s*OPENROUTER_API_KEY:\s*(\S+)\s*$/mu.exec(text)
    return treffer === null ? undefined : treffer[1].replace(/^["']|["']$/gu, '')
  } catch {
    return undefined
  }
}

const kette = await baueKette({ schluessel: schluesselAusSpeicher })
const stand = await auskunft(kette)

process.stdout.write(`Einstellungen: ${stand.einstellungen}\n`)
process.stdout.write(`Schlüssel:      ${stand.schluessel ? 'gesetzt' : 'NICHT gesetzt'}\n`)
process.stdout.write(`Eingetragen:    ${stand.eingetragen.join(', ') || '(keiner)'}\n\n`)
process.stdout.write('Fähigkeit           Anbieter/Modell                              bereit\n')
process.stdout.write('------------------  ----------------------------------------  ------\n')
for (const zeile of stand.faehigkeiten) {
  const wahl = zeile.anbieter === undefined ? '—' : `${zeile.anbieter}/${zeile.modell ?? '?'}`
  process.stdout.write(
    `${zeile.faehigkeit.padEnd(18)}  ${wahl.padEnd(40)}  ${zeile.bereit ? 'ja' : 'nein'}\n`,
  )
  if (!zeile.bereit && zeile.grund !== undefined) process.stdout.write(`                    ↳ ${zeile.grund}\n`)
}
if (stand.hinweise.length > 0) {
  process.stdout.write('\nHinweise:\n')
  for (const hinweis of stand.hinweise) process.stdout.write(`  - ${hinweis}\n`)
}
