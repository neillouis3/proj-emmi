import { el } from '@/lib/dom'
import { Btn, IconBtn, TextField } from '@/components/shared/controls'
import {
  dataTable,
  detailDescription,
  detailTitleRow,
  EmptyState,
  metaGrid,
  metaGridCell,
  PageToolbar,
  sectionLabel,
  splitView,
  tableCell,
  tableSelectRow,
} from '@/components/shared/layout'
import { relativeTime } from '@/lib/format'
import { icons } from '@/lib/icons'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import {
  approveAll,
  approvePending,
  getState,
  navigate,
  rejectAll,
  rejectPending,
  updatePendingAction,
} from '@/app/store'
import { bindScreen } from '@/lib/bindScreen'
import type { PendingAction } from '@/types/domain'

export function ReviewQueue() {
  const page = el('div', 'screen settings-screen')
  let selectedId: string | null = null
  const body = el('div', 'screen-body review-page')

  const render = () => {
    const state = getState()
    const items = [...state.pending].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    )

    if (!items.some((i) => i.id === selectedId)) {
      selectedId = items[0]?.id ?? null
    }
    const selected = items.find((i) => i.id === selectedId) ?? null

    const bulk =
      items.length > 1
        ? [
            Btn({
              label: 'Approve all',
              variant: 'ghost',
              onClick: () => {
                approveAll(items.map((i) => i.id))
                render()
              },
            }),
            Btn({
              label: 'Reject all',
              variant: 'ghost',
              onClick: () => {
                rejectAll(items.map((i) => i.id))
                render()
              },
            }),
          ]
        : undefined

    page.replaceChildren()
    body.replaceChildren()

    if (bulk) {
      body.append(PageToolbar({ actions: bulk }))
    }

    if (!items.length) {
      body.append(
        EmptyState({
          title: 'Nothing pending',
          body: 'Items show up here when an automation needs your decision.',
          actionLabel: 'Open Automations',
          onAction: () => navigate('automations'),
        }),
      )
      page.append(body)
      return
    }

    body.append(
      splitView({
        splitClass: 'review-split',
        mainClass: 'review-main',
        sideClass: 'review-side',
        main: [
          dataTable({
            className: 'review-table',
            headClass: 'review-table-row',
            columns: ['Time', 'Item', 'Action', 'Automation', ''],
            rows: items.map((item) =>
              reviewTableRow(item, state, item.id === selectedId, () => {
                selectedId = item.id
                render()
              }, render),
            ),
          }),
        ],
        side: selected ? buildReviewDetail(selected, state, render) : null,
      }),
    )
    page.append(body)
  }

  return bindScreen(page, render)
}

function approveLabel(item: PendingAction) {
  if (item.grantKind) return 'Allow & continue'
  return 'Approve'
}

function reviewTableRow(
  item: PendingAction,
  state: ReturnType<typeof getState>,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const automation = state.automations.find((a) => a.id === item.automationId)
  const itemCell = el('div', 'log-cell review-table-item-cell')
  const logo = connectorIconTile(item.connectorId, true)
  itemCell.append(logo, el('span', 'review-table-item-name', [item.title]))

  const actions = el('div', 'log-cell log-cell-action')
  actions.append(
    IconBtn({
      svg: icons.check,
      label: approveLabel(item),
      tone: 'approve',
      onClick: (e) => {
        e.stopPropagation()
        approvePending(item.id)
        refresh()
      },
    }),
    IconBtn({
      svg: icons.x,
      label: 'Reject',
      tone: 'reject',
      onClick: (e) => {
        e.stopPropagation()
        rejectPending(item.id)
        refresh()
      },
    }),
  )

  return tableSelectRow({
    rowClass: 'review-table-row',
    selected,
    cells: [
      tableCell(relativeTime(item.createdAt), 'log-cell-time'),
      itemCell,
      tableCell(labelPathText(item.action, state.pathVariables)),
      tableCell(automation?.name ?? 'Manual'),
      actions,
    ],
    onSelect,
  })
}

