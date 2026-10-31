#!/usr/bin/env node
/**
 * repo-intel — one entry point for the three repository-intelligence services.
 *
 *   digest   gitingest    local text digest of a repository (CLI, no web UI)
 *   map      gitdiagram   architecture summary from the public Markdown endpoint
 *   reverse  gitreverse   synthetic build prompt from the public HTTP endpoint
 *
 * Identifiers, messages and code comments are English; the surrounding
 * documentation (SKILL.md, README.md) is German.
 *
 * Two process facts shape this script:
 *
 * 1. gitingest writes the digest straight into a file (`-o <path>`) instead of
 *    stdout. A captured pipe fails under a restricted Windows sandbox with
 *    EPERM and holds the whole digest in memory; a file does neither.
 * 2. A missing executable (ENOENT) and a blocked spawn (EPERM) are reported as
 *    different findings. "Not installed" and "not allowed to start" call for
 *    different remedies.
 *
 * Every subcommand is usable without a plugin host:
 *
 *   bun repo-intel.mjs check
 *   bun repo-intel.mjs digest owner/repo --exclude "dist/*"
 *   bun repo-intel.mjs map owner/repo
 *   bun repo-intel.mjs reverse owner/repo
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const GITDIAGRAM_ORIGIN = 'https://gitdiagram.com'
const GITREVERSE_ENDPOINT = 'https://www.gitreverse.com/api/reverse-prompt'
const DEFAULT_TREE_BUDGET = 40_000
const DIGEST_TIMEOUT_MS = 300_000
const HTTP_TIMEOUT_MS = 60_000

class CliError extends Error {
  /**
   * @param {string} message - user-facing message
   * @param {number} [code] - process exit code
   */
  constructor(message, code = 1) {
    super(message)
    this.name = 'CliError'
    this.code = code
  }
}

/**
 * Resolves an argument list into a positional list plus typed options.
 *
 * @param {string[]} argv - arguments after the command name
 * @param {{ flags?: string[], repeat?: string[] }} spec - declared option names
 * @returns {{ positional: string[], options: Record<string, string | true | string[]> }}
 */
function parseArgs(argv, spec = {}) {
  const flags = new Set(spec.flags ?? [])
  const repeat = new Set(spec.repeat ?? [])
  const positional = []
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const body = token.slice(2)
    const eq = body.indexOf('=')
    const name = eq === -1 ? body : body.slice(0, eq)
    let value = eq === -1 ? undefined : body.slice(eq + 1)

    if (flags.has(name)) {
      options[name] = true
      continue
    }
    if (value === undefined) {
      index += 1
      value = argv[index]
      if (value === undefined) throw new CliError(`Option --${name} needs a value`)
    }
    if (repeat.has(name)) {
      const current = options[name]
      options[name] = Array.isArray(current) ? [...current, value] : [value]
    } else {
      options[name] = value
    }
  }

  return { positional, options }
}

/**
 * Accepts `owner/repo`, a GitHub URL, a `.git` suffix, or a deep `tree/...` URL.
 *
 * @param {string} input - user-supplied repository reference
 * @returns {{ owner: string, repo: string, slug: string }}
 */
