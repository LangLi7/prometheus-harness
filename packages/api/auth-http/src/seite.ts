/**
 * Die Anmeldeseite — HTML, CSS und JavaScript aus **unserem** Host.
 *
 * ## Warum eine eigene Seite und nicht die Weboberfläche des Kerns
 *
 * `apps/web` ist die Oberfläche des **Kerns**: ein Vite-Bündel, das ohne
 * `window.__DSH_BOOT__` aus `dsh web` gar nicht startet (gemessen, siehe
 * `docs/reference/webui-dev.md`). Eine Anmeldung dort hineinzubauen hieße, sich
 * an einen Startweg zu binden, den wir nicht besitzen.
 *
 * Diese Seite ist **eigenständig**: kein Bündel, kein Bauwerkzeug, keine
 * Fremdressource. Sie liegt in **einer** Datei und wird von unserem eigenen Weg
 * ausgeliefert.
 *
 * ## Die vier Entscheidungen
 *
 * | Entscheidung | Warum |
 * |---|---|
 * | **kein Byte Fremdressource** | kein CDN, kein Zählpixel, keine Schriftart von außen. Wer die Seite öffnet, spricht mit **einem** Rechner: unserem |
 * | **das JavaScript in einer eigenen Datei**, nicht inline | nur so ist eine CSP ohne `'unsafe-inline'` für Skripte möglich. Eingebettetes JavaScript wäre ein XSS-Einfallstor, das man sich selbst offen läßt |
 * | **die CSP verbietet alles, was sie nicht braucht** | `default-src 'none'`, dazu `script-src 'self'`, `connect-src 'self'` — Bilder, Rahmen, Formulare nach außen: aus |
 * | **die Werte kommen aus der Sitzung**, nicht aus dem Speicher | das Paßwort geht an `/login` und wird **nirgends** abgelegt: kein `localStorage`, kein Verlauf, kein Zwischenspeicher (`cache-control: no-store`) |
 *
 * ## Was diese Seite NICHT tut
 *
 * Sie **entscheidet nichts**. Jede Regel — schwaches Paßwort, vergebene Adresse,
 * gesperrtes Konto, fehlender Claim, CSRF — liegt in `wege.ts` und wird von dort
 * beantwortet. Die Seite zeigt nur, was zurückkommt. Eine Oberfläche, die eine
 * Regel selbst nachbaut, hat sie zweimal — und die zweite ist die falsche.
 *
 * @module @prometheus-harness/auth-http/seite
 */

import { CSRF_COOKIE_NAME } from '@prometheus-harness/auth'
import { CSRF_KOPFZEILE, PFAD_ABMELDEN, PFAD_ANMELDEN, PFAD_ICH, PFAD_REGISTRIEREN } from './wege.ts'
import { macheWeg, type Weg } from './http.ts'

/** Der Pfad der Seite — für Menschen gedacht, deshalb nicht unter `/api`. */
export const PFAD_SEITE = '/pmh/anmelden'

/** Der Pfad desselben Inhalts unter dem Namensraum der Anmeldung. */
export const PFAD_SEITE_API = '/api/pmh/auth/seite'

/** Wo das JavaScript der Seite liegt. */
export const PFAD_SEITE_JS = '/api/pmh/auth/seite.js'

/**
 * Die Richtlinie als **eigene Konstante**.
 *
 * **Warum nicht nur im Objekt darunter.** `SEITEN_KOEPFE['content-security-policy']`
 * ist durch `noUncheckedIndexedAccess` vom Typ `string | undefined` — eine
 * Zusicherung darauf wäre eine Prüfung mit einem Wert, der auch fehlen könnte.
 * Als benannte Konstante ist der Wert `string`, und ein Weglassen fällt beim
 * Typlauf auf statt in einer Prüfung.
 */
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; " +
  "form-action 'none'; base-uri 'none'; frame-ancestors 'none'"

/**
 * Die Kopfzeilen, die **jede** Antwort dieser Seite trägt.
 *
 * **Warum `default-src 'none'` und nicht „nur ein bißchen erlaubt".** Eine
 * Richtlinie, die etwas erlaubt, muß begründen, warum genau das; eine, die alles
 * verbietet, muß nur das Nötige freigeben. `script-src 'self'` erlaubt **unsere**
 * Datei und keine fremde; `connect-src 'self'` erlaubt die Aufrufe an unseren
 * eigenen Rechner und keine nach außen. `form-action 'none'` ist Absicht: die
 * Formulare werden per `fetch` abgeschickt, nicht per Absenden an eine Adresse —
 * damit kann ein eingeschmuggeltes `form action` nichts nach außen tragen.
 */
