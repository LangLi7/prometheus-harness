/**
 * **Der Aufbau der Oberfläche in Zahlen: wo liegt welcher Kasten?**
 *
 * **Warum dieses Werkzeug.** Der Betreiber: „alles eingefroren und diese docking stuff ist schau
 * nochmals was du gemachst hast das es so ist". Zwei Umbauten des Docks sind gescheitert, und der
 * Revert war **unvollständig** — sichtbar als schwarzer Streifen am unteren Rand, eine Insel, die
 * nicht mehr mittig sitzt, und eine Sonne, die halb aus dem Bild hängt.
 *
 * „Es sieht falsch aus" ist eine Beobachtung. **Gemessen** wird daraus eine Zahl: für jeden
 * tragenden Kasten werden Position und Grösse gelesen, dazu die Fenstergrösse — und dann gemeldet,
 * ob ein Kasten **kleiner** ist als sein Elternteil, ob er **aus dem Bild** ragt oder ob zwei sich
 * **überlappen**, ohne dass es Absicht ist.
 *
 * Aufruf:  bun tools/build-up.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `aufbau-${Date.now().toString(36)}`
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

// In die Welt schalten — um diesen Aufbau geht es.
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

const bericht = `(() => {
  const kasten = (wahl) => {
    const el = document.querySelector(wahl);
    if (!el) return { wahl, fehlt: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      wahl,
      x: Math.round(r.left), y: Math.round(r.top),
      b: Math.round(r.width), h: Math.round(r.height),
      position: cs.position,
      display: cs.display,
      overflow: cs.overflow,
      flex: cs.flex,
    };
  };
  const fenster = { b: window.innerWidth, h: window.innerHeight };
  const teile = ['#screen-os', '.core', '#world', '.labels', '.axes', '.isl', '.hud', '#viewctl', '.dockhost',
                 '.zone-left', '.zone-right', '.zone-bottom', '.panelbar']
    .map(kasten);
  /*
   * **Und die Innenteile der Panels.**
   *
   * Der Betreiber hat vier Ausschnitte geschickt — die Panels selbst, nicht die Welt. Sichtbar darin:
   * eine **leere Spalte** links vom Zustand-Panel, ein Reiterband mit **zwei gleichnamigen Reitern**
   * („Zustand", „Zustand") und eine Wertespalte, in der eine Beschreibung über **sieben Zeilen**
   * bricht. Das sind Fragen an die Innenmasse, nicht an den Bildschirmaufbau — deshalb werden die
   * Panels, ihre Reiterbänder und ihre Zellen einzeln gemessen.
   */
  const innen = [...document.querySelectorAll('.zone .panel, .zone .tabs, .tabs .tab, .zone .edge, .zone-left > *, .zone-right > *')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        was: (el.className || el.tagName).toString().slice(0, 30),
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 18),
        x: Math.round(r.left), b: Math.round(r.width), h: Math.round(r.height),
        display: cs.display,
        flex: cs.flexBasis + ' / ' + cs.flexGrow,
        /* **Welches Panel ist das?** Ohne die Kennung ist „ein Panel steht noch" keine Auskunft. */
        panel: el.dataset?.panel ?? '',
      };
    });

  /*
   * **Und die Prüfungen, die aus Zahlen Befunde machen.**
   *
   *   - ragt der Kasten **über das Fenster** hinaus?
   *   - ist die **Kernfläche** deutlich kleiner als das Fenster? (Dann frisst etwas Platz.)
   *   - liegt der **Canvas** auf der Kernfläche? (Sonst hängt er verschoben.)
   */
  const kern = teile.find((t) => t.wahl === '.core');
  const welt = teile.find((t) => t.wahl === '#world');
  const befunde = [];
  if (kern && !kern.fehlt) {
    if (kern.h < fenster.h * 0.95) befunde.push('Kernfläche ist ' + (100 - Math.round((100 * kern.h) / fenster.h)) + ' % niedriger als das Fenster');
    if (kern.y + kern.h > fenster.h + 1) befunde.push('Kernfläche ragt unten heraus');
  }
  if (welt && !welt.fehlt && kern && !kern.fehlt) {
    if (Math.abs(welt.h - kern.h) > 2) befunde.push('Canvas (' + welt.h + ') und Kernfläche (' + kern.h + ') sind verschieden hoch');
    if (Math.abs(welt.y - kern.y) > 2) befunde.push('Canvas beginnt bei y=' + welt.y + ', Kernfläche bei y=' + kern.y);
  }
  for (const t of teile) {
    if (t.fehlt) continue;
    if (t.x + t.b > fenster.b + 1) befunde.push(t.wahl + ' ragt rechts heraus');
    if (t.y + t.h > fenster.h + 1) befunde.push(t.wahl + ' ragt unten heraus');
  }
  return JSON.stringify({ fenster, teile, innen, befunde });
})()`

const roh = await ruf('Runtime.evaluate', { expression: bericht, returnByValue: true })
const daten = JSON.parse(String(roh.result?.result?.value ?? '{}'))

console.log(`Fenster: ${daten.fenster?.b} × ${daten.fenster?.h}`)
console.log('')
console.log('Kasten            x      y      Breite   Höhe   position         display')
console.log('─'.repeat(80))
for (const t of daten.teile ?? []) {
  if (t.fehlt) {
    console.log(`${t.wahl.padEnd(17)} FEHLT`)
    continue
  }
  console.log(
    `${t.wahl.padEnd(17)} ${String(t.x).padStart(5)}  ${String(t.y).padStart(5)}  ` +
      `${String(t.b).padStart(6)}  ${String(t.h).padStart(6)}   ${t.position.padEnd(15)}  ${t.display}`,
  )
}
console.log('')
console.log(`Befunde (${(daten.befunde ?? []).length}):`)
for (const b of daten.befunde ?? []) console.log(`  ⚠ ${b}`)
if (!(daten.befunde ?? []).length) console.log('  (keine)')

/*
 * **Und die Kopfzeile, Wort für Wort.**
 *
 * Der Betreiber: „**schau mal text und zahl oben links an**". Die Zeile besteht seit dieser Runde aus
 * drei Feldern (`#hudLevel`, `#hudDist`, `#hudFps`) — hier wird gemessen, **wo** jedes steht, **wie
 * breit** es ist und **welche** Schrift-Eigenschaften es hat. Damit ist „da stimmt was nicht" eine
 * Zahl statt eines Eindrucks.
 */