function parseRepo(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new CliError('Missing repository. Use owner/repo or a GitHub URL.')
  }
  let value = input.trim()
  value = value.replace(/^git@github\.com:/i, '')
  value = value.replace(/^https?:\/\/(www\.)?github\.com\//i, '')
  value = value.replace(/^\/*/, '')
  value = value.replace(/\.git$/i, '')

  const segments = value.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new CliError(`Could not parse a repository from "${input}". Use owner/repo.`)
  }
  const [owner, rawRepo] = segments
  const repo = rawRepo.replace(/[^A-Za-z0-9._-]/g, '')
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || repo === '') {
    throw new CliError(`Could not parse a repository from "${input}".`)
  }
  return { owner, repo, slug: `${owner}/${repo}` }
}

/**
 * Runs one child process.
 *
 * `mode` picks the stdio wiring:
 *   quiet       ignore both streams, report only the exit code
 *   progress    drop stdout, forward stderr so gitingest's progress stays visible
 *   passthrough inherit both streams, so progress is visible and no pipe exists
 *   capture     collect stdout and stderr into the result
 *
 * @param {string} command - executable name or absolute path
 * @param {string[]} args - argument list
 * @param {object} [options] - working directory, environment, timeout, mode
 * @returns {Promise<{ code: number, stdout: string, stderr: string, timedOut: boolean }>}
 */
function runProcess(command, args, options = {}) {
  const { cwd, env, timeoutMs = DIGEST_TIMEOUT_MS, mode = 'capture' } = options

  return new Promise((resolvePromise, reject) => {
    const stdio =
      mode === 'capture'
        ? ['ignore', 'pipe', 'pipe']
        : mode === 'progress'
          ? ['ignore', 'ignore', 'inherit']
          : mode === 'passthrough'
            ? ['ignore', 'inherit', 'inherit']
            : ['ignore', 'ignore', 'ignore']

    let child
    try {
      child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio })
    } catch (error) {
      reject(spawnError(command, error))
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < 8_000_000) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 64_000) stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(spawnError(command, error))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code: code ?? 1, stdout, stderr, timedOut })
    })
  })
}

/**
 * Turns a spawn failure into a message that names the actual cause.
 *
 * @param {string} command - executable that failed to start
 * @param {Error} error - error from spawn
 * @returns {CliError}
 */
function spawnError(command, error) {
  if (error?.code === 'ENOENT') {
    return new CliError(`"${command}" is not installed or not on PATH.`)
  }
  if (error?.code === 'EPERM') {
    return new CliError(
      `Could not start "${command}": the sandbox blocked the process (EPERM). This is a permission boundary, not a missing tool.`,
    )
  }
  return new CliError(`Could not start "${command}": ${error?.message ?? String(error)}`)
}

/**
 * Finds a usable gitingest entry point: the CLI itself, then the Python module.
 *
 * @returns {Promise<{ label: string, command: string, baseArgs: string[] } | null>}
 */
async function detectGitingest() {
  const localVenv =
    process.platform === 'win32'
      ? resolve('.repo-intel', 'venv', 'Scripts', 'python.exe')
      : resolve('.repo-intel', 'venv', 'bin', 'python')

  const candidates = [
    { label: 'gitingest', command: 'gitingest', baseArgs: [] },
    ...(existsSync(localVenv)
      ? [{ label: 'local venv', command: localVenv, baseArgs: ['-m', 'gitingest'] }]
      : []),
    {
      label: 'python -m gitingest',
      command: process.env.REPO_INTEL_PYTHON ?? 'python',
      baseArgs: ['-m', 'gitingest'],
    },
  ]

  for (const candidate of candidates) {
    try {
      // gitingest has no --version flag; --help exits 0 once the package imports.
      const result = await runProcess(candidate.command, [...candidate.baseArgs, '--help'], {
        timeoutMs: 20_000,
        mode: 'quiet',
      })
      if (result.code === 0) return candidate
    } catch (error) {
      if (error instanceof CliError && error.message.includes('EPERM')) throw error
    }
  }
  return null
}

/**
 * Fetches text over HTTP with a bounded timeout.
 *
 * @param {string} url - absolute URL
 * @param {object} [init] - fetch options
 * @returns {Promise<{ ok: boolean, status: number, text: string }>}
 */
