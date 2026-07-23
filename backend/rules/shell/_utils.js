/**
 * @param {string} message
 * @param {string} [category]
 */
export function emitLog(message, category = 'shell') {
  if (typeof globalThis.__emmiLog === 'function') {
    globalThis.__emmiLog(String(message), String(category))
  }
}

/**
 * @param {{ command: string, args?: string[], cwd?: string, scriptInterpreter?: boolean, dryRun?: boolean, timeoutMs?: number }} opts
 */
export function shellRun(opts) {
  const run = globalThis.__emmiShellRun
  if (typeof run !== 'function') {
    throw new Error('Shell runtime is not available')
  }
  return run(opts)
}

export function isDryRun() {
  return Boolean(globalThis.__emmiRuleDryRun)
}
