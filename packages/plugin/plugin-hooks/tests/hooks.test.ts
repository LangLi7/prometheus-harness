/**
 * Prüfungen der Hook-Laufzeit.
 *
 * Der Aufbau folgt dem Weg eines Aufrufs: Datei lesen → Matcher prüfen → Befehl
 * ausführen → Entscheidung lesen. Die Befehle sind echte Kindprozesse, damit die
 * Prüfung nicht nur die eigene Interpretation testet.
 */

import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  hookEnvironment,
  matchesTool,
  readEnabled,
  readPluginHooks,
  runPreToolHooks,
  type HookSet,
} from '../src/hooks.ts'

const HOOKS = {
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash|Write',
        hooks: [{ type: 'command', command: 'echo ok', timeout: 5000 }],
      },
    ],
    PostToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'echo done' }] }],
  },
}

async function pluginWithHooks(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pmh-hooks-'))
  await mkdir(join(root, 'hooks'), { recursive: true })
  await writeFile(join(root, 'hooks', 'hooks.json'), JSON.stringify(HOOKS))
  return root
}

describe('hooks lesen', () => {
  test('reads matchers and commands from hooks/hooks.json', async () => {
    const root = await pluginWithHooks()
    try {
      const set = await readPluginHooks(root, 'demo@local')
      expect(set.pre).toHaveLength(1)
      expect(set.pre[0]?.matcher).toBe('Bash|Write')
      expect(set.pre[0]?.commands[0]?.command).toBe('echo ok')
      expect(set.post).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('warns about a prompt hook instead of pretending to run it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pmh-hooks-'))
    try {
      await mkdir(join(root, 'hooks'), { recursive: true })
      await writeFile(
        join(root, 'hooks', 'hooks.json'),
        JSON.stringify({ hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'prompt', prompt: 'x' }] }] } }),
      )
      const set = await readPluginHooks(root, 'demo@local')
      expect(set.pre).toHaveLength(0)
      expect(set.warnings.join(' ')).toContain('prompt')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('nothing is enabled without an explicit file', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pmh-home-'))
    try {
      expect(await readEnabled(home)).toEqual({ version: 1, enabled: [] })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('the hook environment carries no host secrets', () => {
    process.env.PMH_MASTER_KEY = 'top-secret'
    try {
      const env = hookEnvironment('/plugin', '/project', 'Bash')
      expect(env.PMH_MASTER_KEY).toBeUndefined()
      expect(env.CLAUDE_PLUGIN_ROOT).toBe('/plugin')
      expect(env.CLAUDE_TOOL_NAME).toBe('Bash')
      expect(env.PATH ?? env.Path).toBeDefined()
    } finally {
      delete process.env.PMH_MASTER_KEY
    }
  })
})

describe('matcher', () => {
  test('empty and star match everything', () => {
    expect(matchesTool('', 'Bash')).toBe(true)
    expect(matchesTool('*', 'Read')).toBe(true)
  })

  test('alternatives and regex', () => {
    expect(matchesTool('Bash|Write', 'Write')).toBe(true)
    expect(matchesTool('Bash|Write', 'Read')).toBe(false)
    expect(matchesTool('mcp__.*', 'mcp__figma__get')).toBe(true)
  })
})

describe('ausführen', () => {
  test('a JSON deny blocks the call with its reason', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pmh-hooks-'))
    try {
      const script = join(root, 'deny.mjs')
      await writeFile(
        script,
        `let input = ''\nprocess.stdin.on('data', (chunk) => { input += chunk })\nprocess.stdin.on('end', () => {\n  const data = JSON.parse(input)\n  console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'blocked: ' + data.tool_name } }))\n})\n`,
      )
      const set: HookSet = {
        plugin: 'demo@local',
        root,
        pre: [{ matcher: 'Bash', commands: [{ command: `"${process.execPath}" "${script}"`, timeoutMs: 10_000 }] }],
        post: [],
      }
      const decision = await runPreToolHooks(
        { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: root },
        [set],
        root,
      )
      expect(decision).toEqual({ block: true, reason: 'blocked: Bash' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('exit 2 blocks and carries stderr as the reason', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pmh-hooks-'))
    try {
      const script = join(root, 'exit2.mjs')
      await writeFile(script, `console.error('nope')\nprocess.exit(2)\n`)
      const set: HookSet = {
        plugin: 'demo@local',
        root,
        pre: [{ matcher: '', commands: [{ command: `"${process.execPath}" "${script}"`, timeoutMs: 10_000 }] }],
        post: [],
      }
      const decision = await runPreToolHooks(
        { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {}, cwd: root },
        [set],
        root,
      )
      expect(decision).toEqual({ block: true, reason: 'nope' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a silent success allows the call', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pmh-hooks-'))
    try {
      const set: HookSet = {
        plugin: 'demo@local',
        root,
        pre: [{ matcher: '', commands: [{ command: 'echo ok', timeoutMs: 10_000 }] }],
        post: [],
      }
      const decision = await runPreToolHooks(
        { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {}, cwd: root },
        [set],
        root,
      )
      expect(decision.block).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
