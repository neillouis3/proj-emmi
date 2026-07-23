import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function expandHome(p) {
  const s = String(p ?? '')
  if (s === '~') return os.homedir()
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2))
  return s
}

function uniqueDest(destDir, fileName) {
  let candidate = path.join(destDir, fileName)
  if (!fs.existsSync(candidate)) return candidate
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  let i = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${stem}-${i}${ext}`)
    i += 1
  }
  return candidate
}

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
    const destIsDir =
      destRaw.endsWith('/') ||
      destRaw.endsWith(path.sep) ||
      (fs.existsSync(destRaw) && fs.statSync(destRaw).isDirectory()) ||
      !path.extname(path.basename(destRaw))
    if (destIsDir) {
      fs.mkdirSync(destRaw, { recursive: true })
      destPath = uniqueDest(destRaw, path.basename(from))
    } else {
      fs.mkdirSync(path.dirname(destRaw), { recursive: true })
    }
    fs.renameSync(from, destPath)
    moved.push(destPath)
  }
  return Array.isArray(input) ? moved : (moved[0] ?? output)
}
