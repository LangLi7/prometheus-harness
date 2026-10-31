/**
 * **Die Oberfläche messen — nicht ansehen.**
 *
 * **Warum dieses Werkzeug.** Der Betreiber hat dreimal gesagt, es sehe „beschissen" aus, und ich habe
 * dreimal die **Welt** gemessen (Körpergrössen, Abstände, Ebenen). Beim vierten Mal war es deutlich:
 *
 *   „nein es geht um gui ui ux"
 *
 * Also wird hier die **Oberfläche** gemessen. Und zwar nicht nach Gefühl: zu jedem Textelement werden
 * **Farbe, Hintergrund, Schriftgrad und Gewicht** gelesen, daraus der **Kontrast** gerechnet
 * (WCAG-Verhältnis), und alles unter einem Schwellwert wird gemeldet.
 *
 * **Warum das eine Messung ist und keine Ansicht.** „Der Text ist schlecht lesbar" ist eine
 * Geschmacksaussage. „Dieser Text hat Kontrast 2,3:1 bei 11 px" ist eine Zahl, gegen die man etwas
 * tun kann — und die WCAG-Grenze von **4,5:1** für Fliesstext ist keine Meinung.
 *
 * Aufruf:  bun tools/ui-surface.ts [raum]
 */
const PORT = Number(process.env.CDP_PORT ?? 9223)
const ZIEL = import.meta.dirname

/** Relative Helligkeit nach WCAG 2.1 — aus den drei Kanälen. */
function leuchtdichte(r: number, g: number, b: number): number {
  const kanal = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
}

/** Das Kontrastverhältnis zweier Farben — 1:1 bis 21:1. */
function kontrast(a: readonly number[], b: readonly number[]): number {
  const la = leuchtdichte(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0)
  const lb = leuchtdichte(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0)
  const hell = Math.max(la, lb)
  const dunkel = Math.min(la, lb)
  return (hell + 0.05) / (dunkel + 0.05)
}

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

const raum = `ui-${Date.now().toString(36)}`
await ruf('Page.navigate', { url: `http://127.0.0.1:3081/universe/?room=${raum}` })
await warte(3500)

/*
 * **Erst in die Welt schalten** — die Oberfläche, die der Betreiber sieht, ist die mit Welt, Dock und
 * Zustand. Ohne das würde der Chat gemessen, und die Aussage wäre über die falsche Fläche.
 */
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

/**
 * **Jedes Textelement mit seiner Farbe, seinem Grund und seiner Grösse.**
 *
 * Der Grund ist nicht immer die eigene `background-color`: meistens ist er durchsichtig, und die
 * Fläche darunter zählt. Deshalb wird nach oben gelaufen, bis eine **deckende** Farbe gefunden ist —
 * ohne das rechnet man den Kontrast gegen `rgba(0,0,0,0)` und bekommt Unsinn.
 */
const abfrage = `(() => {
  const farbe = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const t = m[1].split(',').map((x) => parseFloat(x));
    return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 };
  };
  const grund = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const f = farbe(getComputedStyle(n).backgroundColor);
      if (f && f.a > 0.4) return [f.r, f.g, f.b];
      n = n.parentElement;
    }
    return [5, 5, 7];
  };
  const ergebnis = [];
  for (const el of document.querySelectorAll('*')) {
    // Nur Elemente mit **eigenem** Text — sonst zählt jeder Behälter den Text seiner Kinder mit.
    const eigener = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (eigener.length < 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
    const f = farbe(cs.color);
    if (!f) continue;
    const g = grund(el);
    ergebnis.push({
      text: eigener.slice(0, 34),
      klasse: (el.className || el.tagName).toString().slice(0, 26),
      groesse: parseFloat(cs.fontSize),
      gewicht: cs.fontWeight,
      schrift: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      vorne: [f.r, f.g, f.b],
      hinten: g,
      // Die Deckkraft des Elements zählt mit: ein Text mit opacity 0.5 ist halb so sichtbar.
      deckkraft: parseFloat(cs.opacity),
    });
  }
  return JSON.stringify(ergebnis);
})()`

const roh = await ruf('Runtime.evaluate', { expression: abfrage, returnByValue: true })
const elemente = JSON.parse(String(roh.result?.result?.value ?? '[]'))

/** Kontrast, Schriftgrad und Schriftart — je Element. */
const geprueft = elemente.map((e) => ({
  ...e,
  kontrast: kontrast(e.vorne, e.hinten) * e.deckkraft,
}))

geprueft.sort((a, b) => a.kontrast - b.kontrast)

/*
 * **Und die Frage, die der Betreiber seit der ersten Runde stellt: überlappt sich etwas?**
 *
 * „ich rede davon das es alles überlappt ist idk why und warum" — und dann, nach der Schriftkorrektur:
 * „irgendwie immer noch nicht behoben idk why".
 *
 * Überlagerung ist **messbar**: die Rechtecke zweier Textelemente schneiden sich. Und die Ursache ist
 * meist eine Zahl, die man ebenfalls messen kann — eine `line-height`, die **kleiner** ist als die
 * Schrift, die in ihr steht. Genau das passiert, wenn man den `font-size` erhöht und die Zeilenhöhe
 * vergisst.
 *
 * Deshalb wird beides geprüft: die **Überschneidung** der Rechtecke (nur bei Elementen, die nicht
 * ineinander liegen — ein Kind liegt immer in seinem Elternteil) und das Verhältnis
 * `line-height / font-size`.
 */
