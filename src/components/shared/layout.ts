import { el, button } from '@/lib/dom'
import { Btn } from '@/components/shared/controls'
import { icons } from '@/lib/icons'

export type TabOption = { value: string; label: string }

type TabsOpts = {
  options: TabOption[]
  onChange: (value: string) => void
  value?: string
  getValue?: () => string
  variant?: 'toolbar' | 'segment'
  className?: string
}

function tabValue(opts: TabsOpts) {
  return opts.getValue?.() ?? opts.value ?? opts.options[0]?.value ?? ''
}

function tabsShell(opts: TabsOpts) {
  const variant = opts.variant ?? 'toolbar'
  const rootClass =
    opts.className ??
    (variant === 'segment' ? 'tabs tabs-segment' : 'tabs tabs-toolbar')
  const btnClass = variant === 'segment' ? 'tab tab-segment' : 'tab tab-toolbar'
  const root = el('div', rootClass)

  const paint = () => {
    root.replaceChildren()
    const value = tabValue(opts)
    for (const option of opts.options) {
      const tab = button(`${btnClass}${value === option.value ? ' active' : ''}`, option.label)
      tab.type = 'button'
      tab.addEventListener('click', () => {
        if (option.value !== tabValue(opts)) opts.onChange(option.value)
      })
      root.append(tab)
    }
  }

  paint()
  return { root, refresh: paint }
}

/** Segmented tabs — filters in toolbars or option pickers in forms. */
export function Tabs(opts: TabsOpts) {
  return tabsShell(opts).root
}

export function createTabs(opts: TabsOpts) {
  return tabsShell(opts)
}

/** @deprecated use Tabs({ variant: 'toolbar' }) */
export function TabBar(opts: Omit<TabsOpts, 'variant'>) {
  return Tabs({ ...opts, variant: 'toolbar' })
}

/** @deprecated use createTabs({ variant: 'segment' }) */
export function createSegmentField(opts: Omit<TabsOpts, 'variant'>) {
  return createTabs({ ...opts, variant: 'segment' })
}

/** @deprecated use Tabs({ variant: 'segment' }) */
export function SegmentField(opts: Omit<TabsOpts, 'variant'>) {
  return Tabs({ ...opts, variant: 'segment' })
}

// — Page chrome —

export function PageToolbar(opts: {
  leading?: HTMLElement[]
  actions?: HTMLElement[]
}) {
  const bar = el('div', 'page-toolbar')
  if (opts.leading?.length) {
    const left = el('div', 'page-toolbar-leading')
    left.append(...opts.leading)
    bar.append(left)
  }
  if (opts.actions?.length) {
    const right = el('div', 'page-toolbar-actions')
    right.append(...opts.actions)
    bar.append(right)
  }
  return bar
}

export function EmptyState(opts: {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}) {
  const wrap = el('div', 'empty-state')
  wrap.append(el('h2', 'empty-title', [opts.title]), el('p', 'empty-body', [opts.body]))
  if (opts.actionLabel && opts.onAction) {
    wrap.append(Btn({ label: opts.actionLabel, variant: 'ghost', onClick: opts.onAction }))
  }
  return wrap
}

// — Tables —

export function tableCell(text: string, className = '') {
  return el('div', `log-cell ${className}`.trim(), [text])
}

export function tableHead(labels: string[], rowClass = '') {
  const row = el('div', `log-table-row head ${rowClass}`.trim())
  for (const label of labels) row.append(tableCell(label))
  return row
}

export function dataTable(opts: {
  className?: string
  columns: string[]
  headClass?: string
  rows: HTMLElement[]
}) {
  const table = el('div', `log-table ${opts.className ?? ''}`.trim())
  table.append(tableHead(opts.columns, opts.headClass))
  for (const row of opts.rows) table.append(row)
  return table
}

/** Prev / next pager under a table. page is 0-based. */
export function tablePager(opts: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(opts.total / opts.pageSize))
  const page = Math.min(Math.max(0, opts.page), pageCount - 1)
  const from = opts.total === 0 ? 0 : page * opts.pageSize + 1
  const to = Math.min(opts.total, (page + 1) * opts.pageSize)

  const bar = el('div', 'table-pager')
  bar.append(
    el('span', 'table-pager-meta', [
      opts.total === 0
        ? 'Showing 0 results'
        : `Showing ${from}-${to} of ${opts.total} results`,
    ]),
  )

  const controls = el('div', 'table-pager-controls')
  controls.append(
    pagerNavBtn({
      label: 'Previous',
      icon: 'prev',
      disabled: page <= 0 || opts.total === 0,
      onClick: () => opts.onChange(page - 1),
    }),
  )

  for (const item of pagerPages(page, pageCount)) {
    if (item === '…') {
      controls.append(el('span', 'table-pager-ellipsis', ['…']))
      continue
    }
    const pageBtn = button(
      `table-pager-num${item === page ? ' is-active' : ''}`,
      String(item + 1),
    )
    pageBtn.type = 'button'
    pageBtn.setAttribute('aria-label', `Page ${item + 1}`)
    if (item === page) pageBtn.setAttribute('aria-current', 'page')
    pageBtn.addEventListener('click', () => opts.onChange(item))
    controls.append(pageBtn)
  }

  controls.append(
    pagerNavBtn({
      label: 'Next',
      icon: 'next',
      disabled: page >= pageCount - 1 || opts.total === 0,
      onClick: () => opts.onChange(page + 1),
    }),
  )
  bar.append(controls)
  return bar
}

