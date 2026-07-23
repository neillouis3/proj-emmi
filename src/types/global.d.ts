/// <reference types="vite/client" />

interface TrayRunPayload {
  id: string
  kind: 'pending' | 'completed' | 'failed'
  label: string
  pendingId?: string
  logId?: string
}

interface EmmiApi {
  platform: NodeJS.Platform
  setNativeTheme?: (theme: 'light' | 'dark' | 'system') => void
  setShowInDock?: (enabled: boolean) => void
  setMenuBarTitle?: (enabled: boolean) => void
  loadPreferences?: () => Promise<Record<string, unknown>>
  savePreferences?: (data: unknown) => Promise<boolean>
  clearPreferences?: () => Promise<boolean>
  encryptString?: (plain: string) => Promise<{
    ok: boolean
    result?: string
    error?: string
  }>
  decryptString?: (payload: string) => Promise<{
    ok: boolean
    result?: string
    error?: string
  }>
  syncShellPrefs?: (partial: {
    launchAtLogin?: boolean
    confirmBeforeQuit?: boolean
    keepRunningInBackground?: boolean
    openDashboardOnLaunch?: boolean
    hideInFullscreen?: boolean
    showInDock?: boolean
    showMenuBarTitle?: boolean
    menuBarBadge?: boolean
    verboseDaemonLogs?: boolean
    pendingCount?: number
    pauseWhenAsleep?: boolean
    pauseOnBattery?: boolean
    maxConcurrentRuns?: number
    requireReviewForDeletes?: boolean
    keepDetailedLogs?: boolean
  }) => void
  showNotification?: (payload: {
    title: string
    body: string
    silent?: boolean
  }) => void
  openExternal?: (url: string) => void
  openDashboard?: (route?: string) => void
  openPanel?: (
    kind: 'review' | 'log' | 'error',
    id?: string,
  ) => void
  quit?: () => void
  clearNotifications?: () => void
  syncTrayMenu?: (payload: { runs: TrayRunPayload[]; moreCount: number }) => void
  syncKeybinds?: (payload: {
    enabled: boolean
    appFocusedOnly: boolean
    bindings: { kind: 'system' | 'automation'; id: string; accelerator: string }[]
  }) => void
  restartDaemon?: () => void
  stopDaemon?: () => void
  ensureDaemon?: () => Promise<boolean>
  daemonHealth?: () => Promise<boolean>
  fetchAutomation?: (id: string) => Promise<{ automation: import('@/types/domain').Automation }>
  updateAutomation?: (
    id: string,
    partial: Record<string, unknown>,
  ) => Promise<{ automation: import('@/types/domain').Automation; path?: string }>
  createAutomation?: (
    input: Record<string, unknown>,
  ) => Promise<{ automation: import('@/types/domain').Automation }>
  revealAutomation?: (id: string) => Promise<{ path: string }>
  getMemoryUsage?: () => Promise<number | null>
  pickPath?: (opts?: {
    kind?: 'file' | 'folder'
    multiple?: boolean
    title?: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<string | string[] | null>
  checkFolderAccess?: (folders: string[]) => Promise<{
    ok: boolean
    folders: string[]
    denied?: string[]
  }>
  ensureFolderAccess?: (
    folders: string[],
    opts?: { force?: boolean },
  ) => Promise<{
    ok: boolean
    folders: string[]
    denied?: string[]
  }>
  openFolderPrivacySettings?: () => Promise<boolean>
  chromeCdpStatus?: () => Promise<{
    state: 'up' | 'no_pages' | 'down'
    port: number
  }>
  enableChromeDebugging?: (opts?: {
    confirm?: boolean
  }) => Promise<{
    ok: boolean
    state: 'up' | 'no_pages' | 'down'
    port: number
    cancelled?: boolean
    error?: string
    command?: string
  }>
  onClearNotifications?: (handler: () => void) => () => void
  onKeybindTriggered?: (
    handler: (payload: { kind: 'system' | 'automation'; id: string }) => void,
  ) => () => void
}

interface Window {
  emmi: EmmiApi
}
