import { emitLog, gitRun, isDryRun } from './_utils.js'

/** @param {string} path */
export default function init(path) {
  const cwd = String(path ?? '').trim()
  if (!cwd) throw new Error('path is required')
  const result = gitRun({
    args: ['init'],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`init ${cwd}`, 'git.init')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git init failed')
  return { ok: true, cwd, stdout: result.stdout, stderr: result.stderr }
}
