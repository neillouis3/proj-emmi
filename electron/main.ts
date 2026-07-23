import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  nativeTheme,
  powerMonitor,
  safeStorage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron'
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const APP_NAME = 'Emmi'
app.setName(APP_NAME)

/** Single data root — always ~/Library/Application Support/Emmi (not proj-emmi in dev). */
function resolveEmmiDataRoot() {
  const home = app.getPath('home')
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME)
  }
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    return path.join(appData, APP_NAME)
  }
  const xdg = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share')
  return path.join(xdg, 'emmi')
}

app.setPath('userData', resolveEmmiDataRoot())

function emmiDataRoot() {
  return app.getPath('userData')
}

function migrateLegacyElectronData() {
  const next = emmiDataRoot()
  const legacy = path.join(app.getPath('home'), 'Library', 'Application Support', 'proj-emmi')
  if (legacy === next || !fs.existsSync(legacy)) return
  fs.mkdirSync(next, { recursive: true })
  for (const name of [
    'window-bounds.json',
    'folder-permissions.json',
    'preferences.json',
  ]) {
    const from = path.join(legacy, name)
    const to = path.join(next, name)
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.copyFileSync(from, to)
    }
  }
}

migrateLegacyElectronData()

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
let quitConfirmPending = false
let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null
/** macOS: show Dock icon while the dashboard is visible (pref from renderer). */
let showInDock = true
/** Show “Emmi” text next to the menu bar status item. */
let showMenuBarTitle = true
let launchAtLogin = true
let confirmBeforeQuit = true
let keepRunningInBackground = true
let openDashboardOnLaunch = false
let hideInFullscreen = true
let menuBarBadge = true
let daemonManuallyStopped = false
let verboseDaemonLogs = false

let trayRuns: TrayRun[] = []
let trayMoreCount = 0
let pendingBadgeCount = 0

const DAEMON_PORT = Number(process.env.EMMI_PORT ?? 3921)

let keybindSync: KeybindSyncPayload = {
  enabled: true,
  appFocusedOnly: false,
  bindings: [],
}

function preferencesPath() {
  return path.join(emmiDataRoot(), 'preferences.json')
}

