import { createEmptyState, mapDaemonConnectors } from '@/data/defaults'
import { applyAppearance } from '@/lib/appearance'
import { foldersForAutomation, foldersForFilesystemConnect } from '@/lib/automationPaths'
import { filterActiveConnectorRules, filterRuleLibrary } from '@/lib/ruleDef'
import {
  deleteCachedRuleCode,
  getCachedRuleCode,
  setCachedRuleCode,
} from '@/lib/ruleCodeCache'
import {
  approveDaemonPending,
  clearDaemonLogsOlderThan,
  createConnectorRule,
  createDaemonAutomation,
  daemonPing,
  deleteConnectorRule,
  fetchAutomations,
  fetchAutomation,
  fetchConnectorAuthStatus,
  fetchConnectorPermissions,
  fetchConnectors,
  fetchLogs,
  fetchPending,
  fetchRuleLibrary,
  fetchRuleSource,
  disconnectConnectorAuth,
  openSafariApp,
  patchDaemonControl,
  rejectDaemonPending,
  runDaemonAutomation,
  saveConnectorPermissions,
  saveDaemonConfig,
  startConnectorAuth,
  subscribeDaemonEvents,
  updateConnectorRule,
  updateDaemonAutomation,
  updateDaemonPending,
  undoDaemonLog,
} from '@/lib/daemonClient'
import { mergePersistedPrefs, prefsSnapshot } from '@/lib/preferences'
import { resolveSystemKeybinds, SYSTEM_KEYBIND_DEFS } from '@/lib/systemKeybinds'
import { normalizeRunMode } from '@/lib/runMode'
import { normalizeStep } from '@/lib/stepOps'
import { defaultPathVariables } from '@/lib/pathVariables'
import type {
  AppState,
  AppearancePrefs,
  AccountProfile,
  Automation,
  AutomationStep,
  AutomationTrigger,
  BlockingPrompt,
  DaemonStatus,
  LlmConfig,
  NotificationPrefs,
  GeneralPrefs,
  KeybindPrefs,
  AutomationPrefs,
  OtherPrefs,
  LogEntry,
  PathVariable,
  PendingAction,
  RecentRun,
  RunMode,
  ScreenId,
  SystemKeybindId,
  SystemKeybindState,
} from '@/types/domain'

type Listener = (state: AppState) => void

let state = createEmptyState()
applyAppearance(state.appearance)
const listeners = new Set<Listener>()
let persistTimer: ReturnType<typeof setTimeout> | null = null
let prefsReady = false
let knownPendingIds = new Set<string>()
let knownLogIds = new Set<string>()
let notifySeeded = false

function emit() {
  for (const listener of listeners) listener(state)
  syncTrayMenu()
  syncKeybinds()
  syncShellPrefs()
}

function patch(partial: Partial<AppState>) {
  state = { ...state, ...partial }
  emit()
}

function schedulePersist() {
  if (!prefsReady) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void window.emmi?.savePreferences?.(prefsSnapshot(state))
  }, 200)
}

function syncShellPrefs() {
  window.emmi?.syncShellPrefs?.({
    launchAtLogin: state.general.launchAtLogin,
    confirmBeforeQuit: state.general.confirmBeforeQuit,
    keepRunningInBackground: state.general.keepRunningInBackground,
    openDashboardOnLaunch: state.general.openDashboardOnLaunch,
    hideInFullscreen: state.general.hideInFullscreen,
    showInDock: state.general.showInDock,
    showMenuBarTitle: state.general.showMenuBarTitle,
    menuBarBadge: state.notifications.menuBarBadge,
    verboseDaemonLogs: state.other.verboseDaemonLogs,
    pendingCount: state.pending.length,
    pauseWhenAsleep: state.automationsPrefs.pauseWhenAsleep,
    pauseOnBattery: state.automationsPrefs.pauseOnBattery,
    maxConcurrentRuns: state.automationsPrefs.maxConcurrentRuns,
    requireReviewForDeletes: state.automationsPrefs.requireReviewForDeletes,
    keepDetailedLogs: state.other.keepDetailedLogs,
  })
}

function inQuietHours() {
  if (!state.notifications.quietHoursEnabled) return false
  const hour = new Date().getHours()
  return hour >= 22 || hour < 8
}

function maybeNotify(kind: 'success' | 'failure' | 'review', title: string, body: string) {
  const n = state.notifications
  if (!n.systemNotifications || inQuietHours()) return
  if (kind === 'success' && !n.notifyOnSuccess) return
  if (kind === 'failure' && !n.notifyOnFailure) return
  if (kind === 'review' && !n.notifyOnReview) return
  window.emmi?.showNotification?.({
    title,
    body,
    silent: !n.soundEnabled,
  })
}

function pathVariablesToDaemonMap(vars: PathVariable[]) {
  const out: Record<string, string> = {}
  for (const v of vars) {
    const name = v.name.trim()
    if (!name) continue
    out[name] = v.path.trim() || '~/'
  }
  return out
}

async function pushPathVariablesToDaemon() {
  const map = pathVariablesToDaemonMap(state.pathVariables)
  if (!Object.keys(map).length) return
  try {
    await saveDaemonConfig(map)
  } catch {
    /* offline */
  }
}

export async function loadPersistedPrefs() {
  const defaults = createEmptyState()
  try {
    const raw = (await window.emmi?.loadPreferences?.()) ?? {}
    const merged = mergePersistedPrefs(defaults, raw)
    if (Object.keys(merged).length) {
      state = { ...state, ...merged }
      applyAppearance(state.appearance)
    }
  } catch {
    /* defaults */
  }
  prefsReady = true
  syncShellPrefs()
  syncKeybinds()
  void patchDaemonControl({
    pauseWhenAsleep: state.automationsPrefs.pauseWhenAsleep,
    pauseOnBattery: state.automationsPrefs.pauseOnBattery,
    maxConcurrentRuns: state.automationsPrefs.maxConcurrentRuns,
    requireReviewForDeletes: state.automationsPrefs.requireReviewForDeletes,
    keepDetailedLogs: state.other.keepDetailedLogs,
    verboseDaemonLogs: state.other.verboseDaemonLogs,
  }).catch(() => {})
  if (state.other.clearLogsAfterDays > 0) {
    void clearDaemonLogsOlderThan(state.other.clearLogsAfterDays).catch(() => {})
  }
}

export function exportPreferencesJson() {
  return JSON.stringify(prefsSnapshot(state), null, 2)
}

