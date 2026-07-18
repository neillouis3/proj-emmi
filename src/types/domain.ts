export type ScreenId =
  | 'overview'
  | 'review'
  | 'automations'
  | 'automation-new'
  | 'connectors'
  | 'log'
  | 'rules'
  | 'rule-new'
  | 'keybinds'
  | 'appearance'
  | 'path-variables'
  | 'settings'
  | 'account'

export type DaemonStatus = 'running' | 'idle' | 'stopped' | 'crashed'

export type RuleMode = 'auto' | 'review' | 'ask'

export type AuthStatus = 'connected' | 'available' | 'expired' | 'error'

export type AutomationTrigger = 'manual' | 'git-hook' | 'cli' | 'keybind'

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
  /** Electron-style accelerator, e.g. "CommandOrControl+Shift+D". Null = none. */
  keybind: string | null
  keybindEnabled: boolean
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
  notifyOnSuccess: boolean
  quietHoursEnabled: boolean
}

export type GeneralPrefs = {
  launchAtLogin: boolean
  hideInFullscreen: boolean
  openDashboardOnLaunch: boolean
  keepRunningInBackground: boolean
  confirmBeforeQuit: boolean
  showMenuBarTitle: boolean
  /** macOS: show the Dock icon while the dashboard window is open. */
  showInDock: boolean
}

export type AppearancePrefs = {
  /** Accent hue in degrees 0–360. */
  accentHue: number
  /** How strongly the accent tint is applied, 0–100. */
  accentIntensity: number
  reduceTransparency: boolean
  uiFontSize: number
  uiFontFamily: 'system' | 'sf-pro' | 'inter' | 'geist' | 'ibm-plex'
  fontSmoothing: boolean
  reduceMotion: boolean
}

export type AutomationPrefs = {
  confirmDestructiveActions: boolean
  requireReviewForDeletes: boolean
  pauseWhenAsleep: boolean
  pauseOnBattery: boolean
  /** 0 = never auto-promote */
  autoPromoteAfter: number
  maxConcurrentRuns: number
}

export type OtherPrefs = {
  checkForUpdates: boolean
  shareUsageData: boolean
  keepDetailedLogs: boolean
  verboseDaemonLogs: boolean
  showExperimentalConnectors: boolean
  /** 0 = never auto-clear */
  clearLogsAfterDays: number
  allowCloudConnectors: boolean
}

export type KeybindPrefs = {
  /** Master switch for global automation shortcuts. */
  enabled: boolean
  /** When true, shortcuts still work while Emmi is focused only (not global). */
  appFocusedOnly: boolean
}

export type SystemKeybindId =
  | 'open-dashboard'
  | 'open-settings'
  | 'open-review'
  | 'open-automations'
  | 'open-logs'
  | 'open-keybinds'
  | 'new-automation'
  | 'toggle-sidebar'

export type SystemKeybindState = {
  accelerator: string | null
  enabled: boolean
}

export type AccountProfile = {
  firstName: string
  lastName: string
  email: string
  handle: string
  /** Optional data URL / path for profile image. */
  avatarDataUrl: string | null
  license: 'personal' | 'pro' | 'team'
  licenseLabel: string
  memberSince: string
}

/** Friendly name for a folder path shown in the UI. */
export type PathVariable = {
  id: string
  name: string
  path: string
}

export type AppState = {
  route: ScreenId
  daemonStatus: DaemonStatus
  lastError: string | null
  defaultRuleMode: 'review' | 'ask'
  llm: LlmConfig
  general: GeneralPrefs
  appearance: AppearancePrefs
  account: AccountProfile
  notifications: NotificationPrefs
  automationsPrefs: AutomationPrefs
  other: OtherPrefs
  keybinds: KeybindPrefs
  systemKeybinds: Record<SystemKeybindId, SystemKeybindState>
  pathVariables: PathVariable[]
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
