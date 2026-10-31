/**
 * **Ein Zustand, in dem der Bildlauf steht** — festhalten und die Ursache suchen.
 *
 * `tools/boot-with-state.js` hat gemessen, dass die Anwendung bei zwei gemerkten Abständen
 * **stehenbleibt**: bei **140** und bei **0,5** (beide auf der Ebene „Kleinkörper"). Bei 4 761,
 * 35 840, 573 440 und selbst 4 000 000 läuft sie.
 *
 * Ein stehender Bildlauf ist die Ursache, die zum Bild des Betreibers passt: **leeres Canvas,
 * `--- fps`, Zustand auf den Anfangswerten**. Denn ohne Schleife wird `updateReadouts()` nie
 * aufgerufen, und die Felder behalten ihr HTML.
 *
 * Dieses Werkzeug fährt den Zustand an, wartet, und liest dann: Konsolenmeldungen, Ausnahmen, die
 * Felder des Zustands, und ob sich zwei Aufnahmen unterscheiden.
 *
 * Aufruf:  bun tools/hangs.js [abstand]
 */
const ABSTAND = Number(Bun.argv[2] ?? 140)
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `haengt-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

const seite = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
).json()
const ws = new WebSocket(seite.webSocketDebuggerUrl)
await new Promise((f) => ws.addEventListener('open', f))

const meldungen = []
let laufend = 0
const ruf = (method, params = {}) =>
  new Promise((fertig) => {
    const id = ++laufend
    const horcher = (e) => {
      const d = JSON.parse(e.data)
      if (d.id === id) {
        ws.removeEventListener('message', horcher)
        fertig(d)
        return
      }
      if (d.method === 'Runtime.exceptionThrown') {
        const a = d.params?.exceptionDetails
        meldungen.push(`AUSNAHME: ${a?.exception?.description ?? a?.text}`)
      }
      if (d.method === 'Runtime.consoleAPICalled') {
        meldungen.push(
          `konsole.${d.params?.type}: ` +
            (d.params?.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' '),
        )
      }
      if (d.method === 'Log.entryAdded') {
        meldungen.push(`log.${d.params?.entry?.level}: ${d.params?.entry?.text}`)
      }
    }
    ws.addEventListener('message', horcher)
    ws.send(JSON.stringify({ id, method, params }))
  })
const warte = (ms) => new Promise((f) => setTimeout(f, ms))

await ruf('Runtime.enable')
await ruf('Log.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})

/*
 * **Die Ausnahmen aus dem Fenster abholen, nicht nur über CDP.**
 *
 * `Runtime.exceptionThrown` deckt das Meiste ab, aber ein Fehler im `requestAnimationFrame`-Rückruf
 * kann je nach Zeitpunkt auch als `error`-Ereignis am Fenster landen. Beides wird gesammelt — ein
 * stehender Bildlauf ohne Fehlermeldung wäre ein Widerspruch, den man nicht glauben darf.
 */
const horcherQuelle = `(() => {
  window.__meldungen = [];
  window.addEventListener('error', (e) => window.__meldungen.push('error: ' + (e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => window.__meldungen.push('rejection: ' + e.reason));
})()`
await ruf('Page.addScriptToEvaluateOnNewDocument', { source: horcherQuelle })
await ruf('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('prometheus.${RAUM}.world.v1', JSON.stringify({
    camera: { focus: [0, 0, 0], distance: ${ABSTAND}, orientation: [0, 0, 0, 1] }, mode: 'os' })); } catch (e) {}`,
})
await ruf('Page.navigate', { url: URL_APP })
await warte(3500)

const a = await ruf('Page.captureScreenshot', { format: 'png' })
await warte(1000)
const b = await ruf('Page.captureScreenshot', { format: 'png' })
const laeuft = a.result?.data !== b.result?.data

const stand = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const e = (id) => { const x = document.getElementById(id); return x ? x.textContent.replace(/\\s+/g,' ').trim().slice(0,40) : 'FEHLT' };
    return JSON.stringify({
      abstandImSpeicher: (JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1')||'null')||{}).camera?.distance,
      kopf: e('hudLine'), modus: e('sMode'), fps: e('sFps'),
      namen: document.querySelectorAll('.label').length,
      fensterMeldungen: (window.__meldungen || []).slice(0, 6),
      gerufen: typeof requestAnimationFrame,
    });
  })()`,
  returnByValue: true,
})

console.log(`Abstand ${ABSTAND}   Bildlauf: ${laeuft ? 'läuft' : 'STEHT'}`)
console.log(`Zustand: ${stand.result?.result?.value}`)
console.log('')
console.log(`CDP-Meldungen (${meldungen.length}):`)
for (const m of meldungen.slice(0, 12)) console.log(`  ${m}`)
if (meldungen.length === 0) console.log('  (keine)')
ws.close()
process.exit(0)
