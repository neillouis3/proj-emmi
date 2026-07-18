import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { relativeTime } from '@/lib/format'
import { formatKeybind } from '@/lib/keybind'
import { icons } from '@/lib/icons'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import {
  getState,
  navigate,
  runAutomation,
  toggleAutomation,
} from '@/app/store'
import type { Automation, LogEntry } from '@/types/domain'

type AutomationFilter = 'all' | 'active' | 'paused'

export function Automations() {
  const page = el('div', 'screen settings-screen')
  let filter: AutomationFilter = 'all'
  let selectedId: string | null = null
  const body = el('div', 'screen-body automation-page')

  const render = () => {
    const state = getState()
    const active = state.automations.filter((a) => a.active)
    const paused = state.automations.filter((a) => !a.active)
    const visible =
      filter === 'active' ? active : filter === 'paused' ? paused : state.automations

    if (!visible.some((a) => a.id === selectedId)) {
      selectedId = visible[0]?.id ?? null
    }
    const selected = visible.find((a) => a.id === selectedId) ?? null

    const pendingLinked = state.pending.filter((p) => p.automationId).length

    const create = button('btn btn-ghost btn-compact', 'New Automation')
    create.addEventListener('click', () => navigate('automation-new'))

    page.replaceChildren()
    body.replaceChildren()

    body.append(
      PageToolbar({
        leading: [
          filterTabs(
            [
              { value: 'all', label: 'All' },
              { value: 'active', label: `Active (${active.length})` },
              { value: 'paused', label: `Paused (${paused.length})` },
            ],
            filter,
            (next) => {
              filter = next as AutomationFilter
              render()
            },
          ),
        ],
        actions: [create],
      }),
    )

    if (!state.automations.length) {
      body.append(
        EmptyState({
          title: 'No automations yet',
          body: 'Create one from here or the menu bar.',
          actionLabel: 'New Automation',
          onAction: () => navigate('automation-new'),
        }),
      )
      page.append(body)
      return
    }

    if (!visible.length) {
      body.append(
        EmptyState({
          title: filter === 'active' ? 'No active automations' : 'No paused automations',
          body: 'Switch filters to see the rest.',
        }),
      )
      page.append(body)
      return
    }

    const split = el('div', 'automation-split')
    const main = el('div', 'automation-main')
    const table = el('div', 'log-table automation-table')
    table.append(headRow())
    for (const automation of visible) {
      table.append(
        automationTableRow(
          automation,
          automation.id === selectedId,
          () => {
            selectedId = automation.id
            render()
          },
          render,
        ),
      )
    }
    main.append(table)

    if (pendingLinked) {
      const banner = button('automation-pending-banner')
      banner.type = 'button'
      banner.append(
        el('span', undefined, [
          `${pendingLinked} item${pendingLinked === 1 ? '' : 's'} waiting in Review`,
        ]),
        el('span', 'automation-pending-action', ['Open']),
      )
      banner.addEventListener('click', () => navigate('review'))
      main.append(banner)
    }

    const side = el('aside', 'automation-side')
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
  const row = el('div', 'log-table-row head automation-table-row')
  for (const label of ['Name', 'Trigger', 'Status', 'Last ran', '']) {
    row.append(cell(label))
  }
  return row
}

function automationTableRow(
  automation: Automation,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const row = button(
    `log-table-row automation-table-row${selected ? ' is-selected' : ''}${
      automation.active ? '' : ' is-paused'
    }`,
  )
  row.type = 'button'

  const actions = el('div', 'log-cell log-cell-action')
  const run = iconBtn(icons.play, 'Run now', (e) => {
    e.stopPropagation()
    runAutomation(automation.id)
    refresh()
  })
  if (!automation.active) run.disabled = true

  actions.append(
    run,
    iconBtn(
      automation.active ? icons.pause : icons.play,
      automation.active ? 'Pause' : 'Resume',
      (e) => {
        e.stopPropagation()
        toggleAutomation(automation.id)
        refresh()
      },
    ),
  )

  row.append(
    cell(automation.name),
    cell(
      automation.keybind && automation.keybindEnabled
        ? `${automation.triggerSummary} · ${formatKeybind(automation.keybind)}`
        : automation.triggerSummary,
    ),
    cell(
      automation.active ? 'Active' : 'Paused',
      automation.active ? 'ok' : 'paused',
    ),
    cell(
      automation.lastRunAt ? relativeTime(automation.lastRunAt) : 'Never',
      'log-cell-time',
    ),
    actions,
  )
  row.addEventListener('click', onSelect)
  return row
}

function detailPanel(
  automation: Automation,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const pending = state.pending.filter((p) => p.automationId === automation.id)
  const logs = state.logs
    .filter((l) => l.automationName === automation.name)
    .slice(0, 4)

  const panel = el('section', 'automation-detail')
  const head = el('div', 'automation-detail-head')
  const copy = el('div', 'automation-detail-copy')
  copy.append(
    el('div', 'automation-detail-title', [automation.name]),
    el('div', 'automation-detail-meta', [
      `${automation.active ? 'Active' : 'Paused'} · ${automation.triggerSummary}`,
    ]),
  )
  head.append(copy)
  panel.append(head)

  if (automation.description) {
    panel.append(el('div', 'automation-detail-desc', [automation.description]))
  }

  const actions = el('div', 'automation-detail-actions')
  const run = button('btn btn-primary btn-compact', 'Run now')
  run.type = 'button'
  run.addEventListener('click', () => {
    runAutomation(automation.id)
    refresh()
  })
  if (!automation.active) run.disabled = true
  actions.append(
    run,
    textBtn(automation.active ? 'Pause' : 'Resume', true, () => {
      toggleAutomation(automation.id)
      refresh()
    }),
    textBtn('Edit', true, () => navigate('automation-new')),
  )
  panel.append(actions)

  const facts = el('div', 'automation-detail-facts')
  facts.append(
    fact('Trigger', automation.triggerSummary),
    fact('Default mode', automation.defaultMode),
    fact(
      'Last run',
      automation.lastRunAt ? relativeTime(automation.lastRunAt) : 'Never',
    ),
    fact(
      'Keybind',
      state.keybinds.enabled
        ? shortcutLabel(automation)
        : `${shortcutLabel(automation)} · keybinds disabled`,
    ),
  )
  panel.append(facts)

  const keybindActions = el('div', 'automation-detail-row')
  const manageKeybinds = button('btn btn-ghost btn-compact', 'Manage keybinds')
  manageKeybinds.type = 'button'
  manageKeybinds.addEventListener('click', () => navigate('keybinds'))
  keybindActions.append(manageKeybinds)
  panel.append(keybindActions)

  const steps = el('div', 'automation-detail-steps')
  steps.append(el('div', 'review-report-label', ['Steps']))
  const list = el('div', 'automation-step-cards')
  for (const [index, step] of automation.steps.entries()) {
    const row = el('div', 'automation-step-card')
    const logo = connectorIconTile(step.connectorId, true)
    const stepCopy = el('div', 'automation-step-copy')
    stepCopy.append(
      el('div', 'automation-step-title', [
        `${index + 1}. ${step.operation}`,
      ]),
      el('div', 'automation-step-meta', [
        step.params
          ? labelPathText(step.params, state.pathVariables)
          : 'No params',
      ]),
    )
    row.append(logo, stepCopy)
    list.append(row)
  }
  steps.append(list)
  panel.append(steps)

  if (pending.length) {
    const block = el('div', 'automation-detail-block')
    block.append(el('div', 'dashboard-section-title', ['In review']))
    const row = el('div', 'automation-detail-row')
    row.append(
      el('div', 'automation-detail-note', [
        `${pending.length} item${pending.length === 1 ? '' : 's'} waiting for approval.`,
      ]),
    )
    const openReview = button('btn btn-ghost btn-compact', 'Open Review')
    openReview.type = 'button'
    openReview.addEventListener('click', () => navigate('review'))
    row.append(openReview)
    block.append(row)
    panel.append(block)
  }

  if (logs.length) {
    const block = el('div', 'automation-detail-block')
    block.append(el('div', 'dashboard-section-title', ['Recent runs']))
    const listEl = el('div', 'automation-run-list')
    for (const entry of logs) {
      listEl.append(logRow(entry, state))
    }
    block.append(listEl)
    panel.append(block)
  }

  return panel
}

function logRow(entry: LogEntry, state: ReturnType<typeof getState>) {
  const summary = entry.undone
    ? 'Undone'
    : entry.success
      ? labelPathText(entry.action, state.pathVariables)
      : (entry.error ?? 'Failed')
  const row = el('div', `automation-run-row ${entry.success ? 'ok' : 'fail'}`)
  row.append(
    el('span', 'automation-run-time', [relativeTime(entry.at)]),
    el('span', 'automation-run-summary', [summary]),
  )
  return row
}

function fact(label: string, value: string) {
  const row = el('div', 'review-report-row')
  row.append(
    el('span', 'review-report-label', [label]),
    el('span', 'review-report-value', [value]),
  )
  return row
}

function shortcutLabel(automation: Automation) {
  if (automation.keybind && automation.keybindEnabled) {
    return formatKeybind(automation.keybind)
  }
  if (automation.keybind) return `${formatKeybind(automation.keybind)} (off)`
  return 'None'
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
