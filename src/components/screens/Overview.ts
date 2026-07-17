import { el, button } from '@/lib/dom'
import { EmptyState } from '@/components/shared/EmptyState'
import { relativeTime } from '@/lib/format'
import { icons } from '@/lib/icons'
import { connectorLogo } from '@/lib/connectorLogos'
import {
  approvePending,
  counts,
  getState,
  navigate,
  promoteRule,
  recentRuns,
  rejectPending,
  restartDaemon,
  runAutomation,
} from '@/app/store'
import type { Automation, PendingAction, RecentRun, Rule } from '@/types/domain'

type ActivityFilter = 'all' | 'pending' | 'completed' | 'failed'

export function Overview() {
  const page = el('div', 'screen settings-screen')
  let filter: ActivityFilter = 'all'
  const body = el('div', 'screen-body dashboard-page')

  const render = () => {
    const state = getState()
    const stats = counts(state)
    const process = processCopy(state.daemonStatus)
    const pending = [...state.pending].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    )
    const needsAuth = state.connectors.filter((c) => c.authStatus === 'expired')
    const promote = state.rules.filter((r) => r.promoteSuggested && !r.neverPromote)
    const activeAutos = [...state.automations]
      .filter((a) => a.active)
      .sort((a, b) => +new Date(b.lastRunAt ?? 0) - +new Date(a.lastRunAt ?? 0))
      .slice(0, 4)

    page.replaceChildren()
    body.replaceChildren()

    const health = el('div', `dashboard-health tone-${process.tone}`)
    const healthLeft = el('div', 'dashboard-health-left')
    healthLeft.append(
      el('span', 'dashboard-health-dot'),
      el('span', 'dashboard-health-text', [
        `${process.label} · ${stats.automationsActive} active · ${stats.connectorsConnected} connected`,
      ]),
    )
    health.append(healthLeft)

    if (state.daemonStatus === 'crashed' || state.daemonStatus === 'stopped') {
      const restart = button('connector-action pill primary', 'Restart')
      restart.addEventListener('click', () => {
        restartDaemon()
        render()
      })
      health.append(restart)
    }

    body.append(health)

    if (needsAuth.length) {
      const auth = button('dashboard-attention')
      auth.type = 'button'
      auth.append(
        el('div', 'dashboard-attention-copy', [
          el('div', 'dashboard-attention-title', [
            needsAuth.length === 1
              ? `${needsAuth[0].name} needs re-auth`
              : `${needsAuth.length} connectors need re-auth`,
          ]),
          el('div', 'dashboard-attention-meta', [
            'Reconnect so automations can keep running.',
          ]),
        ]),
        el('span', 'dashboard-attention-action', ['Fix']),
      )
      auth.addEventListener('click', () => navigate('connectors'))
      body.append(auth)
    }

    const split = el('div', 'dashboard-split')

    const reviewSection = el('section', 'dashboard-section dashboard-main-col')
    const reviewHead = el('div', 'dashboard-section-head')
    reviewHead.append(el('div', 'dashboard-section-title', ['Needs review']))
    if (pending.length) {
      const all = button('connector-action ghost pill', 'View all')
      all.addEventListener('click', () => navigate('review'))
      reviewHead.append(all)
    }
    reviewSection.append(reviewHead)

    if (!pending.length) {
      reviewSection.append(
        el('div', 'dashboard-empty-inline', [
          'Nothing waiting. New review items will land here.',
        ]),
      )
    } else {
      const table = el('div', 'log-table dashboard-review-table')
      table.append(reviewHeadRow())
      for (const item of pending.slice(0, 6)) {
        table.append(reviewTableRow(item, render))
      }
      reviewSection.append(table)
      if (pending.length > 6) {
        const more = button('dashboard-more')
        more.type = 'button'
        more.textContent = `View ${pending.length - 6} more`
        more.addEventListener('click', () => navigate('review'))
        reviewSection.append(more)
      }
    }

    const side = el('div', 'dashboard-side')

    const autoSection = el('section', 'dashboard-section')
    const autoHead = el('div', 'dashboard-section-head')
    autoHead.append(el('div', 'dashboard-section-title', ['Automations']))
    const manage = button('connector-action ghost pill', 'Manage')
    manage.addEventListener('click', () => navigate('automations'))
    autoHead.append(manage)
    autoSection.append(autoHead)

    if (!activeAutos.length) {
      autoSection.append(
        el('div', 'dashboard-empty-inline compact', [
          'No active automations yet.',
        ]),
      )
    } else {
      const list = el('div', 'dashboard-side-list')
      for (const automation of activeAutos) {
        list.append(automationRow(automation, render))
      }
      autoSection.append(list)
    }
    side.append(autoSection)

    if (promote.length) {
      const promoteSection = el('section', 'dashboard-section')
      promoteSection.append(
        el('div', 'dashboard-section-head', [
          el('div', 'dashboard-section-title', ['Ready to auto']),
        ]),
      )
      const list = el('div', 'dashboard-side-list')
      for (const rule of promote.slice(0, 3)) {
        list.append(promoteRow(rule, render))
      }
      promoteSection.append(list)
      side.append(promoteSection)
    }

    const shortcuts = el('section', 'dashboard-section')
    shortcuts.append(
      el('div', 'dashboard-section-head', [
        el('div', 'dashboard-section-title', ['Shortcuts']),
      ]),
    )
    const links = el('div', 'dashboard-shortcuts')
    links.append(
      shortcutBtn('New automation', icons.spark, () =>
        window.emmi.openPanel?.('automation-new'),
      ),
      shortcutBtn('New rule', icons.rules, () => navigate('rules')),
      shortcutBtn('Connectors', icons.plug, () => navigate('connectors')),
      shortcutBtn('Open log', icons.history, () => navigate('log')),
    )
    shortcuts.append(links)
    side.append(shortcuts)

    split.append(reviewSection, side)
    body.append(split)

    const activity = el('section', 'dashboard-section')
    const activityHead = el('div', 'dashboard-section-head')
    activityHead.append(
      el('div', 'dashboard-section-title', ['Recent activity']),
      filterTabs(
        [
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'completed', label: 'Completed' },
          { value: 'failed', label: 'Failed' },
        ],
        filter,
        (next) => {
          filter = next as ActivityFilter
          render()
        },
      ),
    )
    activity.append(activityHead)

    let runs = recentRuns(state, 10)
    if (filter !== 'all') runs = runs.filter((r) => r.kind === filter)

    if (!runs.length) {
      activity.append(
        EmptyState({
          title: 'No recent activity',
          body:
            filter === 'all'
              ? 'Runs and review items will show up here.'
              : 'Nothing matches this filter.',
        }),
      )
    } else {
      const table = el('div', 'log-table dashboard-activity-table')
      table.append(activityHeadRow())
      for (const run of runs) table.append(activityTableRow(run))
      activity.append(table)
    }

    body.append(activity)
    page.append(body)
  }

  render()
  return page
}

