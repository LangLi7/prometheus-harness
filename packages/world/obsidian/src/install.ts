/**
 * **Obsidian nachziehen — aus dem Plugin heraus, nicht nur aus dem Installer.**
 *
 * Der Betreiber: *„wenn obsidian existiert oder nicht sollten wir es mit plugin
 * installation obsidian mit checken installieren passend zur betriebssystem."*
 *
 * Das ist der richtige Ort: wer das Plugin einschaltet, will das Panel — und das
 * Panel ohne Programm ist eine halbe Sache. Der Installer (`scripts/install.mjs`)
 * benutzt **dieselben** Rezepte; sie stehen deshalb hier und nicht dort.
 *
 * ## Die Wege je Plattform (belegt, nicht geraten)
 *
 * | Plattform | Weg | Warum dieser |
 * |---|---|---|
 * | Windows | `winget install --id Obsidian.Obsidian -e --silent` | Obsidians eigener Installer, per Benutzer, ohne Administrator |
 * | macOS | `brew install --cask obsidian` | der übliche Weg; ohne Homebrew wird nichts versucht |
 * | Linux | Flatpak `md.obsidian.Obsidian`, sonst Snap | **beide** registrieren `obsidian://` |
 *
 * **Die AppImage-Variante fehlt absichtlich.** Sie registriert keinen
 * `obsidian://`-Handler — der Knopf „In Obsidian öffnen" täte damit nichts, und
 * ein installiertes Programm, das auf den eigenen Knopf nicht reagiert, ist
 * schlimmer als keines.
 *
 * ## Warum das nicht bei jedem Start passiert
 *
 * Ein fehlgeschlagener Installationsversuch wird **gemerkt** (eine kleine Datei
 * im Harness-Home, 24 Stunden gültig). Ohne das würde jeder Start erneut einen
 * Paketmanager anwerfen — bei einem Rechner ohne winget/brew/flatpak wäre das ein
 * Log-Rauschen ohne Wirkung.
 *
 * @module @prometheus-harness/world-obsidian-provider/install
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Ein Installationsrezept. */
export interface Rezept {
  /** Das Programm, das installiert. */
  readonly befehl: string
  /** Seine Argumente. */
  readonly args: readonly string[]
  /** Welches Werkzeug dafür da sein muß. */
  readonly werkzeug: string
  /** Ein vorbereitender Aufruf, etwa das Eintragen einer Paketquelle. */
  readonly vorher?: readonly string[]
  /** Was der vorbereitende Aufruf tut — für die Ausgabe. */
  readonly vorherText?: string
}

/**
 * Die Wege je Plattform, in der Reihenfolge, in der sie versucht werden.
 *
 * Dieselbe Tabelle liest der Installer (`scripts/mitgaben.mjs`) — zwei getrennte
 * Tabellen würden früher oder später auseinanderlaufen, und dann installiert der
 * eine Weg etwas anderes als der andere.
 */
export const OBSIDIAN_REZEPTE: Readonly<Record<string, readonly Rezept[]>> = {
  win32: [
    {
      befehl: 'winget',
      args: [
        'install',
        '--id',
        'Obsidian.Obsidian',
        '-e',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ],
      werkzeug: 'winget',
    },
  ],
  darwin: [{ befehl: 'brew', args: ['install', '--cask', 'obsidian'], werkzeug: 'brew' }],
  linux: [
    {
      befehl: 'flatpak',
      args: ['install', '-y', 'flathub', 'md.obsidian.Obsidian'],
      werkzeug: 'flatpak',
      vorher: ['remote-add', '--if-not-exists', 'flathub', 'https://flathub.org/repo/flathub.flatpakrepo'],
      vorherText: 'Flatpak-Quelle flathub eintragen',
    },
    { befehl: 'snap', args: ['install', 'obsidian', '--classic'], werkzeug: 'snap' },
  ],
}

/** Wie lange ein Fehlversuch gilt, bevor es erneut versucht wird. */
export const VERSUCH_GUELTIG_MS = 24 * 60 * 60 * 1000

/** Die Außenwelt — im Test ersetzbar. */
export interface InstallUmgebung {
  readonly plattform: string
  /** Löst einen Programmnamen im PATH auf. */
  readonly welche: (programm: string) => string | null
  /** Startet ein Programm und sammelt seine Ausgabe. */
  readonly starte: (befehl: string, args: readonly string[]) => Promise<{ readonly code: number | null; readonly text: string }>
}

/** Das Ergebnis eines Versuchs. */
export interface InstallErgebnis {
  /** Ist Obsidian danach da? */
  readonly ok: boolean
  /** Was versucht wurde — auch bei Mißerfolg nachvollziehbar. */
  readonly weg: string
  /** Die Meldung für das Startprotokoll. */
  readonly text: string
}

/**
 * Wählt das erste Rezept, dessen Werkzeug vorhanden ist.
 *
 * @param plattform - `process.platform`
 * @param welche - die PATH-Auflösung
 * @returns das Rezept und die fehlenden Werkzeuge, oder `undefined` ohne Weg
 */
export function waehleRezept(
  plattform: string,
  welche: (programm: string) => string | null,
): { readonly rezept: Rezept | undefined; readonly fehlende: readonly string[] } {
  const fehlende: string[] = []
  for (const rezept of OBSIDIAN_REZEPTE[plattform] ?? []) {
    if (welche(rezept.werkzeug) !== null) return { rezept, fehlende: [] }
    fehlende.push(rezept.werkzeug)
  }
  return { rezept: undefined, fehlende }
}

/** Wo der Merker für einen Fehlversuch liegt. */
/**
 * @param home - das Harness-Home
 * @returns der Pfad der Merkerdatei
 */
