import path from 'node:path'

function matchName(name, pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}

/**
 * @param {string} pattern - file extension (e.g. "pdf"), glob on basename (e.g. "*.png"), or "*" for all
 * @param {string[]} list - file paths
 */
export default function detect(pattern, list) {
  const files = Array.isArray(list) ? list : []
  const raw = String(pattern ?? '*').trim()
  if (!raw || raw === '*') return [...files]

  // Glob on basename (contains * or ?)
  if (/[*?]/.test(raw)) {
    return files.filter((file) => matchName(path.basename(String(file)), raw))
  }

  // Extension match
  const t = raw.replace(/^\./, '').toLowerCase()
  return files.filter((file) => {
    const ext = path.extname(String(file)).replace(/^\./, '').toLowerCase()
    return ext === t || String(file).toLowerCase().endsWith(`.${t}`)
  })
}
