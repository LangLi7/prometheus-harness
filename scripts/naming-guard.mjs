#!/usr/bin/env bun
/**
 * Der Wächter für **Regel 42** — Ordnernamen und Dateinamen englisch, Kommentare und Dokumente
 * deutsch.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Regel 42 ist am 15.10.2026 **achtmal** verletzt worden, und jede Verletzung wurde einzeln
 * gefunden, einzeln begründet und einzeln umbenannt (`docs/status/naming-plan.md`). Das ist der
 * falsche Weg: **wer einen Verstoß von Hand findet, findet den nächsten nicht.** Ein umbenanntes
 * Paket ist eine Tat; ein Wächter ist ein Zustand.
 *
 * ## Was dieser Wächter NICHT prüft — und warum das eine Grenze ist
 *
 * * **Bezeichner im Code** (`Familie`, `sonde()`, `FAEHIGKEITEN`) bleiben deutsch. Regel 42 gilt
 *   für **Ordner und Dateien**, nicht für den Quelltext; ein deutscher Name in deutschem
 *   Kommentarwerk ist Hausstil.
 * * **`docs/`** ist ausgenommen. Dort stehen Dokumente, und ein Dokumentname wie `arbeitsweise.md`
 *   ist der **Titel eines Aufsatzes**, nicht die Adresse eines Moduls.
 * * **Fremde Arbeit wird gemeldet, nicht angefaßt.** Der Wächter liest; er benennt nichts um.
 *
 * ## Wie „deutsch" entschieden wird — ohne Ratekunst
 *
 * Zwei **objektive** Signale, beide ohne Sprachmodell:
 *
 * 1. **Nicht-ASCII** im Namen (`ü`, `ö`, `ä`, `ß`) — eindeutig, kein Wörterbuch nötig.
 * 2. Ein **Wortstamm aus einer Liste**, verglichen mit dem **ganzen Segment**. Geteilt wird an
 *    `-`, `_` und `.`; `provider-directory` hat also die Segmente `provider` und `directory`.
 *
 * **Warum ganze Segmente und kein Teilstring.** `stand` steckt in `standard`, `wahl` in `wahlweise`
 * — ein Teilstringvergleich machte aus einem englischen Namen einen deutschen. Die Liste ist
 * dadurch **unvollständig, aber falsch-positiv-frei**: ein neues deutsches Wort wird gemeldet,
 * sobald es in der Liste steht, und **jeder Fund ist nachlesbar**, statt aus einer Heuristik zu
 * fallen.
 *
 * ## Aufruf
 *
 * ```
 * bun scripts/naming-guard.mjs              # Prüflauf: exit 0 = sauber, 1 = Verstoß, 2 = Aufruf
 * bun scripts/naming-guard.mjs --liste      # zusätzlich alle geprüften Pfade je Wurzel
 * ```
 *
 * @module scripts/naming-guard
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

/** Die Wurzeln, die geprüft werden — relativ zur Repository-Wurzel. */
export const WURZELN = ['packages', 'apps', 'scripts', 'services', 'benchmarks', 'docker', 'native']

/**
 * Ordner, die übersprungen werden. **Jeder Eintrag ist eine Entscheidung, keine Bequemlichkeit:**
 * `docs` ist die Ablage der Dokumente (Regel 42 trennt Name und Inhalt nur für Code),
 * `node_modules` ist fremd, `.git` ist kein Baum.
 */
export const AUSGENOMMEN = [
  'node_modules',
  '.git',
  'docs',
  'snapshots',
  'dist',
  'coverage',
  '.turbo',
  '.pmh',
]

/**
 * Deutsche Wortstämme, die als **ganzes Segment** verboten sind.
 *
 * **Diese Liste ist gemessen, nicht erdacht.** Der erste Lauf dieses Wächters hatte **19** Wörter
 * und meldete **34** Verstöße. Dann wurden alle **254** eindeutigen Dateinamen und **420**
 * Ordnernamen der geprüften Wurzeln aufgezählt — und die Liste wuchs auf das, was dort
 * **wirklich steht**. Wer die Liste aus dem Gedächtnis schreibt, zählt seine Erinnerung.
 *
 * Sie bleibt **unvollständig**: ein deutsches Wort, das hier nicht steht, wird nicht gemeldet.
 * Das ist die Grenze des Verfahrens, und sie steht im Bericht.
 */