const ueberlappung = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const knoten = [...document.querySelectorAll('*')].filter((el) => {
      const eigener = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (eigener.length < 2) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.1;
    });
    const paare = [];
    const engeZeilen = [];
    for (let i = 0; i < knoten.length; i++) {
      const a = knoten[i];
      const ra = a.getBoundingClientRect();
      const ca = getComputedStyle(a);
      // **Zeilenhöhe gegen Schriftgrad.** Unter 1,05 ist es keine Zeile mehr, sondern ein Stapel.
      const lh = parseFloat(ca.lineHeight) || 0;
      const fs = parseFloat(ca.fontSize) || 0;
      if (fs > 0 && lh > 0 && lh / fs < 1.25) {
        engeZeilen.push(a.textContent.trim().slice(0, 28) + '  ' + fs + 'px/' + lh.toFixed(1) + 'px = ' + (lh / fs).toFixed(2));
      }
      for (let j = i + 1; j < knoten.length; j++) {
        const b = knoten[j];
        // Eltern und Kinder **nicht** zählen: ein Kind liegt immer in seinem Elternteil.
        if (a.contains(b) || b.contains(a)) continue;
        const rb = b.getBoundingClientRect();
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (x > 2 && y > 2) {
          paare.push({
            a: a.textContent.trim().slice(0, 22),
            b: b.textContent.trim().slice(0, 22),
            flaeche: Math.round(x * y),
          });
        }
      }
    }
    return JSON.stringify({ paare: paare.sort((p, q) => q.flaeche - p.flaeche).slice(0, 12), engeZeilen: engeZeilen.slice(0, 12) });
  })()`,
  returnByValue: true,
})
const ueber = JSON.parse(String(ueberlappung.result?.result?.value ?? '{}'))

console.log(`Gemessene Textelemente: ${geprueft.length}`)
console.log('')
console.log(`**Überlappende Textpaare: ${(ueber.paare ?? []).length}**  (Fläche in px²)`)
for (const p of ueber.paare ?? []) {
  console.log(`  ${String(p.flaeche).padStart(6)} px²   „${p.a}"  ×  „${p.b}"`)
}
if (!(ueber.paare ?? []).length) console.log('  (keine)')
console.log('')
console.log(`**Zu enge Zeilen (Zeilenhöhe / Schrift unter 1,25):**`)
for (const z of ueber.engeZeilen ?? []) console.log(`  ${z}`)
if (!(ueber.engeZeilen ?? []).length) console.log('  (keine)')
console.log('')
console.log('Die schwächsten zwölf (Kontrast nach WCAG, 4,5:1 ist die Grenze für Fliesstext):')
console.log('Kontrast  Grad  Gew  Schrift          Text')
console.log('─'.repeat(78))
for (const e of geprueft.slice(0, 12)) {
  const note = e.kontrast < 3 ? ' ✗ unlesbar' : e.kontrast < 4.5 ? ' ✗ zu schwach' : ''
  console.log(
    `${e.kontrast.toFixed(2).padStart(6)}:1  ${String(e.groesse).padStart(4)}  ${String(e.gewicht).padStart(3)}  ` +
      `${e.schrift.slice(0, 15).padEnd(15)} ${e.text.padEnd(30)}${note}`,
  )
}

const unter45 = geprueft.filter((e) => e.kontrast < 4.5)
const unter3 = geprueft.filter((e) => e.kontrast < 3)
const schriften = [...new Set(geprueft.map((e) => e.schrift))]
const groessen = [...new Set(geprueft.map((e) => e.groesse))].sort((a, b) => a - b)

console.log('')
console.log(`Unter 4,5:1: ${unter45.length} von ${geprueft.length}`)
console.log(`Unter 3,0:1: ${unter3.length}  ← das ist unter jeder Lesbarkeitsgrenze`)
console.log(`Schriftarten: ${schriften.join(' · ')}`)
console.log(`Schriftgrade: ${groessen.join(' · ')}`)

const schuss = await ruf('Page.captureScreenshot', { format: 'png' })
await Bun.write(`${ZIEL}\\ui-${raum}.png`, Buffer.from(schuss.result.data, 'base64'))
console.log(`Bild: tools/ui-${raum}.png`)

/*
 * **Und die Stelle, an der es überlappt — vergrössert.**
 *
 * Ein Bild des ganzen Bildschirms zeigt, **dass** etwas überlappt; an welcher Kante und um wie viele
 * Pixel, sieht man erst im Ausschnitt. Deshalb wird genau der Bereich aufgenommen, in dem die
 * stärkste Überschneidung liegt — mit `clip` in Bildpunkten.
 */
const staerkste = (ueber.paare ?? [])[0]
if (staerkste) {
  const box = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const el = [...document.querySelectorAll('*')].find((e) =>
        e.textContent.trim().startsWith(${JSON.stringify(String(staerkste.a).slice(0, 14))}));
      if (!el) return 'null';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.max(0, r.left - 40), y: Math.max(0, r.top - 20), w: 420, h: 120 });
    })()`,
    returnByValue: true,
  })
  const clip = JSON.parse(String(box.result?.result?.value ?? 'null'))
  if (clip) {
    const nah = await ruf('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 3 },
    })
    if (nah.result?.data) {
      await Bun.write(`${ZIEL}\\overlap.png`, Buffer.from(nah.result.data, 'base64'))
      console.log(`Ausschnitt der stärksten Überlappung: tools/overlap.png (3× vergrössert)`)
    }
  }
}

