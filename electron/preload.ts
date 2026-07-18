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
