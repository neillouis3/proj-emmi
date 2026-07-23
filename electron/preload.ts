import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('emmi', {
  platform: process.platform,
  setNativeTheme(theme: 'light' | 'dark' | 'system') {
    ipcRenderer.send('theme:set', theme)
  },
  setShowInDock(enabled: boolean) {
    ipcRenderer.send('prefs:show-in-dock', enabled)
  },
  setMenuBarTitle(enabled: boolean) {
    ipcRenderer.send('prefs:menu-bar-title', enabled)
  },
  loadPreferences() {
    return ipcRenderer.invoke('prefs:load') as Promise<Record<string, unknown>>
  },
  savePreferences(data: unknown) {
    return ipcRenderer.invoke('prefs:save', data) as Promise<boolean>
  },
  clearPreferences() {
    return ipcRenderer.invoke('prefs:clear') as Promise<boolean>
  },
  encryptString(plain: string) {
    return ipcRenderer.invoke('safeStorage:encrypt', plain) as Promise<{
      ok: boolean
      result?: string
      error?: string
    }>
  },
  decryptString(payload: string) {
    return ipcRenderer.invoke('safeStorage:decrypt', payload) as Promise<{
      ok: boolean
      result?: string
      error?: string
    }>
  },
  syncShellPrefs(partial: {
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
  }) {
    ipcRenderer.send('prefs:shell', partial)
  },
  showNotification(payload: { title: string; body: string; silent?: boolean }) {
    ipcRenderer.send('notify:show', payload)
  },
  openExternal(url: string) {
    ipcRenderer.send('shell:open-external', url)
  },
  openDashboard(route?: string) {
    ipcRenderer.send('shell:open-dashboard', route)
  },
  openPanel(kind: 'review' | 'log' | 'error', id?: string) {
    ipcRenderer.send('shell:open-panel', { kind, id })
  },
  quit() {
    ipcRenderer.send('shell:quit')
  },
  clearNotifications() {
    ipcRenderer.send('shell:clear-notifications')
  },
  syncTrayMenu(payload: {
    runs: {
      id: string
      kind: 'pending' | 'completed' | 'failed'
      label: string
      pendingId?: string
      logId?: string
    }[]
    moreCount: number
  }) {
    ipcRenderer.send('tray:sync', payload)
  },
  syncKeybinds(payload: {
    enabled: boolean
    appFocusedOnly: boolean
    bindings: { kind: 'system' | 'automation'; id: string; accelerator: string }[]
  }) {
    ipcRenderer.send('keybinds:sync', payload)
  },
  restartDaemon() {
    ipcRenderer.send('daemon:restart')
  },
  stopDaemon() {
    ipcRenderer.send('daemon:stop')
  },
  ensureDaemon() {
    return ipcRenderer.invoke('daemon:ensure') as Promise<boolean>
  },
  daemonHealth() {
    return ipcRenderer.invoke('daemon:health') as Promise<boolean>
  },
  fetchAutomation(id: string) {
    return ipcRenderer.invoke('automation:fetch', id) as Promise<{
      automation: import('@/types/domain').Automation
    }>
  },
  updateAutomation(id: string, partial: Record<string, unknown>) {
    return ipcRenderer.invoke('automation:update', id, partial) as Promise<{
      automation: import('@/types/domain').Automation
      path?: string
    }>
  },
  createAutomation(input: Record<string, unknown>) {
    return ipcRenderer.invoke('automation:create', input) as Promise<{
      automation: import('@/types/domain').Automation
    }>
  },
  revealAutomation(id: string) {
    return ipcRenderer.invoke('automation:reveal', id) as Promise<{ path: string }>
  },
  getMemoryUsage() {
    return ipcRenderer.invoke('process:memory') as Promise<number>
  },
  pickPath(opts?: {
    kind?: 'file' | 'folder'
    multiple?: boolean
    title?: string
    filters?: { name: string; extensions: string[] }[]
  }) {
    return ipcRenderer.invoke('dialog:pick', opts) as Promise<
      string | string[] | null
    >
  },
  checkFolderAccess(folders: string[]) {
    return ipcRenderer.invoke('permissions:checkFolders', folders) as Promise<{
      ok: boolean
      folders: string[]
      denied?: string[]
    }>
  },
  ensureFolderAccess(folders: string[], opts?: { force?: boolean }) {
    return ipcRenderer.invoke(
      'permissions:ensureFolders',
      folders,
      opts,
    ) as Promise<{
      ok: boolean
      folders: string[]
      denied?: string[]
    }>
  },
  openFolderPrivacySettings() {
    return ipcRenderer.invoke('permissions:openSettings') as Promise<boolean>
  },
  chromeCdpStatus() {
    return ipcRenderer.invoke('chrome:cdpStatus') as Promise<{
      state: 'up' | 'no_pages' | 'down'
      port: number
    }>
  },
  enableChromeDebugging(opts?: { confirm?: boolean }) {
    return ipcRenderer.invoke('chrome:enableDebugging', opts) as Promise<{
      ok: boolean
      state: 'up' | 'no_pages' | 'down'
      port: number
      cancelled?: boolean
      error?: string
      command?: string
    }>
  },
  onClearNotifications(handler: () => void) {
    const listener = () => handler()
    ipcRenderer.on('notifications:clear', listener)
    return () => ipcRenderer.removeListener('notifications:clear', listener)
  },
  onKeybindTriggered(
    handler: (payload: {
      kind: 'system' | 'automation'
      id: string
    }) => void,
  ) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { kind: 'system' | 'automation'; id: string },
    ) => handler(payload)
    ipcRenderer.on('keybinds:triggered', listener)
    return () => ipcRenderer.removeListener('keybinds:triggered', listener)
  },
})
