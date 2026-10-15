/**
 * Die Datenschicht — **ohne Server** geprüft, mit einem untergeschobenen Abruf.
 *
 * ## Warum das der richtige Nachweis ist
 *
 * Diese Datei hat genau eine Aufgabe: den **richtigen Auftrag** an den **richtigen Weg** mit dem
 * **richtigen Körper** zu senden. Der untergeschobene Abruf schreibt mit, was gesendet wurde — und
 * die Prüfungen vergleichen das Zeichen für Zeichen. Was sie **nicht** beweisen: daß der Server die
 * Aufträge so annimmt. Das steht in `packages/api/auth-http/tests/folders.test.ts` (zwölf Prüfungen
 * über einen echten Socket).
 *
 * ## Der Fall, der am leichtesten still bleibt
 *
 * Ein fehlender CSRF-Wert. Wird er gesendet, gibt der Server **403 `csrf-fehlt`** — und der Fehler
 * sieht wie ein Rechteproblem aus, nicht wie eine fehlende Anmeldung. Deshalb wird hier **gar nicht
 * erst gesendet**.
 */

import { describe, expect, test } from 'bun:test'
import {
  CSRF_KOPF,
  PFAD_ORDNER,
  PFAD_ORDNER_ANLEGEN,
  PFAD_ORDNER_ENTFERNEN,
  PFAD_ORDNER_ZUGRIFF,
  QuellordnerFehler,
  entferneOrdner,
  legeOrdnerAn,
  listeOrdner,
  setzeZugriff,
  type Abruf,
} from '../src/paths.ts'

/** Was ein Aufruf gesendet hat. */
interface Gesendet {
  readonly adresse: string
  readonly methode: string
  readonly kopf: Record<string, string>
  readonly koerper: string
}

/**
 * Ein Abruf, der mitschreibt — und eine feste Antwort gibt.
 *
 * @param antwort - der Körper, den der „Server" liefert
 * @param status - der Status
 * @returns der Abruf und die Aufzeichnung
 */
function buehne(
  antwort: unknown,
  status = 200,
): { readonly abruf: Abruf; readonly gesendet: Gesendet[] } {
  const gesendet: Gesendet[] = []
  const abruf: Abruf = async (adresse, einstellung) => {
    gesendet.push({
      adresse,
      methode: einstellung.method ?? 'GET',
      kopf: (einstellung.headers ?? {}) as Record<string, string>,
      koerper: typeof einstellung.body === 'string' ? einstellung.body : '',
    })
    return new Response(JSON.stringify(antwort), { status, headers: { 'content-type': 'application/json' } })
  }
  return { abruf, gesendet }
}

/** Die Quellen für die Prüfungen. */
function quellen(csrf: string | undefined = 'csrf-wert-1234') {
  return { csrf: () => csrf }
}

// ---------------------------------------------------------------------------
// 1. Die Liste
// ---------------------------------------------------------------------------

describe('Die Liste', () => {
  test('holt den richtigen Weg mit dem Arbeitsbereich in der Abfrage', async () => {
    const b = buehne({ ok: true, value: { ordner: [], wurzeln: [] } })
    await listeOrdner('w-1', { ...quellen(), abruf: b.abruf })
    expect(b.gesendet[0]?.adresse).toBe(`${PFAD_ORDNER}?workspace=w-1`)
    expect(b.gesendet[0]?.methode).toBe('GET')
  })

  test('ein Arbeitsbereich mit Sonderzeichen wird kodiert', async () => {
    const b = buehne({ ok: true, value: { ordner: [], wurzeln: [] } })
    await listeOrdner('w 1&x=2', { ...quellen(), abruf: b.abruf })
    expect(b.gesendet[0]?.adresse).toContain('w%201%26x%3D2')
  })

  test('die Ordner kommen durch', async () => {
    const b = buehne({
      ok: true,
      value: {
        ordner: [{ id: 'w1', pfad: 'C:\\x', istPrimaer: true, zugriff: 'schreiben' }],
        wurzeln: ['C:\\x'],
      },
    })
    const liste = await listeOrdner('w-1', { ...quellen(), abruf: b.abruf })
    expect(liste.ordner.length).toBe(1)
    expect(liste.ordner[0]?.istPrimaer).toBe(true)
    expect(liste.wurzeln).toEqual(['C:\\x'])
  })

  test('eine leere Antwort ergibt leere Listen — nicht einen Absturz', async () => {
    const b = buehne({ ok: true, value: {} })
    expect(await listeOrdner('w-1', { ...quellen(), abruf: b.abruf })).toEqual({ ordner: [], wurzeln: [] })
  })
})

