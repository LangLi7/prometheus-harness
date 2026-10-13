/**
 * Prüfungen für `@prometheus-harness/claim`.
 *
 * **Warum diese Prüfungen der Nachweis der Weisung sind.** Der Betreiber verlangt:
 * *„beim first login sollte der claim ect über den rechner selbst wo es läuft
 * bestätigt werden"*. Geprüft wird deshalb **jede** Bindung einzeln — und
 * ausdrücklich auch das **Umgehen** durch Kopieren der Claim-Datei.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CLAIMDATEI,
  CLAIM_GUELTIG_SEKUNDEN,
  entferneClaimdatei,
  erstinbetriebnahmeOffen,
  erzeugeClaim,
  erzeugeToken,
  leseMaschinenbindung,
  leseOderErzeugeGeraeteId,
  pruefeClaim,
  tokenHash,
  type ClaimAblage,
  type ClaimEintrag,
  type Maschinenbindung,
} from '../src/index.ts'

const JETZT = new Date('2026-10-13T12:00:00.000Z')

/** Eine Ablage im Speicher — die echte ist `one_time_tokens`. */
function speicherAblage(): ClaimAblage & { readonly eintraege: ClaimEintrag[] } {
  const eintraege: ClaimEintrag[] = []
  return {
    eintraege,
    async legeAb(eintrag) {
      eintraege.push(eintrag)
    },
    async liesJüngsten() {
      return eintraege.at(-1)
    },
    async verbrauche(hash) {
      const i = eintraege.findIndex((e) => e.tokenHash === hash)
      const alt = eintraege[i]
      if (alt !== undefined) eintraege[i] = { ...alt, verbraucht: true }
    },
  }
}

function bindung(teile: Partial<Maschinenbindung> = {}): Maschinenbindung {
  return {
    hostname: 'rechner-a',
    lokalerNutzer: 'chang',
    geraeteId: 'a'.repeat(64),
    ...teile,
  }
}

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pmh-claim-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Die Gerätekennung
// ---------------------------------------------------------------------------

