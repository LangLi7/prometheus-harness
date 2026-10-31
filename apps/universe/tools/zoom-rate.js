/**
 * **Wie fein zoomt das Rad? — gemessen mit echten Radereignissen.**
 *
 * Der Betreiber: „**die ebene und zoom ist zu schnelle wechseln da kann man nicht einmal reinzoomen wie
 * man es will ohne das es groesser wird oder kleiner, wir sollten evt die reichweite bis zur ebene
 * wechseln anpassen oder so**".
 *
 * ── Warum mit dem Rad und nicht gerechnet ─────────────────────────────────────────────────
 *
 * `tools/_zoom.ts` rechnet die Zahl aus (`ln(4) / (1,2 · ln(faktor))`). Das ist die **Vorhersage**.
 * Ob sie stimmt, hängt an einer Annahme, die man leicht falsch trifft: wie viele Rastschritte ein
 * **echtes** Radereignis ergibt. `main.ts` rechnet `-deltaY / 100`, aber `deltaY` kommt vom Browser —
 * bei einer Maus sind es 120, bei einem Touchpad andere Werte, und Chrome kann es glätten.
 *
 * Dieses Werkzeug dreht deshalb das **echte** Rad und zählt nach: wie viele Ereignisse braucht es, bis
 * die Ebene wechselt. Vorher (Faktor 1,25): **5** Ereignisse. Ziel: **rund 10**.
 *
 * Aufruf:  bun tools/zoom-rate.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)

const seite = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
).json()
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
const js = async (e) => String((await ruf('Runtime.evaluate', { returnByValue: true, expression: e })).result?.result?.value)

await ruf('Runtime.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await ruf('Page.navigate', { url: `http://127.0.0.1:3081/universe/?room=zoom-rate-${Date.now().toString(36)}` })
await warte(4500)

const da = await js(`typeof window.__prometheusKamera === 'object'`)
if (da !== 'true') {
  console.log('ABBRUCH: window.__prometheusKamera fehlt — die Ansicht ist nicht geladen.')
  process.exit(1)
}

/** Ein echtes Radereignis, wie es eine Maus schickt. */
const rad = async (richtung) => {
  await ruf('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 720,
    y: 450,
    deltaX: 0,
    deltaY: richtung * 120,
    pointerType: 'mouse',
  })
  await warte(90)
}

const stand = async () =>
  JSON.parse(await js(`JSON.stringify({ abstand: window.__prometheusKamera.distance(), ebene: window.__prometheusKamera.level() })`))

/*
 * **Von einer Ebenenmitte aus nach aussen drehen und mitzählen.**
 *
 * Die Mitte ist der richtige Startpunkt: dort ist der Abstand am weitesten von beiden Bandgrenzen
 * entfernt, also ist die Zählung nicht von der Startlage abhängig.
 */
console.log('Zoomtakt des Mausrads — echte Radereignisse, Ebene fuer Ebene')
console.log('')
console.log('  Start          Ebene  Ereignisse bis zum Ebenenwechsel   Abstand danach')
console.log('  ' + '─'.repeat(84))

const ereignisse = []
for (const startEbene of [1, 3, 4, 6, 8, 10]) {
  await js(`window.__prometheusKamera.setLevel(${startEbene})`)
  await warte(350)
  const vorher = await stand()
  let gezaehlt = 0
  let erreicht = vorher.ebene
  // Hoechstens 40 Ereignisse — sonst stimmt etwas nicht und die Schleife soll nicht hängen.
  while (erreicht === vorher.ebene && gezaehlt < 40) {
    await rad(1)
    gezaehlt++
    erreicht = (await stand()).ebene
  }
  const nachher = await stand()
  ereignisse.push(gezaehlt)
  console.log(
    `  Ebene ${String(startEbene).padStart(2)}       ${String(vorher.ebene).padStart(5)}  ${String(gezaehlt).padStart(32)}   ${Math.round(nachher.abstand)}`,
  )
}

const mittel = ereignisse.reduce((a, b) => a + b, 0) / ereignisse.length
const kleinste = Math.min(...ereignisse)

console.log('')
console.log(`Ereignisse je Ebenenwechsel: Mittel ${mittel.toFixed(1)}   kleinste ${kleinste}`)
console.log('')
/*
 * **Das Urteil: mindestens acht.** Der Betreiber will „einmal reinzoomen wie man es will" — mit fünf
 * Ereignissen ist man durch, mit zehn kann man in der Stufe arbeiten. Acht ist die Untergrenze, bei der
 * das Gefühl kippt; gemessen waren es vorher **5**.
 */
if (kleinste >= 8) {
  console.log(`Der Takt ist fein genug: auch der kürzeste Wechsel braucht ${kleinste} Radereignisse.`)
} else {
  console.log(`Noch zu schnell: der kürzeste Wechsel braucht nur ${kleinste} Radereignisse (Ziel: mindestens 8).`)
}
console.log('')
console.log('Lesehilfe: „Ereignisse bis zum Ebenenwechsel" ist die Zahl, die der Betreiber spürt. Sie')
console.log('           hängt an `ZOOM_FACTOR_PER_NOTCH` in `camera.ts` und an `deltaY` des Browsers.')

ws.close()
