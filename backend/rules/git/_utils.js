/**
 * @param {string} message
 * @param {string} [category]
 */
export function emitLog(message, category = 'git') {
  if (typeof globalThis.__emmiLog === 'function') {
    globalThis.__emmiLog(String(message), String(category))
  }
}

export function isDryRun() {
  return Boolean(globalThis.__emmiRuleDryRun)
}

/**
 * @param {{ args: string[], cwd: string, dryRun?: boolean, requiresRemote?: boolean }} opts
 */
export function gitRun(opts) {
  const run = globalThis.__emmiGitRun
  if (typeof run !== 'function') {
    throw new Error('Git runtime is not available')
  }
  return run(opts)
}

/**
 * Block empty values and option-injection (`-f`, `--force`, …).
 * @param {string} name
 * @param {unknown} value
 */
export function safeGitArg(name, value) {
  const s = String(value ?? '').trim()
  if (!s) throw new Error(`${name} is required`)
  if (s.startsWith('-')) throw new Error(`${name} must not start with -`)
  return s
}

export function gitRoot(repoPath) {
  const fn = globalThis.__emmiGitRoot
  if (typeof fn !== 'function') {
    throw new Error('Git runtime is not available')
  }
  return fn(String(repoPath ?? ''))
}
