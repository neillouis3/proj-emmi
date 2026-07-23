import fs from 'node:fs'
import { emitLog, expandHome } from './_utils.js'

/**
 * @param {string|string[]} pathInput - file path or list of paths
 */
function deleteFile(pathInput) {
  const files = Array.isArray(pathInput) ? pathInput : [pathInput]
  const removed = []
  for (const file of files) {
    if (!file) continue
    const abs = expandHome(file)
    if (!fs.existsSync(abs)) continue
    fs.unlinkSync(abs)
    emitLog(`Deleted ${abs}`, 'fs.delete')
    removed.push(abs)
  }
  return Array.isArray(pathInput) ? removed : (removed[0] ?? pathInput)
}

Object.defineProperty(deleteFile, 'name', { value: 'delete', configurable: true })
export default deleteFile
