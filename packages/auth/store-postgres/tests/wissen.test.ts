/**
 * Der Wissensspeicher gegen echtes PostgreSQL — und die **gefilterte Vektorsuche**.
 *
 * ## Worum es hier geht
 *
 * Der zusammengesetzte Fremdschlüssel aus Migration 0006 verhindert Übergriffe
 * beim **Schreiben**. Beim **Lesen** verhindert er **nichts** — dort zählt allein
 * die `WHERE`-Klausel. Diese Datei prüft beides, und sie prüft es so, daß ein
 * Fehler **auffallen muß**:
 *
 * 1. **Der Filter hält.** Die Mandanten werden so gelegt, daß die Vektoren des
 *    **fremden** Mandanten dem Suchvektor **näher** liegen als die eigenen. Wer
 *    ohne Filter sucht, bekommt dann garantiert fremde Treffer — die Prüfung
 *    fällt um. Mit Filter darf **kein einziges** fremdes Stück in der Antwort
 *    stehen.
 * 2. **Die Rückgabe bei Filter wird gemessen.** Eine Vektorsuche mit Filter kann
 *    **zu wenige** Zeilen liefern: PostgreSQL sucht zuerst die nächsten Nachbarn
 *    und wirft danach weg, was nicht zum Filter paßt. Bei einem Mandantenfilter,
 *    der **immer** greift, ist das der Normalfall. In `docs/status/wissensspeicher-d1.md`
 *    stand dazu *„ungemessen"* — hier steht die Zahl.
 *
 * ## Was diese Datei NICHT prüft
 *
 * **Kein Modell und keine Semantik.** Die Vektoren sind **künstlich**: sie werden
 * gesetzt, nicht berechnet. Geprüft wird der **Filter** und die **Rückgabe** —
 * ob ein Vektor inhaltlich etwas trifft, kann diese Datei nicht sagen und
 * behauptet es auch nicht.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import { migrate } from '@prometheus-harness/db-schema'
import { erzeugeWissensspeicher, vektorZuText, type SqlZugang, type Wissensspeicher } from '../src/index.ts'

const AUS_ENV = process.env.PMH_TEST_DATABASE_URL
const DA = AUS_ENV !== undefined && AUS_ENV.trim() !== '' ? AUS_ENV : undefined

if (DA === undefined) {
  process.stderr.write(
    'HINWEIS: Wissensspeicher-Prüfungen übersprungen — PMH_TEST_DATABASE_URL ist nicht gesetzt.\n' +
      '  Was hier fehlt, ist der Beweis, daß die Vektorsuche den Mandantenfilter WIRKLICH anwendet.\n',
  )
}
const run = DA === undefined ? describe.skip : describe

const DOMAENE = '@wissenstest.invalid'
const DIM = 768

let sql: postgres.Sql
let zugang: SqlZugang
let speicher: Wissensspeicher

beforeAll(async () => {
  if (DA === undefined) return
  sql = postgres(DA, { max: 4, onnotice: () => undefined })
  zugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
      return await sql.unsafe(anweisung, werte as never[])
    },
  }
  await migrate({
    async exec(anweisung: string) {
      await sql.unsafe(anweisung)
    },
    async query<T>(anweisung: string, werte: readonly unknown[] = []): Promise<readonly T[]> {
      return (await sql.unsafe(anweisung, werte as never[])) as readonly T[]
    },
  })
  speicher = erzeugeWissensspeicher(zugang)
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${DOMAENE}`])
})

afterAll(async () => {
  if (DA === undefined) return
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${DOMAENE}`]).catch(() => undefined)
  await sql.end({ timeout: 5 })
})

/** Legt einen Mandanten an und gibt seine Kennung zurück. */
async function mandant(name: string): Promise<string> {
  const zeilen = await sql.unsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, display_name, role)
     VALUES (gen_random_uuid(), $1, 'ersatz-hash', $2, 'user') RETURNING id`,
    [`${name}${DOMAENE}`, name],
  )
  const id = zeilen[0]?.id
  if (id === undefined) throw new Error(`Mandant ${name} ließ sich nicht anlegen`)
  return id
}

/**
 * Ein Vektor, der mit **einer Zahl gefüllt** ist — **künstlich**, ohne Modell.
 *
 * **Achtung, hier lag ein eigener Denkfehler.** Zwei so gefüllte Vektoren zeigen
 * für **jeden** Wert in **dieselbe Richtung**; der Kosinusabstand zwischen ihnen
 * ist deshalb **immer 0**. Wer damit „nah" und „fern" bauen will, baut nichts:
 * die Reihenfolge ist willkürlich. Für Nähe und Ferne braucht es
 * **verschiedene Richtungen** — siehe {@link richtung}.
 */
function vektor(wert: number): number[] {
  return new Array<number>(DIM).fill(wert)
}

/** Ein Vektor mit einer **1 an genau einer Stelle** — damit hat er eine Richtung. */
function richtung(index: number): number[] {
  const v = new Array<number>(DIM).fill(0)
  v[index] = 1
  return v
}

run('Der Wissensspeicher', () => {
  test('ein Dokument anlegen und lesen — und ein FREMDER Mandant liest nichts', async () => {
    const a = await mandant('lesen-a')
    const b = await mandant('lesen-b')
    const id = await speicher.legeDokumentAb({
      userId: a,
      art: 'notiz',
      titel: 'Notiz von A',
      herkunft: 'C:/probe/notiz.md',
      bytes: 12,
    })
    const eigenes = await speicher.findeDokument(a, id)
    expect(eigenes?.titel).toBe('Notiz von A')
    expect(eigenes?.art).toBe('notiz')

    // **Der fremde Mandant sieht NICHTS — obwohl er die Kennung kennt.** Die
    // Kennung ist keine Erlaubnis; sie ist nur eine Kennung.
    expect(await speicher.findeDokument(b, id)).toBeUndefined()
  })

  test('Stücke ablegen, offene finden, einbetten — und ein FREMDER bettet nicht ein', async () => {
    const a = await mandant('stuecke-a')
    const b = await mandant('stuecke-b')
    const doc = await speicher.legeDokumentAb({ userId: a, art: 'notiz', titel: 'Mit Stücken' })

    const angelegt = await speicher.legeStueckeAb(
      a,
      [0, 1, 2].map((ordnung) => ({
        dokumentId: doc,
        ordnung,
        inhaltVerschluesselt: new TextEncoder().encode(`Stück ${String(ordnung)}`),
      })),
    )
    expect(angelegt).toBe(3)

    const offen = await speicher.offeneStuecke(a, 10)
    expect(offen).toHaveLength(3)
    // Die Stücke kommen in ihrer Ordnung — sonst wäre die Nachbarschaft wertlos.
    expect(offen.map((s) => s.ordnung)).toEqual([0, 1, 2])

    // **Der fremde Mandant sieht die offenen Stücke nicht.**
    expect(await speicher.offeneStuecke(b, 10)).toHaveLength(0)

    // Einbetten: der Eigentümer darf, der Fremde nicht.
    const erstes = offen[0]
    if (erstes === undefined) throw new Error('kein offenes Stück')
    expect(await speicher.setzeEinbettung(b, erstes.id, vektor(0.5), 'probe-modell', new Date())).toBe(false)
    expect(await speicher.setzeEinbettung(a, erstes.id, vektor(0.5), 'probe-modell', new Date())).toBe(true)
    // Danach sind es nur noch zwei offene — die Nacharbeit schrumpft.
    expect(await speicher.offeneStuecke(a, 10)).toHaveLength(2)
  })

  test('DER FILTER HÄLT: fremde Vektoren liegen NÄHER, und trotzdem kommt kein fremder Treffer', async () => {
    const a = await mandant('filter-a')
    const b = await mandant('filter-b')

    // A: Stücke in **Richtung 1** — die liegen vom Suchvektor (Richtung 0) weit weg.
    const docA = await speicher.legeDokumentAb({ userId: a, art: 'notiz', titel: 'Fern' })
    await speicher.legeStueckeAb(
      a,
      [0, 1, 2].map((ordnung) => ({ dokumentId: docA, ordnung, inhaltVerschluesselt: new Uint8Array([ordnung]) })),
    )
    for (const s of await speicher.offeneStuecke(a, 10)) {
      await speicher.setzeEinbettung(a, s.id, richtung(1), 'probe-modell', new Date())
    }

    // B: ein Stück **in Richtung 0** — genau auf dem Suchvektor. Ohne Filter wäre
    // der erste Treffer garantiert von B.
    const docB = await speicher.legeDokumentAb({ userId: b, art: 'notiz', titel: 'Nah' })
    await speicher.legeStueckeAb(b, [{ dokumentId: docB, ordnung: 0, inhaltVerschluesselt: new Uint8Array([9]) }])
    const offenB = await speicher.offeneStuecke(b, 10)
    const bStueck = offenB[0]
    if (bStueck === undefined) throw new Error('kein Stück bei B')
    await speicher.setzeEinbettung(b, bStueck.id, richtung(0), 'probe-modell', new Date())

    // Der Suchvektor zeigt in Richtung 0 — für A ist er orthogonal (Abstand 1).
    const treffer = await speicher.suche(a, { vektor: richtung(0), grenze: 5 })
    // **Kein einziger Treffer darf B gehören.** Das ist die ganze Aussage.
    const fremde = treffer.filter((t) => t.dokumentId === docB)
    expect(fremde).toHaveLength(0)
    // Und die eigenen sind da (sie liegen fern, aber es gibt sie).
    expect(treffer.length).toBeGreaterThan(0)

    // Gegenprobe in der Datenbank: B's Stück existiert und wäre der beste Treffer.
    const nah = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM chunks WHERE user_id = $1 AND embedding IS NOT NULL`,
      [b],
    )
    expect(nah[0]?.n).toBe(1)
    const ohneFilter = await sql.unsafe<{ id: string }[]>(
      `SELECT id FROM chunks WHERE embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 1`,
      [vektorZuText(richtung(0))],
    )
    // **Das ist der Beweis, daß die Prüfung scharf ist:** ohne Filter ist der
    // beste Treffer B's Stück. Mit Filter ist er nicht dabei.
    expect(ohneFilter[0]?.id).toBe(bStueck.id)
  })

  test('DIE RÜCKGABE BEI FILTER: gemessen, nicht vermutet', async () => {
    // **Die Messung, die in der Doku als „ungemessen" stand.** PostgreSQL sucht
    // zuerst die nächsten Nachbarn (HNSW, `ef_search` Vorgabe 40) und wirft
    // danach weg, was nicht zum Filter paßt. Sind die fremden Vektoren näher,
    // können von `LIMIT 5` **weniger als 5** zurückkommen.
    //
    // **Zwei Dinge, die der erste Entwurf falsch machte:**
    //
    // 1. **Die Vektoren waren ausgeartet.** A bekam `[0,0,…]` — der
    //    Kosinusabstand eines Nullvektors ist **undefiniert**, die Sortierung
    //    damit wertlos. Jetzt sind es **gerichtete** Vektoren: der Suchvektor und
    //    B zeigen in Richtung 0 (Abstand 0), A zeigt in Richtung 1 (Abstand 1).
    // 2. **Zu wenige Zeilen.** Bei rund 1000 Zeilen ist ein Seitendurchlauf
    //    billiger als der Index, und PostgreSQL nimmt ihn auch — dann prüft die
    //    Messung die **exakte** Suche und sagt über HNSW **nichts**. Deshalb
    //    20 000 fremde und 200 eigene Stücke, **und der Plan wird protokolliert**.
    const a = await mandant('rueckgabe-a')
    const b = await mandant('rueckgabe-b')

    const docA = await speicher.legeDokumentAb({ userId: a, art: 'notiz', titel: 'A' })
    const docB = await speicher.legeDokumentAb({ userId: b, art: 'notiz', titel: 'B' })

    const richtung = (i: number): string => {
      const v = new Array<number>(DIM).fill(0)
      v[i] = 1
      return vektorZuText(v)
    }

    // A: 200 Stücke in Richtung 1 — weit weg vom Suchvektor.
    await sql.unsafe(
      `INSERT INTO chunks (id, user_id, document_id, ordinal, content_cipher, embedding, embedding_model, embedded_at)
       SELECT gen_random_uuid(), $1, $2, g, 'x'::bytea, $3::vector, 'probe-modell', now()
         FROM generate_series(0, 199) AS g`,
      [a, docA, richtung(1)],
    )
    // B: 20 000 Stücke in Richtung 0 — **genau auf dem Suchvektor**.
    await sql.unsafe(
      `INSERT INTO chunks (id, user_id, document_id, ordinal, content_cipher, embedding, embedding_model, embedded_at)
       SELECT gen_random_uuid(), $1, $2, g, 'x'::bytea, $3::vector, 'probe-modell', now()
         FROM generate_series(0, 19999) AS g`,
      [b, docB, richtung(0)],
    )
    await sql.unsafe('ANALYZE chunks')

    const suchvektor = richtung(0)
    const plan = await sql.unsafe<Record<string, string>[]>(
      `EXPLAIN SELECT c.id FROM chunks c
        WHERE c.user_id = $1 AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $2::vector LIMIT 5`,
      [a, suchvektor],
    )
    const planText = plan.map((z) => Object.values(z)[0] ?? '').join(' | ')
    const mitIndex = planText.includes('chunks_embedding_hnsw')

    const treffer = await speicher.suche(a, { vektor: new Array<number>(DIM).fill(0).map((_, i) => (i === 0 ? 1 : 0)), grenze: 5 })
    const zahl = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM chunks WHERE user_id = $1 AND embedding IS NOT NULL`,
      [a],
    )
    process.stderr.write(
      `\n[pmh] gefilterte Vektorsuche: A hat ${String(zahl[0]?.n ?? 0)} eingebettete Stücke, ` +
        `B hat 20 000 NÄHERE — LIMIT 5 lieferte ${String(treffer.length)} Treffer. ` +
        `Index benutzt: ${mitIndex ? 'JA' : 'NEIN (Seitendurchlauf — dann prüft das die exakte Suche, nicht HNSW)'}\n` +
        `[pmh] Plan: ${planText.slice(0, 200)}\n`,
    )

    // **Was gelten MUSS:** alle Treffer gehören A. Kein fremder, nie.
    const alleA = await sql.unsafe<{ id: string }[]>(`SELECT id FROM chunks WHERE user_id = $1`, [a])
    const aIds = new Set(alleA.map((z) => z.id))
    for (const t of treffer) expect(aIds.has(t.stueckId)).toBe(true)
    expect(treffer.length).toBeLessThanOrEqual(5)

    // **Und die Zahl wird festgehalten, nicht vorgeschrieben.** Sie ist der
    // Befund; ob sie 5 ist oder weniger, steht in der Ausgabe und in der Doku.
    expect(typeof treffer.length).toBe('number')
    // **30 Sekunden statt der Vorgabe von 5.** Der erste Lauf lief in die
    // Vorgabe: 20 000 Zeilen einfügen, den HNSW-Index mitziehen und `ANALYZE`
    // brauchen länger als fünf Sekunden — und der Abbruch mitten im Einfügen
    // erzeugte danach einen **Fremdschlüsselfehler**, weil `afterAll` die
    // Mandanten wegräumte, während die Anweisung noch lief. Also: das Zeitlimit
    // für **diese** Prüfung hochsetzen, nicht die Messung verkleinern.
  }, 30_000)

  test('vektorZuText: die Form, die pgvector versteht', () => {
    expect(vektorZuText([1, 2, 3])).toBe('[1,2,3]')
    expect(vektorZuText([0.5])).toBe('[0.5]')
    // **Keine Rundung.** Was hereinkommt, geht hinaus.
    expect(vektorZuText([0.123456789012345])).toBe('[0.123456789012345]')
  })

  test('leere Vektoren werden abgewiesen — sie können nichts finden', async () => {
    const a = await mandant('leer-a')
    const doc = await speicher.legeDokumentAb({ userId: a, art: 'notiz', titel: 'Leer' })
    await speicher.legeStueckeAb(a, [{ dokumentId: doc, ordnung: 0, inhaltVerschluesselt: new Uint8Array([1]) }])
    const offen = await speicher.offeneStuecke(a, 1)
    const erstes = offen[0]
    if (erstes === undefined) throw new Error('kein Stück')
    expect(speicher.suche(a, { vektor: [] })).rejects.toThrow()
    expect(speicher.setzeEinbettung(a, erstes.id, [], 'modell', new Date())).rejects.toThrow()
  })
})
