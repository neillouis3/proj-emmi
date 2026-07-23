import type { AutomationStep, PathVariable, RuleDef } from '@/types/domain'
import { labelPathText } from '@/lib/pathVariables'
import {
  defaultRouteConfig,
  formatRouteRowsForDisplay,
  routeTableFromConfig,
  CLEAN_DESKTOP_DESCRIPTION,
} from '@/lib/routeTable'

export type ParamType = 'string' | 'path' | 'folder' | 'select' | 'table' | 'text'

export type RuleParamDef = {
  key: string
  label: string
  type: ParamType
  optional?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
}

export type RuleUiDef = {
  id: string
  label: string
  connectorId: string
  category?: string
  description: string
  params: RuleParamDef[]
}

const RULE_PARAM_SCHEMA: Record<string, RuleParamDef[]> = {
  move: [
    { key: 'input', label: 'Input', type: 'path', placeholder: '$files' },
    { key: 'output', label: 'Output', type: 'folder', placeholder: '~/Documents' },
  ],
  copy: [
    { key: 'input', label: 'Input', type: 'path', placeholder: '$files' },
    { key: 'output', label: 'Output', type: 'folder', placeholder: '~/Backup' },
  ],
  delete: [{ key: 'path', label: 'Path', type: 'path', placeholder: '$files' }],
  rename: [
    { key: 'path', label: 'Path', type: 'path' },
    { key: 'newName', label: 'New name', type: 'string' },
  ],
  mkdir: [{ key: 'path', label: 'Path', type: 'folder', placeholder: '~/NewFolder' }],
  write: [
    { key: 'path', label: 'Path', type: 'path', placeholder: '~/Documents/note.txt' },
    { key: 'content', label: 'Content', type: 'text', placeholder: 'Hello' },
  ],
  sleep: [
    { key: 'ms', label: 'Milliseconds', type: 'string', placeholder: '500' },
  ],
  fail: [
    { key: 'message', label: 'Message', type: 'string', placeholder: 'Gave up' },
  ],
  detect: [
    { key: 'pattern', label: 'Pattern', type: 'string', placeholder: 'pdf' },
    { key: 'list', label: 'List', type: 'string', placeholder: '$files' },
  ],
  extract: [
    {
      key: 'field',
      label: 'Field',
      type: 'select',
      options: [
        { value: 'extension', label: 'extension' },
        { value: 'name', label: 'name' },
        { value: 'stem', label: 'stem' },
        { value: 'path', label: 'path' },
        { value: 'size', label: 'size' },
        { value: 'created', label: 'created' },
        { value: 'modified', label: 'modified' },
      ],
    },
    { key: 'file', label: 'File', type: 'path', placeholder: '$file' },
  ],
  list: [{ key: 'dir', label: 'Directory', type: 'folder', placeholder: '~/Desktop/* · files only' }],
  lookup: [
    { key: 'value', label: 'Value', type: 'string', placeholder: '$extension' },
    { key: 'table', label: 'Table', type: 'table' },
  ],
  log: [
    { key: 'message', label: 'Message', type: 'text', placeholder: 'Done' },
    { key: 'category', label: 'Category', type: 'string', optional: true, placeholder: 'fs' },
  ],
  route: [
    { key: 'files', label: 'Files', type: 'string', placeholder: '$files' },
    { key: 'table', label: 'Table', type: 'table' },
  ],
  exec: [
    { key: 'command', label: 'Command', type: 'string', placeholder: 'echo' },
    {
      key: 'args',
      label: 'Args',
      type: 'string',
      optional: true,
      placeholder: 'emmi-shell-ok',
    },
  ],
  script: [
    {
      key: 'path',
      label: 'Script path',
      type: 'path',
      placeholder: '~/Desktop/run.sh',
    },
    {
      key: 'args',
      label: 'Args',
      type: 'string',
      optional: true,
      placeholder: '',
    },
  ],
  status: [{ key: 'repo', label: 'Repo', type: 'folder', placeholder: '~/Desktop' }],
  diff: [
    { key: 'repo', label: 'Repo', type: 'folder', placeholder: '~/Desktop' },
    {
      key: 'staged',
      label: 'Staged',
      type: 'select',
      optional: true,
      options: [
        { value: 'false', label: 'Working tree' },
        { value: 'true', label: 'Staged' },
      ],
    },
  ],
  gitLog: [
    { key: 'repo', label: 'Repo', type: 'folder', placeholder: '~/Desktop' },
    { key: 'n', label: 'Count', type: 'string', optional: true, placeholder: '10' },
  ],
  branch: [{ key: 'repo', label: 'Repo', type: 'folder', placeholder: '~/Desktop' }],
  init: [{ key: 'path', label: 'Path', type: 'folder', placeholder: '~/Desktop/new-repo' }],
  add: [
    { key: 'repo', label: 'Repo', type: 'folder', placeholder: '~/Desktop' },
    { key: 'paths', label: 'Paths', type: 'string', placeholder: '.' },
  ],
  commit: [
    { key: 'repo', label: 'Repo', type: 'folder', placeholder: '~/Desktop' },
    { key: 'message', label: 'Message', type: 'string', placeholder: 'Update' },
  ],
  browse: [
    { key: 'url', label: 'URL', type: 'string', placeholder: 'https://example.com' },
  ],
  tabs: [],
  navigate: [
    { key: 'url', label: 'URL', type: 'string', placeholder: 'https://example.com' },
  ],
  pageRead: [],
  pageShot: [
    {
      key: 'path',
      label: 'Save to',
      type: 'path',
      placeholder: '~/Desktop/emmi-shot.png',
    },
  ],
  wait: [
    {
      key: 'urlOrSelector',
      label: 'URL or selector',
      type: 'string',
      optional: true,
      placeholder: 'https://example.com or #main',
    },
    {
      key: 'timeoutMs',
      label: 'Timeout ms',
      type: 'string',
      optional: true,
      placeholder: '10000',
    },
  ],
  pageText: [],
  query: [
    { key: 'selector', label: 'Selector', type: 'string', placeholder: 'h1' },
  ],
  click: [
    { key: 'selector', label: 'Selector', type: 'string', placeholder: 'button' },
  ],
  type: [
    { key: 'selector', label: 'Selector', type: 'string', placeholder: 'input' },
    { key: 'text', label: 'Text', type: 'string', placeholder: 'hello' },
  ],
  fill: [
    { key: 'selector', label: 'Selector', type: 'string', placeholder: 'input' },
    { key: 'text', label: 'Text', type: 'string', placeholder: 'hello' },
  ],
  eval: [
    {
      key: 'expression',
      label: 'JavaScript',
      type: 'text',
      placeholder: 'document.title',
    },
  ],
  tab: [
    {
      key: 'action',
      label: 'Action',
      type: 'select',
      options: [
        { value: 'list', label: 'list' },
        { value: 'new', label: 'new' },
        { value: 'close', label: 'close' },
        { value: 'focus', label: 'focus' },
      ],
    },
    {
      key: 'target',
      label: 'Target',
      type: 'string',
      optional: true,
      placeholder: 'URL, title, or tab index',
    },
  ],
}

