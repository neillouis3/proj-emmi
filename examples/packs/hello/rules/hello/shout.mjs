/**
 * @param {string} message
 * @returns {string}
 */
export default function shout(message) {
  return `${String(message ?? '').toUpperCase()}!`
}
