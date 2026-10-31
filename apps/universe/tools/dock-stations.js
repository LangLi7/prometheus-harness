/**
 * **Die Andockstellen der Oberfläche — gemessen an der ausgelieferten Regel.**
 *
 * ── Warum dieses Werkzeug neu geschrieben ist ───────────────────────────────────────────
 *
 * Die erste Fassung rechnete `zoneAt` **im Browser nach** — zwanzig Zeilen mit denselben Zahlen. Als die
 * Regel dann auf **Stellen** umgestellt wurde, maß das Werkzeug weiter die **alte** und meldete:
 *
 *     abstecken gibt es nur am oberen Rand — nicht an der Insel
 *
 * Der Code daneben tat längst etwas anderes. Eine Messung, die ihre eigene Regel mitbringt, kann den
 * Code nicht widerlegen — sie bestätigt nur sich selbst.
 *
 * Deshalb fragt dieses Werkzeug jetzt **die Anwendung**: `window.__prometheusDock.stellen()` liefert die
 * Andockstellen, `zoneAt(x, y)` entscheidet genau so, wie es beim Loslassen entschieden wird. Beides
 * steht in `main.ts` und ruft dieselben Funktionen wie die Oberfläche.
 *
 * ── Was der Auftrag war ────────────────────────────────────────────────────────────────
 *
 * „**diese docking station objekt logic könnten wir ja implementieren das es quasi bestimmte stellen
 * erleichtert und auch den objekte selbst auch orientiert**"
 *
 * Gemessen wird deshalb dreierlei: **welche** Stellen es gibt, **wie weit** jede reicht (der
 * Fangbereich), und **wie** sie ihre Objekte ausrichtet.
 *
 * Aufruf:  bun tools/dock-stations.js
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const RAUM = `dock-${Date.now().toString(36)}`
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
const js = async (expression) => {
  const r = await ruf('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) return `FEHLER: ${r.result.exceptionDetails.text}`
  return String(r.result?.result?.value ?? '—')
}

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

/*
 * **In die Welt schalten, dann zwei Panels öffnen** — links und unten, damit es Stellen gibt, an denen
 * etwas liegt. Geöffnet wird über die **Insel**, denn sie ist die Navigation (Entwurf: „Eine
 * Seitenleiste gibt es nicht"); die alte Knopfleiste ist abgeschafft.
 */
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  r(document.querySelector('#isl .mini'), 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  r(welt, 'click');
  return 'ok';
})()`)
await warte(900)
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  r(document.querySelector('#isl .mini'), 'click');
  return 'ok';
})()`)
await warte(500)
await js(`(() => {
  const r = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  for (const name of ['Suche', 'Terminal']) {
    const k = [...document.querySelectorAll('#isl [data-panel-toggle]')].find((e) => (e.textContent || '').includes(name));
    if (k) k.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  return 'ok';
})()`)
await warte(900)

const da = await js(`typeof window.__prometheusDock === 'object' && window.__prometheusDock !== null`)
if (da !== 'true') {
  console.log('ABBRUCH: window.__prometheusDock fehlt — die Ansicht ist nicht geladen.')
  console.log('Ohne diesen Griff kann dieses Werkzeug die Regel nur nachbauen, und genau das war der Fehler.')
  process.exit(1)
}

const bericht = await js(`(() => {
  const kasten = (wahl) => {
    const el = document.querySelector(wahl);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(r.left), y: Math.round(r.top), b: Math.round(r.width), h: Math.round(r.height), display: cs.display };
  };
  const stellen = window.__prometheusDock.stellen().map((s) => ({
    id: s.id, zone: s.zone, achse: s.axis.entlang, platz: s.axis.platz, randlos: s.randlos,
    x: Math.round(s.rect.x), y: Math.round(s.rect.y), b: Math.round(s.rect.w), h: Math.round(s.rect.h),
    marge: Math.round(s.margin),
  }));
  return JSON.stringify({
    fenster: { b: window.innerWidth, h: window.innerHeight },
    zonen: ['left', 'right', 'bottom'].map((z) => ({ zone: z, ...(kasten('.zone-' + z) ?? {}) })),
    insel: kasten('#isl .mini') ?? kasten('#isl'),
    stellen,
    /* Und die Marken, die beim Ziehen erscheinen — jetzt, ohne Zug: es darf keine geben. */
    marken: document.querySelectorAll('#dockhost .dockstelle').length,
    panels: [...document.querySelectorAll('.zone .panel')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.panel, x: Math.round(r.left), y: Math.round(r.top), b: Math.round(r.width), h: Math.round(r.height) };
    }),
    layout: window.__prometheusDock.layout().panels.map((p) => ({
      id: p.id, zone: p.zone, size: Math.round(p.size),
      floating: { x: Math.round(p.floating.x), y: Math.round(p.floating.y), w: Math.round(p.floating.w), h: Math.round(p.floating.h) },
    })),
  });
})()`)

