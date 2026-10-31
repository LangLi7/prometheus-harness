/**
 * **Die Bewegung messen** — nicht behaupten, daß sie da ist.
 *
 * ## Warum es dieses Werkzeug gibt
 *
 * Am 15.10.2026 bat der Betreiber: *„alles was mit design und animation … smooth und modern
 * professionell ist"*. Danach stand in `app.css` ein Übergang an der Insel — und die Frage „ist er
 * auch **da**?" ist keine Frage des Lesens: eine `transition`-Zeile kann von einer spezifischeren
 * Regel überschrieben, von einem `display: none` verschluckt oder von einer Kurve ohne Wirkung
 * begleitet sein. Nichts davon sieht man dem Quelltext an.
 *
 * **Der erste Anlauf dieses Werkzeugs hat sich selbst getäuscht.** Er klickte auf die Pille, um
 * aufzuklappen — und die Insel war schon offen, also maß er zwei gleiche Zahlen und meldete
 * „Breite 560, Breite 560". **Eine Messung ohne Zustandsprüfung ist ein Zufallsbild.** Jetzt wird
 * vorher **zugemacht** (über den ✕ der Insel, wie ein Nutzer) und die geschlossene Breite
 * **ausgegeben**: wer die Zeile liest, sieht, daß die Messung von 360 px aus startet.
 *
 * ## Was gemessen wird
 *
 * Die Breite, die Höhe und der Radius der Insel — **in jedem Bild**, ab dem Klick. Das ist die
 * Kurve. Und dasselbe noch einmal mit `prefers-reduced-motion: reduce`: dann muß die Kurve
 * **flach** sein (ein Sprung), und zwar ohne daß eine Zeile überschrieben wurde.
 *
 * Aufruf:  bun tools/motion.js [url]
 *
 * @module tools/motion
 */

const URL_APP = Bun.argv[2] ?? 'http://127.0.0.1:3081/universe/?room=motion'
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
      setTimeout(() => fehler(new Error(`${method}: Zeitüberschreitung`)), 30_000)
    })
    await offen
    ws.send(JSON.stringify({ id, method, params }))
    return await antwort
  }
  return { ruf, schliessen: () => ws.close() }
}

const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms))

/**
 * **Die Abtastung, im Browser.**
 *
 * Sie läuft **in der Seite** und nicht von hier aus: eine Messung über die Leitung kostet pro Wert
 * eine Netzwerkrunde (gemessen 100–300 ms), und eine Kurve von 440 ms wäre damit nicht zu sehen —
 * man bekäme drei Punkte, alle am Ende. `requestAnimationFrame` in der Seite liefert jeden Frame.
 *
 * **Und die geschlossene Breite wird mitgegeben.** Ohne sie steht in der Ausgabe eine Zahlenreihe,
 * deren Anfang man nicht kennt — und „560, 560, 560" sieht dann aus wie eine Bewegung.
 */
const ABTASTEN = (dauer) => `(async () => {
  const w = (ms) => new Promise((f) => setTimeout(f, ms));
  const klick = (el) => el && el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  // 1. In die WELT schalten — sonst gilt die Insel der Vorlage.
  klick(document.querySelector('#isl .mini')); await w(600);
  const os = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  if (os) { klick(os); await w(900); }

  const insel = document.querySelector('#isl');
  // 2. ZUMACHEN — über den eigenen ✕-Knopf, wie ein Nutzer. Ohne das ist jede Messung ein Zufallsbild.
  const x = insel.querySelector('.x');
  if (x) { klick(x); await w(900); }
  const zu = Math.round(insel.getBoundingClientRect().width);
  if (zu >= 500) return JSON.stringify({ fehler: 'die Insel war nicht zuzumachen: ' + zu + ' px' });

  // 3. Aufklappen und jeden Frame abtasten.
  const reihe = [];
  const start = performance.now();
  klick(document.querySelector('#isl .mini'));
  await new Promise((fertig) => {
    const tippen = () => {
      const t = Math.round(performance.now() - start);
      const r = insel.getBoundingClientRect();
      reihe.push([t, Math.round(r.width), Math.round(r.height), Math.round(parseFloat(getComputedStyle(insel).borderRadius))]);
      if (t < ${String(dauer)}) requestAnimationFrame(tippen); else fertig();
    };
    requestAnimationFrame(tippen);
  });
  return JSON.stringify({
    zu,
    reihe,
    reduziert: matchMedia('(prefers-reduced-motion: reduce)').matches,
    dauer: getComputedStyle(insel).transitionDuration,
  });
})()`

/** Eine Zahlenreihe als Kurve lesen: wie viele verschiedene Breiten kamen vor? */
function stufen(reihe) {
  return new Set(reihe.map((p) => p[1])).size
}

const seite = await neueSeite()
const cdp = verbinde(seite.webSocketDebuggerUrl)
await cdp.ruf('Runtime.enable')
await cdp.ruf('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await warte(3000)

async function lauf(beschriftung, reduzieren) {
  await cdp.ruf('Emulation.setEmulatedMedia', {
    features: reduzieren ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  })
  await warte(300)
  const antwort = await cdp.ruf('Runtime.evaluate', { expression: ABTASTEN(700), returnByValue: true, awaitPromise: true })
  const roh = antwort.result?.result?.value
  if (typeof roh !== 'string') {
    console.log(`${beschriftung}: KEINE ANTWORT`)
    console.log(JSON.stringify(antwort).slice(0, 400))
    return null
  }
  const daten = JSON.parse(roh)
  if (daten.fehler) {
    console.log(`${beschriftung}: ${daten.fehler}`)
    return null
  }
  console.log(`\n== ${beschriftung} ==`)
  console.log(`  geschlossen: ${String(daten.zu)} px   ·   reduced-motion: ${String(daten.reduziert)}   ·   Dauer laut CSS: ${daten.dauer}`)
  console.log('    t/ms   Breite  Hoehe  Radius')
  for (const p of daten.reihe) {
    if (p[0] % 60 < 20 || p === daten.reihe.at(-1)) {
      console.log(`  ${String(p[0]).padStart(6)}  ${String(p[1]).padStart(6)}  ${String(p[2]).padStart(5)}  ${String(p[3]).padStart(6)}`)
    }
  }
  console.log(`  → ${String(daten.reihe.length)} Bilder, ${String(stufen(daten.reihe))} verschiedene Breiten`)
  return daten
}

const mitBewegung = await lauf('MIT Bewegung', false)
const ohneBewegung = await lauf('OHNE Bewegung (prefers-reduced-motion: reduce)', true)

console.log('\n== BEFUND ==')
let fehler = 0
if (!mitBewegung || !ohneBewegung) {
  fehler = 1
} else {
  const stufenMit = stufen(mitBewegung.reihe)
  const stufenOhne = stufen(ohneBewegung.reihe)
  console.log(`  MIT  Bewegung: ${String(stufenMit)} Breiten zwischen ${String(mitBewegung.zu)} und 560 px`)
  console.log(`  OHNE Bewegung: ${String(stufenOhne)} Breite(n) — ein Sprung`)
  if (stufenMit < 5) {
    console.log('  FEHLER: die Insel springt, statt sich zu bewegen — der Übergang wirkt nicht.')
    fehler += 1
  }
  if (stufenOhne > 2) {
    console.log('  FEHLER: mit `prefers-reduced-motion: reduce` bewegt sich die Insel trotzdem.')
    fehler += 1
  }
  if (fehler === 0) console.log('  Die Insel bewegt sich — und wer keine Bewegung will, bekommt keine.')
}

cdp.schliessen()
process.exit(fehler > 0 ? 1 : 0)
