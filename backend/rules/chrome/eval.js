import { browserEval, emitLog, isDryRun } from './_utils.js'

/** @param {string} expression */
export default async function evalExpr(expression) {
  const result = await browserEval({
    expression: String(expression ?? ''),
    dryRun: isDryRun(),
  })
  emitLog('eval', 'chrome.eval')
  return result.value
}
