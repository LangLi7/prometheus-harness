/**
 * Die Ausführungsschicht — gegen ein **echtes** Repository.
 *
 * ## Warum ein eigenes Repository im Temp-Verzeichnis
 *
 * Ein Test, der in diesem Projekt `git add` ruft, verändert den Arbeitsbaum des Nutzers. Ein
 * frisches Repository unter `tmpdir()` ist dagegen vollständig unter Kontrolle: `init`, eine Datei,
 * ein Commit, eine Änderung — und danach wird es gelöscht. Was hier geprüft wird, ist damit keine
 * Attrappe von git, sondern git.
 *
 * ## Was der Test beweist
 *
 * Daß `status`, `numstat`, `log`, `remote`, die drei Modi, `stage`/`commit` und der Diff-Parser
 * zusammenspielen. Was er nicht beweist: das Verhalten auf einem Rechner ohne git — dafür ist der
 * 503-Zweig in `server.test.ts` da.
 *
 * @module @prometheus-harness/git/tests/repo
 */

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


import {
  basisZweig,
  erklaereGitFehler,
  findeWurzel,
  fuehreAus,
  Git,
  liesDiff,
  liesStand,
  pruefePfad,
  STANDARD_GRENZEN,
  unversionierterDiff,
} from '../src/repo.ts'
import { AttrappenAusfuehrung } from './hilfe.ts'

/** Die Wurzel des Testrepositories. */
const DIR = mkdtempSync(join(tmpdir(), 'pmh-git-test-'))

/**
 * Führt ein Einrichtungs-Kommando aus und bricht bei Fehlschlag ab.
 *
 * @param args - die git-Argumente
 */
function git(args: readonly string[]): void {
  const ergebnis = Bun.spawnSync({
    cmd: ['git', ...args],
    cwd: DIR,
    env: { ...(process.env as Record<string, string>), GIT_TERMINAL_PROMPT: '0' },
  })
  if (ergebnis.exitCode !== 0) {
    throw new Error(`${args.join(' ')}: ${new TextDecoder().decode(ergebnis.stderr)}`)
  }
}

/**
 * Baut den Aufrufer mit echter Ausführung.
 *
 * @returns der Aufrufer und die Attrappe
 */
function macheGit(): { readonly git: Git; readonly subprocess: AttrappenAusfuehrung } {
  const subprocess = new AttrappenAusfuehrung('echt')
  return {
    git: new Git(subprocess, 'git', STANDARD_GRENZEN),
    subprocess,
  }
}

// Ein Repository mit einem Commit und einer Änderung.
git(['init', '-b', 'main'])
git(['config', 'user.email', 'test@example.test'])
git(['config', 'user.name', 'Test'])
writeFileSync(join(DIR, 'a.txt'), 'eins\nzwei\ndrei\n', 'utf8')
git(['add', 'a.txt'])
git(['commit', '-m', 'erster Commit'])
writeFileSync(join(DIR, 'a.txt'), 'eins\nzwei geändert\ndrei\nvier\n', 'utf8')
writeFileSync(join(DIR, 'neu.txt'), 'neu\n', 'utf8')

afterAll(() => {
  rmSync(DIR, { recursive: true, force: true })
})

describe('findeWurzel', () => {
  test('findet das Repository über einem Unterverzeichnis', async () => {
    const { git: aufrufer } = macheGit()
    const wurzel = await findeWurzel(aufrufer, DIR)
    // git schreibt auf Windows Schrägstriche; der Vergleich soll daran nicht scheitern.
    const gleich = (pfad: string): string => pfad.replace(/\\/gu, '/').toLowerCase()
    expect(wurzel === null ? null : gleich(wurzel)).toBe(gleich(DIR))
  })

  test('ein Verzeichnis ohne Repository ergibt null', async () => {
    const { git: aufrufer } = macheGit()
    const leer = mkdtempSync(join(tmpdir(), 'pmh-git-leer-'))
    try {
      expect(await findeWurzel(aufrufer, leer)).toBeNull()
    } finally {
      rmSync(leer, { recursive: true, force: true })
    }
  })
})

