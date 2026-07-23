import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  expandedShellScopes,
  getShellPermissions,
  pathUnderScopes,
  type ShellConnectorPermissions,
} from './permissions.js'
import { expandPath, homeDir } from '../paths.js'

export class ShellPermissionError extends Error {
  needsGrant: boolean
  command: string
  constructor(message: string, opts: { needsGrant?: boolean; command?: string } = {}) {
    super(message)
    this.name = 'ShellPermissionError'
    this.needsGrant = Boolean(opts.needsGrant)
    this.command = opts.command ?? ''
  }
}

const NETWORK_BINARIES = new Set([
  'curl',
  'wget',
  'nc',
  'ncat',
  'netcat',
  'ssh',
  'scp',
  'sftp',
  'ftp',
  'sftp-server',
  'telnet',
  'aria2c',
  'httpie',
  'http',
])

export type ShellAssertInput = {
  command: string
  args?: string[]
  cwd?: string
  /** When true, bash/node interpreters are allowed for scoped scripts only */
  scriptInterpreter?: boolean
}

export type ShellAssertResult =
  | { ok: true; binary: string; cwd?: string; args: string[] }
  | { ok: false; reason: string; needsGrant: boolean; command: string }

function basenameOf(command: string) {
  return path.basename(command.replace(/\\/g, '/'))
}

function resolveBinary(command: string): string | null {
  const trimmed = String(command ?? '').trim()
  if (!trimmed) return null
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    const abs = expandPath(trimmed, {})
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs
    return null
  }
  const fromPath = spawnSync('which', [trimmed], {
    encoding: 'utf8',
    shell: false,
  })
  if (fromPath.status === 0) {
    const found = String(fromPath.stdout ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean)
    if (found && fs.existsSync(found)) return found
  }
  // Common absolute fallbacks on macOS
  for (const prefix of ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin']) {
    const candidate = path.join(prefix, trimmed)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function allowlistMatches(
  binary: string,
  allowlist: string[],
): boolean {
  const base = basenameOf(binary)
  for (const entry of allowlist) {
    const e = String(entry).trim()
    if (!e) continue
    if (e === base || e === binary) return true
    if (e.includes('/') || e.includes('\\')) {
      const abs = expandPath(e, {})
      if (abs === binary) return true
    }
  }
  return false
}

function looksLikePathArg(arg: string) {
  if (!arg) return false
  if (arg.startsWith('-')) return false
  if (arg.startsWith('~/') || arg === '~') return true
  if (arg.startsWith('/')) return true
  return false
}

export function assertShellAllowed(
  input: ShellAssertInput,
  perms?: ShellConnectorPermissions,
): ShellAssertResult {
  const shell = perms ?? getShellPermissions()
  const command = String(input.command ?? '').trim()
  const args = (input.args ?? []).map(String)
  const base = basenameOf(command)

  if (!command) {
    return {
      ok: false,
      reason: 'Shell command is empty',
      needsGrant: false,
      command: '',
    }
  }

  if (shell.status === 'denied') {
    return {
      ok: false,
      reason: 'Shell connector is denied',
      needsGrant: false,
      command,
    }
  }

  if (shell.status === 'ask') {
    return {
      ok: false,
      reason: `Shell needs permission grant before running “${base}”`,
      needsGrant: true,
      command,
    }
  }

  const binary = resolveBinary(command)
  if (!binary) {
    return {
      ok: false,
      reason: `Command not found: ${command}`,
      needsGrant: false,
      command,
    }
  }

  const impliedScript =
    input.scriptInterpreter &&
    (base === 'bash' || base === 'sh' || base === 'node')

  if (!impliedScript && !allowlistMatches(binary, shell.allowlist)) {
    return {
      ok: false,
      reason: `“${base}” is not on the shell allowlist`,
      needsGrant: true,
      command: base,
    }
  }

  if (!shell.network && NETWORK_BINARIES.has(base)) {
    return {
      ok: false,
      reason: `Network is disabled for Shell — “${base}” is blocked`,
      needsGrant: false,
      command: base,
    }
  }

  const scopes = expandedShellScopes(shell.folderScopes)

  let cwd: string | undefined
  if (input.cwd) {
    cwd = expandPath(input.cwd, {})
    if (!pathUnderScopes(cwd, scopes)) {
      return {
        ok: false,
        reason: `cwd is outside allowed folders: ${input.cwd}`,
        needsGrant: false,
        command: base,
      }
    }
  }

  for (const arg of args) {
    if (!looksLikePathArg(arg)) continue
    const abs = expandPath(arg, {})
    if (!pathUnderScopes(abs, scopes) && abs !== homeDir()) {
      // Allow reading binaries outside scopes; only constrain user paths
      if (abs.startsWith('/usr/') || abs.startsWith('/bin/') || abs.startsWith('/opt/')) {
        continue
      }
      return {
        ok: false,
        reason: `Path argument outside allowed folders: ${arg}`,
        needsGrant: false,
        command: base,
      }
    }
  }

  return { ok: true, binary, cwd, args }
}

export type SpawnResult = {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
}

function scrubEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.http_proxy
  delete env.https_proxy
  delete env.HTTP_PROXY
  delete env.HTTPS_PROXY
  delete env.ALL_PROXY
  delete env.all_proxy
  return env
}

function truncate(text: string, max = 8000) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…(truncated)`
}

export function runShellCommand(opts: {
  command: string
  args?: string[]
  cwd?: string
  scriptInterpreter?: boolean
  timeoutMs?: number
  dryRun?: boolean
}): SpawnResult & { binary?: string } {
  const checked = assertShellAllowed(
    {
      command: opts.command,
      args: opts.args,
      cwd: opts.cwd,
      scriptInterpreter: opts.scriptInterpreter,
    },
  )
  if (!checked.ok) {
    throw new ShellPermissionError(checked.reason, {
      needsGrant: checked.needsGrant,
      command: checked.command,
    })
  }

  if (opts.dryRun) {
    return {
      ok: true,
      code: 0,
      stdout: `[dry-run] ${checked.binary} ${checked.args.join(' ')}`.trim(),
      stderr: '',
      binary: checked.binary,
    }
  }

  const result = spawnSync(checked.binary, checked.args, {
    cwd: checked.cwd,
    encoding: 'utf8',
    shell: false,
    env: scrubEnv(),
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 4 * 1024 * 1024,
  })

  return {
    ok: result.status === 0,
    code: result.status,
    stdout: truncate(String(result.stdout ?? '')),
    stderr: truncate(String(result.stderr ?? '')),
    binary: checked.binary,
  }
}

export function installShellHooks() {
  ;(globalThis as unknown as { __emmiShellRun: typeof runShellCommand }).__emmiShellRun =
    runShellCommand
  ;(
    globalThis as unknown as { __emmiShellAssert: typeof assertShellAllowed }
  ).__emmiShellAssert = assertShellAllowed
}
