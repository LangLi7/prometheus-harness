/**
 * Install Typst on the host, per operating system.
 *
 * The export needs one external program. Asking the user to read a README is a
 * worse experience than using the package manager the machine already has, so
 * the plugin resolves a platform plan and runs it on first use — never at boot,
 * because a chat plugin should not install software before anyone asked for a
 * document.
 *
 * @module @prometheus-harness/pdf-export/install
 */

/** One platform's install route. */
export interface InstallPlan {
  readonly method: 'winget' | 'brew' | 'cargo' | 'none'
  readonly command: readonly string[]
  readonly hint: string
}

/**
 * Choose the install route for one platform.
 *
 * @param platform - `process.platform` value.
 * @returns the plan; `none` carries the manual instruction.
 */
export function installPlan(platform: string): InstallPlan {
  if (platform === 'win32') {
    return {
      method: 'winget',
      command: ['winget', 'install', '--id', 'Typst.Typst', '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements'],
      hint: 'winget install --id Typst.Typst -e',
    }
  }
  if (platform === 'darwin') {
    return { method: 'brew', command: ['brew', 'install', 'typst'], hint: 'brew install typst' }
  }
  return {
    method: 'cargo',
    command: ['cargo', 'install', 'typst-cli', '--locked'],
    hint: 'cargo install typst-cli (or download a release from github.com/typst/typst/releases)',
  }
}

/** Result of one install attempt. */
export interface InstallResult {
  readonly ok: boolean
  readonly method: string
  readonly output: string
}

/**
 * Install Typst with the platform's package manager.
 *
 * @param platform - `process.platform` value.
 * @returns the attempt result; `ok` is false when the manager is missing or failed.
 */
export async function installTypst(platform: string = process.platform): Promise<InstallResult> {
  const plan = installPlan(platform)
  if (plan.method === 'none') return { ok: false, method: 'none', output: plan.hint }

  const executable = plan.command[0] ?? ''
  if (Bun.which(executable) === null) {
    return { ok: false, method: plan.method, output: `${executable} is not available. Install Typst manually: ${plan.hint}` }
  }

  const child = Bun.spawn([...plan.command], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' })
  const timer = setTimeout(() => child.kill(), 180_000)
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    const output = `${stdout}\n${stderr}`.trim().slice(-2000)
    return { ok: code === 0, method: plan.method, output }
  } finally {
    clearTimeout(timer)
  }
}
