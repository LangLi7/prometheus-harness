#!/usr/bin/env node
/**
 * Legt einen Schlüssel im PMH-Credential-Store ab.
 *
 *   $env:RAE_SECRET_VALUE = "<key>"; node credentials-set.mjs ANTHROPIC_API_KEY
 *
 * Der Wert kommt ausschließlich über die Umgebungsvariable, nie über argv,
 * und wird nie ausgegeben. Die Datei wird atomar ersetzt.
 */
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseDocument } from 'yaml'

const ref = process.argv[2]
if (!ref || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) {
  console.error('Aufruf: RAE_SECRET_VALUE=<wert> node credentials-set.mjs <ENV_NAME>')
  process.exit(2)
}

const value = process.env.RAE_SECRET_VALUE
if (!value) {
  console.error('RAE_SECRET_VALUE fehlt. Der Wert wird nie als Argument übergeben.')
  process.exit(2)
}

const home = process.env.DSH_HOME || join(homedir(), '.dsh')
const file = join(home, '.credentials.yaml')

let doc
try {
  doc = existsSync(file) ? parseDocument(readFileSync(file, 'utf8')) : parseDocument('version: 1\nrefs: {}\n')
} catch (error) {
  console.error(`Credential-Datei nicht lesbar: ${error.message}`)
  process.exit(1)
}

if (doc.errors.length > 0) {
  console.error(`Credential-Datei ist kein gültiges YAML: ${doc.errors[0].message}`)
  process.exit(1)
}

if (!doc.has('version')) doc.set('version', 1)
if (!doc.has('refs')) doc.set('refs', doc.createNode({}))
doc.setIn(['refs', ref], value)

const temp = `${file}.${process.pid}.tmp`
writeFileSync(temp, doc.toString(), { mode: 0o600 })
renameSync(temp, file)
if (process.platform !== 'win32') chmodSync(file, 0o600)

console.log(JSON.stringify({ ref, configured: true, file }))