export async function resetPreferences() {
  await window.emmi?.clearPreferences?.()
  const fresh = createEmptyState()
  state = {
    ...state,
    llm: fresh.llm,
    general: fresh.general,
    appearance: fresh.appearance,
    account: fresh.account,
    notifications: fresh.notifications,
    automationsPrefs: fresh.automationsPrefs,
    other: fresh.other,
    keybinds: fresh.keybinds,
    systemKeybinds: fresh.systemKeybinds,
    pathVariables: defaultPathVariables(),
  }
  applyAppearance(state.appearance)
  prefsReady = true
  schedulePersist()
  emit()
  void pushPathVariablesToDaemon()
}

export function signOutAccount() {
  // Local profile (name + photo) is kept; no remote session to clear yet.
}

export function stopDaemon() {
  window.emmi?.stopDaemon?.()
  setDaemonStatus('stopped')
}

export function filterConnectorsForPrefs(connectors: AppState['connectors']) {
  return connectors.filter((c) => {
    if (
      !state.other.allowCloudConnectors &&
      (c.kind === 'Web' || c.kind === 'Cloud')
    ) {
      return false
    }
    if (!state.other.showExperimentalConnectors && c.experimental) {
      return false
    }
    return true
  })
}

/** @deprecated use patch — all state is in-memory until daemon sync */
function patchEphemeral(partial: Partial<AppState>) {
  patch(partial)
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function resolveRuleLibrary(
  fetched: ReturnType<typeof filterRuleLibrary> | undefined,
): AppState['ruleLibrary'] {
  if (!fetched?.length) return []
  return fetched.map((rule) => {
    const { code: _code, ...meta } = rule
    return meta
  })
}

/** Rules visible in UI — FS/Shell always; others only when connected. */
export function getInstalledRules() {
  return filterActiveConnectorRules(state.ruleLibrary, state.connectors)
}

export function connectorHasInstalledRules(connectorId: string) {
  if (connectorId === 'fs' || connectorId === 'shell') return true
  return state.connectors.some(
    (c) => c.id === connectorId && c.authStatus === 'connected',
  )
}

/**
 * Hide automations whose connector/pack has been uninstalled. "Installed" means
 * the connector manifest still exists (present in the /connectors response).
 * Automations with no declared connectors, or from an older daemon, stay visible.
 */
export function filterInstalledAutomations(
  automations: AppState['automations'] = state.automations,
  connectors: AppState['connectors'] = state.connectors,
): AppState['automations'] {
  const installed = new Set(connectors.map((c) => c.id))
  return automations.filter((a) =>
    (a.connectors ?? []).every((id) => installed.has(id)),
  )
}

function daemonDataKey(snapshot: {
  daemonStatus: DaemonStatus
  automations: AppState['automations']
  pending: AppState['pending']
  logs: AppState['logs']
  ruleLibrary: AppState['ruleLibrary']
  connectors: AppState['connectors']
}) {
  return JSON.stringify({
    daemonStatus: snapshot.daemonStatus,
    automations: snapshot.automations.map((a) => ({
      id: a.id,
      active: a.active,
      name: a.name,
      description: a.description,
      lastRunAt: a.lastRunAt,
      steps: a.steps,
      keybind: a.keybind,
      keybindEnabled: a.keybindEnabled,
    })),
    pending: snapshot.pending.map((p) => ({
      id: p.id,
      action: p.action,
      editableAction: p.editableAction,
      createdAt: p.createdAt,
    })),
    logs: `${snapshot.logs.length}:${snapshot.logs[0]?.id ?? ''}:${snapshot.logs[snapshot.logs.length - 1]?.id ?? ''}`,
    rules: snapshot.ruleLibrary
      .map((r) => `${r.connectorId}/${r.id}:${r.origin}`)
      .sort()
      .join('|'),
    connectors: snapshot.connectors.map((c) => `${c.id}:${c.authStatus}`).join('|'),
  })
}

function mergeAutomationsFromSync(incoming: Automation[]): Automation[] {
  const now = Date.now()
  for (const [id, entry] of recentAutomationSaves) {
    if (now - entry.savedAt > AUTOMATION_SAVE_GUARD_MS) {
      recentAutomationSaves.delete(id)
    }
  }
  return incoming.map((a) => {
    const guard = recentAutomationSaves.get(a.id)
    if (guard && now - guard.savedAt <= AUTOMATION_SAVE_GUARD_MS) {
      return guard.automation
    }
    return a
  })
}

function markAutomationSaved(automation: Automation) {
  recentAutomationSaves.set(automation.id, {
    savedAt: Date.now(),
    automation,
  })
}

function applyDaemonSync(next: {
  daemonStatus: DaemonStatus
  lastError: string | null
  ruleLibrary: AppState['ruleLibrary']
  automations?: AppState['automations']
  pending?: AppState['pending']
  logs?: AppState['logs']
  connectors?: AppState['connectors']
  blocking: AppState['blocking']
}) {
  const merged = {
    daemonStatus: next.daemonStatus,
    automations: next.automations ?? state.automations,
    pending: next.pending ?? state.pending,
    logs: next.logs ?? state.logs,
    ruleLibrary: next.ruleLibrary,
    connectors: next.connectors ?? state.connectors,
  }
  if (daemonDataKey(merged) === daemonDataKey(state)) {
    if (state.lastError !== next.lastError || state.blocking !== next.blocking) {
      patch({ lastError: next.lastError, blocking: next.blocking })
    }
    return false
  }
  patch({
    daemonStatus: next.daemonStatus,
    lastError: next.lastError,
    ruleLibrary: next.ruleLibrary,
    ...(next.automations
      ? {
          automations: mergeAutomationsFromSync(
            next.automations.map((a) => ({
              ...a,
              defaultMode: normalizeRunMode(a.defaultMode),
              steps: (a.steps ?? []).map((s) => normalizeStep(s)),
            })),
          ),
        }
      : {}),
    ...(next.pending ? { pending: next.pending } : {}),
    ...(next.logs ? { logs: next.logs } : {}),
    ...(next.connectors ? { connectors: normalizeConnectors(next.connectors) } : {}),
    blocking: next.blocking,
  })
  return true
}

function normalizeConnectors(connectors: AppState['connectors']): AppState['connectors'] {
  return connectors.map((connector) => {
    if (connector.id !== 'fs') return connector
    // Local filesystem is always on — no OAuth step.
    if (connector.authStatus === 'expired' || connector.authStatus === 'error') {
      return connector
    }
    return { ...connector, authStatus: 'connected' }
  })
}

export function getState() {
  return state
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let routeHistory: ScreenId[] = [state.route]
let historyIndex = 0
let sidebarCollapsed = false

export function navigate(route: ScreenId) {
  if (route === state.route) return
  routeHistory = routeHistory.slice(0, historyIndex + 1)
  routeHistory.push(route)
  historyIndex = routeHistory.length - 1
  patch({ route })
}

export function newAutomation() {
  patchEphemeral({ editingAutomationId: null })
  navigate('automation-new')
}

export function editAutomation(id: string) {
  patchEphemeral({ editingAutomationId: id })
  navigate('automation-new')
}

/** Load the latest automation from disk before editing (avoids stale in-memory description). */
export async function loadAutomationForEdit(id: string): Promise<Automation | undefined> {
  try {
    const { automation } = await fetchAutomation(id)
    const saved = automationFromDaemon(automation)
    patch({
      automations: state.automations.map((a) => (a.id === id ? saved : a)),
    })
    return saved
  } catch {
    return state.automations.find((a) => a.id === id)
  }
}

export function clearEditingAutomation() {
  patchEphemeral({ editingAutomationId: null })
}

export function openDetailedLog(logId: string) {
  patchEphemeral({ viewingDetailedLogId: logId })
  navigate('detailed-log')
}

export function clearDetailedLog() {
  patchEphemeral({ viewingDetailedLogId: null })
}

export function canGoBack() {
  return historyIndex > 0
}

export function canGoForward() {
  return historyIndex < routeHistory.length - 1
}

export function goBack() {
  if (!canGoBack()) return
  historyIndex -= 1
  patch({ route: routeHistory[historyIndex] })
}

export function goForward() {
  if (!canGoForward()) return
  historyIndex += 1
  patch({ route: routeHistory[historyIndex] })
}

export function isSidebarCollapsed() {
  return sidebarCollapsed
}

export function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed
  document.querySelector('.app-shell')?.classList.toggle(
    'sidebar-collapsed',
    sidebarCollapsed,
  )
  emit()
}

/** Per-file / rule-category noise — hide from menu bar, logs table, activity. */
function isStepNoiseLog(entry: LogEntry) {
  const action = entry.action?.trim() ?? ''
  const summary = entry.summary?.trim() ?? ''
  if (/^fs\.(move|copy|rename|delete|mkdir)$/i.test(action)) return true
  if (action === 'fs' || action === 'automation') return true
  if (/^(Moved|Copied|Renamed|Deleted|Created directory)\b/i.test(summary)) {
    return true
  }
  return false
}

/** Action/summary only — automation name lives in `title` / Activity column. */
function runDetail(entry: LogEntry) {
  const action = entry.action?.trim() ?? ''
  if (/^(Ran script|Pending review|Dry run|Undo:)\b/i.test(action)) {
    return action
  }
  if (action && action !== entry.summary) {
    return action
  }
  return entry.summary
}

export function recentRuns(snapshot: AppState = state, limit = 5): RecentRun[] {
  const runs: RecentRun[] = []

  for (const item of snapshot.pending) {
    if (snapshot.dismissedNotificationIds.includes(`pending:${item.id}`)) continue
    runs.push({
      id: `pending:${item.id}`,
      kind: 'pending',
      title: item.title,
      detail: 'Pending review',
      at: item.createdAt,
      pendingId: item.id,
      connectorId: item.connectorId,
    })
  }

  for (const entry of snapshot.logs) {
    if (isStepNoiseLog(entry)) continue
    if (snapshot.dismissedNotificationIds.includes(`log:${entry.id}`)) continue
    runs.push({
      id: `log:${entry.id}`,
      kind: entry.success ? 'completed' : 'failed',
      title: entry.automationName,
      detail: runDetail(entry),
      at: entry.at,
      logId: entry.id,
      connectorId: entry.connectorId,
    })
  }

  return runs
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, limit)
}

