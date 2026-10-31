/**
 * **Lädt die Marken-Schrift — und steht die Oberfläche?**
 *
 * **Warum dieses Werkzeug.** Der Betreiber: „starte mal das neu evt liegt es an dem". Der Neustart hat
 * einen Fehler **sichtbar** gemacht, der vorher still war:
 *
 *     The request id "…/ui-theme/src/styles/montserrat-medium.woff2" is outside of Vite serving
 *     allow list.
 *
 * Über zwei Stunden lang hatte der laufende Server die Schriftdateien noch ausgeliefert; nach dem
 * Neustart waren sie gesperrt. **Die Marken-Schrift fiel also auf die Systemschrift zurück** — und das
 * ist einer der Gründe, warum die Oberfläche „fremd" aussah.
 *
 * Dieses Werkzeug prüft drei Dinge, die man sonst nur vermuten kann:
 *
 *   1. **Ist die Schrift geladen?** `document.fonts.check('12px Montserrat')` — nicht der Name im
 *      CSS, sondern die tatsächlich verfügbare Schrift.
 *   2. **Kam die Schriftdatei überhaupt an?** Die Netzwerkantworten der Seite (`performance`), damit
 *      ein 404 nicht als „Schrift geladen" durchgeht.
 *   3. **Steht die Oberfläche?** Ansicht, Kopfzeile, Zustand, Beschriftungen — und ob der Bildlauf
 *      läuft (zwei Aufnahmen im Abstand).
 *
 * Aufruf:  bun tools/font.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `schrift-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

const seite = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
).json()
const ws = new WebSocket(seite.webSocketDebuggerUrl)
await new Promise((f) => ws.addEventListener('open', f))

const meldungen = []
let laufend = 0
const ruf = (method, params = {}) =>
  new Promise((fertig) => {
    const id = ++laufend
    const horcher = (e) => {
      const d = JSON.parse(e.data)
      if (d.id === id) {
        ws.removeEventListener('message', horcher)
        fertig(d)
        return
      }
      if (d.method === 'Runtime.exceptionThrown') {
        meldungen.push(`AUSNAHME: ${d.params?.exceptionDetails?.exception?.description ?? '—'}`)
      }
      if (d.method === 'Log.entryAdded') {
        const e2 = d.params?.entry
        if (e2 && e2.level !== 'info') meldungen.push(`log.${e2.level} (${e2.source}): ${e2.text}`)
      }
    }
    ws.addEventListener('message', horcher)
    ws.send(JSON.stringify({ id, method, params }))
  })
const warte = (ms) => new Promise((f) => setTimeout(f, ms))

await ruf('Runtime.enable')
await ruf('Log.enable')
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await ruf('Page.navigate', { url: URL_APP })
await warte(4000)

// In die Welt schalten — die Oberfläche, um die es geht.
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

const stand = await ruf('Runtime.evaluate', {
  expression: `(async () => {
    /*
     * **Erst warten, dann fragen.**
     *
     * document.fonts.check antwortet sofort mit „nein", wenn die Schrift noch lädt — das wäre ein
     * Fehlalarm. document.fonts.ready wartet, bis alle Anfragen abgeschlossen sind.
     *
     * **Und keine Backticks in diesem Kommentar.** Sie beenden das Template-Literal, in dem der
     * Ausdruck steht — der Fehler ist in diesem Projekt schon zweimal passiert und kostete jedes Mal
     * eine Runde. Deshalb: in eingebettetem Code werden Namen ohne Auszeichnung genannt.
     */
    await document.fonts.ready;
    const schriften = [...document.fonts].map((f) => f.family + ' ' + f.weight + ' ' + f.status);
    const dateien = performance.getEntriesByType('resource')
      .filter((r) => /woff2?|ttf|otf/i.test(r.name))
      .map((r) => r.name.split('/').pop() + '  ' + Math.round(r.transferSize ?? 0) + ' B');
    const lbl = [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none');
    return JSON.stringify({
      montserratGeladen: document.fonts.check('12px Montserrat'),
      schriften,
      schriftdateien: dateien,
      marke: (() => { const e = document.querySelector('#hudLine'); return e ? getComputedStyle(e).fontFamily : 'FEHLT' })(),
      kopf: (document.getElementById('hudLine') || {}).textContent,
      namen: lbl.map((l) => l.textContent.trim()),
      ansicht: ['screen-chat','screen-web','screen-os'].filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') }).join(',') || 'KEINE',
    });
  })()`,
  returnByValue: true,
  awaitPromise: true,
})

const a = await ruf('Page.captureScreenshot', { format: 'png' })
await warte(900)
const b = await ruf('Page.captureScreenshot', { format: 'png' })
const laeuft = a.result?.data !== b.result?.data

console.log(`Zustand: ${stand.result?.result?.value ?? '—'}`)
console.log(`Bildlauf: ${laeuft ? 'läuft' : 'steht'}`)
console.log('')
console.log(`Meldungen (${meldungen.length}):`)
for (const m of meldungen.slice(0, 10)) console.log(`  ${m}`)
if (meldungen.length === 0) console.log('  (keine)')

await Bun.write(
  `${import.meta.dirname}/font.png`,
  Buffer.from(a.result.data, 'base64'),
)
console.log('Bild: tools/font.png')
ws.close()
process.exit(0)
