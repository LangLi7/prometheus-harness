/**
 * `@prometheus-harness/terminal-pty` — das Terminal über Buns eigenes PTY,
 * solange der Host unter Bun läuft und `node-pty` dort nicht funktioniert.
 *
 * ## Was dieses Paket tut — und was es ausdrücklich **nicht** tut
 *
 * Es hängt sich **zwischen** den Terminal-Controller und den Subprozess-Dienst:
 * jedes `ctx.subprocess.spawnTerminal(…)` wird auf {@link BunPtyTerminalHandle}
 * umgelenkt, statt an `node-pty` zu gehen. **Sonst nichts** — insbesondere wird
 * `spawn` (die normalen Befehle der Werkzeuge) nicht angefaßt, und auf Node gilt
 * weiterhin der Kern-Weg.
 *
 * Der Grund ist gemessen, nicht behauptet: dieselbe Sonde auf derselben Maschine
 * startet `cmd.exe` über `node-pty` unter **Node 24 mit Exit 0** und unter
 * **Bun 1.4 mit 16 Bytes und sofortigem Tod** (`0xC0000142`). Ein interaktives
 * Terminal kann so nie zustande kommen; der Betreiber sah „Prozess beendet
 * (-1073741502)". Buns eigenes PTY ist auf derselben Maschine grün — auch für
 * `wsl.exe -e bash` und Git-Bash.
 *
 * ## Warum der Austausch über eine Methode und nicht über einen zweiten Dienst
 *
 * `ctx.subprocess` ist ein **Dienst**, und Cordis wirft beim zweiten Anbieter
 * desselben Namens. Ein zweiter Dienst wäre also kein Austausch, sondern ein
 * Startfehler. Den Vertrag des Seams nachzubauen (also `spawn`, `collect`,
 * Spill-Dateien, Abbruchleitern …) wäre ein zweiter Subprozess-Dienst — viel
 * Fläche für einen Fehler, der nichts mit Terminals zu tun hat. Getauscht wird
 * deshalb **genau die eine Methode**, mit einem Aufräumer, der den Ursprung
 * zurückholt, wenn dieses Plugin abgehängt wird.
 *
 * ## Warum nur unter Bun auf Windows
 *
 * Unter Node ist der Kern-Weg nachweislich in Ordnung; ihn dort zu ersetzen,
 * brächte nur Risiko. Unter Linux ist `node-pty` ebenfalls nicht auffällig
 * geworden. Die Entscheidung steht in {@link waehleBackend} und ist eine
 * **Fähigkeitsprüfung** („gibt es Bun.spawn?") und keine Plattformabfrage — sie
 * ist damit prüfbar und schaltet sich selbst ab, wenn die Lage sich ändert.
 *
 * @module @prometheus-harness/terminal-pty
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  SubprocessRuntime,
  SubprocessTerminalHandle,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { BunPtyTerminalHandle } from './handle.ts'

/**
 * Der stabile Cordis-Plugin-Name.
 *
 * Er steht in der Patch-Zeile des Profils (`pmh-terminal-pty`, abgeleitet in
 * `scripts/profile-patch.mjs`) und in jeder Warnung des Loaders. Weicht beides
 * voneinander ab, sucht man den Fehler an der falschen Stelle.
 */
export const name = 'pmh-terminal-pty'

/**
 * Der Dienst, ohne den dieses Plugin nichts zu tauschen hat.
 *
 * Der Loader wartet damit, bis `ctx.subprocess` existiert — sonst liefe der
 * Austausch in einen `undefined`-Zugriff.
 */
export const inject = ['subprocess']

/** Welcher Weg die Terminals startet. */
export type TerminalBackend = 'bun-pty' | 'unveraendert'

/**
 * Prüft, ob Buns PTY hier benutzbar ist.
 *
 * **Warum nicht einfach `process.versions.bun`.** Die Frage ist nicht „läuft Bun",
 * sondern „gibt es `Bun.spawn`" — eine Fähigkeitsprüfung überlebt Fassungen, in
 * denen das Feld anders heißt, und sie ist im Test umschaltbar.
 *
 * @returns ob `Bun.spawn` vorhanden ist (plattformunabhängig geprüft)
 */