function syncTrayMenu() {
  const runs = recentRuns(state, 5).map((run) => ({
    id: run.id,
    kind: run.kind,
    // Menu bar has no Activity column — keep name + detail together.
    label: `${run.title} — ${run.detail}`,
    pendingId: run.pendingId,
    logId: run.logId,
  }))
  const moreCount = Math.max(0, recentRuns(state, 50).length - runs.length)
  window.emmi?.syncTrayMenu?.({ runs, moreCount })
}

function syncKeybinds() {
  const system = SYSTEM_KEYBIND_DEFS.filter((def) => {
    const entry = state.systemKeybinds[def.id]
    return entry?.enabled !== false && entry?.accelerator
  }).map((def) => ({
    kind: 'system' as const,
    id: def.id,
    accelerator: state.systemKeybinds[def.id].accelerator as string,
  }))

  const automations = state.automations
    .filter((a) => a.active && a.keybindEnabled && a.keybind)
    .map((a) => ({
      kind: 'automation' as const,
      id: a.id,
      accelerator: a.keybind as string,
    }))

  window.emmi?.syncKeybinds?.({
    enabled: state.keybinds.enabled,
    appFocusedOnly: state.keybinds.appFocusedOnly,
    bindings: [...system, ...automations],
  })
}

export function pushTraySync() {
  syncTrayMenu()
  syncKeybinds()
}

export function counts(snapshot: AppState = state) {
  return {
    pending: snapshot.pending.length,
    automationsActive: filterInstalledAutomations(
      snapshot.automations,
      snapshot.connectors,
    ).filter((a) => a.active).length,
    connectorsConnected: snapshot.connectors.filter((c) => c.authStatus === 'connected')
      .length,
    connectorsNeedAuth: snapshot.connectors.filter((c) => c.authStatus === 'expired')
      .length,
    memoryMb: snapshot.memoryMb,
  }
}

export async function refreshMemoryUsage() {
  const mb = await window.emmi?.getMemoryUsage?.()
  if (typeof mb !== 'number' || Number.isNaN(mb)) return
  if (state.memoryMb === mb) return
  patchEphemeral({ memoryMb: mb })
}

export function getRuleCode(connectorId: string, ruleId: string) {
  return getCachedRuleCode(connectorId, ruleId)
}

export function setDaemonStatus(daemonStatus: DaemonStatus) {
  const lastError =
    daemonStatus === 'crashed'
      ? 'Background process crashed. Restart to resume.'
      : daemonStatus === 'stopped'
        ? null
        : state.lastError?.includes('crashed')
          ? null
          : state.lastError
  patch({ daemonStatus, lastError })
  if (daemonStatus === 'crashed') {
    showBlocking({
      id: uid('block'),
      kind: 'daemon',
      title: 'Background process crashed',
      body: 'Automations are paused until the process is restarted.',
      primaryLabel: 'Restart',
      secondaryLabel: 'Dismiss',
    })
  }
}

let daemonEventsUnsub: (() => void) | null = null
let syncInFlight: Promise<boolean> | null = null
const AUTOMATION_SAVE_GUARD_MS = 8000
const recentAutomationSaves = new Map<
  string,
  { savedAt: number; automation: Automation }
>()