function readPreferencesFile(): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function writePreferencesFile(data: unknown) {
  fs.mkdirSync(emmiDataRoot(), { recursive: true })
  const tmp = `${preferencesPath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, preferencesPath())
}

function applyShellPrefsFromData(data: Record<string, unknown>) {
  const general =
    data.general && typeof data.general === 'object'
      ? (data.general as Record<string, unknown>)
      : {}
  const notifications =
    data.notifications && typeof data.notifications === 'object'
      ? (data.notifications as Record<string, unknown>)
      : {}
  const other =
    data.other && typeof data.other === 'object'
      ? (data.other as Record<string, unknown>)
      : {}

  if (typeof general.launchAtLogin === 'boolean') {
    launchAtLogin = general.launchAtLogin
    try {
      app.setLoginItemSettings({ openAtLogin: launchAtLogin })
    } catch {
      /* ignore */
    }
  }
  if (typeof general.confirmBeforeQuit === 'boolean') {
    confirmBeforeQuit = general.confirmBeforeQuit
  }
  if (typeof general.keepRunningInBackground === 'boolean') {
    keepRunningInBackground = general.keepRunningInBackground
  }
  if (typeof general.openDashboardOnLaunch === 'boolean') {
    openDashboardOnLaunch = general.openDashboardOnLaunch
  }
  if (typeof general.hideInFullscreen === 'boolean') {
    hideInFullscreen = general.hideInFullscreen
  }
  if (typeof general.showInDock === 'boolean') {
    showInDock = general.showInDock
    syncDockVisibility()
  }
  if (typeof general.showMenuBarTitle === 'boolean') {
    showMenuBarTitle = general.showMenuBarTitle
    syncTrayTitle()
  }
  if (typeof notifications.menuBarBadge === 'boolean') {
    menuBarBadge = notifications.menuBarBadge
    syncDockBadge()
  }
  if (typeof other.verboseDaemonLogs === 'boolean') {
    verboseDaemonLogs = other.verboseDaemonLogs
  }
}

function syncDockBadge() {
  if (process.platform !== 'darwin') return
  const label = menuBarBadge && pendingBadgeCount > 0 ? String(pendingBadgeCount) : ''
  app.dock?.setBadge(label)
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(
      pendingBadgeCount > 0 ? `${APP_NAME} · ${pendingBadgeCount} pending` : APP_NAME,
    )
  }
}

function emmiWindowFocused() {
  const focused = BrowserWindow.getFocusedWindow()
  return Boolean(focused && !focused.isDestroyed())
}

function registerGlobalKeybinds(payload: KeybindSyncPayload) {
  globalShortcut.unregisterAll()
  keybindSync = payload ?? keybindSync
  if (!keybindSync.enabled) return
  for (const binding of keybindSync.bindings) {
    if (!binding.accelerator) continue
    try {
      const ok = globalShortcut.register(binding.accelerator, () => {
        if (keybindSync.appFocusedOnly && !emmiWindowFocused()) return
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('keybinds:triggered', {
            kind: binding.kind,
            id: binding.id,
          })
        }
      })
      if (!ok) {
        console.warn('[emmi] failed to register shortcut', binding.accelerator)
      }
    } catch (err) {
      console.warn('[emmi] shortcut error', binding.accelerator, err)
    }
  }
}

async function confirmQuitIfNeeded(): Promise<boolean> {
  if (!confirmBeforeQuit) return true
  if (quitConfirmPending) return false
  quitConfirmPending = true
  try {
    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Cancel', 'Quit'],
      defaultId: 1,
      cancelId: 0,
      title: 'Quit Emmi?',
      message: 'Are you sure you want to quit?',
      detail: 'Background automations will stop until you open Emmi again.',
    })
    return result.response === 1
  } finally {
    quitConfirmPending = false
  }
}

async function requestQuit() {
  const ok = await confirmQuitIfNeeded()
  if (!ok) return
  appQuitting = true
  app.quit()
}

function pushDaemonControl(partial: Record<string, unknown>) {
  const body = JSON.stringify(partial)
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: DAEMON_PORT,
      path: '/control',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 800,
    },
    (res) => {
      res.resume()
    },
  )
  req.on('error', () => {
    /* daemon may be down */
  })
  req.write(body)
  req.end()
}

function wirePowerMonitor() {
  const syncPower = () => {
    const onBattery =
      typeof powerMonitor.isOnBatteryPower === 'function'
        ? powerMonitor.isOnBatteryPower()
        : false
    pushDaemonControl({
      pausedAsleep: false,
      pausedBattery: onBattery,
    })
  }
  powerMonitor.on('suspend', () => {
    pushDaemonControl({ pausedAsleep: true })
  })
  powerMonitor.on('resume', () => {
    pushDaemonControl({ pausedAsleep: false })
    syncPower()
  })
  powerMonitor.on('on-ac', () => {
    pushDaemonControl({ pausedBattery: false })
  })
  powerMonitor.on('on-battery', () => {
    pushDaemonControl({ pausedBattery: true })
  })
  syncPower()
}

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
  return path.join(emmiDataRoot(), 'window-bounds.json')
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
      if (keepRunningInBackground) {
        dashboardWindow?.hide()
      } else {
        void requestQuit()
      }
    }
  })
  dashboardWindow.on('enter-full-screen', () => {
    if (hideInFullscreen) dashboardWindow?.hide()
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
        void requestQuit()
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
  void requestQuit()
})

ipcMain.handle('prefs:load', () => readPreferencesFile())

ipcMain.handle('prefs:save', (_e, data: unknown) => {
  writePreferencesFile(data)
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    applyShellPrefsFromData(data as Record<string, unknown>)
  }
  return true
})

ipcMain.handle('prefs:clear', () => {
  try {
    if (fs.existsSync(preferencesPath())) fs.unlinkSync(preferencesPath())
  } catch {
    /* ignore */
  }
  return true
})

ipcMain.handle('safeStorage:encrypt', (_e, plain: unknown) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false as const, error: 'unavailable' }
  }
  try {
    const enc = safeStorage.encryptString(String(plain ?? ''))
    return { ok: true as const, result: Buffer.from(enc).toString('base64') }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('safeStorage:decrypt', (_e, payload: unknown) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false as const, error: 'unavailable' }
  }
  try {
    const plain = safeStorage.decryptString(
      Buffer.from(String(payload ?? ''), 'base64'),
    )
    return { ok: true as const, result: plain }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.on(
  'prefs:shell',
  (
    _e,
    partial: {
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
    },
  ) => {
    if (typeof partial.launchAtLogin === 'boolean') {
      launchAtLogin = partial.launchAtLogin
      try {
        app.setLoginItemSettings({ openAtLogin: launchAtLogin })
      } catch {
        /* ignore */
      }
    }
    if (typeof partial.confirmBeforeQuit === 'boolean') {
      confirmBeforeQuit = partial.confirmBeforeQuit
    }
    if (typeof partial.keepRunningInBackground === 'boolean') {
      keepRunningInBackground = partial.keepRunningInBackground
    }
    if (typeof partial.openDashboardOnLaunch === 'boolean') {
      openDashboardOnLaunch = partial.openDashboardOnLaunch
    }
    if (typeof partial.hideInFullscreen === 'boolean') {
      hideInFullscreen = partial.hideInFullscreen
    }
    if (typeof partial.showInDock === 'boolean') {
      showInDock = partial.showInDock
      syncDockVisibility()
    }
    if (typeof partial.showMenuBarTitle === 'boolean') {
      showMenuBarTitle = partial.showMenuBarTitle
      syncTrayTitle()
    }
    if (typeof partial.menuBarBadge === 'boolean') {
      menuBarBadge = partial.menuBarBadge
      syncDockBadge()
    }
    if (typeof partial.verboseDaemonLogs === 'boolean') {
      verboseDaemonLogs = partial.verboseDaemonLogs
    }
    if (typeof partial.pendingCount === 'number') {
      pendingBadgeCount = Math.max(0, partial.pendingCount)
      syncDockBadge()
    }
    const control: Record<string, unknown> = {}
    if (typeof partial.pauseWhenAsleep === 'boolean') {
      control.pauseWhenAsleep = partial.pauseWhenAsleep
    }
    if (typeof partial.pauseOnBattery === 'boolean') {
      control.pauseOnBattery = partial.pauseOnBattery
    }
    if (typeof partial.maxConcurrentRuns === 'number') {
      control.maxConcurrentRuns = partial.maxConcurrentRuns
    }
    if (typeof partial.requireReviewForDeletes === 'boolean') {
      control.requireReviewForDeletes = partial.requireReviewForDeletes
    }
    if (typeof partial.keepDetailedLogs === 'boolean') {
      control.keepDetailedLogs = partial.keepDetailedLogs
    }
    if (Object.keys(control).length) pushDaemonControl(control)
  },
)

ipcMain.on(
  'notify:show',
  (
    _e,
    payload: { title: string; body: string; silent?: boolean },
  ) => {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: payload.title || APP_NAME,
      body: payload.body || '',
      silent: Boolean(payload.silent),
    })
    n.show()
  },
)

ipcMain.on('shell:open-external', (_e, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    void shell.openExternal(url)
  }
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

ipcMain.on('keybinds:sync', (_e, payload: KeybindSyncPayload) => {
  registerGlobalKeybinds(payload)
})

let daemonProcess: ChildProcess | null = null
let daemonStarting = false
let daemonWatchdog: ReturnType<typeof setInterval> | null = null

function httpProbe(pathname: string, ok = (code: number) => code === 200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${DAEMON_PORT}${pathname}`, (res) => {
      res.resume()
      resolve(ok(res.statusCode ?? 0))
    })
    req.on('error', () => resolve(false))
    req.setTimeout(800, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function daemonJsonRequestWithRetry<T>(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<T> {
  return daemonJsonRequest<T>(method, pathname, body).catch(async (firstErr) => {
    const ready = await ensureDaemon()
    if (!ready) throw firstErr
    return daemonJsonRequest<T>(method, pathname, body)
  })
}

function yamlModule() {
  const req = createRequire(path.join(backendDir(), 'package.json'))
  return req('yaml') as {
    parse: (src: string) => Record<string, unknown>
    stringify: (value: unknown) => string
  }
}

function automationYamlPath(id: string) {
  return path.join(emmiDataRoot(), 'automations', `${id}.yaml`)
}

function readAutomationDescriptionFromDisk(id: string) {
  return readAutomationScalarsFromDisk(id)?.description ?? null
}

function readAutomationScalarsFromDisk(id: string) {
  const file = automationYamlPath(id)
  if (!fs.existsSync(file)) return null
  const { parse } = yamlModule()
  const raw = parse(fs.readFileSync(file, 'utf8'))
  return {
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    trigger: String(raw.trigger ?? 'manual'),
    active: raw.active !== false,
    defaultMode: String(raw.defaultMode ?? 'review'),
    keybind: (raw.keybind ?? null) as string | null,
    keybindEnabled: raw.keybindEnabled !== false,
  }
}

function scalarMatches(key: string, expected: unknown, actual: unknown) {
  if (key === 'active' || key === 'keybindEnabled') {
    return Boolean(expected) === Boolean(actual)
  }
  if (expected == null) return actual == null || actual === ''
  return String(expected) === String(actual ?? '')
}

const AUTOMATION_SCALAR_KEYS = [
  'name',
  'description',
  'trigger',
  'active',
  'defaultMode',
  'keybind',
  'keybindEnabled',
] as const

function patchAutomationYamlScalars(
  id: string,
  fields: Record<string, unknown>,
) {
  const file = automationYamlPath(id)
  if (!fs.existsSync(file)) {
    throw new Error(`Automation file missing: ${file}`)
  }
  const { parse, stringify } = yamlModule()
  const raw = parse(fs.readFileSync(file, 'utf8'))
  for (const key of AUTOMATION_SCALAR_KEYS) {
    if (key in fields) raw[key] = fields[key]
  }
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, stringify(raw))
  fs.renameSync(tmp, file)
}

const persistLocks = new Map<string, Promise<unknown>>()

async function persistAutomationUpdate(
  id: string,
  partial: Record<string, unknown>,
) {
  const prev = persistLocks.get(id) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = prev.then(() => gate)
  persistLocks.set(id, chained)
  await prev

  try {
    const scalarPatch: Record<string, unknown> = {}
    for (const key of AUTOMATION_SCALAR_KEYS) {
      if (key in partial) scalarPatch[key] = partial[key]
    }

    // Daemon owns steps/script rewrite; we never patch before PUT (that raced).
    await daemonJsonRequestWithRetry<{ automation: unknown }>(
      'PUT',
      `/automations/${encodeURIComponent(id)}`,
      partial,
    )

    // Final authoritative write for name/description/etc.
    if (Object.keys(scalarPatch).length) {
      if (!fs.existsSync(automationYamlPath(id))) {
        throw new Error(`Automation file missing after save: ${automationYamlPath(id)}`)
      }
      patchAutomationYamlScalars(id, scalarPatch)
      const again = readAutomationScalarsFromDisk(id)
      if (!again) {
        throw new Error(`Automation file missing after patch: ${automationYamlPath(id)}`)
      }
      for (const key of Object.keys(scalarPatch)) {
        if (!scalarMatches(key, scalarPatch[key], again[key as keyof typeof again])) {
          throw new Error(`${key} not written to ${automationYamlPath(id)}`)
        }
      }
    }

    const result = await daemonJsonRequestWithRetry<{ automation: unknown }>(
      'GET',
      `/automations/${encodeURIComponent(id)}`,
    )
    return {
      ...result,
      path: automationYamlPath(id),
    }
  } finally {
    release()
    if (persistLocks.get(id) === chained) persistLocks.delete(id)
  }
}

function daemonJsonRequest<T>(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: DAEMON_PORT,
        path: pathname,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data: T & { error?: string }
          try {
            data = JSON.parse(text || '{}') as T & { error?: string }
          } catch {
            reject(new Error('Invalid daemon response'))
            return
          }
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(data.error ?? res.statusMessage ?? 'Daemon error'))
            return
          }
          resolve(data)
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(10_000, () => {
      req.destroy()
      reject(new Error('Daemon request timed out'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

function daemonHealth(): Promise<boolean> {
  return httpProbe('/health')
}

/**
 * True when the daemon supports the current API surface (not a stale build).
 * Probe the newest stable routes so a daemon missing recent features (e.g.
 * /packs) is treated as stale and restarted instead of serving 404s.
 */
async function daemonReady(): Promise<boolean> {
  const [rules, packs] = await Promise.all([
    httpProbe('/connectors/fs/rules'),
    httpProbe('/packs'),
  ])
  return rules && packs
}

function killProcessOnPort(port: number) {
  if (process.platform === 'win32') return
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim()
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM')
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* nothing listening */
  }
}

function backendDir() {
  const fromMain = path.join(__dirname, '..', 'backend')
  if (fs.existsSync(fromMain)) return fromMain
  return path.join(app.getAppPath(), 'backend')
}

function emmiLogsRoot() {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Logs', APP_NAME)
  }
  return app.getPath('logs')
}

function emmiCacheRoot() {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Caches', APP_NAME)
  }
  return app.getPath('cache')
}

/** Loopback helper so the Node daemon can encrypt tokens with safeStorage. */
let credentialsBridge: http.Server | null = null
let credentialsBridgeUrl: string | null = null

function ensureCredentialsBridge(): string | null {
  if (credentialsBridgeUrl) return credentialsBridgeUrl
  if (!safeStorage.isEncryptionAvailable()) return null

  const server = http.createServer((req, res) => {
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') {
      respond(405, { ok: false, error: 'method' })
      return
    }
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        const parsed = JSON.parse(raw || '{}') as { payload?: string }
        const payload = String(parsed.payload ?? '')
        const urlPath = req.url?.split('?')[0] ?? ''
        if (urlPath === '/encrypt' || urlPath.endsWith('/encrypt')) {
          const enc = safeStorage.encryptString(payload)
          respond(200, { ok: true, result: Buffer.from(enc).toString('base64') })
          return
        }
        if (urlPath === '/decrypt' || urlPath.endsWith('/decrypt')) {
          const buf = Buffer.from(payload, 'base64')
          const plain = safeStorage.decryptString(buf)
          respond(200, { ok: true, result: plain })
          return
        }
        respond(404, { ok: false, error: 'not_found' })
      } catch (err) {
        respond(500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  })

  server.listen(0, '127.0.0.1')
  const addr = server.address()
  if (!addr || typeof addr === 'string') {
    server.close()
    return null
  }
  credentialsBridge = server
  credentialsBridgeUrl = `http://127.0.0.1:${addr.port}/`
  return credentialsBridgeUrl
}

function startDaemonProcess() {
  if (daemonProcess || daemonStarting || appQuitting) return
  const cwd = backendDir()
  if (!fs.existsSync(cwd)) {
    console.error('[emmi] backend package missing at', cwd)
    return
  }

  fs.mkdirSync(emmiDataRoot(), { recursive: true })
  fs.mkdirSync(emmiLogsRoot(), { recursive: true })
  fs.mkdirSync(emmiCacheRoot(), { recursive: true })

  const distEntry = path.join(cwd, 'dist', 'index.js')
  const tsxCli = path.join(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const srcEntry = path.join(cwd, 'src', 'index.ts')

  const bridgeUrl = ensureCredentialsBridge()

  let command = process.execPath
  let args: string[]
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EMMI_HOME: emmiDataRoot(),
    EMMI_LOGS: emmiLogsRoot(),
    EMMI_CACHE: emmiCacheRoot(),
    EMMI_PORT: String(DAEMON_PORT),
    ELECTRON_RUN_AS_NODE: '1',
    ...(bridgeUrl ? { EMMI_CREDENTIALS_BRIDGE: bridgeUrl } : {}),
    ...(verboseDaemonLogs ? { EMMI_VERBOSE: '1' } : {}),
  }

  if (fs.existsSync(distEntry)) {
    args = [distEntry]
  } else if (fs.existsSync(tsxCli) && fs.existsSync(srcEntry)) {
    args = [tsxCli, srcEntry]
  } else {
    command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    args = ['tsx', 'src/index.ts']
    delete env.ELECTRON_RUN_AS_NODE
  }

  daemonStarting = true
  daemonProcess = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  daemonProcess.stdout?.on('data', (chunk: Buffer) => {
    console.log('[emmi-daemon]', chunk.toString().trimEnd())
  })
  daemonProcess.stderr?.on('data', (chunk: Buffer) => {
    console.error('[emmi-daemon]', chunk.toString().trimEnd())
  })

  daemonProcess.on('error', (err) => {
    console.error('[emmi] daemon failed to start', err)
    daemonProcess = null
    daemonStarting = false
  })

  daemonProcess.on('exit', () => {
    daemonProcess = null
    daemonStarting = false
    if (!appQuitting && !daemonManuallyStopped) {
      // Keep the daemon up — respawn shortly after unexpected exit.
      setTimeout(() => {
        void ensureDaemon()
      }, 750)
    }
  })

  setTimeout(() => {
    daemonStarting = false
  }, 1500)
}

async function ensureDaemon() {
  if (appQuitting || daemonManuallyStopped) return false
  if (await daemonReady()) return true

  // A stale build may still answer /health but not the rules API.
  if (await daemonHealth()) {
    killProcessOnPort(DAEMON_PORT)
    await new Promise((r) => setTimeout(r, 400))
  }

  startDaemonProcess()
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 250))
    if (await daemonReady()) return true
  }
  return false
}

