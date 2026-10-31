/**
 * **Ein Bild der Welt machen** — über CDP, ohne Fenster.
 *
 * **Warum das hier in JavaScript steht und nicht in PowerShell.** Das Vorgängerwerkzeug
 * (`shot.ps1`) baute auf `[System.Net.WebSockets.ClientWebSocket]` und `Invoke-WebRequest` auf.
 * Auf diesem Rechner ist die Ausführung von Skripten gesperrt (ExecutionPolicy), und
 * `pwsh -File …` scheitert daran — **gemessen**, nicht vermutet:
 *
 *     & pwsh -NoProfile -File tools\shot.ps1
 *     → Die Datei … kann nicht geladen werden, weil das Ausführen von Skripten … deaktiviert ist.
 *
 * Bun hat WebSocket und `fetch` eingebaut, also braucht das Werkzeug **keine** Abhängigkeit und
 * **keine** Policy. Es ersetzt `shot.ps1` vollständig.
 *
 * Aufruf:  bun tools/shot.js [url] [ziel]
 */
const URL_APP = Bun.argv[2] ?? 'http://127.0.0.1:3081/universe/?room=measure'
const ZIEL = Bun.argv[3] ?? `${import.meta.dirname}/shot.png`
const PORT = Number(process.env.CDP_PORT ?? 9223)

/** Eine Seite aufmachen und ihren WebSocket-Pfad holen. */
async function neueSeite() {
  const antwort = await fetch(`http://127.0.0.1:${PORT}/json/new?${URL_APP}`, { method: 'PUT' })
  if (!antwort.ok) throw new Error(`CDP /json/new: HTTP ${antwort.status}`)
  return await antwort.json()
}

/** Eine Nachricht senden und auf die Antwort mit derselben id warten. */
function verbinde(wsUrl) {
  const ws = new WebSocket(wsUrl)
  const offen = new Promise((fertig, fehler) => {
    ws.addEventListener('open', () => fertig())
    ws.addEventListener('error', () => fehler(new Error('WebSocket-Fehler')))
  })
  const wartende = new Map()
  ws.addEventListener('message', (ereignis) => {
    const nachricht = JSON.parse(String(ereignis.data))
    const loeser = wartende.get(nachricht.id)
    if (loeser) {
      wartende.delete(nachricht.id)
      loeser(nachricht)
    }
  })
  let naechste = 1
  const ruf = async (method, params = {}) => {
    const id = naechste++
    const antwort = new Promise((fertig, fehler) => {
      wartende.set(id, fertig)
      setTimeout(() => fehler(new Error(`${method}: Zeitüberschreitung`)), 20_000)
    })
    await offen
    ws.send(JSON.stringify({ id, method, params }))
    return await antwort
  }
  return { ruf, schliessen: () => ws.close() }
}

const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms))

const seite = await neueSeite()
const cdp = verbinde(seite.webSocketDebuggerUrl)

// **Der Bildausschnitt wird gesetzt, nicht erfragt.** Ein kopfloses Fenster hat 764 px Breite —
// unter dem Umbruchpunkt der Oberfläche, und dann schaltet sie in den Chat. Geklickt wird also auf
// einem 1440×900 grossen Bild, so wie ein Nutzer es sieht.
await cdp.ruf('Runtime.enable')
await cdp.ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})

/*
 * **Den gemerkten Startblick wegwerfen.**
 *
 * Die Kamera wird je Raum in `localStorage` gemerkt (`loadPersist`). Wer ein Bild macht, um eine
 * **Änderung am Startblick** zu prüfen, sieht sonst den alten Stand — und schliesst daraus, die
 * Änderung habe nichts bewirkt. Genau das ist beim ersten Lauf passiert: die Kamera stand bei
 * 11 049, obwohl `openingView` längst neu rechnete.
 *
 * **Und das Löschen allein genügt nicht.** Ein Lauf mit `removeItem` und danach `Page.reload` las
 * hinterher trotzdem den alten Abstand (gemessen: 954,9 statt 4761,2): `save()` am `beforeunload`
 * schreibt beim Entladen genau das zurück, was gerade gelöscht wurde. Deshalb wird die Seite
 * **verlassen** und neu geladen — beim Wegnavigieren kommt die Anwendung nicht mehr zum Speichern.
 *
 * Ohne diese Zeilen ist **jedes** Bild ein Zufallsbild: es hängt davon ab, was der vorige Lauf
 * gemacht hat.
 */
const leeren = `(() => {
  const weg = [];
  for (const k of Object.keys(localStorage)) {
    if (k.includes('.world.')) { weg.push(k); localStorage.removeItem(k); }
  }
  return weg.join(',') || '(nichts gemerkt)';
})()`
const gemerkt = await cdp.ruf('Runtime.evaluate', { expression: leeren, returnByValue: true })
console.log(`Gemerkter Stand verworfen: ${gemerkt.result?.result?.value ?? '—'}`)

await cdp.ruf('Page.navigate', { url: 'about:blank' })
await warte(400)
await cdp.ruf('Page.navigate', { url: URL_APP })
await warte(3500)

// In die Welt schalten — über die Insel, wie ein Nutzer.
const klick = `(() => {
  const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  ruf(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  ruf(welt, 'click');
  return 'geklickt';
})()`
await cdp.ruf('Runtime.evaluate', { expression: klick, returnByValue: true, awaitPromise: true })
await warte(1500)

const schuss = await cdp.ruf('Page.captureScreenshot', { format: 'png' })

/*
 * **Die Konsole mitlesen.** Ein Bild zeigt, *dass* etwas fehlt; die Konsole zeigt oft, *warum*.
 * Beim Sonnen-SVG war die Frage „Textur lädt nicht oder Zeichnung ist flach" — und die Antwort
 * steht in einer Fehlermeldung, die sonst niemand sieht.
 */
const meldungen = await cdp.ruf('Runtime.evaluate', {
  expression: `JSON.stringify((window.__fehlerLog ?? []).concat(
    [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none')
      .map((l) => 'label: ' + l.textContent.trim())))`,
  returnByValue: true,
})
console.log(`Kontrolle: ${meldungen.result?.result?.value ?? '—'}`)

if (schuss.result?.data) {
  await Bun.write(ZIEL, Buffer.from(schuss.result.data, 'base64'))
  console.log(`Bild geschrieben: ${ZIEL}`)
} else {
  console.log('--- KEIN BILD ---')
  console.log(JSON.stringify(schuss, null, 2))
}

cdp.schliessen()
process.exit(0)
