import { browserPageText, emitLog, isDryRun } from './_utils.js'

/** Read visible page text from the active Chrome tab. */
export default async function pageText() {
  const result = await browserPageText({ dryRun: isDryRun() })
  emitLog(`pageText ${String(result.text ?? '').length} chars`, 'chrome.pageText')
  return result.text ?? ''
}
