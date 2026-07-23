import { emitLog } from './_utils.js'

/**
 * @param {string} message
 * @param {string} category
 */
export default function log(message, category = 'fs') {
  emitLog(message, category)
  return message
}
