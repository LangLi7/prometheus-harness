/**
 * Prüfungen des Speichers **ohne** Datenbank.
 *
 * **Warum das geht und warum es sein muß.** Dieser Speicher ist die Übersetzung
 * zwischen zwei Welten: PostgreSQL liefert `Date`, `inet` und `jsonb` — der
 * Regelkern verlangt ISO-8601-**Text**, optionale Werte und `undefined`. Genau
 * an diesen Übergängen entstehen die Fehler, die niemand bemerkt: ein `Date`, wo
 * ein Text erwartet wird, sieht richtig aus und vergleicht still falsch.
 *
 * Deshalb prüfen diese Tests die **Übergänge** gegen eine Attrappe — nicht die
 * Regeln der Anmeldung (die liegen in `@prometheus-harness/auth` und haben dort
 * ihre 51 Prüfungen) und nicht das SQL selbst (das prüft
 * `tests/postgres.test.ts` gegen eine echte Datenbank).
 */

import { describe, expect, test } from 'bun:test'
import {
  alsIp,
  alsIso,
  alsIsoOderNichts,
  alsJson,
  erzeugeSessionStore,
  erzeugeSpeicher,
  erzeugeSpurensenke,
  erzeugeUserStore,
  istDoppelt,
  zaehleAdmins,
  type SqlZugang,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Die Attrappe
// ---------------------------------------------------------------------------

interface Aufruf {
  readonly anweisung: string
  readonly werte: readonly unknown[]
}

/**
 * Ein Zugang, der die Anweisungen **mitschreibt** und vorbereitete Zeilen
 * zurückgibt.
 *
 * Die Antworten werden **der Reihe nach** verbraucht. Eine Antwort darf ein
 * `Error` sein — dann wirft die Attrappe ihn, und damit ist ein Fehlerfall
 * prüfbar, ohne eine echte Datenbank in einen Fehler zu bringen.
 */
function attrappe(antworten: readonly unknown[] = []): SqlZugang & { readonly aufrufe: Aufruf[] } {
  const aufrufe: Aufruf[] = []
  let nummer = 0
  return {
    aufrufe,
    async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
      aufrufe.push({ anweisung, werte })
      const antwort = antworten[nummer] ?? []
      nummer += 1
      if (antwort instanceof Error) throw antwort
      return antwort
    },
  }
}

/** Ein Fehler, wie ihn der Treiber bei einer Verletzung liefert. */
function pgFehler(code: string): Error & { code: string } {
  const fehler = new Error(`Attrappe: PostgreSQL ${code}`) as Error & { code: string }
  fehler.code = code
  return fehler
}

// ---------------------------------------------------------------------------
// Zeitpunkte
// ---------------------------------------------------------------------------

