/**
 * Die Beobachtung der Skill-Wurzeln.
 *
 * **Warum überhaupt beobachtet wird.** Der Katalog ist zwischengespeichert. Ohne Beobachtung
 * würde eine neue Fähigkeit erst nach einem Neustart erscheinen — und eine geänderte
 * Beschreibung ebenso. Die Beobachtung ist damit keine Bequemlichkeit, sondern die Bedingung
 * dafür, daß der Cache nicht lügt.
 *
 * **Warum `node:fs.watch` und nicht Chokidar.** Die Vorlage benutzt Chokidar. Hier ist die
 * Aufgabe kleiner: es geht um **direkte** Kinder einer Wurzel (`<name>/SKILL.md` oder
 * `<name>.md`), nicht um einen rekursiven Baum. `fs.watch` genügt dafür, ist im Laufzeitumfang
 * enthalten und hat keine zusätzliche Abhängigkeit. Was es **nicht** kann, steht in der
 * README: stabile Entprellung und symbolische Verzeichniswechsel sind nicht nachgebaut.
 *
 * @module @prometheus-harness/skill-filesystem/watch
 */

import { existsSync, statSync, watch, type FSWatcher } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Einstellungen der Beobachtung. */
export interface RootWatchOptions {
  /** Ob überhaupt beobachtet wird. Vorgabe `true`. */
  readonly enabled?: boolean
  /** Höchstzahl beobachteter Wurzeln; die älteste fällt heraus. Vorgabe 128. */
  readonly maxRoots?: number
  /** Protokoll für einen Beobachtungsfehler. */
  readonly onError?: (message: string) => void
}

/**
 * Beobachtet eine Menge von Wurzeln und ruft bei jeder relevanten Änderung `invalidate`.
 *
 * Eine fehlende Wurzel wird über ihren **nächstgelegenen vorhandenen Vorfahren** beobachtet:
 * legt jemand `.dsh/skills` an, meldet das Ereignis den Vorfahren, und die nächste Erfassung
 * hängt die Wurzel selbst ein. Genau dieses Nachrücken ist der Grund, warum eine fehlende
 * Wurzel kein dauerhafter blinder Fleck ist.
 */
export class RootWatcher {
  readonly #watchers = new Map<string, { readonly watcher: FSWatcher; readonly anchor: string }>()
  readonly #invalidate: () => void
  readonly #enabled: boolean
  readonly #maxRoots: number
  readonly #onError: (message: string) => void
  #closed = false
  #queued = false

  /**
   * @param invalidate - wird bei einer Änderung gerufen; mehrfach pro Ereignis möglich
   * @param options - Ein/Aus, Grenze und Fehlermeldung
   */
  constructor(invalidate: () => void, options: RootWatchOptions = {}) {
    this.#invalidate = invalidate
    this.#enabled = options.enabled ?? true
    this.#maxRoots = options.maxRoots ?? 128
    this.#onError = options.onError ?? (() => {})
    if (!Number.isInteger(this.#maxRoots) || this.#maxRoots < 1) {
      throw new RangeError('watchMaxRoots muss eine ganze Zahl ≥ 1 sein')
    }
  }

  /** Zahl der offenen Beobachtungen. */
  get size(): number {
    return this.#watchers.size
  }

  /**
   * Stellt sicher, daß jede Wurzel beobachtet wird.
   *
   * @param roots - absolute Wurzelpfade
   * @throws Error wenn das Anhängen einer Beobachtung scheitert — der Aufrufer meldet dann
   *   eine unvollständige Erfassung, statt den Katalog zu verstecken
   */
  observe(roots: readonly string[]): void {
    if (!this.#enabled || this.#closed) return
    for (const root of roots) {
      const anchor = nearestExistingDirectory(root)
      if (anchor === undefined) continue
      // Der Anker kann sich verschieben: eine fehlende Wurzel wird über ihren Vorfahren
      // beobachtet; entsteht sie, muß die Beobachtung auf sie selbst umziehen — sonst sähe
      // sie nur noch Änderungen **neben** der Wurzel, nicht in ihr.
      const existing = this.#watchers.get(root)
      if (existing !== undefined && existing.anchor === anchor) continue
      if (existing !== undefined) this.#detach(root)
      this.#attach(root, anchor)
    }
    while (this.#watchers.size > this.#maxRoots) {
      const oldest = this.#watchers.keys().next()
      if (oldest.done === true) break
      this.#detach(oldest.value)
    }
  }

  /**
   * Meldet eine Schreibbeobachtung des Hosts.
   *
   * Ein `write`/`edit`-Werkzeug schreibt über den Dateidienst; die Dateiereignisse können
   * später kommen als der Werkzeugaufruf. Deshalb verwirft der Aufrufer den Katalog schon
   * jetzt, wenn der Pfad in einer Wurzel liegt.
   *
   * @param path - der geschriebene Pfad
   * @param roots - die aktuell gültigen Wurzeln
   * @returns ob der Pfad in einer Wurzel lag
   */
  observeHostMutation(path: string, roots: readonly string[]): boolean {
    if (this.#closed) return false
    const target = resolve(path)
    for (const root of roots) {
      if (isInside(resolve(root), target)) {
        this.#queue()
        return true
      }
    }
    return false
  }

  /** Schließt jede Beobachtung. Weitere Ereignisse werden ignoriert; mehrfach aufrufbar. */
  dispose(): void {
    this.#closed = true
    for (const eintrag of this.#watchers.values()) {
      try {
        eintrag.watcher.close()
      } catch {
        // Eine bereits geschlossene Beobachtung ist kein Fehler.
      }
    }
    this.#watchers.clear()
  }

  #attach(root: string, anchor: string): void {
    let watcher: FSWatcher
    try {
      watcher = watch(anchor, { persistent: false }, () => { this.#queue() })
    } catch (error) {
      throw new Error(`skill-filesystem: Wurzel ${root} nicht beobachtbar: ${describe(error)}`)
    }
    watcher.on('error', (error: unknown) => {
      this.#onError(`skill-filesystem: Beobachtung von ${root} scheiterte: ${describe(error)}`)
      this.#detach(root)
    })
    this.#watchers.set(root, { watcher, anchor })
  }

  #detach(root: string): void {
    const eintrag = this.#watchers.get(root)
    if (eintrag === undefined) return
    this.#watchers.delete(root)
    try {
      eintrag.watcher.close()
    } catch {
      // Siehe dispose().
    }
  }

  #queue(): void {
    if (this.#closed || this.#queued) return
    this.#queued = true
    queueMicrotask(() => {
      this.#queued = false
      if (this.#closed) return
      this.#invalidate()
    })
  }
}

/**
 * Sucht den nächsten vorhandenen **Verzeichnis**-Vorfahren.
 *
 * `undefined` bedeutet: bis zur Laufwerkswurzel existiert nichts — dann ist auch kein
 * Ereignis zu erwarten, und die nächste Erfassung versucht es erneut.
 */
function nearestExistingDirectory(path: string): string | undefined {
  let candidate = resolve(path)
  while (true) {
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate
    } catch {
      // Ein nicht lesbarer Kandidat zählt wie ein fehlender; weiter nach oben.
    }
    const parent = dirname(candidate)
    if (parent === candidate) return undefined
    candidate = parent
  }
}

/** Liegt `child` in `root` (oder ist es `root` selbst)? */
function isInside(root: string, child: string): boolean {
  const relation = relative(root, child)
  if (relation.length === 0) return true
  return relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
