import path from 'node:path'
import { assertUnderHome, expandPath } from '../paths.js'
import type { ToolDef, ToolResult } from '../types.js'

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

type TableRow = { keys: string[]; value: string }

function parseTable(value: unknown): TableRow[] {
  if (!value) return []
  if (Array.isArray(value)) {
    const rows: TableRow[] = []
    for (const item of value) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const rawKey = asString(row.key ?? row.match)
      const dest = asString(row.value ?? row.dest)
      if (!rawKey || !dest) continue
      const keys = rawKey
        .split(/[,;\s]+/)
        .map((s) => s.trim().replace(/^\./, '').toLowerCase())
        .filter(Boolean)
      if (keys.length) rows.push({ keys, value: dest })
    }
    return rows
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({
      keys: [k.replace(/^\./, '').toLowerCase()],
      value: String(v),
    }))
  }
  return []
}

function extractField(filePath: string, field: string) {
  const base = path.basename(filePath)
  switch (field) {
    case 'extension':
      return path.extname(base).replace(/^\./, '').toLowerCase()
    case 'name':
      return base
    case 'stem':
      return path.basename(base, path.extname(base))
    case 'path':
      return filePath
    default:
      return ''
  }
}

export function registerCoreTools(register: (def: ToolDef) => void) {
  register({
    id: 'core.extract',
    description: 'Extract a field from each matched file',
    params: { field: 'extension | name | stem | path' },
    async run(params, ctx): Promise<ToolResult> {
      const field = asString(params.field, 'extension') || 'extension'
      const extracted: Record<string, string> = {}
      for (const file of ctx.matchedFiles) {
        extracted[file] = extractField(file, field)
      }
      ctx.extracted = extracted
      ctx.lastOutput = Object.values(extracted)
      return {
        ok: true,
        summary: `Extracted ${field} from ${ctx.matchedFiles.length} file${
          ctx.matchedFiles.length === 1 ? '' : 's'
        }`,
        artifacts: { count: ctx.matchedFiles.length },
      }
    },
  })

  register({
    id: 'core.lookup',
    description: 'Look up values in a table (routing is just parameters)',
    params: {
      from: 'extracted | prev',
      table: '{ key, value }[] | Record',
      fallback: 'string?',
    },
    async run(params, ctx): Promise<ToolResult> {
      const from = asString(params.from, 'extracted') || 'extracted'
      const table = parseTable(params.table)
      const fallback = asString(params.fallback)
      if (!table.length && !fallback) {
        return { ok: false, summary: 'lookup requires table or fallback' }
      }

      const destinations: Record<string, string> = {}
      let mapped = 0

      if (from === 'extracted' || (from !== 'prev' && ctx.extracted)) {
        const source = ctx.extracted ?? {}
        for (const file of ctx.matchedFiles) {
          const key = (source[file] ?? '').toLowerCase()
          let dest = fallback
          for (const row of table) {
            if (row.keys.includes(key)) {
              dest = row.value
              break
            }
          }
          if (!dest) continue
          destinations[file] = assertUnderHome(expandPath(dest, ctx.variables))
          mapped += 1
        }
        ctx.fileDestinations = destinations
        ctx.lastOutput = destinations
      } else {
        const prev = ctx.lastOutput
        const key = Array.isArray(prev)
          ? String(prev[0] ?? '')
          : typeof prev === 'string'
            ? prev
            : ''
        let dest = fallback
        const needle = key.replace(/^\./, '').toLowerCase()
        for (const row of table) {
          if (row.keys.includes(needle)) {
            dest = row.value
            break
          }
        }
        if (!dest) {
          return { ok: false, summary: 'lookup: no match and no fallback' }
        }
        const abs = assertUnderHome(expandPath(dest, ctx.variables))
        ctx.lastOutput = abs
        // If we still have matched files, apply one dest to all
        if (ctx.matchedFiles.length) {
          const all: Record<string, string> = {}
          for (const file of ctx.matchedFiles) all[file] = abs
          ctx.fileDestinations = all
          mapped = ctx.matchedFiles.length
        }
      }

      return {
        ok: true,
        summary: `lookup → ${mapped} value${mapped === 1 ? '' : 's'}`,
        artifacts: { count: mapped, routed: mapped },
      }
    },
  })
}