export function bunPtyMoeglich(): boolean {
  const bun = (globalThis as { Bun?: { spawn?: unknown } }).Bun
  return typeof bun?.spawn === 'function'
}

/**
 * Wählt das Backend für diese Laufzeit.
 *
 * Bun allein genügt **nicht**: getauscht wird nur auf Windows, weil dort der
 * `node-pty`-Weg unter Bun nachweislich tot ist und Buns ConPTY nachweislich
 * läuft. Auf anderen Plattformen bleibt der Kern-Weg.
 *
 * @returns `'bun-pty'`, wenn Buns PTY übernehmen soll, sonst `'unveraendert'`
 */
export function waehleBackend(plattform: NodeJS.Platform = process.platform): TerminalBackend {
  return plattform === 'win32' && bunPtyMoeglich() ? 'bun-pty' : 'unveraendert'
}

/** Der kleinste Teil des Dienstes, den dieses Paket braucht (und im Test nachbaut). */
export type TerminalSpawnSeam = Pick<SubprocessRuntime, 'spawnTerminal'>

/**
 * Tauscht `spawnTerminal` gegen Buns PTY — und gibt einen Aufräumer zurück.
 *
 * **Warum die Erzeugerfunktion ein Parameter ist.** So läßt sich der Austausch
 * ohne echten Prozess prüfen: der Test schiebt eine Attrappe unter, sieht, daß
 * der Seam sie benutzt, und prüft nach dem Aufräumen, daß wieder der Ursprung
 * antwortet. Ohne diesen Parameter wäre jede Prüfung ein Prozeßstart.
 *
 * @param subprocess - der Subprozess-Dienst
 * @param backend - `'bun-pty'` tauscht, `'unveraendert'` läßt alles, wie es ist
 * @param erzeuge - baut den Handle (voreingestellt: {@link BunPtyTerminalHandle})
 * @returns der Aufräumer, der den Ursprung zurückholt
 */
export function tauscheTerminalBackend(
  subprocess: TerminalSpawnSeam,
  backend: TerminalBackend,
  erzeuge: (spec: SubprocessTerminalSpawnSpec) => SubprocessTerminalHandle = spec =>
    new BunPtyTerminalHandle(spec),
): () => void {
  if (backend === 'unveraendert') return () => {}
  const ursprung = subprocess.spawnTerminal.bind(subprocess)
  subprocess.spawnTerminal = async (spec: SubprocessTerminalSpawnSpec) => erzeuge(spec)
  let zurueckgetauscht = false
  return () => {
    if (zurueckgetauscht) return
    zurueckgetauscht = true
    subprocess.spawnTerminal = ursprung
  }
}

/**
 * Hängt den Austausch ein.
 *
 * @param ctx - der Plugin-Kontext mit dem Subprozess-Dienst
 */
export function apply(ctx: Context): void {
  const subprocess = ctx.get('subprocess')
  if (subprocess === undefined) {
    // Der Loader wartet über `inject`; dieser Zweig ist der Schutz für einen
    // Aufbau, in dem die Zeile ohne Dienst geladen wird. Dann bleibt es beim
    // Kern-Weg — und das Protokoll sagt es, statt still zu schweigen.
    ctx.logger?.warn('terminal-pty: kein subprocess-Dienst — Terminals laufen unverändert über den Kern')
    return
  }
  const backend = waehleBackend()
  ctx.effect(() => tauscheTerminalBackend(subprocess, backend), `${name}:terminal-backend`)
  if (backend === 'bun-pty') {
    ctx.logger?.info(
      'terminal-pty: Terminals laufen über Buns ConPTY (node-pty ist unter Bun auf Windows funktionsunfähig)',
    )
  }
}

export { BunPtyTerminalHandle, kindUmgebung } from './handle.ts'
export default apply
