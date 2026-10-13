/**
 * api-erreichbarkeit.mjs — Wächter-Werkzeug (Aufsicht): ist der API-Weg erreichbar oder nicht?
 *
 * WARUM. Die README des Ziel-Repos führt die Zeile „**API | ausgefallen.** `/api/*` → **404** (18
 * Pfade geprüft), WS `/api/remote.mux` → **1008 Policy Violation**" und leitet daraus die
 * Entscheidung „eigener Endpunktweg" ab. Diese Prüfung fragt: **kann eine 404 überhaupt beweisen,
 * dass der Weg tot ist?**
 *
 * Der Kern registriert **eine** Route `/api` und ruft sie als **`POST /api/<namespace>/<methode>`**
 * (belegt in `packages/api/gateway/tests/gateway.host.spec.ts:1121`: `fetch(origin + '/api/goals/create', { method: 'POST' })`).
 * Ein beliebiger Pfad — auch `/api/status` — muss daher **404** liefern, **auch wenn alles läuft**.
 * Der Unterschied zwischen „tot" und „lebt" zeigt sich erst an einem **registrierten** Endpunkt:
 *
 *   * lebt:  HTTP 200 mit `{"type":"server-response",…}` (Fehler im RPC-Rahmen, z. B. `bad-request`)
 *   * tot:   404 ohne JSON-RPC-Rahmen
 *
 * Zweiter Teil: der WebSocket-Pfad. Ein **nicht existierender** Upgrade-Pfad scheitert beim
 * Handschlag; ein **vorhandener**, der die Verbindung ablehnt, schließt mit einem **Close-Code**
 * (1008 = Policy Violation). Ein 1008 ist damit eher ein Zeichen **dafür**, dass die Route existiert.
 *
 * Aufruf:  bun run api-erreichbarkeit.mjs [http://127.0.0.1:3080]
 */
const base = process.argv[2] ?? 'http://127.0.0.1:3080'

console.log(`=== API-Erreichbarkeit: ${base} ===`)
console.log('Methode: POST auf registrierte und unregistrierte Endpunkte, dann WS-Handschlag.\n')

/** Antwortform lesen — der JSON-RPC-Rahmen ist das Unterscheidungsmerkmal. */
async function post(path, body = '{}') {
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    const text = await response.text()
    const istRahmen = text.includes('"server-response"') || text.includes('"rpcId"')
    return { status: response.status, rahmen: istRahmen, kurz: text.replace(/\s+/gu, ' ').slice(0, 110) }
  } catch (error) {
    return { status: `Netzfehler: ${error.message}`, rahmen: false, kurz: '' }
  }
}

const pfade = ['/api/goals/create', '/api/aufsicht/probe', '/api/health', '/api/sessions']
for (const path of pfade) {
  const ergebnis = await post(path)
  console.log(
    `${path.padEnd(24)} POST ${String(ergebnis.status).padEnd(4)} ` +
      `${ergebnis.rahmen ? 'JSON-RPC-Rahmen: JA  ' : 'JSON-RPC-Rahmen: nein'}  ${ergebnis.kurz}`,
  )
}

console.log('\n--- WebSocket-Pfad (/api/remote.mux) ---')
await new Promise((settle) => {
  let fertig = false
  const ende = (zeile) => {
    if (fertig) return
    fertig = true
    console.log(zeile)
    settle()
  }
  setTimeout(() => ende('  kein Close innerhalb von 8 s (Verbindung blieb offen = Route bedient)'), 8000)
  try {
    const ws = new WebSocket(base.replace(/^http/u, 'ws') + '/api/remote.mux')
    ws.addEventListener('open', () => ende('  offen — die Route hat den Handschlag angenommen'))
    ws.addEventListener('close', (event) => ende(`  geschlossen mit Code ${event.code}${event.reason ? ` (${event.reason})` : ''}`))
    ws.addEventListener('error', () => ende('  Fehler beim Handschlag (Route vermutlich nicht vorhanden)'))
  } catch (error) {
    ende(`  Ausnahme: ${error.message}`)
  }
})

console.log('\nDeutung: 404 allein beweist nichts. Ein JSON-RPC-Rahmen bei einem registrierten')
console.log('Endpunkt beweist, dass der Weg lebt. Ein Close-Code auf dem WS-Pfad spricht dafür,')
console.log('dass die Route existiert und die Verbindung nur abgelehnt wurde.')
process.exit(0)
