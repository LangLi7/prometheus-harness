/**
 * `docs/status/anmeldeseite-proxy-sonde.mjs` — mißt die Anmeldeseite **durch den
 * Entwicklungsserver hindurch**, also auf demselben Weg, den später der Browser geht.
 *
 * ## Warum das nötig ist
 *
 * Der Bau (`vite build`, exit 0) beweist nur, daß TypeScript und der Bündler zufrieden sind.
 * Er beweist **nicht**, daß
 *
 * 1. der Server überhaupt eine Seite ausliefert,
 * 2. die Weiterleitung `/api` → Host wirklich greift,
 * 3. die deutschen Fehlermeldungen unseres Servers **unverändert** durchkommen.
 *
 * Punkt 3 ist der wichtigste: die Seite zeigt die Servermeldung wörtlich an. Käme statt
 * ihrer eine Vite-Fehlerseite oder ein leerer Rumpf, wäre die Seite still kaputt.
 *
 * ## Die Lehre, die in dieser Sonde steckt
 *
 * Mir ist beim ersten Versuch ein **fremder** Vite-Server auf dem gewählten Port
 * untergekommen (`5176`, „Prometheus — Welt-Prototyp", PID 32288). Ich hätte dessen Seite
 * für meine halten können. Darum prüft diese Sonde **zuerst**, daß die gelieferte Seite
 * wirklich unsere ist — mit einem **Gegenstück**: die Kennung des Nachbarn darf **nicht**
 * vorkommen.
 *
 * ## Aufruf
 *
 * ```sh
 * bun docs/status/anmeldeseite-proxy-sonde.mjs [http://127.0.0.1:5180]
 * ```
 *
 * Erwartet, daß der Entwicklungsserver läuft **und** der Host auf `PMH_AUTH_HOST`
 * (Vorgabe `http://127.0.0.1:3081`) antwortet. Der Rückgabewert ist 0, wenn alle Prüfungen
 * bestehen, sonst 1.
 */

/** Die Adresse des Entwicklungsservers. */
const BASIS = process.argv[2] ?? 'http://127.0.0.1:5180'

/**
 * Wo die Seite liegt.
 *
 * **Seit dem 14.10.2026 unter einem Präfix**: `base: '/anmeldung/'` in `vite.config.ts`, weil
 * der **Host** sie im Betrieb unter genau diesem Pfad ausliefert
 * (`packages/api/auth-http/src/login.ts`). Entwicklungsserver und Host haben damit
 * **dieselbe Form** — ein Unterschied könnte sonst einen Fehler verdecken, den es nur im
 * Betrieb gibt.
 */
const SEITEN_PFAD = '/anmeldung/'

/** Kennung, die **nur** unsere Seite trägt. */
const EIGENE_KENNUNG = 'Anmeldung — Prometheus Harness'

/** Kennung des fremden Servers, der auf `5176` lauscht — darf hier **nie** auftauchen. */
const FREMD_KENNUNG = 'Welt-Prototyp'

/** Ein Aufruf mit Zeitgrenze; ein hängender Aufruf darf die Sonde nicht blockieren. */
async function hole(pfad, optionen = {}) {
  const antwort = await fetch(BASIS + pfad, { ...optionen, signal: AbortSignal.timeout(15_000) })
  const text = await antwort.text()
  let koerper = null
  try {
    koerper = JSON.parse(text)
  } catch {
    koerper = null
  }
  return { status: antwort.status, text, koerper, kopf: antwort.headers }
}

/** Eine Zeile der Prüfliste. */
const zeilen = []
let fehler = 0

/**
 * Trägt ein Prüfergebnis ein.
 *
 * @param name - was geprüft wurde
 * @param bestanden - ob es bestanden ist
 * @param befund - was gemessen wurde
 */
function pruefe(name, bestanden, befund) {
  if (!bestanden) fehler += 1
  zeilen.push({ name, bestanden, befund })
}

// ── 1. Ist das überhaupt unsere Seite? ──────────────────────────────────────────────
const seite = await hole(SEITEN_PFAD)
pruefe('Seite ist erreichbar (HTTP 200)', seite.status === 200, `HTTP ${seite.status}`)
pruefe('Seite trägt unsere Kennung', seite.text.includes(EIGENE_KENNUNG), EIGENE_KENNUNG)
pruefe(
  'Seite ist NICHT die des Nachbarn',
  !seite.text.includes(FREMD_KENNUNG),
  seite.text.includes(FREMD_KENNUNG) ? `FREMD! enthielt „${FREMD_KENNUNG}"` : `„${FREMD_KENNUNG}" kommt nicht vor`,
)

