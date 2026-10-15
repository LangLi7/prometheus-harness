/**
 * Werkszeug: **Begriffe im Sprachpaket vereinheitlichen — mit Tabelle, nicht mit Suchen/Ersetzen.**
 *
 * ## Warum es das gibt
 *
 * Neun Übersetzer haben neunmal dieselbe Frage **gegensätzlich** beantwortet: heißt es
 * „Session" oder „Sitzung", „Workspace" oder „Arbeitsbereich"? Gemessen im vereinigten Paket:
 *
 * * dieselbe Sache in zwei Wörtern — `sidebarTerminal · description` sagt
 *   „Befehle im **Workspace** der **Sitzung** ausführen",
 * * und die Wortfamilie gemischt — `chat · stats.dialog.title` „Session-Statistik", daneben
 *   `sidebarFiles · guide.description` „…dieser **Sitzung**…".
 *
 * Ein Suchen-Ersetzen-Lauf über „Session" → „Sitzung" wäre **falsch**: er würde
 * `pnpm-workspace.yaml` (ein Dateiname!) zerstören und „Session-Hierarchie" zu
 * „Sitzung-Hierarchie" machen statt zu „Sitzungshierarchie".
 *
 * Deshalb steht hier eine **Tabelle**: je Stelle der **ganze** alte und der **ganze** neue
 * Wert. Findet das Werkszeug einen alten Wert **nicht** genau so vor, bricht es ab, statt
 * still nichts zu tun — ein Ersetzungslauf, der nichts trifft, sieht sonst aus wie Erfolg.
 *
 * ```powershell
 * bun scripts/language-terms.mjs                  # nur nachsehen
 * bun scripts/language-terms.mjs --anwenden       # auf die Teile schreiben
 * ```
 *
 * Nach dem Anwenden wird **vereinigt** (`language-split.mjs --vereinigen`), damit Teile und
 * Paket nicht auseinanderlaufen.
 *
 * @module scripts/language-terms
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORDNER = 'docs/status/uebersetzung'
const TEILE = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * Die Entscheidung: **deutsch**.
 *
 * Begründung steht in `AUFTRAG.md`: das ausgelieferte Paket sagte schon
 * „Standard-Arbeitsbereich", und die eigenen deutschen Statusberichte sagen 147 × „Sitzung"
 * gegen 37 × „Session". Zusammensetzungen mit **Fugen-s**: „Sitzungs…", „Arbeitsbereichs…".
 *
 * @type {{ns: string, schluessel: string, alt: string, neu: string, grund: string}[]}
 */
