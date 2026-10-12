/**
 * Form der Insel-Daten.
 *
 * Hier stehen **nur die Typen**, kein Inhalt. Die Insel ist inhaltsleer und wird von außen
 * belegt; später kommt die Belegung aus dem Harness selbst — Workspaces, Sessions, Branches,
 * Werkzeuge. Vorbild dafür ist die Core-Vorlage `C:\Users\Chang\harness\prometheus-harness`.
 *
 * Bis dahin gilt: keine fest verdrahteten Kanäle, Branches oder Werkzeuge im Quelltext.
 */

export type IslandItemKind = 'channel' | 'branch' | 'tool'

export interface IslandItem {
  /** Stabiler Schlüssel der Quelle (Workspace- oder Kanalname). */
  readonly id: string
  /** Anzeigename ohne Präfix und ohne Marke. */
  readonly label: string
  readonly kind: IslandItemKind
  /** Kurzes Zeichen links vom Namen, z. B. `#`, `⌥`, `◉`. */
  readonly sigil: string
  /** Marke rechts am Eintrag (`live`, `7d`, `neu`), wenn die Quelle eine liefert. */
  readonly badge?: string
}

export interface IslandGroup {
  /** Überschrift der Gruppe, wie sie angezeigt wird (z. B. `# channels`). */
  readonly title: string
  readonly items: readonly IslandItem[]
}

/** Leere Belegung — der Zustand, solange keine Quelle angebunden ist. */
export const NO_GROUPS: readonly IslandGroup[] = []