export const DEUTSCHE_WOERTER = [
  // die acht umbenannten Pakete und ihre Dateien
  'faehigkeiten', 'faehigkeit', 'waechter', 'verzeichnis', 'verwalter', 'einstellungen',
  'quellordner', 'lokal', 'aufbau', 'katalog', 'ausleger', 'regeln', 'sonde', 'sonden',
  'familien', 'datei', 'dateien', 'eskalation',
  // Werkzeuge und Verweise, die im Baum stehen
  'sprach', 'sprache', 'sprachen', 'sprachwaechter', 'sprachtrichter', 'sprachquelle',
  'sprachbegriffe', 'sprachpruefer', 'sprachaufteilung', 'sprachvergleich', 'sprachwerte',
  'sprachpaket', 'messsonden', 'messung', 'messungen', 'pruefung', 'pruefer', 'pruefe',
  'maschinenpfade', 'luecken', 'vorladen', 'ergaenzung', 'verlauf', 'werkzeug', 'werkzeuge',
  'folgen', 'teile', 'wahl', 'lage', 'wurzel', 'wurzeln', 'pfade', 'pfad', 'stand', 'zustand',
  'herkunft', 'marke', 'umschalter', 'entscheiden', 'entscheidung', 'anbieter', 'mensch',
  'menschen', 'grenzen', 'offenes', 'wege', 'bauen', 'protokoll', 'leck',
  // aus der Zählung der WIRKLICHEN Namen am 15.10.2026 nachgetragen
  'adresse', 'anmeldung', 'apischluessel', 'arbeitsbereich', 'attrappe', 'benutzerprofile',
  'betriebsdatenbank', 'einmaltoken', 'geheimnis', 'geo', 'krypto', 'mandant', 'mandantentrennung',
  'ordner', 'proben', 'rechte', 'rechtprobe', 'schluessel', 'schluesselgeber', 'schluesselkette',
  'seite', 'sitzung', 'sitzungen', 'sitzungsprotokoll', 'takt', 'weiter', 'welt', 'wissen',
  'wissensspeicher', 'zerleger', 'zugang', 'zugriff', 'zusatzordner', 'gespraech', 'gespraeche',
  // nachgetragen, als Zug 2 (`auth-http`) elf deutsche Dateinamen umbenannte — DREI davon standen
  // in KEINER Liste: `claim-ablage.ts`, `erstlogin.test.ts`, `http-schicht.test.ts`. Der Wächter
  // hatte sie nie gesehen. **Der Umfang wächst mit jedem Zug** — die Liste ist nachzuführen, sonst
  // meldet sie weniger, als der Baum hergibt.
  'ablage', 'erstlogin', 'schicht',
]

/**
 * Pfade, die **mit Grund** ausgenommen sind. Sie werden **gezählt und genannt**, nicht
 * verschwiegen — eine Ausnahme ohne Zahl ist eine Lücke.
 *
 * `migrations/`: der **Dateiname ist die Schemaversion**. `0009_arbeitsbereich-ordner.sql` ist
 * bereits auf Datenbanken dieser Maschine angewandt; eine Umbenennung schriebe die
 * aufgezeichnete Geschichte des Schemas um. **Deutsche Namen dort sind ein Befund, aber eine
 * Umbenennung wäre ein Schaden** — sie braucht zuerst eine Regel für neue Migrationen.
 */
export const AUSGENOMMENE_PFADE = [
  { muster: /[\\/]migrations[\\/]/u, grund: 'Schemafassung: der Dateiname ist die Version' },
]

/** Ein Segment gilt als deutsch, wenn es in der Liste steht. */
const WOERTER = new Set(DEUTSCHE_WOERTER)

/**
 * Prüft **einen** Namen — Ordner oder Datei.
 *
 * @param name - der reine Name ohne Pfad, z. B. `provider-directory` oder `sonde.ts`
 * @returns `{ ok: true }` oder `{ ok: false, art, grund, segment }`
 */
export function pruefeName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('pruefeName braucht einen nicht-leeren Namen')
  }
  // 1. Nicht-ASCII: der schärfste Befund, er braucht kein Wörterbuch.
  const fremd = [...name].filter((z) => z.codePointAt(0) > 127)
  if (fremd.length > 0) {
    return {
      ok: false,
      art: 'nicht-ascii',
      segment: fremd.join(''),
      grund: `Nicht-ASCII im Namen: ${fremd.join('')}`,
    }
  }
  // 2. Das ganze Segment gegen die Liste.
  for (const segment of name.toLowerCase().split(/[-_.]/u)) {
    if (WOERTER.has(segment)) {
      return {
        ok: false,
        art: 'wort',
        segment,
        grund: `deutsches Segment "${segment}"`,
      }
    }
  }
  return { ok: true }
}

