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
  onClearNotifications?: (handler: () => void) => () => void
  onKeybindTriggered?: (
    handler: (payload: { kind: 'system' | 'automation'; id: string }) => void,
  ) => () => void
}

interface Window {
  emmi: EmmiApi
}
