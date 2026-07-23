import fs from 'node:fs'
import path from 'node:path'
import { destIsDirectory, emitLog, expandHome, uniqueDest } from './_utils.js'

/**
 * @param {string|string[]} input - file path or list of paths
 * @param {string} output - destination folder (or file path if single + has extension)
 */
export default function move(input, output) {
  const files = Array.isArray(input) ? input : [input]
  const destRaw = expandHome(output)
  const moved = []
  for (const file of files) {
    if (!file) continue
    const from = expandHome(file)
    if (!fs.existsSync(from)) continue
    let destPath = destRaw
    if (destIsDirectory(destRaw)) {
      fs.mkdirSync(destRaw, { recursive: true })
      destPath = uniqueDest(destRaw, path.basename(from))
    } else {
      fs.mkdirSync(path.dirname(destRaw), { recursive: true })
    }
    fs.renameSync(from, destPath)
    if (typeof globalThis.__emmiRecordMove === 'function') {
      globalThis.__emmiRecordMove(from, destPath)
    }
    emitLog(`Moved ${from} → ${destPath}`, 'fs.move')
    moved.push(destPath)
  }
  return Array.isArray(input) ? moved : (moved[0] ?? output)
}
