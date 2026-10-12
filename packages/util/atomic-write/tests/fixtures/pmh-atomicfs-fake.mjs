// Testdoppel des Rust-Binarys `pmh-atomicfs`.
//
// Warum ein eigenes Programm und kein Mock: dieses Paket ist eine
// **Prozessgrenze**. Was geprüft werden muss, ist genau das, was ein Mock
// wegabstrahiert — Argumente, stdin, stdout, stderr und der Exit-Code. Node ist
// auf jedem Zielrechner vorhanden, deshalb ist dieses Skript der Doppelgänger.
//
// Aufruf:  <node> <dieses Skript> <behavior> <cmd> <pfad> [flags…]
//
// `behavior` steht an erster Argumentstelle; danach folgen die echten Argumente,
// die der Wrapper schickt. Verhalten:
//   ok          Erfolgszeile für `write` (stdin wird gezählt)
//   read        gibt stdin unverändert zurück
//   err         Fehlerobjekt auf stderr, Exit 125
//   errno       Fehlerobjekt mit errno, Exit 125
//   exit        Exit 125 ohne jeden Report
//   garbage     Exit 0 mit unbrauchbarem stdout
//   partial     Exit 0 mit Report, dem `identity` fehlt
//   identity    Erfolgszeile für `identity`
//   cleanup     Erfolgszeile für `cleanup`
//   probe       Erfolgszeile für `probe`
//   forever     wird nie fertig — für die Zeitüberschreitung

const [behavior = 'ok', ...rest] = process.argv.slice(2)
const command = rest[0] ?? 'unknown'
const target = rest[1] ?? 'unknown'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const identity = { device: 66306, inode: 1234567 }

switch (behavior) {
  case 'ok': {
    const input = await readStdin()
    writeJson({
      version: 1,
      path: target,
      bytes: input.length,
      synced: input.length,
      replaced: true,
      identity,
    })
    process.exit(0)
  }

  case 'read': {
    const input = await readStdin()
    process.stdout.write(input)
    process.exit(0)
  }

  case 'err':
    process.stderr.write(
      `${JSON.stringify({ code: 'ERR_ATOMIC_MOVE', message: 'MoveFileExW(...) failed for C:\\\\temp\\\\a.jsonl' })}\n`,
    )
    process.exit(125)

  case 'errno':
    process.stderr.write(`${JSON.stringify({ code: 'ERR_ATOMIC_OPEN', message: 'CreateFileW failed', errno: 5 })}\n`)
    process.exit(125)

  case 'exit':
    process.stderr.write('etwas ging schief, aber ohne JSON\n')
    process.exit(125)

  case 'garbage':
    process.stdout.write('das ist kein JSON\n')
    process.exit(0)

  case 'partial':
    writeJson({ version: 1, path: target, bytes: 1, synced: 1, replaced: false })
    process.exit(0)

  case 'identity':
    writeJson({ version: 1, path: target, identity })
    process.exit(0)

  case 'cleanup':
    writeJson({ version: 1, path: target, removed: true })
    process.exit(0)

  case 'probe':
    writeJson({
      version: 1,
      platform: 'win32',
      writeThrough: true,
      directorySync: true,
      identity: true,
      mechanism: 'MoveFileExW',
    })
    process.exit(0)

  case 'forever':
    setInterval(() => {}, 1_000)
    break

  default:
    process.stderr.write(
      `${JSON.stringify({ code: 'ERR_ATOMICFS_USAGE', message: `unbekanntes Verhalten: ${behavior} (${command})` })}\n`,
    )
    process.exit(125)
}
