/**
 * **Kommt die Anwendung mit einem GEMERKTEN Kamerazustand hoch?**
 *
 * Der Betreiber hat einen **leeren Bildschirm** gesehen, während ein frischer Start einwandfrei läuft.
 * Der einzige Unterschied ist der **gemerkte** Zustand: `loadPersist` liest ihn aus `localStorage`,
 * und die Werkzeuge räumen ihn vorher weg. Also wird hier für eine Reihe von Abständen geprüft, ob die
 * Anwendung hochkommt — der Abstand wird **vor** dem ersten Programmzeiler gesetzt.
 *
 * ── Zwei Fallen, beide gemessen und beide teuer ─────────────────────────────────────────
 *
 * 1. **`Page.enable` ist Pflicht.** Ohne das antwortet `addScriptToEvaluateOnNewDocument` mit einer
 *    `identifier` — es sieht erfolgreich aus — und das Skript läuft **nie**.
 *
 * 2. **Die Registrierung gilt PRO SEITE und bleibt bestehen.** Hier stand zuerst **eine** Seite, die
 *    für jeden Abstand neu geladen wurde. Damit sammelten sich alle Vorbelegungen **derselben** Seite
 *    an, und sie liefen in **Registrierungsreihenfolge** — die letzte gewann. Gemessen war die Folge:
 *    im Speicher stand **140**, im Bild stand die Welt bei **4,8 k** (dem Startblick). Jede Messung
 *    dieser Art war damit ungültig.
 *
 * Deshalb öffnet **jeder** Abstand eine **eigene, frische Seite** und schliesst sie danach. Das ist
 * langsamer und dafür richtig.
 *
 * Aufruf:  bun tools/boot-with-state.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)

/** Die Kandidaten: der Startblick, die Ebenen, die Grenzen und die Extreme. */
const abstaende = [
  4761, // Startblick (Ebene 4)
  573_440, // Ebene 7 (distanceForLevel)
  35_840, // Ebene 5
  140, // Ebene 1 — hier stand der Bildlauf
  0.5, // MIN_DISTANCE
  4_000_000, // MAX_DISTANCE
]

/** Eine frische Seite, ein Vorbelegungs-Skript, ein Messergebnis — dann Seite zu. */
async function messe(abstand) {
  const raum = `boot${Math.round(abstand)}-${Date.now().toString(36)}`
  const url = `http://127.0.0.1:3081/universe/?room=${raum}`

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

  await ruf('Runtime.enable')
  await ruf('Page.enable') // ohne das wirkt die Vorbelegung nicht
  await ruf('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await ruf('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('prometheus.${raum}.world.v1', JSON.stringify({
      camera: { focus: [0, 0, 0], distance: ${abstand}, orientation: [0, 0, 0, 1] }, mode: 'os' })); } catch (e) {}`,
  })
  await ruf('Page.navigate', { url })
  await warte(3200)

  const stand = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const e = (id) => { const x = document.getElementById(id); return x ? x.textContent.replace(/\\s+/g,' ').trim() : 'FEHLT' };
      return JSON.stringify({
        kopf: e('hudLine'), fps: e('sFps'),
        gemerkt: (JSON.parse(localStorage.getItem('prometheus.${raum}.world.v1')||'null')||{}).camera?.distance,
      });
    })()`,
    returnByValue: true,
  })
  const a = await ruf('Page.captureScreenshot', { format: 'png' })
  await warte(800)
  const b = await ruf('Page.captureScreenshot', { format: 'png' })
  const laeuft = a.result?.data !== b.result?.data

  /*
   * **Und das Bild wird behalten, wenn etwas nicht stimmt.**
   *
   * „STEHT" ist ein Befund, aber kein Beweis: es kann ein hängender Bildlauf sein **oder** ein Bild,
   * in dem sich schlicht nichts bewegt (kein Körper sichtbar). Die beiden sind verschieden, und nur
   * ein Blick auf das Bild unterscheidet sie. Deshalb wird bei einem auffälligen Ergebnis abgelegt.
   */
  if (!laeuft || !/fps/.test(String(JSON.parse(stand.result?.result?.value ?? '{}').fps ?? ''))) {
    await Bun.write(
      `${import.meta.dirname}/boot-${Math.round(abstand)}.png`,
      Buffer.from(a.result.data, 'base64'),
    )
  }

  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${seite.id}`)
  return { daten: JSON.parse(stand.result?.result?.value ?? '{}'), laeuft }
}

console.log('gesetzt     Kopfzeile                                   fps        Bildlauf')
console.log('─'.repeat(84))
for (const abstand of abstaende) {
  const { daten, laeuft } = await messe(abstand)
  console.log(
    `${String(abstand).padEnd(11)} ${String(daten.kopf ?? '?').slice(0, 43).padEnd(44)} ` +
      `${String(daten.fps ?? '?').padEnd(10)} ${laeuft ? 'läuft' : 'STEHT'}`,
  )
}
process.exit(0)
