/**
 * Die **Agent-Werkzeuge** — dieselben fünf Fähigkeiten, aber für das Modell statt für HTTP.
 *
 * ## Warum Werkzeuge und Endpunkte dasselbe können müssen
 *
 * Ein Endpunkt ist für die Oberfläche und für andere Dienste; ein Werkzeug ist für **mich**, das
 * Modell im Gespräch. Beides über dieselbe Kette zu führen heißt: eine Einstellung, ein Schlüssel,
 * ein Verhalten. Zwei Wege mit zwei Wahrheiten wären der Fehler, den dieses Projekt an anderer
 * Stelle schon einmal hatte.
 *
 * ## Warum ein Werkzeug eine DATEI schreibt und keinen Base64-Blob zurückgibt
 *
 * Ein Modell kann ein Bild nicht ansehen, und ein Gespräch kann keine 700 KB Base64 tragen. Was es
 * kann: einen Pfad nennen, den der Mensch (und der nächste Schritt) benutzen kann. Also schreibt
 * das Werkzeug die Bytes und **sagt, wo sie liegen**.
 *
 * ## Die Pfadregel
 *
 * Geschrieben wird nur **unterhalb** des Arbeitsverzeichnisses. Ein Werkzeug, das auf `C:\Windows`
 * schreiben darf, weil ein Modell es darum bittet, ist kein Werkzeug, sondern ein offenes Fenster.
 *
 * @module @prometheus-harness/ai-capabilities/werkzeuge
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

import type { AgentTool } from '@prometheus-harness/agent-tools'
import type { Schema, ZeichenOptionen } from '@prometheus-harness/capabilities'

import type { Kette } from './kette.ts'
import { alsWav, liesTonformat } from './flaechen.ts'

/** Wie eine Kette hereinkommt — als Funktion, damit jede Ausführung den frischen Stand liest. */
export type Kettequelle = () => Promise<Kette>

/** Die Endung zu einem Inhaltstyp. */
export function endungFuer(typ: string): string {
  if (typ === 'image/png') return 'png'
  if (typ === 'image/jpeg') return 'jpg'
  if (typ === 'image/gif') return 'gif'
  if (typ === 'image/webp') return 'webp'
  if (typ === 'audio/wav') return 'wav'
  return 'bin'
}

/**
 * Löst einen Zielpfad auf und hält ihn unterhalb des Arbeitsverzeichnisses.
 *
 * @param roh - der gewünschte Pfad, oder `undefined` für einen Vorschlag
 * @param vorschlag - der Dateiname, wenn keiner gewünscht wurde
 * @returns der absolute Pfad
 * @throws Error wenn der Pfad aus dem Arbeitsverzeichnis herausführt
 */
export function zielPfad(roh: unknown, vorschlag: string): string {
  const wurzel = resolve(process.cwd())
  const name = typeof roh === 'string' && roh.trim() !== '' ? roh.trim() : vorschlag
  const ziel = isAbsolute(name) ? resolve(name) : resolve(wurzel, name)
  const abstand = relative(wurzel, ziel)
  if (abstand === '' || abstand.startsWith('..') || isAbsolute(abstand)) {
    throw new Error(
      `Der Pfad „${name}" liegt außerhalb des Arbeitsverzeichnisses (${wurzel}). ` +
        'Ein Werkzeug schreibt nur dorthin — nenne einen relativen Pfad.',
    )
  }
  return ziel
}

/** Ein Zeitstempel, der als Dateiname taugt. */
function stempel(): string {
  return new Date().toISOString().replace(/[:.]/gu, '-')
}

/**
 * Das Werkzeug für Text zu Bild.
 *
 * @param kette - woher die Kette kommt
 * @returns das Werkzeug
 */
