import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  automationsDir,
  configPath,
  ensureEmmiDirs,
  expandPath,
  homeDir,
} from '../paths.js'
import type { AutomationConfig, EmmiConfig } from '../types.js'
import { toolConnectorMap } from '../rules/catalog.js'
const here = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_VARIABLES: Record<string, string> = {
  Desktop: path.join(homeDir(), 'Desktop'),
  Pictures: path.join(homeDir(), 'Pictures'),
  Screenshots: path.join(homeDir(), 'Pictures', 'Screenshots'),
  Downloads: path.join(homeDir(), 'Downloads'),
  Archive: path.join(homeDir(), 'Downloads', 'Archive'),
  Documents: path.join(homeDir(), 'Documents'),
}

export function defaultConfig(): EmmiConfig {
  return {
    variables: { ...DEFAULT_VARIABLES },
  }
}

export function loadConfig(): EmmiConfig {
  ensureEmmiDirs()
  const base = defaultConfig()
  if (!fs.existsSync(configPath())) {
    fs.writeFileSync(
      configPath(),
      stringifyYaml({
        variables: {
          Desktop: '~/Desktop',
          Pictures: '~/Pictures',
          Screenshots: '~/Pictures/Screenshots',
          Downloads: '~/Downloads',
          Archive: '~/Downloads/Archive',
          Documents: '~/Documents',
        },
      }),
    )
    return base
  }
  try {
    const raw = parseYaml(fs.readFileSync(configPath(), 'utf8')) as {
      variables?: Record<string, string>
    }
    const variables: Record<string, string> = { ...DEFAULT_VARIABLES }
    for (const [key, value] of Object.entries(raw.variables ?? {})) {
      variables[key] = expandPath(value, {})
    }
    return { variables }
  } catch {
    return base
  }
}

function readYamlFiles<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((file) => {
      try {
        return parseYaml(fs.readFileSync(path.join(dir, file), 'utf8')) as T
      } catch {
        return null
      }
    })
    .filter((item): item is T => !!item && typeof item === 'object')
}

function normalizeSchedule(
  raw: AutomationConfig['schedule'] | unknown,
): AutomationConfig['schedule'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as { cron?: unknown; tz?: unknown }
  const cron = typeof s.cron === 'string' ? s.cron.trim() : ''
  if (!cron) return undefined
  const tz = typeof s.tz === 'string' && s.tz.trim() ? s.tz.trim() : undefined
  return tz ? { cron, tz } : { cron }
}

function normalizeWatch(
  raw: AutomationConfig['watch'] | unknown,
): AutomationConfig['watch'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const w = raw as { paths?: unknown; debounceMs?: unknown }
  const paths = Array.isArray(w.paths)
    ? w.paths.map(String).map((p) => p.trim()).filter(Boolean)
    : []
  if (!paths.length) return undefined
  const debounceMs =
    typeof w.debounceMs === 'number' && Number.isFinite(w.debounceMs)
      ? Math.max(0, Math.floor(w.debounceMs))
      : undefined
  return debounceMs !== undefined ? { paths, debounceMs } : { paths }
}

function normalizeAutomation(raw: AutomationConfig): AutomationConfig | null {
  if (!raw?.id || !raw?.name) return null
  const script = raw.script ? String(raw.script) : undefined
  const hasSteps = Array.isArray(raw.steps)
  if (!script && !hasSteps) return null
  const schedule = normalizeSchedule(raw.schedule)
  const watch = normalizeWatch(raw.watch)
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : '',
    trigger: raw.trigger ?? 'manual',
    active: raw.active !== false,
    defaultMode: raw.defaultMode ?? 'review',
    keybind: raw.keybind ?? null,
    keybindEnabled: raw.keybindEnabled !== false,
    ...(schedule ? { schedule } : {}),
    ...(watch ? { watch } : {}),
    script,
    steps: hasSteps
      ? normalizeStoredSteps(
          raw.steps.map((step) => ({
            tool: String(step.tool),
            with: (step.with ?? {}) as Record<string, unknown>,
          })),
        )
      : [],
  }
}