// **Die Verweise der Seite auf ihre eigenen Dateien.** Seit `base: '/anmeldung/'` müssen sie
// unter dem Präfix liegen — und **erreichbar** sein. Ein falsches Präfix wäre sonst eine Seite,
// die aussieht wie eine Seite und im Browser leer bleibt: HTML lädt, Skript 404.
//
// **Alle Verweise, nicht der erste.** Der erste Entwurf nahm nur das erste `<script src=…>`
// und wurde rot — im Entwicklungsbetrieb ist das Vites eigener Client (`/@vite/client`), nicht
// das Bündel der Anwendung. Die Prüfung war damit über den Entwicklungsstand, nicht über die
// Seite. Jetzt wird **jeder** Verweis angesehen; das gilt für beide Betriebsarten.
const VERWEISE = [...seite.text.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/gu)]
  .map((treffer) => treffer[1])
  .filter((wert) => wert !== undefined)

pruefe('die Seite verweist auf eigene Dateien', VERWEISE.length > 0, `${VERWEISE.length} Verweis(e)`)
const ausserhalb = VERWEISE.filter((wert) => !wert.startsWith(`${SEITEN_PFAD}`))
pruefe(
  'ALLE Verweise liegen unter dem Präfix des Hosts',
  ausserhalb.length === 0,
  ausserhalb.length === 0 ? `${VERWEISE.length} von ${VERWEISE.length}` : `außerhalb: ${ausserhalb.join(', ')}`,
)
for (const verweis of VERWEISE) {
  const datei = await hole(verweis)
  pruefe(`erreichbar: ${verweis}`, datei.status === 200, `HTTP ${datei.status}`)
}

// ── 2. Kommt die Weiterleitung /api → Host an? ──────────────────────────────────────
// Ohne Anmeldung muß unser Server „nicht-angemeldet" sagen. Sagt Vite etwas (HTML-Fehlerseite),
// ist die Weiterleitung nicht wirksam.
const ich = await hole('/api/pmh/auth/me')
pruefe('GET /api/pmh/auth/me erreicht den Host', ich.koerper !== null, ich.koerper === null ? 'kein JSON' : 'JSON')
pruefe('… und antwortet 401', ich.status === 401, `HTTP ${ich.status}`)
pruefe(
  '… mit deutschem Code nicht-angemeldet',
  ich.koerper?.error?.code === 'nicht-angemeldet',
  String(ich.koerper?.error?.code),
)

// ── 3. Die deutschen Meldungen kommen wörtlich durch ────────────────────────────────
const falsch = await hole('/api/pmh/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sonde@beispiel.invalid', password: 'bewusst-falsch-1234' }),
})
pruefe('POST /api/pmh/auth/login antwortet 401', falsch.status === 401, `HTTP ${falsch.status}`)
pruefe(
  '… mit dem Code zugangsdaten-falsch',
  falsch.koerper?.error?.code === 'zugangsdaten-falsch',
  String(falsch.koerper?.error?.code),
)
pruefe(
  '… und einer deutschen Meldung (nicht leer)',
  typeof falsch.koerper?.error?.message === 'string' && falsch.koerper.error.message.length > 0,
  JSON.stringify(falsch.koerper?.error?.message ?? null),
)
pruefe('… und ohne Keks bei Fehlschlag', !falsch.kopf.has('set-cookie'), `set-cookie: ${falsch.kopf.get('set-cookie') ?? '—'}`)

// Die zweite Tür: Registrierung ohne Claim-Token — beweist, daß auch sie durchkommt.
const ohneClaim = await hole('/api/pmh/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sonde@beispiel.invalid', password: 'bewusst-falsch-1234' }),
})
pruefe(
  'POST /api/pmh/auth/register verlangt das Claim-Token (403 claim-fehlt)',
  ohneClaim.status === 403 && ohneClaim.koerper?.error?.code === 'claim-fehlt',
  `HTTP ${ohneClaim.status} ${String(ohneClaim.koerper?.error?.code)}`,
)

// ── Bericht ─────────────────────────────────────────────────────────────────────────
console.log(`Anmeldeseite am Ursprung — ${BASIS}\n`)
for (const z of zeilen) console.log(`  ${z.bestanden ? '✓' : '✗'} ${z.name}\n      ${z.befund}`)
const bestanden = zeilen.filter((z) => z.bestanden).length
console.log(`\n${bestanden}/${zeilen.length} Prüfungen bestanden.`)
process.exit(fehler === 0 ? 0 : 1)