const EXTRACT_FIELD_LABELS: Record<string, string> = {
  extension: 'file extension',
  name: 'file name',
  stem: 'name without extension',
  path: 'full path',
  size: 'file size',
  created: 'creation date',
  modified: 'last modified date',
}

const VAR_REF_LABELS: Record<string, string> = {
  $files: 'listed files',
  $file: 'each file',
  $extracted: 'lookup value',
  $dest: 'matched folder',
  $extension: 'file extension',
  $pdfs: 'matching files',
  $filtered: 'matching files',
}

const RULE_DESCRIPTIONS: Record<string, string> = {
  list: 'List files in a folder',
  detect: 'Filter files by extension or pattern',
  extract: 'Read a property from a file',
  lookup: 'Map a value to a destination folder',
  route: 'Move files by extension using a routing table',
  move: 'Move files to a folder',
  copy: 'Copy files to a folder',
  delete: 'Delete files',
  rename: 'Rename a file',
  mkdir: 'Create a directory',
  write: 'Write text to a file',
  sleep: 'Pause for milliseconds',
  fail: 'Fail this attempt (use inside retry)',
  log: 'Write a message to the log',
  exec: 'Run an allowlisted CLI with argv',
  script: 'Run a .sh / .js / .mjs script under allowed folders',
  status: 'Git status (porcelain)',
  diff: 'Git diff',
  gitLog: 'Recent git commits',
  branch: 'Current git branch',
  init: 'Initialize a git repo',
  add: 'Stage paths',
  commit: 'Create a local commit',
  browse: 'Open a URL in Safari or Chrome',
  tabs: 'List open tabs',
  navigate: 'Set the front tab URL',
  pageRead: 'Read front tab title and URL',
  pageShot: 'Screenshot to a local file',
  wait: 'Wait for URL, selector, or page load',
  pageText: 'Read visible page text',
  query: 'Read text from a CSS selector',
  click: 'Click an element',
  type: 'Type into an element',
  fill: 'Clear and fill an input',
  eval: 'Run JavaScript in the page',
  tab: 'List, open, close, or focus a tab',
}

