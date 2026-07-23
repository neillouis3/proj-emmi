import { browserFill, emitLog, isDryRun } from './_utils.js'

/** @param {string} selector @param {string} text */
export default async function fill(selector, text) {
  const result = await browserFill({
    selector: String(selector ?? ''),
    text: String(text ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`fill ${selector}`, 'safari.fill')
  return result
}