describe('Zeitpunkte: Date hinein, Text heraus', () => {
  test('wandelt ein Date in ISO-8601-Text', () => {
    // **Der Fehler, den dieser Test verhindert.** Der Treiber liefert für
    // `timestamptz` ein `Date`. Bliebe es stehen, hätte `SessionRecord.createdAt`
    // zur Laufzeit ein `Date`, obwohl der Typ `string` sagt — und `verifySession`
    // vergliche später ein Date mit einem Text.
    const zeit = new Date('2026-10-13T20:15:30.000Z')
    expect(alsIso(zeit)).toBe('2026-10-13T20:15:30.000Z')
    expect(typeof alsIso(zeit)).toBe('string')
  })

  test('nimmt auch einen Text unverändert an', () => {
    expect(alsIso('2026-10-13T20:15:30.000Z')).toBe('2026-10-13T20:15:30.000Z')
  })

  test('macht aus null undefined — so verlangt es die Schnittstelle', () => {
    expect(alsIsoOderNichts(null)).toBeUndefined()
    expect(alsIsoOderNichts(undefined)).toBeUndefined()
    expect(alsIsoOderNichts(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// IP-Adressen
// ---------------------------------------------------------------------------

describe('IP-Adressen: leerer Text ist kein gültiger inet-Wert', () => {
  test('macht aus undefined ein NULL', () => {
    expect(alsIp(undefined)).toBeNull()
  })

  test('macht aus einem leeren Text ein NULL — nicht einen leeren Text', () => {
    // **Warum das der wichtige Fall ist.** Die Spalte `ip_first_seen` ist `inet`.
    // PostgreSQL weist einen leeren Text ab. Wer ihn durchreicht, bekommt den
    // Fehler erst beim Anlegen der Sitzung — also beim Anmelden, nicht beim
    // Bauen. `NULL` ist genau das Gemeinte: „nicht bekannt".
    expect(alsIp('')).toBeNull()
    expect(alsIp('   ')).toBeNull()
  })

  test('schneidet Leerraum ab und reicht die Adresse durch', () => {
    expect(alsIp(' 203.0.113.7 ')).toBe('203.0.113.7')
    expect(alsIp('2001:db8::1')).toBe('2001:db8::1')
  })
})

// ---------------------------------------------------------------------------
// jsonb
// ---------------------------------------------------------------------------

describe('jsonb: als Text mit Typangabe', () => {
  test('macht aus undefined ein NULL', () => {
    expect(alsJson(undefined)).toBeNull()
  })

  test('schreibt ein Objekt als JSON-Text', () => {
    // Ohne Typangabe erkennt der Server ein JavaScript-Objekt nicht als JSON;
    // die Anweisung gießt den Text mit `::jsonb`.
    expect(alsJson({ grund: 'rate-limit', zahl: 3 })).toBe('{"grund":"rate-limit","zahl":3}')
  })
})

// ---------------------------------------------------------------------------
// Die Eindeutigkeit — und NUR die Eindeutigkeit
// ---------------------------------------------------------------------------

describe('istDoppelt', () => {
  test('erkennt genau 23505', () => {
    expect(istDoppelt(pgFehler('23505'))).toBe(true)
  })

  test('hält jeden anderen Fehler für keinen Doppeleintrag', () => {
    // 23503 ist eine verletzte Fremdschlüsselregel, 23502 ein fehlender Pflichtwert.
    expect(istDoppelt(pgFehler('23503'))).toBe(false)
    expect(istDoppelt(pgFehler('23502'))).toBe(false)
    expect(istDoppelt(new Error('Verbindung weg'))).toBe(false)
    expect(istDoppelt(undefined)).toBe(false)
    expect(istDoppelt('kein Fehler')).toBe(false)
  })
})

describe('Benutzer anlegen: nur die vergebene Adresse wird geschluckt', () => {
  test('gibt bei einer vergebenen Adresse undefined zurück', async () => {
    const sql = attrappe([pgFehler('23505')])
    const store = erzeugeUserStore(sql)
    const ergebnis = await store.create({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.org',
      passwordHash: 'argon2id$…',
      displayName: 'Ada',
    })
    expect(ergebnis).toBeUndefined()
  })

  test('läßt JEDEN anderen Fehler fliegen', async () => {
    // **Der gefährliche Fall.** Wer hier pauschal `undefined` zurückgibt,
    // verwandelt einen Ausfall in „diese Adresse gibt es schon". Der Benutzer
    // sucht den Fehler dann bei sich, und die Spur zeigt nichts.
    const sql = attrappe([pgFehler('23503')])
    const store = erzeugeUserStore(sql)
    await expect(
      store.create({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'ada@example.org',
        passwordHash: 'argon2id$…',
        displayName: 'Ada',
      }),
    ).rejects.toThrow('23503')
  })

  test('gibt die Kennung aus der Datenbank zurück, nicht die hineingereichte', async () => {
    const sql = attrappe([[{ id: '22222222-2222-4222-8222-222222222222' }]])
    const store = erzeugeUserStore(sql)
    const ergebnis = await store.create({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.org',
      passwordHash: 'argon2id$…',
      displayName: 'Ada',
    })
    expect(ergebnis).toBe('22222222-2222-4222-8222-222222222222')
  })

  test('schreibt die Rolle MIT — sonst bleibt sie im Rückgabewert stecken', async () => {
    // **Der gemessene Fehler vom 13.10.2026.** `register` gab
    // `role: options.role ?? 'user'` **zurück**, übergab sie aber nicht an
    // `store.create`. Der Aufrufer bekam „admin" gemeldet, die Datenbank hielt
    // „user" — und der Erstlogin hätte ein Konto gemeldet, mit dem sich nichts
    // verwalten läßt.
    //
    // Diese Prüfung nagelt fest, daß die Rolle in der **Anweisung** steht und
    // nicht nur in einer Absicht.
    const sql = attrappe([[{ id: '22222222-2222-4222-8222-222222222222' }]])
    await erzeugeUserStore(sql).create({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.org',
      passwordHash: 'argon2id$…',
      displayName: 'Ada',
      role: 'admin',
    })
    expect(sql.aufrufe[0]?.anweisung).toContain('role')
    // Position 5 ist `role` — die einzige Stelle, an der die Rolle tatsächlich
    // wirksam wird.
    expect(sql.aufrufe[0]?.werte[4]).toBe('admin')
  })

  test('ohne Angabe wird ein gewöhnlicher Benutzer daraus', async () => {
    // Die Vorgabe entspricht der Spaltenvorgabe des Schemas: wer nichts sagt,
    // bekommt keinen Admin.
    const sql = attrappe([[{ id: '22222222-2222-4222-8222-222222222222' }]])
    await erzeugeUserStore(sql).create({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.org',
      passwordHash: 'argon2id$…',
      displayName: 'Ada',
    })
    expect(sql.aufrufe[0]?.werte[4]).toBe('user')
  })
})

// ---------------------------------------------------------------------------
// Abfragen: gegen den Ausdruck, auf dem der Index liegt
// ---------------------------------------------------------------------------

describe('Benutzer suchen', () => {
  test('sucht gegen lower(email) — nicht gegen email', async () => {
    // Der eindeutige Index heißt `users_email_lower_key ON users (lower(email))`.
    // Eine Abfrage mit `where email = $1` benutzt ihn nicht und findet bei zwei
    // Schreibweisen zwei Zeilen, obwohl die Datenbank sie als eine ansieht.
    const sql = attrappe([[]])
    await erzeugeUserStore(sql).findByEmail('ada@example.org')
    // **Beide Seiten klein.** Nur `lower(email)` zu vergleichen genügt nicht:
    // `findByEmail('DORA@…')` fand nichts, weil der Parameter groß blieb.
    expect(sql.aufrufe[0]?.anweisung).toContain('lower(email) = lower($1)')
  })

  test('gibt undefined zurück, wenn niemand gefunden wurde', async () => {
    expect(await erzeugeUserStore(attrappe([[]])).findByEmail('niemand@example.org')).toBeUndefined()
    expect(await erzeugeUserStore(attrappe([[]])).findById('11111111-1111-4111-8111-111111111111')).toBeUndefined()
  })

  test('wandelt eine gefundene Zeile vollständig um', async () => {
    const sql = attrappe([
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'ada@example.org',
          password_hash: 'argon2id$hash',
          display_name: 'Ada',
          role: 'admin',
          disabled_at: new Date('2026-02-03T04:05:06.000Z'),
        },
      ],
    ])
    const gefunden = await erzeugeUserStore(sql).findByEmail('ada@example.org')
    expect(gefunden).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'ada@example.org',
      passwordHash: 'argon2id$hash',
      displayName: 'Ada',
      role: 'admin',
      disabledAt: '2026-02-03T04:05:06.000Z',
    })
  })

  test('macht aus einem fehlenden Passwort-Hash undefined', async () => {
    const sql = attrappe([
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'ada@example.org',
          password_hash: null,
          display_name: 'Ada',
          role: 'user',
          disabled_at: null,
        },
      ],
    ])
    const gefunden = await erzeugeUserStore(sql).findByEmail('ada@example.org')
    expect(gefunden?.passwordHash).toBeUndefined()
    expect(gefunden?.disabledAt).toBeUndefined()
  })

  test('zählt Benutzer als Zahl, auch wenn keine Zeile kommt', async () => {
    expect(await erzeugeUserStore(attrappe([[]])).count()).toBe(0)
    expect(await erzeugeUserStore(attrappe([[{ n: 7 }]])).count()).toBe(7)
  })

  test('zählt Administratoren — und zwar NUR Administratoren', async () => {
    // **Warum das eine eigene Frage ist.** „Gibt es Konten?" und „gibt es jemanden,
    // der verwalten darf?" sind zwei verschiedene Dinge. Gemessen am 13.10.2026:
    // `benutzer=4  davon_admins=0` — dort konnte niemand mehr ein Konto anlegen,
    // weil die Erstinbetriebnahme nach der Kontenzahl beurteilt wurde.
    const sql = attrappe([[{ n: 2 }]])
    expect(await zaehleAdmins(sql)).toBe(2)
    // Die Bedingung steht in der Anweisung — nicht in einer Absicht.
    expect(sql.aufrufe[0]?.anweisung).toContain(`role = 'admin'`)
  })

  test('ohne Administrator ist die Zahl null, nicht undefiniert', async () => {
    expect(await zaehleAdmins(attrappe([[]]))).toBe(0)
  })

  test('schreibt den Passwort-Hash fort und rührt updated_at an', async () => {
    const sql = attrappe([[]])
    await erzeugeUserStore(sql).updatePasswordHash('11111111-1111-4111-8111-111111111111', 'neu')
    expect(sql.aufrufe[0]?.anweisung).toContain('updated_at = now()')
    expect(sql.aufrufe[0]?.werte[1]).toBe('neu')
  })
})

