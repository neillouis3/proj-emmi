import path from 'node:path'

/**
 * @param {string} file - file path
 */
export default function extension(file) {
  return path.extname(String(file ?? ''))
    .replace(/^\./, '')
    .toLowerCase()
}