export function bildWerkzeug(kette: Kettequelle): AgentTool {
  return {
    name: 'image_generate',
    description:
      'Erzeuge ein Bild aus einer Beschreibung (Text zu Bild) und speichere es als Datei. ' +
      'Gib den Pfad danach an, statt das Bild zu beschreiben — du hast es nicht gesehen. ' +
      'Fuer ein flaechiges, spaeter vektorisierbares Ergebnis: "flat vector style, solid colors, ' +
      'clean outlines, plain background, no gradients, no photorealism".',
    parameters: {
      type: 'object',
      properties: {
        beschreibung: { type: 'string', description: 'Was zu sehen sein soll — Motiv, Stil, Farben, Hintergrund.' },
        pfad: { type: 'string', description: 'Optionaler Zielpfad (relativ zum Arbeitsverzeichnis).' },
        seitenverhaeltnis: {
          type: 'string',
          description: 'Optional: "1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "21:9" … je nach Modell.',
        },
        aufloesung: { type: 'string', description: 'Optional: "512", "1K", "2K", "4K" — nur wo das Modell es kennt.' },
        qualitaet: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'Optional (OpenAI-Modelle).' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'svg'], description: 'Optional das Ausgabeformat.' },
        hintergrund: {
          type: 'string',
          enum: ['auto', 'transparent', 'opaque'],
          description: 'Optional; "transparent" braucht png oder webp.',
        },
        referenzen: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional Referenzbilder (Bild-zu-Bild): Pfade im Arbeitsverzeichnis, http(s)-Adressen oder data:-URLs.',
        },
        anzahl: { type: 'integer', description: 'Optional 1…10; viele Modelle können nur eines.' },
      },
      required: ['beschreibung'],
    },
    execute: async (args) => {
      const beschreibung = args['beschreibung']
      if (typeof beschreibung !== 'string' || beschreibung.trim() === '') {
        throw new Error('image_generate: das Argument "beschreibung" fehlt')
      }
      const gebaut = await kette()
      const anbieter = await gebaut.aufbau.faehigkeiten.waehle('bild')
      if (anbieter.zeichner === undefined) {
        throw new Error(`Der Anbieter „${anbieter.id}" liefert keinen Zeichner.`)
      }
      const optionen = await zeichenoptionen(args)
      const bild = await anbieter.zeichner.zeichne(beschreibung, optionen)
      const ziel = zielPfad(args['pfad'], `bild-${stempel()}.${endungFuer(bild.typ)}`)
      await mkdir(dirname(ziel), { recursive: true })
      await writeFile(ziel, bild.bytes)
      return JSON.stringify(
        {
          pfad: ziel,
          typ: bild.typ,
          bytes: bild.bytes.byteLength,
          ...(bild.kostenUsd === undefined ? {} : { kostenUsd: bild.kostenUsd }),
        },
        null,
        2,
      )
    },
  }
}

/**
 * Baut die Zeichenoptionen aus den Werkzeug-Argumenten.
 *
 * **Warum Referenzen zu `data:`-URLs werden.** Der Vertrag kennt keine Pfade; ein Werkzeug darf
 * eine lokale Datei lesen, aber der Anbieter bekommt nur eine Adresse. `data:` ist die Form, die
 * beide verstehen — und sie funktioniert auch für Dateien, die niemand im Netz sehen soll.
 *
 * @param args - die Argumente des Modells
 * @returns die Optionen (leer, wenn nichts gesetzt ist)
 */
export async function zeichenoptionen(
  args: Readonly<Record<string, unknown>>,
): Promise<ZeichenOptionen> {
  const optionen: {
    -readonly [K in keyof ZeichenOptionen]: ZeichenOptionen[K]
  } = {}
  if (typeof args['seitenverhaeltnis'] === 'string' && args['seitenverhaeltnis'].trim() !== '') {
    optionen.seitenverhaeltnis = args['seitenverhaeltnis'].trim()
  }
  if (typeof args['aufloesung'] === 'string' && args['aufloesung'].trim() !== '') {
    optionen.aufloesung = args['aufloesung'].trim()
  }
  const qualitaet = args['qualitaet']
  if (qualitaet === 'auto' || qualitaet === 'low' || qualitaet === 'medium' || qualitaet === 'high') {
    optionen.qualitaet = qualitaet
  }
  const format = args['format']
  if (format === 'png' || format === 'jpeg' || format === 'webp' || format === 'svg') optionen.format = format
  const hintergrund = args['hintergrund']
  if (hintergrund === 'auto' || hintergrund === 'transparent' || hintergrund === 'opaque') {
    optionen.hintergrund = hintergrund
  }
  const anzahl = args['anzahl']
  if (typeof anzahl === 'number' && Number.isSafeInteger(anzahl) && anzahl >= 1 && anzahl <= 10) {
    optionen.anzahl = anzahl
  }
  const referenzen = args['referenzen']
  if (Array.isArray(referenzen) && referenzen.length > 0) {
    optionen.referenzen = await Promise.all(
      referenzen.map(async (eintrag) => {
        if (typeof eintrag !== 'string' || eintrag.trim() === '') {
          throw new Error('referenzen: jeder Eintrag muß ein Pfad oder eine Adresse sein')
        }
        const wert = eintrag.trim()
        if (/^(https?:\/\/|data:)/u.test(wert)) return wert
        const datei = zielPfad(wert, wert)
        const bytes = await readFile(datei)
        return `data:${bildTyp(datei)};base64,${bytes.toString('base64')}`
      }),
    )
  }
  return optionen
}

