/**
 * **Der Wissensspeicher als Werkzeug — geprüft ohne Datenbank, ohne Netz, ohne Host.**
 *
 * Vier Stellen können falsch sein, und alle vier sind hier sichtbar: die
 * Entschlüsselung des Treffers, die **Reihenfolge** der Treffer, die Bindung des
 * Mandanten, und das Verhalten bei Fehlern (leer, nichts gefunden, Suche wirft).
 *
 * **Die Gegenprobe gehört dazu:** ein Aufruf, der einen fremden `userId`
 * mitschickt, darf ihn **nicht** durchreichen — der Mandant wird beim Bau
 * gebunden, nicht beim Aufruf.
 */
import { describe, expect, test } from 'bun:test'
import {
  erzeugeSchluessel,
  packeUmschlag,
  verpacke,
  type Hauptschluessel,
} from '@prometheus-harness/secrets'
import type { Stueckinhalt, Treffer, Wissensspeicher } from '@prometheus-harness/store-postgres'
import {
  baueSuche,
  baueWerkzeug,
  fehlendeVoraussetzungen,
  GRENZE_HOECHSTENS,
  GRENZE_VORGABE,
  WERKZEUG,
} from '../src/index.ts'

const haupt: Hauptschluessel = {
  schluessel: erzeugeSchluessel(),
  version: 1,
  herkunft: 'Prüfung',
}

/** Der Mandant, der beim Bau gebunden wird. */
const BENUTZER = '11111111-1111-4111-8111-111111111111'

/** Ein Treffer mit Herkunft. */
function treffer(stueckId: string, titel: string, aehnlichkeit: number): Treffer {
  return { stueckId, dokumentId: 'd1', ordnung: 0, titel, herkunft: `${titel}.md`, aehnlichkeit }
}

/** Ein verschlüsseltes Stück, wie es in der Datenbank liegt. */
function stueck(stueckId: string, text: string): Stueckinhalt {
  return {
    stueckId,
    ordnung: 0,
    inhaltVerschluesselt: packeUmschlag(verpacke(new TextEncoder().encode(text), haupt)),
  }
}

/** Ein Speicher, der nur das tut, was die Suche braucht — und mitschreibt, wer fragt. */
function speicherMit(
  trefferListe: readonly Treffer[],
  stuecke: readonly Stueckinhalt[],
  gesehen: { benutzerId?: string } = {},
): Wissensspeicher {
  return {
    async suche(userId: string) {
      gesehen.benutzerId = userId
      return trefferListe
    },
    async liesStuecke() {
      return stuecke
    },
  } as unknown as Wissensspeicher
}

/** Der Einbetter als Attrappe: merkt sich den Text, liefert einen festen Vektor. */
function einbetter(gesehen: { texte?: readonly string[] } = {}) {
  return async (texte: readonly string[]) => {
    gesehen.texte = texte
    return texte.map(() => [0.1, 0.2, 0.3])
  }
}

// ── Die Suche: Vektor, Treffer, Text ─────────────────────────────────────────────────────────

describe('baueSuche', () => {
  test('liefert Titel, Herkunft und den ENTSCHLÜSSELTEN Text', async () => {
    const suche = baueSuche({
      speicher: speicherMit([treffer('s1', 'Entscheidung — Vektorsuche', 0.91)], [stueck('s1', 'Der Mandant steht im Filter.')]),
      benutzerId: BENUTZER,
      modell: 'probe-modell',
      einbetten: einbetter(),
      haupt,
    })

    const gefunden = await suche('wonach sucht der mandant?', 5)

    expect(gefunden).toHaveLength(1)
    expect(gefunden[0]?.text).toBe('Der Mandant steht im Filter.')
    expect(gefunden[0]?.titel).toBe('Entscheidung — Vektorsuche')
    expect(gefunden[0]?.herkunft).toBe('Entscheidung — Vektorsuche.md')
    expect(gefunden[0]?.aehnlichkeit).toBe(0.91)
  })

  test('die Reihenfolge ist die der TREFFER, nicht die der Datenbank', async () => {
    // Die Datenbank liefert die Stücke in beliebiger Reihenfolge — hier umgekehrt.
    const suche = baueSuche({
      speicher: speicherMit(
        [treffer('s1', 'Erster', 0.9), treffer('s2', 'Zweiter', 0.8)],
        [stueck('s2', 'B'), stueck('s1', 'A')],
      ),
      benutzerId: BENUTZER,
      modell: 'probe-modell',
      einbetten: einbetter(),
      haupt,
    })

    const gefunden = await suche('egal', 5)

    expect(gefunden.map((f) => f.text)).toEqual(['A', 'B'])
  })

  test('GEGENPROBE: der Mandant am Speicher ist der GEBUNDENE', async () => {
    const gesehen: { benutzerId?: string } = {}
    const suche = baueSuche({
      speicher: speicherMit([], [], gesehen),
      benutzerId: BENUTZER,
      modell: 'probe-modell',
      einbetten: einbetter(),
      haupt,
    })

    await suche('egal', 5)

    expect(gesehen.benutzerId).toBe(BENUTZER)
  })

  test('der Einbetter bekommt den Text — nicht den Vektor und nicht die Grenze', async () => {
    const gesehen: { texte?: readonly string[] } = {}
    const suche = baueSuche({
      speicher: speicherMit([], []),
      benutzerId: BENUTZER,
      modell: 'probe-modell',
      einbetten: einbetter(gesehen),
      haupt,
    })

    await suche('  mit Leerraum  ', 5)

    expect(gesehen.texte).toEqual(['mit Leerraum'])
  })

  test('ein leerer Vektor des Einbetters ist ein Fehler, kein leeres Ergebnis', async () => {
    const suche = baueSuche({
      speicher: speicherMit([], []),
      benutzerId: BENUTZER,
      modell: 'probe-modell',
      einbetten: async () => [],
      haupt,
    })

    await expect(suche('egal', 5)).rejects.toThrow('keinen Vektor')
  })

  test('ein unlesbares Stück fällt raus — die anderen bleiben', async () => {
    const kaputt: Stueckinhalt = { stueckId: 's2', ordnung: 0, inhaltVerschluesselt: new Uint8Array([1, 2, 3]) }
    const suche = baueSuche({
      speicher: speicherMit(
        [treffer('s1', 'Gut', 0.9), treffer('s2', 'Defekt', 0.8)],
        [stueck('s1', 'lesbar'), kaputt],
      ),
      benutzerId: BENUTZER,
      modell: 'probe-modell',
      einbetten: einbetter(),
      haupt,
    })

    const gefunden = await suche('egal', 5)

    expect(gefunden).toHaveLength(1)
    expect(gefunden[0]?.text).toBe('lesbar')
  })
})

