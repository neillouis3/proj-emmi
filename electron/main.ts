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
import fs from 'node:fs'
import path from 'node:path'

const APP_NAME = 'Emmi'
app.setName(APP_NAME)

Menu.setApplicationMenu(null)

type PanelKind = 'review' | 'log' | 'error'

type TrayRun = {
  id: string
  kind: 'pending' | 'completed' | 'failed'
  label: string
  pendingId?: string
  logId?: string
}

type KeybindSyncPayload = {
  enabled: boolean
  appFocusedOnly: boolean
  bindings: { kind: 'system' | 'automation'; id: string; accelerator: string }[]
}

type WindowBounds = {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_BOUNDS: WindowBounds = {
  width: 1024,
  height: 720,
}

const MIN_BOUNDS = { width: 880, height: 560 }
const MAX_BOUNDS = { width: 1280, height: 900 }

let tray: Tray | null = null
let dashboardWindow: BrowserWindow | null = null
const panelWindows = new Map<string, BrowserWindow>()
let appQuitting = false
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null
/** macOS: show Dock icon while the dashboard is visible (pref from renderer). */
let showInDock = true
/** Show “Emmi” text next to the menu bar status item. */
let showMenuBarTitle = true

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
  const transparent = extra.transparent ?? true
  const { vibrancy: _vibrancy, visualEffectState: _visualEffectState, ...rest } = extra
  return {
    show: false,
    backgroundColor: extra.backgroundColor ?? (transparent ? '#00000000' : '#111111'),
    ...(transparent
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    titleBarStyle: 'hiddenInset' as const,
    trafficLightPosition: { x: 14, y: 14 },
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
    ...rest,
    title: APP_NAME,
    transparent,
  }
}

function boundsPath() {
  return path.join(app.getPath('userData'), 'window-bounds.json')
}

function readSavedBounds(): WindowBounds {
  try {
    const raw = fs.readFileSync(boundsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WindowBounds>
    if (
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      parsed.width >= MIN_BOUNDS.width &&
      parsed.height >= MIN_BOUNDS.height
    ) {
      return {
        width: Math.round(
          Math.min(Math.max(parsed.width, MIN_BOUNDS.width), MAX_BOUNDS.width),
        ),
        height: Math.round(
          Math.min(Math.max(parsed.height, MIN_BOUNDS.height), MAX_BOUNDS.height),
        ),
        ...(typeof parsed.x === 'number' ? { x: Math.round(parsed.x) } : {}),
        ...(typeof parsed.y === 'number' ? { y: Math.round(parsed.y) } : {}),
      }
    }
  } catch {
    // First launch or unreadable file — use defaults.
  }
  return { ...DEFAULT_BOUNDS }
}

function persistBounds(win: BrowserWindow) {
  if (win.isDestroyed() || win.isMinimized() || !win.isVisible()) return
  const bounds = win.getBounds()
  const payload: WindowBounds = {
    width: Math.min(Math.max(bounds.width, MIN_BOUNDS.width), MAX_BOUNDS.width),
    height: Math.min(Math.max(bounds.height, MIN_BOUNDS.height), MAX_BOUNDS.height),
    x: bounds.x,
    y: bounds.y,
  }
  try {
    fs.writeFileSync(boundsPath(), JSON.stringify(payload))
  } catch {
    // Ignore persistence failures.
  }
}

function schedulePersistBounds(win: BrowserWindow) {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => persistBounds(win), 200)
}

function syncDockVisibility() {
  if (process.platform !== 'darwin') return
  const dashOpen =
    Boolean(dashboardWindow) &&
    !dashboardWindow!.isDestroyed() &&
    dashboardWindow!.isVisible()
  if (showInDock && dashOpen) {
    app.dock?.show()
  } else {
    app.dock?.hide()
  }
}

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) return dashboardWindow

  const saved = readSavedBounds()
  dashboardWindow = new BrowserWindow(
    windowOptions({
      width: saved.width,
      height: saved.height,
      ...(saved.x !== undefined ? { x: saved.x } : {}),
      ...(saved.y !== undefined ? { y: saved.y } : {}),
      minWidth: MIN_BOUNDS.width,
      maxWidth: MAX_BOUNDS.width,
      minHeight: MIN_BOUNDS.height,
      maxHeight: MAX_BOUNDS.height,
      maximizable: false,
    }),
  )

  loadSurface(dashboardWindow, 'dashboard')
  dashboardWindow.on('resize', () => {
    if (dashboardWindow) schedulePersistBounds(dashboardWindow)
  })
  dashboardWindow.on('move', () => {
    if (dashboardWindow) schedulePersistBounds(dashboardWindow)
  })
  dashboardWindow.on('show', () => syncDockVisibility())
  dashboardWindow.on('hide', () => syncDockVisibility())
  dashboardWindow.on('close', (event) => {
    if (dashboardWindow) persistBounds(dashboardWindow)
    if (!appQuitting) {
      event.preventDefault()
      dashboardWindow?.hide()
    }
  })
  dashboardWindow.on('closed', () => {
    dashboardWindow = null
    syncDockVisibility()
  })
  return dashboardWindow
}

function showDashboard(route = 'overview') {
  const win = createDashboardWindow()
  loadSurface(win, 'dashboard', { route })
  if (!win.isVisible()) win.show()
  win.focus()
  syncDockVisibility()
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
      width: 420,
      height: 520,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      // Match dashboard content fill (no vibrancy wash).
      transparent: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#111111' : '#f4f4f5',
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
      click: () => showDashboard('automation-new'),
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

function syncTrayTitle() {
  if (!tray || tray.isDestroyed()) return
  tray.setTitle(showMenuBarTitle ? APP_NAME : '')
  tray.setToolTip(APP_NAME)
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty())
  syncTrayTitle()
  // Native menu — opens under the status item (not a centered custom window).
  refreshTrayMenu()
}

ipcMain.on('theme:set', (_event, theme: 'light' | 'dark' | 'system') => {
  nativeTheme.themeSource = theme
})

ipcMain.on('prefs:show-in-dock', (_e, enabled: boolean) => {
  showInDock = Boolean(enabled)
  syncDockVisibility()
})

ipcMain.on('prefs:menu-bar-title', (_e, enabled: boolean) => {
  showMenuBarTitle = Boolean(enabled)
  syncTrayTitle()
})

ipcMain.on('shell:open-dashboard', (_e, route?: string) => {
  showDashboard(typeof route === 'string' && route ? route : 'overview')
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

/** Stores accelerator list for future globalShortcut registration. */
let keybindSync: KeybindSyncPayload = {
  enabled: true,
  appFocusedOnly: false,
  bindings: [],
}

ipcMain.on('keybinds:sync', (_e, payload: KeybindSyncPayload) => {
  keybindSync = payload ?? keybindSync
  // Ready for globalShortcut: keybindSync.enabled / .appFocusedOnly / .bindings
  void keybindSync
})

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
