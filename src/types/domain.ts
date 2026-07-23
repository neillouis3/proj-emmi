export type ScreenId =
  | 'overview'
  | 'review'
  | 'automations'
  | 'automation-new'
  | 'rule-new'
  | 'connectors'
  | 'packs'
  | 'rules'
  | 'log'
  | 'detailed-log'
  | 'keybinds'
  | 'appearance'
  | 'path-variables'
  | 'settings'
  | 'account'

export type DaemonStatus = 'running' | 'idle' | 'stopped' | 'crashed'

export type RuleCategory = 'core' | 'detection' | 'routing' | 'logging'

/** A rule is a code file — one action, e.g. move(input, output). */
export type RuleDef = {
  id: string
  connectorId: string
  category: RuleCategory
  params: string[]
  source: string
  origin: 'builtin' | 'user'
  code?: string
}

export type AuthStatus = 'connected' | 'available' | 'expired' | 'error'

export type AutomationTrigger =
  | 'manual'
  | 'cli'
  | 'keybind'
  | 'schedule'
  | 'watch'

export type ScheduleTriggerConfig = {
  cron: string
  tz?: string
}

export type WatchTriggerConfig = {
  paths: string[]
  debounceMs?: number
}

/** How file actions are confirmed before running. */
export type RunMode = 'review' | 'ask' | 'auto'

export type PendingAction = {
  id: string
  createdAt: string
  title: string
  trigger: string
  action: string
  reasoning?: string
  connectorId: string
  automationId?: string
  editableAction: string
  files?: string[]
  plan?: string[]
  undoable?: boolean
  trustNote?: string
  grantKind?: 'shell' | 'git' | 'chrome' | 'safari' | null
  shellCommand?: string
}

export type RouteRow = {
  /** Comma-separated match values (e.g. extensions: "png, jpg"). */
  match: string
  dest: string
}

/**
 * One rule call with bound parameters.
 * Shape: rule(params) → output — e.g. list, detect, move.
 */
export type AutomationStep = {
  id: string
  /** Rule id, e.g. list, move, detect */
  fn: string
  /** Bound parameters for the rule (source of truth). */
  with: Record<string, unknown>
  /** Derived from fn for connector badges / filters. */
  connectorId: string
  /** Short name of the rule. */
  operation: string
  /** Display summary of params (derived). */
  params: string
  /** @deprecated legacy route table — migrated to core.lookup */
  routes?: RouteRow[]
  routeFallback?: string
  routeBy?: 'extension'
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
  schedule?: ScheduleTriggerConfig
  watch?: WatchTriggerConfig
  lastRunAt?: string
  defaultMode: RunMode
  /** Connector ids this automation touches; used to hide it when a pack is uninstalled. */
  connectors?: string[]
  steps: AutomationStep[]
}

export type ConnectorPermissionFlag = {
  id: string
  label: string
  help?: string
}

export type ConnectorPermissionDecl = {
  grant?: boolean
  folderScopes?: boolean
  allowlist?: boolean
  hostAllowlist?: boolean
  flags?: ConnectorPermissionFlag[]
}

export type ConnectorOAuth2Auth = {
  type: 'oauth2'
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  clientId: string
  redirectUri?: string
  apiHosts?: string[]
}

export type Connector = {
  id: string
  name: string
  description: string
  authStatus: AuthStatus
  scope: string
  kind: 'Local' | 'Web' | 'Cloud'
  popular?: boolean
  experimental?: boolean
  logo?: string
  permission?: ConnectorPermissionDecl
  auth?: ConnectorOAuth2Auth
  setup?: { kind: string }
  accountLabel?: string
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
  moves?: { from: string; to: string }[]
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

export type BlockingKind =
  | 'ask'
  | 'auth'
  | 'daemon'
  | 'action-failed'
  | 'permissions'
  | 'confirm'
  | 'chrome-setup'
  | 'safari-setup'

export type BlockingPrompt = {
  id: string
  kind: BlockingKind
  title: string
  body: string
  primaryLabel: string
  secondaryLabel?: string
  connectorId?: string
  pendingActionId?: string
  /** Automation waiting on folder permission grant (legacy). */
  automationId?: string
  folders?: string[]
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
  ruleLibrary: RuleDef[]
  automations: Automation[]
  connectors: Connector[]
  logs: LogEntry[]
  dismissedNotificationIds: string[]
  blocking: BlockingPrompt | null
  firstRunDismissed: boolean
  /** Total app memory (renderer + daemon), refreshed from the main process. */
  memoryMb: number | null
  /** Bumps when cached rule source changes — not persisted. */
  ruleCodeEpoch: number
  /** Automation being edited on the automation-new screen — not persisted. */
  editingAutomationId: string | null
  /** Log entry opened on the detailed-log screen — not persisted. */
  viewingDetailedLogId: string | null
}
