/**
 * Run the Typst compiler.
 *
 * The Host does not link Typst; it invokes the CLI the user installed. That keeps
 * the plugin small and the document reproducible: the same source compiles
 * outside the Harness with the same binary.
 *
 * @module @prometheus-harness/pdf-export/compile
 */

import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Where a compiled document landed. */
export interface CompiledDocument {
  readonly directory: string
  readonly pdf: string
}

/**
 * Locate a Typst binary.
 *
 * Order: explicit `PMH_TYPST`, `typst` on `PATH`, then the WinGet package
 * directory (where the installer puts it without touching `PATH`).
 *
 * @returns absolute path or `undefined`.
 */
export async function findTypst(): Promise<string | undefined> {
  const configured = Bun.env['PMH_TYPST']
  if (configured !== undefined && configured.trim() !== '') {
    try {
      await access(configured, constants.X_OK)
      return configured
    } catch {
      return undefined
    }
  }

  const onPath = Bun.which('typst')
  if (onPath !== null) return onPath

  const localAppData = Bun.env['LOCALAPPDATA']
  if (localAppData === undefined) return undefined
  const packages = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  try {
    for (const entry of await readdir(packages)) {
      if (!entry.startsWith('Typst.Typst')) continue
      const root = join(packages, entry)
      for (const inner of await readdir(root)) {
        const candidate = join(root, inner, 'typst.exe')
        try {
          const info = await stat(candidate)
          if (info.isFile()) return candidate
        } catch {
          // next candidate
        }
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** Feed the source on stdin and collect the compiler's diagnostics. */
async function runTypst(binary: string, source: string, directory: string, output: string): Promise<string> {
  // Tagged PDF (PDF/UA-1): headings, tables, lists, and language survive into the
  // file, so screen readers can navigate a transcript instead of reading a canvas.
  const pdfArguments = output.endsWith('.pdf') ? ['--pdf-standard', 'ua-1'] : []
  const process = Bun.spawn([binary, 'compile', ...pdfArguments, '-', output], {
    cwd: directory,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  process.stdin.write(source)
  process.stdin.end()
  const [code, stderr] = await Promise.all([process.exited, new Response(process.stderr).text()])
  if (code !== 0) throw new Error(`typst exited with ${String(code)}: ${stderr.trim().slice(0, 1200)}`)
  return stderr
}

/**
 * Compile Typst source into a PDF inside a fresh temporary directory.
 *
 * @param source - complete document.
 * @param binary - resolved Typst executable.
 * @returns the directory holding `document.pdf`.
 */
export async function compileDocument(source: string, binary: string): Promise<CompiledDocument> {
  const directory = await mkdtemp(join(tmpdir(), 'pmh-pdf-'))
  try {
    await runTypst(binary, source, directory, 'document.pdf')
    return { directory, pdf: join(directory, 'document.pdf') }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

/**
 * Compile one page range to PNG files for previews and tests.
 *
 * @param source - complete document.
 * @param binary - resolved Typst executable.
 * @param directory - existing output directory.
 * @returns the page files in page order.
 */
export async function compilePreviews(source: string, binary: string, directory: string): Promise<string[]> {
  await runTypst(binary, source, directory, 'page-{0p}.png')
  return (await readdir(directory))
    .filter((name) => /^page-\d+\.png$/u.test(name))
    .sort()
    .map((name) => join(directory, name))
}

/** Remove a compiled document directory. */
export async function disposeDocument(document: CompiledDocument): Promise<void> {
  await rm(document.directory, { recursive: true, force: true })
}
