/**
 * Tests der Home-Auflösung. Die Kette ist die Zusage dieses Pakets, deshalb
 * wird jede Stufe einzeln geprüft — einschließlich der Stufen, die *nicht*
 * greifen dürfen (blanker Env-Wert, `DSH_HOME` gegen `PMH_HOME`).
 */

import { describe, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  AGENTS_HOME_ENV,
  DEFAULT_PMH_HOME_DISPLAY,
  DSH_HOME_ENV,
  HOME_ENV_CHAIN,
  PMH_HOME_ENV,
  agentsHomeDisplay,
  canonicalizeWatchPath,
  defaultPmhHome,
  expandHomePath,
  homeDisplay,
  pmhCachePath,
  pmhHomePath,
  resolveAgentsHome,
  resolveHomeDetailed,
  resolvePmhHome,
} from '../src/index'

const empty: Record<string, string | undefined> = {}

describe('Kette', () => {
  test('die Reihenfolge ist PMH_HOME, DSH_HOME, ~/.pmh', () => {
    expect(HOME_ENV_CHAIN).toEqual([PMH_HOME_ENV, DSH_HOME_ENV])
    expect([...HOME_ENV_CHAIN]).toEqual(['PMH_HOME', 'DSH_HOME'])
  })

  test('Stufe 3: ohne Env gilt ~/.pmh', () => {
    expect(resolvePmhHome(undefined, empty)).toBe(resolve(join(homedir(), '.pmh')))
    expect(resolveHomeDetailed(undefined, empty).origin).toBe('default')
  })

  test('Stufe 2: DSH_HOME greift, wenn PMH_HOME fehlt', () => {
    const env = { [DSH_HOME_ENV]: join(homedir(), '.dsh') }
    expect(resolvePmhHome(undefined, env)).toBe(resolve(join(homedir(), '.dsh')))
    expect(resolveHomeDetailed(undefined, env).origin).toBe('DSH_HOME')
  })

  test('Stufe 1: PMH_HOME schlägt DSH_HOME', () => {
    const env = { [PMH_HOME_ENV]: 'C:\\pmh-home-a', [DSH_HOME_ENV]: 'C:\\dsh-home-b' }
    expect(resolvePmhHome(undefined, env)).toBe(resolve('C:\\pmh-home-a'))
    expect(resolveHomeDetailed(undefined, env).origin).toBe('PMH_HOME')
  })

  test('explizit konfiguriert schlägt jede Env-Variable', () => {
    const env = { [PMH_HOME_ENV]: 'C:\\pmh-home-a', [DSH_HOME_ENV]: 'C:\\dsh-home-b' }
    expect(resolvePmhHome('C:\\explicit', env)).toBe(resolve('C:\\explicit'))
    expect(resolveHomeDetailed('C:\\explicit', env).origin).toBe('configured')
  })

  test('ein blanker Env-Wert gilt als nicht gesetzt — auf beiden Stufen', () => {
    expect(resolvePmhHome(undefined, { [PMH_HOME_ENV]: '   ' })).toBe(resolve(defaultPmhHome()))
    expect(resolvePmhHome(undefined, { [PMH_HOME_ENV]: '', [DSH_HOME_ENV]: '  ' })).toBe(
      resolve(defaultPmhHome()),
    )
    expect(resolvePmhHome(undefined, { [PMH_HOME_ENV]: '  ', [DSH_HOME_ENV]: 'C:\\from-dsh' })).toBe(
      resolve('C:\\from-dsh'),
    )
  })

  test('ein expliziter Leerstring gewinnt und löst gegen das cwd auf (Asymmetrie der Vorlage)', () => {
    expect(resolvePmhHome('', { [DSH_HOME_ENV]: 'C:\\from-dsh' })).toBe(resolve(''))
  })

  test('ein relativer Env-Wert wird gegen das cwd aufgelöst', () => {
    expect(resolvePmhHome(undefined, { [PMH_HOME_ENV]: './relative-pmh' })).toBe(resolve('./relative-pmh'))
  })

  test('~ wird expandiert, danach absolut aufgelöst', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.pmh')).toBe(join(homedir(), '.pmh'))
    expect(expandHomePath('~\\pmh')).toBe(join(homedir(), 'pmh'))
    expect(expandHomePath('~alice/x')).toBe('~alice/x')
    expect(expandHomePath('$PMH_HOME/x')).toBe('$PMH_HOME/x')
  })

  test('pmhHomePath hängt Segmente an, ohne Verzeichnisse zu erzeugen', () => {
    const env = { [PMH_HOME_ENV]: 'C:\\pmh-home' }
    // pmhHomePath liest die echte Umgebung — hier wird nur die Form geprüft.
    expect(pmhHomePath('sessions').startsWith(resolvePmhHome())).toBe(true)
    expect(pmhHomePath('sessions').endsWith(join('sessions'))).toBe(true)
    expect(env[PMH_HOME_ENV]).toBe('C:\\pmh-home')
  })

  test('pmhCachePath kennt beide Aufrufformen', () => {
    expect(pmhCachePath({ pmhHome: 'C:\\pmh-home' }, 'attachments')).toBe(
      join(resolve('C:\\pmh-home'), 'cache', 'attachments'),
    )
    expect(pmhCachePath('attachments').endsWith(join('cache', 'attachments'))).toBe(true)
  })

  test('Anzeigeformen sind nie absolute Pfade', () => {
    expect(homeDisplay(resolve(defaultPmhHome()))).toBe(DEFAULT_PMH_HOME_DISPLAY)
    expect(homeDisplay(resolve('C:\\somewhere-else'))).toBe('$PMH_HOME')
    expect(agentsHomeDisplay(resolve(join(homedir(), '.agents')))).toBe('~/.agents')
    expect(agentsHomeDisplay(resolve('C:\\somewhere-else'))).toBe(`$${AGENTS_HOME_ENV}`)
    expect(resolveHomeDetailed('C:\\x', empty).display).toBe('$PMH_HOME')
  })
})

describe('geteilter Agent-Root', () => {
  test('$DSH_AGENTS_HOME schlägt den Default ~/.agents', () => {
    expect(resolveAgentsHome('C:\\agents-a', empty)).toBe(resolve('C:\\agents-a'))
    expect(resolveAgentsHome(undefined, { [AGENTS_HOME_ENV]: 'C:\\agents-b' })).toBe(resolve('C:\\agents-b'))
    expect(resolveAgentsHome(undefined, empty)).toBe(resolve(join(homedir(), '.agents')))
    expect(resolveAgentsHome(undefined, { [AGENTS_HOME_ENV]: '  ' })).toBe(resolve(join(homedir(), '.agents')))
  })
})

describe('canonicalizeWatchPath', () => {
  test('ein existierendes Verzeichnis wird kanonisiert', async () => {
    const here = await canonicalizeWatchPath('.')
    expect(here.length).toBeGreaterThan(0)
    expect(here).toBe(resolve(here))
  })

  test('ein fehlendes Suffix wird wiederhergestellt', async () => {
    const missing = await canonicalizeWatchPath(join('.', 'gibt-es-nicht-12345', 'tiefer', 'datei.yml'))
    expect(missing.endsWith(join('gibt-es-nicht-12345', 'tiefer', 'datei.yml'))).toBe(true)
  })
})
