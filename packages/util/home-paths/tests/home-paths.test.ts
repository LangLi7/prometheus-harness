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
  resolveEigenesHome,
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
    // **Der Pfad muß auf DIESER Maschine absolut sein.** `C:\x` ist auf POSIX
    // kein absoluter Pfad, sondern ein Name im Arbeitsverzeichnis — die Anzeige
    // lautet dann `./C:\x`, und das ist richtig so. Die Prüfung war auf Linux rot,
    // weil sie mit einer Windows-Form eine plattformunabhängige Regel prüfte.
    const irgendwo = process.platform === 'win32' ? 'C:\\x' : '/x'
    expect(homeDisplay(resolve(defaultPmhHome()))).toBe(DEFAULT_PMH_HOME_DISPLAY)
    expect(homeDisplay(resolve('C:\\somewhere-else'))).toBe('$PMH_HOME')
    expect(agentsHomeDisplay(resolve(join(homedir(), '.agents')))).toBe('~/.agents')
    expect(agentsHomeDisplay(resolve('C:\\somewhere-else'))).toBe(`$${AGENTS_HOME_ENV}`)
    expect(resolveHomeDetailed(irgendwo, empty).display).toBe('$PMH_HOME')
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

/**
 * `resolveEigenesHome` — die Auflösung **ohne** Rückfall auf `DSH_HOME`.
 *
 * **Warum es diese Funktion überhaupt gibt, gemessen am 13.10.2026:**
 *
 * ```
 * PMH_HOME = (leer)
 * DSH_HOME = C:\Users\Chang\.dsh
 * resolvePmhHome() -> C:\Users\Chang\.dsh        ← falsch für eigene Dateien
 * ```
 *
 * `scripts/claim.mjs` legte dort `claim.txt`, `claim-ablage.json` und `geraet` an.
 * `~/.dsh` gehört dem **anderen** Harness und ist als „niemals verändern"
 * gekennzeichnet — ein Werkzeug, das dorthin schreibt, weil eine
 * Umgebungsvariable gesetzt ist, verletzt diese Grenze ohne Absicht und ohne
 * Warnung.
 */
describe('Das eigene Home — ohne Rückfall auf DSH_HOME', () => {
  /**
   * Ein DSH-Home, wie es auf **dieser** Maschine aussieht.
   *
   * **Warum das nicht `C:\Users\jemand\.dsh` bleiben durfte.** Die Sperre greift
   * auf den **Verzeichnisnamen** `.dsh`. Auf POSIX ist der Backslash kein Trenner,
   * also ist `basename('C:\Users\jemand\.dsh')` die **ganze** Zeichenkette — und
   * die heißt nicht `.dsh`. Die beiden Prüfungen, die das Werfen erwarten, waren
   * damit auf Linux rot, obwohl die Funktion richtig arbeitet: `[.. /home/jemand/.dsh]`
   * wirft. Der Fehler lag in der Vorlage, die eine Windows-Form benutzte, um eine
   * plattformunabhängige Regel zu prüfen.
   */
  const DSH_HOME_FREMD = process.platform === 'win32' ? 'C:\\Users\\jemand\\.dsh' : '/home/jemand/.dsh'

  test('nimmt PMH_HOME, wenn es gesetzt ist', () => {
    const eigen = join(homedir(), 'eigenes-pmh')
    expect(resolveEigenesHome(undefined, { PMH_HOME: eigen, DSH_HOME: DSH_HOME_FREMD })).toBe(resolve(eigen))
  })

  test('fällt auf ~/.pmh zurück und NICHT auf DSH_HOME', () => {
    // **Der gemessene Fall.** Ist nur `DSH_HOME` gesetzt, darf das Ergebnis
    // trotzdem nicht dorthin zeigen.
    const ergebnis = resolveEigenesHome(undefined, { DSH_HOME: DSH_HOME_FREMD })
    expect(ergebnis).toBe(resolve(defaultPmhHome()))
    expect(ergebnis).not.toContain('.dsh')
  })

  test('wirft, wenn PMH_HOME auf ein DSH-Home zeigt', () => {
    // **Eine Konvention, die man brechen kann, ist keine Grenze.** Auch wenn
    // jemand `PMH_HOME` ausdrücklich auf das DSH-Home setzt, wird nicht
    // geschrieben — der Lauf bricht ab.
    expect(() => resolveEigenesHome(undefined, { PMH_HOME: DSH_HOME_FREMD })).toThrow(/DeepSeek Harness/u)
  })

  test('wirft auch bei einem ausdrücklich übergebenen DSH-Pfad', () => {
    expect(() => resolveEigenesHome(DSH_HOME_FREMD, {})).toThrow(/DeepSeek Harness/u)
  })

  test('ein Verzeichnis, das nur ähnlich heißt, geht durch', () => {
    // Die Sperre greift auf den **Verzeichnisnamen** `.dsh` und auf die
    // Gleichheit mit `DSH_HOME` — nicht auf eine Zeichenkette irgendwo im Pfad.
    // Sonst wäre `…/pmh-dsh-pruefung` verboten, obwohl es niemandem gehört.
    const aehnlich = join(homedir(), 'pmh-dsh-pruefung')
    expect(resolveEigenesHome(aehnlich, {})).toContain('pmh-dsh-pruefung')
  })

  test('und die alte Auflösung bleibt unverändert — sie hat ihren Zweck', () => {
    // `resolvePmhHome` folgt weiterhin der Kette `PMH_HOME → DSH_HOME → ~/.pmh`.
    // Für einen **Umzug** aus einem bestehenden DSH-Home ist das richtig; nur für
    // eigene **Dateien** ist es falsch. Beide Regeln stehen nebeneinander, statt
    // eine durch die andere zu ersetzen.
    expect(resolvePmhHome(undefined, { DSH_HOME: DSH_HOME_FREMD })).toBe(resolve(DSH_HOME_FREMD))
  })
})
