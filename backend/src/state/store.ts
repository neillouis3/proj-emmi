import fs from 'node:fs'
import path from 'node:path'
import { statePath } from '../paths.js'
import type { DaemonState, LogEntry, PendingAction, RunRecord } from '../types.js'
import {
  appendHistoryLog,
  historyLimit,
  isStepNoiseLog,
  loadHistoryLogs,
  writeHistoryLogs,
} from './history.js'

const emptyState = (): DaemonState => ({
  pending: [],
  logs: [],
  runs: [],
  lastRunAtByAutomation: {},
})

let state: DaemonState = emptyState()

export function getDaemonState() {
  return state
}

export function loadState() {
  try {
    if (!fs.existsSync(statePath())) {
      state = emptyState()
    } else {
      const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as Partial<DaemonState>
      state = {
        pending: Array.isArray(raw.pending) ? raw.pending : [],
        logs: Array.isArray(raw.logs) ? raw.logs : [],
        runs: Array.isArray(raw.runs) ? raw.runs : [],
        lastRunAtByAutomation: raw.lastRunAtByAutomation ?? {},
      }
    }
  } catch {
    state = emptyState()
  }

  // Prefer durable history file; fall back to state.json logs.
  const fromHistory = loadHistoryLogs()
  const fromState = (state.logs ?? []).filter((l) => !isStepNoiseLog(l))
  state.logs = mergeLogs(fromHistory, fromState).slice(0, historyLimit())
  // Rewrite history so old "fs" / fs.move rows are purged from disk too.
  writeHistoryLogs(state.logs)

  // Drop noise from state.json so restarts stay clean.
  persist()
  return state
}

function mergeLogs(a: LogEntry[], b: LogEntry[]) {
  const byId = new Map<string, LogEntry>()
  for (const entry of [...a, ...b]) {
    if (!entry?.id || isStepNoiseLog(entry)) continue
    const prev = byId.get(entry.id)
    if (!prev) {
      byId.set(entry.id, entry)
      continue
    }
    // Keep undone / richer moves if either copy has them.
    byId.set(entry.id, {
      ...prev,
      ...entry,
      undone: Boolean(prev.undone || entry.undone),
      moves: entry.moves?.length ? entry.moves : prev.moves,
    })
  }
  return [...byId.values()].sort((x, y) => +new Date(y.at) - +new Date(x.at))
}

export function persist() {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true })
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2))
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function addPending(item: PendingAction) {
  state.pending = [item, ...state.pending]
  persist()
  return item
}

export function removePending(id: string) {
  const item = state.pending.find((p) => p.id === id)
  state.pending = state.pending.filter((p) => p.id !== id)
  persist()
  return item
}

export function getPending(id: string) {
  return state.pending.find((p) => p.id === id)
}

export function addLog(entry: Omit<LogEntry, 'id' | 'at'> & { id?: string; at?: string }) {
  if (isStepNoiseLog(entry)) return null

  const full: LogEntry = {
    id: entry.id ?? uid('l'),
    at: entry.at ?? new Date().toISOString(),
    automationName: entry.automationName,
    summary: entry.summary,
    action: entry.action,
    connectorId: entry.connectorId,
    success: entry.success,
    reversible: entry.reversible,
    error: entry.error,
    undone: entry.undone,
    runId: entry.runId,
    moves: entry.moves,
  }
  state.logs = [full, ...state.logs.filter((l) => l.id !== full.id)].slice(
    0,
    historyLimit(),
  )
  appendHistoryLog(full)
  persist()
  return full
}

export function markLogUndone(id: string) {
  const idx = state.logs.findIndex((l) => l.id === id)
  if (idx < 0) return null
  state.logs[idx] = { ...state.logs[idx], undone: true }
  appendHistoryLog(state.logs[idx])
  persist()
  return state.logs[idx]
}

export function upsertRun(run: RunRecord) {
  const idx = state.runs.findIndex((r) => r.id === run.id)
  if (idx >= 0) state.runs[idx] = run
  else state.runs = [run, ...state.runs].slice(0, 100)
  if (run.finishedAt && (run.status === 'completed' || run.status === 'pending')) {
    state.lastRunAtByAutomation[run.automationId] = run.finishedAt
  }
  persist()
  return run
}

export function getRun(id: string) {
  return state.runs.find((r) => r.id === id)
}
