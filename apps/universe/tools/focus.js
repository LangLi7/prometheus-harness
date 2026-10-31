/**
 * **Ein Ausschnitt der Welt** — die Kamera auf einen Körper richten und ein Bild machen.
 *
 * **Warum dieses Werkzeug nötig war.** Der Betreiber hat zwei Dinge verlangt, die man nur im Bild
 * prüfen kann:
 *
 *   1. „name nur ab bestimmte grösse radius also fokusiert" — Beschriftungen erst, wenn ein Körper
 *      gross oder fokussiert ist.
 *   2. „es klicken zu können wäre einfach das man quasi es als objekt fokusieren kann".
 *
 * Ein Bild vom Startblick zeigt beides **nicht**: dort ist zu Recht nur die Sonne benannt. Ob die
 * Erdoberfläche, der Mond und die Ringe des Saturn da sind, sieht man erst, wenn man hinsieht —
 * also zoomt und klickt dieses Werkzeug wie ein Nutzer: über die Insel, per Rad, per Klick.
 *
 * Aufruf:  bun tools/focus.js <Name> [ziel.png] [zoomstufen]
 */
const NAME = Bun.argv[2] ?? 'Erde'
const ZIEL = Bun.argv[3] ?? `${import.meta.dirname}/focus.png`
const STUFEN = Number(Bun.argv[4] ?? 14)
const PORT = Number(process.env.CDP_PORT ?? 9223)
/*
 * **Jeder Lauf bekommt einen frischen Raum.**
 *
 * Hier stand zuerst ein Löschen von `localStorage` vor dem Neuladen. Es hält **nicht zuverlässig**:
 * gemessen startete ein Lauf bei 954,9 statt 4761,2, weil `save()` am `beforeunload` beim Verlassen
 * der Seite den alten Stand zurückschreibt — und das Wegnavigieren über `about:blank` half nur
 * manchmal.
 *
 * Ein **neuer Raum** ist keine Umgehung, sondern die ehrlichere Lösung: der Raum ist die Einheit, in
 * der ein Zustand gilt (`room.ts` → `storageKey(room, …)`). Ein neuer Raum heisst: kein gemerkter
 * Zustand, also der echte Startblick. Und für Messungen ist genau das die Voraussetzung.
 */
const RAUM = `mess-${Date.now().toString(36)}`
const URL_APP = `http://127.0.0.1:3081/universe/?room=${RAUM}`

async function neueSeite() {
  const antwort = await fetch(`http://127.0.0.1:${PORT}/json/new?${URL_APP}`, { method: 'PUT' })
  if (!antwort.ok) throw new Error(`CDP /json/new: HTTP ${antwort.status}`)
  return await antwort.json()
}

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

