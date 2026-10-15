/**
 * `@prometheus-harness/local` — Gewichte für ein **lokales** Modell.
 *
 * ## Was ein lokales Modell von einem Dienst unterscheidet
 *
 * Ein Dienst antwortet auf einen Aufruf; ein lokales Modell braucht **Gewichte** — eine Datei von
 * mehreren hundert Megabyte bis mehreren Gigabyte, die **richtig** sein muß. Ein abgebrochener
 * Herunterladen ergibt eine Datei, die **da** ist und **trotzdem** nicht lädt. Und ein Modell, das
 * aus falschen Gewichten stammt, antwortet — nur mit Unsinn.
 *
 * Deshalb ist die Reihenfolge hier bindend: **holen, prüfen, ablegen.** Und nie umgekehrt.
 *
 * ## Der Satz, der dieses Paket prägt
 *
 * **Ein Modell ohne bekannte Prüfsumme gilt als NICHT geprüft.** Wer keine erwartete Prüfsumme
 * kennt, kann nicht feststellen, ob die Datei die richtige ist — er kann nur feststellen, daß sie
 * vollständig aussieht. „Vollständig aussehend" ist aber genau der Zustand, den ein abgebrochener
 * Herunterladen erzeugt, wenn die Länge zufällig stimmt. Also: **keine Prüfsumme, kein „heil".**
 *
 * ## Warum die Gewichte NICHT in den Hugging-Face-Zwischenspeicher kommen
 *
 * Sie liegen unter dem **Harness-Home** (`speicherOrt`). Ein fremder Zwischenspeicher gehört einer
 * anderen Anwendung: wer dort aufräumt, löscht unser Modell, ohne es zu wissen. Was wir geholt
 * haben, verwahren wir.
 *
 * ## Was hier NICHT steht
 *
 * **Keine Quelle für Tev.** Der Name des Modells ist bekannt, seine Adresse und seine Prüfsumme
 * sind **nicht gemessen** — und eine erfundene Adresse wäre schlimmer als eine fehlende. Der
 * Bauplan steht in {@link fehlendeAngaben}: er sagt, **was** noch fehlt.
 *
 * @module @prometheus-harness/local
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Die Beschreibung der Gewichte — **alle Angaben sind Pflicht**. */
export interface Gewichte {
  /** Der Name des Modells (`Tev1-4B-experimental`). */
  readonly name: string
  /** Woher die Datei kommt. */
  readonly quelle: string
  /**
   * Die **festgenagelte** Fassung.
   *
   * **Warum festgenagelt und nicht „neueste".** Eine Adresse wie `main` liefert irgendwann etwas
   * anderes — und die Prüfsumme schlüge dann fehl, ohne daß jemand die Ursache sieht. Mit einer
   * festen Revision gilt: entweder die Datei ist die erwartete, oder sie ist es nicht.
   */
  readonly revision: string
  /** Die erwartete Größe in Bytes. */
  readonly groesse: number
  /** Die erwartete Prüfsumme (SHA-256, klein geschrieben, hexadezimal). */
  readonly sha256: string
}

/** Ein unvollständiger Bauplan — für die Frage, was noch fehlt. */
export type Bauplan = Partial<Gewichte>

/** Was eine Prüfung ergeben hat. */
export type Pruefbefund =
  | {
      readonly heil: true
      readonly groesse: number
      readonly sha256: string
    }
  | {
      readonly heil: false
      /** Warum die Datei nicht als Modell gelten darf. */
      readonly grund:
        /** Es gibt die Datei nicht. */
        | 'fehlt'
        /** Die Größe stimmt nicht — ein abgebrochener Herunterladen sieht so aus. */
        | 'falsche-groesse'
        /** Die Prüfsumme stimmt nicht — **der Inhalt ist ein anderer**. */
        | 'falsche-pruefsumme'
        /** Der Bauplan nennt keine Prüfsumme — dann ist nichts zu prüfen. */
        | 'keine-pruefsumme'
      /** Was gemessen wurde, soweit meßbar. */
      readonly gemessen?: { readonly groesse: number; readonly sha256: string }
      /** Was erwartet war. */
      readonly erwartet?: { readonly groesse: number; readonly sha256: string }
      /** Was zu tun ist, in Worten. */
      readonly wegen: string
    }

