import { browserWait, emitLog, isDryRun } from './_utils.js'

/**
 * Wait for URL substring, CSS selector, or document complete.
 * @param {string} [urlOrSelector]
 * @param {number} [timeoutMs]
 */
export default async function wait(urlOrSelector, timeoutMs) {
  const raw = String(urlOrSelector ?? '').trim()
  const opts = {
    timeoutMs: timeoutMs != null ? Number(timeoutMs) : 10_000,
    dryRun: isDryRun(),
  }
  if (/^https?:\/\//i.test(raw) || raw.includes('://')) {
    opts.url = raw
  } else if (raw) {
    opts.selector = raw
  }
  const result = await browserWait(opts)
  emitLog(`wait ${raw || 'load'}`, 'chrome.wait')
  return result
}