export const TABELLE = [
  // ---- conversation ----
  { ns: 'conversation', schluessel: 'placeholder.unavailable', alt: 'Session nicht verfügbar', neu: 'Sitzung nicht verfügbar', grund: 'Session → Sitzung' },
  { ns: 'conversation', schluessel: 'placeholder.parentOffline', alt: 'Übergeordnete Session offline; Senden ist nicht möglich, den Lauf kannst du aber weiterhin stoppen', neu: 'Übergeordnete Sitzung offline; Senden ist nicht möglich, den Lauf kannst du aber weiterhin stoppen', grund: 'Session → Sitzung' },
  { ns: 'conversation', schluessel: 'placeholder.workspace', alt: 'Workspace zum Starten wählen', neu: 'Arbeitsbereich zum Starten wählen', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'conversation', schluessel: 'file.sessionUnavailable', alt: 'Session nicht verfügbar; Dateien können nicht hochgeladen werden', neu: 'Sitzung nicht verfügbar; Dateien können nicht hochgeladen werden', grund: 'Session → Sitzung' },
  { ns: 'conversation', schluessel: 'hero.chooseWorkspace', alt: 'Workspace wählen', neu: 'Arbeitsbereich wählen', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'conversation', schluessel: 'session.hierarchy', alt: 'Session-Hierarchie', neu: 'Sitzungshierarchie', grund: 'Fugen-s statt Bindestrich' },
  { ns: 'conversation', schluessel: 'detail.schedule.overdue', alt: 'Überfällig, wartet auf Fortsetzung der Session', neu: 'Überfällig, wartet auf Fortsetzung der Sitzung', grund: 'Session → Sitzung' },
  { ns: 'conversation', schluessel: 'tool.title.traceSession', alt: 'Session verfolgen', neu: 'Sitzung verfolgen', grund: 'Session → Sitzung' },
  { ns: 'conversation', schluessel: 'error.sessionInUse', alt: 'Diese Session wird bereits verwendet, möglicherweise von einer anderen laufenden DSH-Instanz (etwa dsh web oder die Desktop-App). Beende andere laufende DSH-Instanzen und versuche es erneut.', neu: 'Diese Sitzung wird bereits verwendet, möglicherweise von einer anderen laufenden DSH-Instanz (etwa dsh web oder die Desktop-App). Beende andere laufende DSH-Instanzen und versuche es erneut.', grund: 'Session → Sitzung' },
  // ---- trajectory ----
  { ns: 'trajectory', schluessel: 'timing.sessionTimestamps', alt: 'Session-Zeitstempel', neu: 'Sitzungszeitstempel', grund: 'Fugen-s statt Bindestrich' },
  { ns: 'trajectory', schluessel: 'timing.sessionTimestampsRunning', alt: 'Session-Zeitstempel (läuft)', neu: 'Sitzungszeitstempel (läuft)', grund: 'Fugen-s statt Bindestrich' },
  { ns: 'trajectory', schluessel: 'usage.sessionCumulative', alt: 'Session kumulativ', neu: 'Kumulativ je Sitzung', grund: '„Session kumulativ" ist kein Deutsch' },
  // ---- chat ----
  { ns: 'chat', schluessel: 'stats.dialog.title', alt: 'Session-Statistik', neu: 'Sitzungsstatistik', grund: 'Fugen-s statt Bindestrich' },
  { ns: 'chat', schluessel: 'message.contextRecall', alt: 'Session-Erinnerung', neu: 'Erinnerung aus der Sitzung', grund: 'Bindestrich-Wortfamilie ist unklar' },
  { ns: 'chat', schluessel: 'message.referenceSummary', alt: 'Referenzierte Session · {labels}', neu: 'Referenzierte Sitzung · {labels}', grund: 'Session → Sitzung' },
  { ns: 'chat', schluessel: 'message.context.relay.from', alt: 'Aus Session {session}', neu: 'Aus Sitzung {session}', grund: 'Session → Sitzung' },
  // ---- settings / sidebars / Berechtigungen ----
  { ns: 'settings', schluessel: 'desktop.update.tasksUnavailable', alt: 'Der Aufgabenstatus ist nicht verfügbar. Erneut aktualisieren, wenn der Workspace bereit ist.', neu: 'Der Aufgabenstatus ist nicht verfügbar. Erneut aktualisieren, wenn der Arbeitsbereich bereit ist.', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'sidebarTerminal', schluessel: 'description', alt: 'Befehle im Workspace der Sitzung ausführen', neu: 'Befehle im Arbeitsbereich der Sitzung ausführen', grund: 'zwei Wörter für eine Sache' },
  { ns: 'permission.access', schluessel: 'preset.workspaceWrite', alt: 'Schreiben im Workspace', neu: 'Schreiben im Arbeitsbereich', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'settings.permission', schluessel: 'preset.workspaceWrite', alt: 'Schreiben im Workspace', neu: 'Schreiben im Arbeitsbereich', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'sidebarFiles', schluessel: 'guide.title', alt: 'Workspace-Dateien', neu: 'Dateien im Arbeitsbereich', grund: 'deutsche Wortstellung statt Bindestrich' },
  { ns: 'sidebarFiles', schluessel: 'guide.description', alt: "Dateien im Workspace dieser Sitzung durchsuchen", neu: 'Dateien im Arbeitsbereich dieser Sitzung durchsuchen', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'sidebarFiles', schluessel: 'noWorkspace', alt: 'Diese Sitzung hat kein Workspace-Verzeichnis.', neu: 'Diese Sitzung hat keinen Arbeitsbereich.', grund: 'deutsche Wortstellung statt Bindestrich' },
  { ns: 'sidebarFiles', schluessel: 'error.outsideWorkspace', alt: 'Dieses Verzeichnis liegt außerhalb des Workspace, deshalb liest die Seitenleiste es nicht.', neu: 'Dieses Verzeichnis liegt außerhalb des Arbeitsbereichs, deshalb liest die Seitenleiste es nicht.', grund: 'Genitiv' },
  { ns: 'open-in-app', schluessel: 'shortcut.busy', alt: 'Workspace wird geöffnet', neu: 'Arbeitsbereich wird geöffnet', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'open-in-app', schluessel: 'shortcut.unavailable', alt: 'Aktueller Workspace oder lokale Anwendung nicht verfügbar', neu: 'Aktueller Arbeitsbereich oder lokale Anwendung nicht verfügbar', grund: 'Workspace → Arbeitsbereich' },
  { ns: 'directory-browser', schluessel: 'browser.title', alt: 'Workspace-Verzeichnis auswählen', neu: 'Arbeitsbereich auswählen', grund: 'deutsche Wortstellung statt Bindestrich' },
  { ns: 'reference', schluessel: 'crumb.root', alt: 'Workspace', neu: 'Arbeitsbereich', grund: 'Workspace → Arbeitsbereich' },
]

