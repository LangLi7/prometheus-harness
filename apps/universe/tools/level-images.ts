/**
 * **Jede Bezugsebene ansehen — mit der inhaltsbezogenen Rahmung.**
 *
 * **Warum dieses Werkzeug.** `distanceForLevel` setzte den Abstand aus einer Zweierpotenz, und auf
 * Ebene 7 stand die Kamera dadurch **64-mal** zu weit weg: der einzige Körper der Ebene füllte 1,5 %
 * der Bildhöhe. Der Betreiber: „sieht immer noch so beschissen aus".
 *
 * Ob die neue Rahmung (`view.idealDistance` → `framingDistance`) das behebt, ist eine Frage an das
 * **Bild**, nicht an den Code. Also wird für jede Ebene eines gemacht und abgelegt.
 *
 * **Und der Abstand wird mit dem verglichen, den die alte Regel gesetzt hätte** — damit die
 * Änderung beziffert ist und nicht nur behauptet.
 *
 * Aufruf:  bun tools/ebenen-bilder.js
 */
import { distanceForLevel, framingDistance, levelForDistance } from '../src/camera'
import { exampleUniverse } from '../src/universe'
import { buildScene, drawnRadius, minBodySize } from '../src/scene'

const PORT = Number(process.env.CDP_PORT ?? 9223)
const HOEHE = 900
const FOV = 60
const ZIEL = import.meta.dirname

/** Der Abstand, den die **neue** Regel für diese Ebene ergibt — dieselbe Rechnung wie die Szene. */
function neu(ebene: number): number {
  const s = buildScene(exampleUniverse(), ebene as 1)
  const groesster = Math.max(
    ...s.labeled.map((p) => p.body.radius),
    ...s.placed.map((p) => p.body.radius),
    0,
  )
  // Die Sichtgrenze hängt am Abstand — hier mit dem alten Wert gerechnet, wie `contentBounds` es tut.
  const alt = distanceForLevel(ebene as 1)
  const grenze = minBodySize(s.reference, groesster, alt, HOEHE, FOV)
  const gezeichnet = drawnRadius(groesster, grenze)
  return { abstand: framingDistance(gezeichnet, HOEHE, FOV), groesster: gezeichnet }
}

console.log('Ebene   alt (Zweierpotenz)   neu (Inhalt)   grösster Körper   Füllung')
console.log('─'.repeat(76))
for (const ebene of [1, 2, 3, 4, 5, 6, 7] as const) {
  const a = distanceForLevel(ebene)
  const n = neu(ebene)
  const fuellung = (100 * n.groesster) / (n.abstand * Math.tan((FOV * Math.PI) / 360))
  const faktor = (a / n.abstand).toFixed(1)
  console.log(
    `  ${ebene}    ${String(a).padEnd(20)} ${String(Math.round(n.abstand)).padEnd(14)} ` +
      `${String(Math.round(n.groesster)).padEnd(17)} ${fuellung.toFixed(0)} %   (alt war ${faktor}× zu weit)`,
  )
}

/*
 * **Und jetzt die Bilder.** Je Ebene eine frische Seite mit vorbelegtem Abstand — der Abstand wird
 * **vor** dem ersten Programmzeiler gesetzt (`Page.enable` nicht vergessen, sonst wirkt er nicht).
 */
