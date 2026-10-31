/**
 * **Ein Bild der KI-Rangliste — mit einer Antwort, die wirklich da ist.**
 *
 * Der Dienst hinter `GET /api/ai/ranking` verlangt eine Sitzung. Ein kopfloser Browser hat keine
 * (frisches Profil), also antwortet er mit 401 — und das Bild zeigte den Fehler statt der Liste.
 * Dieses Werkzeug **hängt sich in `fetch`** und gibt für genau diesen einen Pfad eine
 * Beispielantwort zurück. Alles andere läuft unverändert.
 *
 * Aufruf:  bun tools/ranking-shot.mjs [ziel.png] [breite] [hoehe]
 */
import { browserHolen, beenden, neueSeite, verbinde } from './cdp.mjs'
import { writeFileSync } from 'node:fs'

const ZIEL = Bun.argv[2] ?? `${import.meta.dirname}/ranking-shot.png`
const BREITE = Number(Bun.argv[3] ?? 1440)
const HOEHE = Number(Bun.argv[4] ?? 900)
const ADRESSE = 'http://127.0.0.1:3081/universe/'

const dienst = {
  rangliste: {
    erstelltAm: '2026-10-18T17:40:12.000Z',
    listen: [
      {
        faehigkeit: 'text',
        name: 'Text',
        eintraege: [
          {
            rang: 1,
            faehigkeit: 'text',
            familie: 'openrouter',
            familienname: 'OpenRouter',
            modell: 'openai/gpt-4o-mini',
            verdrahtet: true,
            funktionalitaet: 'vorhanden',
            kostenart: 'kostenpflichtig',
            preis: { hinein: 0.15, heraus: 0.6 },
            gemessenAm: '2026-10-15',
            veraltet: false,
            gruende: [
              'Verdrahtet: der Anbieter „openrouter" nennt diese Fähigkeit selbst.',
              'Weg gemessen vorhanden (2026-10-15).',
              'Preis GEMESSEN: 0.15 / 0.60 USD je 1 Mio Token — die Messung schlägt die Tabelle.',
              'Freibetrag: 1000 Anfragen — Beleg: AGB.',
            ],
          },
          {
            rang: 2,
            faehigkeit: 'text',
            familie: 'local',
            familienname: 'Lokal',
            modell: 'qwen2.5:7b',
            verdrahtet: true,
            funktionalitaet: 'vorhanden',
            kostenart: 'kostenlos',
            preis: { hinein: 0, heraus: 0 },
            gemessenAm: '2026-10-14',
            veraltet: false,
            gruende: ['Verdrahtet: der Anbieter „local" nennt diese Fähigkeit selbst.'],
          },
          {
            rang: 3,
            faehigkeit: 'text',
            familie: 'beispiel',
            familienname: 'Beispiel',
            verdrahtet: false,
            funktionalitaet: 'unbekannt',
            kostenart: 'unbekannt',
            preis: { hinein: -1, heraus: -1 },
            veraltet: true,
            gruende: ['NICHT verdrahtet: es gibt keine Umsetzung „beispiel", die diese Fähigkeit nennt.'],
          },
          {
            rang: 4,
            faehigkeit: 'text',
            familie: 'fremd',
            familienname: 'Fremd',
            modell: 'mistral-nemo',
            verdrahtet: false,
            funktionalitaet: 'fehlt',
            kostenart: 'freibetrag',
            preis: { hinein: 0.02, heraus: 0.09 },
            gemessenAm: '2026-09-30',
            veraltet: true,
            gruende: ['Weg gemessen FEHLEND (404).'],
          },
        ],
        empfehlung: {
          rang: 1,
          faehigkeit: 'text',
          familie: 'openrouter',
          familienname: 'OpenRouter',
          modell: 'openai/gpt-4o-mini',
          verdrahtet: true,
          funktionalitaet: 'vorhanden',
          kostenart: 'kostenpflichtig',
          preis: { hinein: 0.15, heraus: 0.6 },
          gemessenAm: '2026-10-15',
          veraltet: false,
          gruende: [
            'Verdrahtet: der Anbieter „openrouter" nennt diese Fähigkeit selbst.',
            'Weg gemessen vorhanden (2026-10-15).',
            'Preis GEMESSEN: 0.15 / 0.60 USD je 1 Mio Token — die Messung schlägt die Tabelle.',
            'Freibetrag: 1000 Anfragen — Beleg: AGB.',
          ],
        },
      },
      {
        faehigkeit: 'bild',
        name: 'Bild',
        eintraege: [
          {
            rang: 1,
            faehigkeit: 'bild',
            familie: 'beispiel',
            familienname: 'Beispiel',
            modell: 'bildmodell-3',
            verdrahtet: false,
            funktionalitaet: 'unbekannt',
            kostenart: 'kostenpflichtig',
            preis: { hinein: 0.02, heraus: 0.06 },
            veraltet: false,
            gruende: ['NICHT verdrahtet: es gibt keine Umsetzung, die diese Fähigkeit mit dieser Familie verbindet.'],
          },
          {
            rang: 2,
            faehigkeit: 'bild',
            familie: 'openrouter',
            familienname: 'OpenRouter',
            modell: 'google/gemini-3.8-flash',
            verdrahtet: false,
            funktionalitaet: 'fehlt',
            kostenart: 'kostenpflichtig',
            preis: { hinein: 0.75, heraus: 3.75 },
            veraltet: false,
            gruende: ['Weg gemessen FEHLEND (404).'],
          },
        ],
        ohneEmpfehlung: 'Kein Eintrag ist verdrahtet: es gibt keine Umsetzung, die diese Fähigkeit mit dieser Familie verbindet.',
      },
    ],
    hinweise: ['Es ist KEIN Katalog gereicht worden. Damit ist jede Fähigkeit `unbekannt`.'],
  },
  zahlen: { eintraege: 6, verdrahtet: 2, gemessen: 2, kostenlos: 1, ohnePreis: 1 },
}

