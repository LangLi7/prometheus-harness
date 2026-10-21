/**
 * Der Skill-Vorrat: Fähigkeitsdateien aus dem Repo in das Harness-Home legen.
 *
 * ## Warum das der Starter tut und nicht ein Handgriff
 *
 * Ein Skill wirkt nur, wo der lokale Anbieter ihn findet. Die projektweite Wurzel
 * (`.agents/skills`) gilt **nur für Sitzungen in diesem Baum**; wer den Harness in
 * einem anderen Projekt startet, sieht dort keinen einzigen davon. Die
 * benutzerweite Wurzel `<dshHome>/skills` gilt für **jede** Sitzung dieser
 * Installation — aber `<dshHome>` ist hier `.pmh-build/harness-home`, und
 * `.pmh-build/` ist **nicht** versioniert (siehe `.gitignore`). Ein von Hand
 * dorthin kopierter Skill wäre beim nächsten Klon weg, und die Anleitung „leg ihn
 * ins Home" liefe stillschweigend ins Leere.
 *
 * Deshalb steht der Skill **im Repo** und wird bei jedem Start ins Home gelegt —
 * dieselbe Begründung wie bei `scripts/profile-patch.mjs` daneben.
 *
 * ## Warum ein Fingerabdruck und kein Zeitstempel
 *
 * Kopiert wird nur, was sich **inhaltlich** unterscheidet. Ein Vergleich über
 * `mtime` wäre billiger und falsch: `git clone` setzt Zeitstempel neu, ein
 * `git checkout` fasst Dateien an, ohne ihren Inhalt zu ändern. Der Vorrat hat
 * heute 41 Dateien und rund 2,3 MB — ihn bei jedem Start zu hashen kostet
 * Bruchteile einer Sekunde und erspart das Umschreiben eines Baums, den der Host
 * beim Start gerade liest.
 *
 * ## Warum das ganze Verzeichnis ersetzt wird
 *
 * Eine im Repo gelöschte Datei muss auch im Home verschwinden. Ein additives
 * Kopieren ließe sie liegen; der Skill liefe dann mit einem Rumpf, den niemand
 * mehr im Repo findet. Ersetzt wird deshalb das **Verzeichnis**, nicht sein Inhalt.
 *
 * ## Was hier bewusst nicht steht
 *
 * Kein Netzzugriff, kein `git`, keine Aktualisierung aus der Ferne: der Vorrat ist
 * genau das, was im Repo liegt. Woher der Inhalt kommt, entscheidet der Commit —
 * nicht der Start.
 *
 * @module scripts/skill-vorrat
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Was aus dem Repo ins Home wandert.
 *
 * **Warum eine ausdrückliche Liste und kein `readdir` über `.agents/skills`.** Dort
 * liegen auch die internen Arbeitsskills dieses Projekts (`dsh-code-review`,
 * `dsh-prose-standard`, …). Sie sind für die Arbeit **am** Harness gedacht; sie in
 * jede fremde Sitzung zu tragen, würde deren Katalog mit Regeln füllen, die dort
 * nichts zu suchen haben. Was hier steht, ist eine Entscheidung — kein Zufall des
 * Verzeichnisses.
 */
export const SKILL_VORRAT = Object.freeze([
  Object.freeze({ name: 'design-taste-frontend', quelle: '.agents/skills/design-taste-frontend' }),
])

/** Kebab-Case, dieselbe Grammatik wie der Skill-Anbieter. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Alle Dateien eines Baums, relativ und sortiert.
 *
 * @param {string} wurzel
 * @returns {string[]} relative Pfade mit `/` als Trenner, sortiert
 */
function dateien(wurzel) {
  const gefunden = []
  const lauf = (verzeichnis) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = join(verzeichnis, eintrag.name)
      if (eintrag.isDirectory()) lauf(pfad)
      else if (eintrag.isFile()) gefunden.push(relative(wurzel, pfad).split(sep).join('/'))
    }
  }
  lauf(wurzel)
  return gefunden.sort()
}

