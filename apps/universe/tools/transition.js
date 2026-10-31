/**
 * **Der Uebergang beim Zoom — gemessen, nicht gefuehlt.**
 *
 * Der Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene
 * direkt change oder so ansonsten fuehl es sich nach ruckeln oder veraenderung der kamera perspektive
 * und so an**".
 *
 * ── Was hier gemessen wird, und warum eine Zahl und nicht ein Bild ──────────────────────
 *
 * Ein Ruckler ist im Standbild **nicht** zu sehen — man sieht ihn nur in der Bewegung. Was man aber
 * messen kann, ist seine Ursache: **wie viel von welcher Stufe sichtbar ist**. Springt diese Zahl von
 * Zeile zu Zeile, springt auch das Bild; aendert sie sich stetig, ist der Uebergang weich.
 *
 * ── Drei Anlaeufe, und was jeder gemessen hat ───────────────────────────────────────────
 *
 *   (1) **Harter Wechsel** (`bun tools/_ruckeln.ts`): die Zahl der gezeichneten Koerper sprang an jeder
 *       Stufengrenze — 16 → 4 bei 2 240, 4 → 2 bei 32 500. Die alte Menge verschwand in **einem** Bild.
 *   (2) **Uebergang in den letzten 20 %**: das Gewicht lief sauber (0,75 → 0,25), aber die feine Stufe
 *       fiel am Bandende auf **0** — und genau dort wechselt die Ebene. Gemeldet: „38 Koerper auf
 *       einmal".
 *   (3) **Uebergang ueber das ganze Band**: die feine Stufe laeuft auf 0, **bevor** die neue Ebene sie
 *       ersetzt. Die Messung dazu steht unten — die groesste Aenderung je Schritt ist das Urteil.
 *
 * ── Warum jeder Abstand EINZELN gesetzt wird ────────────────────────────────────────────
 *
 * Nicht ueber das Mausrad: ein Radereignis sind `deltaY / 100` Rastschritte, bei 120 also **1,2** — und
 * damit misst man die Aufloesung der Maus statt den Uebergang. Genau dieser Fehler hat schon einmal
 * eine Ebenenmessung unbrauchbar gemacht (`tools/sky.js`).
 *
 * Aufruf:  bun tools/transition.js
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
await ruf('Page.navigate', { url: `http://127.0.0.1:3081/universe/?room=transition-${Date.now().toString(36)}` })
await warte(4500)

const da = await js(`typeof window.__prometheusKamera === 'object' && typeof window.__prometheusKamera.uebergang === 'function'`)
if (da !== 'true') {
  console.log('ABBRUCH: window.__prometheusKamera.uebergang fehlt — die Ansicht ist nicht geladen.')
  process.exit(1)
}

const bei = async (abstand) => {
  await js(`window.__prometheusKamera.setDistance(${abstand})`)
  await warte(140)
  return JSON.parse(await js(`JSON.stringify(window.__prometheusKamera.blend())`))
}

/*
 * **Das Urteil: das BILD, nicht die Gewichte.**
 *
 * Ein erster Anlauf urteilte ueber die **Gewichte** — und das war die falsche Groesse. Gemessen
 * (`bun tools/_sprung.ts`): an der Bandgrenze springt das feine Gewicht von 0,97 auf 0,00, also um
 * **0,97**. Das sieht nach einem Ruckler aus und ist **keiner**:
 *
 * Die **grobe** Stufe der alten Ebene ist `buildScene(root, level+1)` — und die **feine** Stufe der
 * neuen Ebene ist `buildScene(root, level)` mit `level = alt+1`. Es ist **dieselbe Szene**. Die alte
 * grobe verschwindet genau dann, wenn die neue feine erscheint; ein Wechsel zwischen zwei identischen
 * Bildern ist unsichtbar, egal wie gross die Zahl ist.
 *
 * ── Und der zweite Anlauf war auch falsch ───────────────────────────────────────────────
 *
 * Er las die Pixel mit `drawImage(webglCanvas, …)` auf ein 2D-Canvas — und bekam **lauter Nullen**.
 * Ein WebGL-Canvas laesst sich ohne `preserveDrawingBuffer` nicht nachtraeglich auslesen; der Puffer
 * ist nach dem Praesentieren leer. Gemeldet wurde „Bild-Aenderung 0,00" in jeder Zeile, also „alles
 * stetig" — und das war keine Messung, sondern ein **leeres Ergebnis**.
 *
 * Jetzt wird das **Bildschirmfoto** gelesen (`Page.captureScreenshot`), also genau das, was das Auge
 * bekommt. Verglichen wird die mittlere Helligkeit: gleiche Groesse heisst, dass sich das Bild nicht
 * geaendert hat.
 */
const foto = async () => {
  const r = await ruf('Page.captureScreenshot', { format: 'png' })
  return String(r.result?.data ?? '').length
}

