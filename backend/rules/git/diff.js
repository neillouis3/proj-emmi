import { emitLog, gitRoot, gitRun, isDryRun } from './_utils.js'

/** @param {string} repo @param {boolean} [staged] */
export default function diff(repo, staged = false) {
  const cwd = gitRoot(repo)
  const args = staged ? ['diff', '--staged'] : ['diff']
  const result = gitRun({ args, cwd, dryRun: isDryRun() })
  emitLog(`diff ${cwd}${staged ? ' --staged' : ''}`, 'git.diff')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git diff failed')
  return { ok: true, cwd, stdout: result.stdout, stderr: result.stderr }
}
