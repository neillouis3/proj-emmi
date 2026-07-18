import type { PathVariable } from '@/types/domain'

/** Replace configured paths with their friendly names (longest match first). */
export function labelPathText(
  text: string,
  variables: PathVariable[],
): string {
  if (!text) return text
  let result = text.replace(/\s*→\s*/g, ' to ')
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
