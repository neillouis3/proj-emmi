import fs from 'node:fs'
import path from 'node:path'
import { expandHome } from './_utils.js'

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
 * @param {string} dir - folder or folder/* pattern under home
 */
export default function list(dir) {
  const expanded = expandHome(dir)
  const hasWild = /[*?]/.test(expanded)
  const folder = hasWild ? path.dirname(expanded) : expanded
  const pattern = hasWild ? path.basename(expanded) : '*'
  if (!fs.existsSync(folder)) return []
  const stat = fs.statSync(folder)
  if (!stat.isDirectory()) return [folder]
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((e) => isLooseFile(e) && matchName(e.name, pattern))
    .map((e) => path.join(folder, e.name))
    .sort()
}
