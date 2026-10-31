/**
 * `scripts/machine-paths.mjs` — findet Pfade, die nur auf **einem** Rechner gelten.
 *
 * ## Warum es das gibt (E4)
 *
 * In `docs/protokoll/aufsicht/hilfen/` stehen Pfade wie
 * `C:\Users\Chang\prometheus-harness` fest im Code — gemeint ist aber „das
 * Repository dieses Rechners". Auf einem anderen Rechner sind sie nicht nur
 * nutzlos, sie führen **irgendwohin**. Vor einer Veröffentlichung ist ein
 * Benutzername im Klartext außerdem ein Befund.
 *
 * **Der Umbau ist eine eigene Aufgabe** (und gehört mit der Aufsicht abgestimmt,
 * deren Werkzeuge es sind). Diese Datei ist der **Meßweg**: sie ändert nichts, sie
 * **findet** — und sie hält den Zustand fest, damit der Umbau hinterher
 * nachweisbar ist.
 *
 * ## Was als maschinengebunden gilt — und warum die Muster ALLGEMEIN sind
 *
 * **Kein `Chang` im Muster.** Eine Prüfung, die den Benutzernamen dieses Rechners
 * sucht, wäre selbst maschinengebunden — und auf dem nächsten Rechner blind.
 * Gesucht werden **Formen**:
 *
 * | Form | Beispiel |
 * |---|---|
 * | Windows-Benutzerprofil | `C:\Users\<irgendwer>\…` |
 * | WSL-Abbild davon | `/mnt/c/Users/<irgendwer>/…` |
 * | POSIX-Home | `/home/<irgendwer>/…`, `/Users/<irgendwer>/…` |
 *
 * ## Was NICHT gemeldet wird
 *
 * `node_modules/`, `.git/`, `target/`, `.pmh-build/` und die **kopierte
 * Core-Dokumentation** (`docs/dsh/`) — dort stehen fremde Pfade, die zum
 * Upstream gehören und nicht unsere sind. Eine Prüfung, die das meldet, erzeugt
 * Rauschen, und Rauschen wird ignoriert.
 *
 * @module scripts/machine-paths
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** Die Formen, die als maschinengebunden gelten. */
export const MUSTER = [
  // Beide Trenner: `C:\Users\x` UND `C:/Users/x`. Ein Windows-Pfad mit
  // Schraegstrichen kam vorher als "POSIX-Home" heraus (siehe Test).
  { name: 'Windows-Benutzerprofil', re: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/u },
  { name: 'WSL-Abbild', re: /\/mnt\/[a-z]\/Users\/[^/\s"'`]+/u },
  // Kein Laufwerksbuchstabe und kein /mnt/<x> davor — sonst zaehlt derselbe
  // Windows-Pfad noch einmal als POSIX-Home.
  { name: 'POSIX-Home', re: /(?<![A-Za-z]:)(?<!\/mnt\/[a-z])(?:\/home|\/Users)\/[^/\s"'`]+/u },
]

/** Verzeichnisse und Pfade, die nicht durchsucht werden. */
export const AUSGENOMMEN = ['node_modules', '.git', 'target', '.pmh-build', '.bun-tmp', '.bun-cache', '.vitepress/cache', 'dist', 'docs/dsh', 'docs/design']

/** Dateiendungen, die als Text gelesen werden. */
const TEXTENDUNGEN = ['.mjs', '.js', '.ts', '.tsx', '.ps1', '.sh', '.sql', '.md', '.json', '.yml', '.yaml', '.txt', '.cmd', '.bat', '.toml', '.gitattributes', '.gitignore']

/**
 * Ist der Pfad ausgenommen?
 *
 * @param {string} pfad - der Pfad mit `/` als Trenner
 * @returns {boolean} ob er übersprungen wird
 */
export function ausgenommen(pfad) {
  const teile = pfad.split('/')
  return AUSGENOMMEN.some((a) => (a.includes('/') ? pfad.includes(a) : teile.includes(a)))
}

/**
 * Sammelt die Textdateien unter einem Verzeichnis.
 *
 * @param {string} wurzel - das Verzeichnis
 * @param {string} [relativ] - der bisherige Relativpfad
 * @returns {string[]} die gefundenen Dateien (relativ, mit `/`)
 */
export function sammle(wurzel, relativ = '') {
  const gefunden = []
  for (const eintrag of readdirSync(join(wurzel, relativ === '' ? '.' : relativ), { withFileTypes: true })) {
    const pfad = relativ === '' ? eintrag.name : `${relativ}/${eintrag.name}`
    if (ausgenommen(pfad)) continue
    if (eintrag.isDirectory()) {
      gefunden.push(...sammle(wurzel, pfad))
      continue
    }
    if (!TEXTENDUNGEN.some((e) => pfad.toLowerCase().endsWith(e))) continue
    gefunden.push(pfad)
  }
  return gefunden
}

/**
 * Untersucht eine Datei.
 *
 * @param {string} wurzel - das Wurzelverzeichnis
 * @param {string} relativ - der relative Pfad
 * @returns {{datei: string, zeile: number, form: string, text: string}[]} die Funde
 */
export function untersuche(wurzel, relativ) {
  const funde = []
  let inhalt
  try {
    inhalt = readFileSync(join(wurzel, relativ), 'utf8')
  } catch {
    return funde
  }
  const zeilen = inhalt.split('\n')
  for (const [i, zeile] of zeilen.entries()) {
    for (const m of MUSTER) {
      const treffer = m.re.exec(zeile)
      if (treffer !== null) {
        funde.push({ datei: relativ, zeile: i + 1, form: m.name, text: treffer[0] })
        break
      }
    }
  }
  return funde
}

/**
 * Führt einen Befehl aus.
 *
 * @param {readonly string[]} argv - die Argumente ohne `node` und Skriptpfad
 * @param {Readonly<Record<string, string | undefined>>} umgebung - Umgebungsvariablen
 * @param {(text: string) => void} schreibe - Ausgabe
 * @returns {number} der Exit-Code
 */
export function fuehreAus(argv, umgebung = process.env, schreibe = (t) => process.stdout.write(t)) {
  if (argv[0] !== 'pruefen') {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/machine-paths.mjs pruefen [verzeichnis] [--streng]\n' +
        '\n' +
        '  Findet Pfade, die nur auf EINEM Rechner gelten (C:\\Users\\<wer>, /home/<wer>).\n' +
        '  Ohne --streng: berichten, Exit 0. Mit --streng: Exit 1 bei Fund.\n' +
        '  Ausgenommen: node_modules, .git, target, .pmh-build, dist, docs/dsh, docs/design.\n',
    )
    return 1
  }

  const streng = argv.includes('--streng')
  const ziele = argv.slice(1).filter((a) => !a.startsWith('--'))
  const wurzeln = ziele.length === 0 ? ['.'] : ziele

  let gesamt = 0
  const proForm = new Map()
  const proDatei = new Map()

  for (const w of wurzeln) {
    let dateien
    try {
      if (!statSync(w).isDirectory()) {
        // **Eine einzelne Datei.** Der erste Entwurf schob sie hier an `wurzeln`
        // an — also in das Feld, über das die Schleife gerade läuft. Das ist eine
        // Endlosschleife; jetzt wird sie direkt untersucht.
        for (const fund of untersuche(dirname(w), basename(w))) {
          gesamt += 1
          proForm.set(fund.form, (proForm.get(fund.form) ?? 0) + 1)
          proDatei.set(w, (proDatei.get(w) ?? 0) + 1)
        }
        continue
      }
      dateien = sammle(w)
    } catch {
      schreibe(`FEHLER: ${w} gibt es nicht oder ist kein Verzeichnis.\n`)
      return 2
    }
    for (const d of dateien) {
      for (const fund of untersuche(w, d)) {
        gesamt += 1
        proForm.set(fund.form, (proForm.get(fund.form) ?? 0) + 1)
        const schluessel = `${w === '.' ? '' : `${w}/`}${fund.datei}`
        proDatei.set(schluessel, (proDatei.get(schluessel) ?? 0) + 1)
      }
    }
  }

  schreibe(`MASCHINENGEBUNDENE PFADE — ${String(gesamt)} Fund(e) in ${String(proDatei.size)} Datei(en)\n\n`)
  for (const [form, zahl] of [...proForm.entries()].sort((a, b) => b[1] - a[1])) {
    schreibe(`  ${form.padEnd(24)} ${String(zahl)}\n`)
  }
  schreibe('\n')
  for (const [datei, zahl] of [...proDatei.entries()].sort((a, b) => b[1] - a[1])) {
    schreibe(`  ${String(zahl).padStart(3)}  ${datei}\n`)
  }
  if (gesamt === 0) schreibe('  (keine — die Muster sind allgemein, nicht auf einen Namen gemünzt)\n')

  return streng && gesamt > 0 ? 1 : 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('machine-paths.mjs')) {
  process.exitCode = fuehreAus(process.argv.slice(2))
}