/** Keep route as route; legacy fs.route is renamed, not split into extract/lookup. */
function normalizeStoredSteps(
  steps: AutomationConfig['steps'],
): AutomationConfig['steps'] {
  return steps.map((step) => {
    if (step.tool === 'fs.route') {
      return { tool: 'route', with: step.with ?? {} }
    }
    return step
  })
}

export function loadAutomations(): AutomationConfig[] {
  ensureEmmiDirs()
  return readYamlFiles<AutomationConfig>(automationsDir())
    .map(normalizeAutomation)
    .filter((a): a is AutomationConfig => !!a)
}

export function loadAutomation(id: string) {
  return loadAutomations().find((a) => a.id === id)
}

/** Curated recipe catalog bundled with the app (install-on-demand, never auto-copied). */
const recipesDir = path.resolve(here, '../../seeds/recipes')

export function loadRecipes(): AutomationConfig[] {
  return readYamlFiles<AutomationConfig>(recipesDir)
    .map(normalizeAutomation)
    .filter((a): a is AutomationConfig => !!a)
}

export function loadRecipe(id: string) {
  return loadRecipes().find((r) => r.id === id)
}

/** Convert rule-based UI steps into an executable script. */
function scriptLiteral(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return JSON.stringify(value)
}

function scriptRef(value: unknown, fallback?: string): string {
  if (typeof value === 'string' && value.startsWith('$')) {
    const name = value.slice(1)
    if (name === 'files' || name === 'filtered' || name === 'pdfs') return name
  }
  if (fallback) return fallback
  return scriptLiteral(value)
}

/** Script call name: bare for fs/shell/git, dotted for safari/chrome. */
function scriptCallName(tool: string): string {
  if (!tool.includes('.')) return tool
  const [connector, op = tool] = tool.split('.')
  if (connector === 'fs' || connector === 'shell' || connector === 'git') {
    return op
  }
  return tool
}

export function stepsToScript(steps: AutomationConfig['steps']): string {
  const lines: string[] = []
  for (const step of steps) {
    const fn = step.tool.includes('.') ? step.tool.split('.').pop()! : step.tool
    const call = scriptCallName(step.tool)
    const w = step.with ?? {}
    if (fn === 'list') {
      lines.push(
        `let files = list(${scriptLiteral(w.dir ?? w.glob ?? '~/Desktop/*')})`,
      )
    } else if (fn === 'detect') {
      lines.push(
        `let filtered = detect(${scriptLiteral(w.pattern ?? '*')}, ${scriptRef(w.list, 'files')})`,
      )
    } else if (fn === 'route') {
      lines.push(
        `route(${scriptRef(w.files, 'files')}, ${scriptLiteral(w.table ?? {})})`,
      )
    } else if (fn === 'move' || fn === 'copy') {
      lines.push(
        `${fn}(${scriptRef(w.input ?? w.path, 'files')}, ${scriptLiteral(w.output ?? w.dest ?? '')})`,
      )
    } else if (fn === 'log') {
      lines.push(`log(${scriptLiteral(w.message ?? w.template ?? 'Done')})`)
    } else if (fn === 'exec') {
      const args = Array.isArray(w.args) ? w.args : []
      const opts =
        w.cwd || w.opts
          ? `, ${scriptLiteral(w.opts ?? { cwd: w.cwd })}`
          : ''
      lines.push(
        `exec(${scriptLiteral(w.command ?? '')}, ${scriptLiteral(args)}${opts})`,
      )
    } else if (fn === 'script') {
      const args = Array.isArray(w.args) ? w.args : []
      lines.push(
        `script(${scriptLiteral(w.path ?? '')}, ${scriptLiteral(args)})`,
      )
    } else if (fn === 'extract' || fn === 'lookup') {
      continue
    } else if (Object.keys(w).length) {
      lines.push(`${call}(${Object.values(w).map(scriptLiteral).join(', ')})`)
    } else {
      lines.push(`${call}()`)
    }
  }
  return lines.join('\n')
}

/** Serialize read→modify→write per automation so concurrent PUTs can't clobber each other. */
const automationWriteLocks = new Map<string, Promise<void>>()

export async function withAutomationWriteLock<T>(
  id: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prev = automationWriteLocks.get(id) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = prev.then(() => gate)
  automationWriteLocks.set(id, chained)
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (automationWriteLocks.get(id) === chained) {
      automationWriteLocks.delete(id)
    }
  }
}