/** Pull automations/rules/pending/logs from the local daemon when available. */
export async function syncFromDaemon() {
  if (syncInFlight) return syncInFlight
  syncInFlight = syncFromDaemonInner().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function syncFromDaemonInner() {
  let online = await daemonPing()
  if (!online) {
    if (state.daemonStatus !== 'idle') {
      patchEphemeral({ daemonStatus: 'idle' })
    }
    await window.emmi?.ensureDaemon?.()
    await new Promise((r) => setTimeout(r, 600))
    online = await daemonPing()
  }

  if (!online && window.emmi?.daemonHealth) {
    const mainOk = await window.emmi.daemonHealth()
    if (mainOk) {
      await new Promise((r) => setTimeout(r, 800))
      online = await daemonPing()
    }
  }

  if (!online) {
    patch({
      daemonStatus: 'stopped',
      lastError:
        state.lastError ??
        'Daemon offline — showing last synced data until it reconnects.',
    })
    return false
  }

  const [automationsR, rulesR, pendingR, logsR, connectorsR] = await Promise.allSettled([
    fetchAutomations(),
    fetchRuleLibrary(),
    fetchPending(),
    fetchLogs(),
    fetchConnectors(),
  ])

  const automations =
    automationsR.status === 'fulfilled' ? automationsR.value : null
  const ruleLibraryResult =
    rulesR.status === 'fulfilled' ? rulesR.value : undefined
  const pending = pendingR.status === 'fulfilled' ? pendingR.value : null
  const logs = logsR.status === 'fulfilled' ? logsR.value : null
  const connectorsRaw =
    connectorsR.status === 'fulfilled' ? connectorsR.value : null

  const cleanLogs = logs
    ? logs.filter((entry) => !isStepNoiseLog(entry))
    : null

  if (pending) {
    if (notifySeeded) {
      for (const item of pending) {
        if (!knownPendingIds.has(item.id)) {
          maybeNotify('review', item.title, item.action)
        }
      }
    }
    knownPendingIds = new Set(pending.map((p) => p.id))
  }
  if (cleanLogs) {
    if (notifySeeded) {
      for (const entry of cleanLogs.slice(0, 8)) {
        if (knownLogIds.has(entry.id)) continue
        if (entry.success) {
          maybeNotify('success', entry.automationName, entry.summary)
        } else {
          maybeNotify(
            'failure',
            entry.automationName,
            entry.error ?? entry.summary,
          )
          if (
            entry.connectorId === 'chrome' &&
            isChromeCdpSetupError(entry.error ?? entry.summary ?? '')
          ) {
            showChromeCdpSetupPrompt(entry.error ?? entry.summary)
          }
          if (
            entry.connectorId === 'safari' &&
            isSafariJsSetupError(entry.error ?? entry.summary ?? '')
          ) {
            showSafariJsSetupPrompt(entry.error ?? entry.summary)
          }
        }
      }
    }
    knownLogIds = new Set(cleanLogs.map((l) => l.id))
  }
  notifySeeded = true

  let connectors = connectorsRaw
    ? mapDaemonConnectors(connectorsRaw, state.connectors)
    : null

  for (const id of ['shell', 'git', 'safari', 'chrome'] as const) {
    if (!connectors?.some((c) => c.id === id)) continue
    try {
      const perms = await fetchConnectorPermissions(id)
      const status = (perms.permissions as { status?: string }).status
      connectors = connectors.map((c) =>
        c.id === id
          ? {
              ...c,
              authStatus: status === 'granted' ? 'connected' : 'available',
            }
          : c,
      )
    } catch {
      /* offline / older daemon */
    }
  }

  // OAuth / generic pack connectors: sync authStatus from credential vault.
  if (connectors) {
    const oauthIds = connectors
      .filter((c) => c.auth?.type === 'oauth2' || c.permission?.grant)
      .map((c) => c.id)
      .filter((id) => !['shell', 'git', 'safari', 'chrome', 'fs'].includes(id))
    for (const id of oauthIds) {
      try {
        const status = await fetchConnectorAuthStatus(id)
        const authStatus =
          status.status === 'connected'
            ? 'connected'
            : status.status === 'expired'
              ? 'expired'
              : status.status === 'error' || status.status === 'missing-client'
                ? 'error'
                : 'available'
        connectors = connectors.map((c) =>
          c.id === id
            ? {
                ...c,
                authStatus,
                accountLabel: status.accountLabel ?? c.accountLabel,
              }
            : c,
        )
      } catch {
        /* older daemon without auth routes */
      }
    }
  }

  applyDaemonSync({
    daemonStatus: 'running',
    lastError: null,
    ruleLibrary: resolveRuleLibrary(ruleLibraryResult),
    ...(automations ? { automations } : {}),
    ...(pending ? { pending } : {}),
    ...(cleanLogs ? { logs: cleanLogs } : {}),
    ...(connectors ? { connectors } : {}),
    blocking: state.blocking?.kind === 'daemon' ? null : state.blocking,
  })

  // Prefs path variables are source of truth; keep daemon config in sync.
  void pushPathVariablesToDaemon()
  return true
}

export function startDaemonSync() {
  const runSync = () => {
    void syncFromDaemon().then(() => ensureFilesystemConnected())
  }
  void window.emmi?.ensureDaemon?.().then(runSync)
  window.setTimeout(runSync, 1500)
  daemonEventsUnsub?.()
  daemonEventsUnsub = subscribeDaemonEvents(() => {
    void syncFromDaemon()
  })
  // SSE drives live updates; poll occasionally as a fallback.
  window.setInterval(() => {
    void syncFromDaemon()
  }, 30_000)
  window.setInterval(() => {
    void refreshMemoryUsage()
  }, 20_000)
  void refreshMemoryUsage()
}

export function restartDaemon() {
  window.emmi?.restartDaemon?.()
  patch({ daemonStatus: 'idle', lastError: null, blocking: null })
  void pushPathVariablesToDaemon()
  window.setTimeout(() => {
    void syncFromDaemon().then((ok) => {
      if (!ok) {
        setDaemonStatus('stopped')
        patch({
          lastError:
            'Background process did not start. Quit other Emmi instances or run: npm run daemon:build',
        })
        return
      }
      patch({ daemonStatus: 'running', blocking: null, lastError: null })
    })
  }, 1200)
}

export function setLlm(llm: Partial<LlmConfig>) {
  patch({ llm: { ...state.llm, ...llm } })
  schedulePersist()
}

export function setGeneralPrefs(general: Partial<GeneralPrefs>) {
  const next = { ...state.general, ...general }
  patch({ general: next })
  window.emmi?.setShowInDock?.(next.showInDock)
  window.emmi?.setMenuBarTitle?.(next.showMenuBarTitle)
  schedulePersist()
}

export function setAppearancePrefs(appearance: Partial<AppearancePrefs>) {
  const next = { ...state.appearance, ...appearance }
  applyAppearance(next)
  patch({ appearance: next })
  schedulePersist()
}

export function setAccountProfile(account: Partial<AccountProfile>) {
  patch({ account: { ...state.account, ...account } })
  schedulePersist()
}

export function setNotificationPrefs(notifications: Partial<NotificationPrefs>) {
  patch({ notifications: { ...state.notifications, ...notifications } })
  schedulePersist()
}

export function setOtherPrefs(other: Partial<OtherPrefs>) {
  const next = { ...state.other, ...other }
  patch({ other: next })
  schedulePersist()
  if (
    other.clearLogsAfterDays !== undefined &&
    other.clearLogsAfterDays > 0
  ) {
    void clearDaemonLogsOlderThan(other.clearLogsAfterDays).catch(() => {})
  }
  void patchDaemonControl({
    keepDetailedLogs: next.keepDetailedLogs,
    verboseDaemonLogs: next.verboseDaemonLogs,
  }).catch(() => {})
}

export function setAutomationPrefs(automationsPrefs: Partial<AutomationPrefs>) {
  const next = { ...state.automationsPrefs, ...automationsPrefs }
  patch({ automationsPrefs: next })
  schedulePersist()
  void patchDaemonControl({
    pauseWhenAsleep: next.pauseWhenAsleep,
    pauseOnBattery: next.pauseOnBattery,
    maxConcurrentRuns: next.maxConcurrentRuns,
    requireReviewForDeletes: next.requireReviewForDeletes,
  }).catch(() => {})
}

export function setKeybindPrefs(keybinds: Partial<KeybindPrefs>) {
  patch({ keybinds: { ...state.keybinds, ...keybinds } })
  schedulePersist()
}

export function setSystemKeybind(
  id: SystemKeybindId,
  patchFields: Partial<SystemKeybindState>,
) {
  patch({
    systemKeybinds: {
      ...state.systemKeybinds,
      [id]: {
        ...state.systemKeybinds[id],
        ...patchFields,
      },
    },
  })
  schedulePersist()
}

export function createPathVariable(input?: Partial<Pick<PathVariable, 'name' | 'path'>>) {
  const variable: PathVariable = {
    id: uid('pv'),
    name: input?.name?.trim() ?? '',
    path: input?.path?.trim() ?? '',
  }
  patch({ pathVariables: [...state.pathVariables, variable] })
  schedulePersist()
  void pushPathVariablesToDaemon()
  return variable
}

export function updatePathVariable(
  id: string,
  partial: Partial<Pick<PathVariable, 'name' | 'path'>>,
) {
  patch({
    pathVariables: state.pathVariables.map((item) =>
      item.id === id
        ? {
            ...item,
            ...partial,
            name: partial.name !== undefined ? partial.name : item.name,
            path: partial.path !== undefined ? partial.path : item.path,
          }
        : item,
    ),
  })
  schedulePersist()
  void pushPathVariablesToDaemon()
}

export function deletePathVariable(id: string) {
  patch({
    pathVariables: state.pathVariables.filter((item) => item.id !== id),
  })
  schedulePersist()
  void pushPathVariablesToDaemon()
}

export function resetSystemKeybinds() {
  patch({ systemKeybinds: resolveSystemKeybinds() })
  schedulePersist()
}

export function runSystemKeybind(id: SystemKeybindId) {
  switch (id) {
    case 'open-dashboard':
      navigate('overview')
      break
    case 'open-settings':
      navigate('settings')
      break
    case 'open-review':
      navigate('review')
      break
    case 'open-automations':
      navigate('automations')
      break
    case 'open-logs':
      navigate('log')
      break
    case 'open-keybinds':
      navigate('keybinds')
      break
    case 'new-automation':
      newAutomation()
      break
    case 'toggle-sidebar':
      toggleSidebar()
      break
  }
}

export function setAutomationKeybind(
  id: string,
  keybind: string | null,
  keybindEnabled?: boolean,
) {
  const nextEnabled = keybindEnabled
  patch({
    automations: state.automations.map((a) =>
      a.id === id
        ? {
            ...a,
            keybind,
            keybindEnabled: nextEnabled ?? a.keybindEnabled,
          }
        : a,
    ),
  })
  void updateDaemonAutomation(id, {
    keybind,
    ...(nextEnabled !== undefined ? { keybindEnabled: nextEnabled } : {}),
  }).catch(() => {})
}

export function updateAutomation(id: string, patchFields: Partial<Automation>) {
  patch({
    automations: state.automations.map((a) =>
      a.id === id ? { ...a, ...patchFields } : a,
    ),
  })
}

export function showBlocking(blocking: BlockingPrompt) {
  patch({ blocking })
}

export function dismissBlocking() {
  patch({ blocking: null })
}

export function resolveBlocking(primary: boolean) {
  const blocking = state.blocking
  if (!blocking) return

  if (blocking.kind === 'daemon' && primary) {
    restartDaemon()
    return
  }

  if (blocking.kind === 'auth' && primary && blocking.connectorId) {
    reconnectConnector(blocking.connectorId)
    patch({ blocking: null })
    return
  }

  if (blocking.kind === 'ask' && blocking.pendingActionId) {
    if (primary) approvePending(blocking.pendingActionId)
    else rejectPending(blocking.pendingActionId)
    patch({ blocking: null })
    return
  }

  if (blocking.kind === 'action-failed' && primary) {
    patch({
      blocking: null,
      lastError: null,
      logs: [
        {
          id: uid('l'),
          at: new Date().toISOString(),
          automationName: 'Retry',
          summary: 'Retried failed action',
          action: 'Retry',
          connectorId: blocking.connectorId ?? 'fs',
          success: true,
          reversible: false,
        },
        ...state.logs,
      ],
    })
    return
  }

  if (blocking.kind === 'chrome-setup' && primary) {
    patch({ blocking: null })
    if (window.emmi?.enableChromeDebugging) {
      void window.emmi.enableChromeDebugging({ confirm: true }).then((res) => {
        if (res.ok) {
          navigate('connectors')
          return
        }
        if (!res.cancelled) {
          showBlocking({
            id: `chrome-setup-${Date.now()}`,
            kind: 'chrome-setup',
            title: 'Chrome debugging still off',
            body:
              res.error ||
              `Run: ${res.command ?? 'Google Chrome --remote-debugging-port=9222'}`,
            primaryLabel: 'Try again',
            secondaryLabel: 'Open Connectors',
            connectorId: 'chrome',
          })
        }
      })
      return
    }
    navigate('connectors')
    return
  }

  if (blocking.kind === 'chrome-setup' && !primary) {
    patch({ blocking: null })
    navigate('connectors')
    return
  }

  if (blocking.kind === 'safari-setup' && primary) {
    patch({ blocking: null })
    if (/open safari/i.test(blocking.primaryLabel ?? '')) {
      void openSafariApp()
        .then(() => navigate('connectors'))
        .catch(() => navigate('connectors'))
      return
    }
    navigate('connectors')
    return
  }

  if (blocking.kind === 'safari-setup' && !primary) {
    patch({ blocking: null })
    if (/open connectors/i.test(blocking.secondaryLabel ?? '')) {
      navigate('connectors')
    }
    return
  }

  if (blocking.kind === 'confirm' && primary && blocking.connectorId) {
    disconnectConnector(blocking.connectorId)
    patch({ blocking: null })
    return
  }

  if (blocking.kind === 'confirm' && primary && blocking.id.startsWith('reset-prefs')) {
    patch({ blocking: null })
    void resetPreferences()
    return
  }

  if (blocking.kind === 'confirm' && primary && blocking.id.startsWith('sign-out')) {
    patch({ blocking: null })
    signOutAccount()
    return
  }

  patch({ blocking: null })
}

export function confirmResetPreferences() {
  showBlocking({
    id: `reset-prefs-${Date.now()}`,
    kind: 'confirm',
    title: 'Reset preferences?',
    body: 'This clears saved Settings, Appearance, Account, Keybinds, and Path Variables on this Mac. Automations, rules, and logs are kept.',
    primaryLabel: 'Reset',
    secondaryLabel: 'Cancel',
  })
}

export function triggerAskFor(pendingId: string) {
  const item = state.pending.find((p) => p.id === pendingId)
  if (!item) return
  const planBit = item.plan?.length
    ? `\n\n${item.plan
        .slice(0, 6)
        .map((l, i) => `${i + 1}. ${l.trim()}`)
        .join('\n')}`
    : ''
  const trust = item.trustNote ? `\n\n${item.trustNote}` : ''
  showBlocking({
    id: uid('block'),
    kind: 'ask',
    title: item.grantKind ? 'Permission needed' : 'Needs your decision',
    body: `${item.action}${planBit}${trust}`,
    primaryLabel: item.grantKind ? 'Allow & continue' : 'Approve',
    secondaryLabel: 'Reject',
    pendingActionId: item.id,
    connectorId: item.connectorId,
  })
}

export function triggerAuthExpired(connectorId: string) {
  const connector = state.connectors.find((c) => c.id === connectorId)
  showBlocking({
    id: uid('block'),
    kind: 'auth',
    title: 'Connector needs re-auth',
    body: `${connector?.name ?? 'Connector'} auth expired. Reconnect to continue.`,
    primaryLabel: 'Reconnect',
    secondaryLabel: 'Later',
    connectorId,
  })
}

export function clearNotifications() {
  const ids = recentRuns(state, 50).map((r) => r.id)
  patch({ dismissedNotificationIds: [...new Set([...state.dismissedNotificationIds, ...ids])] })
}

export function dismissNotification(id: string) {
  if (state.dismissedNotificationIds.includes(id)) return
  patch({ dismissedNotificationIds: [...state.dismissedNotificationIds, id] })
}

export function approvePending(id: string) {
  const item = state.pending.find((p) => p.id === id)
  if (!item) return
  void (async () => {
    try {
      await approveDaemonPending(id)
      await syncFromDaemon()
    } catch {
      const automation = state.automations.find((a) => a.id === item.automationId)
      patch({ pending: state.pending.filter((p) => p.id !== id) })
      appendLog(
        automation?.name ?? item.title,
        `${item.title} — completed`,
        item.action,
        item.connectorId,
        true,
        true,
      )
    }
  })()
}

export function rejectPending(id: string) {
  const item = state.pending.find((p) => p.id === id)
  if (!item) return
  void (async () => {
    try {
      await rejectDaemonPending(id)
      await syncFromDaemon()
    } catch {
      patch({ pending: state.pending.filter((p) => p.id !== id) })
      appendLog(
        item.title,
        `Rejected: ${item.action}`,
        item.action,
        item.connectorId,
        true,
        false,
      )
    }
  })()
}

function appendLog(
  automationName: string,
  summary: string,
  action: string,
  connectorId: string,
  success: boolean,
  reversible: boolean,
  error?: string,
) {
  patch({
    logs: [
      {
        id: uid('l'),
        at: new Date().toISOString(),
        automationName,
        summary,
        action,
        connectorId,
        success,
        reversible,
        error,
      },
      ...state.logs,
    ],
  })
  if (
    !success &&
    connectorId === 'chrome' &&
    isChromeCdpSetupError(error ?? summary ?? '')
  ) {
    showChromeCdpSetupPrompt(error ?? summary)
  }
  if (
    !success &&
    connectorId === 'safari' &&
    isSafariJsSetupError(error ?? summary ?? '')
  ) {
    showSafariJsSetupPrompt(error ?? summary)
  }
}

export function approveAll(ids: string[]) {
  for (const id of [...ids]) approvePending(id)
}

export function rejectAll(ids: string[]) {
  for (const id of [...ids]) rejectPending(id)
}

export function updatePendingAction(id: string, editableAction: string) {
  patch({
    pending: state.pending.map((p) =>
      p.id === id ? { ...p, editableAction, action: editableAction } : p,
    ),
  })
  void updateDaemonPending(id, editableAction).catch(() => {
    /* offline — local only */
  })
}

export async function loadRuleCode(connectorId: string, ruleId: string) {
  const cached = getCachedRuleCode(connectorId, ruleId)
  if (cached) return { connectorId, id: ruleId, code: cached }

  const rule = await fetchRuleSource(connectorId, ruleId)
  setCachedRuleCode(connectorId, ruleId, rule.code)
  patchEphemeral({ ruleCodeEpoch: state.ruleCodeEpoch + 1 })
  return rule
}

export function createUserRule(input: {
  connectorId: string
  id?: string
  code: string
}) {
  void createConnectorRule(input.connectorId, {
    id: input.id,
    code: input.code,
  })
    .then(({ rule }) => {
      patch({ ruleLibrary: [rule, ...state.ruleLibrary] })
      return syncFromDaemon()
    })
    .catch(() => {
      /* offline */
    })
}

export function saveUserRule(
  connectorId: string,
  ruleId: string,
  code: string,
) {
  void updateConnectorRule(connectorId, ruleId, code)
    .then(() => syncFromDaemon())
    .catch(() => {
      /* offline */
    })
}

export function removeUserRule(connectorId: string, ruleId: string) {
  deleteCachedRuleCode(connectorId, ruleId)
  patch({
    ruleLibrary: state.ruleLibrary.filter(
      (r) => !(r.connectorId === connectorId && r.id === ruleId),
    ),
  })
  void deleteConnectorRule(connectorId, ruleId)
    .then(() => syncFromDaemon())
    .catch(() => {
      /* offline */
    })
}

async function ensureAutomationFolderAccess(
  automation: Automation,
): Promise<boolean> {
  const needsFs = automation.steps.some(
    (s) => (s.connectorId || 'fs') === 'fs',
  )
  if (!needsFs) return true

  const folders = foldersForAutomation(automation, state.pathVariables)
  if (!folders.length) return true

  if (!window.emmi?.ensureFolderAccess) return true

  const result = await window.emmi.ensureFolderAccess(folders)
  return Boolean(result?.ok)
}

function executeAutomationRun(id: string) {
  const automation = state.automations.find((a) => a.id === id)
  if (!automation) return
  void (async () => {
    const allowed = await ensureAutomationFolderAccess(automation)
    if (!allowed) {
      appendLog(
        automation.name,
        `${automation.name} — needs folder access`,
        'Grant access to Desktop, Documents, or other folders this automation uses',
        automation.steps[0]?.connectorId ?? 'fs',
        false,
        false,
        'folder access denied',
      )
      return
    }
    try {
      await runDaemonAutomation(id)
      await syncFromDaemon()
    } catch {
      patch({
        automations: state.automations.map((a) =>
          a.id === id ? { ...a, lastRunAt: new Date().toISOString() } : a,
        ),
      })
      appendLog(
        automation.name,
        `${automation.name} — failed: daemon offline`,
        `Could not reach daemon`,
        automation.steps[0]?.connectorId ?? 'fs',
        false,
        false,
        'daemon offline',
      )
      patch({ daemonStatus: 'stopped' })
    }
  })()
}

export function runAutomation(id: string) {
  executeAutomationRun(id)
}

export function updateAutomationSteps(id: string, steps: AutomationStep[]) {
  patch({
    automations: state.automations.map((a) => (a.id === id ? { ...a, steps } : a)),
  })
}

export function toggleAutomation(id: string) {
  const current = state.automations.find((a) => a.id === id)
  if (!current) return
  const active = !current.active
  patch({
    automations: state.automations.map((a) =>
      a.id === id ? { ...a, active } : a,
    ),
  })
  void updateDaemonAutomation(id, { active }).catch(() => {
    /* offline */
  })
}

function automationFromDaemon(automation: Automation): Automation {
  return {
    ...automation,
    description: automation.description?.trim() ?? '',
    triggerSummary:
      automation.triggerSummary ??
      automationTriggerSummary(automation.trigger, automation),
    defaultMode: normalizeRunMode(automation.defaultMode),
    steps: (automation.steps ?? []).map((s) => normalizeStep(s)),
  }
}

function automationTriggerSummary(
  trigger: AutomationTrigger,
  automation?: Pick<Automation, 'schedule' | 'watch'>,
): string {
  switch (trigger) {
    case 'manual':
      return 'manual (menu bar)'
    case 'keybind':
      return 'Keybind'
    case 'cli':
      return 'CLI command'
    case 'schedule': {
      const cron = automation?.schedule?.cron?.trim()
      return cron ? `Schedule · ${cron}` : 'Schedule'
    }
    case 'watch': {
      const paths = automation?.watch?.paths ?? []
      if (!paths.length) return 'Watch'
      if (paths.length === 1) return `Watch · ${paths[0]}`
      return `Watch · ${paths.length} folders`
    }
    default:
      return 'manual (menu bar)'
  }
}

export function saveAutomation(
  id: string,
  input: {
    name: string
    description?: string
    trigger: AutomationTrigger
    defaultMode: RunMode
    steps: AutomationStep[]
    keybind?: string | null
    keybindEnabled?: boolean
    active?: boolean
    schedule?: Automation['schedule'] | null
    watch?: Automation['watch'] | null
  },
): Promise<boolean> {
  const existing = state.automations.find((a) => a.id === id)
  if (!existing) return Promise.resolve(false)

  const payload = {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    trigger: input.trigger,
    defaultMode: input.defaultMode,
    steps: input.steps,
    keybind: input.keybind ?? null,
    keybindEnabled: input.keybindEnabled ?? existing.keybindEnabled,
    active: input.active ?? existing.active,
    schedule: input.trigger === 'schedule' ? input.schedule ?? null : null,
    watch: input.trigger === 'watch' ? input.watch ?? null : null,
  }

  return updateDaemonAutomation(id, payload)
    .then(({ automation }) => {
      const saved = automationFromDaemon(automation)
      if (saved.name.trim() !== payload.name.trim()) {
        throw new Error(
          `Name not saved (expected "${payload.name}", got "${saved.name}")`,
        )
      }
      if (saved.description?.trim() !== payload.description.trim()) {
        throw new Error(
          `Description not saved (expected "${payload.description}", got "${saved.description}")`,
        )
      }
      markAutomationSaved(saved)
      patch({
        automations: state.automations.map((a) => (a.id === id ? saved : a)),
        lastError: null,
      })
      return true
    })
    .catch((err) => {
      const detail = err instanceof Error ? err.message : 'unknown error'
      patch({
        lastError: `Could not save automation (${detail}). Data dir: ~/Library/Application Support/Emmi/automations/`,
      })
      return false
    })
}

export function createAutomation(input: {
  name: string
  description?: string
  trigger: AutomationTrigger
  defaultMode: RunMode
  steps: AutomationStep[]
  keybind?: string | null
  keybindEnabled?: boolean
  active?: boolean
  schedule?: Automation['schedule'] | null
  watch?: Automation['watch'] | null
}): Promise<boolean> {
  const localId = uid('auto')
  return createDaemonAutomation({
    id: localId,
    name: input.name.trim(),
    description: input.description?.trim() || 'Custom automation',
    trigger: input.trigger,
    defaultMode: input.defaultMode,
    steps: input.steps,
    keybind: input.keybind ?? null,
    keybindEnabled: input.keybindEnabled ?? true,
    schedule: input.trigger === 'schedule' ? input.schedule ?? null : null,
    watch: input.trigger === 'watch' ? input.watch ?? null : null,
    active: input.active ?? true,
  })
    .then(({ automation }) => {
      const saved = automationFromDaemon(automation)
      markAutomationSaved(saved)
      patch({
        automations: [saved, ...state.automations],
        lastError: null,
      })
      return true
    })
    .catch(() => {
      patch({ lastError: 'Could not create automation — is the daemon running?' })
      return false
    })
}

export function connectConnector(id: string) {
  if (id === 'fs') {
    finishConnectConnector('fs')
    return
  }
  const connector = state.connectors.find((c) => c.id === id)

  // OAuth2 packs: open browser authorize URL and poll until connected.
  if (connector?.auth?.type === 'oauth2') {
    void startConnectorAuth(id)
      .then(({ url }) => {
        window.emmi?.openExternal?.(url)
        return pollOAuthConnect(id)
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : 'Could not start account connect'
        patch({ lastError: message })
        showBlocking({
          id: `auth-fail-${id}`,
          kind: 'auth',
          title: `Connect ${connector.name}`,
          body: message,
          primaryLabel: 'OK',
          connectorId: id,
        })
      })
    return
  }

  const needsGrant =
    id === 'shell' ||
    id === 'git' ||
    id === 'safari' ||
    id === 'chrome' ||
    connector?.permission?.grant === true
  if (needsGrant) {
    void saveConnectorPermissions(id, { status: 'granted' })
      .then(() => finishConnectConnector(id))
      .catch(() => finishConnectConnector(id))
    return
  }
  finishConnectConnector(id)
}

async function pollOAuthConnect(id: string) {
  const deadline = Date.now() + 3 * 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => window.setTimeout(r, 1500))
    try {
      const status = await fetchConnectorAuthStatus(id)
      if (status.status === 'connected') {
        patch({
          connectors: state.connectors.map((c) =>
            c.id === id
              ? {
                  ...c,
                  authStatus: 'connected',
                  accountLabel: status.accountLabel ?? c.accountLabel,
                }
              : c,
          ),
        })
        finishConnectConnector(id)
        return
      }
      if (status.status === 'error' || status.status === 'missing-client') {
        throw new Error(status.error ?? 'Account connect failed')
      }
    } catch (err) {
      if (err instanceof Error && /clientId|failed|expired OAuth/i.test(err.message)) {
        throw err
      }
    }
  }
  throw new Error('Timed out waiting for account connect. Try again.')
}