export const SEITEN_KOEPFE: Readonly<Record<string, string>> = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
}

/** Sendet einen Körper mit den Kopfzeilen der Seite. */
function sendeSeite(res: Parameters<Weg>[1], koerper: string, typ: string): void {
  const bytes = Buffer.byteLength(koerper)
  res.writeHead(200, {
    'content-type': typ,
    'content-length': String(bytes),
    ...SEITEN_KOEPFE,
  })
  res.end(koerper)
}

/**
 * Das HTML der Seite.
 *
 * Die deutschen Texte stehen hier und nicht im JavaScript: was ein Mensch liest,
 * soll auch dann dastehen, wenn das Skript nicht lädt (und ohne Skript ist die
 * Seite wenigstens erklärend, statt leer).
 */
export const HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prometheus Harness — Anmeldung</title>
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
         background: #101216; color: #e6e8ec; }
  main { width: min(28rem, 92vw); padding: 2rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; letter-spacing: .01em; }
  h2 { font-size: 1rem; margin: 0 0 .75rem; font-weight: 600; color: #b9c0cc; }
  p.hinweis { margin: 0 0 1.5rem; color: #8b93a1; }
  section { border: 1px solid #262b34; border-radius: .6rem; padding: 1.1rem; margin: 0 0 1rem;
            background: #161a20; }
  section[hidden] { display: none; }
  label { display: block; margin: 0 0 .7rem; font-size: .85rem; color: #b9c0cc; }
  input { display: block; width: 100%; margin-top: .25rem; padding: .55rem .65rem;
          border: 1px solid #313845; border-radius: .4rem; background: #0f1216; color: inherit;
          font: inherit; }
  input:focus { outline: 2px solid #4b7bec; outline-offset: 1px; }
  button { padding: .55rem 1rem; border: 0; border-radius: .4rem; background: #4b7bec; color: #fff;
           font: inherit; font-weight: 600; cursor: pointer; }
  button.zweit { background: #2c3340; }
  button:disabled { opacity: .55; cursor: progress; }
  #zustand { min-height: 1.5rem; margin: 0 0 1rem; font-size: .9rem; }
  #zustand.fehler { color: #ff8b8b; }
  #zustand.gut { color: #7ddc9a; }
  dl { margin: 0 0 1rem; display: grid; grid-template-columns: auto 1fr; gap: .3rem .9rem;
       font-size: .9rem; }
  dt { color: #8b93a1; }
  dd { margin: 0; word-break: break-all; }
  code { background: #0f1216; padding: .1rem .3rem; border-radius: .25rem; font-size: .85em; }
  .klein { font-size: .82rem; color: #8b93a1; margin: .6rem 0 0; }
</style>
</head>
<body>
<main>
  <h1>Prometheus Harness</h1>
  <p class="hinweis">Anmeldung am eigenen Rechner</p>

  <p id="zustand" role="status" aria-live="polite">Prüfe die Sitzung …</p>

  <section id="angemeldet" hidden>
    <h2>Angemeldet</h2>
    <dl>
      <dt>Adresse</dt><dd id="a-email">—</dd>
      <dt>Name</dt><dd id="a-name">—</dd>
      <dt>Rolle</dt><dd id="a-rolle">—</dd>
      <dt>Dateizugriff</dt><dd id="a-datei">—</dd>
      <dt>Lesewurzeln</dt><dd id="a-lesen">—</dd>
      <dt>Schreibwurzeln</dt><dd id="a-schreiben">—</dd>
      <dt>Netz</dt><dd id="a-netz">—</dd>
      <dt>Prozesse</dt><dd id="a-prozesse">—</dd>
    </dl>
    <button id="abmelden" class="zweit" type="button">Abmelden</button>
  </section>

  <section id="anmeldung">
    <h2>Anmelden</h2>
    <form id="form-anmelden" autocomplete="on">
      <label>Adresse
        <input name="email" type="email" autocomplete="username" required>
      </label>
      <label>Passwort
        <input name="password" type="password" autocomplete="current-password" required>
      </label>
      <button type="submit">Anmelden</button>
    </form>
  </section>

  <section id="erstbetrieb">
    <h2>Erstes Konto anlegen</h2>
    <p class="klein">
      Nur beim ersten Start: das erste Konto braucht das <strong>Claim-Token</strong> aus
      <code>claim.txt</code> im Harness-Home. Ohne dieses Geheimnis könnte jeder, der den
      Port erreicht, das Adminkonto anlegen. Danach legt ein angemeldeter Administrator
      weitere Konten an.
    </p>
    <form id="form-registrieren">
      <label>Adresse
        <input name="email" type="email" autocomplete="off" required>
      </label>
      <label>Anzeigename
        <input name="displayName" type="text" autocomplete="off">
      </label>
      <label>Passwort
        <input name="password" type="password" autocomplete="new-password" required>
      </label>
      <label>Claim-Token
        <input name="claimToken" type="text" autocomplete="off" required>
      </label>
      <button type="submit" class="zweit">Konto anlegen</button>
    </form>
  </section>

  <section id="verwaltung" hidden>
    <h2>Konto anlegen</h2>
    <p class="klein">
      Als angemeldeter <strong>Administrator</strong> entstehen hier weitere Konten. Die Rolle
      ist dabei <strong>Benutzer</strong>: ob jemand verwalten darf, ist eine eigene
      Entscheidung und wird hier nicht vergeben.
    </p>
    <form id="form-verwalten">
      <label>Adresse
        <input name="email" type="email" autocomplete="off" required>
      </label>
      <label>Anzeigename
        <input name="displayName" type="text" autocomplete="off">
      </label>
      <label>Passwort
        <input name="password" type="password" autocomplete="new-password" required>
      </label>
      <button type="submit" class="zweit">Konto anlegen</button>
    </form>
    <p class="klein">
      Diese Anfrage braucht den <strong>CSRF-Wert</strong> aus dem Cookie — sie ändert etwas
      im Namen eines Angemeldeten. Die Seite schickt ihn aus dem lesbaren Cookie mit; das
      Sitzungscookie selbst ist für sie unsichtbar.
    </p>
  </section>

  <p class="klein" id="fuss">
    Das Paßwort wird nirgends gespeichert — weder im Browser noch auf dem Server im
    Klartext. Übertragen wird es nur an diesen Rechner.
  </p>
</main>
<script src="${PFAD_SEITE_JS}"></script>
</body>
</html>
`
/**
 * Das JavaScript der Seite.
 *
 * **Warum hier deutsche Meldungen aus dem Antwortobjekt kommen und nicht aus einem
 * eigenen Katalog.** Die Wege liefern `{ok:false, error:{code,message}}` mit einem
 * für Menschen gedachten Text. Diese Datei zeigt ihn an — sie **erfindet** keinen
 * zweiten. Sonst gäbe es zwei Wahrheiten über dieselbe Regel.
 */
export const JS = `'use strict'
// Die Namen stehen hier NICHT geraten, sondern kommen vom Server: die Datei wird
// mit den Werten aus dem Regelkern ausgeliefert, damit sie nicht auseinanderlaufen.
const PFAD_ANMELDEN = ${JSON.stringify(PFAD_ANMELDEN)}
const PFAD_REGISTRIEREN = ${JSON.stringify(PFAD_REGISTRIEREN)}
const PFAD_ABMELDEN = ${JSON.stringify(PFAD_ABMELDEN)}
const PFAD_ICH = ${JSON.stringify(PFAD_ICH)}
const CSRF_COOKIE = ${JSON.stringify(CSRF_COOKIE_NAME)}
const CSRF_KOPFZEILE = ${JSON.stringify(CSRF_KOPFZEILE)}

const $ = (id) => document.getElementById(id)

function setzeZustand(text, art) {
  const el = $('zustand')
  el.textContent = text
  el.className = art === undefined ? '' : art
}

function cookieWert(name) {
  for (const teil of document.cookie.split(';')) {
    const i = teil.indexOf('=')
    if (i === -1) continue
    if (teil.slice(0, i).trim() === name) return decodeURIComponent(teil.slice(i + 1).trim())
  }
  return undefined
}

/**
 * Die Kopfzeile mit dem CSRF-Wert — oder leer, wenn es keinen gibt.
 *
 * **Warum als eigene Funktion.** Der Wert wird an **drei** Stellen gebraucht
 * (Abmelden, Konto anlegen, später mehr). Dreimal derselbe Griff ins Cookie wäre
 * dreimal die Gelegenheit, ihn zu vergessen — und ein vergessener CSRF-Wert
 * sieht nicht wie ein Fehler aus, sondern wie ein 403 ohne Grund.
 */
function csrfKopf() {
  const wert = cookieWert(CSRF_COOKIE)
  if (wert === undefined) return {}
  const kopf = {}
  kopf[CSRF_KOPFZEILE] = wert
  return kopf
}

/** Ruft einen Weg auf und gibt IMMER {ok, wert, meldung} zurück. */
async function rufe(pfad, koerper, kopf) {
  try {
    const antwort = await fetch(pfad, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, kopf || {}),
      body: JSON.stringify(koerper || {}),
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (antwort.status === 204) return { ok: true, wert: undefined, meldung: '' }
    const daten = await antwort.json().catch(() => undefined)
    if (daten && daten.ok === true) return { ok: true, wert: daten.value, meldung: '' }
    const fehler = (daten && daten.error) || {}
    return { ok: false, wert: undefined, meldung: fehler.message || ('Fehler ' + antwort.status) }
  } catch (e) {
    return { ok: false, wert: undefined, meldung: 'Der Server ist nicht erreichbar.' }
  }
}

function zeigeAngemeldet(wert) {
  $('angemeldet').hidden = false
  $('anmeldung').hidden = true
  $('erstbetrieb').hidden = true
  // **Der Verwaltungsbereich erscheint NUR einem Administrator.** Die Prüfung
  // hier ist **Bequemlichkeit, keine Sicherheit**: wer das im Browser umgeht,
  // bekommt vom Weg ein 403 — die Entscheidung fällt in wege.ts, nicht hier.
  // Eine Oberfläche, die eine Regel selbst durchsetzt, hat sie zweimal.
  $('verwaltung').hidden = wert.role !== 'admin'
  $('a-email').textContent = wert.email
  $('a-name').textContent = wert.displayName
  $('a-rolle').textContent = wert.role
  const i = wert.isolation || {}
  $('a-datei').textContent = i.dateizugriff || '—'
  $('a-lesen').textContent = (i.lesewurzeln || []).join(', ') || '—'
  $('a-schreiben').textContent = (i.schreibwurzeln || []).join(', ') || '—'
  $('a-netz').textContent = i.netz ? 'erlaubt' : 'gesperrt'
  $('a-prozesse').textContent = i.prozesse ? 'erlaubt' : 'gesperrt'
  setzeZustand('Angemeldet als ' + wert.email + (wert.role === 'admin' ? ' (Administrator).' : '.'), 'gut')
}

async function pruefeSitzung() {
  const antwort = await fetch(PFAD_ICH, { credentials: 'same-origin', cache: 'no-store' })
  if (antwort.status === 200) {
    const daten = await antwort.json().catch(() => undefined)
    if (daten && daten.ok === true && daten.value) { zeigeAngemeldet(daten.value); return }
  }
  $('angemeldet').hidden = true
  $('anmeldung').hidden = false
  $('erstbetrieb').hidden = false
  // **Auch der Verwaltungsbereich verschwindet wieder.** Bliebe er stehen, könnte
  // ein abgemeldeter Benutzer ein Formular ausfüllen, das nur noch 401 liefert.
  $('verwaltung').hidden = true
  setzeZustand('Nicht angemeldet.')
}

function ausFormular(formular) {
  const daten = {}
  for (const [name, wert] of new FormData(formular)) daten[name] = String(wert)
  return daten
}

async function mitSperre(knopf, arbeit) {
  knopf.disabled = true
  try { return await arbeit() } finally { knopf.disabled = false }
}

$('form-anmelden').addEventListener('submit', async (ereignis) => {
  ereignis.preventDefault()
  const knopf = ereignis.target.querySelector('button')
  await mitSperre(knopf, async () => {
    const daten = ausFormular(ereignis.target)
    setzeZustand('Melde an …')
    const ergebnis = await rufe(PFAD_ANMELDEN, { email: daten.email, password: daten.password })
    if (!ergebnis.ok) { setzeZustand(ergebnis.meldung, 'fehler'); return }
    ereignis.target.reset()
    await pruefeSitzung()
  })
})

$('form-registrieren').addEventListener('submit', async (ereignis) => {
  ereignis.preventDefault()
  const knopf = ereignis.target.querySelector('button')
  await mitSperre(knopf, async () => {
    const daten = ausFormular(ereignis.target)
    setzeZustand('Lege Konto an …')
    // **Der Erstinbetriebnahme-Weg braucht keinen CSRF-Wert.** Es gibt noch keine
    // Sitzung, also kann es auch keinen fremden Willen geben, der mißbraucht
    // würde; das Geheimnis ist hier der Claim (wege.ts begründet das).
    const ergebnis = await rufe(PFAD_REGISTRIEREN, {
      email: daten.email,
      password: daten.password,
      displayName: daten.displayName,
      claimToken: daten.claimToken,
    })
    if (!ergebnis.ok) { setzeZustand(ergebnis.meldung, 'fehler'); return }
    ereignis.target.reset()
    // **Kein stilles Anmelden.** wege.ts begruendet das: ein Konto anzulegen und
    // dabei anzumelden sind zwei Entscheidungen. Die Seite sagt nur, was zu tun ist.
    setzeZustand('Konto angelegt: ' + ergebnis.wert.email + ' (' + ergebnis.wert.role + '). Jetzt anmelden.', 'gut')
  })
})

// ===========================================================================
// KONTEN ALS ADMINISTRATOR — der Weg, der bis hierher fehlte
// ===========================================================================
// **Was hier der Unterschied ist.** Ein Konto anzulegen ist auf diesem Weg eine
// Zustandsänderung **im Namen eines Angemeldeten** — und dafür verlangt
// wege.ts einen **CSRF-Nachweis** (register, Admin-Zweig). Ohne ihn kam
// 403 csrf-fehlt, und deshalb konnte ein angemeldeter Administrator ueber die
// Oberfläche **kein** Konto anlegen: die Seite schickte den Wert einfach nicht
// mit.
//
// Der Wert steht im **lesbaren** CSRF-Cookie; das Sitzungscookie ist HttpOnly
// und für dieses Skript unsichtbar. Genau dafür gibt es das zweite Cookie.
// (Keine Backticks in diesem Kommentar: er steht in einem Template-Literal, und
// ein Backtick beendet es — derselbe Fehler wie in seite.ts und postgres.test.ts.)
$('form-verwalten').addEventListener('submit', async (ereignis) => {
  ereignis.preventDefault()
  const knopf = ereignis.target.querySelector('button')
  await mitSperre(knopf, async () => {
    const daten = ausFormular(ereignis.target)
    setzeZustand('Lege Konto an …')
    const ergebnis = await rufe(
      PFAD_REGISTRIEREN,
// **Kein claimToken.** Der Claim gilt nur fuer das erste Konto; hier
      // entscheidet die Sitzung eines Administrators — und die Rolle vergibt der
// Weg (user), nicht die Seite.
      { email: daten.email, password: daten.password, displayName: daten.displayName },
      csrfKopf(),
    )
    if (!ergebnis.ok) { setzeZustand(ergebnis.meldung, 'fehler'); return }
    ereignis.target.reset()
    setzeZustand('Konto angelegt: ' + ergebnis.wert.email + ' (' + ergebnis.wert.role + ').', 'gut')
  })
})

$('abmelden').addEventListener('click', async (ereignis) => {
  await mitSperre(ereignis.target, async () => {
    // **Der CSRF-Wert kommt aus dem lesbaren Cookie** — das Sitzungscookie ist
    // HttpOnly und für dieses Skript unsichtbar. Genau dafür gibt es das zweite.
    const ergebnis = await rufe(PFAD_ABMELDEN, {}, csrfKopf())
    if (!ergebnis.ok) { setzeZustand(ergebnis.meldung, 'fehler'); return }
    await pruefeSitzung()
    setzeZustand('Abgemeldet.')
  })
})

pruefeSitzung()
`

/**
 * Der Weg für das HTML.
 *
 * @returns der Handler
 */
export function wegSeite(): Weg {
  return async (_req, res) => {
    sendeSeite(res, HTML, 'text/html; charset=utf-8')
  }
}

/**
 * Der Weg für das JavaScript.
 *
 * **Warum eine eigene Datei und nicht eingebettet.** Damit die CSP
 * `script-src 'self'` sagen kann statt `'unsafe-inline'`. Eingebettetes
 * JavaScript mit `'unsafe-inline'` erlaubt **jedem** eingeschmuggelten Stück
 * Code, im Namen des Angemeldeten zu laufen — die Bequemlichkeit wäre hier teuer.
 *
 * @returns der Handler
 */
export function wegSeiteJs(): Weg {
  return async (_req, res) => {
    sendeSeite(res, JS, 'text/javascript; charset=utf-8')
  }
}

/** Beide Wege, fertig für `ctx.webServer.register`. */
export function seitenWege(): readonly { readonly kind: 'exact'; readonly path: string; readonly handler: Weg }[] {
  return [
    { kind: 'exact', path: PFAD_SEITE, handler: macheWeg('GET', wegSeite(), 'anmeldeseite') },
    { kind: 'exact', path: PFAD_SEITE_API, handler: macheWeg('GET', wegSeite(), 'anmeldeseite-api') },
    { kind: 'exact', path: PFAD_SEITE_JS, handler: macheWeg('GET', wegSeiteJs(), 'anmeldeseite-js') },
  ]
}