/**
 * Der Inhaltstyp zu einer Bilddatei — aus der Endung.
 *
 * @param pfad - der Pfad
 * @returns der Typ
 */
function bildTyp(pfad: string): string {
  const endung = pfad.toLowerCase().split('.').pop() ?? ''
  if (endung === 'jpg' || endung === 'jpeg') return 'image/jpeg'
  if (endung === 'webp') return 'image/webp'
  if (endung === 'gif') return 'image/gif'
  if (endung === 'svg') return 'image/svg+xml'
  return 'image/png'
}

/**
 * Das Werkzeug für Text zu Sprache.
 *
 * @param kette - woher die Kette kommt
 * @returns das Werkzeug
 */
export function sprachWerkzeug(kette: Kettequelle): AgentTool {
  return {
    name: 'speech_speak',
    description:
      'Sprich einen Text als Audiodatei (Text zu Sprache) und speichere sie als WAV. ' +
      'Gib den Pfad an; abspielen kann sie der Mensch.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Was gesprochen werden soll.' },
        stimme: { type: 'string', description: 'Optional die Stimme, z. B. "Kore".' },
        sprache: { type: 'string', description: 'Optional die Sprache, z. B. "de".' },
        pfad: { type: 'string', description: 'Optionaler Zielpfad (relativ zum Arbeitsverzeichnis).' },
      },
      required: ['text'],
    },
    execute: async (args) => {
      const text = args['text']
      if (typeof text !== 'string' || text.trim() === '') {
        throw new Error('speech_speak: das Argument "text" fehlt')
      }
      const gebaut = await kette()
      const sprecher = await gebaut.aufbau.faehigkeiten.sprecher()
      const stimme = args['stimme']
      const sprache = args['sprache']
      const ton = await sprecher.sprich({
        text,
        ...(typeof stimme === 'string' && stimme.trim() !== '' ? { stimme } : {}),
        ...(typeof sprache === 'string' && sprache.trim() !== '' ? { sprache } : {}),
      })
      // **Rohes PCM wird zur WAV-Datei.** Ohne Kopf ist es für keinen Abspieler eine Datei —
      // dieselbe Umrechnung wie auf der HTTP-Fläche, damit beide Wege dasselbe liefern.
      const istPcm = ton.typ.startsWith('audio/pcm')
      const bytes = istPcm ? alsWav(ton.bytes, liesTonformat(ton.typ).rate, liesTonformat(ton.typ).kanaele) : ton.bytes
      const typ = istPcm ? 'audio/wav' : ton.typ
      const ziel = zielPfad(args['pfad'], `sprache-${stempel()}.${endungFuer(typ)}`)
      await mkdir(dirname(ziel), { recursive: true })
      await writeFile(ziel, bytes)
      return JSON.stringify({ pfad: ziel, typ, bytes: bytes.byteLength }, null, 2)
    },
  }
}

/**
 * Das Werkzeug für Sprache zu Text.
 *
 * @param kette - woher die Kette kommt
 * @returns das Werkzeug
 */
