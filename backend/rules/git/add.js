import { emitLog, gitRoot, gitRun, isDryRun } from './_utils.js'

/** @param {string} repo @param {string[]|string} paths */
export default function add(repo, paths = []) {
  const cwd = gitRoot(repo)
  const list = Array.isArray(paths)
    ? paths.map(String).filter(Boolean)
    : String(paths ?? '')
        .split(/\s+/)
        .filter(Boolean)
  if (!list.length) throw new Error('paths are required')
  const result = gitRun({
    args: ['add', '--', ...list],
    cwd,
    dryRun: isDryRun(),
  })
  emitLog(`add ${cwd} ${list.join(' ')}`, 'git.add')
  if (!result.ok) throw new Error(result.stderr || result.stdout || 'git add failed')
  return { ok: true, cwd, paths: list, stdout: result.stdout }
}
