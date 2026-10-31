/**
 * Prüfungen für den **Betreiber-Weg** — aus dem Token des Wirts eine Sitzung.
 *
 * ## Warum diese Prüfungen wichtig sind
 *
 * Der Weg ist eine **Abkürzung an der stärksten Tür**: wer den Token hat, ist
 * ohnehin alles. Trotzdem darf die Abkürzung nicht mehr erlauben, als sie soll:
 *
 * | Fall | Erwartung |
 * |---|---|
 * | kein Token | **401** — der Weg ist kein Ersatz für die Anmeldung |
 * | kein aktives Adminkonto | **409** |
 * | mehrere Admins, keine Wahl | **409** mit der Liste — keine Vermutung, wer gemeint ist |
 * | mehrere Admins, gültige Wahl | **200** mit beiden Keksen |
 * | Wahl ist kein aktiver Verwalter | **403** |
 * | genau ein Admin | **200** mit beiden Keksen |
 *
 * **Was hier NICHT geprüft wird.** Ob der Token echt ist. Das entscheidet der
 * Kern (`authorizeIndex`), und der Weg bekommt die Antwort nur als `beweis`
 * herein — genau deshalb ist er ohne Server und ohne Datenbank prüfbar.
 */
import { describe, expect, test } from 'bun:test'
import type { AuthEvent, AuthEventSink, SessionStore, UserStore } from '@prometheus-harness/auth'
import { betreiberAnmelden, type Umgebung } from '../src/paths.ts'

const JETZT = new Date('2026-10-21T12:00:00.000Z')

/** Ein Sitzungsspeicher, der nichts tut — `createSession` schreibt nur. */
const sitzungen: SessionStore = {
  findByTokenHash: async () => undefined,
  findById: async () => undefined,
  create: async () => undefined,
  touch: async () => undefined,
  revoke: async () => undefined,
  revokeAllForUser: async () => 0,
  replaceToken: async () => undefined,
}

/** Ein Benutzerspeicher, der nichts tut; die Liste kommt aus `listeBenutzer`. */
const benutzer = {
  findByEmail: async () => undefined,
  findById: async () => undefined,
  create: async () => undefined,
  updatePasswordHash: async () => undefined,
  count: async () => 1,
} as unknown as UserStore

/** Die Spur merkt sich, was geschrieben wurde. */
function spur(): AuthEventSink & { readonly eintraege: AuthEvent[] } {
  const eintraege: AuthEvent[] = []
  return {
    eintraege,
    async record(ereignis) {
      eintraege.push(ereignis)
    },
  }
}

function umgebung(konten: readonly { id: string; email: string; role: 'user' | 'admin'; gesperrt: boolean }[]): {
  readonly umg: Umgebung
  readonly spur: AuthEventSink & { readonly eintraege: AuthEvent[] }
} {
  const senke = spur()
  return {
    spur: senke,
    umg: {
      speicher: {
        benutzer,
        sitzungen,
        spur: senke,
        anzahlAdmins: async () => konten.filter((k) => k.role === 'admin').length,
        ladeProfil: async () => undefined,
        einladungen: {
          legeAb: async () => {
            throw new Error('nicht benutzt')
          },
          findeNachHash: async () => undefined,
          liste: async () => [],
          zaehleOffen: async () => 0,
          verbrauche: async () => false,
          bestaetige: async () => false,
          gibFrei: async () => false,
          ziehZurueck: async () => false,
        },
        listeBenutzer: async (grenze) =>
          konten.slice(0, grenze).map((k) => ({
            id: k.id,
            email: k.email,
            displayName: '',
            role: k.role,
            disabledAt: k.gesperrt ? JETZT.toISOString() : undefined,
            createdAt: '2026-10-01T00:00:00.000Z',
          })),
        setzeGesperrt: async () => false,
        loescheBenutzer: async () => false,
        setzeRolle: async () => false,
        tokenAblage: {
          legeAb: async () => undefined,
          finde: async () => undefined,
          verbrauche: async () => false,
          zaehleSeit: async () => 0,
        },
      },
      hasher: {
        hash: async () => 'x',
        verify: async () => false,
      },
      limiter: {
        hit: async () => ({ allowed: true, count: 1, limit: 10, remaining: 9, retryAfterMs: 0 }),
        reset: async () => undefined,
        clear: async () => undefined,
      },
      sicher: false,
      maxUsers: undefined,
      jetzt: () => JETZT,
      warten: async () => undefined,
      home: 'C:/tmp',
      claimAblage: {
        legeAb: async () => undefined,
        liesJüngsten: async () => undefined,
        verbrauche: async () => undefined,
      },
    },
  }
}

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', email: 'a@example.org', role: 'admin' as const, gesperrt: false }

