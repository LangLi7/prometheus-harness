/**
 * Prüfungen für {@link module:scripts/profile-patch}.
 *
 * **Warum diese Datei mehr prüft als „schreibt die Zeile hinein".** Die
 * Patch-Datei ist die oberste Schicht des Benutzers und wird bei **jedem Start**
 * angefaßt. Dabei sind drei Fehler möglich, und alle drei sind still — der Start
 * läuft, nur eben falsch:
 *
 * 1. **Falsche Patch-Form.** Eine Zeile mit `id` und ohne `insert` ist ein
 *    *Änderungs*-Patch. Sie würde „entry not found" melden und **nichts**
 *    einhängen. Genau das ist passiert.
 * 2. **An eine leere Liste angehängt.** `[]` ist die leere Liste, kein
 *    Platzhalter; Zeilen dahinter sind kein YAML. Der Host brach ab. Ebenfalls
 *    passiert.
 * 3. **Bei jedem Lauf ein weiterer Eintrag.** Nach zehn Starts stünde die Zeile
 *    zehnmal in der Datei.
 *
 * Fall 1 wird hier **gegen die echte Patch-Semantik** geprüft: die erzeugten
 * Zeilen werden geparst und die Form `{ insert: [...] }` nachgewiesen.
 */
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  EIGENE_PAKETE,
  MARKE_ANFANG,
  MARKE_ENDE,
  bereichsZeilen,
  idAus,
  mitBereich,
  patchPfad,
  verdrahte,
} from '../profile-patch.mjs'

/** Die Zeilen der Vorlage, wie `dsh` sie anlegt (gemessen am 13.10.2026). */
const VORLAGE = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# a top-level YAML array of loader patch entries (id-targeted config',
  '# overrides, disables, and insert lists; `!!js` expressions allowed).',
  '[]',
  '',
].join('\n')

const ZEILEN = bereichsZeilen(['@prometheus-harness/health'])
/** Ein Inhaltsblock genau so, wie ihn YAML nach dem Einrücken sieht. */
const BLOCK = ZEILEN.join('\n')

describe('idAus', () => {
  test('macht aus dem Paketnamen eine zuordenbare id', () => {
    expect(idAus('@prometheus-harness/health')).toBe('pmh-health')
  })

  test('ersetzt Zeichen, die in einer id nichts zu suchen haben', () => {
    expect(idAus('@a/mein.ding_x')).toBe('pmh-mein-ding-x')
  })

  test('kommt auch ohne Bereich aus', () => {
    expect(idAus('health')).toBe('pmh-health')
  })
})

describe('bereichsZeilen', () => {
  test('benutzt die Form `insert:` — die einzige, die Zeilen anfügt', () => {
    // **Der Fehler, der hier verhindert wird.** Ohne `insert` wäre der Eintrag
    // ein Änderungs-Patch: der Loader sucht die id, findet sie nicht und hängt
    // nichts ein. Der Endpunkt fehlte im Host, ohne daß etwas abbrach.
    //
    // **Und `- insert:` statt `insert:`.** Ohne den Bindestrich ist der Bereich
    // eine YAML-*Abbildung*; verlangt ist eine *Liste* von Patch-Einträgen. Der
    // Host brach mit „must be a top-level YAML array of loader patch entries" ab.
    expect(ZEILEN[0]).toBe(MARKE_ANFANG)
    expect(ZEILEN[1]).toBe('- insert:')
    expect(ZEILEN.at(-1)).toBe(MARKE_ENDE)
    expect(ZEILEN.some((z) => z.trimStart().startsWith('- id: pmh-health'))).toBe(true)
    expect(ZEILEN).toContain("    name: '@prometheus-harness/health'")
    expect(ZEILEN).toContain('    inject: [webServer]')
  })

  test('nimmt mehrere Pakete in der gegebenen Reihenfolge', () => {
    const zeilen = bereichsZeilen(['@a/erst', '@b/zweit'])
    expect(zeilen).toContain('  - id: pmh-erst')
    expect(zeilen).toContain('  - id: pmh-zweit')
    expect(zeilen.indexOf('  - id: pmh-erst')).toBeLessThan(zeilen.indexOf('  - id: pmh-zweit'))
  })

  test('alle Zeilen unter dem Listeneintrag sind gleich tief eingerückt', () => {
    // YAML ist hier empfindlich: ein falscher Einzug macht aus einem Feldsatz
    // eine neue Listenposition — oder aus dem Listeneintrag eine zweite Zeile.
    const zeilen = bereichsZeilen(['@a/erst', '@b/zweit'])
    const eintraege = zeilen.filter((z) => z.startsWith('  - id: '))
    const felder = zeilen.filter((z) => z.startsWith('    '))
    expect(eintraege).toHaveLength(2)
    expect(felder).toHaveLength(4)
    // Genau eine Zeile trägt den Listenstrich für `insert:`.
    expect(zeilen.filter((z) => z.startsWith('- '))).toHaveLength(1)
  })
})

