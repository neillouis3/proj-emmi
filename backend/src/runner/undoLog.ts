import fs from 'node:fs'
import path from 'node:path'
import { assertUnderHome, expandPath } from '../paths.js'
import { emitEvent } from '../events.js'
import { addLog, getDaemonState, markLogUndone } from '../state/store.js'
import type { MoveRecord } from '../types.js'

function restorePath(from: string, to: string) {
  const src = assertUnderHome(expandPath(from))
  let dest = assertUnderHome(expandPath(to))
  if (!fs.existsSync(src)) {
    throw new Error(`Missing ${path.basename(src)} at ${from}`)
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest)) {
    const ext = path.extname(dest)
    const stem = path.basename(dest, ext)
    let candidate = dest
    let i = 1
    while (fs.existsSync(candidate)) {
      candidate = path.join(path.dirname(dest), `${stem}-restored-${i}${ext}`)
      i += 1
    }
    dest = candidate
  }
  fs.renameSync(src, dest)
  return dest
}

export function undoLogEntry(logId: string) {
  const entry = getDaemonState().logs.find((l) => l.id === logId)
  if (!entry) throw new Error('Log entry not found')
  if (entry.undone) throw new Error('Already undone')
  if (!entry.reversible) throw new Error('This action cannot be undone')

  const moves = entry.moves ?? []
  if (!moves.length) {
    throw new Error('No file moves recorded for this action')
  }

  const restored: MoveRecord[] = []
  for (const move of moves) {
    const dest = restorePath(move.to, move.from)
    restored.push({ from: move.to, to: dest })
  }

  markLogUndone(logId)
  addLog({
    automationName: entry.automationName,
    summary: `Undid ${restored.length} file move${restored.length === 1 ? '' : 's'}`,
    action: `Undo: ${entry.action}`,
    connectorId: entry.connectorId,
    success: true,
    reversible: false,
  })
  emitEvent('log:undone', { logId, count: restored.length })
  return { logId, restored: restored.length }
}
