/**
 * Community-style native — plain named function.
 * Runs in a Worker when loaded from ~/.emmi/natives.
 *
 * @param {string} label
 */
export default function echo_label(label) {
  return typeof label === 'string' ? label : String(label ?? '')
}