const seite = await neueSeite()
const cdp = verbinde(seite.webSocketDebuggerUrl)
await cdp.ruf('Runtime.enable')
await cdp.ruf('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
/*
 * **Und doch wird zusätzlich gelöscht — als zweite Sicherung.**
 *
 * Der frische Raum macht den gemerkten Stand schon unmöglich. Das Löschen bleibt trotzdem stehen, weil
 * es den **Werkzeug-Raum** `fokus` betrifft: wer mit `?room=fokus` von Hand nachsieht, soll dort den
 * Startblick finden und nicht den Stand des letzten Werkzeuglaufs.
 *
 * Der `about:blank`-Schritt ist dabei der wirksame Teil: `save()` am `beforeunload` schreibt beim
 * Entladen den Stand zurück, und dagegen hilft nur, die Seite vorher zu **verlassen**.
 */
const leeren = `(() => {
  const weg = [];
  for (const k of Object.keys(localStorage)) {
    if (k.includes('.world.')) { weg.push(k); localStorage.removeItem(k); }
  }
  return weg.join(',') || '(nichts)';
})()`
await cdp.ruf('Runtime.evaluate', { expression: leeren, returnByValue: true })
await cdp.ruf('Page.navigate', { url: 'about:blank' })
await warte(400)
await cdp.ruf('Page.navigate', { url: URL_APP })
await warte(3500)
console.log(`Raum: ${RAUM}`)

/*
 * **Den gemerkten Zustand mitlesen.**
 *
 * Er verrät den Abstand und die Drehlage, ohne dass die Szene etwas dafür hergeben muss. Ohne ihn
 * ist „ein Radereignis springt an die Untergrenze" nicht zu deuten: es könnte an der Eingabe liegen
 * oder daran, dass der Start schon woanders war.
 */
const gemerkt = await cdp.ruf('Runtime.evaluate', {
  expression: `(() => { const p = JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1') || 'null'); return p ? p.camera.distance.toFixed(1) + '|' + p.mode : 'kein Eintrag'; })()`,
  returnByValue: true,
})
console.log(`Gemerkt vor dem Zoom: ${gemerkt.result?.result?.value ?? '—'}`)

/**
 * **Den Zoom mitschreiben, statt ihn zu vermuten.**
 *
 * Ein Radereignis mit `deltaY: -240` sollte 2,4 Rastschritte sein und 4761 auf 2787 bringen. Gemessen
 * stand danach **0,5** — die Untergrenze. Zwischen „sollte" und „ist" liegt eine Annahme, und welche
 * falsch ist, sagt nur eine Aufzeichnung: der Zustand **vor** jedem Ereignis, das Ereignis selbst und
 * der Zustand danach.
 *
 * Der Abstand wird aus `localStorage` gelesen (`save()` schreibt ihn nach jedem Zoom), die Drehlage
 * ebenso. Damit ist der Verlauf vollständig, ohne dass die Szene etwas hergeben muss.
 */
const horcher = `(() => {
  window.__rad = [];
  const el = document.getElementById('world') || document.body;
  const abstand = () => {
    try { return JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1')).camera.distance; }
    catch { return null; }
  };
  el.addEventListener('wheel', (e) => {
    window.__rad.push({ deltaY: e.deltaY, notches: -e.deltaY / 100, vorher: abstand() });
  }, true);
  return 'horcher steht';
})()`
console.log((await cdp.ruf('Runtime.evaluate', { expression: horcher, returnByValue: true })).result?.result?.value)

/** In die Welt schalten — über die Insel, wie ein Nutzer. */
const inDieWelt = `(() => {
  const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  ruf(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  ruf(welt, 'click');
  return 'ok';
})()`
/** Der Abstand, wie ihn `save()` schreibt — nach jedem Eingriff lesbar. */
const abstandJetzt = async (marke) => {
  const r = await cdp.ruf('Runtime.evaluate', {
    expression: `(() => { try { const p = JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1')); return p.camera.distance + '|' + p.mode; } catch { return 'kein Eintrag'; } })()`,
    returnByValue: true,
  })
  console.log(`  Abstand ${marke}: ${r.result?.result?.value ?? '—'}`)
}

await abstandJetzt('nach dem Laden')
await cdp.ruf('Runtime.evaluate', { expression: inDieWelt, returnByValue: true })
await abstandJetzt('nach „in die Welt"')
await warte(1200)
await abstandJetzt('nach 1,2 s Wartezeit')

/*
 * **Zoomen wie ein Nutzer: mit dem Rad.**
 *
 * Nicht über `localStorage` und nicht über einen internen Aufruf. Der Zoom ist eine Eingabe, und
 * eine Eingabe, die das Werkzeug nicht macht, prüft auch nicht, ob sie funktioniert.
 */
const rad = (deltaY) => `(() => {
  const el = document.getElementById('world') || document.body;
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, bubbles: true, cancelable: true, clientX: 720, clientY: 450 }));
  return 'rad';
})()`

for (let i = 0; i < STUFEN; i++) {
  await cdp.ruf('Runtime.evaluate', { expression: rad(-240), returnByValue: true })
  await warte(90)
}
await warte(900)

/**
 * **Anklicken heisst fokussieren — und genau das wird hier geklickt.**
 *
 * Der Betreiber: „es klicken zu können wäre einfach das man quasi es als objekt fokusieren kann".
 * Geklickt wird auf einen Körper, **nicht** auf seine Beschriftung: `scene.ts` macht die Kugeln
 * anklickbar (`pickable`), und ein Klick darauf setzt den Fokus auf diesen Körper und wählt den
 * Abstand nach seiner Grösse.
 *
 * **Warum über die Szene und nicht über CSS.** Die Kugel ist ein Mesh in WebGL — sie hat kein
 * DOM-Element, auf das man klicken könnte. Der Klick geht also an **dieselbe Stelle im Canvas**, an
 * der der Körper steht; die Stelle wird aus seiner Bildschirmlage genommen.
 */
const klickAuf = (x, y) => `(() => {
  const el = document.getElementById('world') || document.body;
  const r = el.getBoundingClientRect();
  const cx = r.left + ${x}, cy = r.top + ${y};
  const grund = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, button: 0, buttons: 1, isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', grund));
  el.dispatchEvent(new PointerEvent('pointerup', { ...grund, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
  return cx.toFixed(0) + ',' + cy.toFixed(0);
})()`

// Zuerst herausfinden, wo die Erde auf dem Bildschirm steht — über ihre Beschriftung.
/**
 * **Der Klick geht auf eine Bildstelle — nicht auf einen Namen.**
 *
 * **Warum das so ist, und was daran ehrlich ist.** Der Betreiber will „es als Objekt fokussieren"
 * können, und die Szene macht genau das: ein Klick auf einen Körper setzt den Fokus auf ihn. Nur ist
 * ein Körper ein **Mesh in WebGL** — er hat kein DOM-Element, keinen `id`, keine Beschriftung, auf
 * die ein Werkzeug zeigen könnte.
 *
 * Der naheliegende Umweg war, die **Beschriftung** zu nehmen und 22 px darüber zu klicken. Er
 * scheitert an einer Regel, die der Betreiber selbst verlangt hat: auf dieser Ebene ist die Erde
 * **nicht benannt** (`14 px` Mindestgrösse), also ist ihr Element `display: none` und sein
 * `transform` leer. Gemessen: `Erde=none`, `Sonne=block`.
 *
 * Deshalb wird die Stelle **angegeben** statt gesucht. Sie kommt aus dem, was sonst gemessen wird:
 * der Bildlage der Bahn und der Kamera. Der Test ist damit: „ein Klick **hier** setzt den Fokus
 * dorthin" — und ob dort die Erde liegt, zeigt das Bild daneben.
 */
const Klick = (() => {
  const [x, y] = (Bun.argv[5] ?? '').split(',').map(Number)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
})()

if (Klick) {
  console.log(`Klick auf die Bildstelle ${Klick.x},${Klick.y}`)
  const vorher = await cdp.ruf('Runtime.evaluate', {
    expression: `(JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1')) || {}).camera?.focus?.join(',')`,
    returnByValue: true,
  })
  console.log(`Fokus vorher:   ${vorher.result?.result?.value ?? '—'}`)
  await cdp.ruf('Runtime.evaluate', { expression: klickAuf(Klick.x, Klick.y), returnByValue: true })
  await warte(1200)
  const nachher = await cdp.ruf('Runtime.evaluate', {
    expression: `(() => { const c = (JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1')) || {}).camera; return c ? c.focus.join(',') + '  abstand ' + c.distance.toFixed(1) : '—'; })()`,
    returnByValue: true,
  })
  console.log(`Fokus nachher:  ${nachher.result?.result?.value ?? '—'}`)
}

/** Was steht jetzt auf dem Bildschirm? */

/** Was steht jetzt auf dem Bildschirm? */
const bericht = `JSON.stringify({
  ebene: (document.getElementById('hudLine') || {}).textContent,
  alle: [...document.querySelectorAll('.label')].map((l) => l.textContent.trim() + '=' + getComputedStyle(l).display),
  namen: [...document.querySelectorAll('.label')].filter((l) => getComputedStyle(l).display !== 'none')
    .map((l) => l.textContent.trim() + '@' + Math.round(l.getBoundingClientRect().left) + ',' + Math.round(l.getBoundingClientRect().top)),
})`
const stand = await cdp.ruf('Runtime.evaluate', { expression: bericht, returnByValue: true })
console.log(`Nach ${STUFEN} Zoomstufen (${NAME}):`)
console.log(`  ${stand.result?.result?.value ?? '—'}`)

const verlauf = await cdp.ruf('Runtime.evaluate', {
  expression: `JSON.stringify(window.__rad ?? [])`,
  returnByValue: true,
})
console.log(`Verlauf (jedes Radereignis): ${verlauf.result?.result?.value ?? '—'}`)

const nachher = await cdp.ruf('Runtime.evaluate', {
  expression: `(JSON.parse(localStorage.getItem('prometheus.${RAUM}.world.v1')) || {}).camera?.distance`,
  returnByValue: true,
})
console.log(`Abstand nachher: ${nachher.result?.result?.value ?? '—'}`)

const schuss = await cdp.ruf('Page.captureScreenshot', { format: 'png' })
if (schuss.result?.data) {
  await Bun.write(ZIEL, Buffer.from(schuss.result.data, 'base64'))
  console.log(`Bild geschrieben: ${ZIEL}`)
} else {
  console.log('--- KEIN BILD ---')
}

cdp.schliessen()
process.exit(0)
