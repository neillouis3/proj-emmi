import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  expandedScopes,
  getGitPermissions,
  pathUnderScopes,
  type GitConnectorPermissions,
} from './permissions.js'
import { expandPath } from '../paths.js'

export class GitPermissionError extends Error {
  needsGrant: boolean
  constructor(message: string, opts: { needsGrant?: boolean } = {}) {
    super(message)
    this.name = 'GitPermissionError'
    this.needsGrant = Boolean(opts.needsGrant)
  }
}

function resolveGitBinary(): string | null {
  const which = spawnSync('which', ['git'], { encoding: 'utf8', shell: false })
  if (which.status === 0) {
    const found = String(which.stdout ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean)
    if (found && fs.existsSync(found)) return found
  }
  for (const candidate of [
    '/usr/bin/git',
    '/opt/homebrew/bin/git',
    '/usr/local/bin/git',
  ]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function assertGranted(perms: GitConnectorPermissions) {
  if (perms.status === 'denied') {
    throw new GitPermissionError('Git connector is denied', { needsGrant: false })
  }
  if (perms.status === 'ask') {
    throw new GitPermissionError(
      'Git needs permission grant before running',
      { needsGrant: true },
    )
  }
}

function assertRepoPath(repoPath: string, perms: GitConnectorPermissions) {
  const abs = expandPath(repoPath, {})
  const scopes = expandedScopes(perms.folderScopes)
  if (!pathUnderScopes(abs, scopes)) {
    throw new GitPermissionError(
      `Repo path outside allowed folders: ${repoPath}`,
      { needsGrant: false },
    )
  }
  return abs
}

function truncate(text: string, max = 8000) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…(truncated)`
}

export type GitRunResult = {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
}

export function runGit(opts: {
  args: string[]
  cwd: string
  dryRun?: boolean
  /** Pull/push — requires Connectors → Git “Pull & push”. */
  requiresRemote?: boolean
}): GitRunResult {
  const perms = getGitPermissions()
  assertGranted(perms)
  if (opts.requiresRemote && !perms.remoteOps) {
    throw new GitPermissionError(
      'Pull & push is disabled — enable it in Connectors → Git',
      { needsGrant: false },
    )
  }
  const cwd = assertRepoPath(opts.cwd, perms)
  const binary = resolveGitBinary()
  if (!binary) {
    throw new GitPermissionError('git binary not found', { needsGrant: false })
  }

  if (opts.dryRun) {
    return {
      ok: true,
      code: 0,
      stdout: `[dry-run] git ${opts.args.join(' ')}`.trim(),
      stderr: '',
    }
  }

  const result = spawnSync(binary, opts.args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    timeout: opts.requiresRemote ? 120_000 : 60_000,
    maxBuffer: 4 * 1024 * 1024,
  })

  return {
    ok: result.status === 0,
    code: result.status,
    stdout: truncate(String(result.stdout ?? '')),
    stderr: truncate(String(result.stderr ?? '')),
  }
}

/** Find a .git root at or above cwd (still under scopes). */
export function resolveGitRoot(repoPath: string): string {
  const perms = getGitPermissions()
  assertGranted(perms)
  let cur = assertRepoPath(repoPath, perms)
  const scopes = expandedScopes(perms.folderScopes)
  while (true) {
    const gitDir = path.join(cur, '.git')
    if (fs.existsSync(gitDir)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) break
    if (!pathUnderScopes(parent, scopes)) break
    cur = parent
  }
  return assertRepoPath(repoPath, perms)
}

export function installGitHooks() {
  ;(globalThis as unknown as { __emmiGitRun: typeof runGit }).__emmiGitRun =
    runGit
  ;(
    globalThis as unknown as { __emmiGitRoot: typeof resolveGitRoot }
  ).__emmiGitRoot = resolveGitRoot
}
