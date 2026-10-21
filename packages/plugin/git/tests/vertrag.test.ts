/**
 * Der Vertrag — Parser gegen echte Formen.
 *
 * Die Texte hier sind **gemessen**, nicht erfunden: die Struktur von `status --porcelain=v2 -z`
 * wurde am 21.10.2026 aus diesem Repository gelesen (jede `#`-Zeile ein eigenes NUL-Feld). Was der
 * Test nicht kann: beweisen, daß git auf jedem Rechner dasselbe schreibt — dafür gibt es den
 * Integrationstest in `repo.test.ts`.
 *
 * @module @prometheus-harness/git/tests/vertrag
 */

import { describe, expect, test } from 'bun:test'

import {
  anbieterAusHost,
  anzeigePfad,
  eineZeile,
  erkenneRemote,
  parseDiff,
  parseLog,
  parseNameStatus,
  parseNumstat,
  parseRemotes,
  parseStatus,
  zaehleZeilen,
} from '../src/vertrag.ts'

/**
 * Baut eine `--porcelain=v2 -z`-Ausgabe.
 *
 * @param felder - die Felder in Reihenfolge
 * @returns der Text mit NUL-Trennern
 */
function nuls(...felder: string[]): string {
  return felder.join('\0')
}

describe('status --porcelain=v2 lesen', () => {
  test('liest Zweig, Upstream, Abstand und die vier Dateiarten', () => {
    const text = nuls(
      '# branch.oid aaa111',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 aaa bbb src/a.ts',
      '1 M. N... 100644 100644 100644 aaa bbb src/b.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 src/neu.ts',
      'src/alt.ts',
      '? src/c.ts',
    )
    const { zweig, aenderungen } = parseStatus(text)
    expect(zweig).toEqual({
      name: 'feature/x',
      kopf: 'aaa111',
      upstream: 'origin/feature/x',
      voraus: 2,
      zurueck: 1,
    })
    expect(aenderungen).toHaveLength(4)

    const a = aenderungen.find((eintrag) => eintrag.pfad === 'src/a.ts')
    expect(a?.bereich).toBe('werk')
    expect(a?.status).toBe('geaendert')

    const b = aenderungen.find((eintrag) => eintrag.pfad === 'src/b.ts')
    expect(b?.bereich).toBe('index')

    const neu = aenderungen.find((eintrag) => eintrag.pfad === 'src/neu.ts')
    expect(neu?.status).toBe('umbenannt')
    expect(neu?.altpfad).toBe('src/alt.ts')

    const c = aenderungen.find((eintrag) => eintrag.pfad === 'src/c.ts')
    expect(c?.bereich).toBe('unversioniert')
  })

  test('liest auch mehrere Kopfzeilen in einem NUL-Feld', () => {
    // Manche git-Versionen fassen die `#`-Zeilen zusammen. Der Parser darf daran nicht scheitern.
    const text = nuls(
      '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -3',
      '1 .M N... 100644 100644 100644 aaa bbb x.ts',
    )
    const { zweig, aenderungen } = parseStatus(text)
    expect(zweig.name).toBe('main')
    expect(zweig.upstream).toBe('origin/main')
    expect(zweig.zurueck).toBe(3)
    expect(aenderungen).toHaveLength(1)
  })

  test('nimmt die Zahlen aus numstat, wenn sie da sind', () => {
    const zahlen = parseNumstat(nuls('3\t1\tsrc/a.ts', ''))
    const { aenderungen } = parseStatus(nuls('1 .M N... 100644 100644 100644 aaa bbb src/a.ts'), zahlen)
    expect(aenderungen[0]?.zusatz).toBe(3)
    expect(aenderungen[0]?.abzug).toBe(1)
    expect(aenderungen[0]?.binaer).toBe(false)
  })

  test('ein losgelöster HEAD hat keinen Zweignamen', () => {
    const { zweig } = parseStatus(nuls('# branch.head (detached)'))
    expect(zweig.name).toBeNull()
  })
})

describe('numstat lesen', () => {
  test('normale Zeile', () => {
    const karte = parseNumstat(nuls('12\t3\tsrc/a.ts', ''))
    expect(karte.get('src/a.ts')).toEqual({ zusatz: 12, abzug: 3, binaer: false })
  })

  test('Umbenennung: der neue Pfad trägt die Zahlen', () => {
    // Format mit -z: `zusatz TAB abzug TAB NUL alt NUL neu NUL`
    const karte = parseNumstat(nuls('5\t0\t', 'src/alt.ts', 'src/neu.ts', ''))
    expect(karte.get('src/neu.ts')).toEqual({ zusatz: 5, abzug: 0, binaer: false })
    expect(karte.has('src/alt.ts')).toBe(false)
  })

  test('binär: keine Zahlen, aber die Marke', () => {
    const karte = parseNumstat(nuls('-\t-\tbild.png', ''))
    expect(karte.get('bild.png')).toEqual({ zusatz: null, abzug: null, binaer: true })
  })

  test('ein Pfad mit Leerzeichen bleibt ganz', () => {
    const karte = parseNumstat(nuls('1\t1\tordner/mit leerzeichen.ts', ''))
    expect(karte.has('ordner/mit leerzeichen.ts')).toBe(true)
  })
})

describe('name-status lesen', () => {
  test('A, M, D und R in einem Lauf', () => {
    const text = nuls('A', 'neu.ts', 'M', 'geaendert.ts', 'D', 'weg.ts', 'R100', 'alt.ts', 'umbenannt.ts', '')
    const aenderungen = parseNameStatus(text, 'zweig')
    expect(aenderungen).toHaveLength(4)
    expect(aenderungen[0]?.status).toBe('hinzugefuegt')
    expect(aenderungen[1]?.status).toBe('geaendert')
    expect(aenderungen[2]?.status).toBe('geloescht')
    expect(aenderungen[3]?.status).toBe('umbenannt')
    expect(aenderungen[3]?.altpfad).toBe('alt.ts')
    expect(aenderungen.every((eintrag) => eintrag.bereich === 'zweig')).toBe(true)
  })
})

