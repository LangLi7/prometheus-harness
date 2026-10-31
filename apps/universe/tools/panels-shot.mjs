/**
 * **Bilder der Panelliste und des Auftrags.**
 *
 * Dasselbe Verfahren wie `ranking-shot.mjs`: kopfloser Browser, echte Seite, Klick wie ein Mensch.
 * Kein `fetch`-Ersatz — die Panelliste und der Auftrag hängen an keiner Sitzung.
 *
 * Aufruf:  bun tools/panels-shot.mjs [ordner] [breite] [hoehe]
 */
import { browserHolen, beenden, neueSeite, verbinde } from './cdp.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORDNER = Bun.argv[2] ?? import.meta.dirname
const BREITE = Number(Bun.argv[3] ?? 1440)
const HOEHE = Number(Bun.argv[4] ?? 900)
const ADRESSE = 'http://127.0.0.1:3081/universe/'

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

  const klick = (selektor) => `(() => {
    const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })) }
    const el = document.querySelector(${JSON.stringify(selektor)})
    ruf(el, 'click')
    return Boolean(el)
  })()`

  const schuss = async (name) => {
    const bild = await cdp.ruf('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(ORDNER, name), Buffer.from(bild.result.data, 'base64'))
    console.log(join(ORDNER, name))
  }

  await cdp.js(klick('#islMini'))
  await new Promise((f) => setTimeout(f, 400))
  await cdp.js(klick('[data-panel-group="toggle"]'))
  await new Promise((f) => setTimeout(f, 300))

  const liste = await cdp.js(`(() => {
    const box = document.querySelector('.grp-liste')
    if (!box) return null
    const kinder = [...box.children].map((el) =>
      el.classList.contains('grp-unter') ? { gruppe: el.textContent } : { id: el.dataset.panelToggle, titel: el.querySelector('.il')?.textContent },
    )
    box.scrollIntoView({ block: 'center' })
    return kinder
  })()`)
  console.log('Panelliste:', JSON.stringify(liste?.result?.result?.value ?? liste, null, 2))
  await new Promise((f) => setTimeout(f, 300))
  await schuss('panels-list.png')

  await cdp.js(klick('[data-panel-toggle="plugin:chat-order"]'))
  await new Promise((f) => setTimeout(f, 600))
  await schuss('panel-order.png')

  await cdp.js(klick('#islMini'))
  await new Promise((f) => setTimeout(f, 300))
  await cdp.js(klick('[data-panel-toggle="plugin:ai-rangliste"]'))
  await new Promise((f) => setTimeout(f, 900))
  await schuss('panel-ranking.png')

  cdp.schliessen()
} finally {
  if (seite?.id) {
    await fetch(`http://127.0.0.1:${String(browser.port)}/json/close/${String(seite.id)}`).catch(() => {})
  }
  await beenden(browser)
}
