import { browserTabs, emitLog, isDryRun } from './_utils.js'

export default function tabs() {
  const result = browserTabs({ dryRun: isDryRun() })
  emitLog(`tabs ${result.app}`, 'chrome.tabs')
  return result
}
