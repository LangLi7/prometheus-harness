/**
 * Prüfungen für `@prometheus-harness/permissions`.
 *
 * **Warum diese Datei der eigentliche Nachweis ist.** Die Weisung lautet: *„der
 * harness & agent spiegelt der befugnisse vom User Permission selbst. somit läuft
 * der agent harness nicht amok mit anfrage eine normale user und Harness selbst zb
 * mit admin permission"*. Eine Rechteprüfung ohne Prüfung **ist** die Lücke, die
 * sie schließen soll. Hier stehen die Fälle — **einschließlich der Angriffe**.
 */
import { describe, expect, test } from 'bun:test'

import {
  ADMIN_AKTIONEN,
  aktionsSchluessel,
  adminProfil,
  darfAusfuehren,
  freigabeText,
  liegtIn,
  normalisiere,
  pruefeUnterschrift,
  unterschreibeFreigabe,
  vorgabeProfil,
  type Akteur,
  type Aktion,
  type Freigabe,
  type Isolation,
} from '../src/index.ts'

const JETZT = new Date('2026-10-13T12:00:00.000Z')
const GEHEIM = 'ein-pruefschluessel-nur-fuer-die-pruefung'

/** Ein normaler Benutzer mit dem Vorgabeprofil. */
function benutzer(userId = 'benutzer-1'): Akteur {
  return { userId, rolle: 'user', isolation: vorgabeProfil(`/home/${userId}`) }
}

/** Ein Administrator. */
function admin(): Akteur {
  return { userId: 'admin-1', rolle: 'admin', isolation: adminProfil(['/home', '/srv']) }
}

/** Ein Profil nach Wunsch. */
function profil(teile: Partial<Isolation> = {}): Isolation {
  return {
    dateizugriff: 'read-write',
    lesewurzeln: ['/home/u1'],
    schreibwurzeln: ['/home/u1/workspace'],
    netz: false,
    prozesse: false,
    ...teile,
  }
}

/** Eine gültige Freigabe für eine Aktion. */
function freigabeFuer(aktion: Aktion, teile: Partial<Omit<Freigabe, 'unterschrift'>> = {}): Freigabe {
  const ohne = {
    vonUserId: 'admin-1',
    aktionsschluessel: aktionsSchluessel(aktion),
    erteiltAm: '2026-10-13T11:59:00.000Z',
    giltSekunden: 300,
    ...teile,
  }
  return { ...ohne, unterschrift: unterschreibeFreigabe(ohne, GEHEIM) }
}

// ---------------------------------------------------------------------------
// Pfadbehandlung
// ---------------------------------------------------------------------------

describe('normalisiere', () => {
  test('macht aus Backslashes Trenner', () => {
    expect(normalisiere('C:\\Users\\u1\\a.txt')).toBe('C:/Users/u1/a.txt')
  })

  test('verrechnet . und ..', () => {
    expect(normalisiere('/home/u1/./a/../b.txt')).toBe('/home/u1/b.txt')
  })

  test('behält führende .. oberhalb der Wurzel — sie sollen auffallen, nicht verschwinden', () => {
    // **Der Umgehungsversuch.** Würde `..` hier einfach verrechnet, entstünde
    // `/etc/passwd` und die Enthaltenseinprüfung sähe einen sauberen Pfad.
    expect(normalisiere('/../etc/passwd')).toBe('/../etc/passwd')
    expect(normalisiere('/home/u1/../../../etc/passwd')).toBe('/../etc/passwd')
  })

  test('entfernt doppelte Trenner', () => {
    expect(normalisiere('/home//u1///a')).toBe('/home/u1/a')
  })
})

