/**
 * `scripts/mitgaben.mjs` — **Graphify und Obsidian nachziehen, plattformgerecht.**
 *
 * ## Warum es diesen Schritt gibt
 *
 * Beide sind **Mitgaben**, keine Voraussetzungen: ohne sie startet der Harness,
 * und beide Panels sagen ehrlich, was fehlt. Nur: ein Panel, das „nicht
 * installiert" sagt und keinen Weg nennt, ist eine Sackgasse. Der Installer ist
 * der Ort, an dem der Weg gangbar ist — er kennt die Plattform, er darf Programme
 * starten, und er läuft genau einmal.
 *
 * ## Warum die beiden **ungleich** behandelt werden
 *
 * | | Graphify | Obsidian |
 * |---|---|---|
 * | Bezug | PyPI-Paket `graphifyy` (Apache-2.0) | Obsidian (proprietär) |
 * | Rechte | keine | **für gewerbliche Nutzung kostenpflichtig** |
 * | Art | Kommandozeilen-Werkzeug | Programm mit Oberfläche |
 * | Rücknahme | `uv tool uninstall graphifyy` | Deinstallation von Hand |
 * | Vorgabe hier | **wird installiert** | **wird genannt, nicht getan** |
 *
 * Dieselbe Zurückhaltung wie bei Docker Desktop in `install.mjs`: ein Programm
 * mit eigener Lizenz und Oberfläche still zu installieren wäre eine Entscheidung,
 * die dem Betreiber gehört. `--mit-obsidian` nimmt sie ihm ab, wenn er sie treffen
 * will.
 *
 * ## Warum der Weg über den Paketmanager und nicht über einen Download
 *
 * Ein Installer, der eine `.exe` von einer festen Adresse lädt, pinnt eine
 * Fassung, prüft keine Prüfsumme und altert beim nächsten Release. Die
 * dokumentierten Wege der beiden Projekte sind:
 *
 * * Graphify: `uv tool install graphifyy` (README, PyPI `graphifyy` — **zwei y**;
 *   andere `graphify*`-Pakete sind nicht verwandt), Extra `mcp` für den
 *   MCP-Server.
 * * Obsidian: winget `Obsidian.Obsidian` (Windows), `brew --cask` (macOS),
 *   Flatpak `md.obsidian.Obsidian` bzw. Snap (Linux). Die AppImage-Variante ist
 *   **absichtlich nicht** dabei: sie registriert keinen `obsidian://`-Handler,
 *   und ohne den tut der Knopf „In Obsidian öffnen" nichts.
 *
 * ## Prüfbar ohne Installation
 *
 * Jede Außenwelt („welches Programm gibt es", „starte das") ist einspeisbar.
 * Die Prüfdatei `tests/mitgaben.test.ts` ersetzt sie und deckt jede Plattform ab,
 * ohne daß auf diesem Rechner etwas installiert wird.
 *
 * @module scripts/mitgaben
 */

import { findeApp } from '../packages/world/obsidian/src/app.ts'
// **Dieselben Rezepte wie das Plugin** — eine Tabelle, zwei Aufrufer (Plugin-Start und Installer).
import { OBSIDIAN_REZEPTE } from '../packages/world/obsidian/src/install.ts'

/** Ein Installationsrezept: ein Programm, seine Argumente, was vorher nötig ist. */
/**
 * @typedef {object} Rezept
 * @property {string} befehl - das Programm
 * @property {readonly string[]} args - seine Argumente
 * @property {string} [werkzeug] - welches Werkzeug dafür da sein muß (`uv`, `winget`, …)
 * @property {readonly string[]} [vorher] - ein vorbereitender Aufruf (z. B. Flathub hinzufügen)
 * @property {string} [vorherText] - was der vorbereitende Aufruf tut, für die Ausgabe
 */

/**
 * @typedef {object} Mitgabe
 * @property {string} titel - der Name, wie er in der Ausgabe steht
 * @property {string} warum - wofür sie gut ist
 * @property {boolean} standard - wird sie ohne Schalter installiert?
 * @property {Readonly<Record<string, readonly Rezept[]>>} rezepte - je Plattform, der Reihe nach versucht
 * @property {string} ohne - was ohne sie fehlt
 */

/** @type {Readonly<Record<'graphify' | 'obsidian', Mitgabe>>} */
export const MITGABEN = {
  graphify: {
    titel: 'Graphify',
    warum: 'Graph statt grep: der Agent fragt den Graphen, statt Dateien zu lesen.',
    standard: true,
    rezepte: {
      '*': [
        { befehl: 'uv', args: ['tool', 'install', 'graphifyy[mcp]'], werkzeug: 'uv' },
        { befehl: 'pipx', args: ['install', 'graphifyy[mcp]'], werkzeug: 'pipx' },
      ],
    },
    ohne: 'Ohne Graphify fehlen die Graph-Werkzeuge des Agenten; Suche und Lesen bleiben.',
  },
  obsidian: {
    titel: 'Obsidian',
    warum: 'Vault-Panel und „In Obsidian öffnen“.',
    standard: false,
    rezepte: OBSIDIAN_REZEPTE,
    ohne:
      'Ohne Obsidian bleiben Vault-Panel und der Knopf verborgen; ein Vault läßt sich ' +
      'weiterhin lesen, wenn ein Ordner in PMH_OBSIDIAN_VAULT steht.',
  },
}

