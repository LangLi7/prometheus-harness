import { expect, test } from 'bun:test'
import { DEFAULT_ROOM, describeRoom, normalizeRoom, resolveRoom, storageKey } from '../src/room'

test('ohne Angabe gilt der Standardraum', () => {
  expect(resolveRoom('')).toBe(DEFAULT_ROOM)
  expect(resolveRoom('?foo=bar')).toBe(DEFAULT_ROOM)
})

test('der Raum kommt aus der Adresse', () => {
  expect(resolveRoom('?room=alice')).toBe('alice')
  expect(resolveRoom('?room=Alice')).toBe('alice')
})

test('zwei Raeume bekommen verschiedene Speicherschluessel — sonst ueberschreiben sie sich', () => {
  const a = storageKey('alice', 'camera')
  const b = storageKey('bob', 'camera')
  expect(a).not.toBe(b)
  expect(a).toContain('alice')
  expect(b).toContain('bob')
})

test('derselbe Name ergibt immer denselben Schluessel', () => {
  expect(storageKey('alice', 'camera')).toBe(storageKey('alice', 'camera'))
})

test('der Schluessel ist raumgebunden: die Welt selbst haengt nicht am Namen', () => {
  // Der Name ist gegen Laenge und Zeichen begrenzt, weil er in einen Schluessel eingeht.
  expect(storageKey('a'.repeat(200), 'camera').length).toBeLessThan(100)
})

test('Sonderzeichen werden bereinigt, nicht durchgelassen', () => {
  expect(normalizeRoom('  Alice Müller / ../etc ')).toBe('alice-m-ller-etc')
  expect(normalizeRoom('***')).toBe(DEFAULT_ROOM)
  expect(normalizeRoom('')).toBe(DEFAULT_ROOM)
  expect(normalizeRoom(null)).toBe(DEFAULT_ROOM)
})

test('Punkte fliegen heraus — ein Raumname ist ein Name, kein Pfad', () => {
  // Punkte sind das Zeichen, mit dem Pfadanteile gebaut werden. Waeren sie erlaubt, stuende
  // `..` im Schluessel — der Name koennte dann wie ein Pfad aussehen.
  expect(normalizeRoom('a.b')).toBe('a-b')
  expect(normalizeRoom('.hidden')).toBe('hidden')
})

test('Pfadanteile im Namen koennen den Schluessel nicht verlassen', () => {
  expect(normalizeRoom('../../bob')).toBe('bob')
  const key = storageKey('../../bob', 'camera')
  expect(key).not.toContain('..')
  expect(key).not.toContain('/')
  expect(key).toBe('prometheus.bob.camera')
})

test('der Raum wird in der Oberflaeche benannt — niemand soll raten muessen', () => {
  expect(describeRoom(DEFAULT_ROOM)).toBe('Standardraum')
  expect(describeRoom('alice')).toContain('alice')
})