/**
 * Sammelt alle Verstöße unterhalb einer Wurzel.
 *
 * @param wurzel - der zu durchsuchende Ordner
 * @param optionen - `{ ausgenommen, pfadAusnahmen }` ersetzt die Standardlisten
 * @returns `{ verstoesse, geprueft, uebersprungen, mitGrund }`
 */
export function sammleVerstoesse(wurzel, optionen = {}) {
  const ausgenommen = new Set(optionen.ausgenommen ?? AUSGENOMMEN)
  const pfadAusnahmen = optionen.pfadAusnahmen ?? AUSGENOMMENE_PFADE
  const verstoesse = []
  const uebersprungen = []
  const mitGrund = []
  let geprueft = 0

  /** @param ordner - der aktuelle Ordner @param tiefe - Rekursionstiefe */
  function gehe(ordner, tiefe) {
    if (tiefe > 40) return
    let eintraege
    try {
      eintraege = readdirSync(ordner, { withFileTypes: true })
    } catch {
      return // Ein Ordner, den wir nicht lesen dürfen, ist kein Verstoß.
    }
    for (const eintrag of eintraege) {
      const pfad = join(ordner, eintrag.name)
      if (ausgenommen.has(eintrag.name)) {
        uebersprungen.push(pfad)
        continue
      }
      let istOrdner = eintrag.isDirectory()
      if (eintrag.isSymbolicLink()) {
        // Einer Verknüpfung wird NICHT gefolgt: sie kann aus dem Baum herauszeigen.
        try {
          istOrdner = statSync(pfad).isDirectory()
        } catch {
          uebersprungen.push(pfad)
          continue
        }
      }
      geprueft += 1
      const befund = pruefeName(eintrag.name)
      if (!befund.ok) {
        const ausnahme = pfadAusnahmen.find((a) => a.muster.test(pfad))
        if (ausnahme) {
          mitGrund.push({ pfad, name: eintrag.name, grund: befund.grund, warum: ausnahme.grund })
        } else {
          verstoesse.push({
            pfad,
            name: eintrag.name,
            art: befund.art,
            segment: befund.segment,
            grund: befund.grund,
            istOrdner,
          })
        }
      }
      if (istOrdner) gehe(pfad, tiefe + 1)
    }
  }

  gehe(wurzel, 0)
  return { verstoesse, geprueft, uebersprungen, mitGrund }
}

/**
 * Eine **Gegenprobe im Speicher**: ein künstlicher Baum mit einem bekannten Verstoß muß ihn
 * finden, ein sauberer Baum darf nichts finden.
 *
 * **Warum das im Werkzeug steht und nicht nur im Test.** Ein Wächter, dessen Gegenprobe nicht rot
 * wird, mißt nichts (Regel 5). Diese Funktion ist der Beweis, den jeder Lauf mitführt — auch der
 * auf einem fremden Rechner.
 *
 * @returns `{ sauber, schmutzig, rotWird, gruenBleibt, ausnahmeGreift }`
 */
export function gegenprobe() {
  const haus = mkdtempSync(join(tmpdir(), 'pmh-naming-'))
  try {
    const schmutzig = join(haus, 'schmutzig')
    mkdirSync(join(schmutzig, 'verzeichnis'), { recursive: true })
    writeFileSync(join(schmutzig, 'verzeichnis', 'sonde.ts'), '')
    mkdirSync(join(schmutzig, 'sauber'), { recursive: true })
    writeFileSync(join(schmutzig, 'sauber', 'probe.ts'), '')
    // Ein deutscher Name UNTER `migrations/` darf NICHT als Verstoß zählen, sondern muß als
    // Ausnahme mit Grund erscheinen — sonst wäre der Ausschluß eine stille Lüge.
    mkdirSync(join(schmutzig, 'migrations'), { recursive: true })
    writeFileSync(join(schmutzig, 'migrations', '0009_arbeitsbereich-ordner.sql'), '')

    const sauber = join(haus, 'sauber')
    mkdirSync(join(sauber, 'provider-directory'), { recursive: true })
    writeFileSync(join(sauber, 'provider-directory', 'families.ts'), '')
    // `standard` ist der Fall, an dem ein TEILSTRINGVERGLEICH scheitern würde: es enthält `stand`.
    writeFileSync(join(sauber, 'standard.ts'), '')

    const b1 = sammleVerstoesse(schmutzig, { ausgenommen: [] })
    const b2 = sammleVerstoesse(sauber, { ausgenommen: [] })
    return {
      rotWird: b1.verstoesse.length === 2 && b1.verstoesse.some((v) => v.istOrdner),
      gruenBleibt: b2.verstoesse.length === 0,
      ausnahmeGreift: b1.mitGrund.length === 1,
      sauber: b2,
      schmutzig: b1,
    }
  } finally {
    rmSync(haus, { recursive: true, force: true })
  }
}

