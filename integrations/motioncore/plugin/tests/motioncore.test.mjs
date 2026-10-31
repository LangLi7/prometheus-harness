import { expect, test } from 'bun:test'
import { join } from 'node:path'

const script = join(import.meta.dir, '..', 'scripts', 'motioncore.mjs')
const fixture = join(import.meta.dir, 'fixtures')

function audit(target) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, script, 'audit', target],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { code: result.exitCode, output: result.stdout.toString() }
}

test('ambient loops are not reported as long-duration violations', () => {
  const { code, output } = audit(fixture)
  expect(code).toBe(0)
  expect(output).toContain('Ambient')
  expect(output).not.toContain('Dauer über 600')
})

test('linear interaction still warns', () => {
  const { output } = audit(fixture)
  expect(output).toContain('`linear` gefunden')
})
