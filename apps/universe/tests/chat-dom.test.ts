/**
 * **Der Chat-Platzhalter — und der Weg dorthin.**
 *
 * **Warum dieser Test neu geschrieben wurde.** Der Betreiber hat die Chat-Implementierung aus diesem
 * Prototyp herausgenommen und einem anderen Agenten übergeben: „entferne mal den chat
 * implementierung stattdessen das es quasi nur das öffnen ux, gui existiert. quasi fast kein spur".
 *
 * Ein Test, der die entfernte Form festhält, würde den Auftrag **verhindern** statt ihn zu sichern —
 * er würde rot, sobald jemand den Chat baut. Er prüft jetzt das, was bleiben **soll**:
 *
 *   1. der **Weg** dorthin: die Insel, der Eintrag Chat, `view chat`
 *   2. die **Fläche**: `#screen-chat` mit Kopfzeile und einem Hinweis statt eines leeren Bildes
 *   3. der **Auftrag**: erreichbar als Panel und als Befehl, mit allen vier Teilen
 */
import { expect, test } from 'bun:test'
import { bootOnce, document_ } from './boot-once'

interface Knoten {
  readonly tagName: string
  readonly className: string
  readonly textContent: string
  readonly children: readonly Knoten[]
  readonly attributes: Map<string, string>
  readonly listeners: Map<string, (event: unknown) => void>
  readonly vollerText: string
  readonly placeholder: string
}

function alle(wurzel: Knoten): Knoten[] {
  return wurzel.children.flatMap((kind) => [kind, ...alle(kind)])
}

function nachKlasse(wurzel: Knoten, klasse: string): readonly Knoten[] {
  return alle(wurzel).filter((knoten) => knoten.className.split(/\s+/).includes(klasse))
}

test('der Chat-Platzhalter steht — kein leerer Bildschirm', async () => {
  const { gestartet, fehler } = await bootOnce()
  expect(gestartet, `der Start ist nicht durchgelaufen: ${fehler}`).toBe(true)
  const chat = document_.getElementById('screen-chat')
  expect(chat, '#screen-chat fehlt').not.toBeNull()
  if (!chat) return
  const baum = chat as unknown as Knoten

  const pflicht: readonly (readonly [string, boolean])[] = [
    ['Kopfzeile (.top)', nachKlasse(baum, 'top').length === 1],
    ['Fläche (.platzhalter-flaeche)', nachKlasse(baum, 'platzhalter-flaeche').length === 1],
    ['Karte (.platzhalter-karte)', nachKlasse(baum, 'platzhalter-karte').length === 1],
    ['Text (.platzhalter-text)', nachKlasse(baum, 'platzhalter-text').length === 1],
  ]
  const fehlend = pflicht.filter(([, da]) => !da).map(([name]) => name)
  expect(fehlend.join(', ')).toBe('')

  // **Der Hinweis nennt den Auftrag.** Ein leerer Bildschirm wäre von einem Fehler nicht zu
  // unterscheiden; dieser sagt, wo die Beschreibung steht.
  const text = alle(baum).map((k) => k.vollerText).join(' ')
  expect(text).toContain('Hier entsteht der Chat')
  expect(text).toContain('order')
})

test('vom Chat führen genau zwei Wege zurück — der Knopf und der Eintrag', async () => {
  await bootOnce()
  const chat = document_.getElementById('screen-chat')
  if (!chat) return
  const baum = chat as unknown as Knoten
  // Der Knopf in der Karte.
  const knoepfe = alle(baum).filter((k) => k.tagName === 'BUTTON')
  expect(knoepfe.length, 'kein Knopf im Platzhalter').toBeGreaterThan(0)
  for (const knopf of knoepfe) {
    expect(knopf.listeners.has('click'), `Knopf „${knopf.vollerText}" hat keinen Zuhörer`).toBe(true)
  }
})

test('der Auftrag hat vier Teile — und keiner ist leer', async () => {
  const { orderSections } = await import('../src/chat-order')
  const { de } = await import('../src/locales/de')
  const t = (key: string): string => de.messages[key] ?? key
  const teile = orderSections(t)

  // **Vier Teile, jeder mit Zeilen.** Ein Auftrag, der nur eine Überschrift hat, ist keiner — und
  // genau das würde „die Beschreibung steht im Programm" zur leeren Behauptung machen.
  expect(teile.length).toBe(4)
  const namen = teile.map((a) => a.title)
  expect(namen).toEqual(['Vorhaben', 'Funktion', 'Projekt-Stack', 'Offene Entscheidungen'])
  for (const abschnitt of teile) {
    const zeilen = abschnitt.lines.filter((l) => l.trim() !== '')
    expect(zeilen.length, `„${abschnitt.title}" hat keine Zeilen`).toBeGreaterThan(1)
  }
})

test('der Auftrag nennt Stack und offene Entscheidungen ausdruecklich', async () => {
  const { orderSections } = await import('../src/chat-order')
  const { de } = await import('../src/locales/de')
  const t = (key: string): string => de.messages[key] ?? key
  const text = orderSections(t)
    .flatMap((a) => [a.title, ...a.lines])
    .join('\n')

  // Der Betreiber hat „funktion und projekt stack" ausdruecklich verlangt.
  expect(text).toContain('Projekt-Stack')
  expect(text).toContain('Bun')
  expect(text).toContain('TypeScript')
  expect(text).toContain('Vite')
  // Und die offenen Entscheidungen — sonst hält der nächste Agent eine Vermutung für eine Vorgabe.
  expect(text).toContain('Offene Entscheidungen')
})

test('das Auftrags-Plugin liefert Panel, Befehl und eine Prüfung mit Inhalt', async () => {
  const { orderPlugin } = await import('../src/chat-order')
  const { de } = await import('../src/locales/de')
  const plugin = orderPlugin({ t: () => ({ t: (key: string) => de.messages[key] ?? key }) })

  expect(plugin.id).toBe('chat-order')
  expect(plugin.panel, 'kein Panel').toBeDefined()
  const befehl = plugin.commands?.[0]
  expect(befehl?.name).toBe('order')
  // Der Befehl gibt **Zeilen** zurück, keine formatierte Fläche — wie jeder Befehl in diesem Projekt.
  const zeilen = befehl?.run([], { speak: () => {}, refresh: () => {} }) ?? []
  expect(zeilen.length).toBeGreaterThan(10)
  expect(zeilen.join('\n')).toContain('Projekt-Stack')

  // Die Prüfung muss **Inhalt** prüfen, nicht Vorhandensein: „der Auftrag ist da" wäre wertlos.
  const bericht = plugin.healthChecks?.[0]?.()
  expect(bericht?.ok).toBe(true)
  expect(bericht?.message).toContain('4 Teilen')
})

test('die Chat-Sprache ist auf das Noetigste geschrumpft', async () => {
  const { de } = await import('../src/locales/de')
  const chatKeys = Object.keys(de.messages).filter((k) => k.startsWith('chat.'))
  // Sechs Schlüssel: Zustand, Knopf, drei Platzhaltertexte, und der Eintrag der Insel.
  expect(chatKeys.length, `zu viele chat-Schlüssel: ${chatKeys.join(', ')}`).toBeLessThanOrEqual(8)
  // Und die Schlüssel der entfernten Implementierung sind wirklich weg.
  for (const weg of ['chat.send', 'chat.placeholder', 'chat.newSession', 'chat.group.workspaces']) {
    expect(weg in de.messages, `„${weg}" steht noch im Paket`).toBe(false)
  }
})
