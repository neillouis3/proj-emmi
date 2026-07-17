import { createInitialState } from '@/data/mock'
import type {
  AppState,
  Automation,
  AutomationStep,
  AutomationTrigger,
  BlockingPrompt,
  DaemonStatus,
  LlmConfig,
  NotificationPrefs,
  GeneralPrefs,
  OtherPrefs,
  PendingAction,
  RecentRun,
  Rule,
  RuleMode,
  ScreenId,
} from '@/types/domain'

const STORAGE_KEY = 'emmi.app-state.v2'
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('emmi-state') : null

type Listener = (state: AppState) => void

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = createInitialState()
    const connectors = (parsed.connectors ?? base.connectors).map((connector) => {
      const fallback = base.connectors.find((c) => c.id === connector.id)
      return {
        ...fallback,
        ...connector,
        kind: connector.kind ?? fallback?.kind ?? 'Local',
        popular: connector.popular ?? fallback?.popular ?? false,
      }
    })
    return {
      ...base,
      ...parsed,
      general: { ...base.general, ...parsed.general },
      notifications: { ...base.notifications, ...parsed.notifications },
      other: { ...base.other, ...parsed.other },
      llm: { ...base.llm, ...parsed.llm },
      connectors,
    }
  } catch {
    return createInitialState()
  }
}

let state = loadState()
const listeners = new Set<Listener>()
let applyingRemote = false

function emit() {
  for (const listener of listeners) listener(state)
  syncTrayMenu()
}

function persist() {
  if (applyingRemote) return
  // Perf: defer disk/IPC-ish work until the renderer is idle.
  const write = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    channel?.postMessage({ type: 'sync' })
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(write, { timeout: 500 })
  } else {
    setTimeout(write, 0)
  }
}

