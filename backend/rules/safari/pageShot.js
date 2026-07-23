import { browserPageShot, emitLog, isDryRun } from './_utils.js'

/** @param {string} path */
export default async function pageShot(path) {
  const result = await browserPageShot({
    path: String(path ?? ''),
    dryRun: isDryRun(),
  })
  emitLog(`pageShot ${result.path}`, 'safari.pageShot')
  return result
}