export function merkerPfad(home: string): string {
  return join(home, 'world', 'obsidian-install.json')
}

/**
 * Wurde es vor kurzem schon versucht und ist gescheitert?
 *
 * @param home - das Harness-Home
 * @param jetzt - die Uhr, für Prüfungen
 * @returns ob ein Versuch noch gilt
 */
export function vorKurzemGescheitert(home: string, jetzt: number = Date.now()): boolean {
  try {
    const roh = JSON.parse(readFileSync(merkerPfad(home), 'utf8')) as { ts?: unknown; ok?: unknown }
    if (roh.ok === true) return false
    const ts = typeof roh.ts === 'number' ? roh.ts : 0
    return jetzt - ts < VERSUCH_GUELTIG_MS
  } catch {
    return false
  }
}

/**
 * Merkt sich einen Versuch.
 *
 * @param home - das Harness-Home
 * @param ok - ob er gelungen ist
 * @param weg - was versucht wurde
 */
export function merkeVersuch(home: string, ok: boolean, weg: string): void {
  try {
    mkdirSync(join(home, 'world'), { recursive: true })
    writeFileSync(merkerPfad(home), JSON.stringify({ ts: Date.now(), ok, weg }, null, 2), 'utf8')
  } catch {
    // Kein Merker ist kein Fehler — er verhindert nur eine Wiederholung.
  }
}

/**
 * Führt ein Rezept aus.
 *
 * @param rezept - das Rezept
 * @param umgebung - die Außenwelt
 * @returns die gesammelte Ausgabe und der Exit-Code
 */
async function fuehreAus(rezept: Rezept, umgebung: InstallUmgebung): Promise<{ code: number | null; text: string }> {
  const texte: string[] = []
  if (rezept.vorher !== undefined) {
    const vor = await umgebung.starte(rezept.befehl, rezept.vorher)
    texte.push(`${rezept.vorherText ?? 'Vorbereitung'}: exit ${String(vor.code)}`)
    if (vor.code !== 0) {
      if (vor.text !== '') texte.push(vor.text)
      return { code: vor.code, text: texte.join('\n') }
    }
  }
  const lauf = await umgebung.starte(rezept.befehl, rezept.args)
  texte.push(`exit ${String(lauf.code)}`)
  if (lauf.text !== '') texte.push(lauf.text)
  return { code: lauf.code, text: texte.join('\n') }
}

/** Die wirkliche Außenwelt. */
export const WIRKLICHE_UMGEBUNG: InstallUmgebung = {
  plattform: process.platform,
  welche: (programm) => Bun.which(programm),
  starte: async (befehl, args) => {
    /*
     * **Asynchron, mit Absicht.** `spawnSync` würde den Host während der
     * Installation blockieren — bis zu zehn Minuten ohne HTTP. `Bun.spawn` gibt
     * die Ereignisschleife frei; der Start läuft weiter, während der Paketmanager
     * arbeitet.
     */
    try {
      const lauf = Bun.spawn([befehl, ...args], { stdout: 'ignore', stderr: 'ignore', windowsHide: true })
      return { code: await lauf.exited, text: '' }
    } catch (problem) {
      return { code: null, text: problem instanceof Error ? problem.message : String(problem) }
    }
  },
}

/**
 * Installiert Obsidian, wenn es einen Weg gibt.
 *
 * **Der Exit-Code entscheidet nicht.** `winget` meldet 0 auch dann, wenn das
 * Programm danach nicht am erwarteten Ort liegt. Ob es geklappt hat, sagt die
 * Nachprüfung mit derselben Erkennung wie der Knopf im Panel.
 *
 * @param umgebung - die Außenwelt
 * @param pruefeNach - die Nachprüfung; Vorgabe ist die echte Erkennung
 * @returns das Ergebnis
 */
export async function installiereObsidian(
  umgebung: InstallUmgebung = WIRKLICHE_UMGEBUNG,
  pruefeNach: () => boolean = () => false,
): Promise<InstallErgebnis> {
  const { rezept, fehlende } = waehleRezept(umgebung.plattform, umgebung.welche)
  if (rezept === undefined) {
    const grund = fehlende.length > 0 ? fehlende.join(', ') : 'kein bekannter Weg'
    return { ok: false, weg: '—', text: `Kein Installationsweg auf ${umgebung.plattform} (${grund}).` }
  }
  const weg = `${rezept.befehl} ${rezept.args.join(' ')}`
  const lauf = await fuehreAus(rezept, umgebung)
  const ok = pruefeNach()
  return { ok, weg, text: [`${weg}`, lauf.text].filter((zeile) => zeile !== '').join('\n') }
}

/**
 * Darf das Plugin beim Start nachinstallieren?
 *
 * **Vorgabe: ja.** Wer das Plugin einschaltet, will das Panel; ohne Programm ist
 * es halb. Abschalten mit `PMH_OBSIDIAN_INSTALL=0` — dann wird nur erkannt und
 * gemeldet, und das Panel sagt selbst, was fehlt.
 *
 * @param env - die Umgebung
 * @returns ob installiert werden darf
 */
export function darfInstallieren(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const wert = env['PMH_OBSIDIAN_INSTALL']
  return wert !== '0' && wert !== 'false' && wert !== 'nein'
}

/** Gibt es überhaupt einen Weg auf dieser Maschine? Für die Auskunft im Panel. */
/**
 * @param plattform - `process.platform`
 * @param welche - die PATH-Auflösung
 * @returns das erste Rezept oder `undefined`
 */
export function findeRezept(
  plattform: string = process.platform,
  welche: (programm: string) => string | null = (programm) => Bun.which(programm),
): Rezept | undefined {
  return waehleRezept(plattform, welche).rezept
}

