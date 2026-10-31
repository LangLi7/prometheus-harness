/**
 * **Eine Bezugsebene ansehen** — die Kamera auf einen Abstand setzen, der diese Ebene ergibt.
 *
 * **Warum dieses Werkzeug.** Der Startblick ist Ebene 4 (Abstand 4 761). Ebene 7 („Galaxie") ist
 * rund **70 000** Einheiten weit weg — dorthin zu radeln wäre in einem Werkzeug ein Dutzend
 * Eingaben, und jede davon könnte danebengehen. Ausserdem ist der Abstand dann **geraten**, und eine
 * Messung mit geratenem Abstand ist keine.
 *
 * **Wie es den Abstand bestimmt.** Aus `levelForDistance` in `camera.ts` rückwärts: die Ebenen
 * wechseln bei 300 / 1150 / 4500 / 17950 …, also wird die Mitte des Bereichs genommen, der zu dieser
 * Ebene gehört. Die Zahlen stehen in `LEVELS` und werden **von dort gelesen**, nicht abgeschrieben.
 *
 * **Und es wird protokolliert, was zu sehen ist.** Von jedem Körper auf der Ebene werden Lage,
 * Grösse und Farbe gelesen; die Pixelfläche des Canvas wird gezählt. Das ist der Unterschied
 * zwischen „die Galaxie fehlt" und „die Galaxie ist da und man sieht sie nicht".
 *
 * Aufruf:  bun tools/level.js <1-7> [ziel.png]
 */
import { distanceForLevel, levelForDistance } from '../src/camera'

const EBENE = Number(Bun.argv[2] ?? 7)
const ZIEL = Bun.argv[3] ?? `${import.meta.dirname}/level.png`
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `ebene${EBENE}-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

/**
 * **Der Abstand, der diese Ebene ergibt — aus der Anwendung, nicht nachgebaut.**
 *
 * Hier stand zuerst eine eigene Rechnung über die Grenzen aus `LEVELS` („die Mitte des Bereichs").
 * Sie war unnötig: `camera.ts` hat dafür `distanceForLevel`, und das ist genau die Funktion, die
 * eine Sprungmarke oder ein Befehl benutzt. Ein Werkzeug, das die Anwendung **nachbaut**, prüft die
 * Nachbildung — der Fehler, an dem `opening-view.test.ts` schon einmal grün war, während das Bild
 * falsch war.
 */
const abstand = distanceForLevel(EBENE)
// Und die Gegenprobe bleibt: der Abstand muss auch wirklich diese Ebene ergeben.
const pruefung = levelForDistance(abstand)
if (pruefung !== EBENE) {
  throw new Error(`Abstand ${abstand.toFixed(0)} ergibt Ebene ${pruefung}, nicht ${EBENE}`)
}
console.log(`Ebene ${EBENE}: Abstand ${abstand.toFixed(0)} (aus distanceForLevel)`)

const antwort = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
const seite = await antwort.json()
const ws = new WebSocket(seite.webSocketDebuggerUrl)
await new Promise((fertig, fehler) => {
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
  ws.send(JSON.stringify({ id, method, params }))
  return await antwort
}
const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms))

await ruf('Runtime.enable')
/*
 * **`Page.enable` — ohne das wirkt die Vorbelegung nicht.**
 *
 * `Page.addScriptToEvaluateOnNewDocument` gehört zur `Page`-Domäne. Ohne `Page.enable` wird der
 * Aufruf mit einer `identifier` beantwortet — er **sieht erfolgreich aus** —, aber das Skript läuft
 * nie. Gemessen (`tools/diag-preset.js`): die Marke, die es setzen sollte, war `null`, und der
 * Abstand blieb der Startwert.
 *
 * Eine Antwort ohne Wirkung ist die unangenehmste Sorte Fehler. Drei Anläufe haben daran geglaubt,
 * den Kamerazustand setzen zu können, und jeder hat stumm den **alten** Zustand gemessen.
 */
await ruf('Page.enable')
await ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})

/*
 * **Und es wird geprüft, ob der Wert wirklich angekommen ist.**
 *
 * Nach dem Laden wird **sofort** gelesen — nicht am Ende. Der Unterschied ist entscheidend:
 * `save()` schreibt erst beim Entladen, also ist der Wert nach dem Laden der **Startzustand**, den
 * die Anwendung gelesen hat. Am Ende gelesen wäre er nur die Meinung der Anwendung über sich selbst.
 */
const start = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const schluessel = 'prometheus.${RAUM}.world.v1';
    const roh = localStorage.getItem(schluessel);
    return JSON.stringify({
      gefunden: roh !== null,
      abstand: roh ? JSON.parse(roh).camera?.distance : null,
      alleSchluessel: Object.keys(localStorage).filter((k) => k.includes('world')),
    });
  })()`,
  returnByValue: true,
})
console.log(`Nach dem Laden: ${start.result?.result?.value}`)
/*
 * **Eine leere Seite zuerst — und dann die Vorbelegung einhängen.**
 *
 * Die Reihenfolge ist der ganze Punkt. `json/new?<url>` startet die Anwendung **sofort**, und danach
 * hilft `addScriptToEvaluateOnNewDocument` für **diese** Ladung nicht mehr — es gilt erst für die
 * nächste. Also: leere Seite (keine Anwendung), Skript einhängen, **dann** die Anwendung laden.
 */
