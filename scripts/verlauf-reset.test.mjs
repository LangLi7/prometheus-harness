/**
 * `scripts/verlauf-reset.mjs` — die Prüfung, und der wichtigste Fall ist:
 * **es tut nichts**.
 *
 * ## Warum diese Prüfdatei existiert
 *
 * E1 verlangt ein Skript, das den Orphan-Branch-Weg **ausgibt**, statt die Historie
 * anzufassen. Ein Skript, das *behauptet*, den Verlauf nicht anzufassen, und es
 * doch tut, wäre schlimmer als keines: es täuscht Sicherheit vor.
 *
 * Deshalb wird hier nicht die Absicht geprüft, sondern die **Wirkung**:
 *
 * 1. **Die Erlaubnisliste greift** — ein schreibender git-Befehl wird abgewiesen,
 *    *bevor* er `git` erreicht.
 * 2. **Nach dem Lauf ist das Repository unverändert** — Kopf, Commit-Zahl und
 *    Etiketten vorher und nachher verglichen.
 * 3. Die Befehle, die ausgegeben werden, enthalten **keinen** Verlauf-umschreibenden
 *    Befehl und **sagen**, was ein Neuanfang nicht leistet.
 *
 * ## Was diese Datei nicht prüft
 *
 * Ob die **ausgegebenen** Befehle beim Ausführen wirklich funktionieren. Das wäre
 * ein zweites Repository und ein zweiter Remote — dafür ist der Aufruf in
 * `docs/status/verlauf-reset.md` beschrieben, und er gehört in die Hand eines
 * Menschen, nicht in eine Prüfung, die beim Scheitern den echten Verlauf trifft.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NichtLesendError, befehle, fuehreAus, gitLesen, leseLage } from './verlauf-reset.mjs'

const hier = process.cwd()

/** Fängt die Ausgabe eines Aufrufs ein. */
function fange(argumente, umgebung) {
  const aus = []
  const code = fuehreAus(argumente, umgebung ?? { ...process.env, PMH_VERZEICHNIS: hier }, (t) => aus.push(t))
  return { code, text: aus.join('') }
}

/** Der Zustand des Repositorys, so wie ein Außenstehender ihn sieht. */
function zustand() {
  return {
    kopf: gitLesen('rev-parse', ['HEAD'], hier),
    commits: gitLesen('rev-list', ['--count', 'HEAD'], hier),
    etiketten: gitLesen('tag', ['--list'], hier),
  }
}

describe('Die Erlaubnisliste — das Skript KANN den Verlauf nicht anfassen', () => {
  test('schreibende Unterbefehle werden abgewiesen, bevor git sie sieht', () => {
    // **Der Kern dieses Entwurfs.** Eine Zusicherung, die nur in einem Kommentar
    // steht, ist keine; eine Erlaubnisliste ist eine, weil sie vollständig ist.
    for (const verboten of ['commit', 'push', 'reset', 'checkout', 'filter-branch', 'rebase', 'branch -D', 'gc']) {
      expect(() => gitLesen(verboten, [], hier)).toThrow(NichtLesendError)
    }
  })

  test('die Abweisung nennt die Erlaubnisliste', () => {
    const fehler = (() => {
      try {
        gitLesen('push', [], hier)
        return undefined
      } catch (e) {
        return e
      }
    })()
    expect(fehler).toBeInstanceOf(NichtLesendError)
    expect(fehler.message).toContain('rev-list')
    expect(fehler.message).toContain('liest nur')
  })

  test('lesende Unterbefehle gehen durch', () => {
    expect(gitLesen('branch', ['--show-current'], hier)).toBe('main')
    expect(Number(gitLesen('rev-list', ['--count', 'HEAD'], hier))).toBeGreaterThan(0)
  })
})