// ---------------------------------------------------------------------------
// 2. Anlegen
// ---------------------------------------------------------------------------

describe('Einen Ordner anlegen', () => {
  test('sendet Weg, Methode, CSRF-Kopf und die Pflichtfelder', async () => {
    const b = buehne({ ok: true, value: { id: 'neu', pfad: 'D:\\x', istPrimaer: false, zugriff: 'lesen' } })
    await legeOrdnerAn({ workspaceId: 'w-1', pfad: 'D:\\x' }, { ...quellen(), abruf: b.abruf })
    const ruf = b.gesendet[0]
    expect(ruf?.adresse).toBe(PFAD_ORDNER_ANLEGEN)
    expect(ruf?.methode).toBe('POST')
    expect(ruf?.kopf[CSRF_KOPF]).toBe('csrf-wert-1234')
    expect(JSON.parse(ruf?.koerper ?? '{}')).toEqual({ workspaceId: 'w-1', pfad: 'D:\\x' })
  })

  test('fehlender Zugriff wird WEGGELASSEN, nicht als undefined gesendet', async () => {
    // Der Server unterscheidet `daten.zugriff !== undefined`. Ein ausdrückliches `undefined` wäre
    // dort nicht zu unterscheiden — und die Vorgabe des Servers würde nicht greifen.
    const b = buehne({ ok: true, value: { id: 'x', pfad: 'p', istPrimaer: false, zugriff: 'lesen' } })
    await legeOrdnerAn({ workspaceId: 'w', pfad: 'p' }, { ...quellen(), abruf: b.abruf })
    const koerper = JSON.parse(b.gesendet[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(Object.hasOwn(koerper, 'zugriff')).toBe(false)
    expect(Object.hasOwn(koerper, 'bezeichnung')).toBe(false)
  })

  test('ein gesetzter Zugriff und eine Bezeichnung gehen mit', async () => {
    const b = buehne({ ok: true, value: { id: 'x', pfad: 'p', istPrimaer: false, zugriff: 'schreiben' } })
    await legeOrdnerAn(
      { workspaceId: 'w', pfad: 'p', zugriff: 'schreiben', bezeichnung: '  Ablage  ' },
      { ...quellen(), abruf: b.abruf },
    )
    const koerper = JSON.parse(b.gesendet[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(koerper['zugriff']).toBe('schreiben')
    // Leerzeichen werden abgeschnitten — sonst stünde der Name mit Leerraum in der Datenbank.
    expect(koerper['bezeichnung']).toBe('Ablage')
  })

  test('eine leere Bezeichnung wird weggelassen', async () => {
    const b = buehne({ ok: true, value: { id: 'x', pfad: 'p', istPrimaer: false, zugriff: 'lesen' } })
    await legeOrdnerAn({ workspaceId: 'w', pfad: 'p', bezeichnung: '   ' }, { ...quellen(), abruf: b.abruf })
    expect(Object.hasOwn(JSON.parse(b.gesendet[0]?.koerper ?? '{}') as object, 'bezeichnung')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Zugriff und Entfernen
// ---------------------------------------------------------------------------

describe('Zugriff und Entfernen', () => {
  test('der Zugriff geht an seinen Weg — mit id und zugriff', async () => {
    const b = buehne({ ok: true, value: { id: 'f1', zugriff: 'lesen' } })
    const ergebnis = await setzeZugriff('f1', 'lesen', { ...quellen(), abruf: b.abruf })
    expect(b.gesendet[0]?.adresse).toBe(PFAD_ORDNER_ZUGRIFF)
    expect(JSON.parse(b.gesendet[0]?.koerper ?? '{}')).toEqual({ id: 'f1', zugriff: 'lesen' })
    expect(ergebnis).toEqual({ id: 'f1', zugriff: 'lesen' })
  })

  test('das Entfernen geht an seinen Weg — mit der id', async () => {
    const b = buehne({ ok: true, value: { entfernt: true } })
    await entferneOrdner('f1', { ...quellen(), abruf: b.abruf })
    expect(b.gesendet[0]?.adresse).toBe(PFAD_ORDNER_ENTFERNEN)
    expect(JSON.parse(b.gesendet[0]?.koerper ?? '{}')).toEqual({ id: 'f1' })
  })

  test('entfernen liefert nichts zurück — und wirft auch bei leerem Wert nicht', async () => {
    const b = buehne({ ok: true, value: null })
    await entferneOrdner('f1', { ...quellen(), abruf: b.abruf })
    expect(b.gesendet.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 4. Was abgelehnt wird
// ---------------------------------------------------------------------------

describe('Was abgelehnt wird', () => {
  test('DER STILLE FALL: ohne CSRF-Wert wird GAR NICHT gesendet', async () => {
    // Ein Aufruf ohne CSRF gibt 403 `csrf-fehlt` — und der sähe wie ein Rechteproblem aus. Hier
    // steht die wahre Ursache, und es geht nichts hinaus.
    const b = buehne({ ok: true, value: {} })
    const fehler = await setzeZugriff('f1', 'lesen', { csrf: () => undefined, abruf: b.abruf }).catch(
      (e: unknown) => e,
    )
    expect(fehler).toBeInstanceOf(QuellordnerFehler)
    expect((fehler as QuellordnerFehler).code).toBe('csrf-fehlt')
    expect((fehler as Error).message).toContain('GAR NICHT gesendet')
    expect(b.gesendet.length).toBe(0)
  })

  test('ein leerer CSRF-Wert zählt NICHT als Wert', async () => {
    const b = buehne({ ok: true, value: {} })
    await expect(entferneOrdner('f1', { csrf: () => '   ', abruf: b.abruf })).rejects.toThrow('kein CSRF')
    expect(b.gesendet.length).toBe(0)
  })

  test('der CSRF-Wert wird bei JEDEM Aufruf neu geholt', async () => {
    // Ein einmal gelesener Wert veraltet nach einer neuen Anmeldung — und dann scheitert jeder
    // ändernde Aufruf mit 403, an einer Stelle, die niemand mit der Anmeldung verbindet.
    let zaehler = 0
    const b = buehne({ ok: true, value: { id: 'x', pfad: 'p', istPrimaer: false, zugriff: 'lesen' } })
    const optionen = {
      csrf: () => `wert-${String(++zaehler)}`,
      abruf: b.abruf,
    }
    await legeOrdnerAn({ workspaceId: 'w', pfad: 'p' }, optionen)
    await legeOrdnerAn({ workspaceId: 'w', pfad: 'p' }, optionen)
    expect(b.gesendet[0]?.kopf[CSRF_KOPF]).toBe('wert-1')
    expect(b.gesendet[1]?.kopf[CSRF_KOPF]).toBe('wert-2')
  })

  test('ein Fehler des Servers kommt mit SEINEM Code durch', async () => {
    const b = buehne({ ok: false, error: { code: 'pfad-schon-da', message: 'Diesen Pfad gibt es schon.' } }, 409)
    const fehler = await legeOrdnerAn({ workspaceId: 'w', pfad: 'p' }, { ...quellen(), abruf: b.abruf }).catch(
      (e: unknown) => e,
    )
    expect(fehler).toBeInstanceOf(QuellordnerFehler)
    // Der Code des Servers, nicht ein geratener: `pfad-schon-da` heißt dem Nutzer etwas.
    expect((fehler as QuellordnerFehler).code).toBe('pfad-schon-da')
    expect((fehler as QuellordnerFehler).status).toBe(409)
    expect((fehler as Error).message).toBe('Diesen Pfad gibt es schon.')
  })

  test('die nicht angemeldete Lage kommt als `nicht-angemeldet`', async () => {
    const b = buehne({ ok: false, error: { code: 'nicht-angemeldet', message: 'Nicht angemeldet.' } }, 401)
    const fehler = await listeOrdner('w', { ...quellen(), abruf: b.abruf }).catch((e: unknown) => e)
    expect((fehler as QuellordnerFehler).code).toBe('nicht-angemeldet')
  })

  test('eine Antwort ohne JSON fliegt auf — statt still nichts zu tun', async () => {
    const abruf: Abruf = async () => new Response('<html>Tor</html>', { status: 200 })
    const fehler = await listeOrdner('w', { ...quellen(), abruf }).catch((e: unknown) => e)
    expect((fehler as QuellordnerFehler).code).toBe('kein-json')
  })

  test('eine fremde Hülle ergibt `unbekannt` — nicht einen erfundenen Code', async () => {
    const b = buehne({ irgendwas: true })
    const fehler = await listeOrdner('w', { ...quellen(), abruf: b.abruf }).catch((e: unknown) => e)
    expect((fehler as QuellordnerFehler).code).toBe('unbekannt')
  })
})
