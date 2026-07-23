import type { Automation, PathVariable } from '@/types/domain'

/** Top-level folders to grant when connecting the Filesystem connector. */
export function foldersForFilesystemConnect(
  variables: PathVariable[] = [],
): string[] {
  const paths = variables
    .map((v) => v.path.trim())
    .filter(Boolean)
    .sort((a, b) => a.length - b.length)

  const roots: string[] = []
  for (const path of paths) {
    const covered = roots.some(
      (root) => path === root || path.startsWith(`${root}/`),
    )
    if (!covered) roots.push(path)
  }

  // Always include Documents — common target for file moves.
  if (!roots.some((r) => r === '~/Documents' || r.endsWith('/Documents'))) {
    roots.push('~/Documents')
  }

  return roots
}

function stepOp(step: Automation['steps'][number]) {
  const fn = step.fn || step.operation || ''
  return fn.includes('.') ? fn.split('.').pop()! : fn
}

function addTableDestinations(
  folders: Set<string>,
  table: unknown,
  variables: PathVariable[],
  fallback?: unknown,
) {
  if (Array.isArray(table)) {
    for (const row of table) {
      if (!row || typeof row !== 'object') continue
      const item = row as Record<string, unknown>
      const dest = String(item.value ?? item.dest ?? '').trim()
      if (dest) folders.add(dirFromPathish(dest, variables))
    }
  } else if (table && typeof table === 'object') {
    for (const value of Object.values(table as Record<string, unknown>)) {
      const dest = String(value ?? '').trim()
      if (dest) folders.add(dirFromPathish(dest, variables))
    }
  }
  const fb = String(fallback ?? '').trim()
  if (fb) folders.add(dirFromPathish(fb, variables))
}

/** Folders an automation needs before it can run safely. */
export function foldersForAutomation(
  automation: Automation,
  variables: PathVariable[] = [],
): string[] {
  const folders = new Set<string>()

  for (const step of automation.steps) {
    const op = stepOp(step)
    const w = step.with ?? {}

    if (op === 'route' || op === 'lookup') {
      addTableDestinations(
        folders,
        w.table,
        variables,
        w.fallback ?? w.default ?? step.routeFallback,
      )
      if (step.routes?.length) {
        addTableDestinations(
          folders,
          step.routes.map((r) => ({ dest: r.dest })),
          variables,
        )
      }
      continue
    }

    if (op === 'list' || op === 'match') {
      const glob = String(w.dir ?? w.glob ?? step.params ?? '').trim()
      if (glob) folders.add(dirFromPathish(glob, variables))
      continue
    }

    if (op === 'move' || op === 'copy') {
      const dest = String(w.output ?? w.dest ?? '').trim()
      if (dest) folders.add(dirFromPathish(dest, variables))
      continue
    }

    if (op === 'mkdir') {
      const dirs = Array.isArray(w.dirs)
        ? w.dirs.map(String)
        : String(w.dirs ?? w.path ?? step.params ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      for (const dir of dirs) folders.add(dirFromPathish(dir, variables))
    }
  }

  return [...folders].filter(Boolean)
}

function dirFromPathish(value: string, variables: PathVariable[]) {
  let path = value.trim()
  if (!path) return ''

  // Resolve path variable names (exact match)
  const hit = variables.find(
    (v) => v.name.trim().toLowerCase() === path.toLowerCase(),
  )
  if (hit) path = hit.path

  // Strip glob filename
  if (path.includes('*') || path.includes('?')) {
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    path = slash >= 0 ? path.slice(0, slash) : path
  }

  // "Move to ~/Documents/PDFs" style
  path = path.replace(/^move\s+to\s+/i, '').trim()

  return path
}