describe('betreiberAnmelden', () => {
  test('ohne Token: 401 — kein Ersatz für die Anmeldung', async () => {
    const { umg } = umgebung([ADMIN])
    const antwort = await betreiberAnmelden(umg, { beweis: false, ip: '127.0.0.1', userAgent: undefined })
    expect(antwort.status).toBe(401)
    const koerper = antwort.koerper as { error?: { code?: string } }
    expect(koerper.error?.code).toBe('kein-token')
    expect(antwort.koepfe['set-cookie']).toBeUndefined()
  })

  test('ohne aktives Adminkonto: 409, keine Sitzung', async () => {
    const { umg } = umgebung([{ ...ADMIN, role: 'user' }])
    const antwort = await betreiberAnmelden(umg, { beweis: true, ip: '127.0.0.1', userAgent: undefined })
    expect(antwort.status).toBe(409)
    const koerper = antwort.koerper as { error?: { code?: string } }
    expect(koerper.error?.code).toBe('kein-admin-konto')
    expect(antwort.koepfe['set-cookie']).toBeUndefined()
  })

  test('ein GESPERRTER Admin zählt nicht', async () => {
    const { umg } = umgebung([{ ...ADMIN, gesperrt: true }])
    const antwort = await betreiberAnmelden(umg, { beweis: true, ip: '127.0.0.1', userAgent: undefined })
    expect(antwort.status).toBe(409)
  })

  test('mehrere Admins ohne Wahl: 409 mit der Liste — keine Vermutung über die Identität', async () => {
    const zweiter = { ...ADMIN, id: '00000000-0000-4000-8000-000000000002', email: 'b@example.org' }
    const { umg } = umgebung([ADMIN, zweiter])
    const antwort = await betreiberAnmelden(umg, { beweis: true, ip: '127.0.0.1', userAgent: undefined })
    expect(antwort.status).toBe(409)
    const koerper = antwort.koerper as {
      error?: { code?: string }
      konten?: readonly { id: string; email: string }[]
    }
    expect(koerper.error?.code).toBe('mehrere-admins')
    // **Die Liste ist die Wahl.** Ohne sie wäre der 409 eine Sackgasse: der
    // Aufrufer wüßte nicht, welche Kennung er nennen darf.
    expect(koerper.konten?.map((k) => k.id)).toEqual([ADMIN.id, zweiter.id])
    expect(antwort.koepfe['set-cookie']).toBeUndefined()
  })

  test('mehrere Admins mit ausdrücklicher Wahl: Sitzung für das genannte Konto', async () => {
    const zweiter = { ...ADMIN, id: '00000000-0000-4000-8000-000000000002', email: 'b@example.org' }
    const { umg, spur: senke } = umgebung([ADMIN, zweiter])
    const antwort = await betreiberAnmelden(umg, {
      beweis: true,
      ip: '127.0.0.1',
      userAgent: 'probe',
      userId: zweiter.id,
    })
    expect(antwort.status).toBe(200)
    const eintrag = senke.eintraege.find((e) => e.kind === 'login-success')
    expect(eintrag?.userId).toBe(zweiter.id)
    expect(eintrag?.detail?.['ueber']).toBe('token-tuer')
  })

  test('die Wahl muß ein aktiver Verwalter sein: sonst 403', async () => {
    const zweiter = { ...ADMIN, id: '00000000-0000-4000-8000-000000000002', email: 'b@example.org' }
    const einfacher = { ...ADMIN, id: '00000000-0000-4000-8000-000000000003', email: 'c@example.org', role: 'user' as const }
    const gesperrt = { ...ADMIN, id: '00000000-0000-4000-8000-000000000004', email: 'd@example.org', gesperrt: true }
    const { umg } = umgebung([ADMIN, zweiter, einfacher, gesperrt])

    for (const falsch of [einfacher.id, gesperrt.id, 'gibt-es-nicht']) {
      const antwort = await betreiberAnmelden(umg, {
        beweis: true,
        ip: '127.0.0.1',
        userAgent: undefined,
        userId: falsch,
      })
      expect(antwort.status).toBe(403)
      const koerper = antwort.koerper as { error?: { code?: string } }
      expect(koerper.error?.code).toBe('kein-verwalter')
      expect(antwort.koepfe['set-cookie']).toBeUndefined()
    }
  })

  test('genau ein Admin: Sitzung mit beiden Keksen, Spur nennt den Weg', async () => {
    const { umg, spur: senke } = umgebung([ADMIN])
    const antwort = await betreiberAnmelden(umg, { beweis: true, ip: '127.0.0.1', userAgent: 'probe' })
    expect(antwort.status).toBe(200)
    const koepfe = antwort.koepfe['set-cookie']
    expect(Array.isArray(koepfe)).toBe(true)
    expect((koepfe as readonly string[]).length).toBe(2)
    // **Beide Kekse sind `HttpOnly`?** Nein: der CSRF-Keks MUSS lesbar sein —
    // sonst könnte die Seite den Kopf nicht setzen.
    const texte = koepfe as readonly string[]
    expect(texte.some((k) => k.startsWith('pmh_session='))).toBe(true)
    expect(texte.some((k) => k.startsWith('pmh_csrf='))).toBe(true)
    expect(texte.find((k) => k.startsWith('pmh_csrf='))?.includes('HttpOnly')).toBe(false)

    const eintrag = senke.eintraege.find((e) => e.kind === 'login-success')
    expect(eintrag?.userId).toBe(ADMIN.id)
    expect(eintrag?.detail?.['ueber']).toBe('token-tuer')
  })
})
