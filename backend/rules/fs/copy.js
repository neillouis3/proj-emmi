import fs from 'node:fs'
import path from 'node:path'
import { destIsDirectory, emitLog, expandHome, uniqueDest } from './_utils.js'

/**
 * @param {string|string[]} input - file path or list of paths
 * @param {string} output - destination folder (or file path if single + has extension)
 */
export default function copy(input, output) {
  const files = Array.isArray(input) ? input : [input]
  const destRaw = expandHome(output)
  const copied = []
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
    fs.copyFileSync(from, destPath)
    emitLog(`Copied ${from} → ${destPath}`, 'fs.copy')
    copied.push(destPath)
  }
  return Array.isArray(input) ? copied : (copied[0] ?? output)
}
