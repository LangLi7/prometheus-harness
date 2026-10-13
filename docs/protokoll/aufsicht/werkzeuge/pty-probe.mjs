/**
 * pty-probe.mjs — Wächter-Werkzeug (Aufsicht): die PTY-Behauptungen der Sprachwahl-Recherche messen.
 *
 * WARUM. `docs/research/sprachwahl-entscheidung-2026.md` §0/§1 stützt zwei Empfehlungen auf eine
 * eigene Messung:
 *
 *   * „`node-pty` lädt und startet unter Bun, liefert aber **keine Daten** (16 Bytes, kein Marker)" —
 *     daraus folgt: das Addon ist unter Bun funktional kaputt.
 *   * „**Bun erzeugt selbst ein echtes PTY** unter Windows (ConPTY): das Kind sieht `isTTY=true`" —
 *     daraus folgt: `node-pty` **und** der Rust-PTY sind überflüssig (640 Zeilen).
 *
 * Beide Aussagen entscheiden über 640 Zeilen Code. Dieses Werkzeug misst sie nach, mit demselben
 * Ablauf: ein Kindprozess, der seinen eigenen `isTTY`-Zustand und einen Marker ausgibt. Kommt der
 * Marker an und meldet das Kind `isTTY=true`, ist die Behauptung reproduziert.
 *
 * Aufruf mit Bun:  bun run pty-probe.mjs
 */
const MARKER = 'MARKER-2708-OK'

console.log(`Laufzeit: Bun ${globalThis.Bun?.version ?? '?'} auf ${process.platform}\n`)

/** Ein Kindprozess, der seinen TTY-Zustand und einen Marker meldet. */
const kind = `console.log(process.stdout.isTTY === true ? 'istTTY=ja' : 'istTTY=nein');console.log('${MARKER}')`

/** 1. Was die Laufzeit selbst anbietet: Bun.spawn mit `terminal`. */
console.log('--- 1. Bun.spawn mit `terminal` (die Behauptung: echtes PTY unter Windows) ---')
try {
  const proc = Bun.spawn({
    cmd: [process.execPath, '-e', kind],
    terminal: { cols: 80, rows: 24, data(_terminal, chunk) { gesammelt.push(new TextDecoder().decode(chunk)) } },
  })
  var gesammelt = []
  await proc.exited
  const text = gesammelt.join('')
  console.log(`  Ausgabe (${text.length} Zeichen): ${JSON.stringify(text.slice(0, 120))}`)
  console.log(`  Marker angekommen: ${text.includes(MARKER) ? 'JA' : 'NEIN'}`)
  console.log(`  Kind meldet TTY   : ${/istTTY=ja/.test(text) ? 'JA' : 'NEIN'}`)
} catch (error) {
  console.log(`  FEHLER: ${String(error.message).split('\n')[0]}`)
  console.log('  (Ohne `terminal`-Option gibt es kein PTY — dann ist die Empfehlung nicht reproduzierbar.)')
}

/** 2. Dieselbe Aufgabe über das Addon `node-pty`. */
console.log('\n--- 2. node-pty (die Behauptung: lädt, liefert aber keine Daten) ---')
try {
  const pty = await import('node-pty')
  let daten = ''
  const kindProc = pty.spawn(process.execPath, ['-e', kind], { name: 'xterm-color', cols: 80, rows: 24 })
  kindProc.onData((chunk) => { daten += chunk })
  const fertig = new Promise((settle) => { kindProc.onExit(() => settle('beendet')); setTimeout(() => settle('Zeitlimit'), 8000) })
  const wie = await fertig
  console.log(`  Zustand: ${wie}`)
  console.log(`  Empfangene Bytes: ${daten.length}`)
  console.log(`  Marker angekommen: ${daten.includes(MARKER) ? 'JA' : 'NEIN'}`)
  console.log(`  Kind meldet TTY   : ${/istTTY=ja/.test(daten) ? 'JA' : 'NEIN'}`)
  if (!daten.includes(MARKER)) {
    console.log('  → reproduziert: das Addon startet, liefert aber keine Nutzdaten.')
  }
} catch (error) {
  console.log(`  FEHLER: ${String(error.message).split('\n')[0]}`)
}

/** 3. bun:ffi gegen kernel32 — die Behauptung, die `koffi` überflüssig macht. */
console.log('\n--- 3. bun:ffi bindet kernel32!MoveFileExW (die Behauptung: koffi überflüssig) ---')
try {
  const { dlopen, FFIType } = await import('bun:ffi')
  const lib = dlopen('kernel32.dll', {
    MoveFileExW: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  })
  console.log(`  MoveFileExW gebunden: ${typeof lib.symbols.MoveFileExW === 'function' ? 'JA' : 'NEIN'}`)
  lib.close()
} catch (error) {
  console.log(`  FEHLER: ${String(error.message).split('\n')[0]}`)
}

console.log('\nHinweis: Punkt 1 und 2 starten je einen Kindprozess. Es wird nichts geschrieben.')

/**
 * **Eigener Fehler, behoben (gemessen 13.10.2026).** Der erste Lauf dieser Probe lieferte alle
 * Ergebnisse und **beendete sich dann nicht** — der Prozess lief in ein 120-Sekunden-Zeitlimit, weil
 * `node-pty` eine Ressource offen hält. Ein Werkzeug, das seine Ergebnisse ausgibt und dann hängt,
 * ist für eine wiederkehrende Prüfung unbrauchbar. Deshalb wird hier **ausdrücklich** beendet.
 */
process.exit(0)
