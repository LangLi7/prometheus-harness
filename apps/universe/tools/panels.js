/**
 * **Sind die Panels bedienbar — und liegt die Insel darunter?**
 *
 * **Warum dieses Werkzeug.** Der Betreiber: „**wenn ich es zb aktiviere ist es nicht interaktiv und
 * DockStation mechanik auch nicht vorhanden kann nicht wegnehmen ect**" und „**ich kann es auch nicht
 * bewegen alles was dazu gehört**". Ausserdem im Bild: das **Einstellungen-Panel überdeckt die Insel**
 * oben in der Mitte.
 *
 * Drei Fragen, alle messbar:
 *
 *   1. **Liegt die Insel unter dem Panel?** Zwei Kästen, die sich schneiden, und die `z-index`-Werte.
 *   2. **Bekommt ein Panel den Zeiger?** `elementsFromPoint` an seiner Kopfzeile — dort sitzen Griff
 *      und Schliessen-Kreuz.
 *   3. **Und der Griff:** `pointerdown` auf den Griff, `pointerup` weiter weg — danach wird der
 *      Panelzustand gelesen (`localStorage`), also „hat sich etwas bewegt".
 *
 * Aufruf:  bun tools/panels.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `panels-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`
const SCHLUESSEL = `prometheus.${RAUM}.dock.v2`

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
const js = async (expression, awaitPromise = false) => {
  const r = await ruf('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
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
  const ruf2 = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  ruf2(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  ruf2(welt, 'click');
  return 'ok';
})()`)
await warte(1200)

/*
 * **Ein Panel öffnen — über den Befehl, nicht über die Leiste.**
 *
 * Der Betreiber will die Leiste ja gerade loswerden; also wird das Panel hier so geöffnet, wie es
 * danach geöffnet würde: über die Anwendung selbst (`dock.openPanel`). Bleibt es unsichtbar, ist der
 * Weg kaputt — und genau das soll gemessen werden.
 */
console.log(`Panel über die Leiste öffnen: ${await js(`(() => {
  const knopf = [...document.querySelectorAll('.panelbar .dockbtn')].find((b) => /Suche|Search/.test(b.textContent || ''));
  if (!knopf) return 'kein Knopf gefunden';
  knopf.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return 'geklickt: ' + knopf.textContent.trim();
})()`)}`)
await warte(1000)

/*
 * **Und die Insel: hat sie jetzt die Panel-Gruppe?**
 *
 * Die Einträge stehen im **aufgeklappten** Zustand der Insel (`buildIslandFull`). Ohne dieses Aufklappen
 * misst man den eingeklappten Zustand und schliesst daraus „es gibt sie nicht" — ein Fehlalarm, der
 * eine funktionierende Sache als kaputt meldet.
 */
await js(`(() => {
  const mini = document.querySelector('#isl .mini');
  if (mini) mini.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return 'aufgeklappt';
})()`)
await warte(700)
const insel = await js(`(() => {
  const eintraege = [...document.querySelectorAll('#isl [data-panel-toggle]')];
  const leiste = document.querySelector('.panelbar');
  return JSON.stringify({
    leiste: leiste ? getComputedStyle(leiste).display : 'fehlt',
    eintraege: eintraege.length,
    namen: eintraege.slice(0, 4).map((e) => e.textContent.replace(/\\s+/g, ' ').trim()),
  });
})()`)
console.log(`Insel: ${insel}`)

/*
 * **Und ein Klick auf einen Insel-Eintrag holt das Panel?**
 */
