/**
 * Belegt einen Port — für den Test der Startup-Methodik.
 *
 * **Warum das eine eigene Datei ist und kein `bun -e`-Einzeiler.** Der erste
 * Versuch nutzte `bun -e "Bun.serve({...})"` mit umgeleiteter Ausgabe — und der
 * Halter belegte den Port **nicht**. Ergebnis: der Test meldete in allen drei
 * Fällen „Port ist frei", also **prüfte er nichts**. Genau die Art grüner Test,
 * die schlimmer ist als keiner (Register, `docs/status/README.md`).
 *
 * Diese Datei macht es ausdrücklich und prüfbar: sie öffnet einen **echten
 * TCP-Listener**, gibt aus, dass sie lauscht, und bleibt.
 *
 * Aufruf:  bun scripts/port-halter.mjs <port>
 * Beenden: Strg+C oder Prozess beenden.
 */

import { createServer } from 'node:net'

const port = Number.parseInt(process.argv[2] ?? '', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('Aufruf: bun scripts/port-halter.mjs <port>\n')
  process.exit(2)
}

const host = process.argv[3] ?? '127.0.0.1'
const server = createServer((socket) => {
  // Wer sich verbindet, bekommt eine Zeile und wird geschlossen. Der Halter ist
  // kein Dienst — er hält nur den Port.
  socket.end('belegt\n')
})

server.once('error', (error) => {
  process.stderr.write(`halter: FEHLER beim Binden von ${host}:${port}: ${error.code ?? error.message}\n`)
  process.exit(1)
})

server.listen({ port, host, exclusive: true }, () => {
  // **Diese Zeile ist der Nachweis.** Sie erscheint nur, wenn der Port wirklich
  // gehalten wird — der Test wartet darauf.
  process.stdout.write(`halter: lauscht auf ${host}:${port}\n`)
})

// Am Leben bleiben, bis jemand den Prozess beendet.
process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
