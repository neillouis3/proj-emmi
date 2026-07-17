import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { FilterBar } from '@/components/shared/FilterBar'
import { relativeTime } from '@/lib/format'
import { icons } from '@/lib/icons'
import { connectorLogo } from '@/lib/connectorLogos'
import {
  alwaysDoThis,
  approveAll,
  approvePending,
  getState,
  navigate,
  rejectAll,
  rejectPending,
  updatePendingAction,
} from '@/app/store'
import type { PendingAction } from '@/types/domain'

export function ReviewQueue() {
  const page = el('div', 'screen settings-screen')
  let connectorFilter = 'all'
  let automationFilter = 'all'
  let selectedId: string | null = null
  const body = el('div', 'screen-body review-page')

  const render = () => {
    const state = getState()
    const allPending = [...state.pending].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    )
    let items = allPending
    if (connectorFilter !== 'all') {
      items = items.filter((i) => i.connectorId === connectorFilter)
    }
    if (automationFilter !== 'all') {
      items = items.filter((i) => (i.automationId ?? 'none') === automationFilter)
    }

    if (!items.some((i) => i.id === selectedId)) {
      selectedId = items[0]?.id ?? null
    }
    const selected = items.find((i) => i.id === selectedId) ?? null

    const bulk =
      items.length > 1
        ? [
            textBtn('Approve all', false, () => {
              approveAll(items.map((i) => i.id))
              render()
            }),
            textBtn('Reject all', true, () => {
              rejectAll(items.map((i) => i.id))
              render()
            }),
          ]
        : undefined

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
              type: 'select',
              label: 'Automation',
              value: automationFilter,
              options: [
                { value: 'all', label: 'All automations' },
                ...state.automations.map((a) => ({ value: a.id, label: a.name })),
              ],
              onChange: (v) => {
                automationFilter = v
                render()
              },
            },
          ]),
        ],
        actions: bulk,
      }),
    )

    if (!allPending.length) {
      body.append(
        EmptyState({
          title: 'Nothing pending',
          body: 'Automations will show up here when they need a decision.',
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
          body: 'Try another connector or automation filter.',
        }),
      )
      page.append(body)
      return
    }

    const split = el('div', 'review-split')

    const main = el('div', 'review-main')
    const table = el('div', 'log-table review-table')
    table.append(headRow())
    for (const item of items) {
      table.append(
        reviewTableRow(item, state, item.id === selectedId, () => {
          selectedId = item.id
          render()
        }, render),
      )
    }
    main.append(table)

    const side = el('aside', 'review-side')
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
  const row = el('div', 'log-table-row head review-table-row')
  for (const label of ['Time', 'Item', 'Action', 'Automation', '']) {
    row.append(cell(label))
  }
  return row
}

function reviewTableRow(
  item: PendingAction,
  state: ReturnType<typeof getState>,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const automation = state.automations.find((a) => a.id === item.automationId)
  const row = button(
    `log-table-row review-table-row${selected ? ' is-selected' : ''}`,
  )
  row.type = 'button'

  const itemCell = el('div', 'log-cell review-table-item-cell')
  const logo = el('span', `connector-logo compact tone-${item.connectorId}`)
  logo.innerHTML = connectorLogo(item.connectorId)
  itemCell.append(logo, el('span', 'review-table-item-name', [item.title]))

  const actions = el('div', 'log-cell log-cell-action')
  actions.append(
    iconBtn(icons.check, 'Approve', 'approve', (e) => {
      e.stopPropagation()
      approvePending(item.id)
      refresh()
    }),
    iconBtn(icons.x, 'Reject', 'reject', (e) => {
      e.stopPropagation()
      rejectPending(item.id)
      refresh()
    }),
  )

  row.append(
    cell(relativeTime(item.createdAt), 'log-cell-time'),
    itemCell,
    cell(item.action),
    cell(automation?.name ?? 'Manual'),
    actions,
  )
  row.addEventListener('click', onSelect)
  return row
}

function detailPanel(
  item: PendingAction,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const automation = state.automations.find((a) => a.id === item.automationId)
  const connector = state.connectors.find((c) => c.id === item.connectorId)
  const rule = state.rules.find((r) => r.id === item.sourceRuleId)

  const panel = el('section', 'review-detail')
  const head = el('div', 'review-detail-head')
  const logo = el('span', `connector-logo tone-${item.connectorId}`)
  logo.innerHTML = connectorLogo(item.connectorId)
  const copy = el('div', 'review-detail-copy')
  copy.append(
    el('div', 'review-detail-title', [item.title]),
    el('div', 'review-detail-meta', [
      `${relativeTime(item.createdAt)} · ${connector?.name ?? item.connectorId}`,
    ]),
  )
  head.append(logo, copy)
  panel.append(head)

  const actions = el('div', 'review-detail-actions')
  actions.append(
    textBtn('Approve', false, () => {
      approvePending(item.id)
      refresh()
    }),
    textBtn('Reject', true, () => {
      rejectPending(item.id)
      refresh()
    }),
  )
  panel.append(actions)

  const facts = el('div', 'review-detail-facts')
  facts.append(
    fact('Trigger', item.trigger),
    fact('Proposed', item.action),
    fact('Automation', automation?.name ?? 'Manual'),
  )
  if (item.reasoning) facts.append(fact('Why', item.reasoning))
  if (rule) {
    facts.append(
      fact('Rule', `${rule.mode} · ${rule.match}`),
    )
  }
  panel.append(facts)

  const edit = el('input', 'review-edit-input') as HTMLInputElement
  edit.type = 'text'
  edit.value = item.editableAction
  edit.addEventListener('change', () =>
    updatePendingAction(item.id, edit.value),
  )
  const editBlock = el('div', 'review-detail-edit')
  editBlock.append(el('span', 'review-report-label', ['Edit action']), edit)
  panel.append(editBlock)

  const extras = el('div', 'review-report-actions')
  extras.append(
    pillBtn('Always do this', 'ghost', () => {
      const ok = confirm(
        'Future matches like this will run automatically without asking. Continue?',
      )
      if (!ok) return
      alwaysDoThis(item.id)
      refresh()
    }),
  )
  if (rule) {
    extras.append(
      pillBtn('Open Rules', 'ghost', () => navigate('rules')),
    )
  }
  panel.append(extras)

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

function pillBtn(
  label: string,
  tone: 'primary' | 'ghost',
  onClick: () => void,
) {
  const btn = button(
    `connector-action pill${tone === 'primary' ? ' primary' : ' ghost'}`,
    label,
  )
  btn.addEventListener('click', onClick)
  return btn
}

function iconBtn(
  svg: string,
  label: string,
  tone: 'approve' | 'reject',
  onClick: (e: MouseEvent) => void,
) {
  const btn = button(`btn btn-icon tone-${tone}`)
  btn.type = 'button'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = svg
  btn.addEventListener('click', onClick)
  return btn
}

function textBtn(label: string, ghost: boolean, onClick: () => void) {
  const btn = button(
    `btn ${ghost ? 'btn-ghost' : 'btn-primary'} btn-compact`,
    label,
  )
  btn.addEventListener('click', onClick)
  return btn
}
