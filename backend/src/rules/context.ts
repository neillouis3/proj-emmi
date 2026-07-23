import { toTildePath } from '../paths.js'
import { addLog } from '../state/store.js'
import type { MoveRecord } from '../types.js'

export type RuleRunContext = {
  runId?: string
  automationName?: string
  connectorId?: string
  dryRun?: boolean
}

let current: RuleRunContext = {}
const movesByRun = new Map<string, MoveRecord[]>()

export function setRuleRunContext(ctx: RuleRunContext) {
  current = { ...ctx }
}

export function clearRuleRunContext() {
  current = {}
}

export function getRuleRunContext() {
  return current
}

export function recordMove(from: string, to: string) {
  const runId = current.runId
  if (!runId || current.dryRun) return
  const fromPath = String(from)
  const toPath = String(to)
  if (!fromPath || !toPath || fromPath === toPath) return
  const list = movesByRun.get(runId) ?? []
  list.push({ from: toTildePath(fromPath), to: toTildePath(toPath) })
  movesByRun.set(runId, list)
}

export function takeMoves(runId: string): MoveRecord[] {
  const moves = movesByRun.get(runId) ?? []
  movesByRun.delete(runId)
  return moves
}

/** Install global hooks used by rule code files. */
export function installRuleLogHook() {
  globalThis.__emmiLog = (message: string, category: string) => {
    // During a run the runner writes one summary log (e.g. "Ran script · 54 file(s)").
    // Skip per-file fs.move / fs.copy / log() noise so the history stays one row.
    if (current.runId) return
    addLog({
      automationName: current.automationName ?? 'Rule',
      summary: message,
      action: category,
      connectorId: current.connectorId ?? 'fs',
      success: true,
      reversible: false,
      runId: current.runId,
    })
  }
  globalThis.__emmiRecordMove = (from: string, to: string) => {
    recordMove(from, to)
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __emmiLog: ((message: string, category: string) => void) | undefined
  // eslint-disable-next-line no-var
  var __emmiRecordMove: ((from: string, to: string) => void) | undefined
}
