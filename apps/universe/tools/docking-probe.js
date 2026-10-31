/**
 * **Ein echter Zug mit der Maus — vom Anfassen bis zum Ausrichten.**
 *
 * ── Warum ein eigener Werkzeugkasten dafuer ────────────────────────────────────────────
 *
 * `tools/dock-stations.js` rechnet: es fragt `zoneAt` und `stationPlacement` und zeigt, was **heraus**
 * kaeme. Das beweist die Regel, aber nicht den **Weg**: ob die Vorschau erscheint, ob sie der Zeigerlage
 * folgt, ob die markierte Stelle stimmt, ob das Panel danach wirklich dort liegt und ob Nachbarn sich
 * ausrichten.
 *
 * Dieses Werkzeug geht den Weg. Es bewegt die **echte Maus** ueber `Input.dispatchMouseEvent` — nicht
 * `dispatchEvent` im Seitenkontext. Der Unterschied ist wesentlich: `setPointerCapture`, `pointerdown` →
 * `pointermove` → `pointerup` und die Bindung an `window` verhalten sich bei synthetischen Ereignissen
 * anders als bei echten, und eine Pruefung, die den Weg nicht geht, bestaetigt nur die halbe Sache.
 *
 * ── Was gemessen wird ──────────────────────────────────────────────────────────────────
 *
 *   1. **Loslassen in der Mitte** → schwebt. Vorher steckte es dort ab und verschwand.
 *   2. **Loslassen ueber der Insel** → abgesteckt.
 *   3. **Loslassen neben der Insel** → schwebt (nicht abgesteckt, obwohl „oben").
 *   4. **Die Vorschau** → waehrend des Zugs sichtbar, und **nur** die gemeinte Stelle ist hervorgehoben.
 *   5. **Nach dem Loslassen** → keine Marken mehr im Bild.
 *
 * Aufruf:  bun tools/docking-probe.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `zug-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

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
  if (r.result?.exceptionDetails) return `FEHLER: ${r.result.exceptionDetails.text}`
  return String(r.result?.result?.value ?? '—')
}

/** Die echte Maus: bewegen, druecken, loslassen. */
const maus = (typ, x, y, buttons = 0) =>
  ruf('Input.dispatchMouseEvent', {
    type: typ,
    x: Math.round(x),
    y: Math.round(y),
    button: 'left',
    buttons,
    clickCount: typ === 'mousePressed' ? 1 : 0,
    pointerType: 'mouse',
  })

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