// ---------------------------------------------------------------------------
// Sitzungen
// ---------------------------------------------------------------------------

describe('Sitzungen lesen', () => {
  test('wandelt eine gefundene Sitzung vollständig um — alle Zeitpunkte als Text', async () => {
    const sql = attrappe([
      [
        {
          id: '33333333-3333-4333-8333-333333333333',
          user_id: '11111111-1111-4111-8111-111111111111',
          token_hash: 'a'.repeat(64),
          csrf_hash: 'b'.repeat(64),
          user_agent: 'Prüfgerät',
          ip_first_seen: '203.0.113.7',
          idle_expires_at: new Date('2026-10-14T08:00:00.000Z'),
          absolute_expires_at: new Date('2026-11-12T20:00:00.000Z'),
          created_at: new Date('2026-10-13T20:00:00.000Z'),
          last_seen_at: new Date('2026-10-13T20:00:00.000Z'),
          revoked_at: null,
          revoked_reason: null,
        },
      ],
    ])
    const gefunden = await erzeugeSessionStore(sql).findByTokenHash('a'.repeat(64))
    expect(gefunden).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      userId: '11111111-1111-4111-8111-111111111111',
      tokenHash: 'a'.repeat(64),
      csrfHash: 'b'.repeat(64),
      userAgent: 'Prüfgerät',
      ipFirstSeen: '203.0.113.7',
      idleExpiresAt: '2026-10-14T08:00:00.000Z',
      absoluteExpiresAt: '2026-11-12T20:00:00.000Z',
      createdAt: '2026-10-13T20:00:00.000Z',
      lastSeenAt: '2026-10-13T20:00:00.000Z',
      revokedAt: undefined,
      revokedReason: undefined,
    })
  })

  test('sucht über den Token-Hash und liest die IP mit host(), nicht mit ::text', async () => {
    const sql = attrappe([[]])
    await erzeugeSessionStore(sql).findByTokenHash('c'.repeat(64))
    expect(sql.aufrufe[0]?.anweisung).toContain('WHERE token_hash = $1')
    // **Gemessen:** `('203.0.113.7'::inet)::text` ergibt `203.0.113.7/32` — mit
    // Netzmaske. `host()` ergibt `203.0.113.7`. Ohne diesen Unterschied käme eine
    // Sitzung anders zurück, als sie angelegt wurde.
    expect(sql.aufrufe[0]?.anweisung).toContain('host(ip_first_seen)')
    expect(sql.aufrufe[0]?.anweisung).not.toContain('ip_first_seen::text')
  })
})