async function ensureFilesystemConnected() {
  const fs = state.connectors.find((c) => c.id === 'fs')
  if (fs?.authStatus === 'connected') return

  const folders = foldersForFilesystemConnect(state.pathVariables)
  if (window.emmi?.checkFolderAccess) {
    const result = await window.emmi.checkFolderAccess(folders)
    if (result?.ok) {
      finishConnectConnector('fs', { silent: true })
      return
    }
  }

  finishConnectConnector('fs', { silent: true })
}

function finishConnectConnector(id: string, opts?: { silent?: boolean }) {
  const name = state.connectors.find((c) => c.id === id)?.name ?? id
  patch({
    connectors: state.connectors.map((c) =>
      c.id === id ? { ...c, authStatus: 'connected' } : c,
    ),
    firstRunDismissed: true,
    lastError: state.lastError?.toLowerCase().includes('auth')
      ? null
      : state.lastError,
  })
  if (!opts?.silent) {
    appendLog(name, `Connected ${name}`, 'Connect', id, true, false)
  }
}

export function disconnectConnector(id: string) {
  const connector = state.connectors.find((c) => c.id === id)
  if (connector?.auth?.type === 'oauth2') {
    void disconnectConnectorAuth(id).catch(() => {})
  }
  const hadGrant =
    id === 'shell' ||
    id === 'git' ||
    id === 'safari' ||
    id === 'chrome' ||
    connector?.permission?.grant === true
  if (hadGrant && connector?.auth?.type !== 'oauth2') {
    void saveConnectorPermissions(id, { status: 'ask' }).catch(() => {})
  }
  patch({
    connectors: state.connectors.map((c) =>
      c.id === id
        ? { ...c, authStatus: 'available', accountLabel: undefined }
        : c,
    ),
  })
}