async function bild(ebene: number, abstand: number): Promise<string> {
  const raum = `ebene${ebene}-${Date.now().toString(36)}`
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
  await ruf('Page.enable')
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
    expression: `JSON.stringify({
      kopf: (document.getElementById('hudLine')||{}).textContent,
      namen: [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none').map((l) => l.textContent.trim()),
    })`,
    returnByValue: true,
  })
  const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
  const datei = `${ZIEL}\\level-${ebene}.png`
  await Bun.write(datei, Buffer.from(schuss.result.data, 'base64'))
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${seite.id}`)
  return String(stand.result?.result?.value ?? '—')
}

console.log('')
console.log('Und jetzt das Bild — **mit Nachführung**, so wie die Anwendung es tut.')
console.log('Der Abstand wird gesetzt, dann wechselt die Bezugsebene, dann führt die Kamera nach.')
console.log('')

/**
 * **Eine Seite, ein Weg zur Ebene — durch die Anwendung selbst.**
 *
 * Hier stand zuerst „Abstand setzen und Bild machen". Das ist zu wenig: die Anwendung **führt seit
 * dieser Änderung nach** (`view.idealDistance` beim Ebenenwechsel). Wer den Abstand von aussen setzt,
 * umgeht genau die Regel, die geprüft werden soll.
 *
 * Deshalb wird die Ebene **durch einen Klick auf einen Körper** angesteuert — der Weg, den auch der
 * Nutzer geht — und danach gewartet, bis die Nachführung gegriffen hat.
 */
async function bild(ebene: number, abstand: number): Promise<Record<string, unknown>> {
  const raum = `neu${ebene}-${Date.now().toString(36)}`
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
  await ruf('Page.enable')
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

  /*
   * **Die Nachführung auslösen.** Sie hängt am **Wechsel** der Bezugsebene. Ein Radereignis nach
   * unten und eines nach oben stellt sicher, dass ein Wechsel stattfindet — und danach steht der
   * Abstand nach der Regel der Anwendung, nicht nach meiner Vorbelegung.
   */
  const rad = (d) => `(() => {
    const el = document.getElementById('world') || document.body;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: ${d}, bubbles: true, cancelable: true, clientX: 720, clientY: 450 }));
    return 'ok';
  })()`
  await ruf('Runtime.evaluate', { expression: rad(-300), returnByValue: true })
  await warte(600)
  await ruf('Runtime.evaluate', { expression: rad(300), returnByValue: true })
  // **Warten, bis die Nachführung wirklich gelaufen ist** — sie greift im Bildlauf.
  await warte(1200)

  const stand = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const p = JSON.parse(localStorage.getItem('prometheus.${raum}.world.v1') || 'null');
      const lbl = [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none');
      return JSON.stringify({
        abstand: p ? Math.round(p.camera.distance) : null,
        kopf: (document.getElementById('hudLine')||{}).textContent,
        namen: lbl.map((l) => l.textContent.trim()),
        // **Stehen Namen auf Körpern?** Der Betreiber hat genau das gesehen.
        ueberlappungen: (() => {
          const r = lbl.map((l) => l.getBoundingClientRect());
          let n = 0;
          for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
            const a = r[i], b = r[j];
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n += 1;
          }
          return n;
        })(),
      });
    })()`,
    returnByValue: true,
  })
  const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
  await Bun.write(`${ZIEL}\\new-${ebene}.png`, Buffer.from(schuss.result.data, 'base64'))
  ws.close()
  await fetch(`http://127.0.0.1:${PORT}/json/close/${seite.id}`)
  return JSON.parse(String(stand.result?.result?.value ?? '{}'))
}

/*
 * **Drei Ebenen, drei Bilder** — und zu jedem die drei Zahlen, auf die es ankommt:
 * der Abstand **nach** der Nachführung, die sichtbaren Namen, und die Zahl der **überlappenden**
 * Beschriftungsrechtecke. Die letzte ist die Antwort auf „es ist alles überlappt".
 */
for (const ebene of [7, 5, 3] as const) {
  const stand = await bild(ebene, Math.round(neu(ebene).abstand))
  console.log(
    `Ebene ${ebene}:  Abstand ${String(stand.abstand).padEnd(8)} ` +
      `überlappende Namen: ${stand.ueberlappungen}   ${String(stand.kopf).slice(0, 40)}`,
  )
  console.log(`          sichtbar: ${(stand.namen as string[])?.join(', ') || '(keine)'}`)
}
process.exit(0)

