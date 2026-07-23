import { emitLog, isDryRun, shellRun } from './_utils.js'

/**
 * Run an allowlisted CLI with argv (no shell metacharacters).
 * @param {string} command
 * @param {string[] | string} [args]
 * @param {{ cwd?: string }} [opts]
 */
export default function exec(command, args = [], opts = {}) {
  const argv = Array.isArray(args)
    ? args.map(String)
    : String(args ?? '')
        .split(/\s+/)
        .filter(Boolean)
  const result = shellRun({
    command: String(command ?? ''),
    args: argv,
    cwd: opts?.cwd ? String(opts.cwd) : undefined,
    dryRun: isDryRun(),
  })
  const line = [command, ...argv].join(' ').trim()
  emitLog(
    result.ok ? `exec ${line}` : `exec failed (${result.code}): ${line}`,
    'shell.exec',
  )
  if (!result.ok) {
    const err = result.stderr || result.stdout || `exit ${result.code}`
    throw new Error(err)
  }
  return {
    ok: true,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}
