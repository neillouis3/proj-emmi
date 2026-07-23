import { el, button } from '@/lib/dom'
import { FilterBar, Btn, IconBtn } from '@/components/shared/controls'
import {
  dataTable,
  detailActions,
  detailDescription,
  detailTitleRow,
  EmptyState,
  metaGrid,
  metaGridCell,
  PageToolbar,
  sectionLabel,
  splitView,
  tableCell,
  tablePager,
  tableSelectRow,
} from '@/components/shared/layout'
import { relativeTime } from '@/lib/format'
import { icons } from '@/lib/icons'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import {
  getState,
  navigate,
  openDetailedLog,
  retryLog,
  undoLog,
} from '@/app/store'
import { bindScreen } from '@/lib/bindScreen'
import type { LogEntry } from '@/types/domain'

const LOG_PAGE_SIZE = 25

export function Log() {
  const page = el('div', 'screen settings-screen')
  let search = ''
  let resultFilter = 'all'
  let rangeFilter = 'all'
  let pageIndex = 0
  let selectedId: string | null = null
  const body = el('div', 'screen-body log-page')

  const render = () => {
    const state = getState()
    const all = state.logs.filter((entry) => {
      const action = entry.action?.trim() ?? ''
      const summary = entry.summary?.trim() ?? ''
      if (/^fs\.(move|copy|rename|delete|mkdir)$/i.test(action)) return false
      if (action === 'fs' || action === 'automation') return false
      if (/^(Moved|Copied|Renamed|Deleted|Created directory)\b/i.test(summary)) {
        return false
      }
      return true
    })
    const now = Date.now()

    let items = all
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(
        (l) =>
          l.summary.toLowerCase().includes(q) ||
          l.automationName.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q),
      )
    }
    if (resultFilter === 'success') items = items.filter((l) => l.success && !l.undone)
    if (resultFilter === 'failure') items = items.filter((l) => !l.success)
    if (resultFilter === 'undone') items = items.filter((l) => l.undone)
    if (rangeFilter === '24h') {
      items = items.filter((l) => now - +new Date(l.at) <= 24 * 3600_000)
    } else if (rangeFilter === '7d') {
      items = items.filter((l) => now - +new Date(l.at) <= 7 * 24 * 3600_000)
    }

    const pageCount = Math.max(1, Math.ceil(items.length / LOG_PAGE_SIZE))
    if (pageIndex > pageCount - 1) pageIndex = pageCount - 1
    if (pageIndex < 0) pageIndex = 0
    const pageItems = items.slice(
      pageIndex * LOG_PAGE_SIZE,
      pageIndex * LOG_PAGE_SIZE + LOG_PAGE_SIZE,
    )

    if (!pageItems.some((l) => l.id === selectedId)) {
      selectedId = pageItems[0]?.id ?? items[0]?.id ?? null
    }
    const selected = items.find((l) => l.id === selectedId) ?? null

    page.replaceChildren()
    body.replaceChildren()

    body.append(
      PageToolbar({
        leading: [
          FilterBar([
            {
              type: 'search',
              placeholder: 'Search…',
              value: search,
              onChange: (v) => {
                search = v
                pageIndex = 0
                render()
              },
            },
            {
              type: 'select',
              label: 'Result',
              value: resultFilter,
              options: [
                { value: 'all', label: 'All results' },
                { value: 'success', label: 'Success' },
                { value: 'failure', label: 'Failure' },
                { value: 'undone', label: 'Undone' },
              ],
              onChange: (v) => {
                resultFilter = v
                pageIndex = 0
                render()
              },
            },
            {
              type: 'select',
              label: 'Range',
              value: rangeFilter,
              options: [
                { value: 'all', label: 'Any time' },
                { value: '24h', label: 'Last 24h' },
                { value: '7d', label: 'Last 7 days' },
              ],
              onChange: (v) => {
                rangeFilter = v
                pageIndex = 0
                render()
              },
            },
          ]),
        ],
      }),
    )

    if (!all.length) {
      body.append(
        EmptyState({
          title: 'No history yet',
          body: 'Executed actions appear here.',
          actionLabel: 'Open Automations',
          onAction: () => navigate('automations'),
        }),
      )
      page.append(body)
      return
    }

    if (!items.length) {
      body.append(
        EmptyState({
          title: 'No matches',
          body: 'Try another search or filter.',
        }),
      )
      page.append(body)
      return
    }

    const tableWrap = el('div', 'log-table-wrap')
    tableWrap.append(
      dataTable({
        className: 'log-history-table',
        columns: ['Time', 'Automation', 'Details', 'Result', ''],
        rows: pageItems.map((entry) =>
          logTableRow(
            entry,
            state,
            entry.id === selectedId,
            () => {
              selectedId = entry.id
              render()
            },
            render,
          ),
        ),
      }),
      tablePager({
        page: pageIndex,
        pageSize: LOG_PAGE_SIZE,
        total: items.length,
        onChange: (next) => {
          pageIndex = next
          render()
        },
      }),
    )

    body.append(
      splitView({
        splitClass: 'log-split',
        mainClass: 'log-main-col',
        sideClass: 'log-side',
        main: [tableWrap],
        side: selected ? buildLogDetail(selected, state, render) : null,
      }),
    )
    page.append(body)
  }

  return bindScreen(page, render)
}

