/**
 * `scripts/history-reset.mjs` — einen Neuanfang **ausgeben**, nicht vollziehen.
 *
 * ## Warum dieses Skript nichts tut
 *
 * Ein „Reset", der den Verlauf umschreibt (`filter-branch`, `rebase -i`,
 * `commit --amend` über alte Commits), ist nicht rückgängig zu machen — und
 * **täuscht** am Ende noch Sicherheit vor: die alten Objekte liegen weiter im
 * Repository und auf dem Server, bis jemand sie **wirklich** entfernt. Wer das
 * nicht weiß, glaubt sich sauber und ist es nicht.
 *
 * **Dieses Skript faßt den Verlauf nicht an.** Es **liest** den Zustand und
 * **gibt aus**, was zu tun ist — als fertige Befehle mit den echten Werten dieses
 * Repositorys. Was danach geschieht, entscheidet ein Mensch.
 *
 * ## Und es *kann* nichts anfassen
 *
 * `git` wird nur über {@link gitLesen} aufgerufen, und das läßt nur **lesende**
 * Unterbefehle durch. Ein Schreibbefehl wird abgewiesen, **bevor** er an `git`
 * geht — auch wenn ihn jemand später versehentlich einbaut. Eine Zusicherung, die
 * nur in einem Kommentar steht, ist keine.
 *
 * ## Der Name
 *
 * `scripts/reset.mjs` gibt es schon — das ist der **Paßwort**-Reset
 * (`docs/status/passwort-reset.md`). Zwei Dinge mit demselben Namen wären eine
 * Falle, also heißt dieses hier `verlauf-reset`.
 *
 * ## Und ein eigener Fehler, der hier beinahe gestanden hätte
 *
 * Die erste Fassung dieser Datei war **TypeScript in einer `.mjs`**: `interface`,
 * Typangaben an jeder Funktion, `as const`. Unter Bun ist das ein **Syntaxfehler**
 * beim Laden (`Expected ")" but found ":"`). Dieselbe Falle steht in
 * `scripts/migrate.mjs`, in `scripts/reset.test.mjs` und in
 * `docs/status/messsonden/suite-nebenlaeufigkeit.mjs` beschrieben — und ich bin
 * beim **fünften** Mal wieder hineingelaufen. Die Typen stehen jetzt als JSDoc,
 * wo sie hingehören: in eine `.mjs`.
 *
 * @module scripts/history-reset
 */

import { spawnSync } from 'node:child_process'

/**
 * Die **einzigen** Unterbefehle, die dieses Skript aufrufen darf.
 *
 * **Warum eine Erlaubnisliste und kein Verbot.** Verbote sind unvollständig: man
 * vergißt einen Schreibbefehl, und dann ist er erlaubt. Eine Erlaubnisliste ist
 * vollständig: was nicht darin steht, geht nicht — auch das, woran niemand gedacht
 * hat.
 */
const NUR_LESEND = ['rev-parse', 'rev-list', 'status', 'log', 'remote', 'branch', 'tag', 'config', 'count-objects']

/** Ein Aufruf, der nicht erlaubt wäre. */
export class NichtLesendError extends Error {}

/**
 * Führt einen **lesenden** git-Befehl aus.
 *
 * @param {string} unterbefehl - der Unterbefehl, z. B. `rev-list`
 * @param {readonly string[]} argumente - seine Argumente
 * @param {string} wo - das Verzeichnis
 * @returns {string | undefined} die Ausgabe, oder `undefined`, wenn er scheitert
 * @throws {NichtLesendError} wenn der Unterbefehl nicht in der Erlaubnisliste steht
 */
export function gitLesen(unterbefehl, argumente, wo) {
  if (!NUR_LESEND.includes(unterbefehl)) {
    throw new NichtLesendError(
      `git ${unterbefehl} steht nicht in der Erlaubnisliste. Dieses Skript liest nur — ` +
        `erlaubt sind: ${NUR_LESEND.join(', ')}.`,
    )
  }
  const r = spawnSync('git', [unterbefehl, ...argumente], { cwd: wo, encoding: 'utf8', timeout: 20_000 })
  if (r.status !== 0) return undefined
  return (r.stdout ?? '').trim()
}