async function httpText(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    return { ok: response.ok, status: response.status, text }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new CliError(`Request to ${url} timed out after ${HTTP_TIMEOUT_MS / 1000}s`)
    }
    throw new CliError(`Request to ${url} failed: ${error.message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Derives the digest summary from the file itself.
 *
 * gitingest writes only the tree and the file bodies into `-o <path>`; its
 * summary lines go to stdout. Counting the `FILE:` blocks and estimating from
 * the character count keeps the overview honest without depending on a pipe.
 *
 * @param {string} digest - complete digest text
 * @param {string} fallbackLabel - repository or path used when no header exists
 * @returns {{ repository: string, files?: number, tokens: string }}
 */
function parseDigestSummary(digest, fallbackLabel) {
  const summary = { repository: fallbackLabel, tokens: '' }
  const repository = digest.match(/^Repository:\s*(.+)$/m)
  if (repository) summary.repository = repository[1].trim()

  const files = digest.match(/^Files analyzed:\s*(\d+)/m)
  if (files) {
    summary.files = Number.parseInt(files[1], 10)
  } else {
    const counted = (digest.match(/^FILE: /gm) ?? []).length
    if (counted > 0) summary.files = counted
  }

  const tokens = digest.match(/^Estimated tokens:\s*([\w.]+)/m)
  summary.tokens = tokens ? tokens[1] : `~${Math.max(1, Math.round(digest.length / 4 / 100) / 10)}k`
  return summary
}

/**
 * Extracts the directory tree block that follows the gitingest header.
 *
 * @param {string} digest - complete digest text
 * @returns {string}
 */
function extractTree(digest) {
  const marker = digest.indexOf('Directory structure:')
  if (marker === -1) return ''
  const contentStart = digest.indexOf('================================================', marker)
  const end = contentStart === -1 ? digest.length : contentStart
  return digest.slice(marker, end).trimEnd()
}

/**
 * Writes a report file and returns its absolute path.
 *
 * @param {string} stateDir - directory for generated artifacts
 * @param {string} name - file name
 * @param {string} content - file content
 * @returns {Promise<string>}
 */
async function writeArtifact(stateDir, name, content) {
  await mkdir(stateDir, { recursive: true })
  const target = join(stateDir, name)
  await writeFile(target, content, 'utf8')
  return resolve(target)
}

/**
 * Returns an absolute artifact path without creating the file yet.
 *
 * @param {string} stateDir - directory for generated artifacts
 * @param {string} name - file name
 * @returns {string}
 */
function artifactPath(stateDir, name) {
  return resolve(join(stateDir, name))
}

/**
 * Prints a digest summary plus the directory tree, keeping the console small.
 *
 * @param {string} digest - complete digest text
 * @param {string} path - where the complete digest was written
 * @param {number} budget - character budget for the tree section
 * @param {string} label - repository or path used when no header exists
 */
function printDigestOverview(digest, path, budget, label) {
  const summary = parseDigestSummary(digest, label)
  const tree = extractTree(digest)

  console.log(`Repository: ${summary.repository}`)
  if (summary.files !== undefined) console.log(`Files analyzed: ${summary.files}`)
  console.log(`Estimated tokens: ${summary.tokens}`)
  console.log(`Digest size: ${digest.length.toLocaleString('en-US')} characters`)
  console.log('')

  if (tree !== '') {
    const clipped = tree.length > budget ? `${tree.slice(0, budget)}\n… (tree truncated)` : tree
    console.log(clipped)
    console.log('')
  }

  console.log(`Full digest written to: ${path}`)
  console.log('Read the file selectively; do not load it whole into context.')
}

async function commandCheck(options) {
  const lines = []
  let blockers = 0

  const gitingest = await detectGitingest()
  if (gitingest) {
    lines.push(`ok    gitingest (${gitingest.label})`)
  } else {
    blockers += 1
    lines.push('MISS  gitingest — run `repo-intel.mjs setup` (uses uv), or install it with pipx')
  }

  try {
    const git = await runProcess('git', ['--version'], { timeoutMs: 10_000, mode: 'quiet' })
    if (git.code === 0) lines.push('ok    git')
    else {
      blockers += 1
      lines.push('MISS  git — gitingest clones repositories and needs git on PATH')
    }
  } catch (error) {
    blockers += 1
    lines.push(`MISS  git — ${error instanceof CliError ? error.message : String(error)}`)
  }

  const probes = [
    { name: 'gitdiagram', url: `${GITDIAGRAM_ORIGIN}/ahmedkhaleel2004/gitdiagram.md` },
    { name: 'gitreverse', url: 'https://www.gitreverse.com/' },
  ]
  for (const probe of probes) {
    try {
      const result = await httpText(probe.url)
      if (result.ok) lines.push(`ok    ${probe.name} reachable (HTTP ${result.status})`)
      else lines.push(`warn  ${probe.name} answered HTTP ${result.status}`)
    } catch (error) {
      lines.push(`MISS  ${probe.name} — ${error instanceof CliError ? error.message : String(error)}`)
      blockers += 1
    }
  }

  lines.push('')
  lines.push('gitdiagram MCP (structured access, no key):')
  lines.push('  pmh mcp add gitdiagram --url https://gitdiagram.com/mcp')

  for (const line of lines) console.log(line)
  if (options.json === true) {
    console.log(
      JSON.stringify({ blockers, gitingest: gitingest?.label ?? null }, null, 2),
    )
  }
  if (blockers > 0) {
    console.error(`\n${blockers} blocker(s). Nothing works silently.`)
    process.exitCode = 1
  }
}

async function commandDigest(options, positional) {
  const localOption = options.local
  const repo = localOption === undefined ? parseRepo(positional[0] ?? options.repo) : null
  const source =
    localOption === undefined ? `https://github.com/${repo.slug}` : resolve(String(localOption))
  const label = repo === null ? source : repo.slug

  const stateDir = resolve(options.dir ?? '.repo-intel')
  const include = toList(options.include)
  const exclude = toList(options.exclude)

  const gitingest = await detectGitingest()
  if (!gitingest) {
    throw new CliError(
      'gitingest is not installed. Run `repo-intel.mjs setup` (uses uv) or install it with pipx.',
    )
  }

  const safeName =
    repo === null
      ? basename(source).replace(/[^A-Za-z0-9._-]/g, '-')
      : `${repo.owner}-${repo.repo}`.replace(/[^A-Za-z0-9._-]/g, '-')
  await mkdir(stateDir, { recursive: true })
  const target = artifactPath(stateDir, `${safeName}.digest.txt`)

  // gitingest writes the file itself, so no stdout pipe is needed.
  const args = [...gitingest.baseArgs, source, '-o', target]
  for (const pattern of include) args.push('-i', pattern)
  for (const pattern of exclude) args.push('-e', pattern)
  if (options['max-size'] !== undefined) args.push('-s', String(options['max-size']))
  if (options.branch !== undefined) args.push('-b', String(options.branch))

  const env = {}
  if (options.token !== undefined) env.GITHUB_TOKEN = String(options.token)
  else if (process.env.GITHUB_TOKEN) env.GITHUB_TOKEN = process.env.GITHUB_TOKEN

  const result = await runProcess(gitingest.command, args, {
    env,
    timeoutMs: Number(options.timeout ?? DIGEST_TIMEOUT_MS),
    mode: 'progress',
  })

  if (result.timedOut) {
    throw new CliError(`gitingest exceeded the timeout for ${label}. Try --include to narrow the scope.`)
  }
  if (result.code !== 0) {
    throw new CliError(
      `gitingest failed for ${label} (exit ${result.code}). See the output above. Private repositories need --token or GITHUB_TOKEN.`,
    )
  }

  let digest
  try {
    digest = await readFile(target, 'utf8')
  } catch {
    throw new CliError(`gitingest reported success but wrote no digest to ${target}.`)
  }
  if (digest.trim() === '') {
    throw new CliError(`gitingest wrote an empty digest for ${label}.`)
  }

  if (options.stdout === true) {
    process.stdout.write(digest)
  } else {
    printDigestOverview(digest, target, Number(options.budget ?? DEFAULT_TREE_BUDGET), label)
  }

  if (options.json === true) {
    console.error(
      JSON.stringify({
        source: label,
        artifact: target,
        characters: digest.length,
        ...parseDigestSummary(digest, label),
      }),
    )
  }
}

