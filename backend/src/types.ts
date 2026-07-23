export type TriggerKind =
  | 'manual'
  | 'cli'
  | 'keybind'
  | 'schedule'
  | 'watch'
export type RunMode = 'review' | 'ask' | 'auto'

export type ScheduleTriggerConfig = {
  cron: string
  tz?: string
}

export type WatchTriggerConfig = {
  paths: string[]
  debounceMs?: number
}

export type AutomationStepConfig = {
  tool: string
  with?: Record<string, unknown>
}

export type AutomationConfig = {
  id: string
  name: string
  description?: string
  trigger: TriggerKind
  active: boolean
  defaultMode: RunMode
  keybind?: string | null
  keybindEnabled?: boolean
  schedule?: ScheduleTriggerConfig
  watch?: WatchTriggerConfig
  /**
   * Preferred: short native-call script (see backend/src/script).
   * When set, the engine runs this instead of YAML steps.
   */
  script?: string
  /** Legacy step list — still supported when `script` is absent. */
  steps: AutomationStepConfig[]
}

export type RuleCategory = 'core' | 'detection' | 'routing' | 'logging'

export type RuleDef = {
  id: string
  connectorId: string
  category: RuleCategory
  params: string[]
  source: string
  origin: 'builtin' | 'user'
}

export type EmmiConfig = {
  variables: Record<string, string>
}

export type ToolContext = {
  dryRun: boolean
  variables: Record<string, string>
  /** Files matched by prior fs.match in this run */
  matchedFiles: string[]
  /** Per-file values from core.extract */
  extracted?: Record<string, string>
  /** Chain output from the previous native */
  lastOutput?: unknown
  /** Per-file destinations from core.lookup (or legacy fs.route) */
  fileDestinations?: Record<string, string>
  runId: string
}

export type ToolResult = {
  ok: boolean
  summary: string
  artifacts?: {
    matched?: string[]
    moved?: string[]
    created?: string[]
    count?: number
    routed?: number
  }
}

export type ToolDef = {
  id: string
  description: string
  params: Record<string, string>
  run: (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

export type PendingAction = {
  id: string
  createdAt: string
  title: string
  trigger: string
  action: string
  reasoning?: string
  sourceRuleId?: string
  connectorId: string
  automationId?: string
  editableAction: string
  /** Files that will be moved on approve */
  files: string[]
  dest?: string
  /** Per-file destinations when a route step planned the run */
  fileDestinations?: Record<string, string>
  /** Binary basename/path to add to shell allowlist on approve */
  shellCommand?: string
  runId?: string
  /** Human checklist lines for Review */
  plan?: string[]
  /** True when file moves can be undone from Logs */
  undoable?: boolean
  /** Soft trust copy shown above Approve */
  trustNote?: string
  /** When set, this pending is a permission grant */
  grantKind?: 'shell' | 'git' | 'chrome' | 'safari' | null
}

export type MoveRecord = {
  from: string
  to: string
}

export type LogEntry = {
  id: string
  at: string
  automationName: string
  summary: string
  action: string
  connectorId: string
  success: boolean
  reversible: boolean
  error?: string
  undone?: boolean
  runId?: string
  moves?: MoveRecord[]
}

export type RunRecord = {
  id: string
  automationId: string
  automationName: string
  startedAt: string
  finishedAt?: string
  mode: RunMode
  dryRun: boolean
  status: 'running' | 'pending' | 'completed' | 'failed' | 'rejected'
  summary?: string
  matchedFiles: string[]
  stepResults: { tool: string; ok: boolean; summary: string }[]
  pendingId?: string
  error?: string
  moves?: MoveRecord[]
}

export type DaemonState = {
  pending: PendingAction[]
  logs: LogEntry[]
  runs: RunRecord[]
  lastRunAtByAutomation: Record<string, string>
}