describe('liegtIn', () => {
  test('nimmt die Wurzel selbst', () => {
    expect(liegtIn('/home/u1', '/home/u1')).toBe(true)
  })

  test('nimmt einen Pfad darunter', () => {
    expect(liegtIn('/home/u1/a/b.txt', '/home/u1')).toBe(true)
  })

  test('nimmt NICHT ein Geschwisterverzeichnis mit passendem Präfix — der startsWith-Fehler', () => {
    // `'/home/u1-boese'.startsWith('/home/u1')` ist **wahr**. Genau deshalb muß
    // nach der Wurzel ein Trenner folgen oder Schluß sein.
    expect(liegtIn('/home/u1-boese/a.txt', '/home/u1')).toBe(false)
  })

  test('weist eine Umgehung mit .. ab', () => {
    expect(liegtIn('/home/u1/../../etc/passwd', '/home/u1')).toBe(false)
  })

  test('ist fallabhängig — auf einem fallunabhängigen Dateisystem weist es damit MEHR ab', () => {
    // Dokumentierte Eigenschaft, kein Fehler: die Richtung ist „zu streng", und
    // das ist bei einer Sicherheitsprüfung die richtige Richtung. Auf Linux ist
    // der Pfad ohnehin fallabhängig.
    expect(liegtIn('/HOME/U1/a.txt', '/home/u1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Der Kern: die Spiegelung der Befugnisse
// ---------------------------------------------------------------------------

describe('Der Agent spiegelt die Befugnisse des Benutzers', () => {
  test('EIN ADMIN-AGENT IM AUFTRAG EINES BENUTZERS HAT NUR DESSEN RECHTE', () => {
    // **Das ist die Prüfung, um die es in der ganzen Weisung geht.** Der Harness
    // läuft als Admin; der Agent führt einen Vorgang für `benutzer-1` aus. Er
    // darf deshalb NICHT in das Home eines anderen schreiben — obwohl der
    // Harness als Admin dürfte.
    //
    // Der Akteur ist hier ausdrücklich `benutzer-1`, NICHT der Harness. Genau
    // diese Zuordnung ist die Sicherheitsentscheidung: nicht der Prozeß zählt,
    // sondern der Auftraggeber.
    const urteil = darfAusfuehren({
      akteur: benutzer('benutzer-1'),
      herkunft: 'benutzer',
      aktion: { art: 'datei-schreiben', pfad: '/home/benutzer-2/geheim.txt' },
      jetzt: JETZT,
      fremdeHomes: ['/home/benutzer-2'],
    })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('fremder-bereich')
  })

  test('der Agent darf genau das, was der Benutzer darf — nicht weniger', () => {
    // Die Umkehrung. Dürfte der Agent WENIGER, wäre das System unbrauchbar und
    // die Regel würde umgangen, indem jemand einen zweiten Weg baut.
    const urteil = darfAusfuehren({
      akteur: benutzer('benutzer-1'),
      herkunft: 'benutzer',
      aktion: { art: 'datei-schreiben', pfad: '/home/benutzer-1/workspace/notiz.md' },
      jetzt: JETZT,
    })
    expect(urteil).toEqual({ erlaubt: true, regel: 'erlaubt' })
  })

  test('ein normaler Benutzer kann keine Admin-Aktion ausführen', () => {
    for (const aktion of [
      { art: 'benutzer-anlegen', email: 'neu@example.org' },
      { art: 'benutzer-aendern', userId: 'benutzer-2' },
      { art: 'benutzer-entfernen', userId: 'benutzer-2' },
      { art: 'profil-aendern', userId: 'benutzer-2' },
      { art: 'plugin-einhaengen', name: 'boeses-plugin' },
      { art: 'policy-aendern', bereich: 'netz' },
    ] as Aktion[]) {
      const urteil = darfAusfuehren({
        akteur: benutzer('benutzer-1'),
        herkunft: 'benutzer',
        aktion,
        jetzt: JETZT,
      })
      expect({ aktion: aktion.art, erlaubt: urteil.erlaubt }).toEqual({
        aktion: aktion.art,
        erlaubt: false,
      })
      expect(ADMIN_AKTIONEN.has(aktion.art)).toBe(true)
    }
  })

  test('ein Admin darf dieselben Aktionen', () => {
    const urteil = darfAusfuehren({
      akteur: admin(),
      herkunft: 'benutzer',
      aktion: { art: 'benutzer-anlegen', email: 'neu@example.org' },
      jetzt: JETZT,
    })
    expect(urteil.erlaubt).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Der Amok-Schutz: der Harness ist keine Befugnis
// ---------------------------------------------------------------------------

describe('Harness-interne Aktionen brauchen eine ausdrückliche Freigabe', () => {
  const aktion: Aktion = { art: 'plugin-einhaengen', name: 'plugin-x' }

  test('OHNE Freigabe abgewiesen — auch wenn der Akteur Admin ist', () => {
    // **Der Kernsatz des Amok-Schutzes:** „der Harness ist der Harness" ist keine
    // Befugnis. Die Rolle des Akteurs genügt bei Herkunft `harness` NICHT.
    const urteil = darfAusfuehren({ akteur: admin(), herkunft: 'harness', aktion, jetzt: JETZT })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('freigabe-fehlt')
  })

  test('mit gültiger Freigabe erlaubt', () => {
    // **Der Prüfschlüssel MUSS mitgegeben werden — und der eigene Fehler, der das
    // bewiesen hat.** Die erste Fassung dieser Prüfung ließ ihn weg; sie wurde
    // **rot**, weil ohne Schlüssel jede Freigabe abgewiesen wird. Das ist die
    // gewollte Richtung (fail-closed): lieber abweisen als raten. Der Fehler lag
    // in der Prüfung, nicht im Code — aber er hat den Schutz nebenbei belegt.
    const urteil = darfAusfuehren(
      {
        akteur: admin(),
        herkunft: 'harness',
        aktion,
        freigabe: freigabeFuer(aktion),
        jetzt: JETZT,
      },
      GEHEIM,
    )
    expect(urteil).toEqual({ erlaubt: true, regel: 'erlaubt' })
  })

  test('eine gefälschte Unterschrift wird abgewiesen', () => {
    const echt = freigabeFuer(aktion)
    const urteil = darfAusfuehren({
      akteur: admin(),
      herkunft: 'harness',
      aktion,
      freigabe: { ...echt, unterschrift: 'f'.repeat(64) },
      jetzt: JETZT,
    })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('freigabe-ungueltig')
  })

  test('eine abgelaufene Freigabe wird abgewiesen', () => {
    const urteil = darfAusfuehren({
      akteur: admin(),
      herkunft: 'harness',
      aktion,
      freigabe: freigabeFuer(aktion, { erteiltAm: '2026-10-13T10:00:00.000Z', giltSekunden: 60 }),
      jetzt: JETZT,
    })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('freigabe-abgelaufen')
  })

  test('eine Freigabe für eine ANDERE Aktion wird abgewiesen', () => {
    // **Warum das geprüft wird.** Eine Freigabe, die für „Netz an" erteilt wurde,
    // darf nicht „Plugin einhängen" öffnen. Ohne diese Bindung wäre jede Freigabe
    // ein Freibrief.
    const andere: Aktion = { art: 'policy-aendern', bereich: 'netz' }
    const urteil = darfAusfuehren({
      akteur: admin(),
      herkunft: 'harness',
      aktion,
      freigabe: freigabeFuer(andere),
      jetzt: JETZT,
    })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('freigabe-fuer-andere-aktion')
  })

  test('ohne Prüfschlüssel wird abgewiesen, nicht geraten', () => {
    const urteil = darfAusfuehren({
      akteur: admin(),
      herkunft: 'harness',
      aktion,
      freigabe: freigabeFuer(aktion),
      jetzt: JETZT,
    })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('freigabe-ungueltig')
  })

  test('die Freigabe ist an FELDER gebunden, nicht nur an die Aktionsart', () => {
    // Zwei Aktionen derselben Art mit anderem Ziel müssen verschiedene Schlüssel
    // haben — sonst öffnete „Plugin A einhängen" auch „Plugin B einhängen".
    const a = aktionsSchluessel({ art: 'plugin-einhaengen', name: 'A' })
    const b = aktionsSchluessel({ art: 'plugin-einhaengen', name: 'B' })
    expect(a).not.toBe(b)
  })

  test('der zu unterschreibende Text ist in EINER Funktion — Unterschreiben und Prüfen können nicht auseinanderlaufen', () => {
    const ohne = {
      vonUserId: 'admin-1',
      aktionsschluessel: aktionsSchluessel(aktion),
      erteiltAm: '2026-10-13T11:59:00.000Z',
      giltSekunden: 300,
    }
    const text = freigabeText(ohne)
    expect(text).toContain('admin-1')
    expect(text).toContain(String(300))
    // Und die Unterschrift darüber muß prüfbar sein.
    const f: Freigabe = { ...ohne, unterschrift: unterschreibeFreigabe(ohne, GEHEIM) }
    expect(pruefeUnterschrift(f, GEHEIM)).toBe(true)
    expect(pruefeUnterschrift(f, 'anderer-schluessel')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Das Isolationsprofil
// ---------------------------------------------------------------------------

describe('Das Isolationsprofil entscheidet', () => {
  const a = (isolation: Isolation, aktion: Aktion) =>
    darfAusfuehren({
      akteur: { userId: 'u1', rolle: 'user', isolation },
      herkunft: 'benutzer',
      aktion,
      jetzt: JETZT,
    })

  test('ein neuer Benutzer hat KEIN Netz — die Vorgabe ist restriktiv', () => {
    const urteil = a(profil(), { art: 'netz-zugriff', ziel: 'https://api.deepseek.com' })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('kein-netz')
  })

  test('ein neuer Benutzer startet KEINE Prozesse', () => {
    const urteil = a(profil(), { art: 'prozess-starten', programm: 'bash' })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('kein-prozessstart')
  })

  test('Lesen außerhalb der Lesewurzel wird abgewiesen', () => {
    const urteil = a(profil(), { art: 'datei-lesen', pfad: '/etc/passwd' })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('nicht-in-lesewurzel')
  })

  test('Schreiben nur in der Schreibwurzel, nicht überall, wo gelesen werden darf', () => {
    // Das Profil darf `/home/u1` lesen, aber nur `/home/u1/workspace` schreiben.
    const lesen = a(profil(), { art: 'datei-lesen', pfad: '/home/u1/.bashrc' })
    const schreiben = a(profil(), { art: 'datei-schreiben', pfad: '/home/u1/.bashrc' })
    expect(lesen.erlaubt).toBe(true)
    expect(schreiben.erlaubt).toBe(false)
  })

  test('dateizugriff "none" verbietet auch das Lesen in der Wurzel', () => {
    const urteil = a(profil({ dateizugriff: 'none' }), { art: 'datei-lesen', pfad: '/home/u1/a' })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('dateizugriff-aus')
  })

  test('"read-only" verbietet das Schreiben', () => {
    const urteil = a(profil({ dateizugriff: 'read-only' }), {
      art: 'datei-schreiben',
      pfad: '/home/u1/workspace/a',
    })
    expect(urteil.erlaubt).toBe(false)
    if (!urteil.erlaubt) expect(urteil.regel).toBe('dateizugriff-aus')
  })

  test('das Vorgabeprofil eines neuen Benutzers ist wirklich eng', () => {
    const p = vorgabeProfil('/home/neu')
    expect(p.netz).toBe(false)
    expect(p.prozesse).toBe(false)
    expect(p.lesewurzeln).toEqual(['/home/neu'])
    expect(p.schreibwurzeln).toEqual(['/home/neu/workspace'])
  })

  test('das Adminprofil ist weit, aber nicht grenzenlos', () => {
    const p = adminProfil(['/srv/pmh'])
    expect(p.netz).toBe(true)
    expect(p.prozesse).toBe(true)
    // **Der Punkt:** ein Profil ohne jede Wurzel ließe sich nicht mehr von
    // „keine Prüfung" unterscheiden.
    expect(p.lesewurzeln.length).toBeGreaterThan(0)
    expect(p.schreibwurzeln.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Jedes „nein" trägt einen Grund
// ---------------------------------------------------------------------------

describe('Jede Abweisung ist begründet', () => {
  test('kein Urteil ohne Grund — sonst ist es nicht prüfbar', () => {
    const faelle: Aktion[] = [
      { art: 'datei-lesen', pfad: '/etc/passwd' },
      { art: 'datei-schreiben', pfad: '/etc/passwd' },
      { art: 'netz-zugriff', ziel: 'x' },
      { art: 'prozess-starten', programm: 'sh' },
      { art: 'benutzer-anlegen', email: 'a@b.c' },
    ]
    for (const aktion of faelle) {
      const urteil = darfAusfuehren({
        akteur: benutzer('u1'),
        herkunft: 'benutzer',
        aktion,
        jetzt: JETZT,
      })
      expect({ aktion: aktion.art, erlaubt: urteil.erlaubt }).toEqual({
        aktion: aktion.art,
        erlaubt: false,
      })
      if (!urteil.erlaubt) {
        expect(urteil.grund.length).toBeGreaterThan(20)
        expect(urteil.regel).not.toBe('erlaubt')
      }
    }
  })
})