export function writeAutomation(automation: AutomationConfig) {
  ensureEmmiDirs()
  const scriptFromSteps = automation.steps.length
    ? stepsToScript(automation.steps)
    : ''
  const withScript =
    scriptFromSteps.trim() || automation.script?.trim() || ''
  const payload: AutomationConfig = {
    id: automation.id,
    name: automation.name,
    description: automation.description ?? '',
    trigger: automation.trigger,
    active: automation.active,
    defaultMode: automation.defaultMode,
    keybind: automation.keybind ?? null,
    keybindEnabled: automation.keybindEnabled !== false,
    ...(automation.schedule ? { schedule: automation.schedule } : {}),
    ...(automation.watch ? { watch: automation.watch } : {}),
    steps: automation.steps,
    ...(withScript ? { script: withScript } : {}),
  }
  const file = path.join(automationsDir(), `${automation.id}.yaml`)
  const tmp = `${file}.tmp`
  const nextContent = stringifyYaml(payload)
  if (fs.existsSync(file)) {
    try {
      if (fs.readFileSync(file, 'utf8') === nextContent) return payload
    } catch {
      /* rewrite below */
    }
  }
  fs.writeFileSync(tmp, nextContent)
  fs.renameSync(tmp, file)
  return payload
}

export function deleteAutomation(id: string) {
  const file = path.join(automationsDir(), `${id}.yaml`)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  const yml = path.join(automationsDir(), `${id}.yml`)
  if (fs.existsSync(yml)) fs.unlinkSync(yml)
}

type UiStepIn = {
  fn?: string
  connectorId: string
  operation: string
  params?: string
  with?: Record<string, unknown>
  routes?: { match: string; dest: string }[]
  routeFallback?: string
}

function uiToolName(step: UiStepIn): string {
  const raw = String(step.fn || step.operation || '')
  if (raw.includes('.')) return raw
  const op = raw || String(step.operation ?? '')
  if (
    (step.connectorId === 'fs' ||
      step.connectorId === 'shell' ||
      step.connectorId === 'git') &&
    op
  ) {
    return op
  }
  if (!op) return step.connectorId || 'fs'
  return `${step.connectorId}.${op}`
}

function routeTableFromUi(
  bound: Record<string, unknown>,
  step: UiStepIn,
): Record<string, unknown> {
  const table = bound.table
  if (table && typeof table === 'object' && !Array.isArray(table)) {
    return { ...(table as Record<string, unknown>) }
  }
  const rows = (
    Array.isArray(table)
      ? table
      : (step.routes ?? bound.routes ?? [])
  ) as { match?: string; dest?: string; key?: string; value?: string }[]
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    const key = String(row.key ?? row.match ?? '')
    const value = String(row.value ?? row.dest ?? '')
    if (key) out[key] = value
  }
  const fallback = bound.fallback ?? step.routeFallback
  if (fallback != null && String(fallback).trim()) {
    out.default = fallback
  }
  return out
}

/** Map UI steps (native fn + with) to config tools. */
export function uiStepsToConfig(steps: UiStepIn[]) {
  const expanded: AutomationConfig['steps'] = []
  for (const step of steps) {
    const tool = uiToolName(step)
    const bound = { ...(step.with ?? {}) }

    // Legacy string params → with
    if (!step.with || !Object.keys(step.with).length) {
      const params = String(step.params ?? '').trim()
      if (tool === 'fs.match') {
        const containing = params.match(/containing\s+(.+)$/i)
        const globPart = containing
          ? params.slice(0, containing.index).trim()
          : params
        bound.glob = globPart || '~/Desktop/*'
        if (containing) bound.contains = containing[1].trim()
      } else if (tool === 'fs.move' && params) {
        bound.dest = params
      } else if (tool === 'fs.mkdir' && params) {
        bound.dirs = params
      } else if (tool === 'fs.notify' && params) {
        bound.template =
          params === 'summary' ? 'Moved {{count}} files' : params
      } else if (params) {
        bound.params = params
      }
    }

    if (tool === 'fs.route' || tool === 'route') {
      expanded.push({
        tool: 'route',
        with: {
          files: bound.files ?? '$files',
          table: routeTableFromUi(bound, step),
        },
      })
      continue
    }

    // Rule-based steps (list, move, detect, …)
    if (!tool.includes('.')) {
      expanded.push({ tool, with: bound })
      continue
    }

    expanded.push({ tool, with: bound })
  }
  return expanded
}

