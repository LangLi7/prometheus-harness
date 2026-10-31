import { expect, test } from 'bun:test'
import { PluginRegistry } from '../src/plugins'
import { describeLevel, formatHealth, runCommand, terminalCommands } from '../src/terminal'
import type { TerminalEnv } from '../src/terminal'
import { exampleUniverse } from '../src/universe'

const universe = exampleUniverse()

function makeEnv(): { env: TerminalEnv; spoken: string[]; registry: PluginRegistry } {
  const registry = new PluginRegistry()
  const spoken: string[] = []
  const env: TerminalEnv = {
    readUniverse: () => universe,
    registry,
    device: () => ({ Test: 'ja' }),
    formatReport: formatHealth,
  }
  const context = { speak: (text: string) => spoken.push(text), refresh: () => {} }
  // Die Befehle des Terminals selbst eintragen — so wie es das Plugin tut.
  registry.register({
    id: 'debug-terminal',
    name: 'Terminal',
    version: '1.0.0',
    description: 'Test',
    commands: terminalCommands(env),
  })
  void context
  return { env, spoken, registry }
}

const ctx = { speak: () => {}, refresh: () => {} }

test('help listet die Befehle MIT ihrem Plugin — man soll sehen, woher sie kommen', () => {
  const { env } = makeEnv()
  const lines = runCommand('help', env, ctx)
  expect(lines.join('\n')).toContain('debug-terminal')
  expect(lines.join('\n')).toContain('plugins')
})

test('ein unbekannter Befehl nennt die verfuegbaren — statt zum Raten zu zwingen', () => {
  const { env } = makeEnv()
  const lines = runCommand('gibtsnicht', env, ctx)
  expect(lines[0]).toContain('Unbekannter Befehl')
  expect(lines[1]).toContain('help')
})

test('plugins zeigt Zustand UND fehlende Abhaengigkeit', () => {
  const { env, registry } = makeEnv()
  registry.register({
    id: 'haengt',
    name: 'Hängt',
    version: '1.0.0',
    description: 'braucht was',
    requires: ['fehlt'],
  })
  const text = runCommand('plugins', env, ctx).join('\n')
  expect(text).toContain('debug-terminal')
  expect(text).toContain('haengt')
  expect(text).toContain('fehlt: fehlt')
})

test('enable und disable wirken und melden das Ergebnis', () => {
  const { env, registry } = makeEnv()
  registry.register({ id: 'x', name: 'X', version: '1', description: 'x' })
  registry.disable('x')
  expect(runCommand('enable x', env, ctx).join()).toContain('eingeschaltet')
  expect(registry.isEnabled('x')).toBe(true)
  expect(runCommand('disable x', env, ctx).join()).toContain('ausgeschaltet')
  expect(registry.isEnabled('x')).toBe(false)
})

test('enable auf ein unbekanntes Plugin sagt das, statt zu luegen', () => {
  const { env } = makeEnv()
  expect(runCommand('enable nixda', env, ctx).join()).toContain('lässt sich nicht einschalten')
})

test('health liefert einen Bericht mit Kopfzeile und Kennzeichnung', () => {
  const { env, registry } = makeEnv()
  registry.register({
    id: 'a',
    name: 'A',
    version: '1',
    description: 'a',
    healthChecks: [() => ({ name: 'a:ok', ok: true, message: 'gut' })],
  })
  const text = runCommand('health', env, ctx).join('\n')
  expect(text).toContain('OK   a:ok')
  expect(text).toContain('in Ordnung')
})

test('level 6 zeigt das Sternsystem, nicht die Himmelskörper', () => {
  const { env } = makeEnv()
  const text = runCommand('level 6', env, ctx).join('\n')
  /*
   * **Die Ebenennummer hat sich um eins verschoben — die Prüfung nicht.**
   *
   * Der Projekt-Stapel ist ein **Sternsystem** (eine Gruppe von Workspaces), und das ist mit der neuen
   * zwoelfstufigen Skala Ebene **6**. Ebene 5 ist jetzt das **Planetensystem** — der Umschlag um das
   * Sonnensystem —, und dort steht der Stapel nicht.
   *
   * Der Test prüft weiter dasselbe: diese Ebene zeigt die **Zusammenfassung** und keinen Himmelskörper.
   */
  expect(text).toContain('Sternsystem')
  expect(text).toContain('projekt-stack')
  expect(text).not.toContain('Merkur')
})

test('level 5 zeigt das Planetensystem — die Stufe zwischen Stern und Sternsystem', () => {
  const { env } = makeEnv()
  const text = runCommand('level 5', env, ctx).join('\n')
  // Auf dieser Stufe steht der **Umschlag** um das Sonnensystem, und darunter das System selbst.
  expect(text).toContain('Planetensystem')
  expect(text).toContain('planetensystem')
  expect(text).not.toContain('Merkur')
})