function startDaemonWatchdog() {
  if (daemonWatchdog) return
  daemonWatchdog = setInterval(() => {
    if (appQuitting) return
    void ensureDaemon()
  }, 4000)
}

ipcMain.on('daemon:restart', () => {
  daemonManuallyStopped = false
  if (daemonProcess && !daemonProcess.killed) {
    daemonProcess.kill()
    daemonProcess = null
  }
  killProcessOnPort(DAEMON_PORT)
  setTimeout(() => {
    void ensureDaemon()
  }, 400)
})

ipcMain.on('daemon:stop', () => {
  daemonManuallyStopped = true
  if (daemonProcess && !daemonProcess.killed) {
    daemonProcess.kill()
    daemonProcess = null
  }
  killProcessOnPort(DAEMON_PORT)
})

function readMemoryUsageMb(): number {
  let kb = 0
  try {
    for (const metric of app.getAppMetrics()) {
      kb += metric.memory.workingSetSize ?? 0
    }
  } catch {
    /* ignore */
  }

  const pid = daemonProcess?.pid
  if (pid && process.platform !== 'win32') {
    try {
      const out = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8', timeout: 1000 })
      const rssKb = Number.parseInt(out.trim(), 10)
      if (!Number.isNaN(rssKb)) kb += rssKb
    } catch {
      /* daemon not running */
    }
  }

  return Math.max(1, Math.round(kb / 1024))
}

