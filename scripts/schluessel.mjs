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
import {
  DOCKER_SECRET_PFAD,
  HAUPTSSCHLUESSELDATEI,
  erzeugeHauptschluesselText,
  holeHauptschluessel,
  pruefeDateirechte,
  standardQuellen,
} from '../packages/auth/secrets/src/index.ts'

/**
 * Erzeugt den Hauptschlüssel — oder **übernimmt** ihn in die Datei.
 *
 * ## Der Fallstrick, der hier stand — gemessen am 14.10.2026
 *
 * Die Sicherung lautete: *„Es liegt schon ein Hauptschlüssel"*, geprüft mit
 * `existsSync(pfad)`. Sie schützte nur, wenn die **Datei** schon da war.
 *
 * **Der wirksame Schlüssel kann aber aus einer ANDEREN Quelle kommen** — bei uns aus
 * `PMH_MASTER_KEY` in `.env`, weil die Datei **fehlt**. Gemessen:
 *
 * ```
 * 1. datei          keiner      (.pmh-build/harness-home/master.key FEHLT)
 * 2. docker-secret  keiner
 * 3. umgebung       HAT einen
 * ```
 *
 * In diesem Zustand lief das Skript **ohne Warnung** durch, legte einen **neuen**
 * Schlüssel an — und **jeder `wrapped_key`, der mit dem Umgebungsschlüssel verschlüsselt
 * wurde, wäre unlesbar geworden.** Die Warnung, die es gab, sagt sogar „Die Stufe
 * ‚Umgebungsvariable' wird nicht mehr gebraucht" — was **genau hier falsch** ist: sie ist
 * die Quelle, die den Bestand verschlüsselt hat.
 *
 * ## Was jetzt gilt
 *
 * | Aufruf | Was geschieht |
 * |---|---|
 * | ohne Schalter, wirksamer Schlüssel liegt woanders | **Abbruch mit Begründung** — es wird **nichts** geschrieben |
 * | `--uebernehmen` | der **vorhandene** Schlüssel wird in die Datei geschrieben. **Verlustfrei**: derselbe Schlüssel, nur eine stärkere Quelle |
 * | `--neu` | ein **neuer** Schlüssel. Macht Bestand unlesbar — deshalb ausdrücklich |
 *
 * @param optionen - Ausgabe, Home, Umgebung und Schalter, austauschbar für Prüfungen
 * @returns der Exit-Code
 */
export function erzeuge(optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const home = optionen.home ?? resolveEigenesHome()
  const umgebung = optionen.umgebung ?? process.env
  const neu = optionen.neu ?? process.argv.includes('--neu')
  const uebernehmen = optionen.uebernehmen ?? process.argv.includes('--uebernehmen')
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

  // ---------------------------------------------------------------------------
  // **Der wirksame Schlüssel — nicht nur die Datei.**
  // ---------------------------------------------------------------------------
  // Die Reihenfolge kommt aus `standardQuellen`: dieselbe Kette, die der Betrieb
  // benutzt. Damit kann dieser Aufruf nicht anders urteilen als der Betrieb.
  const quellen = standardQuellen(umgebung, home, DOCKER_SECRET_PFAD)
  let wirksam = null
  let wirksamerFehler = null
  for (const q of quellen) {
    try {
      if (q.versuche() !== undefined) {
        wirksam = q
        break
      }
    } catch (fehler) {
      // Eine Quelle MIT Schlüssel, der unbrauchbar ist. Das darf nicht zur nächsten
      // führen — sonst verdeckt ein Abbruch eine kaputte Konfiguration.
      wirksamerFehler = fehler instanceof Error ? fehler.message : String(fehler)
      break
    }
  }

  if (wirksamerFehler !== null) {
    schreibe(
      `ABBRUCH: eine Quelle hat einen Hauptschlüssel, aber er ist unbrauchbar.\n\n  ${wirksamerFehler}\n\n` +
        '  Es wird NICHTS geschrieben. Erst die Konfiguration berichtigen.\n',
    )
    return 1
  }

  const liegtInDatei = wirksam !== null && wirksam.art === 'datei'

  if (!neu && !uebernehmen && wirksam !== null && !liegtInDatei) {
    // **Der Fall, der Bestand zerstört hätte.** Es gibt einen wirksamen Schlüssel,
    // er liegt aber NICHT in der Zieldatei. Ein neuer Schlüssel wäre ein anderer.
    schreibe(
      'ABBRUCH: es gibt schon einen wirksamen Hauptschlüssel — nur nicht in der Datei.\n' +
        '\n' +
        `  Wirkende Quelle: ${wirksam.art}\n` +
        `    ${wirksam.name}\n` +
        `  Zieldatei:       ${pfad}  (fehlt)\n` +
        '\n' +
        '  Ein NEUER Schlüssel an dieser Stelle macht JEDE bereits verschlüsselte Zeile\n' +
        '  unlesbar — und dieser Aufruf wäre nicht als Ursache zu erkennen.\n' +
        '\n' +
        '  Verlustfrei geht es so:  bun scripts/schluessel.mjs --uebernehmen\n' +
        '    -> derselbe Schlüssel wird in die Datei geschrieben, nur aus einer\n' +
        '       stärkeren Quelle. Bestehende Umschläge bleiben lesbar.\n' +
        '\n' +
        '  Wenn wirklich ein NEUER Schlüssel gewollt ist:  --neu\n',
    )
    return 1
  }

  if (uebernehmen && !neu) {
    if (wirksam === null) {
      schreibe(
        'ABBRUCH: --uebernehmen, aber es gibt KEINEN wirksamen Hauptschlüssel.\n' +
          '  Es gibt nichts zu übernehmen. Für einen neuen:  bun scripts/schluessel.mjs\n',
      )
      return 1
    }
    if (liegtInDatei) {
      schreibe(`Es liegt schon in der Datei: ${pfad}\nNichts zu tun.\n`)
      return 0
    }
    // **Den vorhandenen Schlüssel holen und kanonisch schreiben.** Nicht den Text der
    // Umgebungsvariablen übernehmen: er könnte anders kodiert sein (hex statt base64url).
    // Geschrieben wird die Form, die `erzeugeHauptschluesselText` erzeugt — damit die
    // Datei dieselbe Kodierung trägt wie eine frisch erzeugte.
    const geholt = holeHauptschluessel(quellen, Number((umgebung.PMH_MASTER_KEY_VERSION ?? '1').trim()))
    const text = Buffer.from(geholt.schluessel).toString('base64url')
    mkdirSync(home, { recursive: true })
    writeFileSync(pfad, `${text}\n`, { encoding: 'utf8', mode: 0o600 })
    const hinweis = pruefeDateirechte(pfad)
    schreibe(
      'Hauptschlüssel ÜBERNOMMEN — derselbe, nur aus einer stärkeren Quelle.\n' +
        '\n' +
        `  Von:   ${wirksam.art}  (${wirksam.name})\n` +
        `  Nach:  ${pfad}\n` +
        `  Fassung: ${String(geholt.version)}\n` +
        '\n' +
        'Bestehende Umschläge bleiben lesbar: es ist DERSELBE Schlüssel.\n' +
        'Die Datei gewinnt jetzt (Stufe 1 vor Stufe 3). Erst wenn ein Lauf belegt, daß\n' +
        'nichts mehr über die Umgebungsvariable läuft, darf sie entfernt werden.\n' +
        '\n' +
        (hinweis === undefined ? '' : `HINWEIS: ${hinweis}\n`),
    )
    return 0
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