test('level ohne gueltige Zahl erklaert die Verwendung', () => {
  const { env } = makeEnv()
  expect(runCommand('level 9', env, ctx).join()).toContain('Verwendung')
  expect(runCommand('level', env, ctx).join()).toContain('Verwendung')
})

test('find nennt das Objekt, seinen Weg und seine Weltkoordinaten', () => {
  const { env } = makeEnv()
  const text = runCommand('find Neptun', env, ctx).join('\n')
  expect(text).toContain('Neptun')
  expect(text).toContain('kosmischer Überblick')
  expect(text).toContain('@')
})

test('find ohne Treffer sagt das deutlich', () => {
  const { env } = makeEnv()
  expect(runCommand('find xyz-gibtsnicht', env, ctx).join()).toContain('Nichts gefunden')
})

test('find mit mehreren Woertern findet auch ueber Bindestriche hinweg', () => {
  const { env } = makeEnv()
  // „projekt stack" muss `projekt-stack` finden — niemand tippt den Bindestrich.
  expect(runCommand('find projekt stack', env, ctx).join()).toContain('projekt-stack')
})

test('stats nennt Objektzahl und Geraetewerte', () => {
  const { env } = makeEnv()
  const text = runCommand('stats', env, ctx).join('\n')
  expect(text).toContain('Objekte im Universum')
  expect(text).toContain('Test: ja')
})

test('speak ruft die Sprachausgabe und meldet, was gesprochen wurde', () => {
  const registry = new PluginRegistry()
  const spoken: string[] = []
  const env: TerminalEnv = {
    readUniverse: () => universe,
    registry,
    device: () => ({}),
  }
  registry.register({
    id: 't',
    name: 'T',
    version: '1',
    description: 't',
    commands: terminalCommands(env),
  })
  const lines = runCommand('speak hallo welt', env, { speak: (t) => spoken.push(t), refresh: () => {} })
  expect(spoken).toEqual(['hallo welt'])
  expect(lines.join()).toContain('hallo welt')
})

test('speak ohne Text erklaert die Verwendung', () => {
  const { env } = makeEnv()
  expect(runCommand('speak', env, ctx).join()).toContain('Verwendung')
})

test('clear liefert die Kennung, die das Fenster leert', () => {
  const { env } = makeEnv()
  expect(runCommand('clear', env, ctx)).toEqual(['__CLEAR__'])
})

test('leere Eingabe tut nichts — sie ist kein Fehler', () => {
  const { env } = makeEnv()
  expect(runCommand('   ', env, ctx)).toEqual([])
})

test('/ ist ein Präfix — `/help` und `help` sind derselbe Befehl', () => {
  /*
   * **Warum das eine Prüfung braucht.** Der Schrägstrich wird **vor** dem
   * Nachschlagen entfernt. Ohne diesen Test wäre ein Tippfehler im Abschneiden
   * unsichtbar: `/help` landete bei „Unbekannter Befehl: /help", und niemand
   * fände den Grund, weil `help` allein weiter funktioniert.
   */
  const { env } = makeEnv()
  expect(runCommand('/help', env, ctx).join('\n')).toContain('Befehle')
  expect(runCommand('help', env, ctx).join('\n')).toContain('Befehle')
  // Ein leerer Schrägstrich ist keine Eingabe — er darf keinen Fehler erzeugen.
  expect(runCommand('/', env, ctx)).toEqual([])
})

test('describeLevel zeigt jede Ebene mit ihrem Inhalt', () => {
  /*
   * **Die Ebenennummern sind mit der neuen Skala gewandert.**
   *
   * Der Ueberblick ist Ebene **12** (vorher 7), das Sternsystem mit dem Projekt-Stapel Ebene **6**
   * (vorher 5). Sonne, Merkur und Voyager behalten ihre Stufen: sie haengen an der **Tiefe im Baum**,
   * nicht an der Anzahl der Ebenen darueber.
   */
  expect(describeLevel(universe, 12).join()).toContain('kosmischer Überblick')
  expect(describeLevel(universe, 6).join()).toContain('projekt-stack')
  expect(describeLevel(universe, 3).join()).toContain('Sonne')
  expect(describeLevel(universe, 2).join()).toContain('Merkur')
  expect(describeLevel(universe, 1).join()).toContain('Voyager')
})

test('formatHealth kennzeichnet Befunde und zeigt Messwerte eingerueckt', () => {
  const lines = formatHealth([
    { name: 'a:1', ok: true, message: 'gut', details: { Wert: 3 } },
    { name: 'b:1', ok: false, message: 'schlecht' },
  ])
  expect(lines.join('\n')).toContain('OK   a:1')
  expect(lines.join('\n')).toContain('FEHL b:1')
  expect(lines.join('\n')).toContain('Wert: 3')
  expect(lines[0]).toContain('1 Befund')
})

test('formatHealth ohne Pruefungen sagt das, statt eine leere Flaeche zu zeigen', () => {
  expect(formatHealth([])).toEqual(['Keine Prüfungen vorhanden.'])
})
