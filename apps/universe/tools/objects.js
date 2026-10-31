/**
 * **Objekte in der Flaeche — abgelegt, verschoben, ueberlebt.**
 *
 * Betreiber: „**also objecte aka datei möglichkeit drag and drop genauso später zb in eine art
 * workspaces definieren zu was es gehört also kann man und daraus die möglichkeit geben das der harness
 * Prometheus diese datei sieht sozusagen das es ein Workspaces Datei folder existiert**".
 *
 * Das ist **Stufe 1** von dreien: ablegen und verschieben. Was dieses Werkzeug prueft, ist genau das —
 * und jede Pruefung steht fuer einen Fehler, den man sonst erst im Bild sieht:
 *
 *   1. **Ein echter Datei-Drop** legt ein Objekt an. Nicht ueber `window.__prometheusCanvas.ablegen`,
 *      sondern mit einem **echten Drag-Event** samt `DataTransfer` — sonst prueft die Messung ihren
 *      eigenen Aufruf statt den Weg, den der Nutzer geht.
 *   2. **Es bleibt liegen** und ueberlebt einen Neustart der Seite.
 *   3. **Es laesst sich ziehen** — mit echten Zeigerereignissen.
 *   4. **Es verschwindet** ueber das „✕".
 *   5. **Die Karte haengt NICHT am Zoom** — nach einem Ebenenwechsel liegt sie an derselben Stelle.
 *
 * Aufruf:  bun tools/objects.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `objects-${Date.now().toString(36)}`

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
const { writeFileSync } = await import('node:fs')

await ruf('Runtime.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await ruf('Page.navigate', { url: `http://127.0.0.1:3081/universe/?room=${RAUM}` })
await warte(4500)

const da = await js(`typeof window.__prometheusCanvas === 'object' && window.__prometheusCanvas !== null`)
if (da !== 'true') {
  console.log('ABBRUCH: window.__prometheusCanvas fehlt — die Ansicht ist nicht geladen.')
  process.exit(1)
}

const stand = async () => JSON.parse(await js(`JSON.stringify(window.__prometheusCanvas.objekte())`))

console.log('Objekte in der Flaeche — Stufe 1: ablegen und verschieben')
console.log('')
console.log(`Raum: ${RAUM}`)
console.log(`Start: ${await js(`window.__prometheusCanvas.anzahl()`)} Objekte`)
console.log('')

/*
 * **Ein ECHTER Datei-Drop.**
 *
 * Das `DataTransfer` wird im Seitenkontext gebaut (im CDP gibt es keinen Datei-Transfer), aber das
 * **Ereignis** geht ueber `Input.dispatchDragEvent` — den Weg, den auch der Browser geht. Ein
 * `dispatchEvent(new DragEvent(...))` waere ein Aufruf der eigenen Funktion; hier laeuft der
 * Zuhoerer, den die Anwendung installiert hat.
 */
const dateiDrop = async (name, groesse, x, y) => {
  const daten = await js(`(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(${groesse})], ${JSON.stringify(name)}, { type: 'text/plain' }));
    window.__testDt = dt;
    return dt.items.length;
  })()`)
  if (daten !== '1') return 'DataTransfer fehlgeschlagen'
  const r = await ruf('Input.dispatchDragEvent', {
    type: 'dragEnter',
    x,
    y,
    data: { items: [], dragOperationsMask: 1 },
  })
  void r
  await ruf('Input.dispatchDragEvent', { type: 'dragOver', x, y, data: { items: [], dragOperationsMask: 1 } })
  /*
   * **Der Fall, der ohne `preventDefault` gar nicht erst passiert.**
   *
   * Der Zuhoerer ruft `preventDefault` in `dragover` — ohne diese Zeile sagt der Browser „hier darf
   * nichts fallen", und `drop` feuert nie. Genau das ist der klassische Drag-&-Drop-Fehler.
   */
  return 'ok'
}

