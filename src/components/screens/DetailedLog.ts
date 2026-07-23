import { el, button } from '@/lib/dom'
import { SearchField } from '@/components/shared/controls'
import {
  EmptyState,
  metaGrid,
  metaGridCell,
  sectionLabel,
  tableCell,
  tablePager,
  tableRow,
} from '@/components/shared/layout'
import { relativeTime } from '@/lib/format'
import { icons } from '@/lib/icons'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import { getState } from '@/app/store'
import { bindScreen } from '@/lib/bindScreen'
import type { LogEntry, PathVariable } from '@/types/domain'

const PAGE_SIZE = 40
const ALL_DEST = '__all__'

type SortKey = 'name' | 'type'
type SortDir = 'asc' | 'desc'

type ActionRow = {
  id: string
  file: string
  type: string
  from: string
  fromDir: string
  to: string
  dest: string
}

export function DetailedLog() {
  const page = el('div', 'screen settings-screen')
  let search = ''
  let destFilter = ALL_DEST
  let pageIndex = 0
  let sortKey: SortKey = 'name'
  let sortDir: SortDir = 'asc'
  const body = el('div', 'screen-body detailed-log-page')

  const render = () => {
    const state = getState()
    const logId = state.viewingDetailedLogId
    const entry = logId
      ? state.logs.find((l) => l.id === logId)
      : latestLogWithMoves(state.logs)

    page.replaceChildren()
    body.replaceChildren()

    if (!entry) {
      body.append(
        EmptyState({
          title: 'No detailed log',
          body: 'Open a run from Logs that moved files, then choose Detailed log.',
        }),
      )
      page.append(body)
      return
    }

    const moves = entry.moves ?? []
    const byDest = countByDest(moves)
    const vars = state.pathVariables

    body.append(buildSummary(entry, moves.length, byDest.length))

    if (!moves.length) {
      body.append(
        EmptyState({
          title: 'No file actions',
          body: 'This run has no per-file move records to show.',
        }),
      )
      page.append(body)
      return
    }

    let rows: ActionRow[] = moves.map((move, i) => {
      const file = baseName(move.to)
      return {
        id: `${entry.id}-${i}`,
        file,
        type: fileType(file),
        from: move.from,
        fromDir: destFolder(move.from),
        to: move.to,
        dest: destFolder(move.to),
      }
    })

    if (destFilter !== ALL_DEST) {
      rows = rows.filter((r) => r.dest === destFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.file.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.fromDir.toLowerCase().includes(q) ||
          r.dest.toLowerCase().includes(q) ||
          labelPathText(r.fromDir, vars).toLowerCase().includes(q) ||
          labelPathText(r.dest, vars).toLowerCase().includes(q),
      )
    }

    rows = sortRows(rows, sortKey, sortDir)

    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    if (pageIndex > pageCount - 1) pageIndex = pageCount - 1
    if (pageIndex < 0) pageIndex = 0
    const pageRows = rows.slice(
      pageIndex * PAGE_SIZE,
      pageIndex * PAGE_SIZE + PAGE_SIZE,
    )

    body.append(
      buildDestChips(byDest, destFilter, moves.length, vars, (next) => {
        destFilter = next
        pageIndex = 0
        render()
      }),
      buildActionTable({
        rows: pageRows,
        total: rows.length,
        pageIndex,
        search,
        sortKey,
        sortDir,
        vars,
        undone: entry.undone,
        onSearch: (v) => {
          search = v
          pageIndex = 0
          render()
        },
        onPage: (next) => {
          pageIndex = next
          render()
        },
        onSort: (key) => {
          if (sortKey === key) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc'
          } else {
            sortKey = key
            sortDir = 'asc'
          }
          pageIndex = 0
          render()
        },
      }),
    )
    page.append(body)
  }

  return bindScreen(page, render)
}

function buildSummary(
  entry: LogEntry,
  fileCount: number,
  destCount: number,
) {
  const head = el('div', 'detailed-log-summary')
  const top = el('div', 'detailed-log-summary-top')
  top.append(
    connectorIconTile(entry.connectorId, true),
    el('h2', 'detailed-log-title', [entry.automationName]),
  )
  head.append(
    top,
    metaGrid([
      metaGridCell('When', relativeTime(entry.at)),
      metaGridCell(
        'Result',
        entry.undone ? 'Undone' : entry.success ? 'Success' : 'Failed',
      ),
      metaGridCell('Files', String(fileCount)),
      metaGridCell('Folders', String(destCount)),
    ]),
  )
  return head
}

function buildDestChips(
  byDest: [string, number][],
  selected: string,
  total: number,
  vars: PathVariable[],
  onSelect: (dest: string) => void,
) {
  const block = el('div', 'detailed-log-dests')
  block.append(sectionLabel('Destinations'))

  const list = el('div', 'detailed-log-chip-row')
  list.append(
    destChip({
      label: 'All files',
      count: total,
      active: selected === ALL_DEST,
      onClick: () => onSelect(ALL_DEST),
    }),
  )

  for (const [folder, count] of byDest) {
    const shown = labelPathText(folder, vars)
    list.append(
      destChip({
        label: shown,
        count,
        active: selected === folder,
        title: shown,
        onClick: () => onSelect(folder),
      }),
    )
  }

  block.append(list)
  return block
}