const browser = await browserHolen()
let seite
try {
  seite = await neueSeite(browser.port, ADRESSE)
  const cdp = await verbinde(seite.webSocketDebuggerUrl)
  await cdp.ruf('Runtime.enable')
  await cdp.ruf('Page.enable')
  await cdp.ruf('Emulation.setDeviceMetricsOverride', {
    width: BREITE,
    height: HOEHE,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await cdp.ruf('Page.navigate', { url: ADRESSE })
  await new Promise((f) => setTimeout(f, 2500))

  // **In den OS-Modus, ohne auf die gespeicherte Wahl zu bauen.** Der Ankunftswunsch ist einmalig.
  await cdp.js(`localStorage.setItem('pmh.world.arrival','os')`)
  await cdp.ruf('Page.reload', { ignoreCache: true })
  await new Promise((f) => setTimeout(f, 2500))

  // **Die Antwort unterschieben.** Nur dieser eine Pfad; alles andere bleibt der echte Abruf.
  await cdp.js(`(() => {
    const alt = globalThis.fetch.bind(globalThis)
    const daten = ${JSON.stringify(dienst)}
    globalThis.fetch = (eingabe, optionen) => {
      const pfad = String(eingabe)
      if (pfad.includes('/api/ai/ranking')) {
        return Promise.resolve(new Response(JSON.stringify(daten), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return alt(eingabe, optionen)
    }
    return 'fetch ersetzt'
  })()`)

  // **Die Insel öffnen, die Panelgruppe öffnen, die Rangliste holen.** Wie ein Mensch.
  const geoeffnet = await cdp.js(`(() => {
    const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })) }
    const mini = document.querySelector('#islMini')
    ruf(mini, 'click')
    return Boolean(mini)
  })()`)
  await new Promise((f) => setTimeout(f, 400))
  await cdp.js(`(() => {
    const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })) }
    ruf(document.querySelector('[data-panel-group="toggle"]'), 'click')
    return true
  })()`)
  await new Promise((f) => setTimeout(f, 250))
  await cdp.js(`(() => {
    const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })) }
    ruf(document.querySelector('[data-panel-toggle="plugin:ai-rangliste"]'), 'click')
    return true
  })()`)
  await new Promise((f) => setTimeout(f, 1400))

  const zustand = await cdp.js(`(() => {
    const panel = document.querySelector('.zone-bottom .panel')
    const inhalt = panel?.querySelector('.panelcontent')
    const rang = panel?.querySelector('.rang')
    const r = (el) => { const b = el?.getBoundingClientRect?.(); return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null }
    return {
      geoeffnet: ${JSON.stringify(geoeffnet)},
      panel: r(panel),
      inhalt: r(inhalt),
      rang: r(rang),
      scrollH: inhalt?.scrollHeight ?? null,
      clientH: inhalt?.clientHeight ?? null,
      text: (rang?.textContent ?? '').slice(0, 400),
    }
  })()`)
  console.log(JSON.stringify(zustand, null, 2))

  const schuss = await cdp.ruf('Page.captureScreenshot', { format: 'png' })
  writeFileSync(ZIEL, Buffer.from(schuss.result.data, 'base64'))
  console.log(`Bild: ${ZIEL}`)
  cdp.schliessen()
} finally {
  if (seite?.id) {
    await fetch(`http://127.0.0.1:${String(browser.port)}/json/close/${String(seite.id)}`).catch(() => {})
  }
  await beenden(browser)
}
