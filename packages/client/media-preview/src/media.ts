/**
 * **Welche Datei wird wie abgespielt** — und was daraus im Browser wird.
 *
 * Diese Datei entscheidet allein anhand des Namens; sie liest nichts und kennt
 * keinen Dateiinhalt. Das ist Absicht: die Zuordnung ist damit prüfbar, ohne
 * einen Browser zu starten (siehe `tests/media.test.ts`).
 *
 * ## Warum die Liste nicht „alles" enthält
 *
 * Ein Renderer, der ein Format annimmt, das der Browser nicht dekodieren kann,
 * sieht aus wie eine Vorschau und ist ein schwarzer Kasten. Die Liste führt
 * deshalb auch die Container, die Chromium **nicht** zuverlässig spielt
 * (`mkv`, `avi`, `wmv`, `flv`): sie bekommen wenigstens einen ehrlichen
 * Fehlerhinweis im Panel statt der Meldung „keine Vorschau verfügbar".
 *
 * @module @prometheus-harness/client-media-preview/media
 */

/** Was der Browser aus den Bytes machen soll. */
export type MediaKind = 'video' | 'audio'

/** Ein abspielbarer Container samt Medientyp für den Blob. */
export interface PlayableMedia {
  readonly kind: MediaKind
  readonly mime: string
}

/**
 * Die Zuordnung Endung → Wiedergabe.
 *
 * Die Schlüssel sind **klein** geschrieben und ohne Punkt; die Reihenfolge ist
 * die Reihenfolge der Anmeldung im Renderer-Register.
 */
const PLAYABLE: Readonly<Record<string, PlayableMedia>> = {
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  webm: { kind: 'video', mime: 'video/webm' },
  ogv: { kind: 'video', mime: 'video/ogg' },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
  avi: { kind: 'video', mime: 'video/x-msvideo' },
  wmv: { kind: 'video', mime: 'video/x-ms-wmv' },
  flv: { kind: 'video', mime: 'video/x-flv' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  flac: { kind: 'audio', mime: 'audio/flac' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  oga: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  wma: { kind: 'audio', mime: 'audio/x-ms-wma' },
}

/** Die Endungen, die dieser Renderer beansprucht. */
export const MEDIA_EXTENSIONS: readonly string[] = Object.keys(PLAYABLE)

/**
 * Der reine Dateiname eines Pfades.
 *
 * Abfrageteil und Sprungmarke fallen weg (ein `brag.mp4?raw=1` heißt `brag.mp4`),
 * und beide Trennzeichen zählen — der Host liefert je nach Herkunft `/` oder `\`.
 *
 * @param path - Dateipfad oder Dateiadresse
 * @returns der letzte Abschnitt, ohne `?…` und `#…`
 */
export function fileNameOf(path: string): string {
  const cut = path.search(/[?#]/u)
  const plain = cut === -1 ? path : path.slice(0, cut)
  const slash = Math.max(plain.lastIndexOf('/'), plain.lastIndexOf('\\'))
  return plain.slice(slash + 1)
}

/**
 * Die Wiedergabe-Art einer Datei, oder `undefined`.
 *
 * Ein Name ohne Endung, ein reiner Punkt-Name (`.mp4`) und eine unbekannte
 * Endung ergeben `undefined` — der Aufrufer zeigt dann den ehrlichen Hinweis
 * statt eines leeren Players.
 *
 * @param path - Dateipfad oder Dateiadresse
 * @returns Container und Medientyp, wenn dieser Renderer die Datei annimmt
 */
export function mediaTypeOf(path: string): PlayableMedia | undefined {
  const name = fileNameOf(path).toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return undefined
  return PLAYABLE[name.slice(dot + 1)]
}
