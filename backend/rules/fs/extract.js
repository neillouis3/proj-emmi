import fs from 'node:fs'
import path from 'node:path'
import { expandHome } from './_utils.js'

/**
 * @param {string} field - extension | name | stem | path | size | created | modified
 * @param {string} file - file path
 */
export default function extract(field, file) {
  const abs = expandHome(file)
  const base = path.basename(abs)
  const f = String(field ?? 'extension').toLowerCase()
  switch (f) {
    case 'extension':
      return path.extname(base).replace(/^\./, '').toLowerCase()
    case 'name':
      return base
    case 'stem':
      return path.basename(base, path.extname(base))
    case 'path':
      return abs
    case 'size': {
      if (!fs.existsSync(abs)) return 0
      return fs.statSync(abs).size
    }
    case 'created': {
      if (!fs.existsSync(abs)) return null
      return fs.statSync(abs).birthtime.toISOString()
    }
    case 'modified': {
      if (!fs.existsSync(abs)) return null
      return fs.statSync(abs).mtime.toISOString()
    }
    default:
      return path.extname(base).replace(/^\./, '').toLowerCase()
  }
}
