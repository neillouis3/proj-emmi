import fs from 'node:fs'
import { emitLog, expandHome } from './_utils.js'

/**
 * @param {string|string[]} pathInput - directory path or list of paths
 */
export default function mkdir(pathInput) {
  const dirs = Array.isArray(pathInput) ? pathInput : [pathInput]
  const created = []
  for (const dir of dirs) {
    if (!dir) continue
    const abs = expandHome(dir)
    fs.mkdirSync(abs, { recursive: true })
    emitLog(`Created directory ${abs}`, 'fs.mkdir')
    created.push(abs)
  }
  return Array.isArray(pathInput) ? created : (created[0] ?? pathInput)
}
