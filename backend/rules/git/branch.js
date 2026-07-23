import { emitLog, gitRoot, gitRun, isDryRun } from './_utils.js'

/** @param {string} repo */
export default function branch(repo) {
  const cwd = gitRoot(repo)
  const result = gitRun({
    args: ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`branch ${cwd}`, 'git.branch')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git branch failed')
  const name = String(result.stdout ?? '').trim()
  return { ok: true, cwd, branch: name, stdout: result.stdout }
}
