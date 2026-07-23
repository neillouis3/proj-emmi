import fs from 'node:fs'
import path from 'node:path'
import { emitLog, expandHome } from './_utils.js'

/**
 * @param {string} filePath - file to rename
 * @param {string} newName - new basename (not full path)
 */
export default function rename(filePath, newName) {
  const from = expandHome(filePath)
  if (!fs.existsSync(from)) return from
  const dest = path.join(path.dirname(from), String(newName ?? ''))
  fs.renameSync(from, dest)
  emitLog(`Renamed ${from} → ${dest}`, 'fs.rename')
  return dest
}
