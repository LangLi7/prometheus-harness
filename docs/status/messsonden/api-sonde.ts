// Messsonde: die echte Schnittstellenfläche des Hosts.
//
// Der HTTP-Weg ist gemessen: / liefert die Oberfläche, /api/* gibt es NICHT.
// Der Gateway der Vorlage ist ein WebSocket-Multiplexer. Diese Sonde prüft, ob
// er antwortet — und ob die Typert-Endpunkte registriert sind.
//
// Läuft als Kindprozess des Hosts? Nein: diese Sonde ist ein eigener Aufruf und
// bekommt Port und Token als Argumente.

const port = process.argv[2] ?? '5401'
const token = process.argv[3] ?? ''
if (token === '') {
  console.error('Aufruf: bun api-sonde.ts <port> <token>')
  process.exit(2)
}

const base = `http://127.0.0.1:${port}`
console.log(`Port ${port} · Token ${token.slice(0, 8)}…`)
console.log('')

// 1. Der Cookie, den ein Browser nach dem Token-Aufruf hat.
const first = await fetch(`${base}/?token=${token}`, { redirect: 'manual' })
const setCookie = first.headers.get('set-cookie') ?? ''
const cookie = setCookie.split(';')[0]
console.log(`1. GET /?token=…  -> ${first.status}`)
console.log(`   Cookie gesetzt: ${cookie === '' ? 'NEIN' : 'ja (' + cookie.split('=')[0] + ')'}`)

// 2. Startseite mit Cookie.
const home = await fetch(`${base}/`, { headers: { cookie } })
const html = await home.text()
console.log(`2. GET / mit Cookie -> ${home.status} · ${html.length} Zeichen`)

// 3. Der WebSocket-Multiplexer aus dsh-api-gateway (REMOTE_STREAM_MUX_PATH).
console.log('')
console.log('3. WebSocket-Multiplexer /api/remote.mux')
const wsUrl = `ws://127.0.0.1:${port}/api/remote.mux`
const result = await new Promise<string>((resolve) => {
  let settled = false
  const done = (value: string): void => {
    if (settled) return
    settled = true
    resolve(value)
  }
  try {
    const ws = new WebSocket(wsUrl, { headers: { cookie } } as never)
    const timer = setTimeout(() => {
      try { ws.close() } catch { /* egal */ }
      done('offen, aber keine Nachricht in 3000 ms (Verbindung steht)')
    }, 3000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      ws.send(JSON.stringify({ type: 'hello' }))
      setTimeout(() => done('verbunden — senden möglich'), 300)
    })
    ws.addEventListener('message', (event) => {
      clearTimeout(timer)
      const text = typeof event.data === 'string' ? event.data : '(binär)'
      done(`verbunden — Antwort: ${text.slice(0, 120)}`)
    })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      done('FEHLER beim Verbindungsaufbau')
    })
    ws.addEventListener('close', (event) => {
      clearTimeout(timer)
      done(`geschlossen (Code ${String((event as CloseEvent).code)})`)
    })
  } catch (cause) {
    done(`Wurf: ${String(cause).slice(0, 100)}`)
  }
})
console.log(`   ${result}`)

// 4. Ein paar Pfade, die ein Client sonst braucht.
console.log('')
console.log('4. Weitere Pfade (mit Cookie)')
for (const path of ['/api/remote.mux', '/typert', '/assets/index-Dp57FHwW.js', '/healthz', '/favicon.ico']) {
  try {
    const r = await fetch(`${base}${path}`, { headers: { cookie } })
    const type = r.headers.get('content-type') ?? '—'
    console.log(`   ${path.padEnd(30)} ${r.status} · ${type}`)
  } catch (cause) {
    console.log(`   ${path.padEnd(30)} FEHLER: ${String(cause).slice(0, 60)}`)
  }
}

// 5. Ohne Cookie: greift die Authentifizierung?
console.log('')
console.log('5. Ohne Cookie (die Auth muss greifen)')
for (const path of ['/', '/api/remote.mux']) {
  const r = await fetch(`${base}${path}`)
  console.log(`   ${path.padEnd(30)} ${r.status}`)
}