describe('Der Lauf verändert nichts', () => {
  test('nach `lage` und `anleitung` ist das Repository unverändert', () => {
    const vorher = zustand()
    expect(fange(['lage']).code).toBe(0)
    expect(fange(['anleitung', 'Prüfung: der Verlauf darf sich nicht ändern']).code).toBe(0)
    const nachher = zustand()
    // **Der Beweis ist der Vergleich, nicht die Absicht.** Kopf, Zahl der Commits
    // und Etiketten — ein Etikett würde der Orphan-Weg anlegen, und genau das darf
    // hier NICHT geschehen.
    expect(nachher).toEqual(vorher)
  })

  test('die Lage meldet Zweig, Commits und Fern', () => {
    const lage = leseLage(hier)
    expect(lage.istRepo).toBe(true)
    expect(lage.zweig).toBe('main')
    expect(Number(lage.commits)).toBeGreaterThan(0)
    expect(lage.fern).toContain('github.com')
  })

  test('ohne Repository gibt es Exit 1 — und keinen Absturz', () => {
    const leer = mkdtempSync(join(tmpdir(), 'pmh-kein-repo-'))
    try {
      const { code, text } = fange(['lage'], { ...process.env, PMH_VERZEICHNIS: leer })
      expect(code).toBe(1)
      expect(text).toContain('kein git-Repository')
      expect(text).not.toContain('Zweig  ')
    } finally {
      rmSync(leer, { recursive: true, force: true })
    }
  })

  test('ohne Befehl und ohne Grund gibt es Exit 1', () => {
    expect(fange([]).code).toBe(1)
    expect(fange(['anleitung']).code).toBe(1)
    expect(fange(['anleitung', '   ']).code).toBe(1)
  })
})

describe('Die ausgegebenen Befehle', () => {
  const lage = leseLage(hier)
  const zeilen = befehle(lage, 'Prüfung')
  const text = zeilen.join('\n')

  test('sie legen einen ORPHAN-Zweig an und halten den alten Verlauf fest', () => {
    expect(text).toContain('git switch --orphan main-neu')
    // **Zuerst festhalten, dann anfassen** — die Reihenfolge ist kein Zufall: wer
    // erst den neuen Zweig baut und dann merkt, daß er den alten braucht, hat ihn
    // womöglich schon nicht mehr.
    expect(zeilen.findIndex((z) => z.startsWith('git tag alt-main'))).toBeLessThan(
      zeilen.findIndex((z) => z.includes('switch --orphan')),
    )
    expect(text).toContain('git push origin alt-main')
  })

  test('sie enthalten KEINEN Verlauf umschreibenden Befehl', () => {
    for (const verboten of ['filter-branch', 'rebase', 'commit --amend', 'reflog delete', 'update-ref -d']) {
      expect(text).not.toContain(verboten)
    }
  })

  test('sie nehmen --force-with-lease und nicht --force', () => {
    // `--force-with-lease` bricht ab, wenn jemand anders inzwischen übertragen hat;
    // `--force` täte es nicht. Der Unterschied ist der ganze Punkt.
    //
    // **Geprüft werden die BEFEHLSZEILEN, nicht der ganze Text.** Der erste
    // Entwurf prüfte den ganzen Text und wurde rot — zu Recht: in der Erklärung
    // steht „--force täte es nicht", und das ist ein Satz, kein Befehl. Dieselbe
    // Lehre wie bei der Prüfung der Anmeldeseite: wer Code prüfen will, prüft Code.
    const befehlszeilen = zeilen.filter((z) => z.startsWith('git '))
    expect(befehlszeilen.length).toBeGreaterThan(0)
    expect(befehlszeilen.join('\n')).toContain('--force-with-lease')
    for (const zeile of befehlszeilen) {
      // Ein `--force` ohne `-with-lease` in einer Befehlszeile wäre der Fehler.
      expect(zeile).not.toMatch(/--force(?!-with-lease)/u)
    }
  })

  test('sie prüfen VOR dem Übertragen: genau ein Commit, gleicher Inhalt', () => {
    expect(text).toContain('git rev-list --count main-neu')
    expect(text).toContain('git diff --stat main main-neu')
    expect(text).toContain('erwartet: 1')
  })

  test('sie sagen, daß der alte Verlauf NICHT weg ist', () => {
    // **Die ehrliche Zeile.** Ein Neuanfang, der den Verlauf „löscht", tut das
    // nicht: die Objekte liegen weiter da, bis jemand sie entfernt.
    expect(text).toContain('Aufräumen ist eine ENTSCHEIDUNG')
    expect(text).toContain('Cache des')
  })

  test('der Schlußsatz sagt, was das Skript getan hat: nichts', () => {
    const { text: ausgabe } = fange(['anleitung', 'Prüfung'])
    expect(ausgabe).toContain('WAS DIESES SKRIPT GETAN HAT: nichts')
    expect(ausgabe).toContain('täuscht Sicherheit vor')
  })
})
