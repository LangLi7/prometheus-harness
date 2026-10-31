/**
 * **Was steht beim ersten Bild in der Adressleiste — Abstand, Ebene, Sonnengrösse?**
 *
 * **Warum dieses Werkzeug.** Der Betreiber hat zweimal „sieht immer noch so beschissen aus" gemeldet,
 * und mein Bild sah danach **anders** aus als seins: bei mir füllte die Sonne den Bildschirm
 * („Ebene Kleinkörper · 240,5"). Diese Datei misst den Zustand, den die Anwendung **wirklich** hat —
 * Abstand, Fokus, Bezugsebene, Kopfzeile und die Pixelgrösse der Sonne.
 *
 * Aufruf:  bun tools/state.js [raum] [abstand]
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = Bun.argv[2] ?? `zustand-${Date.now().toString(36)}`
const ABSTAND = Bun.argv[3] ? Number(Bun.argv[3]) : null
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

await ruf('Runtime.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
if (ABSTAND !== null) {
  await ruf('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem(${JSON.stringify(SCHLUESSEL)}, JSON.stringify({
      camera: { focus: [0, 0, 0], distance: ${ABSTAND}, orientation: [0, 0, 0, 1] }, mode: 'os' })); } catch (e) {}`,
  })
}
await ruf('Page.navigate', { url: URL_APP })
await warte(1200)

/** Zu mehreren Zeitpunkten messen — der erste Bildlauf ändert den Abstand. */
for (const ms of [0, 1200, 1500]) {
  if (ms) await warte(ms)
  const stand = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const p = JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null');
      const lbl = [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none');
      return JSON.stringify({
        t: ${ms},
        abstand: p ? Math.round(p.camera.distance) : null,
        fokus: p ? p.camera.focus.map((n) => Math.round(n)) : null,
        kopf: (document.getElementById('hudLine') || {}).textContent,
        namen: lbl.map((l) => l.textContent.trim()),
      });
    })()`,
    returnByValue: true,
  })
  console.log(String(stand.result?.result?.value ?? '—'))
}

/*
 * **Und die Sonne in Pixeln.** Der Bildschirmabstand zweier Punkte auf dem Sonnenrand ist die einzige
 * Grösse, die den Betreiber wirklich interessiert — deshalb wird sie gemessen und nicht gerechnet.
 */
const groesse = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const c = document.getElementById('world');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const w = c.width, h = c.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // Helle Pixel zählen — die Sonne ist der einzige helle Körper.
    let links = w, rechts = 0, oben = h, unten = 0, anzahl = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = (px[i] + px[i+1] + px[i+2]) / 3;
        if (v > 60) {
          anzahl++;
          if (x < links) links = x;
          if (x > rechts) rechts = x;
          if (y < oben) oben = y;
          if (y > unten) unten = y;
        }
      }
    }
    return JSON.stringify({
      hellePixel: anzahl,
      kasten: rechts > links ? [rechts - links + 1, unten - oben + 1] : null,
      anteilBildhoehe: rechts > links ? Math.round((100 * (unten - oben + 1)) / h) + '%' : null,
    });
  })()`,
  returnByValue: true,
})
console.log(`Sonne im Bild: ${groesse.result?.result?.value}`)
/*
 * **Und der Dock-Zustand — welche Panels offen sind.**
 *
 * Der Betreiber: „**immer noch da**", mit Bildern von Suche, Zustand und der Leiste. Die Voreinstellung
 * ist geändert (alle `closed`), aber der **gespeicherte** Zustand liegt in `localStorage` und gewinnt
 * gegen jede Voreinstellung — genau wie beim Kamerastand. Ohne diese Zeile ist „ist es behoben?" nicht
 * zu beantworten.
 */
const dock = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const schluessel = Object.keys(localStorage).filter((k) => k.includes('.dock.'));
    const aus = {};
    for (const k of schluessel) {
      try {
        const p = JSON.parse(localStorage.getItem(k));
        aus[k] = (p.panels || []).map((x) => x.id + '=' + x.zone).join(', ');
      } catch { aus[k] = 'unlesbar' }
    }
    return JSON.stringify(aus);
  })()`,
  returnByValue: true,
})
console.log(`Dock-Ablage: ${dock.result?.result?.value}`)

const sichtbar = await ruf('Runtime.evaluate', {
  expression: `JSON.stringify([...document.querySelectorAll('.zone')].map((z) => z.dataset.zone + '=' + getComputedStyle(z).display))`,
  returnByValue: true,
})
console.log(`Zonen: ${sichtbar.result?.result?.value}`)

ws.close()
process.exit(0)