export function hoerWerkzeug(kette: Kettequelle): AgentTool {
  return {
    name: 'speech_transcribe',
    description: 'Transkribiere eine lokale Audiodatei (Sprache zu Text). Gib den erkannten Text zurück.',
    parameters: {
      type: 'object',
      properties: {
        pfad: { type: 'string', description: 'Pfad zur Audiodatei, relativ zum Arbeitsverzeichnis.' },
        sprache: { type: 'string', description: 'Optional die erwartete Sprache, z. B. "de".' },
      },
      required: ['pfad'],
    },
    execute: async (args) => {
      const roh = args['pfad']
      if (typeof roh !== 'string' || roh.trim() === '') {
        throw new Error('speech_transcribe: das Argument "pfad" fehlt')
      }
      const ziel = zielPfad(roh, roh)
      const ton = new Uint8Array(await readFile(ziel))
      const gebaut = await kette()
      const hoerer = await gebaut.aufbau.faehigkeiten.hoerer()
      const sprache = args['sprache']
      const ergebnis = await hoerer.hoere(
        ton,
        typeof sprache === 'string' && sprache.trim() !== '' ? sprache : undefined,
      )
      return JSON.stringify({ pfad: ziel, ...ergebnis }, null, 2)
    },
  }
}

/**
 * Das Werkzeug für Einbetten.
 *
 * @param kette - woher die Kette kommt
 * @returns das Werkzeug
 */
export function einbettWerkzeug(kette: Kettequelle): AgentTool {
  return {
    name: 'text_embed',
    description:
      'Bette Texte als Vektoren ein. Die Zahlen sind lang — nutze sie zum Vergleichen, nicht zum ' +
      'Vorlesen.',
    parameters: {
      type: 'object',
      properties: {
        texte: { type: 'array', items: { type: 'string' }, description: 'Die Texte.' },
      },
      required: ['texte'],
    },
    execute: async (args) => {
      const texte = args['texte']
      if (!Array.isArray(texte) || texte.length === 0 || texte.some((t) => typeof t !== 'string')) {
        throw new Error('text_embed: das Argument "texte" muß eine nicht-leere Liste von Zeichenketten sein')
      }
      const gebaut = await kette()
      const anbieter = await gebaut.aufbau.faehigkeiten.waehle('einbetten')
      if (anbieter.einbetter === undefined) {
        throw new Error(`Der Anbieter „${anbieter.id}" liefert keinen Einbetter.`)
      }
      const vektoren = await anbieter.einbetter.betteEin(texte as string[])
      return JSON.stringify({ vektoren, dimensionen: vektoren[0]?.length ?? 0 }, null, 2)
    },
  }
}

/**
 * Das Werkzeug für ein Urteil.
 *
 * @param kette - woher die Kette kommt
 * @returns das Werkzeug
 */
export function entscheidWerkzeug(kette: Kettequelle): AgentTool {
  return {
    name: 'ai_decide',
    description:
      'Fälle ein Urteil nach einem Schema: eine Frage, eine Lage und erlaubte Werte hinein, ein ' +
      'geprüftes Ergebnis heraus. Für Entscheidungen, nicht für Fließtext.',
    parameters: {
      type: 'object',
      properties: {
        frage: { type: 'string', description: 'Die Frage in Worten.' },
        lage: { type: 'object', description: 'Die Lage, um die es geht.' },
        schema: {
          type: 'object',
          description:
            'Felder und erlaubte Werte: { felder: { name: { art: "text"|"zahl"|"wahrheitswert", auswahl?: [...] } } }',
        },
      },
      required: ['frage', 'schema'],
    },
    execute: async (args) => {
      const frage = args['frage']
      const schema = args['schema']
      if (typeof frage !== 'string' || frage.trim() === '') {
        throw new Error('ai_decide: das Argument "frage" fehlt')
      }
      if (schema === null || typeof schema !== 'object') {
        throw new Error('ai_decide: das Argument "schema" fehlt')
      }
      const gebaut = await kette()
      const entscheider = await gebaut.aufbau.faehigkeiten.entscheider()
      const urteil = await entscheider.entscheide<unknown>({
        frage,
        lage: args['lage'],
        schema: schema as Schema<unknown>,
      })
      return JSON.stringify(urteil, null, 2)
    },
  }
}
