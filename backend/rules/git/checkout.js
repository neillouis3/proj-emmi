import { emitLog, gitRoot, gitRun, isDryRun, safeGitArg } from './_utils.js'

/** @param {string} repo @param {string} ref */
export default function checkout(repo, ref) {
  const cwd = gitRoot(repo)
  const target = safeGitArg('ref', ref)
  const result = gitRun({
    args: ['checkout', target],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`checkout ${cwd} ${target}`, 'git.checkout')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git checkout failed')
  return { ok: true, cwd, ref: target, stdout: result.stdout }
}