/** Die Namen in Anzeigereihenfolge. */
export const MITGABEN_NAMEN = /** @type {const} */ (['graphify', 'obsidian'])

/** Die Außenwelt, die der Installer benutzt — im Test ersetzbar. */
/**
 * @typedef {object} Umgebung
 * @property {(programm: string) => string | null} welche - löst einen Programmnamen auf
 * @property {(programm: string, args: readonly string[]) => Promise<{ code: number | null, text: string }>} laufe
 * @property {string} plattform - `process.platform`
 * @property {() => { verfuegbar: boolean, exe: string | null, detail: string }} findeObsidian
 */

/** @type {Umgebung} */
const WIRKLICH = {
  welche: (programm) => Bun.which(programm),
  laufe: async (programm, args) => {
    try {
      const p = Bun.spawn([programm, ...args], { stdout: 'pipe', stderr: 'pipe' })
      const [aus, fehler] = await Promise.all([
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
      ])
      const code = await p.exited
      return { code, text: `${aus}${fehler}`.trim() }
    } catch (problem) {
      return { code: null, text: problem instanceof Error ? problem.message : String(problem) }
    }
  },
  plattform: process.platform,
  findeObsidian: () => findeApp(),
}

/**
 * Die Rezepte einer Mitgabe für diese Plattform.
 *
 * @param {Mitgabe} mitgabe - die Mitgabe
 * @param {string} plattform - `process.platform`
 * @returns {readonly Rezept[]} die der Reihe nach zu versuchenden Rezepte
 */
export function rezepteFuer(mitgabe, plattform) {
  return [...(mitgabe.rezepte['*'] ?? []), ...(mitgabe.rezepte[plattform] ?? [])]
}

/** Der Zustand einer Mitgabe. */
/**
 * @typedef {object} Befund
 * @property {string} name - der Schlüssel
 * @property {string} titel - der Anzeigename
 * @property {boolean} da - gefunden?
 * @property {string} fassung - Fassung oder ein Grund
 * @property {string | null} pfad - wo sie liegt
 * @property {readonly string[]} wege - die in Frage kommenden Installationsbefehle
 */

/**
 * Prüft, ob eine Mitgabe da ist — **ohne** etwas zu starten, was es nicht gibt.
 *
 * Obsidian wird über **dieselbe** Erkennung gesucht wie der Knopf im Panel
 * (`findeApp`): ein zweiter Weg wäre eine zweite Wahrheit, und die weichen
 * erfahrungsgemäß genau dann voneinander ab, wenn es darauf ankommt.
 *
 * @param {'graphify' | 'obsidian'} name - welche Mitgabe
 * @param {Umgebung} [umgebung] - die Außenwelt
 * @returns {Promise<Befund>} der Befund
 */
export async function pruefe(name, umgebung = WIRKLICH) {
  const mitgabe = MITGABEN[name]
  const rezepte = rezepteFuer(mitgabe, umgebung.plattform)
  const wege = rezepte.map((rezept) => `  ${[rezept.befehl, ...rezept.args].join(' ')}`)
  if (name === 'obsidian') {
    const befund = umgebung.findeObsidian()
    return {
      name,
      titel: mitgabe.titel,
      da: befund.verfuegbar,
      fassung: befund.verfuegbar ? (befund.exe ?? 'gefunden') : befund.detail,
      pfad: befund.exe,
      wege,
    }
  }
  const pfad = umgebung.welche('graphify')
  if (pfad === null) {
    return { name, titel: mitgabe.titel, da: false, fassung: 'nicht im PATH', pfad: null, wege }
  }
  const lauf = await umgebung.laufe('graphify', ['--version'])
  const text = lauf.text.split('\n')[0]?.trim() ?? ''
  /*
   * **Gefunden ist nicht dasselbe wie ausführbar.** Stand hier `da: lauf.code === 0`,
   * meldete ein Werkzeug, das im PATH liegt, aber nicht starten darf (fehlende
   * Rechte, blockierte Ausführung, kaputte Shebang), „FEHLT" — und der Installer
   * hätte es überschrieben. Die richtige Auskunft ist: es ist da, und der Start
   * scheitert aus diesem Grund.
   */
  return {
    name,
    titel: mitgabe.titel,
    da: true,
    fassung:
      lauf.code === 0 && text !== ''
        ? text
        : `gefunden, aber nicht ausführbar: ${text === '' ? `exit ${String(lauf.code)}` : text}`,
    pfad,
    wege,
  }
}

/**
 * Prüft alle Mitgaben.
 *
 * @param {Umgebung} [umgebung] - die Außenwelt
 * @returns {Promise<readonly Befund[]>} ein Befund je Mitgabe, in Anzeigereihenfolge
 */
