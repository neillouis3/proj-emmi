import { browserNavigate, emitLog, isDryRun } from './_utils.js'

/** @param {string} url */
export default function navigate(url) {
  const result = browserNavigate({
    url: String(url ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`navigate ${result.url}`, 'chrome.navigate')
  return result
}