export function reconnectConnector(id: string) {
  connectConnector(id)
}

export function undoLog(id: string) {
  const entry = state.logs.find((l) => l.id === id)
  if (!entry || !entry.reversible || entry.undone) return
  void undoDaemonLog(id)
    .then(() => syncFromDaemon())
    .catch(() => {
      appendLog(
        entry.automationName,
        `Undo failed: ${entry.action}`,
        entry.action,
        entry.connectorId,
        false,
        false,
        'Could not undo — file moves may no longer be available',
      )
    })
}

export function retryLog(id: string) {
  const entry = state.logs.find((l) => l.id === id)
  if (!entry || entry.success) return
  if (entry.error?.includes('auth') && entry.connectorId) {
    triggerAuthExpired(entry.connectorId)
    return
  }
  if (isChromeCdpSetupError(entry.error ?? entry.summary ?? '')) {
    showChromeCdpSetupPrompt(entry.error ?? entry.summary)
    return
  }
  if (isSafariJsSetupError(entry.error ?? entry.summary ?? '')) {
    showSafariJsSetupPrompt(entry.error ?? entry.summary)
    return
  }
  appendLog(
    entry.automationName,
    `${entry.automationName} — retried`,
    entry.action,
    entry.connectorId,
    true,
    entry.reversible,
  )
}