await ruf('Page.navigate', { url: 'about:blank' })
await warte(300)
const abstandGesetzt = `(() => {
  try {
    localStorage.setItem(${JSON.stringify(`prometheus.${RAUM}.world.v1`)}, JSON.stringify({
      camera: { focus: [0, 0, 0], distance: ${abstand}, orientation: [0, 0, 0, 1] },
      mode: 'os',
    }));
    return 'gesetzt';
  } catch (e) { return 'Fehler: ' + e.message; }
})()`
await ruf('Page.addScriptToEvaluateOnNewDocument', { source: abstandGesetzt })
await ruf('Page.navigate', { url: URL_APP })
await warte(3500)

// In die Welt schalten — über die Insel, wie ein Nutzer.
const inDieWelt = `(() => {
  const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  ruf(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  ruf(welt, 'click');
  return 'ok';
})()`
await ruf('Runtime.evaluate', { expression: inDieWelt, returnByValue: true })
await warte(1500)

/**
 * **Was steht auf dem Bildschirm — und wie hell ist es?**
 *
 * „Die Galaxie fehlt" und „die Galaxie ist da, aber dunkel" sind zwei verschiedene Befunde. Die
 * Pixelfläche unterscheidet sie: gezählt werden Pixel über einer Helligkeitsschwelle, und dazu der
 * hellste Wert. Ohne diese Zahl wäre „fehlt" eine Behauptung über einen schwarzen Bildschirm.
 */
const bericht = `(() => {
  const canvas = document.getElementById('world');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const w = canvas.width, h = canvas.height;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let hell = 0, max = 0, summe = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] + px[i+1] + px[i+2]) / 3;
    summe += v;
    if (v > max) max = v;
    if (v > 12) hell += 1;
  }
  /*
   * **Der Sternenhimmel ist ein CSS-Hintergrund, kein 3D-Objekt.**
   *
   * Er kommt als SVG-Daten-URL über die Variable \`--starfield\`. Er wird hier mitgelesen, weil „die
   * Sterne fehlen" zwei Ursachen haben kann — die Variable ist leer, oder sie ist gesetzt und wird
   * nicht gezeichnet. Das sind zwei verschiedene Fehler, und die Zahl unterscheidet sie.
   */
  const stage = document.querySelector('.stage') || document.body;
  const cs = getComputedStyle(stage);
  return JSON.stringify({
    ebene: (document.getElementById('hudLine') || {}).textContent,
    pille: (document.querySelector('#isl .mini') || {}).textContent,
    namen: [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none').map((l) => l.textContent.trim()),
    canvasPix: w + 'x' + h,
    ueberSchwelle: hell,
    hellster: Math.round(max),
    mittel: (summe / (px.length / 4)).toFixed(2),
    sternfeldVar: cs.getPropertyValue('--starfield').slice(0, 48),
    sternfeldBild: cs.backgroundImage.slice(0, 48),
  });
})()`
const stand = await ruf('Runtime.evaluate', { expression: bericht, returnByValue: true })
console.log(`Bild: ${stand.result?.result?.value}`)

/*
 * **Der gesetzte Abstand wird nachgelesen.**
 *
 * Ein Werkzeug, das mit `localStorage` arbeitet, muss **prüfen**, ob der Wert angekommen ist — sonst
 * misst es stumm den alten Zustand. Genau das ist passiert: gesetzt waren 573 440, im HUD stand
 * „4,8 k". Ohne diese Zeile hätte ich den Befund „die Galaxie ist schwarz" genannt, obwohl die
 * Kamera einfach noch am Sonnensystem stand.
 */
const zurueck = await ruf('Runtime.evaluate', {
  expression: `(() => { const p = JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1') || 'null'); return p ? p.camera.distance : 'kein Eintrag'; })()`,
  returnByValue: true,
})
console.log(`Abstand jetzt gemerkt: ${zurueck.result?.result?.value}  (gesetzt war ${abstand})`)

const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
await Bun.write(ZIEL, Buffer.from(schuss.result.data, 'base64'))
console.log(`Bild geschrieben: ${ZIEL}`)
ws.close()
process.exit(0)