async function commandMap(options, positional) {
  const repo = parseRepo(positional[0] ?? options.repo)
  const stateDir = resolve(options.dir ?? '.repo-intel')
  const url = `${GITDIAGRAM_ORIGIN}/${repo.slug}.md`

  const result = await httpText(url)

  if (result.status === 404) {
    throw new CliError(
      `gitdiagram has no diagram for ${repo.slug} yet (HTTP 404). Open ${GITDIAGRAM_ORIGIN}/${repo.slug} once in a browser to generate it, or use the MCP server for a fresh generation.`,
    )
  }
  if (!result.ok) {
    throw new CliError(`gitdiagram answered HTTP ${result.status} for ${repo.slug}.`)
  }
  if (result.text.trim() === '') {
    throw new CliError(`gitdiagram returned an empty document for ${repo.slug}.`)
  }

  const safeName = `${repo.owner}-${repo.repo}`.replace(/[^A-Za-z0-9._-]/g, '-')
  const target = await writeArtifact(stateDir, `${safeName}.architecture.md`, result.text)

  const updated = result.text.match(/last updated (\d{4}-\d{2}-\d{2})/)
  const title = result.text.match(/^#\s+(.+)$/m)

  if (options.stdout === true) {
    process.stdout.write(result.text)
  } else {
    console.log(title ? title[1] : `${repo.slug} architecture`)
    console.log(`Source: ${url}`)
    if (updated) console.log(`Stand: ${updated[1]} (AI-generated; verify against source)`)
    console.log(`Written to: ${target}`)
    console.log('')
    console.log(result.text)
  }
}

async function commandReverse(options, positional) {
  const repo = parseRepo(positional[0] ?? options.repo)
  const stateDir = resolve(options.dir ?? '.repo-intel')

  const result = await httpText(GITREVERSE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ repoUrl: repo.slug }),
  })

  let payload
  try {
    payload = JSON.parse(result.text)
  } catch {
    throw new CliError(`gitreverse returned invalid JSON (HTTP ${result.status}).`)
  }

  if (result.status === 429) {
    throw new CliError(
      'gitreverse is rate limited or over capacity (HTTP 429). Wait and retry; consider the local digest instead.',
    )
  }
  if (!result.ok || typeof payload.prompt !== 'string' || payload.prompt.trim() === '') {
    const detail = typeof payload.error === 'string' ? payload.error : `HTTP ${result.status}`
    throw new CliError(`gitreverse failed for ${repo.slug}: ${detail}`)
  }

  const prompt = payload.prompt.trim()
  const safeName = `${repo.owner}-${repo.repo}`.replace(/[^A-Za-z0-9._-]/g, '-')
  const target = await writeArtifact(stateDir, `${safeName}.reverse-prompt.md`, prompt)

  if (options.stdout === true) {
    process.stdout.write(prompt)
  } else {
    console.log(prompt)
    console.log('')
    console.log(`Written to: ${target}`)
    console.log('Synthetic prompt built from README, metadata and a depth-1 tree — not from the source.')
  }
}