export function isChromeCdpSetupError(text: string) {
  return (
    /\[cdp_unavailable\]|\[cdp_no_pages\]/i.test(text) ||
    /Chrome remote debugging is off/i.test(text) ||
    /Enable remote debugging/i.test(text)
  )
}

export function showChromeCdpSetupPrompt(detail?: string) {
  showBlocking({
    id: `chrome-setup-${Date.now()}`,
    kind: 'chrome-setup',
    title: 'Chrome remote debugging required',
    body:
      detail?.replace(/^\[cdp_(?:unavailable|no_pages)\]\s*/i, '') ||
      'Page actions need Chrome remote debugging. Click Enable to relaunch Chrome with debugging on port 9222.',
    primaryLabel: 'Enable remote debugging',
    secondaryLabel: 'Open Connectors',
    connectorId: 'chrome',
  })
}

export function isSafariJsSetupError(text: string) {
  return (
    /\[safari_js_disabled\]/i.test(text) ||
    /Allow JavaScript from Apple Events/i.test(text) ||
    /JavaScript from Apple Events/i.test(text)
  )
}

export function showSafariJsSetupPrompt(detail?: string) {
  showBlocking({
    id: `safari-setup-${Date.now()}`,
    kind: 'safari-setup',
    title: 'Safari JavaScript from Apple Events required',
    body:
      detail?.replace(/^\[safari_js_disabled\]\s*/i, '') ||
      'Page actions need Develop → Allow JavaScript from Apple Events. Open Connectors → Safari for setup help.',
    primaryLabel: 'Open Connectors',
    secondaryLabel: 'Dismiss',
    connectorId: 'safari',
  })
}

export function getPending(id: string): PendingAction | undefined {
  return state.pending.find((p) => p.id === id)
}

export function getLog(id: string) {
  return state.logs.find((l) => l.id === id)
}
