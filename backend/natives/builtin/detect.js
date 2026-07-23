import path from 'node:path'

/**
 * @param {string} type - file extension to match (e.g. "png"), or "*" for all
 * @param {string[]} list - file paths
 */
export default function detect(type, list) {
  const files = Array.isArray(list) ? list : []
  const t = String(type ?? '*').replace(/^\./, '').toLowerCase()
  if (t === '*' || t === '') return [...files]
  return files.filter((file) => {
    const ext = path.extname(file).replace(/^\./, '').toLowerCase()
    return ext === t || String(file).toLowerCase().endsWith(`.${t}`)
  })
}
