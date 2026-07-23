import { parseScript } from './parse.js'
import {
  runScript,
  summarizeStatements,
  scriptHasSideEffects,
  type NativeFn,
} from './run.js'

export type ScriptPlan = {
  matchedFiles: string[]
  scope: Record<string, unknown>
  summaries: string[]
  hasSideEffects: boolean
}

function withDryRun(registry: Map<string, NativeFn>) {
  const planned: string[] = []
  const dry = new Map(registry)

  const recordFiles = (input: unknown) => {
    const files = Array.isArray(input) ? input.map(String) : [String(input)]
    for (const f of files) {
      if (f && f !== 'undefined') planned.push(f)
    }
    return files
  }

  dry.set('move', async (input, output) => {
    recordFiles(input)
    return Array.isArray(input) ? input : output
  })
  dry.set('route', async (files) => {
    recordFiles(files)
    return files
  })
  dry.set('copy', async (input, output) => {
    recordFiles(input)
    return Array.isArray(input) ? input : output
  })
  dry.set('delete', async (input) => {
    recordFiles(input)
    return input
  })
  dry.set('mkdir', async (pathInput) => pathInput)
  dry.set('rename', async (filePath, newName) => newName)
  dry.set('write', async (filePath) => String(filePath ?? ''))
  dry.set('sleep', async (ms) => Number(ms) || 0)
  dry.set('fail', async (message) => {
    throw new Error(String(message ?? 'fail'))
  })

  // Stub browser side-effects in dry-run so review can plan without opening tabs.
  const browserStub =
    (name: string) =>
    async (..._args: unknown[]) => ({ ok: true, dryRun: true, op: name })

  for (const name of [
    'chrome.browse',
    'chrome.navigate',
    'chrome.click',
    'chrome.type',
    'chrome.fill',
    'chrome.eval',
    'chrome.pageShot',
    'chrome.wait',
    'chrome.tab',
    'chrome.pageText',
    'chrome.query',
    'chrome.pageRead',
    'chrome.tabs',
    'safari.browse',
    'safari.navigate',
    'safari.click',
    'safari.type',
    'safari.fill',
    'safari.eval',
    'safari.pageShot',
    'safari.wait',
    'safari.tab',
    'safari.pageText',
    'safari.query',
    'safari.pageRead',
    'safari.tabs',
  ]) {
    if (dry.has(name)) dry.set(name, browserStub(name))
  }

  return { registry: dry, planned }
}

/** Plan (dry) or apply an automation script. */
export async function executeScript(
  source: string,
  registry: Map<string, NativeFn>,
  opts: { dryRun: boolean; scope?: Record<string, unknown> } = {
    dryRun: true,
  },
): Promise<ScriptPlan> {
  const statements = parseScript(source)
  const scope: Record<string, unknown> = { ...(opts.scope ?? {}) }
  const summaries = summarizeStatements(statements)

  const g = globalThis as unknown as { __emmiRuleDryRun?: boolean }
  if (opts.dryRun) {
    g.__emmiRuleDryRun = true
    try {
      const { registry: dry, planned } = withDryRun(registry)
      await runScript(statements, dry, scope)
      const fromList = Array.isArray(scope.files) ? scope.files.map(String) : []
      const fromPdfs = Array.isArray(scope.pdfs) ? scope.pdfs.map(String) : []
      const matched = [...new Set([...planned, ...fromList, ...fromPdfs])]
      return {
        matchedFiles: matched,
        scope,
        summaries,
        hasSideEffects: scriptHasSideEffects(summaries),
      }
    } finally {
      g.__emmiRuleDryRun = false
    }
  }

  g.__emmiRuleDryRun = false
  await runScript(statements, registry, scope)
  const matched = Array.isArray(scope.files)
    ? scope.files.map(String)
    : Array.isArray(scope.pdfs)
      ? scope.pdfs.map(String)
      : []
  return {
    matchedFiles: matched,
    scope,
    summaries,
    hasSideEffects: scriptHasSideEffects(summaries),
  }
}

export { scriptHasSideEffects, summarizeStatements }
