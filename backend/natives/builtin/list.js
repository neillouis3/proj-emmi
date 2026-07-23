import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function expandHome(p) {
  const s = String(p ?? '')
  if (s === '~') return os.homedir()
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2))
  return s
}

function matchName(name, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}

const SKIP_LOOSE_NAMES = new Set(['.ds_store', '.localized', 'desktop.ini', 'thumbs.db'])

function isLooseFile(entry) {
  if (entry.isDirectory()) return false
  if (!entry.isFile()) return false
  const lower = entry.name.toLowerCase()
  if (SKIP_LOOSE_NAMES.has(lower)) return false
  if (lower.endsWith('.app') || lower.endsWith('.appex')) return false
  return true
}

/**
 * @param {string} glob - folder or folder/* pattern under home
 */
export default function list(glob) {
  const expanded = expandHome(glob)
  const hasWild = /[*?]/.test(expanded)
  const dir = hasWild ? path.dirname(expanded) : expanded
  const pattern = hasWild ? path.basename(expanded) : '*'
  if (!fs.existsSync(dir)) return []
  const stat = fs.statSync(dir)
  if (!stat.isDirectory()) return [dir]
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => isLooseFile(e) && matchName(e.name, pattern))
    .map((e) => path.join(dir, e.name))
    .sort()
}
