/**
 * `scripts/schluessel.mjs` — den Hauptschlüssel erzeugen und ablegen.
 *
 * ## Warum es das geben muß
 *
 * `@prometheus-harness/secrets` sucht den Hauptschlüssel in dieser Reihenfolge:
 * **Datei im Harness-Home → Umgebungsvariable `PMH_MASTER_KEY`**. Die
 * Umgebungsvariable ist die **Übergangsstufe** — sie ist für jeden Prozeß
 * desselben Benutzers lesbar und landet in Fehlerberichten und
 * Container-Inspektionen. Eine Datei mit Modus 0600 ist enger.
 *
 * **Ohne dieses Skript gäbe es keinen Weg, die erste Stufe zu benutzen.** Der
 * Fehler von `holeHauptschluessel` nennt genau diesen Aufruf — und eine
 * Fehlermeldung, die auf ein Skript zeigt, das es nicht gibt, ist schlimmer als
 * keine.
 *
 * ## Was es tut — und was nicht
 *
 * Es **erzeugt** einen Schlüssel (32 Zufallsbytes, base64url) und schreibt ihn
 * nach `<PMH_HOME>/master.key`. Es **verschlüsselt nichts** und **liest keine
 * vorhandenen Geheimnisse**: wer einen neuen Schlüssel erzeugt, während schon
 * verschlüsselte Zeilen liegen, macht sie unlesbar. Deshalb prüft es vorher und
 * weigert sich, wenn eine Datei schon da ist — es sei denn, `--neu` sagt es
 * ausdrücklich.
 *
 * ## Wo die Datei liegt
 *
 * In **unserem** Home: `PMH_HOME`, sonst `~/.pmh` (`resolveEigenesHome` — das
 * **niemals** auf `DSH_HOME` zurückfällt; siehe `docs/decisions/naming-grenze.md`).
 *
 * @module scripts/schluessel
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveEigenesHome } from '../packages/util/home-paths/src/index.ts'
import { HAUPTSSCHLUESSELDATEI, erzeugeHauptschluesselText, pruefeDateirechte } from '../packages/auth/secrets/src/index.ts'

/**
 * Erzeugt den Hauptschlüssel.
 *
 * @param optionen - Ausgabe, Home und Vorhandensein, austauschbar für Prüfungen
 * @returns der Exit-Code
 */
export function erzeuge(optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const home = optionen.home ?? resolveEigenesHome()
  const neu = optionen.neu ?? process.argv.includes('--neu')
  const pfad = join(home, HAUPTSSCHLUESSELDATEI)

  if (existsSync(pfad) && !neu) {
    // **Der Schutz, der zählt.** Ein zweiter Schlüssel macht jede bereits
    // verschlüsselte Zeile unlesbar — und niemand käme auf die Idee, daß dieser
    // Aufruf daran schuld ist.
    schreibe(
      `Es liegt schon ein Hauptschlüssel: ${pfad}\n` +
        '\n' +
        '  Ein NEUER Schlüssel macht jede bereits verschlüsselte Zeile unlesbar.\n' +
        '  Wenn das wirklich gewollt ist:  bun scripts/schluessel.mjs --neu\n' +
        '  Für eine ROTATION (ohne Zeilen neu zu verschlüsseln) gibt es\n' +
        '  `rotiere` in @prometheus-harness/secrets — sie faßt nur `wrapped_key` an.\n',
    )
    return 1
  }

  const text = erzeugeHauptschluesselText()
  mkdirSync(home, { recursive: true })
  writeFileSync(pfad, `${text}\n`, { encoding: 'utf8', mode: 0o600 })

  const hinweis = pruefeDateirechte(pfad)
  schreibe(
    'Hauptschlüssel erzeugt.\n' +
      '\n' +
      `  Home:  ${home}\n` +
      `  Datei: ${pfad}\n` +
      `  Länge: ${String(text.length)} Zeichen (base64url = 32 Byte)\n` +
      '\n' +
      'Der Schlüssel wird NICHT angezeigt: er steht in der Datei, und eine Ausgabe\n' +
      'landet im Verlauf und in Protokollen. Wer ihn braucht, liest die Datei.\n' +
      '\n' +
      'Die Stufe „Umgebungsvariable" wird nicht mehr gebraucht — sie bleibt als\n' +
      'Rückfall erhalten, damit eine bestehende Installation weiterläuft.\n' +
      '\n' +
      (hinweis === undefined ? '' : `HINWEIS: ${hinweis}\n`),
  )
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('schluessel.mjs')) {
  process.exitCode = erzeuge()
}