ipcMain.handle('daemon:ensure', async () => ensureDaemon())

ipcMain.handle('daemon:health', async () => daemonReady())

ipcMain.handle('process:memory', () => readMemoryUsageMb())

ipcMain.handle('automation:fetch', async (_event, id: string) => {
  return daemonJsonRequestWithRetry<{ automation: unknown }>(
    'GET',
    `/automations/${encodeURIComponent(id)}`,
  )
})

ipcMain.handle(
  'automation:update',
  async (_event, id: string, partial: Record<string, unknown>) => {
    return persistAutomationUpdate(id, partial)
  },
)

ipcMain.handle('automation:reveal', async (_event, id: string) => {
  const file = automationYamlPath(id)
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`)
  }
  shell.showItemInFolder(file)
  return { path: file }
})

ipcMain.handle(
  'automation:create',
  async (_event, input: Record<string, unknown>) => {
    return daemonJsonRequestWithRetry<{ automation: unknown }>(
      'POST',
      '/automations',
      input,
    )
  },
)

function permissionsPath() {
  return path.join(emmiDataRoot(), 'folder-permissions.json')
}

function loadGrantedFolders(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(permissionsPath(), 'utf8')) as {
      granted?: string[]
    }
    return Array.isArray(raw.granted) ? raw.granted : []
  } catch {
    return []
  }
}

function saveGrantedFolders(granted: string[]) {
  fs.writeFileSync(
    permissionsPath(),
    JSON.stringify({ granted: [...new Set(granted)] }, null, 2),
  )
}

function expandUserPath(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2))
  return path.resolve(trimmed)
}

async function canAccessFolder(abs: string) {
  try {
    await fsPromises.mkdir(abs, { recursive: true })
    await fsPromises.access(abs, fs.constants.R_OK | fs.constants.W_OK)
    await fsPromises.readdir(abs)
    return true
  } catch {
    return false
  }
}

type EnsureFolderAccessOpts = { force?: boolean }

/** Ask the user (and macOS TCC) for access to local folders via native pickers. */
async function ensureFolderAccess(
  folders: string[],
  opts: EnsureFolderAccessOpts = {},
) {
  const needed = [...new Set(folders.map(expandUserPath).filter(Boolean))]
  if (!needed.length) return { ok: true as const, folders: [] as string[] }

  let granted = loadGrantedFolders()
  const denied: string[] = []
  const win = BrowserWindow.getFocusedWindow()
  const force = Boolean(opts.force)

  for (const folder of needed) {
    if (!force) {
      if (granted.some((g) => folder === g || folder.startsWith(g + path.sep))) {
        if (await canAccessFolder(folder)) continue
      }

      // Touch the folder so macOS can show its Files & Folders prompt.
      if (await canAccessFolder(folder)) {
        granted.push(folder)
        continue
      }
    }

    const options: Electron.OpenDialogOptions = {
      title: 'Allow folder access',
      message: `Select “${path.basename(folder)}” to allow Emmi’s Filesystem connector to use it.`,
      defaultPath: fs.existsSync(folder) ? folder : path.dirname(folder),
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || !result.filePaths[0]) {
      denied.push(toTildePath(folder))
      continue
    }

    const picked = path.resolve(result.filePaths[0])
    granted.push(picked)
    // If user picked a parent (e.g. Documents), still ensure the target exists.
    if (folder.startsWith(picked + path.sep) || folder === picked) {
      await fsPromises.mkdir(folder, { recursive: true })
      granted.push(folder)
    }

    if (!(await canAccessFolder(folder)) && !(await canAccessFolder(picked))) {
      denied.push(toTildePath(folder))
    }
  }

  granted = [...new Set(granted)]
  saveGrantedFolders(granted)

  if (denied.length) {
    return { ok: false as const, folders: needed.map(toTildePath), denied }
  }
  return { ok: true as const, folders: needed.map(toTildePath) }
}

async function checkFolderAccess(folders: string[]) {
  const needed = [...new Set(folders.map(expandUserPath).filter(Boolean))]
  const granted = loadGrantedFolders()
  const missing: string[] = []
  for (const folder of needed) {
    const remembered = granted.some(
      (g) => folder === g || folder.startsWith(g + path.sep),
    )
    if (remembered && (await canAccessFolder(folder))) continue
    if (await canAccessFolder(folder)) {
      granted.push(folder)
      continue
    }
    missing.push(toTildePath(folder))
  }
  if (granted.length) saveGrantedFolders(granted)
  return {
    ok: missing.length === 0,
    folders: needed.map(toTildePath),
    denied: missing,
  }
}

ipcMain.handle('permissions:checkFolders', async (_e, folders: string[]) => {
  return checkFolderAccess(Array.isArray(folders) ? folders : [])
})

ipcMain.handle(
  'permissions:ensureFolders',
  async (_e, folders: string[], opts?: EnsureFolderAccessOpts) => {
    const result = await ensureFolderAccess(
      Array.isArray(folders) ? folders : [],
      opts && typeof opts === 'object' ? opts : {},
    )
    if (!result.ok && opts?.force) {
      const win = BrowserWindow.getFocusedWindow()
      const detail = [
        'Emmi still needs access to:',
        ...(result.denied ?? []).map((f) => `• ${f}`),
        '',
        'You can grant access in System Settings → Privacy & Security → Files and Folders.',
      ].join('\n')
      const box = win
        ? await dialog.showMessageBox(win, {
            type: 'warning',
            buttons: ['Open Privacy Settings', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            message: 'Folder access incomplete',
            detail,
          })
        : await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Open Privacy Settings', 'Cancel'],
            defaultId: 0,
            cancelId: 1,
            message: 'Folder access incomplete',
            detail,
          })
      if (box.response === 0) {
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_FilesAndFolders',
        )
      }
    }
    return result
  },
)

ipcMain.handle('permissions:openSettings', async () => {
  if (process.platform === 'darwin') {
    // macOS Ventura+ Files and Folders privacy pane
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_FilesAndFolders',
    )
    return true
  }
  return false
})

const CHROME_DEBUG_PORT = Number(process.env.EMMI_CHROME_DEBUG_PORT ?? 9222) || 9222
const CHROME_BIN =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function probeChromeCdp(port = CHROME_DEBUG_PORT): Promise<{
  state: 'up' | 'no_pages' | 'down'
  port: number
}> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${port}/json/list`,
      { timeout: 2000 },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              type?: string
              webSocketDebuggerUrl?: string
            }[]
            if (!Array.isArray(data)) {
              resolve({ state: 'down', port })
              return
            }
            const pages = data.filter(
              (t) => t.type === 'page' && t.webSocketDebuggerUrl,
            )
            resolve({
              state: pages.length ? 'up' : 'no_pages',
              port,
            })
          } catch {
            resolve({ state: 'down', port })
          }
        })
      },
    )
    req.on('error', () => resolve({ state: 'down', port }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ state: 'down', port })
    })
  })
}