/**
 * Liest die Lage — alles gelesen, nichts verändert.
 *
 * @param {string} wo - das Verzeichnis
 * @returns {{zweig: string, commits: string, sauber: boolean, aenderungen: number, fern: string | undefined, letzterCommit: string, etiketten: readonly string[], istRepo: boolean}}
 */
export function leseLage(wo) {
  const zweig = gitLesen('branch', ['--show-current'], wo)
  if (zweig === undefined || zweig === '') {
    return {
      zweig: '(kein Zweig — abgetrennter Kopf oder kein Repository)',
      commits: '?',
      sauber: false,
      aenderungen: 0,
      fern: undefined,
      letzterCommit: '?',
      etiketten: [],
      istRepo: false,
    }
  }
  const status = gitLesen('status', ['--porcelain'], wo) ?? ''
  const zeilen = status === '' ? [] : status.split('\n')
  return {
    zweig,
    commits: gitLesen('rev-list', ['--count', 'HEAD'], wo) ?? '?',
    sauber: zeilen.length === 0,
    aenderungen: zeilen.length,
    fern: gitLesen('remote', ['get-url', 'origin'], wo),
    letzterCommit: gitLesen('log', ['-1', '--format=%h %s'], wo) ?? '?',
    etiketten: (gitLesen('tag', ['--list'], wo) ?? '').split('\n').filter((z) => z !== ''),
    istRepo: true,
  }
}

/**
 * Der Kopf der Anleitung — mit den echten Werten dieses Repositorys.
 *
 * @param {ReturnType<typeof leseLage>} lage - die gelesene Lage
 * @returns {string[]} die Zeilen
 */
export function lageText(lage) {
  return [
    'AUSGANGSLAGE',
    `  Zweig          ${lage.zweig}`,
    `  Commits        ${lage.commits}`,
    `  letzter Commit ${lage.letzterCommit}`,
    `  Arbeitsbaum    ${lage.sauber ? 'sauber' : `${String(lage.aenderungen)} Änderung(en) — NICHT sauber`}`,
    `  Fern           ${lage.fern ?? '(kein origin)'}`,
    `  Etiketten      ${lage.etiketten.length === 0 ? '(keine)' : lage.etiketten.join(', ')}`,
  ]
}

/**
 * Die Befehle für den Neuanfang — mit den echten Werten.
 *
 * @param {ReturnType<typeof leseLage>} lage - die gelesene Lage
 * @param {string} zweck - der Grund, für die Commit-Nachricht
 * @returns {string[]} die Zeilen
 */