/**
 * Checks whether one command starts and exits successfully, without output.
 *
 * @param {string} command - executable name
 * @param {string[]} args - argument list
 * @returns {Promise<boolean>}
 */
async function probeCommand(command, args) {
  try {
    const result = await runProcess(command, args, { timeoutMs: 20_000, mode: 'quiet' })
    return result.code === 0
  } catch {
    return false
  }
}

/**
 * Creates an isolated interpreter for gitingest.
 *
 * `uv` is preferred because `python -m venv` can fail in a base interpreter that
 * is itself a virtual environment (ensurepip returns non-zero there). Plain pip
 * inside the new environment is the fallback.
 */
async function commandSetup(options) {
  const venvDir = resolve(options.dir ?? '.repo-intel/venv')
  const basePython = process.env.REPO_INTEL_PYTHON ?? 'python'
  const hasUv = await probeCommand('uv', ['--version'])
  // Keep uv's cache inside the workspace; the user cache directory may be outside
  // the writable area and would fail with a permission error.
  const uvEnv = { UV_CACHE_DIR: resolve(options.cache ?? '.repo-intel/uv-cache') }

  if (hasUv) {
    console.log(`Creating virtual environment with uv: ${venvDir}`)
    const created = await runProcess('uv', ['venv', venvDir], {
      timeoutMs: 120_000,
      mode: 'passthrough',
      env: uvEnv,
    })
    if (created.code !== 0) throw new CliError('uv venv failed. See the output above.')
  } else {
    console.log(`Creating virtual environment: ${venvDir}`)
    const created = await runProcess(basePython, ['-m', 'venv', venvDir], {
      timeoutMs: 120_000,
      mode: 'passthrough',
    })
    if (created.code !== 0) {
      throw new CliError(
        'Could not create the virtual environment. Install uv (`winget install astral-sh.uv`) and retry, or install gitingest globally with pipx.',
      )
    }
  }

  const venvPython =
    process.platform === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python')

  console.log('Installing gitingest')
  const install = hasUv
    ? await runProcess('uv', ['pip', 'install', '--python', venvPython, 'gitingest'], {
        timeoutMs: 300_000,
        mode: 'passthrough',
        env: uvEnv,
      })
    : await runProcess(venvPython, ['-m', 'pip', 'install', '--upgrade', 'gitingest'], {
        timeoutMs: 300_000,
        mode: 'passthrough',
      })

  if (install.code !== 0) throw new CliError('Installing gitingest failed. See the output above.')

  console.log('')
  console.log('Done. Point the harness at this interpreter:')
  console.log(`  REPO_INTEL_PYTHON=${venvPython}`)
}

