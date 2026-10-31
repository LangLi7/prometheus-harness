/**
 * `scripts/figma-mcp.mjs` — **der Figma-MCP startet mit einem Schlüssel aus Postgres.**
 *
 * ## Warum dieses Skript existiert
 *
 * Der MCP-Client startet einen **Kindprozess**; der kann `user_secrets` nicht selbst lesen und
 * `user_secrets` kann ihn nicht aufrufen. Ohne diesen Launcher bliebe nur ein Token in einer Datei
 * oder in der Profil-YAML — genau das, was die Datenbankablage vermeiden soll.
 *
 * Der Launcher liest `FIGMA_API_TOKEN` aus `user_secrets`, entschlüsselt ihn mit dem Hauptschlüssel
 * und setzt ihn **nur** in die Umgebung des MCP-Kindprozesses. Der Wert wird nicht ausgegeben und
 * steht in keiner YAML und keiner `.env`.
 *
 * ## Aufruf
 *
 * ```text
 * bun scripts/figma-mcp.mjs [--benutzer <email>]
 * ```
 *
 * Ohne `--benutzer` wird das **einzige** Administratorkonto genommen. Bei mehreren Konten muss die
 * Adresse genannt werden — raten wäre eine falsche Zuordnung.
 *
 * ## Was auf stdout darf
 *
 * **Nichts außer dem JSON-RPC des Kindprozesses.** Jede Diagnose geht nach stderr; ein einziger
 * `console.log` würde den MCP-Handshake zerstören.
 *
 * @module scripts/figma-mcp
 */

import { spawn } from 'node:child_process'
import { ladeGeheimnis } from '../packages/auth/store-postgres/src/index.ts'
import { aufbau } from './secret.mjs'

/** Der Name des Geheimnisses in `user_secrets`. */
const REF = 'FIGMA_API_TOKEN'

/** Ein Schalterwert, z. B. `--benutzer a@b.de`. */
function schalter(argv, name) {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}

/** Bricht mit einer Meldung auf **stderr** ab — stdout bleibt dem MCP vorbehalten. */
function abbruch(text) {
  process.stderr.write(`figma-mcp: ${text}\n`)
  process.exit(1)
}

const argv = process.argv.slice(2)
const email = (schalter(argv, '--benutzer') ?? process.env.PMH_FIGMA_USER ?? '').trim()

let auf = undefined
try {
  auf = await aufbau(process.env)
  const { sql, zugang, haupt } = auf

  let userId
  if (email !== '') {
    const zeilen = await zugang.unsafe(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email])
    userId = zeilen[0]?.id
    if (userId === undefined) abbruch(`kein Benutzer mit der Adresse ${email}`)
  } else {
    const zeilen = await zugang.unsafe(`SELECT id FROM users WHERE role = 'admin'`)
    if (zeilen.length !== 1) {
      abbruch(
        `ohne --benutzer braucht es genau einen Administrator, gefunden: ${String(zeilen.length)}. ` +
          'Bitte `--benutzer <email>` angeben.',
      )
    }
    userId = zeilen[0]?.id
  }

  const bytes = await ladeGeheimnis(zugang, haupt, { userId, ref: REF })
  if (bytes === undefined) {
    abbruch(
      `kein ${REF} für ${email === '' ? 'den Administrator' : email}. ` +
        `Setzen mit: bun scripts/secret.mjs set ${REF} --benutzer <email>  (Wert über STDIN)`,
    )
  }
  const token = new TextDecoder().decode(bytes).trim()
  if (token === '') abbruch(`${REF} ist leer`)

  // **Die Datenbank ist hier fertig.** Der Kindprozess braucht sie nicht; die Verbindung offen zu
  // lassen wäre ein zweiter Grund, warum der MCP nicht beendet.
  await sql.end({ timeout: 5 }).catch(() => undefined)
  auf = undefined

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  /*
   * **Der Kindprozess bekommt eine WHITELIST, nicht `...process.env`.**
   *
   * Das ist der Unterschied zwischen „der Token steht nicht in der YAML" und „der MCP-Server kann
   * den Hauptschlüssel lesen". `figma-developer-mcp` ist Fremdcode; gäbe man ihm die Umgebung des
   * Launchers, sähe er `DATABASE_URL` und `PMH_MASTER_KEY` — und könnte jede Zeile in
   * `user_secrets` entschlüsseln. Er braucht nur seinen eigenen Schlüssel und das, was `npx`
   * zum Starten braucht.
   */
  const erlaubt = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'ComSpec',
    'TEMP',
    'TMP',
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'HOME',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMDATA',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
  ]
  const umgebung = {}
  for (const name of erlaubt) {
    const wert = process.env[name]
    if (wert !== undefined) umgebung[name] = wert
  }
  umgebung.FIGMA_API_KEY = token
  // **Kein npm-Banner auf stdout.** Der Handshake ist JSON-RPC; jede Zeile davor bricht ihn.
  umgebung.npm_config_loglevel = 'error'

  const kind = spawn(npx, ['-y', 'figma-developer-mcp', '--stdio'], {
    stdio: 'inherit',
    // **Der einzige Ort, an dem der Klartext steht.** Nicht in argv (Prozeßliste), nicht in einer
    // Datei, nicht in der Ausgabe. Die Umgebung des Kindes ist für denselben Benutzer lesbar — das
    // ist die Grenze dieses Verfahrens und steht in `docs/design/figma-mcp.md`.
    env: umgebung,
    shell: process.platform === 'win32',
  })
  kind.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === null ? 1 : 1)
  })
  kind.on('error', (fehler) => {
    process.stderr.write(`figma-mcp: Start fehlgeschlagen: ${fehler.message}\n`)
    process.exitCode = 1
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => kind.kill(signal))
  }
} catch (fehler) {
  abbruch(fehler instanceof Error ? fehler.message : String(fehler))
} finally {
  if (auf !== undefined) await auf.sql.end({ timeout: 5 }).catch(() => undefined)
}