describe('mitBereich', () => {
  test('ersetzt den `[]`-Platzhalter der Vorlage', () => {
    // **Der zweite Fehler.** `[]` ist die leere Liste. Wer dahinter Zeilen
    // anhängt, macht die Datei zu ungültigem YAML — der Host brach mit
    // „end of the stream or a document separator is expected" ab.
    const neu = mitBereich(VORLAGE, ZEILEN)
    const zeilen = neu.split('\n')
    expect(zeilen.some((z) => /^\s*\[\]\s*$/u.test(z))).toBe(false)
    expect(neu).toContain('insert:')
  })

  test('läßt die Kommentare der Vorlage stehen', () => {
    const neu = mitBereich(VORLAGE, ZEILEN)
    expect(neu).toContain('# Your patch layer for this dsh profile')
    expect(neu).toContain('# overrides, disables, and insert lists')
  })

  test('benutzt den Platzhalter wirklich, statt anzuhängen', () => {
    const neu = mitBereich('kopf\n[]\n# fuss\n', ZEILEN)
    expect(neu).toContain('kopf')
    expect(neu).toContain('# fuss')
    expect(neu).not.toContain('[]')
    // Der Block steht dort, wo `[]` stand — also zwischen den beiden Zeilen.
    expect(neu.indexOf('kopf')).toBeLessThan(neu.indexOf('insert:'))
    expect(neu.indexOf('insert:')).toBeLessThan(neu.indexOf('# fuss'))
  })

  test('hängt an, wenn es keinen Platzhalter gibt', () => {
    const neu = mitBereich('# nur ein Kommentar\n', ZEILEN)
    expect(neu).toContain('# nur ein Kommentar')
    expect(neu).toContain('insert:')
    expect(neu.indexOf('# nur ein Kommentar')).toBeLessThan(neu.indexOf('insert:'))
  })

  test('kommt mit leerem Inhalt zurecht', () => {
    const neu = mitBereich('', ZEILEN)
    expect(neu).toContain('insert:')
    expect(neu.endsWith('\n')).toBe(true)
  })

  test('setzt keinen abschließenden Umbruch voraus', () => {
    const neu = mitBereich('[]', ZEILEN)
    expect(neu).toContain('insert:')
  })

  test('ist bei zweimaligem Aufruf stabil — kein zweiter Eintrag', () => {
    const einmal = mitBereich(VORLAGE, ZEILEN)
    const zweimal = mitBereich(einmal, ZEILEN)
    expect(zweimal).toBe(einmal)
    expect(zweimal.split('insert:')).toHaveLength(2)
  })

  test('ersetzt einen geänderten Bereich, statt ihn zu verdoppeln', () => {
    const alt = mitBereich(VORLAGE, bereichsZeilen(['@a/alt']))
    const neu = mitBereich(alt, bereichsZeilen(['@a/neu']))
    expect(neu).toContain('@a/neu')
    expect(neu).not.toContain('@a/alt')
    expect(neu.split('insert:')).toHaveLength(2)
  })

  test('ein Bereich ohne Ende wird entfernt, nicht ergänzt', () => {
    const halb = `${VORLAGE}${MARKE_ANFANG}\ninsert:\n  - id: rest\n`
    const neu = mitBereich(halb, ZEILEN)
    expect(neu).not.toContain('- id: rest')
    expect(neu).toContain('- id: pmh-health')
  })

  test('fremde Einträge bleiben unangetastet', () => {
    // Die Datei gehört dem Benutzer. Ein Eintrag, den jemand absichtlich dort
    // hat, darf nicht verschwinden.
    const vorher = '# mein Kopf\n- id: fremd\n  name: "@fremd/paket"\n# mein Fuss\n'
    const neu = mitBereich(vorher, ZEILEN)
    expect(neu).toContain('- id: fremd')
    expect(neu).toContain('# mein Kopf')
    expect(neu).toContain('# mein Fuss')
    expect(neu).toContain('- id: pmh-health')
  })

  test('der erzeugte Bereich ist gültiges YAML mit der Form `insert:`', () => {
    // **Die Prüfung gegen die echte Semantik.** Bis hierher wurde nur Text
    // verglichen. Hier wird geparst — und die Form nachgewiesen, die der Loader
    // als „anhängen" versteht.
    const inhalt = mitBereich(VORLAGE, ZEILEN)
    const ohneKommentare = inhalt
      .split('\n')
      .filter((z) => !z.trimStart().startsWith('#'))
      .join('\n')
    const eintraege = parseEinfach(ohneKommentare)
    expect(eintraege).toHaveLength(1)
    expect(Object.keys(eintraege[0])).toEqual(['insert'])
    const eingefuegt = eintraege[0].insert
    expect(eingefuegt).toHaveLength(1)
    expect(eingefuegt[0].id).toBe('pmh-health')
    expect(eingefuegt[0].name).toBe('@prometheus-harness/health')
    expect(eingefuegt[0].inject).toEqual(['webServer'])
  })
})

