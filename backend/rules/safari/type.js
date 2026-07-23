import { browserType, emitLog, isDryRun } from './_utils.js'

/** @param {string} selector @param {string} text */
export default async function type(selector, text) {
  const result = await browserType({
    selector: String(selector ?? ''),
    text: String(text ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`type ${selector}`, 'safari.type')
  return result
}
