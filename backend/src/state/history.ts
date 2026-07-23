import fs from 'node:fs'
import path from 'node:path'
import { emmiRoot } from '../paths.js'
import type { LogEntry } from '../types.js'

const MAX_HISTORY = 2000

function historyDir() {
  return path.join(emmiRoot(), 'history')
}

function historyPath() {
  return path.join(historyDir(), 'logs.jsonl')
}

/** True for per-file step spam we never want in history. */
export function isStepNoiseLog(entry: Pick<LogEntry, 'action' | 'summary'>) {
  const action = String(entry.action ?? '').trim()
  const summary = String(entry.summary ?? '').trim()
  if (/^fs\.(move|copy|rename|delete|mkdir)$/i.test(action)) return true
  // Bare rule category (e.g. log(..., 'fs')) — run summary already covers the run
  if (action === 'fs' || action === 'automation') return true
  if (/^(Moved|Copied|Renamed|Deleted|Created directory)\b/i.test(summary)) {
    return true
  }
  return false
}

/** Write cleaned history (creates or rewrites to drop noise). */
export function writeHistoryLogs(entries: LogEntry[]) {
  const keep = entries.filter((e) => e?.id && !isStepNoiseLog(e))
  fs.mkdirSync(historyDir(), { recursive: true })
  const file = historyPath()
  if (!keep.length) {
    if (fs.existsSync(file)) fs.writeFileSync(file, '')
    return
  }
  // File is oldest→newest; in-memory list is newest→oldest.
  const lines = [...keep].reverse().map((e) => JSON.stringify(e))
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${lines.join('\n')}\n`)
  fs.renameSync(tmp, file)
}

/** Seed history file once from cleaned in-memory logs. */
export function seedHistoryIfEmpty(entries: LogEntry[]) {
  if (fs.existsSync(historyPath())) return
  writeHistoryLogs(entries)
}

/** Load persisted run history (newest first). */
export function loadHistoryLogs(): LogEntry[] {
  const file = historyPath()
  if (!fs.existsSync(file)) return []
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    const out: LogEntry[] = []
    for (let i = lines.length - 1; i >= 0 && out.length < MAX_HISTORY; i -= 1) {
      try {
        const entry = JSON.parse(lines[i]!) as LogEntry
        if (!entry?.id || isStepNoiseLog(entry)) continue
        out.push(entry)
      } catch {
        /* skip bad line */
      }
    }
    return out
  } catch {
    return []
  }
}

/** Append one history row and keep the on-disk file bounded. */
export function appendHistoryLog(entry: LogEntry) {
  if (isStepNoiseLog(entry)) return
  fs.mkdirSync(historyDir(), { recursive: true })
  const file = historyPath()
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`)
  trimHistoryFile(file)
}

function trimHistoryFile(file: string) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    if (lines.length <= MAX_HISTORY) return
    const kept = lines.slice(lines.length - MAX_HISTORY)
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, `${kept.join('\n')}\n`)
    fs.renameSync(tmp, file)
  } catch {
    /* ignore trim failures */
  }
}

export function historyLimit() {
  return MAX_HISTORY
}

/** Drop history rows older than `days` (0 = no-op). */
export function clearHistoryOlderThanDays(days: number) {
  if (!days || days < 1) return
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const entries = loadHistoryLogs().filter((entry) => {
    const t = Date.parse(entry.at)
    return Number.isNaN(t) || t >= cutoff
  })
  writeHistoryLogs(entries)
}
