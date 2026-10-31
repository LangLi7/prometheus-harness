import { describe, expect, test } from 'bun:test'
import { mainSessionId } from '../src/lage.ts'

describe('lage', () => {
  test('die gehaltene Sitzung wird gefunden', () => {
    expect(
      mainSessionId({
        a: { sessionId: 'a', retainedBy: {} },
        b: { sessionId: 'b', retainedBy: { mainView: 1 } },
        c: { sessionId: 'c', retainedBy: { mainView: 2 } },
      }),
    ).toBe('b')
  })

  test('ohne Haltung: keine Sitzung', () => {
    expect(mainSessionId({ a: { sessionId: 'a', retainedBy: {} } })).toBeNull()
    expect(mainSessionId({ a: { sessionId: 'a' } })).toBeNull()
    expect(mainSessionId({})).toBeNull()
  })

  test('ein Zähler von 0 ist nicht gehalten', () => {
    expect(mainSessionId({ a: { sessionId: 'a', retainedBy: { mainView: 0 } } })).toBeNull()
  })

  test('kaputte Zeilen werden übersprungen, nicht geworfen', () => {
    expect(mainSessionId({ a: null, b: { sessionId: '' } } as unknown as Record<string, { sessionId: string }>)).toBeNull()
  })
})
