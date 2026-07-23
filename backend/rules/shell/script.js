import path from 'node:path'
import { emitLog, isDryRun, shellRun } from './_utils.js'

/**
 * Run a script file under allowed folders (.sh / .js / .mjs).
 * @param {string} scriptPath
 * @param {string[] | string} [args]
 */
export default function script(scriptPath, args = []) {
  const file = String(scriptPath ?? '').trim()
  if (!file) throw new Error('script path is required')
  const argv = Array.isArray(args)
    ? args.map(String)
    : String(args ?? '')
        .split(/\s+/)
        .filter(Boolean)
  const ext = path.extname(file).toLowerCase()
  let command = 'bash'
  let runArgs = [file, ...argv]
  if (ext === '.js' || ext === '.mjs') {
    command = 'node'
    runArgs = [file, ...argv]
  } else if (ext !== '.sh' && ext !== '') {
    throw new Error(`Unsupported script type: ${ext || '(none)'}`)
  }

  const result = shellRun({
    command,
    args: runArgs,
    scriptInterpreter: true,
    dryRun: isDryRun(),
  })
  emitLog(
    result.ok ? `script ${file}` : `script failed (${result.code}): ${file}`,
    'shell.script',
  )
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || `exit ${result.code}`)
  }
  return {
    ok: true,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}
