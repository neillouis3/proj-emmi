import { emitLog, gitRoot, gitRun, isDryRun } from './_utils.js'

/** @param {string} repo */
export default function status(repo) {
  const cwd = gitRoot(repo)
  const result = gitRun({
    args: ['status', '--porcelain=v1', '-b'],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`status ${cwd}`, 'git.status')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git status failed')
  return { ok: true, cwd, stdout: result.stdout, stderr: result.stderr }
}
