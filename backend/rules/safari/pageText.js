import { browserPageText, emitLog, isDryRun } from './_utils.js'

/** Read visible page text from the front Safari document. */
export default async function pageText() {
  const result = await browserPageText({ dryRun: isDryRun() })
  emitLog(`pageText ${String(result.text ?? '').length} chars`, 'safari.pageText')
  return result.text ?? ''
}