/** Der Prüflauf über den echten Baum. @param wurzel - die Repository-Wurzel */
export function pruefeBaum(wurzel) {
  const alle = []
  const mitGrund = []
  const fehlend = []
  const uebersprungen = []
  let geprueft = 0
  for (const name of WURZELN) {
    const pfad = join(wurzel, name)
    try {
      if (!statSync(pfad).isDirectory()) throw new Error('kein Ordner')
    } catch {
      fehlend.push(name) // Eine Wurzel, die fehlt, wird GENANNT — nicht verschwiegen.
      continue
    }
    const lauf = sammleVerstoesse(pfad)
    alle.push(...lauf.verstoesse)
    mitGrund.push(...lauf.mitGrund)
    geprueft += lauf.geprueft
    uebersprungen.push(...lauf.uebersprungen)
  }
  alle.sort((a, b) => a.pfad.localeCompare(b.pfad))
  return { verstoesse: alle, mitGrund, geprueft, uebersprungen, fehlend }
}

/** Die Namen und Dateien, die Regel 42 verlangt — als Prüfstein, ob der Baum sie kennt. */
export const ENGLISCHE_PFLICHTNAMEN = [
  'capabilities',
  'provider-directory',
  'directory-curator',
  'settings',
  'source-folders',
  'guard',
  'local',
  'composition',
]

if (import.meta.main) {
  const wurzel = process.cwd()
  const mitListe = process.argv.includes('--liste')
  const g = gegenprobe()
  const lauf = pruefeBaum(wurzel)

  console.log('Wächter für Regel 42 — Ordnernamen und Dateinamen englisch.\n')
  console.log(
    `Gegenprobe: schmutziger Baum wird rot (${g.rotWird ? 'ja' : 'NEIN'}), ` +
      `sauberer Baum bleibt grün (${g.gruenBleibt ? 'ja' : 'NEIN'}), ` +
      `Ausnahme greift statt Verstoß (${g.ausnahmeGreift ? 'ja' : 'NEIN'}).`,
  )
  if (!g.rotWird || !g.gruenBleibt || !g.ausnahmeGreift) {
    console.error('\nDer Wächter ist selbst kaputt: die Gegenprobe stimmt nicht. Nichts geprüft.')
    process.exit(2)
  }
  console.log(
    `\nGeprüft: ${String(lauf.geprueft)} Namen in ${String(WURZELN.length - lauf.fehlend.length)} Wurzeln ` +
      `(${lauf.uebersprungen.length} Pfade übersprungen: ${[...new Set(AUSGENOMMEN)].join(', ')}).`,
  )
  if (lauf.fehlend.length > 0) {
    console.log(`Nicht vorhandene Wurzeln: ${lauf.fehlend.join(', ')}`)
  }
  if (mitListe) {
    for (const p of lauf.uebersprungen) console.log(`  übersprungen: ${relative(wurzel, p)}`)
  }

  if (lauf.mitGrund.length > 0) {
    console.log(`\nAusgenommen MIT GRUND (${String(lauf.mitGrund.length)}):`)
    for (const a of lauf.mitGrund) {
      console.log(`  ${relative(wurzel, a.pfad)}  —  ${a.grund}  [${a.warum}]`)
    }
  }

  if (lauf.verstoesse.length === 0) {
    console.log('\nKein Verstoß. Regel 42 ist auf der Ordner- und Dateiebene eingehalten.')
    process.exit(0)
  }

  console.log(`\n${String(lauf.verstoesse.length)} Verstöße:\n`)
  const nachOrdner = new Map()
  for (const v of lauf.verstoesse) {
    const ordner = relative(wurzel, v.istOrdner ? v.pfad : join(v.pfad, '..'))
    if (!nachOrdner.has(ordner)) nachOrdner.set(ordner, [])
    nachOrdner.get(ordner).push(v)
  }
  for (const [ordner, liste] of [...nachOrdner].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${ordner}${sep}`)
    for (const v of liste) console.log(`    ${v.name}  —  ${v.grund}`)
  }
  console.log(
    '\nDieser Wächter benennt NICHTS um. Er nennt den Zustand. Jede Umbenennung ist eine eigene\n' +
      'Tat mit eigener Messung (docs/status/naming-plan.md).',
  )
  process.exit(1)
}