/**
 * Normalises a repeatable option into a list.
 *
 * @param {string | true | string[] | undefined} value - parsed option value
 * @returns {string[]}
 */
function toList(value) {
  if (value === undefined) return []
  if (Array.isArray(value)) return value
  if (value === true) return []
  return [value]
}

function printUsage() {
  console.log(`repo-intel — repository intelligence for agents

Usage:
  repo-intel.mjs check [--json]
  repo-intel.mjs digest <owner/repo> [--include GLOB] [--exclude GLOB]
                                  [--max-size BYTES] [--branch NAME]
                                  [--token TOKEN] [--local DIR] [--dir DIR]
                                  [--stdout] [--json]
  repo-intel.mjs map <owner/repo> [--dir DIR] [--stdout]
  repo-intel.mjs reverse <owner/repo> [--dir DIR] [--stdout]
  repo-intel.mjs setup [--dir DIR]

Exit codes: 0 success, 1 failure or unmet precondition.
`)
}

async function main(argv) {
  const [command, ...rest] = argv
  if (command === undefined || command === '--help' || command === '-h') {
    printUsage()
    return
  }

  if (command === 'check') {
    const { options } = parseArgs(rest, { flags: ['json'] })
    await commandCheck(options)
    return
  }
  if (command === 'digest') {
    const { positional, options } = parseArgs(rest, {
      flags: ['stdout', 'json'],
      repeat: ['include', 'exclude'],
    })
    await commandDigest(options, positional)
    return
  }
  if (command === 'map') {
    const { positional, options } = parseArgs(rest, { flags: ['stdout'] })
    await commandMap(options, positional)
    return
  }
  if (command === 'reverse') {
    const { positional, options } = parseArgs(rest, { flags: ['stdout'] })
    await commandReverse(options, positional)
    return
  }
  if (command === 'setup') {
    const { options } = parseArgs(rest, {})
    await commandSetup(options)
    return
  }

  throw new CliError(`Unknown command "${command}". Run with --help.`)
}

main(process.argv.slice(2)).catch((error) => {
  const code = error instanceof CliError ? error.code : 1
  console.error(error instanceof CliError ? error.message : error.stack ?? String(error))
  process.exitCode = code
})