function buildReviewDetail(
  item: PendingAction,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const automation = state.automations.find((a) => a.id === item.automationId)
  const connector = state.connectors.find((c) => c.id === item.connectorId)
  const vars = state.pathVariables

  const trigger = shortTrigger(item.trigger, automation?.name ?? item.title)

  const root = el('div', 'review-detail')

  const actions = el('div', 'detail-actions review-detail-actions')
  actions.append(
    Btn({
      label: 'Reject',
      variant: 'ghost',
      onClick: () => {
        rejectPending(item.id)
        refresh()
      },
    }),
    Btn({
      label: approveLabel(item),
      variant: 'primary',
      onClick: () => {
        approvePending(item.id)
        refresh()
      },
    }),
  )

  const head = el('div', 'detail-head review-detail-head')
  const copy = el('div', 'detail-copy')
  copy.append(detailTitleRow(item.title, actions))
  head.append(connectorIconTile(item.connectorId, true), copy)
  root.append(head)

  root.append(detailDescription(labelPathText(item.action, vars)))

  if (item.trustNote) {
    root.append(
      el(
        'p',
        `review-trust-note${item.undoable ? ' is-undoable' : ' is-not-undoable'}`,
        [item.trustNote],
      ),
    )
  }

  const stats = [
    metaGridCell('Queued', relativeTime(item.createdAt)),
    metaGridCell('Connector', connector?.name ?? item.connectorId),
  ]
  if (trigger) stats.push(metaGridCell('Trigger', trigger))
  stats.push(
    metaGridCell('Undo', item.undoable ? 'File moves can be undone' : 'Not undoable'),
  )
  root.append(metaGrid(stats))

  const planLines = item.plan?.length
    ? item.plan
    : parsePlanFromReasoning(item.reasoning)
  if (planLines.length) {
    const block = el('div', 'review-detail-plan')
    block.append(sectionLabel(item.grantKind ? 'What happens' : 'Plan'))
    const list = el('ol', 'review-detail-checklist')
    for (const line of planLines) {
      const row = el('li', 'review-detail-check')
      row.textContent = line.replace(/^\s+/, '')
      if (/^\s{2,}/.test(line)) row.classList.add('is-nested')
      list.append(row)
    }
    block.append(list)
    root.append(block)
  }

  const files = item.files?.length
    ? item.files.map((f) => f.split('/').pop() || f)
    : parseReasoningFiles(item.reasoning)
  if (files.length && !item.grantKind) {
    const block = el('div', 'review-detail-files')
    block.append(sectionLabel('Files'))
    const list = el('ul', 'review-detail-file-list')
    for (const name of files) {
      const row = el('li', 'review-detail-file')
      row.append(el('span', 'review-detail-file-name', [name]))
      list.append(row)
    }
    block.append(list)
    root.append(block)
  }

  const showDest =
    !item.grantKind &&
    Boolean(item.files?.length) &&
    /move|route|destination/i.test(item.editableAction + item.action)
  if (showDest) {
    const dest = el('div', 'review-detail-destination')
    dest.append(sectionLabel('Destination'))
    dest.append(
      TextField({
        value: item.editableAction,
        placeholder: 'Move to…',
        className: 'review-detail-destination-field',
        onChange: (value) => updatePendingAction(item.id, value),
      }),
    )
    root.append(dest)
  }

  return root
}

function shortTrigger(trigger: string, automationName?: string): string | null {
  const text = trigger.trim()
  if (!text) return null
  if (automationName && text.endsWith(` · ${automationName}`)) {
    const prefix = text.slice(0, -(automationName.length + 3)).trim()
    return prefix || null
  }
  return text
}

function parseReasoningFiles(text?: string) {
  if (!text) return []
  if (text.includes('\n') && !text.includes(',')) return []
  return text.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
}

function parsePlanFromReasoning(text?: string) {
  if (!text) return []
  if (!text.includes('\n')) return []
  return text.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim())
}
