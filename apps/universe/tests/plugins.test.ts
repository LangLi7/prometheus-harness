import { expect, test } from 'bun:test'
import { PluginRegistry } from '../src/plugins'
import type { Plugin } from '../src/plugins'

function plugin(id: string, extra: Partial<Plugin> = {}): Plugin {
  return { id, name: id, version: '1.0.0', description: `Plugin ${id}`, ...extra }
}

test('ein Plugin ohne Abhaengigkeiten ist sofort eingeschaltet', () => {
  const registry = new PluginRegistry()
  const entry = registry.register(plugin('a'))
  expect(entry.enabled).toBe(true)
  expect(registry.isEnabled('a')).toBe(true)
})

test('ein Plugin mit fehlender Abhaengigkeit wird eingetragen, aber NICHT eingeschaltet', () => {
  const registry = new PluginRegistry()
  const entry = registry.register(plugin('b', { requires: ['a'] }))
  // Sichtbar bleiben und den Grund nennen — nicht verschwinden.
  expect(entry.enabled).toBe(false)
  expect(entry.missing).toEqual(['a'])
  expect(registry.list().map((e) => e.plugin.id)).toEqual(['b'])
})

test('nach dem Einschalten der Abhaengigkeit laesst sich das Plugin einschalten', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('b', { requires: ['a'] }))
  expect(registry.enable('b')).toBe(false)
  registry.register(plugin('a'))
  expect(registry.enable('b')).toBe(true)
  expect(registry.isEnabled('b')).toBe(true)
})

test('Ausschalten reisst abhaengige Plugins mit — sonst zeigt die Flaeche etwas ohne Grundlage', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('a'))
  registry.register(plugin('b', { requires: ['a'] }))
  registry.disable('a')
  expect(registry.isEnabled('a')).toBe(false)
  expect(registry.isEnabled('b')).toBe(false)
  expect(registry.get('b')?.missing).toEqual(['a'])
})

test('ein ausgeschaltetes Plugin liefert weder Panel noch Befehle', () => {
  const registry = new PluginRegistry()
  registry.register(
    plugin('a', {
      panel: { title: 'A', zone: 'left', size: 200, render: () => {} },
      commands: [{ name: 'aa', help: '', run: () => ['x'] }],
    }),
  )
  expect(registry.panels()).toHaveLength(1)
  expect(registry.commands()).toHaveLength(1)
  registry.disable('a')
  expect(registry.panels()).toEqual([])
  expect(registry.commands()).toEqual([])
})

test('Entfernen nimmt das Plugin ganz heraus', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('a'))
  expect(registry.unregister('a')).toBe(true)
  expect(registry.list()).toEqual([])
  expect(registry.unregister('a')).toBe(false)
})

test('doppelte Kennung wird abgelehnt — sie wuerde das falsche Plugin treffen', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('a'))
  expect(() => registry.register(plugin('a'))).toThrow(/bereits eingetragen/)
})

test('onEnable und onDisable laufen genau beim Wechsel', () => {
  const registry = new PluginRegistry()
  let enabled = 0
  let disabled = 0
  registry.register(plugin('a', { onEnable: () => (enabled += 1), onDisable: () => (disabled += 1) }))
  expect(enabled).toBe(1)
  registry.disable('a')
  expect(disabled).toBe(1)
  registry.enable('a')
  expect(enabled).toBe(2)
  // Zweimal einschalten schaltet nicht zweimal ein.
  registry.enable('a')
  expect(enabled).toBe(2)
})

test('der Gesundheitsbericht sammelt die Pruefungen ALLER eingeschalteten Plugins', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('a', { healthChecks: [() => ({ name: 'a:1', ok: true, message: 'gut' })] }))
  registry.register(plugin('b', { healthChecks: [() => ({ name: 'b:1', ok: false, message: 'schlecht' })] }))
  const reports = registry.health()
  expect(reports.map((r) => r.name).sort()).toEqual(['a:1', 'b:1'])
})

test('eine werfende Pruefung wird zum Befund, nicht zum Absturz des Berichts', () => {
  const registry = new PluginRegistry()
  registry.register(
    plugin('kaputt', {
      healthChecks: [
        () => {
          throw new Error('kein Zugriff')
        },
      ],
    }),
  )
  registry.register(plugin('gut', { healthChecks: [() => ({ name: 'gut:1', ok: true, message: 'ok' })] }))
  const reports = registry.health()
  // Beide Pruefungen erscheinen — sonst waere der Bericht genau dann unbrauchbar, wenn man
  // ihn braucht.
  expect(reports).toHaveLength(2)
  const crashed = reports.find((r) => !r.ok)
  expect(crashed?.message).toContain('kein Zugriff')
})

test('ausgeschaltete Plugins pruefen nicht mit', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('a', { healthChecks: [() => ({ name: 'a:1', ok: true, message: '' })] }))
  registry.disable('a')
  expect(registry.health()).toEqual([])
})

test('Aenderungen werden gemeldet — die Flaeche muss sich neu bauen koennen', () => {
  const registry = new PluginRegistry()
  let calls = 0
  const stop = registry.onChange(() => (calls += 1))
  registry.register(plugin('a'))
  registry.disable('a')
  registry.enable('a')
  expect(calls).toBe(3)
  stop()
  registry.disable('a')
  expect(calls).toBe(3)
})

test('Befehle kommen nach Name sortiert — ein Terminal will eine stabile Liste', () => {
  const registry = new PluginRegistry()
  registry.register(plugin('a', { commands: [{ name: 'zebra', help: '', run: () => [] }] }))
  registry.register(plugin('b', { commands: [{ name: 'anker', help: '', run: () => [] }] }))
  expect(registry.commands().map((c) => c.command.name)).toEqual(['anker', 'zebra'])
})
