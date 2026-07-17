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
  openDashboard?: (route?: string) => void
  openPanel?: (
    kind: 'review' | 'log' | 'error' | 'automation-new',
    id?: string,
  ) => void
  quit?: () => void
  clearNotifications?: () => void
  syncTrayMenu?: (payload: { runs: TrayRunPayload[]; moreCount: number }) => void
  onClearNotifications?: (handler: () => void) => () => void
}

interface Window {
  emmi: EmmiApi
}