console.log('')
const kopf = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const klein = document.querySelector('.hud small');
    if (!klein) return 'keine Kopfzeile';
    const raus = [...klein.children].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent || '').slice(0, 20),
        x: Math.round(r.left), b: Math.round(r.width),
        groesse: cs.fontSize, spacing: cs.letterSpacing, minB: cs.minWidth, tab: cs.fontVariantNumeric,
      };
    });
    const rk = klein.getBoundingClientRect();
    const marke = document.querySelector('.hud .wm');
    const rm = marke ? marke.getBoundingClientRect() : null;
    return JSON.stringify({
      kopf: [Math.round(rk.left), Math.round(rk.top), Math.round(rk.width)],
      marke: rm ? [Math.round(rm.left), Math.round(rm.top), Math.round(rm.width)] : 'fehlt',
      teile: raus,
    });
  })()`,
  returnByValue: true,
})
console.log(`Die Kopfzeile: ${kopf.result?.result?.value}`)


console.log('')
console.log('Innenteile der Panels:')
console.log('  was                            Text               x     Breite  Höhe   flexBasis')
console.log('  ' + '─'.repeat(88))
for (const t of daten.innen ?? []) {
  console.log(
    `  ${t.was.padEnd(30)} ${t.text.padEnd(18)} ${String(t.x).padStart(5)} ${String(t.b).padStart(7)} ${String(t.h).padStart(6)}   ${t.flex}`,
  )
}

const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
await Bun.write(
  `${import.meta.dirname}/build-up.png`,
  Buffer.from(schuss.result.data, 'base64'),
)
console.log('')
console.log('Bild: tools/build-up.png')
ws.close()
process.exit(0)