function logTableRow(
  entry: LogEntry,
  state: ReturnType<typeof getState>,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const result = entry.undone
    ? 'Undone'
    : entry.success
      ? 'Success'
      : entry.error
        ? 'Failed'
        : 'Failed'

  const actionCell = el('div', 'log-cell log-cell-action')
  if (entry.reversible && !entry.undone) {
    actionCell.append(
      IconBtn({
        svg: icons.undo,
        label: 'Undo',
        onClick: (e) => {
          e.stopPropagation()
          undoLog(entry.id)
          refresh()
        },
      }),
    )
  } else if (!entry.success) {
    actionCell.append(
      IconBtn({
        svg: icons.refresh,
        label: 'Retry',
        onClick: (e) => {
          e.stopPropagation()
          retryLog(entry.id)
          refresh()
        },
      }),
    )
  }

  return tableSelectRow({
    rowClass: 'log-history-row',
    selected,
    stateClass: entry.undone ? 'undone' : entry.success ? 'ok' : 'fail',
    cells: [
      tableCell(relativeTime(entry.at), 'log-cell-time'),
      tableCell(entry.automationName),
      tableCell(labelPathText(entry.action, state.pathVariables)),
      tableCell(result, entry.undone ? '' : entry.success ? 'ok' : 'fail'),
      actionCell,
    ],
    onSelect,
  })
}

