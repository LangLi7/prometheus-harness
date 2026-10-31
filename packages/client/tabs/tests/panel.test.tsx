import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspacesPanel } from '../src/index.tsx'
import { NS } from '../src/locales.ts'

/**
 * Die Fläche wird **gerendert**, nicht nur aufgerufen.
 *
 * Der Zweck der Fläche ist der **Link**: `<a href="/c/…">` ist die einzige Form,
 * die Strg-Klick und „In neuem Tab öffnen" versteht. Ein Test, der nur prüft,
 * daß `openSession` gerufen wird, hätte den Kern der Sache nicht berührt.
 */
describe('Workspaces-Fläche', () => {
  const t = ((schluessel: string) => `${NS}.${schluessel}`) as unknown as Parameters<typeof WorkspacesPanel>[0]['t']

  const bereiche = {
    items: [
      {
        workspaceId: 'ws_1',
        path: 'C:\\Users\\Chang\\prometheus-harness',
        title: 'prometheus-harness',
        sessionIds: ['ses_1', 'ses_2'],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
      {
        workspaceId: 'ws_2',
        path: 'C:\\Users\\Chang\\leer',
        title: 'leer',
        sessionIds: [],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  }

  const sitzungen = {
    ids: ['ses_1', 'ses_2'],
    byId: {
      ses_1: { sessionId: 'ses_1', blank: false, title: 'Der Umschalter' },
      ses_2: { sessionId: 'ses_2', blank: true },
    },
    phase: 'ready',
    projectionsBySession: {},
  }

  function rendern(): string {
    return renderToStaticMarkup(
      <WorkspacesPanel
        useWorkspaces={((sel: (s: unknown) => unknown) => sel(bereiche)) as never}
        useSessions={((sel: (s: unknown) => unknown) => sel(sitzungen)) as never}
        close={() => undefined}
        openSession={() => undefined}
        newChat={() => undefined}
        t={t}
      />,
    )
  }

  test('jede Sitzung ist ein echter Link auf ihre Adresse', () => {
    const html = rendern()
    expect(html).toContain('href="/c/ses_1"')
    expect(html).toContain('href="/c/ses_2"')
  })

  test('Titel, leerer Bereich und der Knopf für einen neuen Chat stehen da', () => {
    const html = rendern()
    expect(html).toContain('prometheus-harness')
    expect(html).toContain('Der Umschalter')
    // Eine leere Sitzung heißt nicht sich selbst, sondern „Neue Sitzung".
    expect(html).toContain(`${NS}.blank`)
    expect(html).toContain(`${NS}.noSessions`)
    expect(html).toContain(`${NS}.newChat`)
  })

  test('der Pfad steht als Kurzhinweis am Namen', () => {
    expect(rendern()).toContain('C:\\Users\\Chang\\prometheus-harness')
  })
})
