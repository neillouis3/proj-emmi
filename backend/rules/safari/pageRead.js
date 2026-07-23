import { browserPageRead, emitLog, isDryRun } from './_utils.js'

export default function pageRead() {
  const result = browserPageRead({ dryRun: isDryRun() })
  emitLog(`pageRead ${result.title}`, 'safari.pageRead')
  return result
}