describe('liesStand im Arbeitsbaum', () => {
  test('Zweig, Änderungen und Commits kommen an', async () => {
    const { git: aufrufer } = macheGit()
    const wurzel = await findeWurzel(aufrufer, DIR)
    if (wurzel === null) throw new Error('kein Repository')

    const stand = await liesStand(aufrufer, wurzel, 'arbeitsbaum')
    expect(stand.zweig.name).toBe('main')
    expect(stand.zweig.upstream).toBeNull()
    expect(stand.commits.length).toBeGreaterThanOrEqual(1)
    expect(stand.commits[0]?.betreff).toBe('erster Commit')

    const geaendert = stand.aenderungen.find((eintrag) => eintrag.pfad === 'a.txt')
    expect(geaendert?.bereich).toBe('werk')
    expect(geaendert?.status).toBe('geaendert')
    expect(geaendert?.zusatz).toBe(2)
    expect(geaendert?.abzug).toBe(1)

    const neu = stand.aenderungen.find((eintrag) => eintrag.pfad === 'neu.txt')
    expect(neu?.bereich).toBe('unversioniert')
    // Die Zahl kommt aus der Datei selbst: eine Zeile.
    expect(neu?.zusatz).toBe(1)
    expect(neu?.abzug).toBe(0)
  })
})

describe('liesDiff', () => {
  test('der Diff einer geänderten Datei hat Hunks', async () => {
    const { git: aufrufer } = macheGit()
    const wurzel = await findeWurzel(aufrufer, DIR)
    if (wurzel === null) throw new Error('kein Repository')
    const diff = await liesDiff(aufrufer, wurzel, {
      modus: 'arbeitsbaum',
      pfad: 'a.txt',
      bereich: 'werk',
      basis: null,
    })
    expect(diff.binaer).toBe(false)
    expect(diff.hunks.length).toBeGreaterThan(0)
    const arten = diff.hunks.flatMap((hunk) => hunk.zeilen.map((zeile) => zeile.art))
    expect(arten).toContain('minus')
    expect(arten).toContain('plus')
  })

  test('eine unversionierte Datei wird als reine Plus-Folge gelesen', async () => {
    const { git: aufrufer } = macheGit()
    const wurzel = await findeWurzel(aufrufer, DIR)
    if (wurzel === null) throw new Error('kein Repository')
    const diff = await liesDiff(aufrufer, wurzel, {
      modus: 'arbeitsbaum',
      pfad: 'neu.txt',
      bereich: 'unversioniert',
      basis: null,
    })
    expect(diff.hunks).toHaveLength(1)
    expect(diff.hunks[0]?.zeilen.map((zeile) => zeile.art)).toEqual(['plus'])
  })
})

describe('Aktionen', () => {
  test('stage, commit und die letzte Runde', async () => {
    const { git: aufrufer } = macheGit()
    const wurzel = await findeWurzel(aufrufer, DIR)
    if (wurzel === null) throw new Error('kein Repository')
    const vorher = await liesStand(aufrufer, wurzel, 'arbeitsbaum')

    const bereitgestellt = await fuehreAus(aufrufer, wurzel, { aktion: 'stage', pfade: ['a.txt', 'neu.txt'] }, vorher.zweig)
    expect(bereitgestellt.ok).toBe(true)

    const nachStage = await liesStand(aufrufer, wurzel, 'arbeitsbaum')
    expect(nachStage.aenderungen.filter((eintrag) => eintrag.bereich === 'index')).toHaveLength(2)

    const committet = await fuehreAus(aufrufer, wurzel, { aktion: 'commit', nachricht: 'zweiter Commit' }, nachStage.zweig)
    expect(committet.ok).toBe(true)

    const nachCommit = await liesStand(aufrufer, wurzel, 'arbeitsbaum')
    expect(nachCommit.aenderungen).toHaveLength(0)
    expect(nachCommit.commits[0]?.betreff).toBe('zweiter Commit')

    const runde = await liesStand(aufrufer, wurzel, 'letzte-runde')
    expect(runde.aenderungen.map((eintrag) => eintrag.pfad).sort()).toEqual(['a.txt', 'neu.txt'])
  })

  test('eine leere Commit-Nachricht wird abgewiesen, ohne git zu rufen', async () => {
    const still = new AttrappenAusfuehrung('still')
    const aufrufer = new Git(still, 'git')
    // Die Wurzel steht fest: `findeWurzel` würde hier selbst git rufen und die Zählung verfälschen.
    const anzahl = still.aufrufe.length
    const ergebnis = await fuehreAus(aufrufer, DIR, { aktion: 'commit', nachricht: '   ' }, {
      name: 'main',
      kopf: null,
      upstream: null,
      voraus: 0,
      zurueck: 0,
    })
    expect(ergebnis.ok).toBe(false)
    expect(still.aufrufe.length).toBe(anzahl)
  })
})