const RULE_RETURNS: Record<string, string> = {
  list: 'files',
  detect: 'filtered',
  extract: 'value',
  lookup: 'dest',
  move: 'moved',
  copy: 'copied',
  route: 'moved',
  log: 'message',
}

let catalogRules: RuleDef[] = []

export function setRuleCatalog(rules: RuleDef[]) {
  catalogRules = rules
}

export function ruleDefToUi(def: RuleDef): RuleUiDef {
  const paramKeys = Array.isArray(def.params) ? def.params : []
  const params =
    RULE_PARAM_SCHEMA[def.id] ??
    paramKeys.map((key) => ({
      key,
      label: key,
      type: 'string' as ParamType,
      optional: true,
    }))
  return {
    id: def.id,
    label: def.id,
    connectorId: def.connectorId,
    category: def.category,
    description: RULE_DESCRIPTIONS[def.id] ?? `${def.category} · ${def.origin}`,
    params,
  }
}

export function allRules(): RuleUiDef[] {
  return catalogRules.map(ruleDefToUi)
}

/** Resolve a rule by id, optionally scoped to a connector. Accepts `safari.browse`. */
export function ruleById(id: string, connectorId?: string) {
  const rules = allRules()
  if (id.includes('.')) {
    const dot = id.indexOf('.')
    const cid = id.slice(0, dot)
    const rid = id.slice(dot + 1)
    return rules.find((r) => r.connectorId === cid && r.id === rid)
  }
  if (connectorId) {
    return rules.find((r) => r.connectorId === connectorId && r.id === id)
  }
  return rules.find((r) => r.id === id)
}

/** Stable picker value: `browse` for fs, `safari.browse` for others. */
export function rulePickerValue(rule: { id: string; connectorId: string }) {
  return rule.connectorId === 'fs' ? rule.id : `${rule.connectorId}.${rule.id}`
}

export function parseRulePickerValue(value: string): {
  id: string
  connectorId: string
} {
  if (value.includes('.')) {
    const dot = value.indexOf('.')
    return {
      connectorId: value.slice(0, dot),
      id: value.slice(dot + 1),
    }
  }
  return { connectorId: 'fs', id: value }
}

export function ruleDescription(id: string): string {
  const bare = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id
  return RULE_DESCRIPTIONS[bare] ?? bare
}

const PLACEHOLDER_DESCRIPTIONS = /^$|^Custom automation$|all natives|parameters only|Native script/i

export function automationDescription(automation: {
  description: string
  steps: AutomationStep[]
}): string {
  const stored = automation.description?.trim() ?? ''
  if (stored && !PLACEHOLDER_DESCRIPTIONS.test(stored)) return stored
  if (!automation.steps.length) return stored

  const fns = automation.steps.map((step) => stepFn(step))
  if (fns.includes('route') || (fns.includes('lookup') && fns.includes('move'))) {
    const listStep = automation.steps.find((s) => stepFn(s) === 'list')
    const dir = String(listStep?.with?.dir ?? listStep?.with?.glob ?? '')
    if (/desktop/i.test(dir)) return CLEAN_DESKTOP_DESCRIPTION
    return 'Route files by type into matching folders'
  }

  return automation.steps
    .map((step) => ruleDescription(stepFn(step)))
    .join(' · ')
}

/** Prefer the saved description; fall back to derived summary. */
export function displayAutomationDescription(automation: {
  description: string
  steps: AutomationStep[]
}): string {
  const stored = automation.description?.trim() ?? ''
  if (stored) return stored
  return automationDescription(automation)
}

export function ruleReturns(id: string): string | undefined {
  return RULE_RETURNS[id]
}

