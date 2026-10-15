#!/usr/bin/env bun
/**
 * Der Wächter für **tote Verweise** — zeigt eine Adresse im Baum auf eine Datei, die es nicht
 * (mehr) gibt?
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Bei jeder Umbenennung gilt ein Satz aus `naming-plan.md`: **ein Name ist keine Adresse in einem
 * Import, sondern ein Text an vielen Stellen.** Ein Skript wird in `package.json`, in `.ps1`- und
 * `.cmd`-Hüllen, in `.github/workflows/`, in anderen Skripten, in `docs/` **genannt** — und wer es
 * umbenennt, sieht nur die Importe. In `docs/status/naming-rest.md` §4 steht deshalb: **vor** Zug 5
 * (43 Skriptnamen) braucht es dieses Werkzeug, sonst tauscht man deutsche Namen gegen eine
 * unbekannte Zahl stiller Ausfälle.
 *
 * ## Geprüft wird, was UNS gehört: die von git verfolgten Dateien
 *
 * Der erste Lauf über den **ganzen** Baum meldete **196** tote Verweise im Code — und die drei
 * häufigsten Quellen waren `.github/review-ownership/test_blame_production.py` (22),
 * `website/.bun-cache/rollup@4.64.5/package.json` (12) und `website/.bun-cache/rollup/4.64.5/package.json`
 * (12). **Keine davon ist unsere Datei:** der Paketzwischenspeicher ist erzeugt, und in
 * `.github/workflows/` ist von **acht** Workflow-Dateien **eine** verfolgt. **Eine Zahl über einen
 * fremden Baum ist keine Auskunft über unseren.**
 *
 * Deshalb kommt die Dateiliste aus `git ls-files`. Ist git nicht da, wird der Baum durchsucht — und
 * das steht dann **im Bericht**, samt Zahl der nicht geprüften fremden Dateien.
 *
 * ## Was gemessen wird — und was nicht
 *
 * Gefunden werden **Pfadangaben mit Endung**, von der Wurzel aus geschrieben:
 * `scripts/typecheck.mjs`, `packages/ai/capabilities/src/index.ts`, `docs/status/naming-plan.md`.
 * Gemeldet wird, was **nicht existiert**.
 *
 * **Die Grenzen, ausgesprochen:**
 *
 * * **Relative Angaben** (`../migrations/0001_identitaet.sql`) werden **nicht** geprüft — sie
 *   bräuchten die Basis der Datei, in der sie stehen, und eine falsche Basis erzeugt erfundene
 *   Befunde. Sie werden **gezählt und genannt**.
 * * **Muster** (eine Wurzel mit Sternchen) werden nicht geprüft — ein Muster ist keine Adresse.
 * * **Ordnerangaben ohne Endung** (`packages/ai/capabilities`) werden nicht geprüft; die Prüfung
 *   gilt Dateien. Auch das steht als Zahl im Bericht.
 *
 * ## Warum CODE rot macht und DOKUMENTE nicht
 *
 * Ein toter Verweis in **Code** ist ein Defekt: der Aufruf scheitert, oder ein Werkzeug liest eine
 * Datei, die es nicht gibt. Ein toter Verweis in einem **datierten Bericht** ist **Geschichte** —
 * `naming-rest.md` und `naming-plan.md` nennen absichtlich die **alten** Namen, sonst wäre die
 * Umbenennung nicht nachvollziehbar (dieselbe Regel wie beim Richtigstellen: die falsche Aussage
 * bleibt stehen). Beide Zahlen werden genannt; **rot macht nur Code**. Mit `--streng` auch
 * Dokumente.
 *
 * **Dokument** heißt: `.md`, `.txt`, `.jsonl` — überall — und `.json` **unter `docs/`**.
 * `docs/status/messsonden/*.mjs` ist damit **Code**, und das ist Absicht: das sind ausführbare
 * Meßwerkzeuge, kein Bericht.
 *
 * ## Aufruf
 *
 * ```
 * bun scripts/reference-guard.mjs            # exit 0 = Code sauber, 1 = toter Verweis im Code, 2 = Aufruf
 * bun scripts/reference-guard.mjs --streng   # Dokumente zählen mit
 * bun scripts/reference-guard.mjs --alle     # jede Fundstelle einzeln
 * ```
 *
 * @module scripts/reference-guard
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, dirname, resolve } from 'node:path'

/** Die Wurzeln, auf die eine Adresse zeigen darf. */
export const ADRESSWURZELN = [
  'packages',
  'apps',
  'scripts',
  'services',
  'docker',
  'benchmarks',
  'docs',
  'snapshots',
  'native',
  'units',
  'tests',
  'website',
]