/** Collapse core.extract + core.lookup (+ optional move) into a single route step for UI. */
export function collapseLegacyRoutingSteps(
  steps: AutomationConfig['steps'],
): AutomationConfig['steps'] {
  const out: AutomationConfig['steps'] = []
  let i = 0
  while (i < steps.length) {
    const step = steps[i]
    const next = steps[i + 1]
    const isExtract = step.tool === 'core.extract' || step.tool === 'extract'
    const isLookup =
      next && (next.tool === 'core.lookup' || next.tool === 'lookup')
    if (isExtract && isLookup) {
      const lookupWith = next.with ?? {}
      let table = lookupWith.table ?? {}
      if (Array.isArray(table)) {
        table = Object.fromEntries(
          table.map((row: { key?: string; match?: string; value?: string; dest?: string }) => [
            String(row.key ?? row.match ?? ''),
            String(row.value ?? row.dest ?? ''),
          ]),
        )
      }
      if (lookupWith.fallback != null && String(lookupWith.fallback).trim()) {
        table = { ...(table as Record<string, unknown>), default: lookupWith.fallback }
      }
      out.push({
        tool: 'route',
        with: {
          files: '$files',
          table,
        },
      })
      i += 2
      const moveStep = steps[i]
      if (
        moveStep &&
        (moveStep.tool === 'move' ||
          moveStep.tool === 'fs.move' ||
          moveStep.tool === 'copy')
      ) {
        i += 1
      }
      continue
    }
    out.push(step)
    i += 1
  }
  return out
}

const BARE_CONNECTOR: Record<string, string> = {
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

export function configStepsToUi(steps: AutomationConfig['steps']) {
  return collapseLegacyRoutingSteps(steps).map((step, index) => {
    const hasDot = step.tool.includes('.')
    const [connectorId, operation = step.tool] = hasDot
      ? step.tool.split('.')
      : [BARE_CONNECTOR[step.tool] ?? toolConnectorMap()[step.tool] ?? 'fs', step.tool]
    const w = { ...(step.with ?? {}) }
    let params = ''
    if (step.tool === 'list') {
      params = String(w.dir ?? '')
    } else if (step.tool === 'detect') {
      params = String(w.pattern ?? '*')
    } else if (step.tool === 'move' || step.tool === 'copy') {
      params = [String(w.input ?? ''), String(w.output ?? '')]
        .filter(Boolean)
        .join(' → ')
    } else if (step.tool === 'route') {
      params = 'route table'
    } else if (step.tool === 'log') {
      params = String(w.message ?? '')
    } else if (step.tool === 'exec') {
      const args = Array.isArray(w.args) ? w.args.map(String).join(' ') : ''
      params = [String(w.command ?? ''), args].filter(Boolean).join(' ')
    } else if (step.tool === 'script') {
      params = String(w.path ?? '')
    } else if (step.tool === 'fs.match') {
      params = String(w.glob ?? '')
      if (w.extensions) {
        const ext = Array.isArray(w.extensions)
          ? w.extensions.join(', ')
          : String(w.extensions)
        params += params ? ` · ${ext}` : ext
      }
    } else if (step.tool === 'fs.move') {
      params = String(w.dest ?? '') || '← lookup'
    } else if (step.tool === 'core.extract') {
      params = String(w.field ?? 'extension')
    } else if (step.tool === 'core.lookup') {
      const table = Array.isArray(w.table) ? w.table : []
      params = `${table.length} rows · else ${w.fallback ?? '—'}`
    } else if (step.tool === 'fs.mkdir') {
      params = Array.isArray(w.dirs) ? w.dirs.join(', ') : String(w.dirs ?? '')
    } else if (step.tool === 'fs.notify') {
      params = String(w.template ?? w.summary ?? 'summary')
    } else {
      params = String(w.params ?? '')
    }
    return {
      id: `s${index + 1}`,
      fn: hasDot ? step.tool : step.tool,
      connectorId: connectorId || 'fs',
      operation,
      params,
      with: w,
    }
  })
}
