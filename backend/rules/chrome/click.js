import { browserClick, emitLog, isDryRun } from './_utils.js'

/** @param {string} selector */
export default async function click(selector) {
  const result = await browserClick({
    selector: String(selector ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`click ${selector}`, 'chrome.click')
  return result
}
