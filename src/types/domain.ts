export type ScreenId =
  | 'overview'
  | 'review'
  | 'automations'
  | 'connectors'
  | 'log'
  | 'rules'
  | 'settings'

export type DaemonStatus = 'running' | 'idle' | 'stopped' | 'crashed'

export type RuleMode = 'auto' | 'review' | 'ask'

export type AuthStatus = 'connected' | 'available' | 'expired' | 'error'

export type AutomationTrigger = 'manual' | 'git-hook' | 'cli'

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
}

export type Rule = {
  id: string
  trigger: string
  match: string
  action: string
  mode: RuleMode
  connectorId: string
  origin: 'user' | 'learned'
  approvalCount: number
  promoteSuggested: boolean
  neverPromote?: boolean
}

export type AutomationStep = {
  id: string
  connectorId: string
  operation: string
  params: string
}

export type Automation = {
  id: string
  name: string
  description: string
  active: boolean
  trigger: AutomationTrigger
  triggerSummary: string
  lastRunAt?: string
  defaultMode: 'review' | 'ask'
  steps: AutomationStep[]
}

export type Connector = {
  id: string
  name: string
  description: string
  authStatus: AuthStatus
  scope: string
  kind: 'Local' | 'Web' | 'Cloud'
  popular?: boolean
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
}

export type RecentRun = {
  id: string
  kind: 'pending' | 'completed' | 'failed'
  title: string
  detail: string
  at: string
  pendingId?: string
  logId?: string
  connectorId?: string
}

export type BlockingKind = 'ask' | 'auth' | 'daemon' | 'action-failed'

export type BlockingPrompt = {
  id: string
  kind: BlockingKind
  title: string
  body: string
  primaryLabel: string
  secondaryLabel?: string
  connectorId?: string
  pendingActionId?: string
}

export type PromotePrompt = {
  ruleId: string
  approvalCount: number
}

export type LlmConfig = {
  mode: 'cloud' | 'local'
  provider: string
  apiKey: string
  localModelPath: string
}

export type NotificationPrefs = {
  menuBarBadge: boolean
  systemNotifications: boolean
  soundEnabled: boolean
  notifyOnFailure: boolean
  notifyOnReview: boolean
}

export type GeneralPrefs = {
  launchAtLogin: boolean
  hideInFullscreen: boolean
  openDashboardOnLaunch: boolean
  keepRunningInBackground: boolean
}

export type OtherPrefs = {
  checkForUpdates: boolean
  shareUsageData: boolean
  keepDetailedLogs: boolean
}

export type AppState = {
  route: ScreenId
  daemonStatus: DaemonStatus
  lastError: string | null
  defaultRuleMode: 'review' | 'ask'
  llm: LlmConfig
  general: GeneralPrefs
  notifications: NotificationPrefs
  other: OtherPrefs
  pending: PendingAction[]
  rules: Rule[]
  automations: Automation[]
  connectors: Connector[]
  logs: LogEntry[]
  dismissedNotificationIds: string[]
  blocking: BlockingPrompt | null
  promote: PromotePrompt | null
  firstRunDismissed: boolean
}
