/**
 * **Reagiert die Welt noch auf Maus und Tastatur?**
 *
 * **Warum dieses Werkzeug.** Der Betreiber: „**noch dazu kann ich es nicht mehr universe ect steuern
 * mit maus und oder tastatur**". Ursache war gefunden und behoben: `.dockhost > * { pointer-events:
 * auto }` gab **allen drei Zonen** Zeigerereignisse — und die Zonen sind Flex-Kinder, die auf die
 * volle Höhe gestreckt werden (gemessen 900 px). Zusammen fingen sie fast den ganzen Bildschirm ab.
 *
 * Dieses Werkzeug prüft das **durch Handlung**, nicht durch Lesen: es schickt ein echtes Radereignis
 * und einen echten Zug mitten in die Welt und sieht nach, ob sich der Kamerazustand geändert hat.
 * Ausserdem tastet es ein Raster von Punkten ab und meldet, **welches Element** dort den Zeiger
 * bekäme (`elementFromPoint`) — damit ist „die Welt bekommt die Maus" eine Liste statt einer
 * Vermutung.
 *
 * Aufruf:  bun tools/controls.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `steuer-${Date.now().toString(36)}`
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
await ruf('Page.navigate', { url: URL_APP })
await warte(3500)

// In die Welt schalten — ohne das gibt es nichts zu steuern.
await ruf('Runtime.evaluate', {
  expression: `(() => {
    const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
    const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
    ruf(mini, 'click');
    const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
    ruf(welt, 'click');
    return 'ok';
  })()`,
  returnByValue: true,
})
await warte(1500)

/** Der Kamerazustand aus dem Speicher — die einzige ehrliche Auskunft über eine Bewegung. */
const zustand = async () => {
  const r = await ruf('Runtime.evaluate', {
    expression: `(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null'); return p ? Math.round(p.camera.distance) + '|' + p.camera.orientation.map((n) => n.toFixed(3)).join(',') : '—'; })()`,
    returnByValue: true,
  })
  return String(r.result?.result?.value ?? '—')
}

/*
 * **Und die Frage, welches Element den Zeiger bekommt.**
 *
 * Ein Raster über die ganze Fläche: für jeden Punkt sagt `elementFromPoint`, was dort liegt. So wird
 * sichtbar, welche Bereiche die Welt sind und welche dem Dock gehören — als Liste, nicht als Meinung.
 */
const raster = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const was = [];
    for (let y = 60; y < window.innerHeight - 10; y += 90) {
      for (let x = 10; x < window.innerWidth - 10; x += 120) {
        const el = document.elementFromPoint(x, y);
        const name = el ? (el.id || el.className || el.tagName).toString().split(' ')[0].slice(0, 16) : 'nichts';
        was.push(name);
      }
    }
    const zaehlung = {};
    for (const n of was) zaehlung[n] = (zaehlung[n] || 0) + 1;
    return JSON.stringify(zaehung);
  })()`,
  returnByValue: true,
})
console.log(`Zeiger-Empfänger über die Fläche: ${raster.result?.result?.value}`)
console.log('')

console.log(`vorher:  ${await zustand()}`)

/*
 * **Rad in die Mitte der Welt — an das Element, das den Zeiger WIRKLICH bekommt.**
 *
 * Hier stand `document.elementFromPoint(...)` und dann `dispatchEvent` darauf. Das war **falsch** und
 * hat die Messung verdorben: `elementFromPoint` liefert das **oberste** Element an dieser Stelle —
 * `.labels` — auch wenn es `pointer-events: none` hat und die Ereignisse deshalb **durchlässt**. Der
 * Test schickte das Rad also an ein Element, das gar nichts empfängt, und meldete „die Welt reagiert
 * nicht".
 *
 * `elementsFromPoint` gibt die **ganze Reihe** von oben nach unten. Gesucht ist das erste Element, das
 * die Ereignisse auch annimmt — und im Browser heisst das: kein `pointer-events: none`.
 */
const empfaenger = `(() => {
  const reihe = document.elementsFromPoint(720, 300);
  for (const el of reihe) {
    if (getComputedStyle(el).pointerEvents !== 'none') {
      return (el.id || el.className || el.tagName).toString().split(' ')[0].slice(0, 20);
    }
  }
  return 'KEINER (alles pointer-events: none)';
})()`

const radEmpfaenger = await ruf('Runtime.evaluate', { expression: empfaenger, returnByValue: true })
console.log(`Empfänger für Maus in der Bildmitte: „${radEmpfaenger.result?.result?.value}"`)

/*
 * **Und die Kette der Elemente an dieser Stelle — mit ihrem `pointer-events`.**
 *
 * „Der Empfänger ist `labels`, obwohl dort `pointer-events: none` steht" wäre ein Widerspruch. Diese
 * Zeile zeigt, was der Browser wirklich meint: für jedes Element von oben nach unten, ob es den Zeiger
 * **annimmt** oder durchlässt. Damit ist der Widerspruch eine Liste statt einer Vermutung.
 */
const kette = await ruf('Runtime.evaluate', {
  expression: `(() => {
    return JSON.stringify(document.elementsFromPoint(720, 300).map((el) => ({
      el: (el.id || el.className || el.tagName).toString().split(' ')[0].slice(0, 18),
      pe: getComputedStyle(el).pointerEvents,
      z: getComputedStyle(el).zIndex,
    })));
  })()`,
  returnByValue: true,
})
console.log(`Kette an dieser Stelle: ${kette.result?.result?.value}`)
console.log('')

console.log(`vorher:  ${await zustand()}`)

const rad = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const el = document.elementFromPoint(720, 300);
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true, clientX: 720, clientY: 300 }));
    return (el.id || el.className || el.tagName).toString().slice(0, 24);
  })()`,
  returnByValue: true,
})
await warte(600)
console.log(`nach Rad auf „${rad.result?.result?.value}":  ${await zustand()}`)

/*
 * **Und ein Zug** — Drücken, Bewegen, Loslassen an derselben Stelle.
 */
await ruf('Runtime.evaluate', {
  expression: `(() => {
    const el = document.elementFromPoint(720, 300);
    const grund = { bubbles: true, cancelable: true, clientX: 720, clientY: 300, pointerId: 1, button: 0, buttons: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', grund));
    el.dispatchEvent(new PointerEvent('pointermove', { ...grund, clientX: 800, clientY: 340 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...grund, buttons: 0 }));
    return 'ok';
  })()`,
  returnByValue: true,
})
await warte(600)
console.log(`nach Zug:                    ${await zustand()}`)

/*
 * **Und die Tastatur.** `+` zoomt, `0` setzt den Startblick zurück.
 */
await ruf('Runtime.evaluate', {
  expression: `window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))`,
  returnByValue: true,
})
await warte(600)
console.log(`nach Taste „+":              ${await zustand()}`)

ws.close()
process.exit(0)
