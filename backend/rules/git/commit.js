import { emitLog, gitRoot, gitRun, isDryRun } from './_utils.js'

/** @param {string} repo @param {string} message */
export default function commit(repo, message) {
  const cwd = gitRoot(repo)
  const msg = String(message ?? '').trim()
  if (!msg) throw new Error('commit message is required')
  const result = gitRun({
    args: ['commit', '-m', msg],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`commit ${cwd}`, 'git.commit')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git commit failed')
  return { ok: true, cwd, message: msg, stdout: result.stdout }
}