/**
 * Inhaltlicher Fingerabdruck eines Skill-Verzeichnisses.
 *
 * Über Pfad, Größe und Inhalt jeder Datei — nicht über Zeitstempel. Zwei Bäume mit
 * demselben Abdruck sind austauschbar; ein anderer Abdruck heißt: ersetzen.
 *
 * @param {string} verzeichnis
 * @returns {string | null} Hex-Digest, oder `null`, wenn das Verzeichnis fehlt
 */
export function fingerabdruck(verzeichnis) {
  if (!existsSync(verzeichnis) || !statSync(verzeichnis).isDirectory()) return null
  const hash = createHash('sha256')
  for (const pfad of dateien(verzeichnis)) {
    const inhalt = readFileSync(join(verzeichnis, pfad.split('/').join(sep)))
    hash.update(pfad)
    hash.update('\0')
    hash.update(String(inhalt.length))
    hash.update('\0')
    hash.update(inhalt)
    hash.update('\n')
  }
  return hash.digest('hex')
}

/**
 * Kopiert einen Baum. Vorhandenes Ziel wird vorher entfernt.
 *
 * @param {string} von
 * @param {string} nach
 * @returns {void}
 */
function kopiereBaum(von, nach) {
  rmSync(nach, { recursive: true, force: true })
  mkdirSync(nach, { recursive: true })
  for (const pfad of dateien(von)) {
    const ziel = join(nach, pfad.split('/').join(sep))
    mkdirSync(join(ziel, '..'), { recursive: true })
    copyFileSync(join(von, pfad.split('/').join(sep)), ziel)
  }
}

/**
 * Legt einen Skill aus dem Repo ins Home, wenn er sich unterscheidet.
 *
 * @param {object} auftrag
 * @param {string} auftrag.quelle absoluter Pfad im Repo
 * @param {string} auftrag.ziel absoluter Pfad im Home
 * @param {string} auftrag.name Skill-Name, nur für die Meldung
 * @returns {{name: string, ziel: string, geaendert: boolean, grund: 'kopiert' | 'unveraendert' | 'quelle-fehlt'}}
 */
export function stelleBereit({ quelle, ziel, name }) {
  const aus = fingerabdruck(quelle)
  if (aus === null) return { name, ziel, geaendert: false, grund: 'quelle-fehlt' }
  if (fingerabdruck(ziel) === aus) return { name, ziel, geaendert: false, grund: 'unveraendert' }
  kopiereBaum(quelle, ziel)
  return { name, ziel, geaendert: true, grund: 'kopiert' }
}

/**
 * Stellt den ganzen Vorrat in `<home>/skills` bereit.
 *
 * Eine fehlende Quelle ist **kein** Fehler des Starts: der Skill fehlt dann, das
 * Skill-Werkzeug sagt es beim Aufruf, und der Host läuft weiter. Ein Wurf hier
 * würde den Harness wegen einer Beigabe nicht hochkommen lassen — die falsche
 * Reihenfolge von Wichtigem.
 *
 * @param {string} home Harness-Home (das Verzeichnis mit `profiles/`)
 * @param {object} [optionen]
 * @param {string} [optionen.wurzel] Projektwurzel, in der die Quellen liegen (Vorgabe: cwd des Aufrufers)
 * @returns {Array<{name: string, ziel: string, geaendert: boolean, grund: string}>}
 */
export function vorratBereitstellen(home, { wurzel = process.cwd() } = {}) {
  const ziele = join(home, 'skills')
  return SKILL_VORRAT.map((eintrag) => {
    if (!NAME.test(eintrag.name)) {
      throw new Error(`Skill-Name ist kein Kebab-Case: ${JSON.stringify(eintrag.name)}`)
    }
    return stelleBereit({
      name: eintrag.name,
      quelle: join(wurzel, eintrag.quelle),
      ziel: join(ziele, eintrag.name),
    })
  })
}