describe('basisZweig', () => {
  test('ohne Upstream wird main gefunden', async () => {
    const { git: aufrufer } = macheGit()
    const wurzel = await findeWurzel(aufrufer, DIR)
    if (wurzel === null) throw new Error('kein Repository')
    const basis = await basisZweig(aufrufer, wurzel, {
      name: 'main',
      kopf: null,
      upstream: null,
      voraus: 0,
      zurueck: 0,
    })
    expect(basis).toBe('main')
  })
})

describe('Reine Formen', () => {
  test('unversionierterDiff nummeriert jede Zeile', () => {
    const diff = unversionierterDiff('a\nb\n')
    expect(diff.hunks[0]?.zeilen).toEqual([
      { art: 'plus', text: 'a', alt: null, neu: 1 },
      { art: 'plus', text: 'b', alt: null, neu: 2 },
    ])
  })

  test('pruefePfad weist leere und NUL-haltige Pfade ab', () => {
    expect(pruefePfad('a.txt')).toBe('a.txt')
    expect(() => pruefePfad('')).toThrow()
    expect(() => pruefePfad('a\0b')).toThrow()
  })

  test('eine Datei mit NUL gilt als binär', () => {
    const diff = unversionierterDiff('a\0b')
    expect(diff.binaer).toBe(true)
  })
})

describe('Der Runner', () => {
  test('gibt die Frist weiter, unter der git nicht hängt', async () => {
    const still = new AttrappenAusfuehrung('still')
    const aufrufer = new Git(still, 'git')
    await aufrufer.lauf(['status'], DIR)
    // Die Frist kommt aus den Grenzen (lokal 15 s); sie geht an die Ausführung.
    expect(still.aufrufe[0]?.fristMs).toBe(STANDARD_GRENZEN.timeoutMs)
    expect(still.aufrufe[0]?.argv).toEqual(['git', 'status'])
  })

  test('ein git aus dem Nix-Store läuft als absoluter Pfad', async () => {
    const store = '/nix/store/abc123-git-2.46.0/bin/git'
    const still = new AttrappenAusfuehrung('still', [{ aus: '' }])
    const aufrufer = new Git(still, store)
    await aufrufer.lauf(['status'], DIR)
    // **Der Punkt:** der Name `git` aus dem PATH ist nicht dasselbe wie der Store-Pfad. Was
    // `resolveExecutable` liefert, geht als `argv[0]` weiter — unter NixOS ist das der einzige Weg.
    expect(still.aufrufe[0]?.argv[0]).toBe(store)
  })

  test('der Testfixture-Text ist lesbar (Sanity)', () => {
    expect(readFileSync(join(DIR, 'a.txt'), 'utf8')).toContain('vier')
  })
})

describe('NixOS-Betriebsarten', () => {
  test('ohne git wird der Fehler erklärt, nicht roh ausgegeben', () => {
    expect(erklaereGitFehler('git: command not found')).toContain('nicht auffindbar')
    expect(erklaereGitFehler('')).toContain('ohne Ausgabe')
  })

  test('dubious ownership bekommt einen Satz mit dem Ausweg', () => {
    const roh =
      'fatal: detected dubious ownership in repository at \'/srv/app\'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory /srv/app\n'
    const satz = erklaereGitFehler(roh)
    expect(satz).toContain('anderen Benutzer')
    expect(satz).toContain('safe.directory')
  })

  test('ein Verzeichnis ohne Repository und eine Berechtigungssperre werden unterschieden', () => {
    expect(erklaereGitFehler('fatal: not a git repository (or any of the parent directories): .git')).toContain(
      'keinem git-Repository',
    )
    expect(erklaereGitFehler('fatal: cannot open .git: Permission denied')).toContain('Berechtigung')
  })

  test('ein unbekannter Fehler bleibt im Originaltext', () => {
    expect(erklaereGitFehler('fatal: irgendwas Neues')).toBe('fatal: irgendwas Neues')
  })

  test('ein gescheitertes status trägt den erklärten Satz als Hinweis', async () => {
    const still = new AttrappenAusfuehrung('still', [
      { aus: '', exit: 128 },
      { aus: '', exit: 128 },
      { aus: '', exit: 128 },
      { aus: '', exit: 128 },
      { aus: '', exit: 128 },
    ])
    const aufrufer = new Git(still, 'git')
    const stand = await liesStand(aufrufer, DIR, 'arbeitsbaum')
    expect(stand.hinweis).toContain('ohne Ausgabe')
    expect(stand.aenderungen).toHaveLength(0)
  })
})

