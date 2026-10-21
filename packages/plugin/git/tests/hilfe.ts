/**
 * Die Testhilfen: eine Ausführung, die wirklich `git` startet — oder nur mitschreibt.
 *
 * ## Warum eine Attrappe statt des Host-Dienstes
 *
 * `Ausfuehrung` ist die Naht, über die dieses Paket Prozesse startet. Zwei Betriebsarten:
 *
 * | Art | Was sie tut | Wofür |
 * |---|---|---|
 * | `echt` | führt `git` mit denselben Argumenten aus | beweist Parser und Runner gegen ein echtes Repository |
 * | `still` | antwortet mit Exit 0 und erfundener Ausgabe | prüft, **welche** Argumente gebaut werden |
 *
 * @module @prometheus-harness/git/tests/hilfe
 */

import type { Ausfuehrung, GitLauf } from '../src/repo.ts'

/** Ein aufgezeichneter Aufruf. */
export interface Aufruf {
  /** Programm und Argumente. */
  readonly argv: readonly string[]
  /** Das Arbeitsverzeichnis. */
  readonly cwd: string
  /** Die Frist in Millisekunden. */
  readonly fristMs: number
}

/** Eine Ausführung für Tests. */
export class AttrappenAusfuehrung implements Ausfuehrung {
  /** Alle Aufrufe in Reihenfolge. */
  readonly aufrufe: Aufruf[] = []

  /**
   * @param art - `echt` führt git aus, `still` antwortet leer
   * @param antwort - bei `still` die erfundene Ausgabe je Aufruf (Reihenfolge)
   */
  constructor(
    private readonly art: 'echt' | 'still',
    private readonly antwort: readonly { readonly aus: string; readonly exit?: number }[] = [],
  ) {}

  /**
   * Führt den Befehl aus oder erfindet die Antwort.
   *
   * @param argv - Programm und Argumente
   * @param cwd - das Arbeitsverzeichnis
   * @param optionen - Frist und Obergrenze
   * @returns das Ergebnis
   */
  async lauf(
    argv: readonly string[],
    cwd: string,
    optionen: { readonly maxBytes: number; readonly fristMs: number; readonly signal?: AbortSignal },
  ): Promise<GitLauf> {
    this.aufrufe.push({ argv, cwd, fristMs: optionen.fristMs })

    if (this.art === 'still') {
      const erfunden = this.antwort[this.aufrufe.length - 1]
      return {
        exit: erfunden?.exit ?? 0,
        aus: erfunden?.aus ?? '',
        fehler: '',
        abgeschnitten: false,
      }
    }

    const ergebnis = Bun.spawnSync({
      cmd: [...argv],
      cwd,
      env: { ...(process.env as Record<string, string>), GIT_TERMINAL_PROMPT: '0' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    return {
      exit: ergebnis.exitCode,
      aus: new TextDecoder().decode(ergebnis.stdout),
      fehler: new TextDecoder().decode(ergebnis.stderr),
      abgeschnitten: false,
    }
  }
}