// ── Das Werkzeug: die Form, die der Agent sieht ──────────────────────────────────────────────

/** Ruft das Werkzeug auf und gibt das Ergebnis als Objekt zurück. */
async function rufe(definition: ReturnType<typeof baueWerkzeug>, argumente: Record<string, unknown>) {
  // **Zwei Argumente, nicht eines.** `execute` bekommt den Werkzeug-Kontext mit;
  // ihn wegzulassen ist ein Typfehler, kein Freiheitsgrad.
  const ergebnis = await definition.execute(argumente as never, {} as never)
  return ergebnis as {
    ok: boolean
    modell: string
    anfrage?: string
    anzahl?: number
    treffer?: readonly { titel: string }[]
    error?: string
  }
}

describe('baueWerkzeug', () => {
  test('trägt den vereinbarten Namen', () => {
    const definition = baueWerkzeug({ suche: async () => [], modell: 'probe-modell' })
    expect(definition.name).toBe(WERKZEUG)
    expect(definition.name).toBe('knowledge_search')
  })

  test('ein Treffer kommt mit Anzahl und Modell zurück', async () => {
    const definition = baueWerkzeug({
      suche: async () => [
        { titel: 'A', herkunft: 'a.md', text: 'Inhalt', ordnung: 0, aehnlichkeit: 0.9 },
      ],
      modell: 'probe-modell',
    })

    const ergebnis = await rufe(definition, { query: 'frage' })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.anzahl).toBe(1)
    expect(ergebnis.modell).toBe('probe-modell')
    expect(ergebnis.treffer?.[0]?.titel).toBe('A')
  })

  test('NICHTS gefunden ist eine Auskunft, kein Fehler', async () => {
    const definition = baueWerkzeug({ suche: async () => [], modell: 'probe-modell' })

    const ergebnis = await rufe(definition, { query: 'frage' })

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.anzahl).toBe(0)
  })

  test('eine leere Anfrage wird abgewiesen, ohne zu suchen', async () => {
    let gesucht = false
    const definition = baueWerkzeug({
      suche: async () => {
        gesucht = true
        return []
      },
      modell: 'probe-modell',
    })

    const ergebnis = await rufe(definition, { query: '   ' })

    expect(ergebnis.ok).toBe(false)
    expect(gesucht).toBe(false)
  })

  test('ein Fehler der Suche wird zur Auskunft — kein Absturz', async () => {
    const definition = baueWerkzeug({
      suche: async () => {
        throw new Error('Datenbank nicht erreichbar')
      },
      modell: 'probe-modell',
    })

    const ergebnis = await rufe(definition, { query: 'frage' })

    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.error).toBe('Datenbank nicht erreichbar')
  })

  test('das Limit wird begrenzt — nach oben und nach unten', async () => {
    const geschen: number[] = []
    const definition = baueWerkzeug({
      suche: async (_text, grenze) => {
        geschen.push(grenze)
        return []
      },
      modell: 'probe-modell',
    })

    await rufe(definition, { query: 'a', limit: 999 })
    await rufe(definition, { query: 'b', limit: 0 })
    await rufe(definition, { query: 'c' })

    expect(geschen).toEqual([GRENZE_HOECHSTENS, 1, GRENZE_VORGABE])
  })
})

// ── Die Voraussetzungen: was fehlt, wird gesagt ──────────────────────────────────────────────

describe('fehlendeVoraussetzungen', () => {
  test('ohne DATABASE_URL wird die Datenbank genannt', () => {
    expect(fehlendeVoraussetzungen({})).toContain('DATABASE_URL')
  })

  test('mit Datenbank ist die Umgebung zufrieden — der Mandant wird nicht geraten', () => {
    // **Der Mandant ist keine Umgebungsfrage mehr.** Er kommt aus der Sitzung
    // (`apply`-Option `benutzer`); ein Vorgabewert aus der Umgebung wäre der Weg
    // zum falschen Mandanten.
    expect(fehlendeVoraussetzungen({ DATABASE_URL: 'postgres://x' })).toBeUndefined()
  })
})
