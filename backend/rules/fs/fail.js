/**
 * Fail the current attempt (use inside retry / if branches).
 * @param {string} message
 */
export default function fail(message) {
  throw new Error(String(message ?? 'fail'))
}