describe('Sitzungen schreiben', () => {
  const sitzung = {
    id: '33333333-3333-4333-8333-333333333333',
    userId: '11111111-1111-4111-8111-111111111111',
    tokenHash: 'a'.repeat(64),
    csrfHash: 'b'.repeat(64),
    userAgent: '',
    ipFirstSeen: undefined,
    idleExpiresAt: '2026-10-14T08:00:00.000Z',
    absoluteExpiresAt: '2026-11-12T20:00:00.000Z',
    createdAt: '2026-10-13T20:00:00.000Z',
    lastSeenAt: '2026-10-13T20:00:00.000Z',
    revokedAt: undefined,
    revokedReason: undefined,
  }

  test('schickt für eine unbekannte IP ein NULL und keinen leeren Text', async () => {
    const sql = attrappe([[]])
    await erzeugeSessionStore(sql).create(sitzung)
    const werte = sql.aufrufe[0]?.werte ?? []
    // Position 6 ist `ip_first_seen`, gegossen mit `::inet`.
    expect(werte[5]).toBeNull()
    expect(sql.aufrufe[0]?.anweisung).toContain('$6::inet')
  })

  test('widerruft nur, was noch nicht widerrufen ist', async () => {
    // Der **erste** Widerrufszeitpunkt ist der aussagekräftige. Ein
    // Überschreiben machte aus „wann wurde sie beendet" ein „wann hat jemand
    // zuletzt auf Abmelden gedrückt".
    const sql = attrappe([[]])
    await erzeugeSessionStore(sql).revoke('33333333-3333-4333-8333-333333333333', '2026-10-13T21:00:00.000Z', 'logout')
    expect(sql.aufrufe[0]?.anweisung).toContain('revoked_at IS NULL')
  })

  test('zählt beim Sammelwiderruf das Getroffene, nicht das Vorhandene', async () => {
    const sql = attrappe([[{ id: 'a' }, { id: 'b' }]])
    const anzahl = await erzeugeSessionStore(sql).revokeAllForUser(
      '11111111-1111-4111-8111-111111111111',
      '2026-10-13T21:00:00.000Z',
      'password-change',
    )
    expect(anzahl).toBe(2)
    expect(sql.aufrufe[0]?.anweisung).toContain('RETURNING id')
  })

  test('schreibt den Nutzungszeitpunkt fort', async () => {
    const sql = attrappe([[]])
    await erzeugeSessionStore(sql).touch(
      '33333333-3333-4333-8333-333333333333',
      '2026-10-13T20:30:00.000Z',
      '2026-10-14T08:30:00.000Z',
    )
    expect(sql.aufrufe[0]?.anweisung).toContain('last_seen_at = $2')
    expect(sql.aufrufe[0]?.werte).toHaveLength(3)
  })

  test('ersetzt Token- und CSRF-Hash bei der Rotation', async () => {
    const sql = attrappe([[]])
    await erzeugeSessionStore(sql).replaceToken(
      '33333333-3333-4333-8333-333333333333',
      'd'.repeat(64),
      'e'.repeat(64),
    )
    expect(sql.aufrufe[0]?.anweisung).toContain('token_hash = $2')
    expect(sql.aufrufe[0]?.anweisung).toContain('csrf_hash = $3')
  })
})

