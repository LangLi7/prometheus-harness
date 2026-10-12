import { describe, expect, test } from 'bun:test'
import {
  belongsTo,
  carrier,
  createScope,
  createScopedRegistry,
  runInScope,
  runInScopeAsync,
  sameScope,
  scoped,
} from '../src/index'

describe('createScope', () => {
  test('ein Scope hat Name, Schlüssel und Kette', () => {
    const root = createScope('root')
    const child = createScope('agent', root)
    expect(root.name).toBe('root')
    expect(root.parent).toBeUndefined()
    expect(root.chain).toHaveLength(1)
    expect(child.parent).toBe(root)
    expect(child.chain.map((scope) => scope.name)).toEqual(['root', 'agent'])
  })

  test('zwei gleichnamige Scopes sind verschieden', () => {
    const a = createScope('gleich')
    const b = createScope('gleich')
    expect(a.name).toBe(b.name)
    expect(sameScope(a.key, b.key)).toBe(false)
    expect(a.isAncestorOf(b)).toBe(false)
  })

  test('ein leerer Name wird abgelehnt', () => {
    expect(() => createScope('  ')).toThrow(TypeError)
  })
})

describe('isAncestorOf', () => {
  test('Vorfahren, Nachfahren und Fremde', () => {
    const root = createScope('root')
    const agent = createScope('agent', root)
    const step = createScope('step', agent)
    const other = createScope('other')

    expect(root.isAncestorOf(step)).toBe(true)
    expect(agent.isAncestorOf(step)).toBe(true)
    expect(step.isAncestorOf(root)).toBe(false)
    expect(other.isAncestorOf(step)).toBe(false)
    expect(root.isAncestorOf(root)).toBe(true)
    expect(belongsTo(root, agent)).toBe(true)
  })
})

describe('Scoped und Träger', () => {
  test('scoped bindet einen Wert an einen Scope', () => {
    const scope = createScope('s')
    const value = scoped(scope, 42)
    expect(value.scope).toBe(scope)
    expect(value.value).toBe(42)
  })

  test('carrier ist ein ScopeCarrier mit Wert', () => {
    const scope = createScope('s')
    const item = carrier(scope, { zähler: 1 })
    expect(item.scope).toBe(scope)
    expect(item.value.zähler).toBe(1)
  })
})

describe('runInScope', () => {
  test('gibt den Scope an den Rückruf weiter und reicht das Ergebnis durch', async () => {
    const scope = createScope('turn')
    expect(runInScope(scope, (given) => given.name)).toBe('turn')
    expect(await runInScopeAsync(scope, async (given) => given.name)).toBe('turn')
  })
})

describe('createScopedRegistry', () => {
  test('ein näherer Scope verdeckt den globalen Eintrag', () => {
    const registry = createScopedRegistry<string>()
    const root = createScope('root')
    const agent = createScope('agent', root)
    registry.register(root, 'prompt', 'global')
    registry.register(agent, 'prompt', 'agent')

    expect(registry.lookup(root, 'prompt')?.value).toBe('global')
    expect(registry.lookup(agent, 'prompt')?.value).toBe('agent')
    expect(registry.all(agent, 'prompt').map((entry) => entry.value)).toEqual(['agent', 'global'])
    expect(registry.entries(agent).get('prompt')?.value).toBe('agent')
  })

  test('ein fremder Scope sieht nichts', () => {
    const registry = createScopedRegistry<number>()
    const root = createScope('root')
    const fremd = createScope('fremd')
    registry.register(root, 'x', 1)
    expect(registry.lookup(fremd, 'x')).toBeUndefined()
    expect(registry.all(fremd, 'x')).toEqual([])
  })

  test('Rücknahme entfernt den Eintrag, mehrfach aufrufbar', () => {
    const registry = createScopedRegistry<number>()
    const scope = createScope('s')
    const registration = registry.register(scope, 'x', 1)
    expect(registry.size).toBe(1)
    registration.dispose()
    registration.dispose()
    expect(registry.size).toBe(0)
    expect(registry.lookup(scope, 'x')).toBeUndefined()
  })

  test('gleicher Name, gleicher Scope: der letzte gewinnt', () => {
    const registry = createScopedRegistry<string>()
    const scope = createScope('s')
    registry.register(scope, 'x', 'erst')
    registry.register(scope, 'x', 'dann')
    expect(registry.lookup(scope, 'x')?.value).toBe('dann')
    expect(registry.of(scope)).toHaveLength(2)
  })

  test('ein leerer Name wird abgelehnt', () => {
    const registry = createScopedRegistry<number>()
    const scope = createScope('s')
    expect(() => registry.register(scope, '', 1)).toThrow(TypeError)
  })
})