const d = JSON.parse(bericht)
console.log(`Fenster: ${d.fenster.b} × ${d.fenster.h}`)
console.log('')
console.log('Die Zonen, wie sie im Bild liegen:')
console.log('  Zone     x      y     Breite   Höhe')
console.log('  ' + '─'.repeat(48))
for (const z of d.zonen) {
  if (z.b === undefined || z.display === 'none') console.log(`  ${z.zone.padEnd(8)} (aus)`)
  else console.log(`  ${z.zone.padEnd(8)} ${String(z.x).padStart(4)}  ${String(z.y).padStart(4)}  ${String(z.b).padStart(6)}  ${String(z.h).padStart(6)}`)
}
console.log('')
console.log(`  Insel: ${d.insel ? `${d.insel.x} / ${d.insel.y}  ${d.insel.b} × ${d.insel.h}` : 'FEHLT'}`)
console.log('')
console.log('Die Andockstellen — aus der Anwendung, nicht nachgebaut:')
console.log('  Stelle         Zone      Kasten                 Ausrichtung        Fangbereich')
console.log('  ' + '─'.repeat(86))
for (const s of d.stellen) {
  const kasten = `${s.x} / ${s.y}  ${s.b} × ${s.h}`
  const ausrichtung = `${s.achse === 'x' ? 'senkrecht' : 'waagerecht'} (${s.platz}${s.randlos ? ', randlos' : ''})`
  console.log(
    `  ${s.id.padEnd(14)} ${s.zone.padEnd(9)} ${kasten.padEnd(22)} ${ausrichtung.padEnd(18)} ±${s.marge} px`,
  )
}
console.log('')
console.log(`Marken im Bild, ohne dass gezogen wird: ${d.marken}${d.marken === 0 ? '   ← richtig: die Stellen zeigen sich nur beim Ziehen' : '   ← FEHLER: sie liegen dauerhaft über der Fläche'}`)
console.log('')
console.log('Offene Panels:')
for (const p of d.panels) console.log(`  ${String(p.id).padEnd(24)} ${p.x} / ${p.y}  ${p.b} × ${p.h}`)

/*
 * **Und die Regel an neun Zeigerstellen — über `zoneAt` der Anwendung.**
 *
 * Das ist der Kern: hier wird **nichts** nachgerechnet. Jede Zeile ist ein Aufruf derselben Funktion,
 * die beim Loslassen entscheidet.
 */
const zeiger = [
  ['links oben', 40, 60],
  ['links Mitte', 40, 450],
  ['Mitte oben', 820, 40],
  ['Mitte', 820, 450],
  ['Mitte unten', 820, 860],
  ['rechts Mitte', 1400, 450],
  ['unten links', 200, 860],
  ['über der Insel', d.insel ? Math.round(d.insel.x + d.insel.b / 2) : 720, d.insel ? Math.round(d.insel.y + d.insel.h / 2) : 30],
  ['neben der Insel', d.insel ? Math.round(d.insel.x + d.insel.b / 2) : 720, 200],
]
const regel = await js(`(() => {
  const stellen = ${JSON.stringify(zeiger)};
  return JSON.stringify(stellen.map(([name, x, y]) => ({
    name, x, y,
    zone: window.__prometheusDock.zoneAt(x, y),
    stelle: (window.__prometheusDock.stellen().find((s) => window.__prometheusDock.zoneAt(x, y) === s.zone) || {}).id ?? null,
  })));
})()`)

console.log('')
console.log('Was die ausgelieferte Regel an welcher Stelle ergibt:')
for (const r of JSON.parse(regel)) {
  const wie =
    r.zone === 'closed' ? '   ← steckt ab (die Insel)'
    : r.zone === 'floating' ? '   ← schwebt: keine Stelle gemeint'
    : ''
  console.log(`  ${r.name.padEnd(16)} (${String(r.x).padStart(4)}, ${String(r.y).padStart(3)})  →  ${r.zone.padEnd(9)}${wie}`)
}

/*
 * **Und der Beweis, dass die Richtung stimmt.** Der Betreiber: „**diese docking station objekt logic
 * könnten wir ja implementieren das es quasi bestimmte stellen erleichtert und auch den objekte selbst
 * auch orientiert**". *Orientiert* heisst: das zweite Objekt liegt **neben** dem ersten, nicht darauf.
 * Gerechnet wird das von `stationPlacement` — dieselbe Funktion, die beim Loslassen die Lage bestimmt.
 */
const lage = await js(`(() => {
  const s = window.__prometheusDock.stellen();
  const klein = { w: 420, h: 120 };
  const zeilen = [];
  for (const stelle of s) {
    if (stelle.zone === 'closed') continue;
    const erstes = window.__prometheusDock.lage(stelle.id, klein, []);
    const zweites = window.__prometheusDock.lage(stelle.id, klein, [{ x: erstes.x, y: erstes.y, w: klein.w, h: klein.h }]);
    zeilen.push({
      id: stelle.id,
      erstes,
      zweites,
      richtung: !zweites ? 'NICHT GERECHNET' : zweites.y !== erstes.y ? 'nach unten' : zweites.x !== erstes.x ? 'nach rechts' : 'AUF DEM ERSTEN',
    });
  }
  return JSON.stringify(zeilen);
})()`)

if (String(lage).startsWith('FEHLER')) {
  console.log('')
  console.log('Die Ausrichtung konnte nicht gemessen werden — window.__prometheusDock.lage fehlt.')
} else {
  console.log('')
  console.log('Und wohin die Stelle ihre Objekte legt (420 × 120 px, erstes und zweites):')
  for (const z of JSON.parse(lage)) {
    if (!z.zweites) {
      console.log(`  ${z.id.padEnd(14)} NICHT GERECHNET — die Stelle war nicht auffindbar`)
      continue
    }
    const warn = z.richtung === 'AUF DEM ERSTEN' ? '   ← FEHLER: sie liegen übereinander' : ''
    console.log(
      `  ${z.id.padEnd(14)} 1.: ${String(z.erstes.x).padStart(4)} / ${String(z.erstes.y).padStart(3)}   2.: ${String(z.zweites.x).padStart(4)} / ${String(z.zweites.y).padStart(3)}   ${z.richtung}${warn}`,
    )
  }
}

console.log('')
console.log('Lesehilfe: „abstecken" gibt es nur an der Insel. Überall sonst rastet ein Panel an einer')
console.log('Stelle ein oder bleibt schwebend — es verschwindet nicht mehr ungewollt.')

ws.close()