// ---------------------------------------------------------------------------
// Die Prüfspur
// ---------------------------------------------------------------------------

describe('Prüfspur', () => {
  test('schreibt Art, Adresse und IP — und gießt die IP mit ::inet', async () => {
    const sql = attrappe([[]])
    await erzeugeSpurensenke(sql).record({
      kind: 'login-failed',
      email: 'ada@example.org',
      ip: '203.0.113.7',
      userAgent: 'Prüfgerät',
    })
    expect(sql.aufrufe[0]?.anweisung).toContain('$4::inet')
    expect(sql.aufrufe[0]?.werte[1]).toBe('login-failed')
    expect(sql.aufrufe[0]?.werte[3]).toBe('203.0.113.7')
  })

  test('kommt ohne Benutzer, Adresse und IP aus', async () => {
    const sql = attrappe([[]])
    await erzeugeSpurensenke(sql).record({ kind: 'logout' })
    const werte = sql.aufrufe[0]?.werte ?? []
    expect(werte[0]).toBeNull()
    expect(werte[2]).toBeNull()
    expect(werte[3]).toBeNull()
    expect(werte[5]).toBeNull()
  })

  test('legt ein detail-Objekt als JSON-Text ab, nicht als Objekt', async () => {
    const sql = attrappe([[]])
    await erzeugeSpurensenke(sql).record({ kind: 'login-failed', detail: { versuche: 3 } })
    expect(sql.aufrufe[0]?.werte[5]).toBe('{"versuche":3}')
    expect(sql.aufrufe[0]?.anweisung).toContain('$6::jsonb')
  })
})

// ---------------------------------------------------------------------------
// Alles zusammen
// ---------------------------------------------------------------------------

describe('erzeugeSpeicher', () => {
  test('baut alle drei Speicher über demselben Zugang', async () => {
    // **Warum das geprüft wird.** Drei getrennt gebaute Speicher über drei
    // Zugänge wären drei Gelegenheiten, versehentlich in zwei Datenbanken zu
    // schreiben — eine Anmeldung, deren Sitzung in einer anderen Datenbank liegt
    // als ihr Benutzer, fällt erst beim nächsten Neustart auf.
    const sql = attrappe([[], [], []])
    const speicher = erzeugeSpeicher(sql)
    await speicher.benutzer.count()
    await speicher.sitzungen.findById('33333333-3333-4333-8333-333333333333')
    await speicher.spur.record({ kind: 'logout' })
    expect(sql.aufrufe).toHaveLength(3)
  })
})
