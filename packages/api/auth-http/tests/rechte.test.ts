/**
 * Claim-Speicher und Rechte — **ohne** Datenbank.
 *
 * ## Was hier bewiesen wird
 *
 * Bis heute hatten `@prometheus-harness/claim` (21 Prüfungen) und
 * `@prometheus-harness/permissions` (30 Prüfungen) **keinen Aufrufer**. Ein Recht,
 * das niemand abfragt, ist keines. Diese Datei prüft die zwei Stücke, die den
 * Weg dorthin bilden: den **Claim-Speicher** (er ist neu und hat eigene
 * Prüfungen nötig — er schreibt Dateien) und die **Akteurbildung**.
 *
 * ## Warum hier ein echtes Verzeichnis und keine Attrappe
 *
 * Der Claim-Speicher **ist** Dateizugriff. Eine Attrappe würde prüfen, daß eine
 * Attrappe funktioniert. Das Verzeichnis liegt unter `tmpdir()` und wird nach dem
 * Lauf wieder weggeräumt — es ist unser eigenes und niemandes sonst.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CLAIM_GUELTIG_SEKUNDEN,
  entferneClaimdatei,
  erzeugeClaim,
  erstinbetriebnahmeOffen,
  leseMaschinenbindung,
  leseOderErzeugeGeraeteId,
  pruefeClaim,
  type ClaimRegel,
  type Maschinenbindung,
} from '@prometheus-harness/claim'
import { akteurAus, darfBenutzerAnlegen, isolationAnsicht } from '../src/rechte.ts'
import { normalisiere } from '@prometheus-harness/permissions'
import { ABLAGEDATEI, claimAblageImHome } from '../src/claim-ablage.ts'
import type { UserRecord } from '@prometheus-harness/auth'

// ---------------------------------------------------------------------------
// Ein eigenes Home für diesen Lauf
// ---------------------------------------------------------------------------

let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'pmh-claim-pruefung-'))
})

afterAll(() => {
  // Nur das eigene Verzeichnis. Ein Test, der fremde Verzeichnisse abräumt,
  // macht andere unbrauchbar.
  if (home !== undefined && existsSync(home)) rmSync(home, { recursive: true, force: true })
})

/** Ein Benutzer, wie ihn der Speicher liefert. */
function benutzer(role: 'user' | 'admin'): UserRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.org',
    passwordHash: '$argon2id$…',
    displayName: 'Ada',
    role,
    disabledAt: undefined,
  }
}

// ---------------------------------------------------------------------------
// Der Claim-Speicher
// ---------------------------------------------------------------------------

