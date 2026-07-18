import { el } from '@/lib/dom'

export function SectionBlock(opts: {
  title: string
  rows: HTMLElement[]
  icon?: string
  tone?: string
}) {
  const block = el('section', 'settings-block')
  const header = el('div', 'settings-block-header')

  if (opts.icon && opts.tone) {
    const tile = el('span', `app-icon-tile settings-block-icon tone-${opts.tone}`)
    tile.innerHTML = opts.icon
    header.append(tile)
  }

  header.append(el('h2', 'settings-block-title', [opts.title]))
  block.append(header, ListGroup(opts.rows))
  return block
}

export function ListGroup(rows: HTMLElement[], className = '') {
  const group = el('div', `settings-group ${className}`.trim())
  for (const row of rows) group.append(row)
  return group
}

export function ListRow(opts?: { className?: string }) {
  return el('div', `settings-row ${opts?.className ?? ''}`.trim())
}
