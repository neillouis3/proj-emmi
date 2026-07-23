/**
 * @param {string} value - key to look up (e.g. extension)
 * @param {Record<string, string>} table - map of key → dest; uses `default` if missing
 */
export default function lookup(value, table) {
  const t = table && typeof table === 'object' ? table : {}
  const key = String(value ?? '')
    .replace(/^\./, '')
    .toLowerCase()
  if (key && t[key] != null) return t[key]
  for (const [k, v] of Object.entries(t)) {
    if (k === 'default') continue
    const keys = String(k)
      .split(/[,;\s]+/)
      .map((s) => s.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean)
    if (keys.includes(key)) return v
  }
  return t.default ?? null
}