/**
 * Wendet die Tabelle auf ein Paket an — **und bricht ab**, wenn ein alter Wert nicht genau
 * so dasteht.
 *
 * @param {Record<string, Record<string, string>>} paket
 * @param {readonly {ns: string, schluessel: string, alt: string, neu: string, grund: string}[]} tabelle
 * @returns {{angewendet: number, fehlschlag: string[]}}
 */
export function wendeAn(paket, tabelle) {
  let angewendet = 0
  const fehlschlag = []
  for (const e of tabelle) {
    const fach = paket[e.ns]
    if (fach === undefined) {
      fehlschlag.push(`${e.ns}: Namensraum fehlt`)
      continue
    }
    const ist = fach[e.schluessel]
    if (ist === undefined) {
      fehlschlag.push(`${e.ns} · ${e.schluessel}: Schlüssel fehlt`)
      continue
    }
    if (ist === e.neu) continue // schon erledigt — kein Fehler
    if (ist !== e.alt) {
      fehlschlag.push(`${e.ns} · ${e.schluessel}: steht nicht so da.\n        erwartet: ${JSON.stringify(e.alt)}\n        gefunden: ${JSON.stringify(ist)}`)
      continue
    }
    fach[e.schluessel] = e.neu
    angewendet += 1
  }
  return { angewendet, fehlschlag }
}

function haupt() {
  const anwenden = process.argv.includes('--anwenden')
  const gesamt = { angewendet: 0, fehlschlag: [] }
  /** Welche Tabellenzeilen hat überhaupt ein Teil gesehen? */
  const gesehen = new Set()
  const schluesselVon = (e) => `${e.ns} · ${e.schluessel}`

  for (const n of TEILE) {
    const pfad = join(ORDNER, `teil-${String(n)}.json`)
    if (!existsSync(pfad)) continue
    const paket = JSON.parse(readFileSync(pfad, 'utf8'))
    // **Nur die Zeilen, deren Namensraum in diesem Teil liegt.** Der erste Entwurf warf die
    // ganze Tabelle auf jeden Teil und meldete für die anderen 224 × „Namensraum fehlt" —
    // das ist keine Feststellung über das Paket, sondern über den Aufruf.
    const teilTabelle = TABELLE.filter((e) => paket[e.ns] !== undefined)
    for (const e of teilTabelle) gesehen.add(schluesselVon(e))
    const { angewendet, fehlschlag } = wendeAn(paket, teilTabelle)
    gesamt.angewendet += angewendet
    gesamt.fehlschlag.push(...fehlschlag.map((f) => `teil-${String(n)} · ${f}`))
    if (anwenden && angewendet > 0 && fehlschlag.length === 0) {
      writeFileSync(pfad, `${JSON.stringify(paket, null, 2)}\n`, 'utf8')
    }
  }

  // Eine Tabellenzeile, die **kein** Teil kennt, ist ein toter Eintrag: sie behauptet eine
  // Stelle, die es nicht gibt. Das ist ein Fehler in der Tabelle, nicht im Paket.
  const tot = TABELLE.filter((e) => !gesehen.has(schluesselVon(e)))

  console.log(`== Tabelle: ${String(TABELLE.length)} Stellen`)
  console.log(`== angewendet: ${String(gesamt.angewendet)}${anwenden ? ' (geschrieben)' : ' (nur nachgesehen — nichts geschrieben)'}`)
  console.log(`== nicht getroffen: ${String(gesamt.fehlschlag.length)}`)
  for (const f of gesamt.fehlschlag) console.log(`   ${f}`)
  if (tot.length > 0) {
    console.log(`== tote Tabellenzeilen (kein Teil führt den Namensraum): ${String(tot.length)}`)
    for (const e of tot) console.log(`   ${schluesselVon(e)}`)
  }
  console.log('')

  if (gesamt.fehlschlag.length > 0 || tot.length > 0) {
    console.log('BEFUND: Mindestens eine Stelle steht nicht so da, wie die Tabelle sie nennt')
    console.log('(oder die Tabelle nennt eine Stelle, die es nicht gibt).')
    console.log('Es wird NICHTS geschrieben — die Tabelle wird berichtigt, nicht das Paket.')
    process.exit(1)
  }
  if (gesamt.angewendet === 0) {
    console.log('BEFUND: Keine Stelle mehr offen — das Paket ist bereits einheitlich.')
    process.exit(0)
  }
  console.log(
    anwenden
      ? `BEFUND: ${String(gesamt.angewendet)} Stellen vereinheitlicht. Jetzt vereinigen: bun scripts/language-split.mjs --vereinigen`
      : `BEFUND: ${String(gesamt.angewendet)} Stellen zu ändern. Mit --anwenden schreiben.`,
  )
  process.exit(0)
}

if (import.meta.main === true) haupt()