describe('Die Gerätekennung', () => {
  test('wird beim ersten Mal erzeugt und ist 64 Hex-Zeichen', () => {
    const id = leseOderErzeugeGeraeteId(home)
    expect(id).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('beim zweiten Mal ist es DIESELBE — sonst wäre jeder Claim nach einem Neustart ungültig', () => {
    const erste = leseOderErzeugeGeraeteId(home)
    const zweite = leseOderErzeugeGeraeteId(home)
    expect(zweite).toBe(erste)
  })

  test('die Datei gehört nur dem Eigentümer (0600)', () => {
    // **Der ganze Punkt der Datei.** Eine weltlesbare Kennung wäre von jedem
    // kopierbar und bewiese nichts über den Zugriff dieses Nutzers.
    // Auf Windows bildet Node den Modus nur eingeschränkt ab — geprüft wird
    // deshalb, was tatsächlich gesetzt wurde, und die Aussage gilt für POSIX.
    leseOderErzeugeGeraeteId(home)
    const modus = statSync(join(home, 'geraet')).mode & 0o777
    if (process.platform === 'win32') {
      expect(typeof modus).toBe('number')
    } else {
      expect(modus).toBe(0o600)
    }
  })

  test('eine von Hand veränderte Kennung wird als Fehler gemeldet, nicht ersetzt', () => {
    // **Warum nicht stillschweigend ersetzen.** Eine kaputte Kennung könnte
    // bedeuten, daß jemand daran war. Sie zu erneuern machte daraus ein
    // stillschweigendes „alles in Ordnung".
    writeFileSync(join(home, 'geraet'), 'kein-hex\n', 'utf8')
    expect(() => leseOderErzeugeGeraeteId(home)).toThrow(/keine gültige Gerätekennung/u)
  })

  test('die Bindung nennt Hostname und lokalen Nutzer', () => {
    const b = leseMaschinenbindung(home)
    expect(b.hostname.length).toBeGreaterThan(0)
    expect(b.lokalerNutzer.length).toBeGreaterThan(0)
    expect(b.geraeteId).toMatch(/^[0-9a-f]{64}$/u)
  })
})

// ---------------------------------------------------------------------------
// Der Claim
// ---------------------------------------------------------------------------

describe('Einen Claim erzeugen', () => {
  test('das Token hat 256 Bit und die Ablage bekommt NUR den Hash', async () => {
    const ablage = speicherAblage()
    const claim = await erzeugeClaim(home, bindung(), ablage, JETZT)
    // base64url von 32 Bytes sind 43 Zeichen.
    expect(claim.token).toHaveLength(43)
    const gespeichert = ablage.eintraege[0]
    expect(gespeichert?.tokenHash).toBe(tokenHash(claim.token))
    expect(gespeichert?.tokenHash).not.toContain(claim.token)
    // **Der Kern:** der Klartext darf in der Ablage nicht vorkommen.
    expect(JSON.stringify(ablage.eintraege)).not.toContain(claim.token)
  })

  test('schreibt die Datei in das Home', async () => {
    const ablage = speicherAblage()
    const claim = await erzeugeClaim(home, bindung(), ablage, JETZT)
    expect(claim.datei).toBe(join(home, CLAIMDATEI))
    const inhalt = readFileSync(claim.datei, 'utf8')
    expect(inhalt).toContain(claim.token)
    expect(inhalt).toContain('Claim-Token')
  })

  test('läuft nach der vorgesehenen Zeit ab', async () => {
    const ablage = speicherAblage()
    const claim = await erzeugeClaim(home, bindung(), ablage, JETZT)
    const erwartet = new Date(JETZT.getTime() + CLAIM_GUELTIG_SEKUNDEN * 1000)
    expect(claim.laeuftAb.getTime()).toBe(erwartet.getTime())
  })

  test('zwei Claims haben verschiedene Token', async () => {
    expect(erzeugeToken()).not.toBe(erzeugeToken())
  })
})

describe('Einen Claim einlösen', () => {
  test('der richtige Claim auf dem richtigen Rechner gilt', async () => {
    const ablage = speicherAblage()
    const b = bindung()
    const claim = await erzeugeClaim(home, b, ablage, JETZT)
    const urteil = await pruefeClaim(claim.token, b, ablage, JETZT)
    expect(urteil).toEqual({ gueltig: true })
  })

  test('ein Claim ist EINMALIG — der zweite Versuch scheitert', async () => {
    const ablage = speicherAblage()
    const b = bindung()
    const claim = await erzeugeClaim(home, b, ablage, JETZT)
    expect((await pruefeClaim(claim.token, b, ablage, JETZT)).gueltig).toBe(true)
    const zweite = await pruefeClaim(claim.token, b, ablage, JETZT)
    expect(zweite.gueltig).toBe(false)
    if (!zweite.gueltig) expect(zweite.regel).toBe('verbraucht')
  })

  test('ein abgelaufener Claim scheitert', async () => {
    const ablage = speicherAblage()
    const b = bindung()
    const claim = await erzeugeClaim(home, b, ablage, JETZT)
    const spaeter = new Date(JETZT.getTime() + (CLAIM_GUELTIG_SEKUNDEN + 1) * 1000)
    const urteil = await pruefeClaim(claim.token, b, ablage, spaeter)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('abgelaufen')
  })

  test('ein falsches Token scheitert', async () => {
    const ablage = speicherAblage()
    const b = bindung()
    await erzeugeClaim(home, b, ablage, JETZT)
    const urteil = await pruefeClaim(erzeugeToken(), b, ablage, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('token-falsch')
  })

  test('ohne Claim scheitert es — und sagt genau das', async () => {
    const urteil = await pruefeClaim(erzeugeToken(), bindung(), speicherAblage(), JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('kein-claim')
  })
})

// ---------------------------------------------------------------------------
// Die Bindungen — jede einzeln
// ---------------------------------------------------------------------------

describe('Jede Bindung wird einzeln geprüft', () => {
  test('ein anderer HOSTNAME scheitert', async () => {
    const ablage = speicherAblage()
    const claim = await erzeugeClaim(home, bindung({ hostname: 'rechner-a' }), ablage, JETZT)
    const urteil = await pruefeClaim(claim.token, bindung({ hostname: 'rechner-b' }), ablage, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('anderer-rechner')
  })

  test('ein anderer LOKALER NUTZER scheitert', async () => {
    const ablage = speicherAblage()
    const claim = await erzeugeClaim(home, bindung({ lokalerNutzer: 'chang' }), ablage, JETZT)
    const urteil = await pruefeClaim(claim.token, bindung({ lokalerNutzer: 'fremd' }), ablage, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('anderer-nutzer')
  })

  test('DAS KOPIEREN DER CLAIM-DATEI AUF EINEN ANDEREN RECHNER SCHEITERT', async () => {
    // **Die Prüfung, um derentwillen es die Gerätekennung gibt.** Ohne sie genügte
    // es, `claim.txt` zu kopieren — auf einem Rechner mit gleichem Hostnamen und
    // gleichem Nutzernamen wäre der Claim gültig gewesen.
    //
    // Nachgestellt: gleicher Hostname, gleicher Nutzer, **andere Kennung** (also
    // ein anderes Dateisystem).
    const ablage = speicherAblage()
    const hier = bindung({ hostname: 'gleich', lokalerNutzer: 'gleich', geraeteId: 'a'.repeat(64) })
    const claim = await erzeugeClaim(home, hier, ablage, JETZT)

    const dort = bindung({ hostname: 'gleich', lokalerNutzer: 'gleich', geraeteId: 'b'.repeat(64) })
    const urteil = await pruefeClaim(claim.token, dort, ablage, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('andere-geraetekennung')
  })

  test('gleiche Kennung, aber falsches Token: das TOKEN entscheidet weiterhin', async () => {
    // Die Bindung ersetzt das Token nicht — beide müssen stimmen.
    const ablage = speicherAblage()
    const b = bindung()
    await erzeugeClaim(home, b, ablage, JETZT)
    const urteil = await pruefeClaim(erzeugeToken(), b, ablage, JETZT)
    expect(urteil.gueltig).toBe(false)
    if (!urteil.gueltig) expect(urteil.regel).toBe('token-falsch')
  })
})

// ---------------------------------------------------------------------------
// Aufräumen und die Regel
// ---------------------------------------------------------------------------

describe('Nach dem Einlösen', () => {
  test('die Claim-Datei wird entfernt — und ein zweites Mal ist es kein Fehler', async () => {
    const ablage = speicherAblage()
    await erzeugeClaim(home, bindung(), ablage, JETZT)
    expect(entferneClaimdatei(home)).toBe(true)
    expect(entferneClaimdatei(home)).toBe(false)
  })
})

describe('Die Regel der Erstinbetriebnahme', () => {
  test('ohne Benutzer ist sie offen', () => {
    expect(erstinbetriebnahmeOffen(0)).toBe(true)
  })

  test('mit EINEM Benutzer ist sie zu — und bleibt zu', () => {
    // **Der Satz, der das Hintertürchen schließt.** Solange ein Benutzer
    // existiert, entsteht kein neuer Claim. Sonst könnte sich jeder, der später
    // lokalen Zugang erlangt, ein zweites Adminkonto anlegen.
    expect(erstinbetriebnahmeOffen(1)).toBe(false)
    expect(erstinbetriebnahmeOffen(2)).toBe(false)
  })
})
