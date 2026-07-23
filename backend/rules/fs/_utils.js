import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export function expandHome(p) {
  const s = String(p ?? '')
  if (s === '~') return os.homedir()
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2))
  return s
}

export function uniqueDest(destDir, fileName) {
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

export function emitLog(message, category = 'fs') {
  if (typeof globalThis.__emmiLog === 'function') {
    globalThis.__emmiLog(String(message), String(category))
  }
}

export function destIsDirectory(destRaw) {
  return (
    destRaw.endsWith('/') ||
    destRaw.endsWith(path.sep) ||
    (fs.existsSync(destRaw) && fs.statSync(destRaw).isDirectory()) ||
    !path.extname(path.basename(destRaw))
  )
}
