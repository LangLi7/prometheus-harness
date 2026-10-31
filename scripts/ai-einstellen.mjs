#!/usr/bin/env bun
/**
 * Setzt die Wahl **einer** Fähigkeit in der Einstellungsdatei.
 *
 * ## Warum es dieses Skript gibt
 *
 * Die Oberfläche für „welches Modell je Fähigkeit" ist noch nicht gebaut
 * (`docs/status/entscheiden-und-waechter.md`, offener Punkt B). Bis dahin ist die Datei der Ort —
 * und ein Skript, das sie **über dieselben Funktionen** schreibt, ist besser als ein `echo` in
 * eine JSON-Datei: es prüft die Fassung, es schreibt unteilbar (Nachbardatei + Umbenennen), und es
 * hält den Riegel gegen fremde Zuhäuser ein.
 *
 * ## Beispiel
 *
 * ```powershell
 * bun scripts/ai-einstellen.mjs --faehigkeit bild --anbieter openrouter --modell google/gemini-2.5-flash-image
 * ```
 *
 * @module scripts/ai-einstellen
 */

import {
  ladeEinstellungen,
  mitWahl,
  sichereEinstellungen,
  unserPfad,
  wahlFuer,
} from '../packages/ai/settings/src/index.ts'

/**
 * Liest `--name wert` aus der Kommandozeile.
 *
 * @param {readonly string[]} argv - die Argumente
 * @returns {Record<string, string>} die Werte
 * @throws Error wenn ein Argument kein Wert ist
 */
function liesArgumente(argv) {
  const werte = {}
  for (let i = 0; i < argv.length; i += 1) {
    const teil = argv[i]
    if (!teil.startsWith('--')) throw new Error(`Unerwartetes Argument: ${teil}`)
    const name = teil.slice(2)
    const wert = argv[i + 1]
    if (wert === undefined || wert.startsWith('--')) throw new Error(`Zu „--${name}" fehlt der Wert.`)
    werte[name] = wert
    i += 1
  }
  return werte
}

const werte = liesArgumente(process.argv.slice(2))
const faehigkeit = werte.faehigkeit
const anbieter = werte.anbieter
const modell = werte.modell
if (faehigkeit === undefined || anbieter === undefined || modell === undefined) {
  process.stderr.write(
    'Aufruf: bun scripts/ai-einstellen.mjs --faehigkeit <name> --anbieter <id> --modell <kennung>\n' +
      'Beispiel: --faehigkeit bild --anbieter openrouter --modell google/gemini-2.5-flash-image\n',
  )
  process.exit(2)
}

const pfad = werte.pfad ?? unserPfad()
const vorher = await ladeEinstellungen(pfad)
const bisher = wahlFuer(vorher, faehigkeit)
const nachher = mitWahl(vorher, faehigkeit, { anbieter, modell })

// **Erst schreiben, dann melden.** Eine Meldung über eine Änderung, die nicht auf der Platte
// steht, wäre genau die stille Abweichung, die dieses Projekt vermeidet.
await sichereEinstellungen(pfad, nachher)
const gelesen = await ladeEinstellungen(pfad)
const steht = wahlFuer(gelesen, faehigkeit)

process.stdout.write(`Datei: ${pfad}\n`)
process.stdout.write(
  bisher === undefined
    ? `„${faehigkeit}": neu gesetzt (vorher nichts)\n`
    : `„${faehigkeit}": ersetzt (vorher ${bisher.anbieter}/${bisher.modell})\n`,
)
process.stdout.write(
  steht === undefined
    ? 'FEHLER: die Wahl steht nach dem Schreiben NICHT in der Datei.\n'
    : `„${faehigkeit}" steht jetzt auf ${steht.anbieter}/${steht.modell} — nachgelesen, nicht behauptet.\n`,
)
process.exit(steht === undefined ? 1 : 0)
