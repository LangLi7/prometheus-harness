/**
 * Der Dateizugriff für die Einstellungen.
 *
 * ## Warum geschrieben wird, indem umbenannt wird
 *
 * Ein Schreibvorgang kann **mittendrin** enden: Strom weg, Absturz, Platte voll. Dann steht eine
 * **halbe** Datei da. Und eine halbe Datei ist der schlimmste Zustand von allen:
 *
 * | Zustand | Folge |
 * |---|---|
 * | Datei **fehlt** | Vorgabe greift — der ehrliche Normalzustand |
 * | Datei ist **heil** | sie wird gelesen |
 * | Datei ist **halb** | sie ist da, aber unlesbar — die Vorgabe greift **nicht**, und die Wahl des Nutzers ist weg |
 *
 * Deshalb: erst in eine **Nachbardatei** schreiben, dann **umbenennen**. Ein Umbenennen ist auf
 * demselben Datenträger unteilbar — entweder die alte oder die neue Datei, nie eine halbe. Die
 * Nachbardatei liegt in **demselben** Verzeichnis, weil ein Umbenennen über Datenträgergrenzen
 * hinweg nicht unteilbar ist.
 *
 * @module @prometheus-harness/settings/datei
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  VORGABE,
  leseEinstellungen,
  schreibeEinstellungen,
  type Einstellungen,
} from './settings.ts'

/** Der Name der Datei im Harness-Home. */
export const DATEINAME = 'einstellungen.json'

/** Der Name **unseres** Zuhauses. */
export const EIGENES_HAUS = '.pmh'

/**
 * Der Name des Zuhauses von DSH — **dort schreiben wir NIE**.
 *
 * ## Der Fehler, der diesen Riegel erzwungen hat (15.10.2026)
 *
 * Ich habe die Einstellungen mit `resolvePmhHome()` aus `@prometheus-harness/home-paths` aufgelöst
 * und geschrieben. Dort gilt die Kette `PMH_HOME → DSH_HOME → ~/.pmh`. In dieser Umgebung ist
 * **`DSH_HOME` gesetzt** (`C:\Users\Chang\.dsh`) und `PMH_HOME` leer — die Datei landete also im
 * **Zuhause von DSH**. Das ist ein Ort, den wir **niemals** verändern.
 *
 * Der Resolver hat also genau das getan, wofür er gebaut ist. **Der Fehler war, ihn für unseren
 * Zustand zu benutzen:** ein Zuhause, das auf das eines **fremden** Programms zurückfallen kann,
 * ist für unsere Dateien die falsche Auflösung.
 *
 * Die Datei wurde entfernt (nachweislich meine: Inhalt und Zeitstempel geprüft) — und jetzt steht
 * hier ein **Riegel**, nicht nur eine Notiz. Eine Regel, die nur in einer Notiz steht, ist nicht
 * entschärft.
 */
export const FREMDES_HAUS = '.dsh'

/**
 * Liegt dieser Pfad im Zuhause eines **fremden** Programms?
 *
 * @param pfad - der zu prüfende Pfad
 * @returns ob dort NICHT geschrieben werden darf
 */
export function istFremdesZuhause(pfad: string): boolean {
  return pfad.split(/[\\/]+/u).includes(FREMDES_HAUS)
}

/**
 * **Unser** Zuhause.
 *
 * **Warum hier NICHT `resolvePmhHome()` steht.** Jene Auflösung fällt auf `DSH_HOME` zurück — und
 * damit in ein fremdes Haus (siehe {@link FREMDES_HAUS}). Hier gilt nur: `PMH_HOME`, sonst `~/.pmh`.
 *
 * @param umgebung - die Umgebung; nur für die Prüfung austauschbar
 * @returns der Pfad
 */
export function eigenesZuhause(umgebung: Readonly<Record<string, string | undefined>> = process.env): string {
  const gesetzt = umgebung['PMH_HOME']
  if (gesetzt !== undefined && gesetzt.trim() !== '') return gesetzt.trim()
  return join(homedir(), EIGENES_HAUS)
}