function buildLogDetail(
  entry: LogEntry,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const connector = state.connectors.find((c) => c.id === entry.connectorId)
  const automation = state.automations.find(
    (a) => a.name === entry.automationName,
  )
  const vars = state.pathVariables

  const panel = el('section', 'log-detail')

  const primaryAction = logPrimaryAction(entry, refresh)
  const head = el('div', 'detail-head')
  const copy = el('div', 'detail-copy')
  copy.append(detailTitleRow(entry.automationName, primaryAction))
  head.append(connectorIconTile(entry.connectorId), copy)
  panel.append(head)

  panel.append(
    detailDescription(
      entry.undone
        ? labelPathText(entry.summary, vars)
        : entry.success
          ? labelPathText(entry.action, vars)
          : entry.error ?? labelPathText(entry.action, vars),
    ),
  )

  const moves = entry.moves ?? []
  const stats = [
    metaGridCell('When', relativeTime(entry.at)),
    metaGridCell('Connector', connector?.name ?? entry.connectorId),
    metaGridCell('Result', logResultLabel(entry)),
    metaGridCell(
      'Files',
      moves.length ? String(moves.length) : entry.reversible ? '—' : '—',
    ),
  ]
  panel.append(metaGrid(stats))

  if (moves.length) {
    panel.append(logDestinationsBlock(moves, vars))
  }

  const navActions: HTMLElement[] = []
  if (automation) {
    navActions.push(
      Btn({
        label: 'Open automation',
        variant: 'ghost',
        onClick: () => navigate('automations'),
      }),
    )
  }
  if (connector) {
    navActions.push(
      Btn({
        label: 'Open connector',
        variant: 'ghost',
        onClick: () => navigate('connectors'),
      }),
    )
  }
  if ((entry.moves?.length ?? 0) > 0) {
    const detailed = quietAction('Detailed log', () =>
      openDetailedLog(entry.id),
    )
    detailed.classList.add('log-detail-detailed-link')
    navActions.push(detailed)
  }
  if (navActions.length) {
    panel.append(detailActions(navActions))
  }

  const related = state.logs
    .filter(
      (l) =>
        l.id !== entry.id &&
        !isNoiseLogEntry(l) &&
        (l.automationName === entry.automationName ||
          l.connectorId === entry.connectorId),
    )
    .slice(0, 4)

  if (related.length) {
    const block = el('div', 'log-detail-block')
    block.append(sectionLabel('Related'))
    const list = el('div', 'log-related-list')
    for (const item of related) {
      const row = el(
        'div',
        `log-related-row ${item.success ? 'ok' : 'fail'}`,
      )
      row.append(
        el('span', 'log-related-time', [relativeTime(item.at)]),
        el('span', 'log-related-summary', [
          labelPathText(item.action, vars),
        ]),
      )
      list.append(row)
    }
    block.append(list)
    panel.append(block)
  }

  return panel
}

function isNoiseLogEntry(entry: LogEntry) {
  const action = entry.action?.trim() ?? ''
  const summary = entry.summary?.trim() ?? ''
  if (/^fs\.(move|copy|rename|delete|mkdir)$/i.test(action)) return true
  if (action === 'fs' || action === 'automation') return true
  if (/^(Moved|Copied|Renamed|Deleted|Created directory)\b/i.test(summary)) {
    return true
  }
  return false
}

function destFolder(toPath: string) {
  const normalized = toPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx > 0 ? normalized.slice(0, idx) : normalized
}

/** Destination folder summary for the detail panel — files live in Detailed log. */
function logDestinationsBlock(
  moves: { from: string; to: string }[],
  vars: ReturnType<typeof getState>['pathVariables'],
) {
  const byDest = new Map<string, number>()
  for (const move of moves) {
    const folder = destFolder(move.to)
    byDest.set(folder, (byDest.get(folder) ?? 0) + 1)
  }

  const groups = [...byDest.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )

  const block = el('div', 'log-detail-block')
  block.append(sectionLabel('Destinations'))

  const list = el('div', 'log-dest-list')
  for (const [folder, count] of groups) {
    const row = el('div', 'log-dest-row')
    row.title = folder
    row.append(
      el('span', 'log-dest-folder', [labelPathText(folder, vars)]),
      el('span', 'log-dest-count', [
        `${count} file${count === 1 ? '' : 's'}`,
      ]),
    )
    list.append(row)
  }
  block.append(list)
  return block
}

function logResultLabel(entry: LogEntry) {
  if (entry.undone) return 'Undone'
  if (entry.success) return 'Success'
  return 'Failed'
}

/** Muted text action — same weight as dashboard “Manage”. */
function quietAction(label: string, onClick: () => void) {
  const btn = button('connector-action ghost pill quiet-action', label)
  btn.type = 'button'
  btn.addEventListener('click', onClick)
  return btn
}

function logPrimaryAction(
  entry: LogEntry,
  refresh: () => void,
): HTMLElement | undefined {
  if (entry.reversible && !entry.undone) {
    return quietAction('Undo', () => {
      undoLog(entry.id)
      refresh()
    })
  }
  if (!entry.success && !entry.undone) {
    return quietAction('Retry', () => {
      retryLog(entry.id)
      refresh()
    })
  }
  return undefined
}
