import type { PathVariable } from '@/types/domain'

/** Collapse absolute home prefixes so paths read like automations (`~/Documents/…`). */
export function collapseHomePath(text: string): string {
  if (!text) return text
  return text
    .replace(/\/Users\/[^/\s"'`]+/g, '~')
    .replace(/\/home\/[^/\s"'`]+/g, '~')
    .replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"'`]+/gi, '~')
}

/** Replace configured paths with their friendly names (longest match first). */
export function labelPathText(
  text: string,
  variables: PathVariable[],
): string {
  if (!text) return text
  let result = collapseHomePath(text.replace(/\s*→\s*/g, ' to '))
  const sorted = variables
    .map((v) => ({
      name: v.name.trim(),
      path: v.path.trim(),
    }))
    .filter((v) => v.name && v.path)
    .sort((a, b) => b.path.length - a.path.length)

  for (const { name, path } of sorted) {
    if (!result.includes(path)) continue
    result = result.split(path).join(name)
  }
  return result
}

export function defaultPathVariables(): PathVariable[] {
  return [
    { id: 'pv-desktop', name: 'Desktop', path: '~/Desktop' },
    { id: 'pv-documents', name: 'Documents', path: '~/Documents' },
    { id: 'pv-pictures', name: 'Pictures', path: '~/Pictures' },
    {
      id: 'pv-screenshots',
      name: 'Screenshots',
      path: '~/Pictures/Screenshots',
    },
    { id: 'pv-downloads', name: 'Downloads', path: '~/Downloads' },
    { id: 'pv-archive', name: 'Archive', path: '~/Downloads/Archive' },
  ]
}
