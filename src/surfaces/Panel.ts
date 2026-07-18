import { el, button } from '@/lib/dom'
import { labelPathText } from '@/lib/pathVariables'
import {
  alwaysDoThis,
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
  if (item.reasoning) {
    wrap.append(el('p', 'muted', [`Reasoning: ${item.reasoning}`]))
  }

  const edit = el('input', 'review-edit-input') as HTMLInputElement
  edit.type = 'text'
  edit.value = item.editableAction
  edit.addEventListener('change', () => updatePendingAction(item.id, edit.value))
  wrap.append(el('div', 'field-label', ['Edit action']), edit)

  const dont = el('label', 'check-row')
  const box = el('input') as HTMLInputElement
  box.type = 'checkbox'
  dont.append(box, document.createTextNode("Don't suggest this again"))

  const actions = el('div', 'btn-row')
  actions.append(
    action('Approve', 'btn btn-ghost', () => {
      approvePending(item.id)
      onDone()
    }),
    action('Reject', 'btn btn-ghost', () => {
      rejectPending(item.id, box.checked)
      onDone()
    }),
    action('Always do this', 'btn btn-ghost', () => {
      const ok = confirm(
        'Future files like this will move automatically without asking. Continue?',
      )
      if (!ok) return
      alwaysDoThis(item.id)
      onDone()
    }),
  )
  wrap.append(dont, actions)
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
  row.append(
    action('Retry / Fix', 'btn btn-primary', () => retryLog(entry.id)),
    action('Open Logs', 'btn btn-ghost', () => window.emmi.openDashboard?.('log')),
  )
  wrap.append(row)
  return wrap
}

function action(label: string, className: string, onClick: () => void) {
  const btn = button(className, label)
  btn.addEventListener('click', onClick)
  return btn
}
