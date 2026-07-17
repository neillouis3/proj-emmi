import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { FilterBar } from '@/components/shared/FilterBar'
import { relativeTime } from '@/lib/format'
import { icons } from '@/lib/icons'
import { connectorLogo } from '@/lib/connectorLogos'
import {
  getState,
  navigate,
  retryLog,
  undoLog,
} from '@/app/store'
import type { LogEntry } from '@/types/domain'

export function Log() {
  const page = el('div', 'screen settings-screen')
  let search = ''
  let resultFilter = 'all'
  let rangeFilter = 'all'
  let connectorFilter = 'all'
  let selectedId: string | null = null
  const body = el('div', 'screen-body log-page')

  const render = () => {
    const state = getState()
    const all = [...state.logs]
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
    if (connectorFilter !== 'all') {
      items = items.filter((l) => l.connectorId === connectorFilter)
    }
    if (rangeFilter === '24h') {
      items = items.filter((l) => now - +new Date(l.at) <= 24 * 3600_000)
    } else if (rangeFilter === '7d') {
      items = items.filter((l) => now - +new Date(l.at) <= 7 * 24 * 3600_000)
    }

    if (!items.some((l) => l.id === selectedId)) {
      selectedId = items[0]?.id ?? null
    }
    const selected = items.find((l) => l.id === selectedId) ?? null

    page.replaceChildren()
    body.replaceChildren()

    body.append(
      PageToolbar({
        leading: [
          filterTabs(
            [
              { value: 'all', label: 'All' },
              ...state.connectors.map((c) => ({ value: c.id, label: c.name })),
            ],
            connectorFilter,
            (next) => {
              connectorFilter = next
              render()
            },
          ),
          FilterBar([
            {
              type: 'search',
              placeholder: 'Search…',
              value: search,
              onChange: (v) => {
                search = v
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

    const split = el('div', 'log-split')
    const main = el('div', 'log-main-col')

    const table = el('div', 'log-table log-history-table')
    table.append(headRow())
    for (const entry of items) {
      table.append(
        logTableRow(
          entry,
          entry.id === selectedId,
          () => {
            selectedId = entry.id
            render()
          },
          render,
        ),
      )
    }
    main.append(table)

    const side = el('aside', 'log-side')
    if (selected) {
      side.append(detailPanel(selected, state, render))
    }

    split.append(main, side)
    body.append(split)
    page.append(body)
  }

  render()
  return page
}

function headRow() {
  const row = el('div', 'log-table-row head')
  for (const label of ['Time', 'Automation', 'Details', 'Result', '']) {
    row.append(cell(label))
  }
  return row
}

function logTableRow(
  entry: LogEntry,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const result = entry.undone
    ? 'Undone'
    : entry.success
      ? 'Success'
      : entry.error
        ? `Failed`
        : 'Failed'

  const row = button(
    `log-table-row log-history-row ${
      entry.undone ? 'undone' : entry.success ? 'ok' : 'fail'
    }${selected ? ' is-selected' : ''}`,
  )
  row.type = 'button'

  const actionCell = el('div', 'log-cell log-cell-action')
  if (entry.reversible && !entry.undone) {
    actionCell.append(
      iconBtn(icons.undo, 'Undo', (e) => {
        e.stopPropagation()
        undoLog(entry.id)
        refresh()
      }),
    )
  } else if (!entry.success) {
    actionCell.append(
      iconBtn(icons.refresh, 'Retry', (e) => {
        e.stopPropagation()
        retryLog(entry.id)
        refresh()
      }),
    )
  }

  row.append(
    cell(relativeTime(entry.at), 'log-cell-time'),
    cell(entry.automationName),
    cell(entry.action),
    cell(result, entry.undone ? '' : entry.success ? 'ok' : 'fail'),
    actionCell,
  )
  row.addEventListener('click', onSelect)
  return row
}

function detailPanel(
  entry: LogEntry,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const connector = state.connectors.find((c) => c.id === entry.connectorId)
  const automation = state.automations.find(
    (a) => a.name === entry.automationName,
  )

  const panel = el('section', 'log-detail')
  const head = el('div', 'log-detail-head')
  const logo = el('span', `connector-logo tone-${entry.connectorId}`)
  logo.innerHTML = connectorLogo(entry.connectorId)
  const copy = el('div', 'log-detail-copy')
  copy.append(
    el('div', 'log-detail-title', [entry.automationName]),
    el('div', 'log-detail-meta', [
      `${relativeTime(entry.at)} · ${connector?.name ?? entry.connectorId}`,
    ]),
  )
  head.append(logo, copy)
  panel.append(head)

  const status = el(
    'div',
    `log-detail-status ${
      entry.undone ? 'undone' : entry.success ? 'ok' : 'fail'
    }`,
    [
      entry.undone
        ? 'Undone'
        : entry.success
          ? 'Success'
          : entry.error
            ? `Failed · ${entry.error}`
            : 'Failed',
    ],
  )
  panel.append(status)

  const actions = el('div', 'log-detail-actions')
  if (entry.reversible && !entry.undone) {
    actions.append(
      textBtn('Undo', false, () => {
        undoLog(entry.id)
        refresh()
      }),
    )
  } else if (!entry.success) {
    actions.append(
      textBtn('Retry', false, () => {
        retryLog(entry.id)
        refresh()
      }),
    )
  }
  if (automation) {
    actions.append(
      textBtn('Open automation', true, () => navigate('automations')),
    )
  }
  if (connector) {
    actions.append(
      textBtn('Open connector', true, () => navigate('connectors')),
    )
  }
  if (actions.childNodes.length) panel.append(actions)

  const facts = el('div', 'log-detail-facts')
  facts.append(
    fact('Summary', entry.summary),
    fact('Action', entry.action),
    fact('Connector', connector?.name ?? entry.connectorId),
    fact('Reversible', entry.reversible ? 'Yes' : 'No'),
  )
  if (entry.error) facts.append(fact('Error', entry.error))
  panel.append(facts)

  const related = state.logs
    .filter(
      (l) =>
        l.id !== entry.id &&
        (l.automationName === entry.automationName ||
          l.connectorId === entry.connectorId),
    )
    .slice(0, 4)

  if (related.length) {
    const block = el('div', 'log-detail-block')
    block.append(el('div', 'dashboard-section-title', ['Related']))
    const list = el('div', 'log-related-list')
    for (const item of related) {
      const row = el(
        'div',
        `log-related-row ${item.success ? 'ok' : 'fail'}`,
      )
      row.append(
        el('span', 'log-related-time', [relativeTime(item.at)]),
        el('span', 'log-related-summary', [item.action]),
      )
      list.append(row)
    }
    block.append(list)
    panel.append(block)
  }

  return panel
}

function fact(label: string, value: string) {
  const row = el('div', 'review-report-row')
  row.append(
    el('span', 'review-report-label', [label]),
    el('span', 'review-report-value', [value]),
  )
  return row
}

function cell(text: string, extra = '') {
  return el('div', `log-cell ${extra}`.trim(), [text])
}

function filterTabs(
  options: { value: string; label: string }[],
  current: string,
  onChange: (value: string) => void,
) {
  const bar = el('div', 'connector-tabs')
  for (const option of options) {
    const tab = button(
      `connector-tab${option.value === current ? ' active' : ''}`,
      option.label,
    )
    tab.addEventListener('click', () => onChange(option.value))
    bar.append(tab)
  }
  return bar
}

function textBtn(label: string, ghost: boolean, onClick: () => void) {
  const btn = button(
    `btn ${ghost ? 'btn-ghost' : 'btn-primary'} btn-compact`,
    label,
  )
  btn.addEventListener('click', onClick)
  return btn
}

function iconBtn(
  svg: string,
  label: string,
  onClick: (e: MouseEvent) => void,
) {
  const btn = button('btn btn-icon')
  btn.type = 'button'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = svg
  btn.addEventListener('click', onClick)
  return btn
}