/**
 * Was in einem Bauplan noch fehlt.
 *
 * **Warum das eine eigene Funktion ist.** Ein unvollständiger Bauplan darf **nicht** so aussehen
 * wie ein vollständiger — sonst würde eine fehlende Prüfsumme erst beim Prüfen auffallen, nachdem
 * jemand Gigabyte geholt hat.
 *
 * @param bauplan - der Bauplan
 * @returns die fehlenden Angaben in fester Reihenfolge; leer heißt vollständig
 */
export function fehlendeAngaben(bauplan: Bauplan): readonly string[] {
  const fehlt: string[] = []
  if (bauplan.name === undefined || bauplan.name.trim() === '') fehlt.push('name')
  if (bauplan.quelle === undefined || bauplan.quelle.trim() === '') fehlt.push('quelle')
  if (bauplan.revision === undefined || bauplan.revision.trim() === '') fehlt.push('revision')
  if (bauplan.groesse === undefined || !Number.isInteger(bauplan.groesse) || bauplan.groesse <= 0) {
    fehlt.push('groesse')
  }
  if (bauplan.sha256 === undefined || !/^[0-9a-f]{64}$/u.test(bauplan.sha256)) {
    // Klein geschrieben, 64 Zeichen, hexadezimal. Ein „ungefährer" Wert ist kein Wert.
    fehlt.push('sha256')
  }
  return fehlt
}

/**
 * Wo die Gewichte liegen.
 *
 * @param home - das Harness-Home
 * @param gewichte - die Beschreibung
 * @returns der Pfad
 */
export function speicherOrt(home: string, gewichte: Gewichte): string {
  return join(home, 'modelle', gewichte.name, gewichte.revision, 'gewichte.bin')
}

/**
 * Rechnet die Prüfsumme und die Größe einer Datei aus — **im Strom**.
 *
 * **Warum im Strom und nicht auf einmal.** Ein Modell hat Gigabyte. Es ganz in den Speicher zu
 * lesen, um es zu prüfen, würde den Rechner an die Grenze bringen — für eine Prüfung, die ihn
 * nicht braucht.
 *
 * @param pfad - der Pfad
 * @returns Prüfsumme und Größe
 * @throws Error - wenn die Datei nicht lesbar ist
 */
export async function pruefsumme(pfad: string): Promise<{ sha256: string; groesse: number }> {
  const hash = createHash('sha256')
  let groesse = 0
  const strom = createReadStream(pfad)
  for await (const stueck of strom) {
    const puffer = stueck as Buffer
    hash.update(puffer)
    groesse += puffer.length
  }
  return { sha256: hash.digest('hex'), groesse }
}

/**
 * Prüft eine Datei gegen die Beschreibung.
 *
 * Die Reihenfolge ist Absicht: **erst die Größe, dann die Prüfsumme.** Die Größe kostet einen
 * Blick, die Prüfsumme liest die ganze Datei. Bei einem abgebrochenen Herunterladen — dem
 * häufigsten Fall — spart das Minuten.
 *
 * @param pfad - der Pfad
 * @param gewichte - die Beschreibung
 * @returns der Befund
 */
export async function pruefeDatei(pfad: string, gewichte: Gewichte): Promise<Pruefbefund> {
  if (fehlendeAngaben(gewichte).length > 0) {
    return {
      heil: false,
      grund: 'keine-pruefsumme',
      wegen:
        `Der Bauplan ist unvollständig (${fehlendeAngaben(gewichte).join(', ')}) — es ist nichts zu prüfen. ` +
        'Eine Datei ohne bekannte Prüfsumme gilt NICHT als heil.',
    }
  }

  let groesse: number
  try {
    groesse = (await stat(pfad)).size
  } catch {
    return { heil: false, grund: 'fehlt', wegen: `Es gibt keine Datei unter „${pfad}".` }
  }

  if (groesse !== gewichte.groesse) {
    return {
      heil: false,
      grund: 'falsche-groesse',
      gemessen: { groesse, sha256: '' },
      erwartet: { groesse: gewichte.groesse, sha256: gewichte.sha256 },
      wegen:
        `Die Größe stimmt nicht: ${String(groesse)} statt ${String(gewichte.groesse)} Bytes. ` +
        'So sieht ein abgebrochener Herunterladen aus.',
    }
  }

  const gemessen = await pruefsumme(pfad)
  if (gemessen.sha256 !== gewichte.sha256) {
    return {
      heil: false,
      grund: 'falsche-pruefsumme',
      gemessen,
      erwartet: { groesse: gewichte.groesse, sha256: gewichte.sha256 },
      wegen:
        `Die Prüfsumme stimmt nicht: ${gemessen.sha256.slice(0, 16)}… statt ${gewichte.sha256.slice(0, 16)}…. ` +
        'Die Größe allein beweist nichts — der INHALT ist ein anderer.',
    }
  }

  return { heil: true, groesse: gemessen.groesse, sha256: gemessen.sha256 }
}

