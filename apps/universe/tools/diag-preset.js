/**
 * **Läuft ein Vorbelegungs-Skript vor der Anwendung — oder nicht?**
 *
 * Diese Frage hat drei Werkzeuge in die Irre geführt, deshalb wird sie einmal sauber beantwortet.
 * Das Skript setzt eine **Marke** und einen Abstand, dann wird nachgesehen, was angekommen ist.
 *
 * Aufruf:  bun tools/diag-preset.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `diag-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

const seite = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(seite.webSocketDebuggerUrl)
await new Promise((f) => ws.addEventListener('open', f))
let laufend = 0
const ruf = (method, params = {}) =>
  new Promise((fertig) => {
    const id = ++laufend
    const horcher = (e) => {
      const d = JSON.parse(e.data)
      if (d.id === id) {
        ws.removeEventListener('message', horcher)
        fertig(d)
      }
    }
    ws.addEventListener('message', horcher)
    ws.send(JSON.stringify({ id, method, params }))
  })
const warte = (ms) => new Promise((f) => setTimeout(f, ms))

await ruf('Runtime.enable')
/*
 * **`Page.enable` — und genau das hat gefehlt.**
 *
 * `Page.addScriptToEvaluateOnNewDocument` gehört zur `Page`-Domäne. Ohne `Page.enable` wird der
 * Aufruf zwar mit einer `identifier` beantwortet — er sieht erfolgreich aus —, aber das Skript wird
 * **nie ausgeführt**. Gemessen: die Marke, die es setzen sollte, war `null`.
 *
 * Das ist die unangenehmste Sorte Fehler: eine Antwort ohne Wirkung. Drei Werkzeuge haben daran
 * geglaubt, den Kamerazustand setzen zu können.
 */
await ruf('Page.enable')
await ruf('Page.navigate', { url: 'about:blank' })
await warte(300)

const quelle = `
  try {
    localStorage.setItem('${`prometheus.${RAUM}.world.v1`}', JSON.stringify({
      camera: { focus: [0, 0, 0], distance: 573440, orientation: [0, 0, 0, 1] }, mode: 'os',
    }));
    localStorage.setItem('marke.gelaufen', 'ja');
  } catch (e) { localStorage.setItem('marke.fehler', String(e)); }
`
const eing = await ruf('Page.addScriptToEvaluateOnNewDocument', { source: quelle })
console.log(`Skript eingehängt: ${JSON.stringify(eing.result)}`)

await ruf('Page.navigate', { url: URL_APP })
await warte(3500)

const stand = await ruf('Runtime.evaluate', {
  expression: `JSON.stringify({
    marke: localStorage.getItem('marke.gelaufen'),
    fehler: localStorage.getItem('marke.fehler'),
    abstand: (JSON.parse(localStorage.getItem('${`prometheus.${RAUM}.world.v1`}') || 'null') || {}).camera?.distance,
    hud: (document.getElementById('hudLine') || {}).textContent,
  })`,
  returnByValue: true,
})
console.log(`Ergebnis: ${stand.result?.result?.value ?? JSON.stringify(stand)}`)
ws.close()
process.exit(0)