async function enableChromeDebugging(opts?: {
  confirm?: boolean
}): Promise<{
  ok: boolean
  state: 'up' | 'no_pages' | 'down'
  port: number
  cancelled?: boolean
  error?: string
  command?: string
}> {
  const port = CHROME_DEBUG_PORT
  const command = `"${CHROME_BIN}" --remote-debugging-port=${port}`

  const current = await probeChromeCdp(port)
  if (current.state === 'up' || current.state === 'no_pages') {
    return { ok: true, state: current.state, port }
  }

  if (opts?.confirm !== false) {
    const win = BrowserWindow.getFocusedWindow()
    const boxOpts: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Relaunch Chrome', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Enable Chrome remote debugging',
      message: 'Emmi will quit and relaunch Google Chrome with remote debugging.',
      detail: `This uses your real Chrome profile so logged-in tabs work. Port ${port}.\n\nSave any unsaved work in Chrome first.`,
    }
    const result = win
      ? await dialog.showMessageBox(win, boxOpts)
      : await dialog.showMessageBox(boxOpts)
    if (result.response !== 0) {
      return { ok: false, state: 'down', port, cancelled: true, command }
    }
  }

  if (process.platform !== 'darwin') {
    return {
      ok: false,
      state: 'down',
      port,
      error: 'Chrome debugging enable is only supported on macOS',
      command,
    }
  }

  if (!fs.existsSync(CHROME_BIN)) {
    return {
      ok: false,
      state: 'down',
      port,
      error: 'Google Chrome not found in /Applications',
      command,
    }
  }

  try {
    execSync(
      'osascript -e \'tell application "Google Chrome" to quit\'',
      { timeout: 15_000, stdio: 'ignore' },
    )
  } catch {
    /* may already be quit */
  }
  await new Promise((r) => setTimeout(r, 800))

  const child = spawn(CHROME_BIN, [`--remote-debugging-port=${port}`], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400))
    const status = await probeChromeCdp(port)
    if (status.state === 'up' || status.state === 'no_pages') {
      return { ok: true, state: status.state, port }
    }
  }

  return {
    ok: false,
    state: 'down',
    port,
    error: `Chrome did not open remote debugging on port ${port}`,
    command,
  }
}

