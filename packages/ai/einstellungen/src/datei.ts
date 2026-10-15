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
 * @module @prometheus-harness/einstellungen/datei
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  VORGABE,
  leseEinstellungen,
  schreibeEinstellungen,
  type Einstellungen,
} from './einstellungen.ts'

/** Der Name der Datei im Harness-Home. */
export const DATEINAME = 'einstellungen.json'

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
