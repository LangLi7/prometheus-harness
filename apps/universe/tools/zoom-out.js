/**
 * **Ganz herauszoomen und nachsehen, was übrig bleibt.**
 *
 * **Warum dieses Werkzeug.** Der Betreiber: „**es ist immer noch eine sonne obwohl ich ultra weit weg
 * bin sollte da keine universum werden als maxout**". Die Prüfung dafür ist nicht der Code, sondern
 * das **Bild nach dem Herauszoomen** — und der Weg dorthin ist das **Rad**, nicht ein gesetzter Wert.
 *
 * Deshalb zoomt dieses Werkzeug wie ein Nutzer: lauter Radereignisse nach aussen, dann wird gemessen,
 * welche Ebene steht und welche Namen zu sehen sind.
 *
 * Aufruf:  bun tools/zoom-out.js [schritte]
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const SCHRITTE = Number(Bun.argv[2] ?? 40)
const RAUM = `raus-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`
const SCHLUESSEL = `prometheus.${RAUM}.world.v1`

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
const js = async (expression) => {
  const r = await ruf('Runtime.evaluate', { expression, returnByValue: true })
  return String(r.result?.result?.value ?? '—')
}

await ruf('Runtime.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await ruf('Page.navigate', { url: URL_APP })
await warte(3500)

// In die Welt schalten.
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  r(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  r(welt, 'click');
  return 'ok';
})()`)
await warte(1200)

const zustand = async () => {
  const r = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const p = JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null');
      const lbl = [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none');
      return JSON.stringify({
        abstand: p ? Math.round(p.camera.distance) : null,
        kopf: (document.getElementById('hudLine') || {}).textContent,
        namen: lbl.map((l) => l.textContent.trim()),
      });
    })()`,
    returnByValue: true,
  })
  return JSON.parse(String(r.result?.result?.value ?? '{}'))
}

/*
 * **Erst prüfen, ob das Rad überhaupt ankommt.**
 *
 * „Nach 12 Radzügen unverändert" ist ein Befund mit zwei möglichen Ursachen: das Ereignis erreicht den
 * Hörcher nicht, oder der Hörcher rechnet nicht. Ein **mitgeschriebener** Hörcher unterscheidet die
 * beiden — er sieht `deltaY` und den Abstand **vor** und **nach** der Anwendung.
 */
await js(`(() => {
  window.__rad = [];
  const lies = () => {
    try { return JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)})).camera.distance } catch { return null }
  };
  window.addEventListener('wheel', (e) => {
    window.__rad.push({ deltaY: e.deltaY, notches: -e.deltaY / 100, vorher: lies() });
  }, true);
  return 'Horcher steht';
})()`)

console.log(`Start: ${JSON.stringify(await zustand())}`)
console.log('')

/*
 * **Rad für Rad nach aussen** — mit echten Ereignissen auf das Element, das sie empfängt.
 */
for (let i = 0; i < SCHRITTE; i += 4) {
  await js(`(() => {
    const el = document.elementsFromPoint(600, 300).find((e) => getComputedStyle(e).pointerEvents !== 'none');
    for (let k = 0; k < 4; k++) {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true, clientX: 600, clientY: 300 }));
    }
    return 'ok';
  })()`)
  await warte(220)
  const z = await zustand()
  console.log(`nach ${i + 4}: ${JSON.stringify(z)}`)
}

/*
 * **Und ein Bild vom Ende** — die Zahl „keine Sonne" ist ein Befund, das Bild ist der Beweis.
 */
const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
await Bun.write(
  `${import.meta.dirname}/zoomed-out.png`,
  Buffer.from(schuss.result.data, 'base64'),
)
console.log('')
console.log('Bild: tools/zoomed-out.png')
