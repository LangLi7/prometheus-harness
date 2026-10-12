import { useState } from 'react'
import ChannelsIsland from './lib/ChannelsIsland'
import Universe from './lib/Universe'
import { NO_GROUPS } from './lib/island-data'
import type { IslandGroup } from './lib/island-data'

/**
 * Prototyp-Fläche: Hintergrund und Dynamic Island.
 *
 * Die Insel hat **keinen festen Inhalt**. Die Belegung kommt von außen über `groups` und
 * soll später aus dem Harness kommen — Workspaces, Sessions, Branches, Werkzeuge; Vorbild
 * ist die Core-Vorlage `C:\Users\Chang\harness\prometheus-harness`. Solange keine Quelle
 * angebunden ist, bleibt die Liste leer und die Pille zeigt nur `PROMETHEUS`.
 *
 * Kein eigener CSS-Import: Basis, Tokens und `.stage` liegen zusammen in `src/app.css`,
 * das `main.tsx` lädt. Zwei Dateien `app.css`/`App.css` wären unter Windows dieselbe Datei.
 */
export default function App() {
  const groups: readonly IslandGroup[] = NO_GROUPS
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = groups.flatMap((group) => group.items).find((item) => item.id === activeId)
  const summary = active ? `${active.sigil}${active.label}` : ''

  return (
    <div className="stage">
      <Universe />
      <ChannelsIsland
        project="prometheus"
        groups={groups}
        activeId={activeId}
        summary={summary}
        onSelect={(item) => setActiveId(item.id)}
      />
    </div>
  )
}
