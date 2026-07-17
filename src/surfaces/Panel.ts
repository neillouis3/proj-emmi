import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import {
  alwaysDoThis,
  approvePending,
  createAutomation,
  getLog,
  getPending,
  getState,
  rejectPending,
  retryLog,
  subscribe,
  undoLog,
  updatePendingAction,
} from '@/app/store'
import type { AutomationStep, AutomationTrigger } from '@/types/domain'

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
    if (kind === 'automation-new') {
      root.replaceChildren(NewAutomationPanel(() => window.close()))
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

  wrap.append(
    el('h2', 'panel-item-title', [item.title]),
    el('p', 'field-value', [item.trigger]),
    el('p', 'field-value', [`→ ${item.action}`]),
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
    action('Approve', 'btn btn-primary', () => {
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
  wrap.append(el('h1', 'panel-title', ['Log detail']))
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
    action('Open Log', 'btn btn-ghost', () => window.emmi.openDashboard?.('log')),
  )
  wrap.append(row)
  return wrap
}

function NewAutomationPanel(onDone: () => void) {
  const state = getState()
  const wrap = el('div', 'panel-card')
  wrap.append(el('h1', 'panel-title', ['New Automation']))

  const name = el('input', 'filter-input') as HTMLInputElement
  name.placeholder = 'Name'
  const trigger = el('select', 'filter-select') as HTMLSelectElement
  for (const [value, label] of [
    ['manual', 'Manual button'],
    ['git-hook', 'Git hook'],
    ['cli', 'CLI command'],
  ] as const) {
    const opt = el('option') as HTMLOptionElement
    opt.value = value
    opt.textContent = label
    trigger.append(opt)
  }
  const mode = el('select', 'filter-select') as HTMLSelectElement
  for (const value of ['review', 'ask'] as const) {
    const opt = el('option') as HTMLOptionElement
    opt.value = value
    opt.textContent = value
    mode.append(opt)
  }

  const stepsHost = el('div', 'step-list')
  let steps: AutomationStep[] = [
    {
      id: 's1',
      connectorId: state.connectors[0]?.id ?? 'fs',
      operation: 'run',
      params: '',
    },
  ]

  const renderSteps = () => {
    stepsHost.replaceChildren()
    steps.forEach((step, index) => {
      const row = el('div', 'step-editor')
      const connector = el('select', 'filter-select') as HTMLSelectElement
      for (const c of state.connectors) {
        const opt = el('option') as HTMLOptionElement
        opt.value = c.id
        opt.textContent = c.name
        if (c.id === step.connectorId) opt.selected = true
        connector.append(opt)
      }
      connector.addEventListener('change', () => {
        steps[index] = { ...steps[index], connectorId: connector.value }
      })
      const operation = el('input', 'filter-input') as HTMLInputElement
      operation.placeholder = 'operation'
      operation.value = step.operation
      operation.addEventListener('change', () => {
        steps[index] = { ...steps[index], operation: operation.value }
      })
      const params = el('input', 'filter-input') as HTMLInputElement
      params.placeholder = 'params'
      params.value = step.params
      params.addEventListener('change', () => {
        steps[index] = { ...steps[index], params: params.value }
      })
      const up = iconAction(icons.chevronUp, 'Move up', 'btn btn-icon', () => {
        if (index === 0) return
        ;[steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]
        renderSteps()
      })
      const down = iconAction(icons.chevronDown, 'Move down', 'btn btn-icon', () => {
        if (index >= steps.length - 1) return
        ;[steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]
        renderSteps()
      })
      row.append(connector, operation, params, up, down)
      stepsHost.append(row)
    })
  }
  renderSteps()

  const addStep = action('Add step', 'btn btn-ghost', () => {
    steps = [
      ...steps,
      {
        id: `s${steps.length + 1}`,
        connectorId: state.connectors[0]?.id ?? 'fs',
        operation: 'run',
        params: '',
      },
    ]
    renderSteps()
  })

  const save = action('Save', 'btn btn-primary', () => {
    if (!name.value.trim()) return
    createAutomation({
      name: name.value.trim(),
      trigger: trigger.value as AutomationTrigger,
      defaultMode: mode.value as 'review' | 'ask',
      steps,
    })
    onDone()
  })

  wrap.append(
    labeled('Name', name),
    labeled('Trigger', trigger),
    labeled('Default mode', mode),
    el('div', 'field-label', ['Steps']),
    stepsHost,
    el('div', 'btn-row', [addStep, save]),
  )
  return wrap
}

function labeled(label: string, control: HTMLElement) {
  const wrap = el('label', 'field')
  wrap.append(el('div', 'field-label', [label]), control)
  return wrap
}

function action(label: string, className: string, onClick: () => void) {
  const btn = button(className, label)
  btn.addEventListener('click', onClick)
  return btn
}

function iconAction(
  svg: string,
  label: string,
  className: string,
  onClick: () => void,
) {
  const btn = button(className)
  btn.type = 'button'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = svg
  btn.addEventListener('click', onClick)
  return btn
}