/**
 * Ordner, die nicht durchsucht werden.
 *
 * `dsh` ist der **übersetzte Upstream-Baum** unter `docs/` (Fremdtext): seine Adressen zeigen auf
 * den Upstream, nicht auf uns. Er wird gezählt, nicht geprüft — sonst bestünde der Bericht
 * überwiegend aus Befunden über fremde Dateien.
 */
export const AUSGENOMMEN = ['node_modules', '.git', 'dist', 'coverage', '.turbo', '.pmh', '.bun-cache', 'dsh']

/** Endungen, die als Adresse zählen — ein Verweis ohne Endung ist ein Name, keine Adresse. */
const ENDUNGEN = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json', 'jsonl', 'md', 'txt', 'yml', 'yaml', 'toml',
  'sql', 'sh', 'ps1', 'cmd', 'bat', 'css', 'html', 'go', 'rs', 'py', 'lock', 'example', 'jsonc',
])

/** Dateien, in denen gesucht wird. */
const TEXTENDUNGEN = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json', 'jsonl', 'md', 'txt', 'yml', 'yaml', 'toml',
  'sql', 'sh', 'ps1', 'cmd', 'bat', 'css', 'html', 'go', 'rs', 'py', 'example', 'jsonc',
])

/** Endungen, die **ohne** `docs/` als Code gelten. */
const CODEENDUNGEN = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json', 'jsonl', 'yml', 'yaml', 'toml', 'sql', 'sh',
  'ps1', 'cmd', 'bat', 'go', 'rs', 'py', 'example', 'jsonc',
])

/** Die Endung eines Pfades, klein geschrieben. @param pfad - der Pfad */
function endung(pfad) {
  const name = pfad.replace(/\\/gu, '/').split('/').pop() ?? ''
  const punkt = name.lastIndexOf('.')
  return punkt < 0 ? '' : name.slice(punkt + 1).toLowerCase()
}

/**
 * Ist das ein **Dokument**? Dann ist ein toter Verweis darin Geschichte, kein Defekt.
 *
 * @param pfad - der Pfad, relativ zur Wurzel oder absolut
 */
export function istDokument(pfad) {
  const e = endung(pfad)
  if (e === 'md' || e === 'txt' || e === 'jsonl') return true
  const normal = pfad.replace(/\\/gu, '/')
  return e === 'json' && (normal.startsWith('docs/') || normal.includes('/docs/'))
}

/**
 * Zieht die Adresskandidaten aus einem Text.
 *
 * @param text - der Dateiinhalt
 * @returns `{ adressen, relativ, muster, ohneEndung }` — die drei letzten sind **Zählungen** der
 *   bewußt nicht geprüften Fälle
 */
export function zieheAdressen(text) {
  const adressen = new Set()
  let relativ = 0
  let muster = 0
  let ohneEndung = 0
  const wurzelMuster = ADRESSWURZELN.join('|')
  // Pfadartige Ketten: Wurzel, dann Zeichen, endend in `.endung`. Sternchen und Fragezeichen sind
  // **mit** im Zeichensatz, damit ein MUSTER überhaupt erkannt und dann als Muster **gezählt**
  // wird. Ohne sie fiele es still heraus — und die Zusage „Muster werden gezählt" wäre leer.
  // (Gemessen: die Prüfung `ein MUSTER ist keine Adresse und wird nur gezählt` war rot, weil
  // `muster` 0 war. Das Muster wurde nicht gezählt, es wurde verschluckt.)
  const lauf = new RegExp(`(?:\\.\\./)+[A-Za-z0-9_./*?-]+|(?:${wurzelMuster})/[A-Za-z0-9_./*?-]+`, 'gu')
  for (const treffer of text.matchAll(lauf)) {
    const roh = treffer[0]
    if (roh.startsWith('..')) {
      relativ += 1
      continue
    }
    if (/[*?{}<>|]/u.test(roh)) {
      muster += 1
      continue
    }
    const sauber = roh.replace(/[.,;:)\]]+$/u, '') // Satzzeichen am Ende gehören nicht zur Adresse
    const letzterPunkt = sauber.lastIndexOf('.')
    const letzterStrich = sauber.lastIndexOf('/')
    if (letzterPunkt <= letzterStrich) {
      ohneEndung += 1
      continue
    }
    const e = sauber.slice(letzterPunkt + 1).toLowerCase()
    if (!ENDUNGEN.has(e)) {
      ohneEndung += 1
      continue
    }
    adressen.add(sauber)
  }
  return { adressen: [...adressen], relativ, muster, ohneEndung }
}