/*
 * **Und die letzte Überlappung, wenn die stärkste behoben ist.**
 *
 * Die stärkste war „Kopfzeile über Suchfeld" — und **behoben**. Danach steht eine andere oben, und
 * genau die muss man sehen, um sie zu beheben. Ohne diese zweite Aufnahme hätte ich nur die eine
 * Stelle im Bild und würde die nächste wieder nur aus Zahlen erraten.
 */
const zweite = (ueber.paare ?? [])[0]
if (zweite && staerkste && zweite.a !== staerkste.a) {
  const box = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const el = [...document.querySelectorAll('*')].find((e) =>
        e.textContent.trim().startsWith(${JSON.stringify(String(zweite.a).slice(0, 14))}));
      if (!el) return 'null';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.max(0, r.left - 60), y: Math.max(0, r.top - 30), w: 560, h: 160 });
    })()`,
    returnByValue: true,
  })
  const clip = JSON.parse(String(box.result?.result?.value ?? 'null'))
  if (clip) {
    const nah = await ruf('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 3 },
    })
    if (nah.result?.data) {
      await Bun.write(`${ZIEL}\\overlap2.png`, Buffer.from(nah.result.data, 'base64'))
      console.log(`Ausschnitt der zweitstärksten: tools/overlap2.png (3× vergrössert)`)
    }
  }
}
/*
 * **Und der Ort der *kleinsten* Überlappung — dort sitzt meist der sichtbare Fehler.**
 *
 * Die grossen Zahlen kamen von Panel-Reitern, die als Beschriftung im Baum stehen, aber hinter dem
 * Terminal liegen (`z-index`). Die **kleine** Überlappung dagegen — „ACHSEN · ZIEHEN" über
 * „abgesteckt:" — ist im Bild als echter Zusammenstoss zu sehen: die Achsenbeschriftung liegt auf der
 * Knopfleiste unten links. Deshalb wird zusätzlich die kleinste aufgenommen.
 */
const kleinste = (ueber.paare ?? []).at(-1)
if (kleinste) {
  const box = await ruf('Runtime.evaluate', {
    expression: `(() => {
      const el = [...document.querySelectorAll('*')].find((e) =>
        e.textContent.trim().startsWith(${JSON.stringify(String(kleinste.a).slice(0, 12))}));
      if (!el) return 'null';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.max(0, r.left - 40), y: Math.max(0, r.top - 30), w: 620, h: 180 });
    })()`,
    returnByValue: true,
  })
  const clip = JSON.parse(String(box.result?.result?.value ?? 'null'))
  if (clip) {
    const nah = await ruf('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 3 },
    })
    if (nah.result?.data) {
      await Bun.write(`${ZIEL}\\overlap3.png`, Buffer.from(nah.result.data, 'base64'))
      console.log(`Ausschnitt unten links: tools/overlap3.png (3× vergrössert)`)
    }
  }
}
/*
 * **Die Beschriftung der Achsenanzeige — sichtbar oder nicht?**
 *
 * Sie taucht in der Überlappungsliste auf, obwohl die Medienabfrage sie ausblenden soll. „Soll" ist
 * keine Messung: hier wird `display` gelesen, und dazu die Fensterbreite, gegen die die Abfrage läuft.
 */
const achsen = await ruf('Runtime.evaluate', {
  expression: `(() => {
    const cap = document.querySelector('.axes .cap');
    const layer = document.querySelector('.axes');
    return JSON.stringify({
      fenster: window.innerWidth,
      capVorhanden: !!cap,
      capDisplay: cap ? getComputedStyle(cap).display : 'FEHLT',
      capBox: cap ? [Math.round(cap.getBoundingClientRect().left), Math.round(cap.getBoundingClientRect().top), Math.round(cap.getBoundingClientRect().width), Math.round(cap.getBoundingClientRect().height)] : null,
      layerDisplay: layer ? getComputedStyle(layer).display : 'FEHLT',
      layerBox: layer ? [Math.round(layer.getBoundingClientRect().left), Math.round(layer.getBoundingClientRect().top)] : null,
    });
  })()`,
  returnByValue: true,
})
console.log(`Achsenanzeige: ${achsen.result?.result?.value}`)
console.log('')

ws.close()
process.exit(0)