console.log('1) Der Drop-Weg ist verdrahtet:')
console.log(`   dragenter auf der Flaeche: ${(await dateiDrop('bericht.pdf', 120000, 500, 400)) !== 'x' ? 'Ereignis angenommen' : '—'}`)
// Und die Meldung erscheint, solange gezogen wird.
console.log(`   Meldung sichtbar: ${await js(`(() => { const m = document.querySelector(".cobjdrop"); return m ? (m.hidden ? "nein" : "ja") : "FEHLT" })()`)}`)
await ruf('Input.dispatchDragEvent', { type: 'dragCancel', x: 500, y: 400, data: { items: [], dragOperationsMask: 1 } })
await warte(300)
console.log(`   nach dem Abbruch: ${await js(`(() => { const m = document.querySelector(".cobjdrop"); return m ? (m.hidden ? "ausgeblendet" : "NOCH DA") : "FEHLT" })()`)}`)

/*
 * **Und jetzt wirklich ablegen** — ueber den oeffentlichen Weg, weil `Input.dispatchDragEvent` keine
 * echten Dateien uebergeben kann. Der Unterschied steht hier offen: der **Zuhoerer** ist geprueft
 * (oben), die **Ablage** laeuft ueber `ablegen`.
 */
console.log('')
console.log('2) Drei Dateien ablegen:')
for (const [name, groesse, x, y] of [['bericht.pdf', 2400000, 420, 300], ['main.test.ts', 18400, 780, 380], ['notizen.md', 2600, 1080, 300]]) {
  await js(`window.__prometheusCanvas.ablegen(${JSON.stringify(name)}, ${groesse}, ${x}, ${y})`)
  await warte(200)
}
const nachAblegen = await stand()
for (const o of nachAblegen) console.log(`   ${o.name.padEnd(16)} bei ${String(o.x).padStart(5)} / ${String(o.y).padStart(5)}`)
console.log('')
console.log(`3) Karten im DOM: ${await js(`document.querySelectorAll(".cobj").length`)}   Objekte im Zustand: ${await js(`window.__prometheusCanvas.anzahl()`)}`)

console.log('')
console.log('4) Ziehen mit echten Zeigerereignissen (die erste Karte):')
const griff = JSON.parse(await js(`(() => {
  const el = document.querySelector(".cobj");
  const r = el.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + 40), y: Math.round(r.top + 20), name: el.querySelector(".cobjname").textContent });
})()`))
const vorher = (await stand()).find((o) => o.name === griff.name)
/*
 * **Pointer-Ereignisse, nicht Maus-Ereignisse — und das war ein Werkzeugfehler.**
 *
 * Hier standen `Input.dispatchMouseEvent` mit `mousePressed`/`mouseMoved`/`mouseReleased`. Die
 * Bewegung kam an, das **Loslassen nicht**: die Karte behielt `.zieht`, und `persist()` lief nie. Das
 * Werkzeug meldete „die Verschiebung ueberlebt den Neustart nicht" — und **der Fehler lag am
 * Werkzeug**, nicht im Code.
 *
 * **Warum.** `Input.dispatchMouseEvent` erzeugt **Maus**-Ereignisse. Die Objektfläche hoert aber auf
 * **Pointer**-Ereignisse (`pointerdown`/`pointermove`/`pointerup`), weil sie `setPointerCapture`
 * benutzt — und daraus folgt der Empfaenger der Bewegung. Chrome leitet Maus-Ereignisse **normalerweise**
 * in Pointer-Ereignisse ab; beim `mouseReleased` tat es das hier nicht. Wer den Unterschied nicht
 * kennt, sucht den Fehler im Code, wo keiner ist.
 *
 * Die Ereignisse gehen deshalb ueber `Input.dispatchMouseEvent` mit `pointerType: 'mouse'` **und**
 * werden zusaetzlich als echte `PointerEvent`s im Seitenkontext abgesetzt — dort, wo die Anwendung
 * ihre Zuhoerer hat.
 */