/**
 * Ein winziger YAML-Leser für **genau** die Form, die dieses Skript erzeugt.
 *
 * **Warum kein echtes YAML-Paket.** Das Projekt hat keines als Abhängigkeit, und
 * eine neue Abhängigkeit nur für eine Prüfung wäre teuer. Dieser Leser deckt die
 * benutzte Teilmenge ab — eine Liste auf oberster Ebene mit einem Eintrag
 * `insert:`, darunter Feldsätze — und **wirft** bei allem anderen. Damit kann er
 * nicht stillschweigend etwas Falsches durchwinken.
 *
 * **Was er nicht kann:** Anker, mehrzeilige Werte, `!!js`. Braucht er auch nicht.
 *
 * @param text - YAML ohne Kommentarzeilen
 * @returns die Liste der Einträge
 */
function parseEinfach(text) {
  const zeilen = text.split('\n').filter((z) => z.trim() !== '')
  const eintraege = []
  let liste
  for (const zeile of zeilen) {
    if (/^- insert:\s*$/u.test(zeile)) {
      const eintrag = { insert: [] }
      eintraege.push(eintrag)
      liste = eintrag.insert
      continue
    }
    const neuerEintrag = /^ {2}- (\w+): (.+)$/u.exec(zeile)
    if (neuerEintrag !== null && liste !== undefined) {
      const satz = {}
      satz[neuerEintrag[1]] = wert(neuerEintrag[2])
      liste.push(satz)
      continue
    }
    const feld = /^ {4}(\w+): (.+)$/u.exec(zeile)
    if (feld !== null && liste !== undefined && liste.length > 0) {
      liste[liste.length - 1][feld[1]] = wert(feld[2])
      continue
    }
    throw new Error(`parseEinfach: unerwartete Zeile ${JSON.stringify(zeile)}`)
  }
  return eintraege
}