/** Ein austauschbarer Netzzugriff — wie in `@prometheus-harness/provider-directory`. */
export type Abruf = (adresse: string, einstellung: RequestInit) => Promise<Response>

/** Was das Holen braucht. */
export interface HolOptionen {
  /** Wohin die Gewichte sollen. */
  readonly ziel: string
  /** Der Netzzugriff. Vorgabe: das eingebaute `fetch`. */
  readonly abruf?: Abruf
  /** Die Frist in Millisekunden. Vorgabe: 30 Minuten — Modelle sind groß. */
  readonly fristMs?: number
}

/** Dreißig Minuten — ein Modell von mehreren Gigabyte braucht Zeit. */
const FRIST_MS = 30 * 60 * 1000

/**
 * Holt die Gewichte, prüft sie und legt sie **unteilbar** ab.
 *
 * ## Warum unteilbar
 *
 * Wird die Datei direkt an ihren Platz geschrieben und bricht ab, steht dort eine **halbe** Datei —
 * und die sieht aus wie eine fertige. Beim nächsten Start würde sie geladen, und das Modell
 * antwortete mit Unsinn. Deshalb: erst daneben schreiben, **dann prüfen**, **dann** umbenennen.
 *
 * **Und geprüft wird VOR dem Umbenennen.** Wäre es danach, stünde die falsche Datei schon an ihrem
 * Platz, und ein Absturz dazwischen hinterließe sie dort.
 *
 * @param gewichte - die Beschreibung
 * @param optionen - Ziel, Netzzugriff, Frist
 * @returns der Befund
 */
export async function holeUndLegeAb(gewichte: Gewichte, optionen: HolOptionen): Promise<Pruefbefund> {
  const fehlt = fehlendeAngaben(gewichte)
  if (fehlt.length > 0) {
    return {
      heil: false,
      grund: 'keine-pruefsumme',
      wegen: `Der Bauplan ist unvollständig (${fehlt.join(', ')}) — es wird NICHTS geholt.`,
    }
  }

  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const fristMs = optionen.fristMs ?? FRIST_MS
  const neben = `${optionen.ziel}.${String(process.pid)}.teil`
  await mkdir(dirname(optionen.ziel), { recursive: true })

  try {
    // **Mit Frist.** Ohne sie kann ein Abruf endlos hängen — und ein hängender Abruf sieht wie ein
    // laufender aus. Gemessen am 15.10.2026: ein Lauf hing 600 Sekunden in einer offenen
    // Verbindung, ohne daß irgendwo ein Fehler stand.
    const antwort = await abruf(gewichte.quelle, { signal: AbortSignal.timeout(fristMs) })
    if (!antwort.ok) {
      return {
        heil: false,
        grund: 'fehlt',
        wegen: `Die Quelle antwortete mit Status ${String(antwort.status)} — es wurde nichts abgelegt.`,
      }
    }
    const puffer = new Uint8Array(await antwort.arrayBuffer())
    await writeFile(neben, puffer)
  } catch (fehler) {
    await rm(neben, { force: true }).catch(() => undefined)
    const grund = fehler instanceof Error ? fehler.message : String(fehler)
    return { heil: false, grund: 'fehlt', wegen: `Der Abruf scheiterte: ${grund}` }
  }

  const befund = await pruefeDatei(neben, gewichte)
  if (!befund.heil) {
    // **Die Nachbardatei wird entfernt.** Sie liegen zu lassen hieße: beim nächsten Lauf sieht es
    // aus, als wäre schon etwas da.
    await rm(neben, { force: true }).catch(() => undefined)
    return befund
  }

  await rename(neben, optionen.ziel)
  return befund
}
