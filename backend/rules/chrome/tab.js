import { browserTab, emitLog, isDryRun } from './_utils.js'

/**
 * @param {string} action  new | close | focus | list
 * @param {string} [target] URL, title substring, or 1-based tab index
 */
export default async function tab(action, target) {
  const result = await browserTab({
    action: String(action ?? 'list'),
    target: target != null ? String(target) : undefined,
    dryRun: isDryRun(),
  })
  emitLog(`tab ${action}`, 'chrome.tab')
  return result.stdout ?? result
}
