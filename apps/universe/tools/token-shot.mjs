/**
 * **Ein Bild des Token-Panels — mit einer Antwort, die es im kopflosen Browser nicht gibt.**
 *
 * Der Weg `/api/pmh/token` verlangt eine Sitzung. Ein frisches Browserprofil hat keine; also
 * antwortet er 401, und das Bild zeigte nur den Anmeldehinweis. Dieses Werkzeug hängt sich in
 * `fetch` und gibt für **genau diesen** Pfad eine Beispielantwort zurück. Alles andere bleibt
 * der echte Abruf.
 *
 * Aufruf:  bun tools/token-shot.mjs [ziel.png] [breite] [hoehe]
 */
import { browserHolen, beenden, neueSeite, verbinde } from './cdp.mjs'
import { writeFileSync } from 'node:fs'

const ZIEL = Bun.argv[2] ?? `${import.meta.dirname}/token-panel.png`
const BREITE = Number(Bun.argv[3] ?? 1440)
const HOEHE = Number(Bun.argv[4] ?? 900)
const ADRESSE = 'http://127.0.0.1:3081/universe/'

const anbieter = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    ref: 'OPENROUTER_API_KEY',
    herkunft: 'Chat, Sprache, Einbetten, Bild — ein Schlüssel',
    gesetzt: true,
    hinweis: 'c7c89346',
    fassung: 1,
    aktualisiert: '2026-10-18T18:12:00.000Z',
  },
  { id: 'deepseek', name: 'DeepSeek', ref: 'DEEPSEEK_API_KEY', herkunft: 'Chat und Reasoning', gesetzt: false },
  { id: 'anthropic', name: 'Anthropic', ref: 'ANTHROPIC_API_KEY', herkunft: 'Chat (Claude)', gesetzt: false },
  { id: 'zai', name: 'Z.ai', ref: 'ZAI_API_KEY', herkunft: 'Chat und Entscheiden', gesetzt: false },
]

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
  await new Promise((f) => setTimeout(f, 2200))
  await cdp.js(`localStorage.setItem('pmh.world.arrival','os')`)
  await cdp.ruf('Page.reload', { ignoreCache: true })
  await new Promise((f) => setTimeout(f, 2200))

  await cdp.js(`(() => {
    const alt = globalThis.fetch.bind(globalThis)
    const anbieter = ${JSON.stringify(anbieter)}
    globalThis.fetch = (eingabe, optionen) => {
      const pfad = String(eingabe)
      if (pfad.includes('/api/pmh/token')) {
        const methode = (optionen && optionen.method) || 'GET'
        if (methode === 'POST') {
          const rumpf = JSON.parse((optionen && optionen.body) || '{}')
          const treffer = anbieter.find((a) => a.id === rumpf.provider)
          return Promise.resolve(new Response(JSON.stringify({
            ok: true,
            value: { anbieter: { ...treffer, gesetzt: true, hinweis: 'a1b2c3d4', fassung: 1 } },
          }), { status: 200, headers: { 'content-type': 'application/json' } }))
        }
        if (methode === 'DELETE') {
          return Promise.resolve(new Response(JSON.stringify({ ok: true, value: { entfernt: true } }), { status: 200, headers: { 'content-type': 'application/json' } }))
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true, value: { anbieter } }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return alt(eingabe, optionen)
    }
    // Der CSRF-Keks, den das Panel liest. Der Wert ist hier beliebig; der Stub prüft ihn nicht.
    document.cookie = 'pmh_csrf=pruefwert; path=/'
    return 'fetch ersetzt'
  })()`)

  const klick = (selektor) => `(() => {
    const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })) }
    const el = document.querySelector(${JSON.stringify(selektor)})
    ruf(el, 'click')
    return Boolean(el)
  })()`

  await cdp.js(klick('#islMini'))
  await new Promise((f) => setTimeout(f, 400))
  await cdp.js(klick('[data-panel-group="toggle"]'))
  await new Promise((f) => setTimeout(f, 250))

  /*
   * **Der Weg, den der Betreiber wollte: `/token` im Terminal.**
   *
   * Das Panel wird nicht über die Insel geöffnet, sondern über den Befehl — dieselbe
   * Geste wie im Chat. Damit ist der Schrägstrich nicht nur ein Test der Zeichenkette,
   * sondern der Weg durch das echte Terminal.
   */
  await cdp.js(klick('[data-panel-toggle="plugin:debug-terminal"]'))
  await new Promise((f) => setTimeout(f, 450))
  const getippt = await cdp.js(`(() => {
    const eingabe = document.querySelector('.term-in')
    if (!eingabe) return false
    eingabe.value = '/token'
    eingabe.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    return true
  })()`)
  await new Promise((f) => setTimeout(f, 900))
  console.log('/token getippt:', JSON.stringify(getippt?.result?.result?.value ?? null))
  // Die Insel schließen, damit das Bild die Fläche zeigt und nicht das Menü davor.
  await cdp.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await new Promise((f) => setTimeout(f, 300))

  const geoeffnet = await cdp.js(`Boolean(document.querySelector('.token-panel'))`)
  console.log('Token-Panel geöffnet:', JSON.stringify(geoeffnet?.result?.result?.value ?? null))

  const zustand = await cdp.js(`(() => {
    const panel = document.querySelector('.zone-right .panel')
    const inhalt = panel?.querySelector('.panelcontent')
    const r = (el) => { const b = el?.getBoundingClientRect?.(); return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null }
    return {
      panel: r(panel),
      inhalt: r(inhalt),
      anbieter: [...document.querySelectorAll('.token-anbieter')].map((el) => el.textContent.trim().replace(/\\s+/g, ' ')),
      status: document.querySelector('.token-status')?.textContent ?? null,
      titel: document.querySelector('.token-titel')?.textContent ?? null,
    }
  })()`)
  console.log(JSON.stringify(zustand?.result?.result?.value ?? zustand, null, 2))

  const bild = await cdp.ruf('Page.captureScreenshot', { format: 'png' })
  writeFileSync(ZIEL, Buffer.from(bild.result.data, 'base64'))
  console.log(`Bild: ${ZIEL}`)

  // **Und jetzt wirklich speichern.** Der Stub antwortet wie der Host; geprüft wird,
  // daß das Feld danach leer ist und der Hinweis im Status steht.
  await cdp.js(`(() => {
    const zeile = document.querySelector('[data-anbieter="deepseek"]')
    if (zeile) zeile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const feld = document.querySelector('#token-wert')
    if (feld) feld.value = 'sk-test-1234567890'
    return Boolean(zeile && feld)
  })()`)
  await new Promise((f) => setTimeout(f, 250))
  await cdp.js(`(() => {
    const knopf = document.querySelector('.token-knopf-haupt')
    if (knopf) knopf.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return Boolean(knopf)
  })()`)
  await new Promise((f) => setTimeout(f, 700))
  const nachher = await cdp.js(`({
    status: document.querySelector('.token-status')?.textContent ?? null,
    feld: document.querySelector('#token-wert')?.value ?? null,
    deepseek: document.querySelector('[data-anbieter="deepseek"]')?.textContent?.trim().replace(/\\s+/g, ' ') ?? null,
  })`)
  console.log('Nach dem Speichern:', JSON.stringify(nachher?.result?.result?.value ?? nachher, null, 2))
  const bild2 = await cdp.ruf('Page.captureScreenshot', { format: 'png' })
  writeFileSync(ZIEL.replace(/\.png$/u, '-gespeichert.png'), Buffer.from(bild2.result.data, 'base64'))
  console.log(`Bild: ${ZIEL.replace(/\.png$/u, '-gespeichert.png')}`)
  cdp.schliessen()
} finally {
  if (seite?.id) {
    await fetch(`http://127.0.0.1:${String(browser.port)}/json/close/${String(seite.id)}`).catch(() => {})
  }
  await beenden(browser)
}