/** Path cell that keeps the containing folder visible when truncated. */
function pathTailCell(pathLabel: string) {
  const cell = el('div', 'log-cell detailed-log-path')
  cell.title = pathLabel
  const shell = el('span', 'detailed-log-path-tail')
  shell.append(el('span', undefined, [pathLabel]))
  cell.append(shell)
  return cell
}

function destChip(opts: {
  label: string
  count: number
  active: boolean
  title?: string
  onClick: () => void
}) {
  const btn = button(
    `detailed-log-chip${opts.active ? ' is-active' : ''}`,
  )
  btn.type = 'button'
  if (opts.title) btn.title = opts.title
  const label = el('span', 'detailed-log-chip-label')
  label.append(el('span', undefined, [opts.label]))
  btn.append(label, el('span', 'detailed-log-chip-count', [String(opts.count)]))
  btn.addEventListener('click', opts.onClick)
  return btn
}

function buildActionTable(opts: {
  rows: ActionRow[]
  total: number
  pageIndex: number
  search: string
  sortKey: SortKey
  sortDir: SortDir
  vars: PathVariable[]
  undone: boolean | undefined
  onSearch: (v: string) => void
  onPage: (page: number) => void
  onSort: (key: SortKey) => void
}) {
  const wrap = el('div', 'detailed-log-table-wrap')
  const toolbar = el('div', 'detailed-log-pane-toolbar')
  toolbar.append(
    el('div', 'detailed-log-pane-title', [
      `${opts.total} action${opts.total === 1 ? '' : 's'}`,
    ]),
    SearchField({
      placeholder: 'Search files…',
      value: opts.search,
      onChange: opts.onSearch,
    }),
  )
  wrap.append(toolbar)

  if (!opts.rows.length) {
    wrap.append(
      EmptyState({
        title: 'No matches',
        body: 'Try another destination or search.',
      }),
    )
    return wrap
  }

  const table = el(
    'div',
    `log-table detailed-log-table${opts.undone ? ' is-undone' : ''}`,
  )
  table.append(sortableHead(opts.sortKey, opts.onSort))
  for (const row of opts.rows) {
    const fromLabel = labelPathText(row.fromDir, opts.vars)
    const toLabel = labelPathText(row.dest, opts.vars)
    const elRow = tableRow({
      rowClass: 'detailed-log-table-row',
      cells: [
        tableCell(row.file),
        tableCell(row.type, 'detailed-log-type'),
        pathTailCell(fromLabel),
        pathTailCell(toLabel),
      ],
    })
    elRow.title = `${row.from} → ${row.to}`
    table.append(elRow)
  }
  wrap.append(table)

  if (opts.total > PAGE_SIZE) {
    wrap.append(
      tablePager({
        page: opts.pageIndex,
        pageSize: PAGE_SIZE,
        total: opts.total,
        onChange: opts.onPage,
      }),
    )
  }

  return wrap
}

function sortableHead(sortKey: SortKey, onSort: (key: SortKey) => void) {
  const row = el('div', 'log-table-row head detailed-log-table-row')
  row.append(
    sortHeadCell('File', 'name', sortKey, onSort),
    sortHeadCell('Type', 'type', sortKey, onSort),
    tableCell('From'),
    tableCell('To'),
  )
  return row
}

function sortHeadCell(
  label: string,
  key: SortKey,
  sortKey: SortKey,
  onSort: (key: SortKey) => void,
) {
  const active = sortKey === key
  const btn = button(
    `log-cell detailed-log-sort${active ? ' is-active' : ''}`,
  )
  btn.type = 'button'
  const glyph = el('span', 'detailed-log-sort-icon')
  glyph.innerHTML = icons.chevronUpDown
  btn.append(document.createTextNode(label), glyph)
  btn.addEventListener('click', () => onSort(key))
  return btn
}

function sortRows(rows: ActionRow[], key: SortKey, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (key === 'type') {
      const byType = a.type.localeCompare(b.type, undefined, {
        sensitivity: 'base',
      })
      if (byType) return byType * sign
      return a.file.localeCompare(b.file, undefined, { sensitivity: 'base' })
    }
    const byName = a.file.localeCompare(b.file, undefined, {
      sensitivity: 'base',
    })
    if (byName) return byName * sign
    return a.type.localeCompare(b.type, undefined, { sensitivity: 'base' })
  })
}

function latestLogWithMoves(logs: LogEntry[]) {
  return logs.find((l) => (l.moves?.length ?? 0) > 0) ?? null
}

function destFolder(toPath: string) {
  const normalized = toPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx > 0 ? normalized.slice(0, idx) : normalized
}

function baseName(toPath: string) {
  const normalized = toPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function fileType(name: string) {
  const idx = name.lastIndexOf('.')
  if (idx <= 0 || idx === name.length - 1) return '—'
  return name.slice(idx + 1).toLowerCase()
}

function countByDest(moves: { from: string; to: string }[]) {
  const map = new Map<string, number>()
  for (const move of moves) {
    const folder = destFolder(move.to)
    map.set(folder, (map.get(folder) ?? 0) + 1)
  }
  return [...map.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
}