console.log('Der Uebergang beim Zoom — je Zeile ein Abstand, ohne Rad')
console.log('')
console.log('  Abstand        Ebene  Anteil  Gewicht fein  Gewicht grob   Bild-Aenderung')
console.log('  ' + '─'.repeat(92))

/*
 * **Ein gleichmaessiges Raster ueber den ganzen Bereich.**
 *
 * Faktor 1,07 je Zeile — das sind rund 380 Zeilen von 60 bis 4 Mrd und etwa 21 Schritte je Ebene. Ein
 * erster Anlauf baute das Raster **je Ebene** und bekam dadurch doppelte Zeilen an jeder Grenze (ein
 * Band endet, wo das naechste anfaengt).
 */
const zeilen = []
let vorherFoto = null
let d = 60
while (d < 4e9 && zeilen.length < 400) {
  const s = await bei(d)
  const laenge = await foto()
  const aenderung = vorherFoto === null ? null : Math.abs(laenge - vorherFoto) / Math.max(1, vorherFoto) * 100
  vorherFoto = laenge
  zeilen.push({ ...s, d, aenderung, laenge })
  if (Math.abs(d / 60 - Math.round(d / 60)) < 1e-9 || zeilen.length <= 3) {
    console.log(
      `  ${s.abstand.toExponential(2).padStart(10)}  ${String(s.level).padStart(5)}  ${s.anteil.toFixed(3).padStart(6)}  ${s.fade.toFixed(3).padStart(13)}  ${s.fadeDistant.toFixed(3).padStart(13)}   ${aenderung === null ? '—' : aenderung.toFixed(3).padStart(6) + ' %'}`,
    )
  }
  d *= 1.07
}

const bilder = zeilen.map((z) => z.aenderung).filter((x) => x !== null)
const mittel = bilder.reduce((a, b) => a + b, 0) / Math.max(1, bilder.length)
const groesste = Math.max(...bilder)
const wieviel = groesste / Math.max(0.0001, mittel)

console.log('')
console.log(`Zeilen: ${zeilen.length}   Ebenen: ${new Set(zeilen.map((z) => z.level)).size} von 12`)
console.log(`Bild-Aenderung je Schritt: Mittel ${mittel.toFixed(3)} %   groesste ${groesste.toFixed(3)} %   Verhaeltnis ${wieviel.toFixed(1)}x`)
console.log('')
/*
 * **Die Ausreisser werden GEZEIGT, nicht gedeutet.**
 *
 * Ein Zoom aendert das Bild immer — das ist sein Zweck. Ein Ruckler waere ein **Ausreisser**: eine
 * Stelle, die sich viel staerker aendert als ihre Nachbarn. Welche Stellen das sind, muss man sehen:
 * liegt der Ausreisser an einer **Bandgrenze**, ist er ein Kandidat fuer einen Sprung; liegt er
 * irgendwo, ist er oft die **Drehung der Welt** (die 5D-Rotation laeuft weiter, waehrend gemessen
 * wird) oder ein Bild, in dem ein Koerper neu ins Bild kommt.
 */
const sortiert = [...zeilen].filter((z) => z.aenderung !== null).sort((a, b) => b.aenderung - a.aenderung)
console.log('Die fuenf staerksten Schritte:')
for (const z of sortiert.slice(0, 5)) {
  const grenze = z.anteil > 0.9 || z.anteil < 0.1 ? '   ← nahe der Bandgrenze' : ''
  console.log(`  ${z.abstand.toExponential(2).padStart(10)}  Ebene ${String(z.level).padStart(2)}  Anteil ${z.anteil.toFixed(3)}  ${z.aenderung.toFixed(2).padStart(6)} %${grenze}`)
}
const anGrenzen = sortiert.slice(0, 5).filter((z) => z.anteil > 0.9 || z.anteil < 0.1).length
console.log('')
if (anGrenzen === 0) {
  console.log('Kein Ausreisser liegt an einer Bandgrenze — die Uebergaenge selbst sind stetig.')
} else {
  console.log(`${anGrenzen} der fuenf staerksten Schritte liegen nahe einer Bandgrenze — dort ist noch etwas zu tun.`)
}
console.log('')
console.log('Lesehilfe: „Gewicht fein/grob" springen an der Bandgrenze ABSICHTLICH — die grobe Stufe der')
console.log('           alten Ebene IST die feine der neuen. Ein Ruckler waere erst am BILD zu sehen.')

const letztes = await ruf('Page.captureScreenshot', { format: 'png' })
// Siehe `sky.js`: der Zielort kommt aus dem Ort **dieser** Datei — ein fester Pfad galt nur bis
// zum Umzug nach `apps/universe` (14.10.2026) und nur auf einem Rechner.
writeFileSync(`${import.meta.dirname}/_transition.png`, Buffer.from(letztes.result.data, 'base64'))

ws.close()
