import fs from 'node:fs'
import path from 'node:path'
import { emitLog, expandHome } from './_utils.js'

/**
 * Write text to a file (creates parent folders).
 * @param {string} filePath
 * @param {string|number|boolean|null|undefined} content
 */
export default function write(filePath, content) {
  const abs = expandHome(String(filePath ?? ''))
  if (!abs) throw new Error('write: path is required')
  const text =
    content == null
      ? ''
      : typeof content === 'string'
        ? content
        : typeof content === 'object'
          ? JSON.stringify(content, null, 2)
          : String(content)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (globalThis.__emmiRuleDryRun) {
    emitLog(`[dry-run] write ${abs} (${text.length} chars)`, 'fs.write')
    return abs
  }
  fs.writeFileSync(abs, text, 'utf8')
  emitLog(`Wrote ${abs} (${text.length} chars)`, 'fs.write')
  return abs
}
