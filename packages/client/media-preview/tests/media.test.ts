/**
 * Die Zuordnung Endung → Wiedergabe, ohne Browser geprüft.
 *
 * Der Wert dieser Prüfung liegt in den **Gegenproben**: eine Endung ohne
 * Eintrag darf `undefined` ergeben, und ein Punkt-Name darf nicht als Endung
 * durchgehen. Ohne diese Fälle wäre „gibt für alles etwas zurück" grün.
 */

import { describe, expect, test } from 'bun:test'
import { MEDIA_EXTENSIONS, fileNameOf, mediaTypeOf } from '../src/media.ts'

describe('mediaTypeOf', () => {
  test('erkennt die gewöhnlichen Video-Container', () => {
    expect(mediaTypeOf('C:\\out\\brag.mp4')).toEqual({ kind: 'video', mime: 'video/mp4' })
    expect(mediaTypeOf('/tmp/clip.webm')).toEqual({ kind: 'video', mime: 'video/webm' })
    expect(mediaTypeOf('film.mov')).toEqual({ kind: 'video', mime: 'video/quicktime' })
  })

  test('erkennt die gewöhnlichen Ton-Container', () => {
    expect(mediaTypeOf('song.mp3')).toEqual({ kind: 'audio', mime: 'audio/mpeg' })
    expect(mediaTypeOf('aufnahme.wav')).toEqual({ kind: 'audio', mime: 'audio/wav' })
    expect(mediaTypeOf('stimm.m4a')).toEqual({ kind: 'audio', mime: 'audio/mp4' })
  })

  test('Groß- und Kleinschreibung ist gleich', () => {
    expect(mediaTypeOf('BRAG.MP4')).toEqual(mediaTypeOf('brag.mp4'))
    expect(mediaTypeOf('Clip.WebM')).toEqual(mediaTypeOf('clip.webm'))
  })

  test('Abfrageteil und Sprungmarke zählen nicht', () => {
    expect(mediaTypeOf('brag.mp4?raw=1')).toEqual({ kind: 'video', mime: 'video/mp4' })
    expect(mediaTypeOf('brag.mp4#t=3')).toEqual({ kind: 'video', mime: 'video/mp4' })
  })

  test('eine fremde Endung ergibt nichts', () => {
    expect(mediaTypeOf('notes.md')).toBeUndefined()
    expect(mediaTypeOf('archiv.zip')).toBeUndefined()
    expect(mediaTypeOf('ohne-endung')).toBeUndefined()
  })

  test('ein reiner Punkt-Name ist keine Endung', () => {
    expect(mediaTypeOf('.mp4')).toBeUndefined()
    expect(mediaTypeOf('ordner/.mp4')).toBeUndefined()
  })

  test('ein Punkt am Ende ergibt nichts', () => {
    expect(mediaTypeOf('brag.mp4.')).toBeUndefined()
  })

  test('jede gemeldete Endung ist auch abspielbar', () => {
    for (const extension of MEDIA_EXTENSIONS) {
      expect(mediaTypeOf(`datei.${extension}`)).toBeDefined()
    }
    expect(MEDIA_EXTENSIONS).toContain('mp4')
    expect(MEDIA_EXTENSIONS).toContain('mp3')
  })
})

describe('fileNameOf', () => {
  test('nimmt den letzten Abschnitt beider Trennzeichen', () => {
    expect(fileNameOf('C:\\a\\b\\brag.mp4')).toBe('brag.mp4')
    expect(fileNameOf('/a/b/brag.mp4')).toBe('brag.mp4')
    expect(fileNameOf('brag.mp4')).toBe('brag.mp4')
  })

  test('schneidet Abfrageteil und Sprungmarke ab', () => {
    expect(fileNameOf('a/brag.mp4?x=1#y')).toBe('brag.mp4')
  })
})
