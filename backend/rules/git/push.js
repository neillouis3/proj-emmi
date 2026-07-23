import { emitLog, gitRoot, gitRun, isDryRun, safeGitArg } from './_utils.js'

/** @param {string} repo @param {string} [remote] @param {string} [branch] */
export default function push(repo, remote = 'origin', branch) {
  const cwd = gitRoot(repo)
  const rem = safeGitArg('remote', remote ?? 'origin')
  const args = ['push', rem]
  if (branch !== undefined && branch !== null && String(branch).trim() !== '') {
    args.push(safeGitArg('branch', branch))
  }
  // Never pass --force / -f — argv is a fixed array only.
  const result = gitRun({
    args,
    cwd,
    dryRun: isDryRun(),
    requiresRemote: true,
  })
  emitLog(`push ${cwd} ${args.slice(1).join(' ')}`, 'git.push')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git push failed')
  return { ok: true, cwd, remote: rem, branch: branch ? String(branch).trim() : undefined, stdout: result.stdout }
}
