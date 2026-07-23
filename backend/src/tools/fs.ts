import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { assertUnderHome, expandPath } from '../paths.js'
import { recordMove } from '../rules/context.js'
import type { ToolDef, ToolResult } from '../types.js'

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function matchGlobPart(name: string, pattern: string) {
  // Support * and ? only in the final path segment
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i').test(name)
}

async function collectMatches(
  absGlob: string,
  contains: string,
  extensions: string[],
): Promise<string[]> {
  const hasWildcard = /[*?]/.test(absGlob)
  const baseDir = hasWildcard ? path.dirname(absGlob) : absGlob
  const filePattern = hasWildcard ? path.basename(absGlob) : '*'

  const root = assertUnderHome(baseDir)
  if (!fsSync.existsSync(root)) return []

  const stat = await fs.stat(root)
  if (!stat.isDirectory()) {
    return filterFile(root, contains, extensions) ? [root] : []
  }

  const entries = await fs.readdir(root, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!matchGlobPart(entry.name, filePattern)) continue
    const full = path.join(root, entry.name)
    if (filterFile(full, contains, extensions)) out.push(full)
  }
  return out.sort()
}

function filterFile(filePath: string, contains: string, extensions: string[]) {
  const base = path.basename(filePath)
  if (contains && !base.toLowerCase().includes(contains.toLowerCase())) {
    return false
  }
  if (extensions.length) {
    const ext = path.extname(base).replace(/^\./, '').toLowerCase()
    if (!extensions.map((e) => e.toLowerCase().replace(/^\./, '')).includes(ext)) {
      return false
    }
  }
  return true
}

async function uniqueDest(destDir: string, fileName: string) {
  let candidate = path.join(destDir, fileName)
  if (!fsSync.existsSync(candidate)) return candidate
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)
  let i = 1
  while (fsSync.existsSync(candidate)) {
    candidate = path.join(destDir, `${stem}-${i}${ext}`)
    i += 1
  }
  return candidate
}

export function registerFsTools(register: (def: ToolDef) => void) {
  register({
    id: 'fs.match',
    description: 'Match files by glob, name contains, and extensions',
    params: {
      glob: 'string',
      contains: 'string?',
      extensions: 'string[]?',
    },
    async run(params, ctx): Promise<ToolResult> {
      const glob = asString(params.glob)
      if (!glob) return { ok: false, summary: 'fs.match requires glob' }
      const contains = asString(params.contains)
      const extensions = asStringArray(params.extensions)
      const expanded = expandPath(glob, ctx.variables)
      const matched = await collectMatches(expanded, contains, extensions)
      ctx.matchedFiles = matched
      return {
        ok: true,
        summary: `Matched ${matched.length} file${matched.length === 1 ? '' : 's'}`,
        artifacts: { matched, count: matched.length },
      }
    },
  })

  register({
    id: 'fs.move',
    description: 'Move previously matched files to a destination folder',
    params: {
      dest: 'string?',
      files: 'string[]?',
    },
    async run(params, ctx): Promise<ToolResult> {
      const destRaw = asString(params.dest)
      const files = asStringArray(params.files)
      const sources = (files.length ? files : ctx.matchedFiles).map((f) =>
        assertUnderHome(expandPath(f, ctx.variables)),
      )
      const perFile = ctx.fileDestinations ?? {}

      if (!sources.length) {
        return { ok: true, summary: 'No files to move', artifacts: { moved: [], count: 0 } }
      }

      const usesRoute = sources.some((src) => Boolean(perFile[src]))
      if (!destRaw && !usesRoute) {
        return { ok: false, summary: 'fs.move requires dest (or a prior fs.route)' }
      }

      const defaultDest = destRaw
        ? assertUnderHome(expandPath(destRaw, ctx.variables))
        : ''

      const moved: string[] = []
      const destDirs = new Set<string>()
      for (const src of sources) {
        if (!fsSync.existsSync(src) && !ctx.dryRun) continue
        const destDir = perFile[src] || defaultDest
        if (!destDir) continue
        destDirs.add(destDir)
        if (!ctx.dryRun) {
          await fs.mkdir(destDir, { recursive: true })
        }
        const target = await uniqueDest(destDir, path.basename(src))
        if (ctx.dryRun) {
          moved.push(target)
          continue
        }
        if (!fsSync.existsSync(src)) continue
        await fs.rename(src, target)
        recordMove(src, target)
        moved.push(target)
      }

      const destLabel =
        destDirs.size === 1
          ? [...destDirs][0]
          : `${destDirs.size} folders`

      return {
        ok: true,
        summary: `${ctx.dryRun ? 'Would move' : 'Moved'} ${moved.length} file${moved.length === 1 ? '' : 's'} to ${destLabel}`,
        artifacts: { moved, count: moved.length },
      }
    },
  })

  register({
    id: 'fs.mkdir',
    description: 'Create directories',
    params: { dirs: 'string | string[]' },
    async run(params, ctx): Promise<ToolResult> {
      let dirs = asStringArray(params.dirs ?? params.paths ?? params.list)
      if (!dirs.length) {
        const first = Object.values(params)[0]
        dirs = asStringArray(first)
      }
      const created: string[] = []
      for (const dir of dirs) {
        const abs = assertUnderHome(expandPath(dir, ctx.variables))
        if (ctx.dryRun) {
          created.push(abs)
          continue
        }
        await fs.mkdir(abs, { recursive: true })
        created.push(abs)
      }
      return {
        ok: true,
        summary: `${ctx.dryRun ? 'Would create' : 'Created'} ${created.length} director${created.length === 1 ? 'y' : 'ies'}`,
        artifacts: { created, count: created.length },
      }
    },
  })

  register({
    id: 'fs.notify',
    description: 'Emit a run summary notification',
    params: { template: 'string?', summary: 'string?' },
    async run(params, ctx): Promise<ToolResult> {
      const template =
        asString(params.template) ||
        asString(params.summary) ||
        'Moved {{count}} files'
      const count = ctx.matchedFiles.length
      const text = template
        .replace(/\{\{count\}\}/g, String(count))
        .replace(/\{\{files\}\}/g, String(count))
      return {
        ok: true,
        summary: text,
        artifacts: { count },
      }
    },
  })
}