describe('Der Claim-Speicher als Datei', () => {
  test('legt einen Claim ab und liest ihn wieder', async () => {
    const ablage = claimAblageImHome(home)
    const ablauf = new Date(Date.now() + 60_000)
    await ablage.legeAb({
      tokenHash: 'a'.repeat(64),
      hostname: 'rechner-1',
      lokalerNutzer: 'ada',
      geraeteId: 'geraet-1',
      laeuftAb: ablauf,
      verbraucht: false,
    })
    const gelesen = await ablage.liesJüngsten()
    expect(gelesen?.tokenHash).toBe('a'.repeat(64))
    expect(gelesen?.hostname).toBe('rechner-1')
    expect(gelesen?.laeuftAb.toISOString()).toBe(ablauf.toISOString())
    expect(gelesen?.verbraucht).toBe(false)
  })

  test('ohne Datei gilt „kein Claim"', async () => {
    const leer = mkdtempSync(join(tmpdir(), 'pmh-claim-leer-'))
    try {
      expect(await claimAblageImHome(leer).liesJüngsten()).toBeUndefined()
    } finally {
      rmSync(leer, { recursive: true, force: true })
    }
  })

  test('eine kaputte Datei gilt als „kein Claim" — die sichere Richtung', async () => {
    // **Warum das die sichere Richtung ist.** „Kein Claim" heißt: es läßt sich
    // **kein** erstes Adminkonto anlegen. Die unsichere Richtung wäre, bei
    // unlesbarer Datei einen Claim **anzunehmen** — dann legte ein Fremder das
    // Adminkonto an. Der Eigentümer erzeugt einfach einen neuen Claim.
    const kaputt = mkdtempSync(join(tmpdir(), 'pmh-claim-kaputt-'))
    try {
      writeFileSync(join(kaputt, ABLAGEDATEI), '{kein json', 'utf8')
      expect(await claimAblageImHome(kaputt).liesJüngsten()).toBeUndefined()
      writeFileSync(join(kaputt, ABLAGEDATEI), '{"tokenHash":"x"}', 'utf8')
      expect(await claimAblageImHome(kaputt).liesJüngsten()).toBeUndefined()
      writeFileSync(join(kaputt, ABLAGEDATEI), '{"tokenHash":"x","hostname":"h","lokalerNutzer":"l","geraeteId":"g","laeuftAb":"kein-datum","verbraucht":false}', 'utf8')
      expect(await claimAblageImHome(kaputt).liesJüngsten()).toBeUndefined()
    } finally {
      rmSync(kaputt, { recursive: true, force: true })
    }
  })

  test('verbraucht NUR den passenden Eintrag', async () => {
    // **Der Fehler, den das verhindert.** Ein blindes Setzen von
    // `verbraucht = true` würde bei einem **beliebigen** vorgelegten Token den
    // echten Claim verbrauchen — und damit den Eigentümer aussperren, ohne daß
    // jemand das Adminkonto bekommen hätte.
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-claim-verbrauch-'))
    try {
      const ablage = claimAblageImHome(ordner)
      await ablage.legeAb({
        tokenHash: 'b'.repeat(64),
        hostname: 'h',
        lokalerNutzer: 'l',
        geraeteId: 'g',
        laeuftAb: new Date(Date.now() + 60_000),
        verbraucht: false,
      })
      await ablage.verbrauche('c'.repeat(64))
      expect((await ablage.liesJüngsten())?.verbraucht).toBe(false)

      await ablage.verbrauche('b'.repeat(64))
      expect((await ablage.liesJüngsten())?.verbraucht).toBe(true)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Die ganze Claim-Kette
// ---------------------------------------------------------------------------

describe('Erzeugen und Einlösen — die ganze Kette', () => {
  test('ein frischer Claim wird eingelöst, ein zweiter Versuch nicht', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-claim-kette-'))
    try {
      leseOderErzeugeGeraeteId(ordner)
      const bindung = leseMaschinenbindung(ordner)
      const ablage = claimAblageImHome(ordner)
      const jetzt = new Date()

      const claim = await erzeugeClaim(ordner, bindung, ablage, jetzt)
      expect(claim.token).not.toBe('')
      expect(existsSync(claim.datei)).toBe(true)

      const erste = await pruefeClaim(claim.token, bindung, ablage, jetzt)
      expect(erste.gueltig).toBe(true)

      // **Ein Claim ist ein Einmal-Geheimnis.** Der zweite Versuch scheitert —
      // sonst könnte dasselbe Token zweimal ein Adminkonto anlegen.
      const zweite = await pruefeClaim(claim.token, bindung, ablage, jetzt)
      expect(zweite.gueltig).toBe(false)
      if (!zweite.gueltig) expect(zweite.regel).toBe('verbraucht')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('ein falsches Token wird abgewiesen, ohne den Claim zu verbrauchen', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-claim-falsch-'))
    try {
      leseOderErzeugeGeraeteId(ordner)
      const bindung = leseMaschinenbindung(ordner)
      const ablage = claimAblageImHome(ordner)
      const jetzt = new Date()
      const claim = await erzeugeClaim(ordner, bindung, ablage, jetzt)

      const falsch = await pruefeClaim('ein-anderes-token', bindung, ablage, jetzt)
      expect(falsch.gueltig).toBe(false)
      if (!falsch.gueltig) expect(falsch.regel).toBe('token-falsch')

      // **Der echte Claim lebt noch.** Sonst hätte ein Rateversuch den
      // Eigentümer ausgesperrt.
      expect((await pruefeClaim(claim.token, bindung, ablage, jetzt)).gueltig).toBe(true)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('ein abgelaufener Claim wird abgewiesen', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-claim-ablauf-'))
    try {
      leseOderErzeugeGeraeteId(ordner)
      const bindung = leseMaschinenbindung(ordner)
      const ablage = claimAblageImHome(ordner)
      const jetzt = new Date()
      const claim = await erzeugeClaim(ordner, bindung, ablage, jetzt)

      const spaeter = new Date(jetzt.getTime() + (CLAIM_GUELTIG_SEKUNDEN + 1) * 1000)
      const abgelaufen = await pruefeClaim(claim.token, bindung, ablage, spaeter)
      expect(abgelaufen.gueltig).toBe(false)
      if (!abgelaufen.gueltig) expect(abgelaufen.regel).toBe('abgelaufen')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('ein anderer Rechner, ein anderer Nutzer und eine andere Gerätekennung werden abgewiesen', async () => {
    // **Das ist der Kern der Bindung.** Ein kopiertes `claim.txt` genügt nicht:
    // die Gerätekennung kommt aus einer eigenen Datei (Modus 0600), und wer sie
    // nicht hat, kommt nicht durch — auch wenn er das Token kennt.
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-claim-bindung-'))
    try {
      leseOderErzeugeGeraeteId(ordner)
      const echt = leseMaschinenbindung(ordner)
      const ablage = claimAblageImHome(ordner)
      const jetzt = new Date()
      const claim = await erzeugeClaim(ordner, echt, ablage, jetzt)

      // **`ClaimRegel` und nicht `string`.** Der erste Entwurf typisierte das
      // erwartete Ergebnis als `string`. Der Typlauf wies es ab — und das ist
      // gut so: mit dem echten Typ wird ein Tippfehler im Regelnamen
      // (`anderer-nutzer` statt `anderer-nutze`) zum **Fehler** statt zu einer
      // Prüfung, die aus dem falschen Grund grün wird.
      const faelle: readonly { readonly was: string; readonly bindung: Maschinenbindung; readonly regel: ClaimRegel }[] = [
        { was: 'anderer Rechner', bindung: { ...echt, hostname: 'ein-anderer-rechner' }, regel: 'anderer-rechner' },
        { was: 'anderer Nutzer', bindung: { ...echt, lokalerNutzer: 'jemand-anderes' }, regel: 'anderer-nutzer' },
        { was: 'andere Gerätekennung', bindung: { ...echt, geraeteId: 'eine-andere-kennung' }, regel: 'andere-geraetekennung' },
      ]
      for (const fall of faelle) {
        const urteil = await pruefeClaim(claim.token, fall.bindung, ablage, jetzt)
        expect({ was: fall.was, gueltig: urteil.gueltig }).toEqual({ was: fall.was, gueltig: false })
        if (!urteil.gueltig) {
          expect({ was: fall.was, regel: urteil.regel }).toEqual({ was: fall.was, regel: fall.regel })
        }
      }
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  test('die Claim-Datei ist danach weg', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-claim-weg-'))
    try {
      leseOderErzeugeGeraeteId(ordner)
      const bindung = leseMaschinenbindung(ordner)
      const claim = await erzeugeClaim(ordner, bindung, claimAblageImHome(ordner), new Date())
      expect(existsSync(claim.datei)).toBe(true)
      expect(entferneClaimdatei(ordner)).toBe(true)
      expect(existsSync(claim.datei)).toBe(false)
      // Ein zweiter Aufruf findet nichts mehr — und meldet das.
      expect(entferneClaimdatei(ordner)).toBe(false)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Die Erstinbetriebnahme
// ---------------------------------------------------------------------------

describe('Wann ist die Erstinbetriebnahme offen?', () => {
  test('nur solange es keinen Benutzer gibt', () => {
    expect(erstinbetriebnahmeOffen(0)).toBe(true)
    // **Genau ein Übergang.** Ab dem ersten Benutzer ist der Weg über den Claim
    // zu — sonst könnte sich jeder weitere „erste" Admin anlegen.
    expect(erstinbetriebnahmeOffen(1)).toBe(false)
    expect(erstinbetriebnahmeOffen(99)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Die Rechte
// ---------------------------------------------------------------------------

describe('Der Akteur und sein Recht', () => {
  test('ein Admin bekommt das Adminprofil, ein Benutzer das Vorgabeprofil', () => {
    const admin = akteurAus(benutzer('admin'), home)
    const normal = akteurAus(benutzer('user'), home)

    expect(admin.rolle).toBe('admin')
    expect(normal.rolle).toBe('user')

    // **Der Unterschied, der zählt — und ich hatte ihn zuerst falsch geraten.**
    // Mein erster Entwurf erwartete für den Benutzer eine **leere**
    // Schreibwurzel-Liste. Gemessen ist sie nicht leer:
    //
    //   admin   -> [<home>]
    //   Benutzer -> [<home>/workspace]
    //
    // Ein gewöhnlicher Benutzer bekommt also **seinen eigenen Bereich** unter dem
    // Home — nur nicht das Home selbst. Genau darin liegt die Trennung: er darf
    // in seinem Arbeitsbereich schreiben und nicht daneben.
    expect(admin.isolation.schreibwurzeln).toContain(home)
    expect(normal.isolation.schreibwurzeln).not.toContain(home)
    expect(normal.isolation.schreibwurzeln.length).toBeGreaterThan(0)
    // Und jeder seiner Bereiche liegt **unter** dem Home — keiner daneben.
    //
    // **Verglichen wird normalisiert, und das ist ein Befund.** Gemessen:
    //
    //   adminProfil([home])  -> ["C:\\…\\probe-home"]           (unnormalisiert)
    //   vorgabeProfil(home)  -> ["C:/…/probe-home/workspace"]   (normalisiert)
    //
    // Zwei Schreibweisen für denselben Begriff in **einem** Paket. Die
    // **Entscheidung** ist davon nicht betroffen — `liegtIn` normalisiert intern,
    // für beide Formen nachgemessen. Wer aber Wurzeln **direkt** vergleicht
    // (`===`, `toContain`, ein `Set`), trifft genau diese Falle: mein erster
    // Testentwurf ist hineingelaufen. Deshalb steht hier `normalisiere` auf
    // beiden Seiten. Der Befund gehört gemeldet, nicht stillschweigend umgangen.
    const normalHome = normalisiere(home)
    for (const wurzel of normal.isolation.schreibwurzeln) {
      expect(normalisiere(wurzel).startsWith(normalHome)).toBe(true)
    }
    // Der Admin dagegen bekommt genau das Home — auch normalisiert.
    expect(admin.isolation.schreibwurzeln.map(normalisiere)).toEqual([normalHome])
  })

  test('ein Admin darf ein Konto anlegen, ein Benutzer nicht', () => {
    const jetzt = new Date()
    const alsAdmin = darfBenutzerAnlegen(akteurAus(benutzer('admin'), home), 'neu@example.org', jetzt)
    expect(alsAdmin.erlaubt).toBe(true)

    const alsBenutzer = darfBenutzerAnlegen(akteurAus(benutzer('user'), home), 'neu@example.org', jetzt)
    expect(alsBenutzer.erlaubt).toBe(false)
    // **Mit Grund und Regel** — ein „nein" ohne Grund ist nicht prüfbar.
    if (!alsBenutzer.erlaubt) {
      expect(alsBenutzer.regel).toBe('admin-erforderlich')
      expect(alsBenutzer.grund.length).toBeGreaterThan(0)
    }
  })

  test('die Ansicht gibt nur die benannten Felder heraus', () => {
    // Was in einer Antwort steht, ist öffentlich. Eine benannte Auswahl ist eine
    // Stelle, an der man sieht, was hinausgeht.
    const ansicht = isolationAnsicht(akteurAus(benutzer('admin'), home).isolation)
    expect(Object.keys(ansicht).sort()).toEqual([
      'dateizugriff',
      'lesewurzeln',
      'netz',
      'prozesse',
      'schreibwurzeln',
    ])
  })
})
