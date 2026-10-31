/**
 * **Der Himmel ueber ALLE zwoelf Bezugsebenen — ein Bild je Stufe.**
 *
 * Der Betreiber: „**beim maximum denke ich es waere besser das es komplett in eine umhuellung aussehen
 * koennte mit weisse sterne weil universum sich ja ausdehnt aber ab bestimmt grenze von weitem sollte
 * irgendwann nicht ueberall sterne geben hintergrund verstehst was ich meine?**"
 *
 * Und er hat einen **Kasten** gemeldet, der stehen blieb, waehrend sich die Welt drehte — dreimal:
 * „die andere stuff ist immer noch da", „immer noch da den abgedeckte teil?".
 *
 * ── Warum dieses Werkzeug die Kamera setzt und nicht das Rad dreht ──────────────────────
 *
 * Der erste Anlauf drehte das **Mausrad** und las nach jedem Zug die Ebene ab. Das war falsch, und der
 * Fehler war nicht im Code, sondern in der **Aufloesung der Messung**: ein Radereignis sind
 * `-deltaY / 100` Rastschritte, bei `deltaY = 120` also **1,2** — und eine Ebene ist Faktor 4. Mit vier
 * Zuegen je Runde ist man bei Faktor 2,94 und **springt** regelmaessig ueber eine Stufe. Gemeldet
 * wurden dann „8 von 12 Ebenen erreichbar", obwohl die Arithmetik sagte, dass jede Ebene ihr eigenes
 * Band trifft.
 *
 * Ein **Widerspruch zwischen zwei Messungen** ist der Grund, dieses Werkzeug neu zu bauen: es faehrt
 * jede Ebene ueber `setLevel` an — denselben Weg, den die Sprungmarken gehen — und misst dann, was
 * im Bild steht. Damit ist die Frage „ist die Ebene erreichbar" von der Frage „trifft mein Rad sie"
 * getrennt.
 *
 * Aufruf:  bun tools/sky.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const { writeFileSync } = await import('node:fs')

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

await ruf('Runtime.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await ruf('Page.navigate', { url: `http://127.0.0.1:3081/universe/?room=sky-${Date.now().toString(36)}` })
await warte(4500)

const da = await js(`typeof window.__prometheusKamera === 'object' && window.__prometheusKamera !== null`)
if (da !== 'true') {
  console.log('ABBRUCH: window.__prometheusKamera fehlt — die Ansicht ist nicht geladen.')
  process.exit(1)
}

/** Was auf der aktuellen Ebene im Bild steht. */
const stand = async () =>
  JSON.parse(await js(`(() => {
    const k = window.__prometheusKamera;
    const label = ((document.querySelector("#hudLevel") || {}).textContent || "").trim();
    const abstand = ((document.querySelector("#hudDist") || {}).textContent || "").trim();
    const bild = decodeURIComponent(getComputedStyle(document.getElementById("screen-os")).getPropertyValue("--starfield") || "");
    const sterne = (bild.match(/<circle/g) || []).length;
    const namen = [...document.querySelectorAll(".labels .label")].map((e) => (e.textContent || "").trim()).filter(Boolean);
    return JSON.stringify({ abstandIst: k.distance(), ebeneIst: k.level(), label, abstand, bildLaenge: bild.length, sterne, namen });
  })()`))

const schuss = async (name) => {
  const r = await ruf('Page.captureScreenshot', { format: 'png' })
  /*
   * **Der Zielort kommt aus dem Ort DIESER Datei, nicht aus einem festen Pfad.**
   *
   * Hier stand `C:/Users/Chang/prometheus-harness/snapshots/web/tools/…` — ein Pfad, der nur auf
   * einem Rechner galt und nur bis zum Umzug am 14.10.2026. Seit die Welt in `apps/universe` liegt,
   * hätte dieses Werkzeug ins Leere geschrieben. `import.meta.dirname` ist der Ordner der laufenden
   * Datei; er stimmt nach jedem Umzug — und auf jedem Rechner.
   */
  writeFileSync(`${import.meta.dirname}/${name}`, Buffer.from(r.result.data, 'base64'))
}

console.log('Der Himmel ueber die Bezugsebenen — jede Stufe gezielt angefahren')
console.log('')
console.log('  Ebene  Name                 gesetzt      gelesen      Sterne   Bild     Was steht')
console.log('  ' + '─'.repeat(104))

let falsch = 0
let ohneNamen = 0
for (let ebene = 1; ebene <= 12; ebene++) {
  await js(`window.__prometheusKamera.setLevel(${ebene})`)
  await warte(700)
  const s = await stand()
  const trifft = s.ebeneIst === ebene
  if (!trifft) falsch++
  if (s.namen.length === 0) ohneNamen++
  console.log(
    `  ${String(ebene).padStart(5)}  ${s.label.padEnd(20)} ${s.abstandIst.toExponential(2).padStart(10)}   ${s.abstand.padEnd(12)} ${String(s.sterne).padStart(6)}   ${String(s.bildLaenge).padStart(6)}   ${s.namen.join(', ') || '(kein Name im Bild)'}${trifft ? '' : '   ← FALSCHE EBENE'}`,
  )
  await schuss(`_sky_${String(ebene).padStart(2, '0')}.png`)
}

console.log('')
console.log(falsch === 0
  ? 'Alle zwoelf Ebenen treffen ihr eigenes Band — die Skala ist lueckenlos abfahrbar.'
  : `${falsch} von zwoelf Ebenen landen NICHT in ihrem Band.`)
if (ohneNamen > 0) console.log(`ACHTUNG: in ${ohneNamen} Bildern steht kein Name — diese Ebene zeigt nichts.`)
console.log('')
console.log('Lesehilfe: die Sternenzahl muss nach aussen SINKEN (der Betreiber: „ab bestimmt grenze von')
console.log('           weitem sollte irgendwann nicht ueberall sterne geben"). Und in keinem Bild darf')
console.log('           ein Rechteck mit harter Kante stehen bleiben.')

ws.close()