export function befehle(lage, zweck) {
  const neu = `${lage.zweig}-neu`
  const alt = `alt-${lage.zweig}`
  return [
    '# 0. Nichts tun, solange der Arbeitsbaum nicht sauber ist.',
    lage.sauber
      ? '#    (Er ist sauber — weiter.)'
      : '#    ERST committen oder wegräumen, sonst geht eine Änderung verloren.',
    '',
    '# 1. Den alten Verlauf FESTHALTEN, bevor irgendetwas geschieht.',
    `git tag ${alt} ${lage.zweig}`,
    `git push origin ${alt}          # auch auf den Server, sonst ist er dort weg`,
    '',
    '# 2. Neuer Zweig ohne Vorgeschichte, mit dem heutigen Stand als EINEM Commit.',
    `git switch --orphan ${neu}`,
    'git add -A',
    `git commit -m ${JSON.stringify(`Neuanfang: ${zweck}`)}`,
    '',
    '# 3. Prüfen, BEVOR übertragen wird.',
    `git rev-list --count ${neu}            # erwartet: 1`,
    `git diff --stat ${lage.zweig} ${neu}   # erwartet: keine Ausgabe (derselbe Inhalt)`,
    '',
    '# 4. Übertragen — erst als eigener Zweig, nicht gleich über den alten.',
    `git push origin ${neu}`,
    '',
    '# 5. ERST wenn Schritt 3 gestimmt hat: den neuen Zweig zum Standard machen.',
    '#    --force-with-lease bricht ab, wenn jemand anders inzwischen übertragen hat;',
    '#    --force täte es nicht. Der Unterschied ist der ganze Punkt.',
    `git push --force-with-lease origin ${neu}:${lage.zweig}`,
    '',
    '# 6. Aufräumen ist eine ENTSCHEIDUNG, kein Schritt:',
    `#    - ${alt} behalten = der alte Verlauf bleibt auffindbar (empfohlen)`,
    `#    - ${alt} löschen  = der alte Verlauf liegt danach nur noch im Cache des`,
    '#                        Anbieters, bis der ihn wegräumt (GitHub: Kontakt nötig)',
    `git switch ${lage.zweig}`,
    `git branch -D ${neu}`,
  ]
}

/**
 * Führt einen Befehl aus.
 *
 * @param {readonly string[]} argv - die Argumente ohne `node` und Skriptpfad
 * @param {Readonly<Record<string, string | undefined>>} umgebung - Umgebungsvariablen
 * @param {(text: string) => void} schreibe - Ausgabe
 * @returns {number} der Exit-Code
 */
export function fuehreAus(
  argv,
  umgebung = process.env,
  schreibe = (t) => process.stdout.write(t),
) {
  const wo = umgebung.PMH_VERZEICHNIS?.trim() ?? process.cwd()
  const befehl = argv[0]

  if (befehl === undefined || !['lage', 'anleitung'].includes(befehl)) {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/history-reset.mjs lage                          (nur lesen)\n' +
        '  bun scripts/history-reset.mjs anleitung "Grund des Neuanfangs"\n' +
        '\n' +
        '  Dieses Skript FASST DEN VERLAUF NICHT AN. Es liest den Zustand und gibt\n' +
        '  die Befehle aus. Ein „Reset", der den Verlauf umschreibt, ist nicht\n' +
        '  rückgängig zu machen — und einer, der behauptet, den Verlauf nicht\n' +
        '  anzufassen, während er es doch tut, täuscht Sicherheit vor.\n',
    )
    return 1
  }

  const lage = leseLage(wo)
  if (!lage.istRepo) {
    schreibe(`FEHLER: in ${wo} liegt kein git-Repository (oder kein Zweig ausgecheckt).\n`)
    return 1
  }

  if (befehl === 'lage') {
    for (const zeile of lageText(lage)) schreibe(`${zeile}\n`)
    return 0
  }

  const zweck = argv[1]?.trim() ?? ''
  if (zweck === '') {
    schreibe('FEHLER: die Anleitung braucht einen Grund, z. B. "Verlauf neu anfangen".\n')
    return 1
  }
  schreibe('NEUANFANG MIT ORPHAN-ZWEIG — der Verlauf wird NICHT umgeschrieben\n\n')
  for (const zeile of lageText(lage)) schreibe(`${zeile}\n`)
  schreibe('\n')
  for (const zeile of befehle(lage, zweck)) schreibe(`${zeile}\n`)
  schreibe(
    '\nWAS DIESES SKRIPT GETAN HAT: nichts. Es hat gelesen und gedruckt.\n' +
      'Und was der Neuanfang nicht leistet: der alte Verlauf ist danach NICHT weg —\n' +
      `er liegt im Etikett alt-${lage.zweig} und, bis jemand ihn dort entfernt, auch auf\n` +
      'dem Server. Wer das anders darstellt, täuscht Sicherheit vor.\n',
  )
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('history-reset.mjs')) {
  process.exitCode = fuehreAus(process.argv.slice(2))
}