/*
 * **In die Welt schalten und das Suchpanel oeffnen.**
 *
 * Ueber die Insel, denn sie ist die Navigation. Ein Panel in der linken Zone ist der beste
 * Ausgangspunkt: sein Kopf sitzt weit oben links, also weit weg von der unteren Stelle — der Zug nach
 * unten ist damit ein weiter Weg mit vielen Zwischenlagen, und genau die sollen gemessen werden.
 */
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  r(document.querySelector('#isl .mini'), 'click');
  r([...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os'), 'click');
  return 'ok';
})()`)
await warte(900)
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  r(document.querySelector('#isl .mini'), 'click');
  return 'ok';
})()`)
await warte(500)
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const k = [...document.querySelectorAll('#isl [data-panel-toggle]')].find((e) => (e.textContent || '').includes('Suche'));
  if (k) k.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return 'ok';
})()`)
await warte(900)

/**
 * **Der Griff — vor JEDEM Zug neu geholt.**
 *
 * Das Panel wandert: nach dem ersten Zug ist es **schwebend** und liegt bei 812 / 429, nicht mehr bei
 * 8 / 21. Ein einmal gemessener Griff zeigt danach ins Leere, `mousePressed` trifft nichts, und der Zug
 * wird zu einem Klick auf die Welt. Der erste Anlauf dieses Werkzeugs hat genau das gemessen: drei
 * Zuege, die alle „schwebend" ergaben — nicht weil die Regel falsch war, sondern weil der Zeiger das
 * Panel nicht mehr traf.
 */
const griffJetzt = async () =>
  JSON.parse(await js(`(() => {
    const p = document.querySelector('.panel[data-panel]');
    if (!p) return JSON.stringify({ fehlt: true });
    const k = p.querySelector('.panelhead');
    const r = k.getBoundingClientRect();
    return JSON.stringify({ id: p.dataset.panel, x: Math.round(r.left + 8), y: Math.round(r.top + Math.round(r.height / 2)) });
  })()`))

const erst = await griffJetzt()
if (erst.fehlte) {
  console.log('ABBRUCH: kein Panel gefunden — ohne Panel gibt es nichts zu ziehen.')
  console.log('Ist das Suchpanel geoeffnet? Pruefe `tools/panels.js`.')
  process.exit(1)
}

const lage = async () =>
  JSON.parse(await js(`(() => {
    const l = window.__prometheusDock.layout().panels.map((p) => ({ id: p.id, zone: p.zone, x: Math.round(p.floating.x), y: Math.round(p.floating.y), w: Math.round(p.floating.w), h: Math.round(p.floating.h) }));
    return JSON.stringify({
      panels: l,
      marken: [...document.querySelectorAll('#dockhost .dockstelle')].map((m) => ({ stelle: m.dataset.dockstation, aktiv: m.dataset.aktiv === 'ja' })),
    });
  })()`))

const zoneVon = async (id) => (await lage()).panels.find((p) => p.id === id)?.zone ?? '?'

/** Ein Zug: anfassen, in Schritten bewegen (Zwischenlagen messen), loslassen. */
async function ziehen(zielX, zielY, beschriftung) {
  const griff = await griffJetzt()
  if (griff.fehlte) return { beschriftung, gesehen: [], zone: 'KEIN PANEL', markenNachher: 0 }
  await maus('mouseMoved', griff.x, griff.y, 0)
  await maus('mousePressed', griff.x, griff.y, 1)
  await ruf('Input.dispatchMouseEvent', { type: 'mouseMoved', x: griff.x, y: griff.y, button: 'left', buttons: 1, pointerType: 'mouse' })
  await warte(120)
  /*
   * **In Schritten bewegen** — sechs Zwischenlagen. Der Weg ist Teil der Messung: eine Vorschau, die nur
   * am Ziel erscheint, waere keine Vorschau.
   */
  const schritte = 6
  const gesehen = []
  for (let i = 1; i <= schritte; i++) {
    const x = griff.x + ((zielX - griff.x) * i) / schritte
    const y = griff.y + ((zielY - griff.y) * i) / schritte
    await maus('mouseMoved', x, y, 1)
    await warte(90)
    const stand = await lage()
    const aktiv = stand.marken.find((m) => m.aktiv)
    gesehen.push({
      i,
      x: Math.round(x),
      y: Math.round(y),
      marken: stand.marken.length,
      aktiv: aktiv ? aktiv.stelle : null,
    })
  }
  await maus('mouseReleased', zielX, zielY, 0)
  await warte(400)
  const nach = await lage()
  const danach = nach.panels.find((p) => p.id === griff.id)
  return { beschriftung, gesehen, zone: danach?.zone, x: danach?.x, y: danach?.y, markenNachher: nach.marken.length }
}

console.log(`Ziehendes Panel: ${erst.id}   Griff beim ersten Zug bei ${erst.x} / ${erst.y}`)
console.log('')

const faelle = [
  ['Mitte (schwebt)', 820, 450, 'floating'],
  ['ueber der Insel (steckt ab)', 532, 35, 'closed'],
  ['neben der Insel, oben (schwebt)', 532, 250, 'floating'],
  ['an der linken Stelle', 40, 450, 'left'],
]

let falsch = 0
for (const [name, x, y, erwartet] of faelle) {
  const r = await ziehen(x, y, name)
  const stimmt = r.zone === erwartet
  if (!stimmt) falsch++
  console.log(`${stimmt ? 'ok  ' : 'FEHL'} ${name.padEnd(34)} → ${String(r.zone).padEnd(9)} (erwartet ${erwartet})`)
  const mitMarke = r.gesehen.filter((g) => g.marken > 0)
  const aktiv = [...new Set(r.gesehen.map((g) => g.aktiv).filter(Boolean))]
  console.log(`      Vorschau: ${mitMarke.length}/${r.gesehen.length} Zwischenlagen hatten Marken, hervorgehoben: ${aktiv.length ? aktiv.join(', ') : '—'}`)
  console.log(`      nach dem Loslassen: ${r.markenNachher} Marken im Bild, Lage ${r.x} / ${r.y}`)
}

console.log('')
console.log(falsch === 0 ? 'Alle vier Faelle landen dort, wo sie sollen.' : `${falsch} von vier Faellen landen falsch.`)
console.log('Lesehilfe: „Mitte" muss schweben — vorher steckte es dort ab und verschwand.')
console.log('           „neben der Insel" darf NICHT abstecken: die Insel faengt nur in ihrem eigenen Band ab.')

ws.close()