function pagerNavBtn(opts: {
  label: string
  icon: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}) {
  const btn = button(`table-pager-nav${opts.disabled ? ' is-disabled' : ''}`)
  btn.type = 'button'
  btn.disabled = opts.disabled
  btn.setAttribute('aria-label', opts.label)
  if (opts.icon === 'prev') {
    btn.innerHTML = `${icons.chevronLeft}<span>${opts.label}</span>`
  } else {
    btn.innerHTML = `<span>${opts.label}</span>${icons.chevronRight}`
  }
  btn.addEventListener('click', opts.onClick)
  return btn
}

/** 0-based page indices with ellipsis gaps for the pager strip. */
function pagerPages(page: number, pageCount: number): Array<number | '…'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i)
  }
  const show = new Set<number>([0, pageCount - 1])
  for (let i = page - 1; i <= page + 1; i++) {
    if (i >= 0 && i < pageCount) show.add(i)
  }
  const sorted = [...show].sort((a, b) => a - b)
  const items: Array<number | '…'> = []
  let prev = -2
  for (const p of sorted) {
    if (prev >= 0 && p - prev > 1) items.push('…')
    items.push(p)
    prev = p
  }
  return items
}

export function tableSelectRow(opts: {
  rowClass?: string
  selected?: boolean
  paused?: boolean
  stateClass?: string
  cells: HTMLElement[]
  onSelect: () => void
}) {
  const parts = ['log-table-row']
  if (opts.rowClass) parts.push(opts.rowClass)
  if (opts.selected) parts.push('is-selected')
  if (opts.paused) parts.push('is-paused')
  if (opts.stateClass) parts.push(opts.stateClass)
  const row = button(parts.join(' '))
  row.append(...opts.cells)
  row.addEventListener('click', opts.onSelect)
  return row
}

export function tableRow(opts: { rowClass?: string; stateClass?: string; cells: HTMLElement[] }) {
  const parts = ['log-table-row']
  if (opts.rowClass) parts.push(opts.rowClass)
  if (opts.stateClass) parts.push(opts.stateClass)
  const row = el('div', parts.join(' '))
  row.append(...opts.cells)
  return row
}

// — Banners —

export function alertBanner(opts: {
  message: string
  actionLabel: string
  onClick: () => void
}) {
  const banner = button('alert-banner')
  banner.type = 'button'
  banner.append(
    el('span', undefined, [opts.message]),
    el('span', 'alert-banner-action', [opts.actionLabel]),
  )
  banner.addEventListener('click', opts.onClick)
  return banner
}

// — Split layouts —

export function splitView(opts: {
  splitClass: string
  mainClass: string
  sideClass: string
  main: HTMLElement[]
  side?: HTMLElement | null
}) {
  const split = el('div', opts.splitClass)
  const main = el('div', opts.mainClass)
  main.append(...opts.main)
  split.append(main)
  if (opts.side) {
    const side = el('aside', opts.sideClass)
    side.append(opts.side)
    split.append(side)
  }
  return split
}

// — Detail panels —

export function detailPanel(className: string, children: HTMLElement[]) {
  const panel = el('section', className)
  panel.append(...children)
  return panel
}

export function sectionLabel(text: string, className = 'detail-section-label') {
  return el('div', className, [text])
}

export function detailHead(opts: {
  icon: HTMLElement
  title: string
  meta?: string
}) {
  const head = el('div', 'detail-head')
  const line = el('div', 'detail-title-line')
  line.append(el('span', 'detail-title', [opts.title]))
  if (opts.meta) {
    line.append(el('span', 'detail-title-sep', [' · ']))
    line.append(el('span', 'detail-meta', [opts.meta]))
  }
  const copy = el('div', 'detail-copy')
  copy.append(line)
  head.append(opts.icon, copy)
  return head
}

export function detailLead(text: string) {
  return el('p', 'detail-lead', [text])
}

export function detailRow(label: string, value: string | HTMLElement) {
  const row = el('div', 'detail-row')
  row.append(el('span', 'detail-row-label', [label]))
  if (typeof value === 'string') {
    row.append(el('span', 'detail-row-value', [value]))
  } else {
    row.append(value)
  }
  return row
}

export function detailBlock(label: string, children: HTMLElement[]) {
  const block = el('div', 'detail-block')
  block.append(sectionLabel(label))
  const body = el('div', 'detail-block-body')
  body.append(...children)
  block.append(body)
  return block
}

export function metaRow(label: string, value: string | HTMLElement) {
  const row = el('div', 'review-report-row')
  row.append(el('span', 'review-report-label', [label]))
  if (typeof value === 'string') {
    row.append(el('span', 'review-report-value', [value]))
  } else {
    row.append(value)
  }
  return row
}

export function metaGridCell(label: string, value: string | HTMLElement) {
  const cell = el('div', 'detail-meta-cell')
  cell.append(el('span', 'detail-meta-label', [label]))
  if (typeof value === 'string') {
    cell.append(el('span', 'detail-meta-value', [value]))
  } else {
    cell.append(value)
  }
  return cell
}

export function metaGrid(cells: HTMLElement[]) {
  const grid = el('div', 'detail-meta-grid')
  grid.append(...cells)
  return grid
}

export function detailActions(children: HTMLElement[]) {
  const row = el('div', 'detail-actions')
  row.append(...children)
  return row
}

export function detailTitleRow(title: string, trailing?: HTMLElement) {
  const top = el('div', 'detail-title-row')
  top.append(el('div', 'detail-title', [title]))
  if (trailing) top.append(trailing)
  return top
}

export function detailDescription(text: string) {
  return el('p', 'detail-description automation-detail-desc', [text])
}