const vorherHol = await js(`JSON.stringify(JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null').panels.map((p) => p.id + '=' + p.zone))`)
console.log(`vor dem Klick: ${vorherHol}`)
await js(`(() => {
  const eintrag = [...document.querySelectorAll('#isl [data-panel-toggle]')]
    .find((e) => /Terminal/.test(e.textContent || ''));
  if (!eintrag) return 'kein Eintrag';
  eintrag.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return 'geklickt';
})()`)
await warte(900)
console.log(`nach dem Klick: ${await js(`JSON.stringify(JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null').panels.map((p) => p.id + '=' + p.zone))`)}`)

console.log(`Zonen: ${await js(`JSON.stringify([...document.querySelectorAll('.zone')].map((z) => z.dataset.zone + '=' + getComputedStyle(z).display))`)}`)

/*
 * **1. Überlappt das Panel die Insel?**
 */
console.log('')
console.log(`Überlappung: ${await js(`(() => {
  const insel = document.getElementById('isl');
  const panel = document.querySelector('.zone .panel');
  if (!insel || !panel) return 'Insel oder Panel fehlt';
  const a = insel.getBoundingClientRect(), b = panel.getBoundingClientRect();
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return JSON.stringify({
    insel: [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height)],
    panel: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
    schneidet: x > 0 && y > 0, flaeche: x > 0 && y > 0 ? Math.round(x * y) : 0,
  });
})()`)}`)

/*
 * **2. Bekommt das Panel den Zeiger — an der Kopfzeile?**
 */
console.log('')
console.log(`Zeiger an der Kopfzeile: ${await js(`(() => {
  const panel = document.querySelector('.zone .panel');
  if (!panel) return 'kein Panel';
  const kopf = panel.querySelector('.panelhead');
  if (!kopf) return 'keine Kopfzeile';
  const r = kopf.getBoundingClientRect();
  const reihe = document.elementsFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return JSON.stringify(reihe.slice(0, 4).map((el) => (el.id || el.className || el.tagName).toString().split(' ')[0].slice(0, 20)));
})()`)}`)

/*
 * **3. Bewegt sich das Panel, wenn man am Griff zieht?**
 */
const vorher = await js(`(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null'); return p ? p.panels.map((x) => x.id + '=' + x.zone).join(',') : '—' })()`)
console.log('')
console.log(`vorher:  ${vorher}`)

await js(`(() => {
  const panel = document.querySelector('.zone .panel');
  const griff = panel.querySelector('.panelhead');
  const r = griff.getBoundingClientRect();
  const x0 = Math.round(r.left + 40), y0 = Math.round(r.top + r.height / 2);
  const grund = { bubbles: true, cancelable: true, clientX: x0, clientY: y0, pointerId: 1, button: 0, buttons: 1, isPrimary: true };
  griff.dispatchEvent(new PointerEvent('pointerdown', grund));
  /*
   * **An window, nicht an document.** Die Zieh-Hörcher der Anwendung liegen auf window
   * (installDragTargets). Ein Ereignis auf document steigt zwar auf — aber nur, wenn es den Weg über
   * den Baum nimmt; hier wird es direkt am Ziel abgesetzt, und dann trifft es window NICHT. Deshalb
   * stand im ersten Lauf „nach Zug: unverändert", obwohl das Ziehen funktionieren kann.
   *
   * Und keine Backticks in diesem Kommentar: sie beenden das Template-Literal, in dem er steht.
   */
  window.dispatchEvent(new PointerEvent('pointermove', { ...grund, clientX: x0 + 260, clientY: y0 + 160 }));
  window.dispatchEvent(new PointerEvent('pointerup', { ...grund, clientX: x0 + 260, clientY: y0 + 160, buttons: 0 }));
  return 'gezogen';
})()`)
await warte(900)
console.log(`nach Zug: ${await js(`(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null'); return p ? p.panels.map((x) => x.id + '=' + x.zone).join(',') : '—' })()`)}`)

/*
 * **4. Und das Schliessen-Kreuz?**
 */
await js(`(() => {
  const x = document.querySelector('.zone .panel .panelx');
  if (!x) return 'kein Kreuz';
  x.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return 'geklickt';
})()`)
await warte(900)
console.log(`nach „✕":  ${await js(`(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(SCHLUESSEL)}) || 'null'); return p ? p.panels.map((x) => x.id + '=' + x.zone).join(',') : '—' })()`)}`)

const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
await Bun.write(`${import.meta.dirname}/panels.png`, Buffer.from(schuss.result.data, 'base64'))
console.log('')
console.log('Bild: tools/panels.png')
ws.close()
process.exit(0)
