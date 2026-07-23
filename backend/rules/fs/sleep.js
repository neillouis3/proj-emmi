/**
 * Pause the script (ms). Useful between retries or after navigate.
 * @param {number} ms
 */
export default async function sleep(ms) {
  const n = Math.min(Math.max(Number(ms) || 0, 0), 120_000)
  if (globalThis.__emmiRuleDryRun) return n
  await new Promise((r) => setTimeout(r, n))
  return n
}
