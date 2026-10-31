/**
 * Offline CLI for the exporter: session file in, PDF and page previews out.
 *
 * The Host route uses the same three steps (fold → render → compile); this entry
 * exists so the document can be inspected and iterated without a browser.
 *
 * Usage:
 *   bun src/cli.ts <session.v4.jsonl.zstd> [output directory]
 *
 * @module @prometheus-harness/pdf-export/cli
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { compileDocument, compilePreviews, disposeDocument, findTypst } from './compile.ts'
import { foldTranscript } from './model.ts'
import type { SessionHeaderLike } from './model.ts'
import { documentFileName, renderDocument } from './typst.ts'

/** Parse a decompressed JSONL session log. */
export function parseSessionLog(text: string): { header: SessionHeaderLike; events: { seq?: number; type?: string; data?: Record<string, unknown> }[] } {
  const events: { seq?: number; type?: string; data?: Record<string, unknown> }[] = []
  let header: SessionHeaderLike = {}
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let record: Record<string, unknown>
    try {
      record = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    const event = (record['event'] ?? record) as Record<string, unknown>
    if (event['type'] === 'session') {
      header = event as SessionHeaderLike
      continue
    }
    if (typeof event['type'] === 'string') events.push(event as { seq?: number; type?: string; data?: Record<string, unknown> })
  }
  return { header, events }
}

/** Read a session log (zstd or plain JSONL). */
export async function readSessionFile(path: string): Promise<string> {
  const bytes = await readFile(path)
  if (!path.endsWith('.zstd')) return bytes.toString('utf8')
  return new TextDecoder().decode(Bun.zstdDecompressSync(new Uint8Array(bytes)))
}

async function main(): Promise<void> {
  const input = process.argv[2]
  if (input === undefined) {
    console.error('usage: bun src/cli.ts <session.v4.jsonl.zstd> [output directory]')
    process.exit(2)
  }
  const outputDirectory = resolve(process.argv[3] ?? '.pmh-build/pdf-export')
  await mkdir(outputDirectory, { recursive: true })

  const binary = await findTypst()
  if (binary === undefined) throw new Error('typst not found; set PMH_TYPST')

  const { header, events } = parseSessionLog(await readSessionFile(resolve(input)))
  const transcript = foldTranscript(events, header)
  if (transcript.blocks.length === 0) throw new Error('session has no exportable content')

  const source = renderDocument(transcript, new Date().toISOString(), { protocol: process.argv.includes('--protocol') })
  const name = basename(documentFileName(transcript), '.pdf')
  const typPath = join(outputDirectory, `${name}.typ`)
  await writeFile(typPath, source, 'utf8')

  const compiled = await compileDocument(source, binary)
  try {
    const pdfPath = join(outputDirectory, `${name}.pdf`)
    await writeFile(pdfPath, await readFile(compiled.pdf))
    for (const entry of await readdir(outputDirectory)) {
      if (/^page-\d+\.png$/u.test(entry)) await rm(join(outputDirectory, entry), { force: true })
    }
    const pages = await compilePreviews(source, binary, outputDirectory)
    console.log(`typst: ${binary}`)
    console.log(`session: ${String(events.length)} events, ${String(transcript.blocks.length)} blocks`)
    console.log(`source: ${typPath}`)
    console.log(`pdf: ${pdfPath}`)
    for (const page of pages) console.log(`page: ${page}`)
  } finally {
    await disposeDocument(compiled)
  }
}

if (import.meta.main) {
  await main()
}
