import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron'
import path from 'node:path'

Menu.setApplicationMenu(null)

type PanelKind = 'review' | 'log' | 'error' | 'automation-new'

type TrayRun = {
  id: string
  kind: 'pending' | 'completed' | 'failed'
  label: string
  pendingId?: string
  logId?: string
}

let tray: Tray | null = null
let dashboardWindow: BrowserWindow | null = null
const panelWindows = new Map<string, BrowserWindow>()
let appQuitting = false

let trayRuns: TrayRun[] = [
  {
    id: 'pending:p1',
    kind: 'pending',
    label: 'Clean Desktop — pending review',
    pendingId: 'p1',
  },
  {
    id: 'pending:p2',
    kind: 'pending',
    label: 'screenshot_2026-07-16.png — pending review',
    pendingId: 'p2',
  },
  {
    id: 'log:l1',
    kind: 'completed',
    label: 'Sort Downloads — completed, 8 files moved',
    logId: 'l1',
  },
  {
    id: 'log:l2',
    kind: 'completed',
    label: 'Scaffold Project: "trail-app" — completed',
    logId: 'l2',
  },
  {
    id: 'log:l4',
    kind: 'failed',
    label: 'Sync Playlist — failed: auth expired',
    logId: 'l4',
  },
]
let trayMoreCount = 3

function loadSurface(win: BrowserWindow, surface: string, params: Record<string, string> = {}) {
  const query = { surface, ...params }
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value)
    }
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'), { query })
  }
}

function windowOptions(extra: Electron.BrowserWindowConstructorOptions = {}) {
  return {
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window' as const,
    visualEffectState: 'active' as const,
    titleBarStyle: 'hiddenInset' as const,
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
    ...extra,
  }
}

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return dashboardWindow

  dashboardWindow = new BrowserWindow(
    windowOptions({
      width: 1280,
      height: 800,
      minWidth: 960,
      maxWidth: 1440,
      minHeight: 640,
    }),
  )

  loadSurface(dashboardWindow, 'dashboard')
  dashboardWindow.on('close', (event) => {
    if (!appQuitting) {
      event.preventDefault()
      dashboardWindow?.hide()
    }
  })
  dashboardWindow.on('closed', () => {
    dashboardWindow = null
  })
  return dashboardWindow
}

function showDashboard(route?: string) {
  const win = createDashboardWindow()
  loadSurface(win, 'dashboard', route ? { route } : {})
  if (!win.isVisible()) win.show()
  win.focus()
}

function showPanel(kind: PanelKind, id?: string) {
  const key = `${kind}:${id ?? 'new'}`
  const existing = panelWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }

  const win = new BrowserWindow(
    windowOptions({
      width: kind === 'automation-new' ? 480 : 420,
      height: kind === 'automation-new' ? 560 : 520,
      resizable: true,
      minimizable: false,
      fullscreenable: false,
    }),
  )

  loadSurface(win, 'panel', { kind, ...(id ? { id } : {}) })
  win.on('closed', () => {
    panelWindows.delete(key)
  })
  panelWindows.set(key, win)
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }, 250)
}

function buildTrayMenu() {
  const runItems: MenuItemConstructorOptions[] = trayRuns.map((run) => ({
    label: run.label,
    click: () => {
      if (run.kind === 'pending' && run.pendingId) {
        showPanel('review', run.pendingId)
      } else if (run.kind === 'failed' && run.logId) {
        showPanel('error', run.logId)
      } else if (run.logId) {
        showPanel('log', run.logId)
      }
    },
  }))

  const template: MenuItemConstructorOptions[] = [
    { label: 'Recent Runs', enabled: false },
    ...(runItems.length
      ? runItems
      : [{ label: 'No recent runs', enabled: false }]),
    ...(trayMoreCount > 0
      ? [
          {
            label: `View More (${trayMoreCount})`,
            click: () => showDashboard('log'),
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: 'Clear All Notifications',
      click: () => {
        trayRuns = []
        trayMoreCount = 0
        refreshTrayMenu()
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('notifications:clear')
        }
      },
    },
    {
      label: 'New Automation...',
      click: () => showPanel('automation-new'),
    },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => showDashboard() },
    { label: 'Settings', click: () => showDashboard('settings') },
    {
      label: 'Quit',
      click: () => {
        appQuitting = true
        app.quit()
      },
    },
  ]

  return Menu.buildFromTemplate(template)
}

function refreshTrayMenu() {
  tray?.setContextMenu(buildTrayMenu())
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('Automate')
  tray.setToolTip('Local Automation')
  // Native menu — opens under the status item (not a centered custom window).
  refreshTrayMenu()
}

ipcMain.on('theme:set', (_event, theme: 'light' | 'dark' | 'system') => {
  nativeTheme.themeSource = theme
})

ipcMain.on('shell:open-dashboard', (_e, route?: string) => {
  showDashboard(typeof route === 'string' ? route : undefined)
})

ipcMain.on('shell:open-panel', (_e, payload: { kind: PanelKind; id?: string }) => {
  showPanel(payload.kind, payload.id)
})

ipcMain.on('shell:quit', () => {
  appQuitting = true
  app.quit()
})

ipcMain.on('shell:clear-notifications', () => {
  trayRuns = []
  trayMoreCount = 0
  refreshTrayMenu()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('notifications:clear')
  }
})

ipcMain.on(
  'tray:sync',
  (
    _e,
    payload: {
      runs: TrayRun[]
      moreCount: number
    },
  ) => {
    trayRuns = payload.runs
    trayMoreCount = payload.moreCount
    refreshTrayMenu()
  },
)

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
  createTray()
})

app.on('before-quit', () => {
  appQuitting = true
})

app.on('window-all-closed', () => {
  // Stay alive as a menu bar app.
})

app.on('activate', () => {
  showDashboard()
})
