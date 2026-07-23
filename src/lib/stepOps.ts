import {
  blankRuleSteps,
  cleanDesktopRuleSteps,
  singleDestRuleSteps,
  stepFn,
  summarizeStepParams,
} from '@/lib/rules'
import type { AutomationStep } from '@/types/domain'

export {
  blankRuleSteps as blankSteps,
  cleanDesktopRuleSteps as cleanDesktopSteps,
  singleDestRuleSteps as singleDestSteps,
}

export function hasPriorLookup(steps: AutomationStep[], index: number) {
  return steps
    .slice(0, index)
    .some((s) => stepFn(s) === 'lookup' || s.operation === 'route')
}

function rawWithFromStep(step: AutomationStep): Record<string, unknown> {
  if (step.with && Object.keys(step.with).length) return { ...step.with }
  const fn = stepFn(step)
  const params = String(step.params ?? '').trim()
  if (fn === 'fs.match' || fn === 'list') {
    const containing = params.match(/containing\s+(.+)$/i)
    const globPart = containing
      ? params.slice(0, containing.index).trim()
      : params.replace(/\s·\s.*$/, '').trim()
    const out: Record<string, unknown> = {
      dir: globPart || '~/Desktop/*',
      glob: globPart || '~/Desktop/*',
    }
    if (containing) out.contains = containing[1].trim()
    return out
  }
  if (fn === 'fs.move' || fn === 'move') {
    if (params && !params.startsWith('←')) {
      return params.includes('→')
        ? { input: params.split('→')[0]?.trim(), output: params.split('→')[1]?.trim() }
        : { output: params }
    }
  }
  if (fn === 'fs.notify' || fn === 'log') return { message: params || 'Done' }
  if (fn === 'fs.mkdir' || fn === 'mkdir') return { path: params }
  if (fn === 'core.extract' || fn === 'extract') return { field: params || 'extension' }
  if (fn === 'fs.route' || fn === 'route') {
    return {
      from: 'extracted',
      table: (step.routes ?? []).map((r) => ({
        key: r.match,
        value: r.dest,
      })),
      fallback: step.routeFallback ?? '~/Desktop/Other',
    }
  }
  return {}
}

function normalizeTableValue(
  table: unknown,
  fallback?: unknown,
): Record<string, unknown> | undefined {
  if (table == null) return undefined
  if (typeof table === 'object' && !Array.isArray(table)) {
    const out = { ...(table as Record<string, unknown>) }
    if (fallback != null && out.default == null) out.default = fallback
    return out
  }
  if (Array.isArray(table)) {
    const out: Record<string, unknown> = {}
    for (const row of table) {
      if (!row || typeof row !== 'object') continue
      const item = row as Record<string, unknown>
      const key = item.key ?? item.match
      const value = item.value ?? item.dest
      if (key != null && value != null) out[String(key)] = value
    }
    if (fallback != null) out.default = fallback
    return out
  }
  return undefined
}

function normalizeWithKeys(
  raw: Record<string, unknown>,
  fn: string,
): Record<string, unknown> {
  const out = { ...raw }
  const op = fn.includes('.') ? fn.split('.').pop()! : fn

  if (out.glob != null && out.dir == null) out.dir = out.glob
  if (out.dir != null && out.glob == null) out.glob = out.dir

  if (out.from != null && out.value == null) {
    out.value = out.from === 'extracted' ? '$extracted' : String(out.from)
  }

  if (out.table != null) {
    const table = normalizeTableValue(out.table, out.fallback)
    if (table) out.table = table
  }
  if (out.fallback != null && typeof out.table === 'object' && out.table != null) {
    delete out.fallback
  }

  if (out.template != null && out.message == null) out.message = out.template
  if (out.summary != null && out.message == null) out.message = out.summary

  if (op === 'extract' && out.file == null) out.file = '$file'
  if (op === 'lookup' && out.value == null) out.value = '$extracted'
  if (op === 'move') {
    if (out.input == null) out.input = '$files'
    if (out.output == null) out.output = out.dest ?? '$dest'
  }
  if (op === 'detect' && out.list == null) out.list = '$files'
  if (op === 'route' && out.files == null) out.files = '$files'

  if (op === 'exec' || op === 'script') {
    if (typeof out.args === 'string') {
      out.args = out.args.split(/\s+/).filter(Boolean)
    } else if (out.args == null) {
      out.args = []
    }
  }

  return out
}

export function normalizeStep(step: AutomationStep): AutomationStep {
  let fn = stepFn(step)
  if (fn === 'fs.route') fn = 'route'
  if (fn === 'fs.match') fn = 'list'
  if (fn === 'fs.move') fn = 'move'
  if (fn === 'core.extract') fn = 'extract'
  if (fn === 'core.lookup') fn = 'lookup'
  if (fn === 'fs.notify') fn = 'log'
  const BARE: Record<string, string> = {
    exec: 'shell',
    script: 'shell',
    status: 'git',
    diff: 'git',
    gitLog: 'git',
    branch: 'git',
    init: 'git',
    add: 'git',
    commit: 'git',
    checkout: 'git',
    pull: 'git',
    push: 'git',
  }

  let connectorId: string
  let operation: string
  if (fn.includes('.')) {
    const [cid, op = fn] = fn.split('.')
    connectorId = cid
    operation = op
  } else {
    operation = fn
    // Prefer explicit connectorId — safari/chrome share rule ids like `browse`.
    connectorId = step.connectorId || BARE[fn] || 'fs'
  }

  const withParams = normalizeWithKeys(rawWithFromStep({ ...step, fn }), fn)
  return {
    ...step,
    fn: operation,
    connectorId,
    operation: operation || step.operation,
    with: withParams,
    params: summarizeStepParams(operation, withParams),
  }
}