function patch(partial: Partial<AppState>) {
  state = { ...state, ...partial }
  persist()
  emit()
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

channel?.addEventListener('message', () => {
  applyingRemote = true
  state = loadState()
  applyingRemote = false
  emit()
})

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

export function recentRuns(snapshot: AppState = state, limit = 5): RecentRun[] {
  const runs: RecentRun[] = []

  for (const item of snapshot.pending) {
    if (snapshot.dismissedNotificationIds.includes(`pending:${item.id}`)) continue
    runs.push({
      id: `pending:${item.id}`,
      kind: 'pending',
      title: item.title,
      detail: `${item.title} — pending review`,
      at: item.createdAt,
      pendingId: item.id,
      connectorId: item.connectorId,
    })
  }

  for (const entry of snapshot.logs) {
    if (snapshot.dismissedNotificationIds.includes(`log:${entry.id}`)) continue
    runs.push({
      id: `log:${entry.id}`,
      kind: entry.success ? 'completed' : 'failed',
      title: entry.automationName,
      detail: entry.summary,
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
    label:
      run.kind === 'pending' ? `${run.title} — pending review` : run.detail,
    pendingId: run.pendingId,
    logId: run.logId,
  }))
  const moreCount = Math.max(0, recentRuns(state, 50).length - runs.length)
  window.emmi?.syncTrayMenu?.({ runs, moreCount })
}

export function pushTraySync() {
  syncTrayMenu()
}

export function counts(snapshot: AppState = state) {
  return {
    pending: snapshot.pending.length,
    automationsActive: snapshot.automations.filter((a) => a.active).length,
    connectorsConnected: snapshot.connectors.filter((c) => c.authStatus === 'connected')
      .length,
    connectorsNeedAuth: snapshot.connectors.filter((c) => c.authStatus === 'expired')
      .length,
  }
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

export function restartDaemon() {
  patch({ daemonStatus: 'running', lastError: null, blocking: null })
}

export function setDefaultRuleMode(defaultRuleMode: 'review' | 'ask') {
  patch({ defaultRuleMode })
}

export function setLlm(llm: Partial<LlmConfig>) {
  patch({ llm: { ...state.llm, ...llm } })
}

export function setGeneralPrefs(general: Partial<GeneralPrefs>) {
  patch({ general: { ...state.general, ...general } })
}

export function setNotificationPrefs(notifications: Partial<NotificationPrefs>) {
  patch({ notifications: { ...state.notifications, ...notifications } })
}

export function setOtherPrefs(other: Partial<OtherPrefs>) {
  patch({ other: { ...state.other, ...other } })
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

  patch({ blocking: null })
}

export function triggerAskFor(pendingId: string) {
  const item = state.pending.find((p) => p.id === pendingId)
  if (!item) return
  showBlocking({
    id: uid('block'),
    kind: 'ask',
    title: 'Needs your decision',
    body: `${item.trigger}\n\nProposed: ${item.action}\n\nNo safe default — confirm or reject before continuing.`,
    primaryLabel: 'Approve',
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

function maybePromote(ruleId?: string) {
  if (!ruleId) return
  const rule = state.rules.find((r) => r.id === ruleId)
  if (!rule || rule.neverPromote || rule.mode === 'auto') return
  const approvalCount = rule.approvalCount + 1
  const rules = state.rules.map((r) =>
    r.id === ruleId
      ? { ...r, approvalCount, promoteSuggested: approvalCount >= 5 }
      : r,
  )
  const promote =
    approvalCount >= 5 && !rule.neverPromote
      ? { ruleId, approvalCount }
      : state.promote
  patch({ rules, promote })
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
}

export function approvePending(id: string) {
  const item = state.pending.find((p) => p.id === id)
  if (!item) return
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
  maybePromote(item.sourceRuleId)
}

export function rejectPending(id: string, dontSuggestAgain = false) {
  const item = state.pending.find((p) => p.id === id)
  if (!item) return
  patch({ pending: state.pending.filter((p) => p.id !== id) })
  if (dontSuggestAgain && item.sourceRuleId) {
    updateRule(item.sourceRuleId, { neverPromote: true, mode: 'review' })
  }
  appendLog(
    item.title,
    `Rejected: ${item.action}`,
    item.action,
    item.connectorId,
    true,
    false,
  )
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
}

export function alwaysDoThis(pendingId: string) {
  const item = state.pending.find((p) => p.id === pendingId)
  if (!item) return

  let ruleId = item.sourceRuleId
  if (ruleId) {
    patch({
      rules: state.rules.map((r) =>
        r.id === ruleId ? { ...r, mode: 'auto' as RuleMode, promoteSuggested: false } : r,
      ),
    })
  } else {
    ruleId = uid('r')
    const rule: Rule = {
      id: ruleId,
      trigger: item.trigger,
      match: item.title,
      action: item.action,
      mode: 'auto',
      connectorId: item.connectorId,
      origin: 'learned',
      approvalCount: 1,
      promoteSuggested: false,
    }
    patch({ rules: [rule, ...state.rules] })
  }

  approvePending(pendingId)
}

export function updateRule(id: string, partial: Partial<Rule>) {
  patch({
    rules: state.rules.map((r) => (r.id === id ? { ...r, ...partial } : r)),
  })
}

export function createRule(
  input: Omit<Rule, 'id' | 'approvalCount' | 'promoteSuggested' | 'origin'> & {
    origin?: Rule['origin']
  },
) {
  const rule: Rule = {
    id: uid('r'),
    approvalCount: 0,
    promoteSuggested: false,
    origin: input.origin ?? 'user',
    ...input,
  }
  patch({ rules: [rule, ...state.rules] })
}

export function promoteRule(ruleId: string) {
  patch({
    rules: state.rules.map((r) =>
      r.id === ruleId ? { ...r, mode: 'auto', promoteSuggested: false } : r,
    ),
    promote: null,
  })
}

export function dismissPromote(never = false) {
  const promote = state.promote
  if (!promote) return
  if (never) {
    patch({
      rules: state.rules.map((r) =>
        r.id === promote.ruleId
          ? { ...r, neverPromote: true, promoteSuggested: false }
          : r,
      ),
      promote: null,
    })
    return
  }
  patch({ promote: null })
}

export function runAutomation(id: string) {
  const automation = state.automations.find((a) => a.id === id)
  if (!automation) return
  patch({
    automations: state.automations.map((a) =>
      a.id === id ? { ...a, lastRunAt: new Date().toISOString() } : a,
    ),
  })
  appendLog(
    automation.name,
    `${automation.name} — completed`,
    `Ran ${automation.steps.length} steps`,
    automation.steps[0]?.connectorId ?? 'fs',
    true,
    true,
  )
}

export function updateAutomationSteps(id: string, steps: AutomationStep[]) {
  patch({
    automations: state.automations.map((a) => (a.id === id ? { ...a, steps } : a)),
  })
}

export function toggleAutomation(id: string) {
  patch({
    automations: state.automations.map((a) =>
      a.id === id ? { ...a, active: !a.active } : a,
    ),
  })
}

export function createAutomation(input: {
  name: string
  trigger: AutomationTrigger
  defaultMode: 'review' | 'ask'
  steps: AutomationStep[]
}) {
  const automation: Automation = {
    id: uid('auto'),
    name: input.name,
    description: 'Custom automation',
    active: true,
    trigger: input.trigger,
    triggerSummary:
      input.trigger === 'manual'
        ? 'manual (menu bar)'
        : input.trigger === 'git-hook'
          ? 'Git hook'
          : 'CLI command',
    defaultMode: input.defaultMode,
    steps: input.steps,
    lastRunAt: undefined,
  }
  patch({ automations: [automation, ...state.automations] })
  return automation.id
}

export function connectConnector(id: string) {
  const name = state.connectors.find((c) => c.id === id)?.name ?? id
  patch({
    connectors: state.connectors.map((c) =>
      c.id === id ? { ...c, authStatus: 'connected' } : c,
    ),
    firstRunDismissed: true,
    lastError: state.lastError?.toLowerCase().includes('auth') ? null : state.lastError,
  })
  appendLog(name, `Connected ${name}`, 'Connect', id, true, false)
}

export function disconnectConnector(id: string) {
  patch({
    connectors: state.connectors.map((c) =>
      c.id === id ? { ...c, authStatus: 'available' } : c,
    ),
  })
}

export function reconnectConnector(id: string) {
  connectConnector(id)
}

export function undoLog(id: string) {
  const entry = state.logs.find((l) => l.id === id)
  if (!entry || !entry.reversible || entry.undone) return
  patch({
    logs: state.logs.map((l) => (l.id === id ? { ...l, undone: true } : l)),
  })
  appendLog(
    entry.automationName,
    `Undid: ${entry.action}`,
    `Undo ${entry.action}`,
    entry.connectorId,
    true,
    false,
  )
}

export function retryLog(id: string) {
  const entry = state.logs.find((l) => l.id === id)
  if (!entry || entry.success) return
  if (entry.error?.includes('auth') && entry.connectorId) {
    triggerAuthExpired(entry.connectorId)
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

export function seedTemplateRule() {
  createRule({
    trigger: 'File created in ~/Desktop',
    match: 'ext == pdf',
    action: 'Move → ~/Documents/Inbox',
    mode: 'review',
    connectorId: 'fs',
    origin: 'user',
  })
  navigate('overview')
}

export function getPending(id: string): PendingAction | undefined {
  return state.pending.find((p) => p.id === id)
}

export function getLog(id: string) {
  return state.logs.find((l) => l.id === id)
}
