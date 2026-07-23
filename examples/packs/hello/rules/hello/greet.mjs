/**
 * Example rule. Runs sandboxed in a worker: it receives positional args and
 * returns a value. No Emmi internals are imported, and no core code changed.
 *
 * @param {string} name
 * @returns {string}
 */
export default function greet(name) {
  const who = String(name ?? 'world').trim() || 'world'
  return `Hello, ${who}!`
}