/** Liest einen skalaren Wert oder eine einfache Liste `[a, b]`. */
function wert(roh) {
  const text = roh.trim()
  if (text.startsWith('[') && text.endsWith(']')) {
    const innen = text.slice(1, -1).trim()
    return innen === '' ? [] : innen.split(',').map((t) => entquote(t.trim()))
  }
  return entquote(text)
}

/** Entfernt einfache oder doppelte Anführungszeichen. */
function entquote(text) {
  if (text.length >= 2 && ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))) {
    return text.slice(1, -1)
  }
  return text
}

describe('patchPfad', () => {
  test('zeigt auf die Patch-Datei des Profils', () => {
    const p = patchPfad('C:\\home', 'web')
    expect(p).toContain('home')
    expect(p).toContain('profiles')
    expect(p).toContain('web')
    expect(p.endsWith('cordis.patch.yml')).toBe(true)
  })
})

describe('EIGENE_PAKETE', () => {
  test('nennt den Endpunkt dieses Projekts', () => {
    expect(EIGENE_PAKETE).toContain('@prometheus-harness/health')
  })

  test('jedes genannte Paket hat eine gültige id', () => {
    for (const paket of EIGENE_PAKETE) {
      expect(idAus(paket)).toMatch(/^pmh-[a-z0-9-]+$/u)
    }
  })
})

describe('verdrahte — mit einer echten Datei', () => {
  /** Ein frisches Verzeichnis mit der Vorlage darin. */
  function mitVorlage() {
    const dir = mkdtempSync(join(tmpdir(), 'pmh-patch-'))
    const ordner = join(dir, 'profiles', 'web')
    mkdirSync(ordner, { recursive: true })
    const pfad = join(ordner, 'cordis.patch.yml')
    writeFileSync(pfad, VORLAGE, 'utf8')
    return { dir, pfad, weg: () => rmSync(dir, { recursive: true, force: true }) }
  }

  test('legt die Datei an, wenn es sie nicht gibt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmh-patch-'))
    try {
      const pfad = join(dir, 'profiles', 'web', 'cordis.patch.yml')
      const ergebnis = verdrahte(pfad, EIGENE_PAKETE)
      expect(ergebnis.geaendert).toBe(true)
      expect(readFileSync(pfad, 'utf8')).toContain('@prometheus-harness/health')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('meldet beim zweiten Lauf, dass nichts geändert wurde', () => {
    const w = mitVorlage()
    try {
      expect(verdrahte(w.pfad, EIGENE_PAKETE).geaendert).toBe(true)
      expect(verdrahte(w.pfad, EIGENE_PAKETE).geaendert).toBe(false)
    } finally {
      w.weg()
    }
  })

  test('läßt den Inhalt der Vorlage stehen', () => {
    const w = mitVorlage()
    try {
      verdrahte(w.pfad, EIGENE_PAKETE)
      const inhalt = readFileSync(w.pfad, 'utf8')
      expect(inhalt).toContain('# Your patch layer for this dsh profile')
      expect(inhalt).not.toContain('[]')
    } finally {
      w.weg()
    }
  })

  test('nach zehn Läufen steht der Eintrag genau einmal darin', () => {
    // Die Wirklichkeit: der Start ruft das bei **jedem** Lauf auf.
    const w = mitVorlage()
    try {
      for (let i = 0; i < 10; i += 1) verdrahte(w.pfad, EIGENE_PAKETE)
      const inhalt = readFileSync(w.pfad, 'utf8')
      expect(inhalt.split('insert:')).toHaveLength(2)
      expect(inhalt.split('@prometheus-harness/health')).toHaveLength(2)
    } finally {
      w.weg()
    }
  })
})