function automationRow(automation: Automation, refresh: () => void) {
  const row = el('div', 'dashboard-side-row')
  const copy = el('div', 'dashboard-side-copy')
  copy.append(
    el('div', 'dashboard-side-title', [automation.name]),
    el('div', 'dashboard-side-meta', [
      automation.lastRunAt
        ? `Ran ${relativeTime(automation.lastRunAt)}`
        : automation.triggerSummary,
    ]),
  )
  const run = button('btn btn-icon')
  run.type = 'button'
  run.title = 'Run'
  run.setAttribute('aria-label', 'Run')
  run.innerHTML = icons.play
  run.addEventListener('click', () => {
    runAutomation(automation.id)
    refresh()
  })
  row.append(copy, run)
  return row
}

function promoteRow(rule: Rule, refresh: () => void) {
  const row = el('div', 'dashboard-side-row')
  const logo = el('span', `connector-logo compact tone-${rule.connectorId}`)
  logo.innerHTML = connectorLogo(rule.connectorId)
  const copy = el('div', 'dashboard-side-copy')
  copy.append(
    el('div', 'dashboard-side-title', [rule.action]),
    el('div', 'dashboard-side-meta', [
      `Approved ${rule.approvalCount}× · switch to Auto`,
    ]),
  )
  const go = button('connector-action pill primary', 'Auto')
  go.addEventListener('click', () => {
    promoteRule(rule.id)
    refresh()
  })
  row.append(logo, copy, go)
  return row
}

function shortcutBtn(label: string, svg: string, onClick: () => void) {
  const btn = button('dashboard-shortcut')
  btn.type = 'button'
  const icon = el('span', 'dashboard-shortcut-icon')
  icon.innerHTML = svg
  btn.append(icon, el('span', undefined, [label]))
  btn.addEventListener('click', onClick)
  return btn
}

function reviewHeadRow() {
  const row = el('div', 'log-table-row head dashboard-review-table-row')
  for (const label of ['Time', 'Item', 'Action', '']) {
    row.append(activityCell(label))
  }
  return row
}

function reviewTableRow(item: PendingAction, refresh: () => void) {
  const row = el('div', 'log-table-row dashboard-review-table-row')
  const actions = el('div', 'log-cell log-cell-action')
  actions.append(
    iconBtn(icons.check, 'Approve', 'approve', () => {
      approvePending(item.id)
      refresh()
    }),
    iconBtn(icons.x, 'Reject', 'reject', () => {
      rejectPending(item.id)
      refresh()
    }),
  )
  row.append(
    activityCell(relativeTime(item.createdAt), 'log-cell-time'),
    activityCell(item.title),
    activityCell(item.action),
    actions,
  )
  return row
}

function processCopy(status: ReturnType<typeof getState>['daemonStatus']) {
  if (status === 'running') return { label: 'Running', tone: 'running' as const }
  if (status === 'idle') return { label: 'Idle', tone: 'idle' as const }
  if (status === 'crashed') return { label: 'Crashed', tone: 'crashed' as const }
  return { label: 'Stopped', tone: 'stopped' as const }
}

function activityHeadRow() {
  const row = el('div', 'log-table-row head')
  for (const label of ['Time', 'Activity', 'Details', 'Result']) {
    row.append(activityCell(label))
  }
  return row
}

function activityTableRow(run: RecentRun) {
  const resultClass =
    run.kind === 'completed' ? 'ok' : run.kind === 'failed' ? 'fail' : 'pending'
  const row = button(`log-table-row dashboard-activity-table-row ${resultClass}`)
  row.type = 'button'
  row.append(
    activityCell(relativeTime(run.at), 'log-cell-time'),
    activityCell(run.title),
    activityCell(run.detail),
    activityCell(kindLabel(run.kind), resultClass),
  )
  row.addEventListener('click', () => {
    if (run.kind === 'pending') navigate('review')
    else navigate('log')
  })
  return row
}

function activityCell(text: string, extra = '') {
  return el('div', `log-cell ${extra}`.trim(), [text])
}

function kindLabel(kind: RecentRun['kind']) {
  if (kind === 'pending') return 'Pending'
  if (kind === 'completed') return 'Done'
  return 'Failed'
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

function iconBtn(
  svg: string,
  label: string,
  tone: 'approve' | 'reject',
  onClick: () => void,
) {
  const btn = button(`btn btn-icon tone-${tone}`)
  btn.type = 'button'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = svg
  btn.addEventListener('click', onClick)
  return btn
}
