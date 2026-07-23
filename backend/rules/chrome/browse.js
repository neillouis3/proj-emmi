import { browserBrowse, emitLog, isDryRun } from './_utils.js'

/** @param {string} url */
export default function browse(url) {
  const result = browserBrowse({
    url: String(url ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`browse ${result.url}`, 'chrome.browse')
  return result
}
