import type { PathVariable, RouteRow } from '@/types/domain'
import { labelPathText } from '@/lib/pathVariables'

export type RouteConfig = {
  by: 'extension'
  routes: RouteRow[]
  fallback: string
}

/** Mac Desktop cleanup — files only (list skips folders). */
export const CLEAN_DESKTOP_FALLBACK = '~/Documents/Other'

export const CLEAN_DESKTOP_ROUTES: RouteRow[] = [
  {
    match:
      'png, jpg, jpeg, gif, webp, heic, heif, tiff, tif, bmp, svg, ico, raw, cr2, nef, orf, dng',
    dest: '~/Pictures',
  },
  {
    match:
      'pdf, doc, docx, dot, docm, rtf, txt, md, odt, ods, odp, xls, xlsx, xlsm, csv, tsv, ppt, pptx, pps, ppsx, key, numbers, pages, epub, mobi',
    dest: '~/Documents',
  },
  {
    match: 'mp4, mov, m4v, avi, mkv, webm, wmv, flv, mpg, mpeg, m2v, 3gp',
    dest: '~/Movies',
  },
  {
    match: 'mp3, m4a, aac, wav, flac, aiff, aif, ogg, opus, wma',
    dest: '~/Music',
  },
]

export const CLEAN_DESKTOP_DESCRIPTION =
  'Move loose Desktop files into Pictures, Documents, Movies, Music, and Other. Folders and apps stay on Desktop.'

export function defaultRouteConfig(): RouteConfig {
  return {
    by: 'extension',
    routes: CLEAN_DESKTOP_ROUTES,
    fallback: CLEAN_DESKTOP_FALLBACK,
  }
}

export function routeTableFromConfig(config: RouteConfig): Record<string, unknown> {
  const table: Record<string, unknown> = Object.fromEntries(
    config.routes.map((r) => [r.match.replace(/\s+/g, ''), r.dest]),
  )
  table.default = config.fallback
  return table
}

export function summarizeRouteConfig(config: RouteConfig): string {
  const n = config.routes.filter((r) => r.match.trim() && r.dest.trim()).length
  const fallback = config.fallback.trim()
  if (!n && !fallback) return 'Empty route table'
  if (!fallback) return `${n} route${n === 1 ? '' : 's'}`
  return `${n} route${n === 1 ? '' : 's'} · else ${fallback}`
}

export function parseMatchTokens(match: string): string[] {
  return match
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean)
}

export function routeCategoryLabel(dest: string): string {
  const d = dest.toLowerCase()
  if (d.includes('picture')) return 'Images'
  if (d.includes('movie') || d.includes('video')) return 'Videos'
  if (d.includes('music') || d.includes('audio')) return 'Music'
  if (d.includes('download')) return 'Downloads'
  if (d.includes('other')) return 'Other'
  if (d.includes('document')) return 'Documents'
  return 'Files'
}

export function formatExtensionPreview(matchKey: string, max = 5): string {
  const tokens = parseMatchTokens(matchKey)
  if (!tokens.length) return matchKey
  const head = tokens.slice(0, max).map((t) => `.${t}`)
  if (tokens.length <= max) return head.join(', ')
  return `${head.join(', ')}, … (+${tokens.length - max})`
}

export function formatRouteRowsForDisplay(
  table: Record<string, unknown>,
  pathVariables: PathVariable[],
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []

  for (const [key, dest] of Object.entries(table)) {
    if (key === 'default') continue
    const destLabel = labelPathText(String(dest), pathVariables)
    rows.push({
      label: routeCategoryLabel(String(dest)),
      value: `${formatExtensionPreview(key)} → ${destLabel}`,
    })
  }

  const fallback = table.default
  if (fallback != null && String(fallback).trim()) {
    rows.push({
      label: 'Other',
      value: `everything else → ${labelPathText(String(fallback), pathVariables)}`,
    })
  }

  return rows
}