export function rulesForConnector(connectorId: string) {
  return allRules().filter((r) => r.connectorId === connectorId)
}

export function defaultParamsFor(fn: string, connectorId?: string): Record<string, unknown> {
  const def = ruleById(fn, connectorId)
  if (!def) return {}
  const out: Record<string, unknown> = {}
  for (const p of def.params) {
    if (p.type === 'select' && p.options?.[0]) out[p.key] = p.options[0].value
    else if (p.type === 'table') {
      const d = defaultRouteConfig()
      out[p.key] = Object.fromEntries(
        d.routes.map((r) => [r.match.replace(/\s+/g, ''), r.dest]),
      )
      out.default = d.fallback
    } else if (p.placeholder && !p.optional) out[p.key] = p.placeholder
    else out[p.key] = ''
  }
  return out
}

export function stepFn(step: AutomationStep): string {
  if (step.fn) return step.fn
  return step.operation || 'list'
}

export function formatStepParamValue(
  type: ParamType,
  value: unknown,
  pathVariables: PathVariable[],
): string {
  if (value == null || value === '') return ''
  if (type === 'table') {
    const t = value as Record<string, unknown>
    const keys = Object.keys(t).filter((k) => k !== 'default')
    const n = keys.length
    const fallback = t.default ? ` · default → ${String(t.default)}` : ''
    return n ? `${n} route${n === 1 ? '' : 's'}${fallback}` : fallback.replace(/^ · /, '')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  if (type === 'folder' && /Desktop/i.test(text) && text.includes('*')) {
    return 'Desktop · files only'
  }
  return labelPathText(text, pathVariables)
}

export type StepDetailLine = {
  label?: string
  value: string
}

function humanizeVarRef(value: string, pathVariables: PathVariable[]): string {
  const trimmed = value.trim()
  return VAR_REF_LABELS[trimmed] ?? labelPathText(trimmed, pathVariables)
}

function listSourceLabel(dir: string, pathVariables: PathVariable[]): string {
  if (/desktop/i.test(dir) && dir.includes('*')) {
    return 'Desktop — loose files only (folders and apps stay put)'
  }
  const cleaned = dir.replace(/\*+$/, '').replace(/\/$/, '')
  return labelPathText(cleaned || dir, pathVariables)
}

function humanStepDetailLines(
  fn: string,
  withParams: Record<string, unknown>,
  pathVariables: PathVariable[],
): StepDetailLine[] {
  switch (fn) {
    case 'list': {
      const dir = String(withParams.dir ?? withParams.glob ?? '~/Desktop/*')
      return [{ label: 'From', value: listSourceLabel(dir, pathVariables) }]
    }
    case 'extract': {
      const field = String(withParams.field ?? 'extension')
      const fieldLabel = EXTRACT_FIELD_LABELS[field] ?? field
      return [{ label: 'Reads', value: `${fieldLabel} from each file` }]
    }
    case 'lookup':
    case 'route': {
      const table = withParams.table
      if (table && typeof table === 'object' && !Array.isArray(table)) {
        const rows = formatRouteRowsForDisplay(table as Record<string, unknown>, pathVariables)
        if (rows.length) return rows
      }
      return [{ label: 'Routes', value: 'By file type' }]
    }
    case 'move':
    case 'copy': {
      const verb = fn === 'copy' ? 'Copy' : 'Move'
      const output = String(withParams.output ?? withParams.dest ?? '')
      const input = String(withParams.input ?? withParams.path ?? '')
      if (output.startsWith('$')) {
        return [{ label: verb, value: 'each file to its matched folder' }]
      }
      const lines: StepDetailLine[] = []
      if (input) {
        lines.push({ label: 'From', value: humanizeVarRef(input, pathVariables) })
      }
      lines.push({ label: 'To', value: labelPathText(output, pathVariables) })
      return lines
    }
    case 'detect': {
      const pattern = String(withParams.pattern ?? '*').replace(/^\./, '')
      const value =
        pattern === '*' ? 'all listed files' : `files ending in .${pattern}`
      return [{ label: 'Keep', value }]
    }
    case 'delete': {
      const path = String(withParams.path ?? '$files')
      return [{ label: 'Remove', value: humanizeVarRef(path, pathVariables) }]
    }
    case 'rename': {
      const name = String(withParams.newName ?? '')
      return [
        { label: 'File', value: humanizeVarRef(String(withParams.path ?? '$file'), pathVariables) },
        ...(name ? [{ label: 'New name', value: name }] : []),
      ]
    }
    case 'mkdir': {
      const path = String(withParams.path ?? '')
      return path ? [{ label: 'Create', value: labelPathText(path, pathVariables) }] : []
    }
    case 'log': {
      const msg = String(withParams.message ?? withParams.template ?? '').trim()
      return msg ? [{ value: msg }] : []
    }
    default:
      return []
  }
}

export function stepDetailLines(
  step: AutomationStep,
  pathVariables: PathVariable[],
): StepDetailLine[] {
  const fn = stepFn(step)
  const withParams = step.with ?? {}
  const human = humanStepDetailLines(fn, withParams, pathVariables)
  if (human.length) return human

  const def = ruleById(fn, step.connectorId)
  if (!def) {
    const fallback = step.params ? String(step.params) : ''
    return fallback ? [{ label: 'Params', value: labelPathText(fallback, pathVariables) }] : []
  }
  const lines: StepDetailLine[] = []
  for (const p of def.params) {
    const raw = withParams[p.key]
    const value = formatStepParamValue(p.type, raw, pathVariables)
    if (!value && p.optional) continue
    const display = value || p.placeholder
    if (!display) continue
    lines.push({ label: p.label, value: display })
  }
  return lines
}

export function summarizeStepParams(
  fn: string,
  params: Record<string, unknown>,
): string {
  if (fn === 'lookup' || fn === 'route') {
    const table = params.table
    const n =
      table && typeof table === 'object' && !Array.isArray(table)
        ? Object.keys(table).length
        : Array.isArray(table)
          ? table.length
          : 0
    return `${n} rows`
  }
  if (fn === 'list') return String(params.dir ?? '')
  if (fn === 'detect') return String(params.pattern ?? '*')
  if (fn === 'extract') return String(params.field ?? 'extension')
  if (fn === 'move' || fn === 'copy') {
    return [String(params.input ?? ''), String(params.output ?? '')]
      .filter(Boolean)
      .join(' → ')
  }
  if (fn === 'log') return String(params.message ?? '')
  if (fn === 'exec') {
    const args = Array.isArray(params.args)
      ? params.args.map(String).join(' ')
      : String(params.args ?? '')
    return [String(params.command ?? ''), args].filter(Boolean).join(' ')
  }
  if (fn === 'script') return String(params.path ?? '')
  const first = Object.values(params).find((v) => typeof v === 'string' && v)
  return first ? String(first) : ''
}

export function cleanDesktopRuleSteps(): AutomationStep[] {
  const table = routeTableFromConfig(defaultRouteConfig())
  return [
    {
      id: 's1',
      fn: 'list',
      connectorId: 'fs',
      operation: 'list',
      params: 'Desktop · files only',
      with: { dir: '~/Desktop/*' },
    },
    {
      id: 's2',
      fn: 'route',
      connectorId: 'fs',
      operation: 'route',
      params: 'route table',
      with: { files: '$files', table },
    },
    {
      id: 's3',
      fn: 'log',
      connectorId: 'fs',
      operation: 'log',
      params: 'Routed Desktop files',
      with: {
        message: 'Routed Desktop files — folders and apps left in place',
        category: 'automation',
      },
    },
  ]
}

export function singleDestRuleSteps(): AutomationStep[] {
  return [
    {
      id: 's1',
      fn: 'list',
      connectorId: 'fs',
      operation: 'list',
      params: '~/Desktop/*',
      with: { dir: '~/Desktop/*' },
    },
    {
      id: 's2',
      fn: 'detect',
      connectorId: 'fs',
      operation: 'detect',
      params: 'pdf',
      with: { pattern: 'pdf', list: '$files' },
    },
    {
      id: 's3',
      fn: 'move',
      connectorId: 'fs',
      operation: 'move',
      params: '~/Documents/PDFs',
      with: { input: '$pdfs', output: '~/Documents/PDFs' },
    },
  ]
}

export function blankRuleSteps(): AutomationStep[] {
  return [
    {
      id: 's1',
      fn: 'list',
      connectorId: 'fs',
      operation: 'list',
      params: '~/Desktop/*',
      with: { dir: '~/Desktop/*' },
    },
  ]
}
