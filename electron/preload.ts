import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('emmi', {
  platform: process.platform,
  setNativeTheme(theme: 'light' | 'dark' | 'system') {
    ipcRenderer.send('theme:set', theme)
  },
  openDashboard(route?: string) {
    ipcRenderer.send('shell:open-dashboard', route)
  },
  openPanel(kind: 'review' | 'log' | 'error' | 'automation-new', id?: string) {
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
  onClearNotifications(handler: () => void) {
    const listener = () => handler()
    ipcRenderer.on('notifications:clear', listener)
    return () => ipcRenderer.removeListener('notifications:clear', listener)
  },
})
