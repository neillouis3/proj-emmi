import { el, button } from '@/lib/dom'
import { labelPathText } from '@/lib/pathVariables'
import {
  approvePending,
  getLog,
  getPending,
  getState,
  rejectPending,
  retryLog,
  subscribe,
  undoLog,
  updatePendingAction,
} from '@/app/store'

export function Panel(kind: string, id?: string) {
  const root = el('div', 'panel-surface')

  const render = () => {
    if (kind === 'review' && id) {
      root.replaceChildren(ReviewPanel(id, () => window.close()))
      return
    }
    if (kind === 'log' && id) {
      root.replaceChildren(LogPanel(id))
      return
    }
    if (kind === 'error' && id) {
      root.replaceChildren(ErrorPanel(id))
      return
    }
    root.replaceChildren(el('p', 'muted', ['Unknown panel']))
  }

  render()
  subscribe(render)
  return root
}

function ReviewPanel(id: string, onDone: () => void) {
  const item = getPending(id)
  const wrap = el('div', 'panel-card')
  wrap.append(el('h1', 'panel-title', ['Review']))

  if (!item) {
    wrap.append(el('p', 'muted', ['This item is no longer pending.']))
    return wrap
  }

  const vars = getState().pathVariables
  wrap.append(
    el('h2', 'panel-item-title', [item.title]),
    el('p', 'field-value', [labelPathText(item.trigger, vars)]),
    el('p', 'field-value', [labelPathText(item.action, vars)]),
  )
  if (item.trustNote) {
    wrap.append(
      el(
        'p',
        `review-trust-note${item.undoable ? ' is-undoable' : ' is-not-undoable'}`,
        [item.trustNote],
      ),
    )
  }
  const plan = item.plan?.length
    ? item.plan
    : item.reasoning?.includes('\n')
      ? item.reasoning.split('\n').filter((s) => s.trim())
      : []
  if (plan.length) {
    const list = el('ol', 'review-detail-checklist panel-checklist')
    for (const line of plan.slice(0, 8)) {
      const li = el('li', 'review-detail-check')
      li.textContent = line.trim()
      list.append(li)
    }
    wrap.append(list)
  }

  const showDest =
    !item.grantKind &&
    Boolean(item.files?.length) &&
    /move|route|destination/i.test(item.editableAction + item.action)
  if (showDest) {
    const edit = el('input', 'review-edit-input') as HTMLInputElement
    edit.type = 'text'
    edit.value = item.editableAction
    edit.addEventListener('change', () => updatePendingAction(item.id, edit.value))
    wrap.append(el('div', 'field-label', ['Destination']), edit)
  }

  const actions = el('div', 'btn-row')
  actions.append(
    action(item.grantKind ? 'Allow & continue' : 'Approve', 'btn btn-primary', () => {
      approvePending(item.id)
      onDone()
    }),
    action('Reject', 'btn btn-ghost', () => {
      rejectPending(item.id)
      onDone()
    }),
  )
  wrap.append(actions)
  return wrap
}

function LogPanel(id: string) {
  const entry = getLog(id)
  const wrap = el('div', 'panel-card')
  wrap.append(el('h1', 'panel-title', ['Log entry']))
  if (!entry) {
    wrap.append(el('p', 'muted', ['Log entry not found.']))
    return wrap
  }
  wrap.append(
    el('h2', 'panel-item-title', [entry.automationName]),
    el('p', 'field-value', [entry.action]),
    el('p', 'muted', [entry.summary]),
  )
  if (entry.reversible && !entry.undone) {
    const undo = action('Undo', 'btn btn-primary', () => undoLog(entry.id))
    wrap.append(undo)
  } else if (entry.undone) {
    wrap.append(el('p', 'muted', ['Already undone.']))
  }
  return wrap
}

function ErrorPanel(id: string) {
  const entry = getLog(id)
  const wrap = el('div', 'panel-card')
  wrap.append(el('h1', 'panel-title', ['Error detail']))
  if (!entry) {
    wrap.append(el('p', 'muted', ['Error not found.']))
    return wrap
  }
  wrap.append(
    el('h2', 'panel-item-title', [entry.automationName]),
    el('p', 'field-value', [entry.action]),
    el('p', 'error-text', [entry.error ? `Failed: ${entry.error}` : entry.summary]),
  )
  const row = el('div', 'btn-row')
  const errText = entry.error ?? entry.summary ?? ''
  if (
    entry.connectorId === 'chrome' &&
    (/\[cdp_unavailable\]|\[cdp_no_pages\]/i.test(errText) ||
      /Chrome remote debugging is off|Enable remote debugging/i.test(errText))
  ) {
    row.append(
      action('Enable debugging', 'btn btn-primary', () => {
        void window.emmi.enableChromeDebugging?.({ confirm: true })
      }),
      action('Open Connectors', 'btn btn-ghost', () =>
        window.emmi.openDashboard?.('connectors'),
      ),
    )
  } else if (
    entry.connectorId === 'safari' &&
    (/\[safari_js_disabled\]/i.test(errText) ||
      /JavaScript from Apple Events/i.test(errText))
  ) {
    row.append(
      action('Open Connectors', 'btn btn-primary', () =>
        window.emmi.openDashboard?.('connectors'),
      ),
      action('Open Logs', 'btn btn-ghost', () => window.emmi.openDashboard?.('log')),
    )
  } else {
    row.append(
      action('Retry / Fix', 'btn btn-primary', () => retryLog(entry.id)),
      action('Open Logs', 'btn btn-ghost', () => window.emmi.openDashboard?.('log')),
    )
  }
  wrap.append(row)
  return wrap
}

function action(label: string, className: string, onClick: () => void) {
  const btn = button(className, label)
  btn.addEventListener('click', onClick)
  return btn
}
