/**
 * **Sind die Testseiten das Problem?**
 *
 * Der Betreiber hat einen **leeren Bildschirm** gesehen, während ein frischer Start einwandfrei läuft.
 * Der Unterschied muss also im **Zustand** liegen, nicht im Code.
 *
 * Und dafür gibt es eine naheliegende Ursache, die man messen kann: die Werkzeuge öffnen bei jedem
 * Lauf eine **neue Seite** (`json/new`) und schliessen sie nie. Jede hält einen **WebGL-Kontext**, und
 * die Zahl der gleichzeitigen Kontexte ist im Browser **begrenzt** (in Chromium typischerweise 16 je
 * Prozess). Ist das Limit erreicht, verliert die älteste Seite ihren Kontext — und dann ist das
 * Canvas **leer**, ohne dass eine einzige Fehlermeldung erscheint.
 *
 * Das ist genau das Bild: die Oberfläche steht, die Beschriftungen sind da, das Canvas ist schwarz.
 *
 * Aufruf:  bun tools/pages.js [--schliessen]
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const SCHLIESSEN = Bun.argv.includes('--schliessen')

const seiten = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const app = seiten.filter((s) => s.type === 'page' && s.url.includes('/universe/'))
console.log(`Offene Seiten der Anwendung: ${app.length}`)
for (const s of app) console.log(`  ${s.id.slice(0, 8)}  ${s.url.slice(0, 70)}`)

/*
 * **Und jetzt der Befund, der zählt:** hat die Seite ihren WebGL-Kontext noch?
 *
 * `gl.isContextLost()` ist die einzige verlässliche Auskunft. Ein leeres Canvas ohne Fehlermeldung ist
 * sonst nicht von „die Szene ist leer" zu unterscheiden — und das sind zwei völlig verschiedene
 * Ursachen.
 */
const neueste = app.at(-1)
if (!neueste) {
  console.log('Keine Anwendungsseite offen.')
  process.exit(0)
}
const ws = new WebSocket(neueste.webSocketDebuggerUrl)
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
await ruf('Runtime.enable')
const stand = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const canvas = document.getElementById('world');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    return JSON.stringify({
      kontextVerloren: gl ? gl.isContextLost() : 'kein Kontext',
      kopf: (document.getElementById('hudLine') || {}).textContent,
      fpsSichtbar: (document.getElementById('statusBody') || {}).textContent ? 'ja' : 'nein',
    });
  })()`,
  returnByValue: true,
})
console.log(`\nNeueste Seite: ${stand.result?.result?.value}`)
ws.close()

/*
 * **Und jetzt alle durchgehen.** Eine Seite, die ihren WebGL-Kontext verloren hat, zeigt ein **leeres
 * Canvas ohne Fehlermeldung** — genau das Bild, das der Betreiber gesehen hat. Die Zahl der verlorenen
 * Kontexte ist damit der Beweis (oder die Widerlegung) dafür, dass die Testseiten die Ursache sind.
 */
let verloren = 0
let geprueft = 0
for (const s of app) {
  if (s.id === neueste.id) continue
  const w = new WebSocket(s.webSocketDebuggerUrl)
  try {
    await new Promise((f, fehler) => {
      w.addEventListener('open', f)
      w.addEventListener('error', () => fehler(new Error('kein WebSocket')))
      setTimeout(() => fehler(new Error('Zeitüberschreitung')), 3000)
    })
    const antwort = await new Promise((fertig) => {
      const horcher = (e) => {
        const d = JSON.parse(e.data)
        if (d.id === 1) {
          w.removeEventListener('message', horcher)
          fertig(d)
        }
      }
      w.addEventListener('message', horcher)
      w.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const c = document.getElementById('world');
              const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
              if (!gl) return 'KEIN-KONTEXT';
              return gl.isContextLost() ? 'VERLOREN' : 'ok';
            })()`,
            returnByValue: true,
          },
        }),
      )
    })
    const wert = antwort.result?.result?.value
    geprueft += 1
    if (wert === 'VERLOREN') verloren += 1
  } catch {
    // Eine Seite, die nicht antwortet, zählt nicht als geprüft.
  } finally {
    w.close()
  }
}
console.log(`Geprüft: ${geprueft}   davon mit verlorenem WebGL-Kontext: ${verloren}`)

if (SCHLIESSEN) {
  // **Nur die Anwendungsseiten**, nicht die des Betreibers: Tabellen und Skripte bleiben unberührt.
  let zu = 0
  for (const s of app) {
    if (s.id === neueste.id) continue
    const a = await fetch(`http://127.0.0.1:${PORT}/json/close/${s.id}`)
    if (a.ok) zu += 1
  }
  console.log(`\nGeschlossen: ${zu} Testseiten (die neueste bleibt offen).`)
}
process.exit(0)
