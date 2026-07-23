/**
 * Batch sugar: for each file, lookup(extension(file), table) then move.
 * Exists until the script language grows a loop — composed of extension/lookup/move.
 */
import extension from './extension.js'
import lookup from './lookup.js'
import move from './move.js'

/**
 * @param {string[]} files
 * @param {Record<string, string>} table
 */
export default function route(files, table) {
  const list = Array.isArray(files) ? files : []
  const moved = []
  for (const file of list) {
    const dest = lookup(extension(file), table)
    if (!dest) continue
    moved.push(move(file, dest))
  }
  return moved
}
