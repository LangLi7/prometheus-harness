/**
 * `scripts/leck-haken.mjs` — der gitleaks-Haken (E2).
 *
 * ## Der Entwurf folgt aus einer Messung: **gitleaks ist hier nicht installiert**
 *
 * Ein Haken, der bei fehlendem Werkzeug **jeden** Commit abweist, wird nach dem
 * dritten Mal entfernt (`--no-verify`) — und dann schützt er **nichts**. Ein Haken,
 * der stillschweigend durchläuft, ist schlimmer: er sieht aus wie ein Schutz.
 *
 * Deshalb drei Regeln:
 *
 * 1. **Fehlt das Werkzeug, wird das GESAGT** — mit dem Befehl zur Installation, und
 *    mit dem ausdrücklichen Satz, daß **nicht** geprüft wurde.
 * 2. **Ist es da, entscheidet sein Exit-Code** — und ein Fund **blockiert**.
 * 3. **Der Haken ist nicht der einzige Weg.** `pruefen` läßt sich jederzeit von Hand
 *    aufrufen; ein Haken, den man nur beim Commit erlebt, wird beim ersten Ärger
 *    abgeschaltet.
 *
 * ## Was dieser Haken NICHT ist
 *
 * Er ist **kein** Ersatz für die eigene Leck-Prüfung der Aufsicht
 * (`docs/protokoll/aufsicht/werkzeuge/leck-pruefung.mjs`), die die **echten** Werte
 * aus `.env` und den Credential-Speichern gegen **jeden** Commit hält. gitleaks
 * sucht **Muster**; die andere Prüfung sucht **die konkreten Geheimnisse dieses
 * Rechners**. Beides hat seinen Platz, und keines ersetzt das andere.
 *
 * @module scripts/leck-haken
 */

import { spawnSync } from 'node:child_process'

/** Der Name des Werkzeugs — an einer Stelle, damit Meldung und Aufruf nicht auseinanderlaufen. */
export const WERKZEUG = 'gitleaks'

/** Die Installationsbefehle, die in der Meldung stehen. */
export const INSTALLATION = [
  'winget install --id Gitleaks.Gitleaks   (Windows)',
  'scoop install gitleaks                  (Windows, Scoop)',
  'brew install gitleaks                   (macOS/Linux)',
  'go install github.com/gitleaks/gitleaks/v8@latest   (mit Go)',
]

/**
 * Sucht das Werkzeug.
 *
 * **Als Parameter hereinreichbar** (`finde`), damit die Prüfung beide Fälle
 * fahren kann, ohne gitleaks zu installieren. Ein Haken, dessen „nicht
 * installiert"-Zweig nie läuft, ist in genau dem Zustand ungeprüft, in dem er
 * gebraucht wird.
 *
 * @param {string} name - der Programmname
 * @returns {string | undefined} die Fassung, oder `undefined`
 */
export function findeWerkzeug(name = WERKZEUG) {
  const r = spawnSync(name, ['version'], { encoding: 'utf8', timeout: 15_000, shell: false })
  if (r.error !== undefined && r.error !== null) return undefined
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  if (r.status === 0 && text !== '') return text.split('\n')[0]
  return undefined
}

/**
 * Führt einen Befehl aus.
 *
 * @param {readonly string[]} argv - die Argumente ohne `node` und Skriptpfad
 * @param {Readonly<Record<string, string | undefined>>} umgebung - Umgebungsvariablen
 * @param {(text: string) => void} schreibe - Ausgabe
 * @param {() => string | undefined} finde - die Werkzeugsuche (Einschub für die Prüfung)
 * @returns {number} der Exit-Code
 */
export function fuehreAus(argv, umgebung = process.env, schreibe = (t) => process.stdout.write(t), finde = findeWerkzeug) {
  const befehl = argv[0]

  if (befehl === undefined || !['pruefen', 'haken'].includes(befehl)) {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/leck-haken.mjs pruefen          (die gestellten Änderungen prüfen)\n' +
        '  bun scripts/leck-haken.mjs haken            (wie man ihn einhängt)\n' +
        '\n' +
        '  Fehlt gitleaks, wird das GESAGT und der Exit-Code bleibt 0 — ein Haken,\n' +
        '  der bei fehlendem Werkzeug alles blockiert, wird abgeschaltet, und dann\n' +
        '  schützt er nichts. Geprüft ist dann NICHTS, und das steht in der Ausgabe.\n',
    )
    return 1
  }

  const fassung = finde()

  if (befehl === 'haken') {
    schreibe(
      'Den Haken einhängen (einmal je Arbeitskopie):\n' +
        '\n' +
        '  git config core.hooksPath .githooks\n' +
        '  # .githooks/pre-commit enthält:\n' +
        '  #   #!/bin/sh\n' +
        '  #   exec bun scripts/leck-haken.mjs pruefen\n' +
        '\n' +
        `Werkzeug: ${fassung === undefined ? `${WERKZEUG} ist NICHT installiert — der Haken sagt das und blockiert nicht` : `${WERKZEUG} ${fassung}`}\n` +
        '\n' +
        'Warum core.hooksPath und nicht .git/hooks/: .git/ wird nicht versioniert.\n' +
        'Ein Haken dort gilt nur auf diesem Rechner, für niemanden sonst — und\n' +
        'verschwindet beim nächsten Klon.\n',
    )
    return 0
  }

  if (fassung === undefined) {
    schreibe(
      `NICHT GEPRÜFT: ${WERKZEUG} ist nicht installiert.\n` +
        '\n' +
        'Zum Installieren:\n' +
        INSTALLATION.map((z) => `  ${z}`).join('\n') +
        '\n' +
        '\n' +
        'Bis dahin gilt: dieser Lauf hat NICHTS geprüft. Ein grüner Haken ohne\n' +
        'Werkzeug ist kein Beweis — er ist die Abwesenheit eines Beweises.\n' +
        '\n' +
        'Was es hier sonst gibt: docs/protokoll/aufsicht/werkzeuge/leck-pruefung.mjs\n' +
        'prüft die ECHTEN Werte aus .env gegen jeden Commit. Das ist eine andere\n' +
        'Frage als Mustererkennung — und für diesen Rechner die schärfere.\n',
    )
    return 0
  }

  // **Der Fund blockiert.** Hier entscheidet gitleaks, nicht wir.
  const r = spawnSync(WERKZEUG, ['protect', '--staged', '--redact', '--verbose'], {
    encoding: 'utf8',
    timeout: 120_000,
    shell: false,
  })
  const aus = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  if (aus !== '') schreibe(`${aus}\n`)
  if (r.status === 0) {
    schreibe(`${WERKZEUG} ${fassung}: keine Auffälligkeit in den gestellten Änderungen.\n`)
    return 0
  }
  schreibe(
    `${WERKZEUG} ${fassung}: FUND oder Fehler (Exit ${String(r.status)}). Der Commit soll NICHT so gehen.\n` +
      '  Wer den Fund für falsch hält: erst die Regel prüfen, dann — nur dann —\n' +
      '  mit --no-verify übergehen und den Grund aufschreiben.\n',
  )
  return 1
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('leck-haken.mjs')) {
  process.exitCode = fuehreAus(process.argv.slice(2))
}