ipcMain.handle('chrome:cdpStatus', async () => probeChromeCdp())

ipcMain.handle(
  'chrome:enableDebugging',
  async (_e, opts?: { confirm?: boolean }) => enableChromeDebugging(opts),
)

function toTildePath(absolute: string) {
  const home = os.homedir()
  if (absolute === home) return '~'
  if (absolute.startsWith(home + path.sep)) {
    return `~${absolute.slice(home.length)}`
  }
  return absolute
}

ipcMain.handle(
  'dialog:pick',
  async (
    _event,
    opts?: {
      kind?: 'file' | 'folder'
      multiple?: boolean
      title?: string
      filters?: { name: string; extensions: string[] }[]
    },
  ) => {
    const kind = opts?.kind ?? 'folder'
    const win = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: opts?.title,
      properties:
        kind === 'folder'
          ? ['openDirectory', 'createDirectory']
          : opts?.multiple
            ? ['openFile', 'multiSelections']
            : ['openFile'],
      filters: opts?.filters,
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths.length) return null
    const paths = result.filePaths.map(toTildePath)
    return opts?.multiple ? paths : paths[0]!
  },
)

app.whenReady().then(() => {
  const saved = readPreferencesFile()
  applyShellPrefsFromData(saved)
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }
  createTray()
  wirePowerMonitor()
  void ensureDaemon()
  startDaemonWatchdog()
  if (openDashboardOnLaunch) {
    showDashboard()
  }
})

app.on('before-quit', (event) => {
  if (appQuitting) {
    globalShortcut.unregisterAll()
    if (daemonWatchdog) {
      clearInterval(daemonWatchdog)
      daemonWatchdog = null
    }
    if (daemonProcess && !daemonProcess.killed) {
      daemonProcess.kill()
      daemonProcess = null
    }
    if (credentialsBridge) {
      credentialsBridge.close()
      credentialsBridge = null
      credentialsBridgeUrl = null
    }
    return
  }
  event.preventDefault()
  void requestQuit()
})

app.on('window-all-closed', () => {
  if (!keepRunningInBackground && !appQuitting) {
    void requestQuit()
  }
})

app.on('activate', () => {
  showDashboard()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