export async function pruefeAlle(umgebung = WIRKLICH) {
  const aus = []
  for (const name of MITGABEN_NAMEN) aus.push(await pruefe(name, umgebung))
  return aus
}

/**
 * Wählt die Rezepte, deren Werkzeug auf dieser Maschine vorhanden ist.
 *
 * **Warum das vor dem Start geschieht.** Ein Rezept mit fehlendem `winget` würde
 * mit „command not found" scheitern und wie ein Fehler des Installers aussehen.
 * Hier ist es eine Auskunft: „kein Weg auf dieser Maschine".
 *
 * @param {Mitgabe} mitgabe - die Mitgabe
 * @param {string} plattform - `process.platform`
 * @param {(programm: string) => string | null} welche - die Auflösung
 * @returns {{ passend: readonly Rezept[], fehlendeWerkzeuge: readonly string[] }} was übrig bleibt
 */
export function waehleWege(mitgabe, plattform, welche) {
  const passend = []
  const fehlendeWerkzeuge = []
  for (const rezept of rezepteFuer(mitgabe, plattform)) {
    const werkzeug = rezept.werkzeug
    if (werkzeug === undefined || welche(werkzeug) !== null) passend.push(rezept)
    else if (!fehlendeWerkzeuge.includes(werkzeug)) fehlendeWerkzeuge.push(werkzeug)
  }
  return { passend, fehlendeWerkzeuge }
}

/**
 * Installiert eine Mitgabe über den ersten gangbaren Weg.
 *
 * **Kein stiller Erfolg.** Zurück kommt, welcher Befehl lief und was er sagte;
 * die Nachprüfung entscheidet, ob es geklappt hat — nicht der Exit-Code allein
 * (ein Paketmanager kann 0 melden und das Programm trotzdem nicht in den PATH
 * legen).
 *
 * @param {'graphify' | 'obsidian'} name - welche Mitgabe
 * @param {Umgebung} [umgebung] - die Außenwelt
 * @returns {Promise<{ ok: boolean, weg: string, text: string, danach: Befund }>} das Ergebnis
 */
export async function installiere(name, umgebung = WIRKLICH) {
  const mitgabe = MITGABEN[name]
  const { passend, fehlendeWerkzeuge } = waehleWege(mitgabe, umgebung.plattform, umgebung.welche)
  if (passend.length === 0) {
    const fehlt = fehlendeWerkzeuge.length > 0 ? fehlendeWerkzeuge.join(', ') : 'kein Paketmanager'
    return {
      ok: false,
      weg: '—',
      text: `Auf dieser Maschine gibt es keinen Weg (${fehlt}).`,
      danach: await pruefe(name, umgebung),
    }
  }
  const rezept = passend[0]
  if (rezept === undefined) throw new Error('unreachable')
  const texte = []
  if (rezept.vorher !== undefined) {
    const vor = await umgebung.laufe(rezept.befehl, rezept.vorher)
    texte.push(`${rezept.vorherText ?? 'Vorbereitung'}: exit ${String(vor.code)}`)
    if (vor.code !== 0) {
      return {
        ok: false,
        weg: `${rezept.befehl} ${rezept.vorher.join(' ')}`,
        text: [...texte, vor.text].join('\n'),
        danach: await pruefe(name, umgebung),
      }
    }
  }
  const lauf = await umgebung.laufe(rezept.befehl, rezept.args)
  texte.push(`exit ${String(lauf.code)}`)
  if (lauf.text !== '') texte.push(lauf.text)
  const danach = await pruefe(name, umgebung)
  return {
    ok: danach.da,
    weg: `${rezept.befehl} ${rezept.args.join(' ')}`,
    text: texte.join('\n'),
    danach,
  }
}

/**
 * Darf diese Mitgabe ohne eigenen Schalter installiert werden?
 *
 * @param {'graphify' | 'obsidian'} name - welche Mitgabe
 * @param {{ mitGraphen: boolean, mitObsidian: boolean, ohneMitgaben: boolean }} wahl - die Schalter
 * @returns {boolean} ob sie installiert wird
 */
export function wirdInstalliert(name, wahl) {
  if (wahl.ohneMitgaben) return false
  if (name === 'obsidian') return wahl.mitObsidian
  return wahl.mitGraphen
}

/**
 * Die Zeilen, die der Installer für eine Mitgabe ausgibt.
 *
 * @param {Befund} befund - der Befund
 * @param {{ installiert: boolean }} lage - ob gerade installiert wurde
 * @returns {readonly string[]} die Zeilen, ohne Zeilenumbruch am Ende
 */
export function zeilen(befund, lage) {
  const kopf = lage.installiert ? 'installiert' : befund.da ? 'da' : 'FEHLT'
  const zeilen = [`  ${befund.titel.padEnd(9)} ${kopf.padEnd(12)} ${befund.fassung}`]
  if (!befund.da) {
    for (const weg of befund.wege) zeilen.push(`  ${' '.repeat(9)} → ${weg.trim()}`)
  }
  return zeilen
}