describe('Diff lesen', () => {
  test('Hunks mit fortgeschriebenen Zeilennummern', () => {
    const text = [
      'diff --git a/x b/x',
      'index 111..222 100644',
      '--- a/x',
      '+++ b/x',
      '@@ -1,3 +1,4 @@',
      ' a',
      '-b',
      '+B1',
      '+B2',
      ' c',
    ].join('\n')
    const diff = parseDiff(text)
    expect(diff.binaer).toBe(false)
    expect(diff.hunks).toHaveLength(1)
    const zeilen = diff.hunks[0]?.zeilen ?? []
    expect(zeilen.map((zeile) => zeile.art)).toEqual(['kontext', 'minus', 'plus', 'plus', 'kontext'])
    expect(zeilen[0]).toMatchObject({ alt: 1, neu: 1, text: 'a' })
    expect(zeilen[1]).toMatchObject({ alt: 2, neu: null, text: 'b' })
    expect(zeilen[2]).toMatchObject({ alt: null, neu: 2, text: 'B1' })
    expect(zeilen[4]).toMatchObject({ alt: 3, neu: 4, text: 'c' })
  })

  test('binär wird gemeldet, nicht geparst', () => {
    const diff = parseDiff('Binary files a/bild.png and b/bild.png differ\n')
    expect(diff.binaer).toBe(true)
    expect(diff.hunks).toHaveLength(0)
  })

  test('die Grenze meldet Kürzung', () => {
    const text = ['@@ -1,2 +1,2 @@', ' a', ' b', ' c'].join('\n')
    const diff = parseDiff(text, 2)
    expect(diff.abgeschnitten).toBe(true)
  })
})

describe('Remotes erkennen', () => {
  test('GitHub über SSH', () => {
    const remote = erkenneRemote('origin', 'git@github.com:eigner/repo.git')
    expect(remote.host).toBe('github.com')
    expect(remote.anbieter).toBe('github')
    expect(remote.eigner).toBe('eigner')
    expect(remote.repo).toBe('repo')
    expect(remote.webUrl).toBe('https://github.com/eigner/repo')
  })

  test('GitLab mit Untergruppe', () => {
    const remote = erkenneRemote('origin', 'https://gitlab.com/gruppe/unter/repo.git')
    expect(remote.anbieter).toBe('gitlab')
    expect(remote.eigner).toBe('gruppe/unter')
    expect(remote.repo).toBe('repo')
  })

  test('SSH mit Port', () => {
    const remote = erkenneRemote('origin', 'ssh://git@git.example.com:2222/team/repo.git')
    expect(remote.host).toBe('git.example.com')
    expect(remote.anbieter).toBe('unbekannt')
    expect(remote.eigner).toBe('team')
    expect(remote.webUrl).toBe('https://git.example.com/team/repo')
  })

  test('Codeberg ist Forgejo', () => {
    expect(erkenneRemote('origin', 'https://codeberg.org/x/y').anbieter).toBe('forgejo')
  })

  test('ein selbstgehostetes Gitea wird am Namen erkannt', () => {
    expect(erkenneRemote('origin', 'https://gitea.firma.de/team/repo').anbieter).toBe('gitea')
  })

  test('ein lokaler Pfad hat keine Weboberfläche', () => {
    const remote = erkenneRemote('origin', '/srv/repo.git')
    expect(remote.host).toBe('')
    expect(remote.anbieter).toBe('unbekannt')
    expect(remote.webUrl).toBeNull()
  })

  test('remote -v wird entdoppelt', () => {
    const text = [
      'origin\tgit@github.com:a/b.git (fetch)',
      'origin\tgit@github.com:a/b.git (push)',
      'upstream\thttps://gitlab.com/c/d.git (fetch)',
      'upstream\thttps://gitlab.com/c/d.git (push)',
    ].join('\n')
    const remotes = parseRemotes(text)
    expect(remotes).toHaveLength(2)
    expect(remotes[0]?.anbieter).toBe('github')
    expect(remotes[1]?.anbieter).toBe('gitlab')
  })

  test('Hostnamen ohne Anbieter bleiben unbekannt', () => {
    expect(anbieterAusHost('git.intern.example')).toBe('unbekannt')
  })
})

describe('Kleine Formen', () => {
  test('log: fünf Felder je Zeile', () => {
    const text = 'abc\u001fvoll1\u001fAda\u001f2026-10-21T10:00:00+02:00\u001fErster Commit\n'
    const commits = parseLog(text)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'abc',
      voll: 'voll1',
      autor: 'Ada',
      zeit: '2026-10-21T10:00:00+02:00',
      betreff: 'Erster Commit',
    })
  })

  test('Zeilen zählen', () => {
    expect(zaehleZeilen('')).toBe(0)
    expect(zaehleZeilen('a')).toBe(1)
    expect(zaehleZeilen('a\n')).toBe(1)
    expect(zaehleZeilen('a\nb')).toBe(2)
  })

  test('Anzeigepfade bekommen Schrägstriche', () => {
    expect(anzeigePfad('src\\a\\b.ts')).toBe('src/a/b.ts')
  })

  test('eine Commit-Zeile wird gekürzt', () => {
    expect(eineZeile('a\nb')).toBe('a')
    expect(eineZeile('x'.repeat(100), 10)).toHaveLength(10)
  })
})
