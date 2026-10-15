/**
 * Tests für die Portwahl — gegen **echte** Sockets, nicht gegen Attrappen.
 *
 * **Warum echte Sockets.** Die ganze Frage ist „kann ich diesen Port binden?" —
 * eine Attrappe würde genau das nicht beantworten. Also wird in diesen Tests ein
 * echter Listener geöffnet, der Port als belegt geprüft und danach geschlossen.
 * Das ist schnell (Millisekunden) und prüft die Wirklichkeit.
 *
 * **Der Test, auf den es ankommt:** der Standardport ist belegt, und die Wahl
 * weicht aus — **und sagt, warum**.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { createServer } from 'node:net'
import { canBind, choosePort, describePortChoice, isPortFree, portFromEnv } from '../port-wahl.mjs'

/** Ein echter Listener auf einem Port; gibt ihn und eine Schließfunktion zurück. */
async function occupy(port, host = '127.0.0.1') {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ port, host, exclusive: true }, resolve)
  })
  return { server, close: () => new Promise((resolve) => server.close(resolve)) }
}

/** Sucht einen freien Port, indem geprobt wird — ohne Annahmen über den Wirt. */
async function findFreeBase() {
  for (let port = 5700; port < 5750; port += 1) {
    if (await isPortFree(port)) return port
  }
  throw new Error('Kein freier Testport gefunden')
}

/** Alle Listener, die ein Test geöffnet hat — damit keiner offen bleibt. */
const open = []
afterEach(async () => {
  while (open.length > 0) {
    const entry = open.pop()
    await entry.close().catch(() => undefined)
  }
})

describe('Port binden statt fragen', () => {
  test('ein freier Port lässt sich binden', async () => {
    const base = await findFreeBase()
    expect(await canBind(base, '127.0.0.1')).toBe(true)
  })

  test('ein belegter Port lässt sich NICHT binden', async () => {
    const base = await findFreeBase()
    const held = await occupy(base)
    open.push(held)
    // **Der Kern der Methodik.** Nicht „prüfen, ob wer antwortet" — sondern
    // „kann ich ihn halten".
    expect(await canBind(base, '127.0.0.1')).toBe(false)
  })

  test('isPortFree prüft beide Adressfamilien', async () => {
    const base = await findFreeBase()
    expect(await isPortFree(base)).toBe(true)
    const held = await occupy(base)
    open.push(held)
    expect(await isPortFree(base)).toBe(false)
  })

  test('ein belegter Port lässt sich nach dem Schließen wieder binden', async () => {
    const base = await findFreeBase()
    const held = await occupy(base)
    expect(await canBind(base, '127.0.0.1')).toBe(false)
    await held.close()
    expect(await canBind(base, '127.0.0.1')).toBe(true)
  })

  test('Port 0 laesst sich binden — und genau deshalb darf er nie gewaehlt werden', async () => {
    // **Eigener Denkfehler, den dieser Test gefunden hat.** In TCP ist Port 0
    // keine Adresse, sondern die **Aufforderung an das Betriebssystem, irgendeinen
    // freien Port zu vergeben**. `listen({port: 0})` gelingt deshalb **immer** —
    // der Port wird erst beim Binden zugeteilt.
    //
    // Die erste Fassung dieses Tests erwartete `false` und schlug fehl. Richtig
    // ist: `canBind(0, ...)` ergibt `true`, und das ist die **Gefahr**. Ein Start
    // auf Port 0 funktioniert, aber **niemand weiss danach, wo** — die Ausgabe
    // zeigt "0", und ein Browser kann sich nicht verbinden. Genau deshalb lehnt
    // `choosePort` die 0 ab (siehe der Test unten) und gibt **nie** einen
    // zufaelligen Port zurück.
    expect(await canBind(0, '127.0.0.1')).toBe(true)
  })

  test('ein Port ausserhalb des gueltigen Bereichs ergibt false statt eines Wurfs', async () => {
    // Ein Wurf hier wuerde den Start abbrechen — die Pruefung soll nur "nein"
    // sagen koennen.
    expect(await canBind(70000, '127.0.0.1')).toBe(false)
    expect(await canBind(-1, '127.0.0.1')).toBe(false)
  })
})

