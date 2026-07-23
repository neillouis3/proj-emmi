import extract from './extract.js'
import lookup from './lookup.js'
import move from './move.js'

/**
 * Batch sugar: for each file, lookup(extract('extension', file), table) then move.
 * @param {string[]} files
 * @param {Record<string, string>} table
 */
export default function route(files, table) {
  const list = Array.isArray(files) ? files : []
  const moved = []
  for (const file of list) {
    const dest = lookup(extract('extension', file), table)
    if (!dest) continue
    moved.push(move(file, dest))
  }
  return moved
}