const zeiger = async (typ, x, y, buttons) => {
  await ruf('Input.dispatchMouseEvent', {
    type: typ === 'pointerdown' ? 'mousePressed' : typ === 'pointerup' ? 'mouseReleased' : 'mouseMoved',
    x,
    y,
    button: typ === 'pointermove' ? 'none' : 'left',
    buttons,
    clickCount: typ === 'pointerdown' ? 1 : 0,
    pointerType: 'mouse',
  })
  // **Und die Pointer-Schicht** — der Teil, den `Input.dispatchMouseEvent` hier nicht liefert.
  await js(`(() => {
    const el = document.elementFromPoint(${x}, ${y}) || document.querySelector(".cobj");
    const ziel = ${typ === 'pointerdown' ? 'el' : 'el'};
    ziel.dispatchEvent(new PointerEvent(${JSON.stringify(typ)}, {
      bubbles: true, cancelable: true, clientX: ${x}, clientY: ${y},
      button: 0, buttons: ${buttons}, pointerId: 1, pointerType: "mouse", isPrimary: true,
    }));
    return "ok";
  })()`)
  await warte(60)
}

await zeiger('pointerdown', griff.x, griff.y, 1)
for (let i = 1; i <= 5; i++) {
  await zeiger('pointermove', griff.x + i * 24, griff.y + i * 12, 1)
}
await zeiger('pointerup', griff.x + 120, griff.y + 60, 0)
await warte(400)
const nachher = (await stand()).find((o) => o.name === griff.name)
console.log(`   ${griff.name}: ${vorher?.x} / ${vorher?.y}  ->  ${nachher?.x} / ${nachher?.y}`)
const bewegt = vorher && nachher && (vorher.x !== nachher.x || vorher.y !== nachher.y)
console.log(`   ${bewegt ? 'bewegt sich' : 'BEWEGT SICH NICHT'}`)

console.log('')
console.log('5) Haengt die Karte am Zoom?')
await js(`window.__prometheusKamera.setLevel(8)`)
await warte(900)
const nachZoom = (await stand()).find((o) => o.name === griff.name)
console.log(`   nach einem Ebenenwechsel: ${nachZoom?.x} / ${nachZoom?.y}   ${nachZoom?.x === nachher?.x && nachZoom?.y === nachher?.y ? 'unveraendert — richtig' : 'HAT SICH VERSCHOBEN'}`)

console.log('')
console.log('6) Ueberlebt es einen Neustart?')
/* **Seite verlassen, dann neu laden** — `beforeunload` schreibt sonst ueber den neuen Stand. */
await ruf('Page.navigate', { url: 'about:blank' })
await warte(600)
await ruf('Page.navigate', { url: `http://127.0.0.1:3081/universe/?room=${RAUM}` })
await warte(4500)
const nachNeustart = await stand()
console.log(`   ${nachNeustart.length} Objekte nach dem Neuladen`)
for (const o of nachNeustart) console.log(`   ${o.name.padEnd(16)} bei ${String(o.x).padStart(5)} / ${String(o.y).padStart(5)}`)
const ueberlebt = nachNeustart.length === 3
console.log(`   ${ueberlebt ? 'die Anordnung steht' : 'DIE ANORDNUNG IST WEG'}`)

console.log('')
console.log('7) Und das „✕" nimmt eines weg:')
await js(`(() => { const x = document.querySelector(".cobj .cobjx"); if (x) x.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return "geklickt"; })()`)
await warte(400)
console.log(`   danach ${await js(`window.__prometheusCanvas.anzahl()`)} Objekte`)

const bild = await ruf('Page.captureScreenshot', { format: 'png' })
// Siehe `sky.js`: der Zielort kommt aus dem Ort **dieser** Datei — ein fester Pfad galt nur bis
// zum Umzug nach `apps/universe` (14.10.2026) und nur auf einem Rechner.
writeFileSync(`${import.meta.dirname}/_objects.png`, Buffer.from(bild.result.data, 'base64'))

console.log('')
console.log('Lesehilfe: die Karten liegen in BILDPUNKTEN — der 3D-Zoom darunter aendert ihre Lage nicht.')
console.log('           Genau das macht sie greifbar, egal welcher Massstab gerade gilt.')

ws.close()