/**
 * Die von git verfolgten Dateien — **das ist unsere Menge.**
 *
 * @param wurzel - die Repository-Wurzel
 * @returns `{ dateien, quelle, grund }` — `quelle` ist `'git'` oder `'baum'`
 */
export function verfolgteDateien(wurzel) {
  try {
    const roh = execFileSync('git', ['ls-files', '-z'], {
      cwd: wurzel,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const dateien = roh
      .toString('utf8')
      .split('\u0000')
      .filter((s) => s.length > 0)
    if (dateien.length === 0) return { dateien: [], quelle: 'git', grund: 'git ls-files lieferte nichts' }
    return { dateien, quelle: 'git', grund: '' }
  } catch (fehler) {
    return {
      dateien: [],
      quelle: 'baum',
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    }
  }
}

/**
 * Lebt die Adresse — **von irgendeiner Basis aus, die der Leser meinen kann?**
 *
 * **Warum nicht nur die Wurzel.** Gemessen am 15.10.2026 meldete der erste Lauf `tests/lebend.test.ts`
 * aus `packages/ai/openrouter/src/index.ts` als tot. Die Datei gibt es sehr wohl — als
 * `packages/ai/openrouter/tests/lebend.test.ts`. Im Paket ist `tests/…` **paketlokal** gemeint, von
 * der Wurzel aus ist es falsch. **Ein Wächter, der die Basis nicht kennt, erfindet Befunde.**
 *
 * Deshalb wird die Adresse gegen **jede** Basis geprüft: das Verzeichnis der Datei und jede
 * Elternstufe bis zur Wurzel. Erst wenn **keine** sie kennt, ist sie tot.
 *
 * @param wurzel - die Repository-Wurzel
 * @param pfadRelativ - der Pfad der Datei, in der die Adresse steht
 * @param adresse - die Adresse
 */
export function lebendig(wurzel, pfadRelativ, adresse) {
  let ordner = dirname(join(wurzel, pfadRelativ))
  const oben = resolve(wurzel)
  for (;;) {
    if (existsSync(join(ordner, adresse))) return true
    const eltern = dirname(ordner)
    if (eltern === ordner) return false
    if (ordner === oben) return false
    ordner = eltern
  }
}

/**
 * Sammelt alle Adressen und prüft sie.
 *
 * @param wurzel - die Repository-Wurzel
 * @param optionen - `{ dateien, ausgenommen }`; `dateien` überschreibt die Ermittlung (für Prüfungen)
 * @returns `{ tote, geprueftDateien, adressen, zaehlung, quelle, grund }`
 */
export function pruefeVerweise(wurzel, optionen = {}) {
  const ausgenommen = new Set(optionen.ausgenommen ?? AUSGENOMMEN)
  const tote = []
  const adressen = new Set()
  const zaehlung = { relativ: 0, muster: 0, ohneEndung: 0 }
  let geprueftDateien = 0

  /**
   * Prüft eine einzelne Datei.
   *
   * @param pfadRelativ - der Pfad relativ zur Wurzel, mit `/`
   * @param pfadAbsolut - der Pfad auf der Platte
   */
  function pruefeDatei(pfadRelativ, pfadAbsolut) {
    if (!TEXTENDUNGEN.has(endung(pfadRelativ))) return
    let text
    try {
      text = readFileSync(pfadAbsolut, 'utf8')
    } catch {
      return
    }
    geprueftDateien += 1
    const befund = zieheAdressen(text)
    zaehlung.relativ += befund.relativ
    zaehlung.muster += befund.muster
    zaehlung.ohneEndung += befund.ohneEndung
    for (const adresse of befund.adressen) {
      adressen.add(adresse)
      if (!lebendig(wurzel, pfadRelativ, adresse)) {
        tote.push({ adresse, quelle: pfadRelativ, istCode: !istDokument(pfadRelativ) })
      }
    }
  }

  let quelle
  let grund
  if (optionen.dateien) {
    quelle = 'liste'
    grund = ''
    for (const d of optionen.dateien) pruefeDatei(d, join(wurzel, d))
  } else {
    const ermittelt = verfolgteDateien(wurzel)
    quelle = ermittelt.quelle
    grund = ermittelt.grund
    if (quelle === 'git') {
      for (const d of ermittelt.dateien) {
        if (d.split('/').some((teil) => ausgenommen.has(teil))) continue
        pruefeDatei(d, join(wurzel, d))
      }
    } else {
      /** @param ordner - der aktuelle Ordner @param tiefe - Rekursionstiefe */
      const gehe = (ordner, tiefe) => {
        if (tiefe > 40) return
        let eintraege
        try {
          eintraege = readdirSync(ordner, { withFileTypes: true })
        } catch {
          return
        }
        for (const eintrag of eintraege) {
          if (ausgenommen.has(eintrag.name)) continue
          const pfad = join(ordner, eintrag.name)
          let istOrdner = eintrag.isDirectory()
          if (eintrag.isSymbolicLink()) {
            try {
              istOrdner = statSync(pfad).isDirectory()
            } catch {
              continue
            }
          }
          if (istOrdner) gehe(pfad, tiefe + 1)
          else pruefeDatei(relative(wurzel, pfad).replace(/\\/gu, '/'), pfad)
        }
      }
      gehe(wurzel, 0)
    }
  }

  const gesehen = new Set()
  const eindeutig = []
  for (const t of tote) {
    const schluessel = `${t.adresse}|${t.quelle}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    eindeutig.push(t)
  }
  eindeutig.sort((a, b) => a.adresse.localeCompare(b.adresse) || a.quelle.localeCompare(b.quelle))
  return { tote: eindeutig, geprueftDateien, adressen: [...adressen], zaehlung, quelle, grund }
}

/**
 * Die **Gegenprobe im Speicher**: ein künstlicher Baum mit einem toten Verweis muß ihn finden, ein
 * sauberer darf nichts finden.
 *
 * @returns `{ rotWird, gruenBleibt, sauber, schmutzig }`
 */
export function gegenprobe() {
  const haus = mkdtempSync(join(tmpdir(), 'pmh-verweis-'))
  try {
    const schmutzig = join(haus, 'schmutzig')
    mkdirSync(join(schmutzig, 'scripts'), { recursive: true })
    writeFileSync(join(schmutzig, 'scripts', 'da.mjs'), '')
    writeFileSync(
      join(schmutzig, 'schmutzig.json'),
      JSON.stringify({ a: 'bun run scripts/da.mjs', b: 'bun run scripts/weg.mjs' }),
    )

    const sauber = join(haus, 'sauber')
    mkdirSync(join(sauber, 'scripts'), { recursive: true })
    writeFileSync(join(sauber, 'scripts', 'da.mjs'), '')
    writeFileSync(join(sauber, 'sauber.json'), JSON.stringify({ a: 'bun run scripts/da.mjs' }))

    // **Der Fall, an dem eine reine Wurzelprüfung falsche Befunde erfindet:** im Paket ist
    // `tests/…` paketlokal gemeint. `sauber/paket/src/x.ts` nennt `tests/da.test.ts`, und die
    // Datei liegt in `sauber/paket/tests/da.test.ts`.
    const paket = join(sauber, 'paket')
    mkdirSync(join(paket, 'src'), { recursive: true })
    mkdirSync(join(paket, 'tests'), { recursive: true })
    writeFileSync(join(paket, 'tests', 'da.test.ts'), '')
    writeFileSync(join(paket, 'src', 'x.ts'), '// siehe tests/da.test.ts\n')

    const s1 = pruefeVerweise(schmutzig, { dateien: ['schmutzig.json'] })
    const s2 = pruefeVerweise(sauber, { dateien: ['sauber.json', 'paket/src/x.ts'] })
    return {
      rotWird: s1.tote.length === 1 && s1.tote[0]?.adresse === 'scripts/weg.mjs',
      gruenBleibt: s2.tote.length === 0,
      // Ein toter Verweis in einem DOKUMENT darf nicht rot machen — auch das wird geprüft.
      dokumentZaehltNicht: s1.tote.filter((t) => t.istCode).length === 1,
      // Und der paketlokale Fall darf NICHT gemeldet werden.
      paketlokalErkannt: s2.tote.length === 0,
      sauber: s2,
      schmutzig: s1,
    }
  } finally {
    rmSync(haus, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const wurzel = process.cwd()
  const streng = process.argv.includes('--streng')
  const alle = process.argv.includes('--alle')
  const g = gegenprobe()

  console.log('Wächter für tote Verweise — zeigt eine Adresse auf eine Datei, die es nicht gibt?\n')
  console.log(
    `Gegenprobe: toter Verweis wird gefunden (${g.rotWird ? 'ja' : 'NEIN'}), ` +
      `sauberer Baum bleibt grün (${g.gruenBleibt ? 'ja' : 'NEIN'}), ` +
      `Dokument zählt nicht als Code (${g.dokumentZaehltNicht ? 'ja' : 'NEIN'}), ` +
      `paketlokaler Pfad wird NICHT gemeldet (${g.paketlokalErkannt ? 'ja' : 'NEIN'}).`,
  )
  if (!g.rotWird || !g.gruenBleibt || !g.dokumentZaehltNicht || !g.paketlokalErkannt) {
    console.error('\nDer Wächter ist selbst kaputt: die Gegenprobe stimmt nicht. Nichts geprüft.')
    process.exit(2)
  }

  const lauf = pruefeVerweise(wurzel)
  const imCode = lauf.tote.filter((t) => t.istCode)
  const inDokumenten = lauf.tote.filter((t) => !t.istCode)

  console.log(`\nDateiliste aus: ${lauf.quelle === 'git' ? 'git ls-files (unsere Menge)' : 'Baumdurchsuchung'}`)
  if (lauf.quelle !== 'git') {
    console.log(`  ACHTUNG: git nicht benutzbar (${lauf.grund}) — fremde und erzeugte Dateien sind mitgezählt.`)
  }
  console.log(
    `Geprüft: ${String(lauf.geprueftDateien)} Textdateien, ${String(lauf.adressen.length)} verschiedene Adressen.`,
  )
  console.log(
    `Nicht geprüft, gezählt: ${String(lauf.zaehlung.relativ)} relative Angaben, ` +
      `${String(lauf.zaehlung.muster)} Muster, ${String(lauf.zaehlung.ohneEndung)} Angaben ohne Endung.`,
  )
  console.log(
    `\nTOTE VERWEISE IM CODE:      ${String(imCode.length)} (in ${String(new Set(imCode.map((t) => t.quelle)).size)} Dateien)`,
  )
  console.log(
    `Tote Verweise in Dokumenten: ${String(inDokumenten.length)} (in ${String(new Set(inDokumenten.map((t) => t.quelle)).size)} Dateien)`,
  )

  /** @param liste - die anzuzeigenden Fundstellen @param grenze - wie viele ohne `--alle` */
  const zeige = (liste, grenze) => {
    const sichtbar = alle ? liste : liste.slice(0, grenze)
    for (const t of sichtbar) console.log(`  ${t.adresse}   <-  ${t.quelle}`)
    if (!alle && liste.length > grenze) {
      console.log(`  … und ${String(liste.length - grenze)} weitere (--alle zeigt alle)`)
    }
  }
  if (imCode.length > 0) {
    console.log('\nIm CODE — das ist ein Defekt:')
    zeige(imCode, 40)
  }
  if (inDokumenten.length > 0) {
    console.log('\nIn DOKUMENTEN — das kann Geschichte sein (datierte Berichte nennen alte Namen absichtlich):')
    zeige(inDokumenten, 10)
  }

  if (imCode.length > 0 || (streng && inDokumenten.length > 0)) {
    console.log('\nDieser Wächter benennt NICHTS um und löscht nichts. Er nennt den Zustand.')
    process.exit(1)
  }
  console.log('\nKein toter Verweis im Code.')
  process.exit(0)
}
