import { el, button } from '@/lib/dom'
import { Btn, IconBtn } from '@/components/shared/controls'
import {
  alertBanner,
  dataTable,
  detailActions,
  detailDescription,
  detailPanel,
  detailTitleRow,
  EmptyState,
  metaGrid,
  metaGridCell,
  PageToolbar,
  sectionLabel,
  splitView,
  tableCell,
  tableSelectRow,
  Tabs,
} from '@/components/shared/layout'
import { relativeTime } from '@/lib/format'
import { formatKeybind } from '@/lib/keybind'
import { formatRunMode } from '@/lib/runMode'
import { icons } from '@/lib/icons'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import {
  automationDescription,
  setRuleCatalog,
  stepDetailLines,
  stepFn,
} from '@/lib/rules'
import { normalizeStep } from '@/lib/stepOps'
import { rulesForConnectorFallback } from '@/lib/ruleDef'
import {
  editAutomation,
  filterInstalledAutomations,
  getState,
  navigate,
  newAutomation,
  runAutomation,
  toggleAutomation,
} from '@/app/store'
import { bindScreen } from '@/lib/bindScreen'
import type { Automation, AutomationStep, LogEntry } from '@/types/domain'

type AutomationFilter = 'all' | 'active' | 'paused'

export function Automations() {
  const page = el('div', 'screen settings-screen')
  let filter: AutomationFilter = 'all'
  let selectedId: string | null = null
  const body = el('div', 'screen-body automation-page')

  const render = () => {
    const state = getState()
    const installed = filterInstalledAutomations(state.automations)
    const active = installed.filter((a) => a.active)
    const paused = installed.filter((a) => !a.active)
    const visible =
      filter === 'active' ? active : filter === 'paused' ? paused : installed

    if (!visible.some((a) => a.id === selectedId)) {
      selectedId = visible[0]?.id ?? null
    }
    const selected = visible.find((a) => a.id === selectedId) ?? null

    const pendingLinked = state.pending.filter((p) => p.automationId).length

    const create = button('btn btn-ghost btn-compact', 'New Automation')
    create.addEventListener('click', () => newAutomation())

    page.replaceChildren()
    body.replaceChildren()

    body.append(
      PageToolbar({
        leading: [
          Tabs({
            value: filter,
            options: [
              { value: 'all', label: 'All' },
              { value: 'active', label: `Active (${active.length})` },
              { value: 'paused', label: `Paused (${paused.length})` },
            ],
            onChange: (next) => {
              filter = next as AutomationFilter
              render()
            },
          }),
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
          onAction: () => newAutomation(),
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

    const mainChildren: HTMLElement[] = [
      dataTable({
        className: 'automation-table',
        headClass: 'automation-table-row',
        columns: ['Name', 'Trigger', 'Status', 'Last ran', ''],
        rows: visible.map((automation) =>
          automationTableRow(
            automation,
            automation.id === selectedId,
            () => {
              selectedId = automation.id
              render()
            },
            render,
          ),
        ),
      }),
    ]

    if (pendingLinked) {
      mainChildren.push(
        alertBanner({
          message: `${pendingLinked} item${pendingLinked === 1 ? '' : 's'} waiting in Review`,
          actionLabel: 'Open',
          onClick: () => navigate('review'),
        }),
      )
    }

    body.append(
      splitView({
        splitClass: 'automation-split',
        mainClass: 'automation-main',
        sideClass: 'automation-side',
        main: mainChildren,
        side: selected ? detailPanel('automation-detail', buildDetail(selected, state, render)) : null,
      }),
    )
    page.append(body)
  }

  return bindScreen(page, render)
}

function automationTableRow(
  automation: Automation,
  selected: boolean,
  onSelect: () => void,
  refresh: () => void,
) {
  const actions = el('div', 'log-cell log-cell-action')
  actions.append(
    IconBtn({
      svg: icons.play,
      label: 'Run now',
      disabled: !automation.active,
      onClick: (e) => {
        e.stopPropagation()
        runAutomation(automation.id)
        refresh()
      },
    }),
    IconBtn({
      svg: automation.active ? icons.pause : icons.play,
      label: automation.active ? 'Pause' : 'Resume',
      onClick: (e) => {
        e.stopPropagation()
        toggleAutomation(automation.id)
        refresh()
      },
    }),
  )

  return tableSelectRow({
    rowClass: 'automation-table-row',
    selected,
    paused: !automation.active,
    cells: [
      tableCell(automation.name),
      tableCell(
        automation.keybind && automation.keybindEnabled
          ? `${automation.triggerSummary} · ${formatKeybind(automation.keybind)}`
          : automation.triggerSummary,
      ),
      tableCell(
        automation.active ? 'Active' : 'Paused',
        automation.active ? 'ok' : 'paused',
      ),
      tableCell(
        automation.lastRunAt ? relativeTime(automation.lastRunAt) : 'Never',
        'log-cell-time',
      ),
      actions,
    ],
    onSelect,
  })
}

function buildDetail(
  automation: Automation,
  state: ReturnType<typeof getState>,
  refresh: () => void,
): HTMLElement[] {
  seedRuleCatalog(state)

  const logs = state.logs
    .filter((l) => l.automationName === automation.name)
    .slice(0, 5)

  const parts: HTMLElement[] = []

  const edit = button('connector-action ghost pill quiet-action', 'Edit')
  edit.type = 'button'
  edit.addEventListener('click', () => editAutomation(automation.id))
  parts.push(detailTitleRow(automation.name, edit))

  const description =
    automation.description?.trim() || automationDescription(automation)
  if (description) {
    parts.push(detailDescription(description))
  }

  parts.push(
    detailActions([
      Btn({
        label: 'Run',
        variant: 'primary',
        disabled: !automation.active,
        onClick: () => {
          runAutomation(automation.id)
          refresh()
        },
      }),
      Btn({
        label: automation.active ? 'Pause' : 'Resume',
        variant: 'ghost',
        onClick: () => {
          toggleAutomation(automation.id)
          refresh()
        },
      }),
    ]),
    metaGrid([
      metaGridCell('Trigger', automation.triggerSummary),
      metaGridCell('Mode', formatRunMode(automation.defaultMode)),
      metaGridCell(
        'Last run',
        automation.lastRunAt ? relativeTime(automation.lastRunAt) : 'Never',
      ),
      metaGridCell('Keybind', keybindMeta(state, automation)),
    ]),
  )

  const stepsSection = el('div', 'automation-detail-steps')
  stepsSection.append(sectionLabel('Steps'))
  const flow = el('div', 'automation-detail-flow')
  automation.steps.forEach((step, index) => {
    flow.append(stepReadCard(step, index, state.pathVariables))
    if (index < automation.steps.length - 1) {
      flow.append(el('div', 'automation-detail-flow-link', ['↓']))
    }
  })
  stepsSection.append(flow)
  parts.push(stepsSection)

  if (logs.length) {
    const block = el('div', 'automation-detail-runs')
    block.append(sectionLabel('Recent runs'))
    const listEl = el('div', 'automation-run-list')
    for (const entry of logs) {
      listEl.append(logRow(entry, state))
    }
    block.append(listEl)
    parts.push(block)
  }

  return parts
}

function seedRuleCatalog(state: ReturnType<typeof getState>) {
  const fromStore = state.ruleLibrary.filter((r) => r.connectorId === 'fs')
  const rules = fromStore.length ? fromStore : rulesForConnectorFallback('fs')
  if (rules.length) setRuleCatalog(rules)
}

function keybindMeta(
  state: ReturnType<typeof getState>,
  automation: Automation,
): HTMLElement {
  const wrap = el('span', 'detail-meta-value automation-detail-meta-value')
  const label = shortcutLabel(automation)
  if (!state.keybinds.enabled) {
    wrap.textContent = 'Off globally'
    return wrap
  }
  if (automation.keybind && automation.keybindEnabled) {
    wrap.textContent = label
    return wrap
  }
  wrap.textContent = label === 'None' ? 'None' : label
  if (label === 'None' || !automation.keybindEnabled) {
    const link = button('automation-detail-link')
    link.type = 'button'
    link.textContent = label === 'None' ? 'Add' : 'Enable'
    link.addEventListener('click', () => navigate('keybinds'))
    wrap.append(document.createTextNode(' · '), link)
  }
  return wrap
}

function stepReadCard(
  step: AutomationStep,
  index: number,
  pathVariables: ReturnType<typeof getState>['pathVariables'],
) {
  const normalized = normalizeStep(step)
  const fn = stepFn(normalized)
  const fnLabel =
    normalized.connectorId && normalized.connectorId !== 'fs'
      ? `${normalized.connectorId}.${fn}`
      : fn
  const card = el('div', 'automation-detail-step')
  const head = el('div', 'automation-detail-step-head')
  head.append(
    el('span', 'automation-detail-step-index', [String(index + 1)]),
    connectorIconTile(normalized.connectorId, true),
    el('div', 'automation-detail-step-copy', [
      el('span', 'automation-detail-step-fn', [fnLabel]),
    ]),
  )
  card.append(head)

  const lines = stepDetailLines(normalized, pathVariables)
  if (lines.length) {
    const params = el('div', 'automation-detail-step-params')
    for (const line of lines) {
      const row = el(
        'div',
        `automation-detail-step-param${line.label ? '' : ' is-note'}${line.label && (normalized.fn === 'lookup' || normalized.fn === 'route') ? ' is-route' : ''}`,
      )
      if (line.label) {
        row.append(el('span', 'automation-detail-step-param-label', [line.label]))
      }
      row.append(el('span', 'automation-detail-step-param-value', [line.value]))
      params.append(row)
    }
    card.append(params)
  }

  return card
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

function shortcutLabel(automation: Automation) {
  if (automation.keybind && automation.keybindEnabled) {
    return formatKeybind(automation.keybind)
  }
  if (automation.keybind) return `${formatKeybind(automation.keybind)} (off)`
  return 'None'
}