describe('Portwahl', () => {
  test('nimmt den gewünschten Port, wenn er frei ist', async () => {
    const base = await findFreeBase()
    const choice = await choosePort(base)
    expect(choice.port).toBe(base)
    expect(choice.changed).toBe(false)
    expect(choice.occupied).toEqual([])
    expect(choice.tried).toEqual([base])
  })

  test('weicht aus, wenn der gewünschte Port belegt ist', async () => {
    const base = await findFreeBase()
    const held = await occupy(base)
    open.push(held)

    const choice = await choosePort(base)
    expect(choice.changed).toBe(true)
    expect(choice.port).not.toBe(base)
    expect(choice.port).toBeGreaterThan(base)
    // **Und es wird gesagt, welche belegt waren.** Ein ausgewichener Start ohne
    // Begründung ist ein Rätsel für den Benutzer.
    expect(choice.occupied).toEqual([base])
    expect(choice.requested).toBe(base)
  })

  test('nimmt den ersten freien nach mehreren belegten', async () => {
    const base = await findFreeBase()
    const first = await occupy(base)
    open.push(first)
    const second = await occupy(base + 1)
    open.push(second)

    const choice = await choosePort(base)
    expect(choice.port).toBe(base + 2)
    expect(choice.occupied).toEqual([base, base + 1])
    expect(choice.tried).toEqual([base, base + 1, base + 2])
  })

  test('wirft, wenn im ganzen Bereich nichts frei ist — statt zu raten', async () => {
    const base = await findFreeBase()
    for (let offset = 0; offset < 3; offset += 1) {
      open.push(await occupy(base + offset))
    }
    const failure = await choosePort(base, { span: 3 }).catch((cause) => cause)
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toContain('Kein freier Port')
    expect(failure.message).toContain('--port')
  })

  test('lehnt einen unsinnigen Port ab', async () => {
    await expect(choosePort(0)).rejects.toThrow('zwischen 1 und 65535')
    await expect(choosePort(70000)).rejects.toThrow('zwischen 1 und 65535')
    await expect(choosePort(3080.5)).rejects.toThrow('ganze Zahl')
  })

  test('der Bereich kann nicht über 65535 hinauslaufen', async () => {
    // Der letzte gültige Port: die Suche darf nicht über die Grenze laufen.
    const choice = await choosePort(65535).catch((cause) => cause)
    // Entweder frei (dann gewählt) oder belegt (dann geworfen) — aber kein
    // Versuch, 65536 zu binden.
    if (choice instanceof Error) {
      expect(choice.message).toContain('Kein freier Port')
    } else {
      expect(choice.port).toBe(65535)
    }
  })
})

describe('Port aus der Umgebung', () => {
  test('liest eine gültige Zahl', () => {
    expect(portFromEnv('3080', 5199)).toBe(3080)
    expect(portFromEnv(' 4000 ', 5199)).toBe(4000)
  })

  test('fällt bei fehlendem oder unsinnigem Wert auf den Standard zurück', () => {
    expect(portFromEnv(undefined, 5199)).toBe(5199)
    expect(portFromEnv('', 5199)).toBe(5199)
    expect(portFromEnv('abc', 5199)).toBe(5199)
    expect(portFromEnv('0', 5199)).toBe(5199)
    expect(portFromEnv('99999', 5199)).toBe(5199)
  })
})

describe('Die Ausgabe der Portwahl', () => {
  test('nennt den Standardport, wenn er frei ist', () => {
    const line = describePortChoice({ port: 3080, requested: 3080, changed: false, tried: [3080], occupied: [] })
    expect(line).toBe('Port 3080 (Standard) ist frei.')
  })

  test('nennt den gewählten Port UND den belegten — die Begründung gehört dazu', () => {
    const line = describePortChoice({
      port: 3081,
      requested: 3080,
      changed: true,
      tried: [3080, 3081],
      occupied: [3080],
    })
    expect(line).toContain('3080 ist belegt')
    expect(line).toContain('gewählt: 3081')
    expect(line).toContain('belegt: 3080')
  })
})
