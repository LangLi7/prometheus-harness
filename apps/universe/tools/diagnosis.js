/**
 * **Lädt die Anwendung frisch und sagt, ob sie hochkommt.**
 *
 * **Warum dieses Werkzeug.** Der Betreiber hat einen **leeren Bildschirm** gesehen, im Zustand standen
 * „—" bei Leistung, Ansicht und Sprache — also läuft der Start nicht durch. Ein leeres Bild kann
 * hundert Ursachen haben, und ein Bild zeigt nur **dass** etwas fehlt.
 *
 * Deshalb wird hier alles gesammelt, was eine Ursache benennen kann:
 *
 *   - **Konsolenmeldungen und Ausnahmen** (`Log.enable`, `Runtime.exceptionThrown`, `Runtime.consoleAPICalled`)
 *   - **Die Marke der Hülle**: Ist `#screen-os` da, hat sie `hidden`, ist das Canvas gross?
 *   - **Die Pixel des Canvas**: nicht lesbar, schwarz, oder gezeichnet?
 *   - **Der Zustandstext**: was steht in der Kopfzeile und im Zustandsbereich?
 *
 * Aufruf:  bun tools/diagnosis.js [room]
 */
const RAUM = Bun.argv[2] ?? `diag-${Date.now().toString(36)}`
const PORT = Number(process.env.CDP_PORT ?? 9223)
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

const seite = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(seite.webSocketDebuggerUrl)
await new Promise((f) => ws.addEventListener('open', f))

/** Alle Ereignisse mitschreiben, die die Anwendung meldet. */
const ereignisse = []
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
      // Ereignisse ohne `id` sind Meldungen des Browsers.
      if (d.method === 'Runtime.exceptionThrown') {
        const a = d.params?.exceptionDetails
        ereignisse.push(`AUSNAHME: ${a?.exception?.description ?? a?.text ?? '—'}`)
      }
      if (d.method === 'Runtime.consoleAPICalled') {
        const text = (d.params?.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ')
        ereignisse.push(`konsole.${d.params?.type}: ${text}`)
      }
      if (d.method === 'Log.entryAdded') {
        const e2 = d.params?.entry
        ereignisse.push(`log.${e2?.level} (${e2?.source}): ${e2?.text}`)
      }
    }
    ws.addEventListener('message', horcher)
    ws.send(JSON.stringify({ id, method, params }))
  })
const warte = (ms) => new Promise((f) => setTimeout(f, ms))

await ruf('Runtime.enable')
// `Log.enable` ist die Quelle für Netzwerk- und Ladefehler — ohne sie fehlt die Hälfte.
await ruf('Log.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await ruf('Page.navigate', { url: URL_APP })
await warte(4500)

const bericht = `(() => {
  const os = document.getElementById('screen-os');
  const canvas = document.getElementById('world');
  const text = (wahl) => { const e = document.querySelector(wahl); return e ? e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) : 'FEHLT' }
  /*
   * **Der Zustand wird Feld für Feld gelesen.**
   *
   * „Der Zustand zeigt —" heisst: die Felder tragen noch ihren **Anfangswert aus dem HTML**
   * (\`<td id="sFps">—</td>\`). Das ist ein anderer Befund als „die Felder fehlen": es heisst, dass
   * \`updateReadouts()\` sie nie ersetzt hat — und damit, dass der Bildlauf **nicht läuft**. Ohne die
   * einzelnen Felder ist „zeigt —" nicht zu deuten.
   */
  const felder = {}
  for (const id of ['sMode', 'sFps', 'sRoom', 'sPlugins', 'sLang', 'sLevel', 'sDist', 'sFocus']) {
    const e = document.getElementById(id)
    felder[id] = e ? e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 24) : 'FEHLT'
  }
  return JSON.stringify({
    ansicht: ['screen-chat','screen-web','screen-os'].filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') }).join(',') || 'KEINE',
    osVersteckt: os ? os.classList.contains('hidden') : 'kein Element',
    canvas: canvas ? Math.round(canvas.getBoundingClientRect().width) + 'x' + Math.round(canvas.getBoundingClientRect().height) : 'FEHLT',
    kopf: text('#hudLine'),
    island: text('#isl .mini'),
    beschriftungen: document.querySelectorAll('.label').length,
    felder,
  });
})()`
const stand = await ruf('Runtime.evaluate', { expression: bericht, returnByValue: true })

/*
 * **Und läuft die Schleife? Zweimal messen.**
 *
 * Ein Standbild sagt nichts darüber, ob sich etwas bewegt. Zwei Bilder im Abstand einer Sekunde sagen
 * es: unterscheiden sie sich, läuft der Bildlauf. Sind sie gleich, steht er — und dann ist jede
 * Aussage über „was man sieht" eine Aussage über ein **Standbild**.
 */
const schuss1 = await ruf('Page.captureScreenshot', { format: 'png' })
await warte(1000)
const schuss2 = await ruf('Page.captureScreenshot', { format: 'png' })
const gleich = schuss1.result?.data === schuss2.result?.data

console.log(`Raum: ${RAUM}`)
console.log(`Zustand: ${stand.result?.result?.value ?? JSON.stringify(stand).slice(0, 400)}`)
console.log(`Bildlauf: ${gleich ? 'STEHT (zwei Aufnahmen in 1 s sind identisch)' : 'läuft (zwei Aufnahmen unterscheiden sich)'}`)
console.log('')
console.log(`Meldungen (${ereignisse.length}):`)
for (const e of ereignisse.slice(0, 25)) console.log(`  ${e}`)
if (ereignisse.length === 0) console.log('  (keine)')

const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
await Bun.write(`${import.meta.dirname}/diagnosis.png`, Buffer.from(schuss.result.data, 'base64'))
console.log('')
console.log('Bild: tools/diagnosis.png')
ws.close()
process.exit(0)