/**
 * Wo **unsere** Einstellungen liegen — im **eigenen** Zuhause.
 *
 * @param umgebung - die Umgebung; nur für die Prüfung austauschbar
 * @returns der Pfad
 */
export function unserPfad(umgebung: Readonly<Record<string, string | undefined>> = process.env): string {
  return pfadDerEinstellungen(eigenesZuhause(umgebung))
}

/**
 * Wo die Einstellungen liegen.
 *
 * @param home - das Harness-Home
 * @returns der Pfad
 */
export function pfadDerEinstellungen(home: string): string {
  return join(home, DATEINAME)
}

/**
 * Lädt die Einstellungen.
 *
 * **Eine fehlende Datei ist kein Fehler** — sie ist der Zustand vor der ersten Einrichtung.
 * Alles andere ist einer: eine unlesbare, eine halbe, eine mit unbekannter Fassung.
 *
 * @param pfad - der Pfad
 * @returns die Einstellungen; {@link VORGABE}, wenn es die Datei nicht gibt
 * @throws EinstellungenFehler - wenn die Datei da, aber unbrauchbar ist
 */
export async function ladeEinstellungen(pfad: string): Promise<Einstellungen> {
  let text: string
  try {
    text = await readFile(pfad, 'utf8')
  } catch (fehler) {
    const code = (fehler as { code?: string }).code
    if (code === 'ENOENT') return VORGABE
    // **Kein stiller Rückfall auf die Vorgabe.** Wer eine Datei hat und sie nicht lesen kann
    // (Rechte, kaputtes Laufwerk), darf nicht glauben, er habe nichts eingestellt.
    throw new Error(
      `Die Einstellungen unter „${pfad}" ließen sich nicht lesen (${code ?? 'unbekannt'}). ` +
        'Es wird NICHT auf die Vorgabe zurückgefallen — sonst verschwände die Wahl lautlos.',
    )
  }
  return leseEinstellungen(text)
}

/**
 * Schreibt die Einstellungen — unteilbar über eine Nachbardatei.
 *
 * @param pfad - der Pfad
 * @param einstellungen - die Einstellungen
 * @throws Error - wenn das Verzeichnis nicht angelegt oder nicht geschrieben werden kann
 */
export async function sichereEinstellungen(pfad: string, einstellungen: Einstellungen): Promise<void> {
  // **Der Riegel.** Geschrieben wird nur in unser eigenes Haus. Am 15.10.2026 lag die Datei dort
  // nicht — sie lag in `~/.dsh`, weil die Auflösung auf `DSH_HOME` zurückfiel. Eine Notiz hätte
  // das nicht verhindert; diese Zeile tut es.
  if (istFremdesZuhause(pfad)) {
    throw new Error(
      `Die Einstellungen sollen nach „${pfad}" — das liegt im Zuhause eines FREMDEN Programms ` +
        `(„${FREMDES_HAUS}"). Dort wird nicht geschrieben. Unser Zuhause ist „${EIGENES_HAUS}" ` +
        '(siehe eigenesZuhause()).',
    )
  }
  const text = schreibeEinstellungen(einstellungen)
  const verzeichnis = dirname(pfad)
  await mkdir(verzeichnis, { recursive: true })
  // **Im selben Verzeichnis** — über Datenträgergrenzen hinweg wäre das Umbenennen nicht unteilbar.
  const neben = `${pfad}.${String(process.pid)}.neu`
  try {
    await writeFile(neben, text, { encoding: 'utf8' })
    await rename(neben, pfad)
  } catch (fehler) {
    // Die Nachbardatei nicht liegen lassen: sie sähe wie eine Einstellungsdatei aus und wäre keine.
    await rm(neben, { force: true }).catch(() => undefined)
    throw fehler
  }
}
