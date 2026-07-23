import { emitLog, gitRoot, gitRun, isDryRun } from './_utils.js'

/** @param {string} repo @param {number|string} [n] */
export default function gitLog(repo, n = 10) {
  const cwd = gitRoot(repo)
  const count = Math.max(1, Math.min(100, Number(n) || 10))
  const result = gitRun({
    args: ['log', `-n${count}`, '--oneline', '--decorate'],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`gitLog ${cwd} -n${count}`, 'git.gitLog')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git log failed')
  return { ok: true, cwd, stdout: result.stdout, stderr: result.stderr }
}
