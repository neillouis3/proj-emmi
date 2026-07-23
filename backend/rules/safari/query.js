import { browserQuery, emitLog, isDryRun } from './_utils.js'

/** @param {string} selector */
export default async function query(selector) {
  const result = await browserQuery({
    selector: String(selector ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`query ${selector}`, 'safari.query')
  return result.text
}
