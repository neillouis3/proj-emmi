import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import { SelectField } from '@/components/shared/FilterBar'
import { KeybindField } from '@/components/shared/KeybindField'
import { createAutomation, getState, navigate } from '@/app/store'
import type { AutomationStep, AutomationTrigger } from '@/types/domain'

const OPS_BY_CONNECTOR: Record<string, string[]> = {
  fs: ['match', 'move', 'sort', 'mkdir', 'open', 'notify'],
  git: ['init', 'status', 'commit', 'push'],
  spotify: ['sync', 'add-track', 'play'],
}

const PARAM_HINT: Record<string, string> = {
  match: '~/Desktop/*.png containing screenshot',
  move: '~/Pictures/Screenshots',
  sort: '~/Downloads',
  mkdir: 'src, docs, assets',
  open: 'editor',
  notify: 'summary',
  init: '.',
  status: '--short',
  commit: '-m "message"',
  push: 'origin main',
  sync: 'playlist name',
  'add-track': 'track uri',
  play: 'device',
}

const FIELD_COPY = {
  name: 'A short name you’ll recognize in lists, reviews, and logs.',
  description: 'Optional context for what this automation is for.',
  trigger:
    'How it starts: manually from Emmi, from a keyboard shortcut, a Git hook, or a CLI command.',
  shortcut:
    'The key combination that runs it. Required when Trigger is Keybind; otherwise leave empty.',
  mode: 'Review first queues actions for approval. Ask each time prompts you before every step.',
  active: 'When on, the automation can run as soon as it’s created.',
  steps:
    'Runs top to bottom. Each step picks a connector, an operation, and any params it needs.',
} as const

export function AutomationNew() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body create-page')
  body.append(NewAutomationForm(() => navigate('automations')))
  page.append(body)
  return page
}

function NewAutomationForm(onDone: () => void) {
  const state = getState()
  const wrap = el('div', 'auto-create')

  const head = el('div', 'auto-create-head')
  head.append(
    el('div', 'auto-create-title-row', [
      el('h1', 'auto-create-title', ['New Automation']),
    ]),
  )
  wrap.append(head)

  const form = el('div', 'auto-create-form')

  const name = el('input', 'panel-input') as HTMLInputElement
  name.type = 'text'
  name.placeholder = 'Name'
  name.autocomplete = 'off'

  const description = el('input', 'panel-input') as HTMLInputElement
  description.type = 'text'
  description.placeholder = 'Description (optional)'
  description.autocomplete = 'off'

  form.append(
    field('Name', name, FIELD_COPY.name),
    field('Description', description, FIELD_COPY.description),
  )

  let triggerValue: AutomationTrigger = 'manual'
  let keybindValue: string | null = null
  let keybindEnabled = true
  let active = true
  let modeValue: 'review' | 'ask' = 'review'

  const keybindHost = el('div', 'panel-keybind-host')
  const keybindWarn = el('div', 'auto-create-warn')
  keybindWarn.hidden = true

  const paintKeybindMeta = () => {
    const needs = triggerValue === 'keybind' && !keybindValue
    keybindWarn.hidden = !needs
    keybindWarn.textContent = needs
      ? 'Add a shortcut. Required for Keybind trigger.'
      : ''
  }

  const triggerHost = el('div')
  const mountTrigger = () => {
    triggerHost.replaceChildren()
    const control = SelectField({
      label: 'Trigger',
      value: triggerValue,
      options: [
        { value: 'manual', label: 'Manual' },
        { value: 'keybind', label: 'Keybind' },
        { value: 'git-hook', label: 'Git hook' },
        { value: 'cli', label: 'CLI command' },
      ],
      onChange: (v) => {
        triggerValue = v as AutomationTrigger
        mountTrigger()
        paintKeybindMeta()
      },
    })
    control.classList.add('auto-create-select')
    triggerHost.append(control)
  }
  mountTrigger()
  form.append(field('Trigger', triggerHost, FIELD_COPY.trigger))

  const mountKeybind = () => {
    keybindHost.replaceChildren()
    keybindHost.append(
      KeybindField({
        value: keybindValue,
        automations: state.automations,
        disabled: !keybindEnabled || !state.keybinds.enabled,
        onChange: (v) => {
          keybindValue = v
          paintKeybindMeta()
        },
      }),
    )
    paintKeybindMeta()
  }

  const shortcutMain = el('div')
  shortcutMain.append(keybindHost, keybindWarn)
  form.append(field('Shortcut', shortcutMain, FIELD_COPY.shortcut))
  mountKeybind()

  const modeBar = el('div', 'panel-segment')
  const paintMode = () => {
    modeBar.replaceChildren()
    for (const value of ['review', 'ask'] as const) {
      const tab = button(
        `panel-segment-btn${modeValue === value ? ' active' : ''}`,
        value === 'review' ? 'Review first' : 'Ask each time',
      )
      tab.type = 'button'
      tab.addEventListener('click', () => {
        modeValue = value
        paintMode()
      })
      modeBar.append(tab)
    }
  }
  paintMode()
  form.append(field('Mode', modeBar, FIELD_COPY.mode))

  const activeToggle = button(`settings-toggle${active ? ' on' : ''}`)
  activeToggle.type = 'button'
  activeToggle.setAttribute('aria-label', 'Start active')
  activeToggle.append(el('span', 'settings-toggle-knob'))
  activeToggle.addEventListener('click', () => {
    active = !active
    activeToggle.classList.toggle('on', active)
  })
  const activeRow = el('div', 'auto-create-toggle-row')
  activeRow.append(el('span', 'auto-create-toggle-label', ['Start active']), activeToggle)
  form.append(fieldBlock(activeRow, FIELD_COPY.active))

  let steps: AutomationStep[] = [
    {
      id: 's1',
      connectorId: state.connectors[0]?.id ?? 'fs',
      operation: 'match',
      params: '',
    },
  ]

  const stepsHead = el('div', 'auto-create-steps-head')
  const stepsTitle = el('div', 'auto-create-steps-title')
  const stepsCount = el('span', 'panel-steps-count')
  stepsTitle.append(el('span', undefined, ['Steps']), stepsCount)
  const addStepBtn = action('Add step', 'btn btn-ghost btn-compact', () => {
    steps = [
      ...steps,
      {
        id: `s${Date.now()}`,
        connectorId: state.connectors[0]?.id ?? 'fs',
        operation: 'run',
        params: '',
      },
    ]
    renderSteps()
  })
  stepsHead.append(stepsTitle, addStepBtn)

  const stepsHost = el('div', 'panel-step-list')
  const stepsMain = el('div', 'auto-create-field-main')
  stepsMain.append(stepsHead, stepsHost)
  form.append(fieldBlock(stepsMain, FIELD_COPY.steps, 'auto-create-steps-block'))

  const syncStep = (
    index: number,
    patch: Partial<Pick<AutomationStep, 'connectorId' | 'operation' | 'params'>>,
  ) => {
    steps[index] = { ...steps[index], ...patch }
  }

  const renderSteps = () => {
    stepsCount.textContent = String(steps.length)
    stepsHost.replaceChildren()
    steps.forEach((step, index) => {
      const card = el('div', 'panel-step-card auto-step-card')
      const top = el('div', 'panel-step-top')
      top.append(el('span', 'panel-step-index', [String(index + 1)]))

      const controls = el('div', 'panel-step-controls')
      const up = iconAction(icons.chevronUp, 'Move up', 'btn btn-icon panel-step-btn', () => {
        if (index === 0) return
        ;[steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]
        renderSteps()
      })
      up.disabled = index === 0
      const down = iconAction(
        icons.chevronDown,
        'Move down',
        'btn btn-icon panel-step-btn',
        () => {
          if (index >= steps.length - 1) return
          ;[steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]
          renderSteps()
        },
      )
      down.disabled = index >= steps.length - 1
      const remove = iconAction(icons.x, 'Remove step', 'btn btn-icon panel-step-btn', () => {
        if (steps.length <= 1) return
        steps = steps.filter((_, i) => i !== index)
        renderSteps()
      })
      remove.disabled = steps.length <= 1
      controls.append(up, down, remove)
      top.append(controls)

      const ops = OPS_BY_CONNECTOR[step.connectorId] ?? ['run']
      let operationValue = ops.includes(step.operation)
        ? step.operation
        : (ops[0] ?? 'run')
      if (operationValue !== step.operation) {
        syncStep(index, { operation: operationValue })
        operationValue = steps[index].operation
      }

      const connector = SelectField({
        label: 'Connector',
        value: step.connectorId,
        options: state.connectors.map((c) => ({ value: c.id, label: c.name })),
        onChange: (v) => {
          const nextOps = OPS_BY_CONNECTOR[v] ?? ['run']
          const nextOp = nextOps.includes(steps[index].operation)
            ? steps[index].operation
            : (nextOps[0] ?? 'run')
          syncStep(index, { connectorId: v, operation: nextOp })
          renderSteps()
        },
      })
      connector.classList.add('auto-create-select')

      const operation = SelectField({
        label: 'Operation',
        value: operationValue,
        options: ops.map((op) => ({ value: op, label: op })),
        onChange: (v) => {
          syncStep(index, { operation: v })
          renderSteps()
        },
      })
      operation.classList.add('auto-create-select')

      const params = el('input', 'panel-input') as HTMLInputElement
      params.type = 'text'
      params.placeholder = PARAM_HINT[operationValue] ?? 'Params'
      params.value = steps[index].params
      params.addEventListener('input', () => {
        syncStep(index, { params: params.value })
      })

      const row = el('div', 'auto-step-row')
      row.append(connector, operation)
      card.append(top, row, params)
      stepsHost.append(card)
    })
  }
  renderSteps()

  const foot = el('div', 'panel-form-foot')
  foot.append(
    action('Cancel', 'btn btn-ghost btn-compact', onDone),
    action('Create automation', 'btn btn-primary btn-compact', () => {
      if (!name.value.trim()) {
        name.focus()
        return
      }
      if (triggerValue === 'keybind' && !keybindValue) {
        paintKeybindMeta()
        return
      }
      const cleaned = steps
        .map((s) => ({
          ...s,
          operation: s.operation.trim() || 'run',
          params: s.params.trim(),
        }))
        .filter((s) => s.connectorId)
      if (!cleaned.length) return

      createAutomation({
        name: name.value.trim(),
        description: description.value.trim(),
        trigger: triggerValue,
        defaultMode: modeValue,
        steps: cleaned,
        keybind: keybindValue,
        keybindEnabled,
        active,
      })
      onDone()
    }),
  )
  form.append(foot)
  wrap.append(form)

  queueMicrotask(() => name.focus())
  return wrap
}

function field(label: string, control: HTMLElement, copy: string) {
  const wrap = el('div', 'auto-create-field has-desc')
  const row = el('div', 'auto-create-field-row')
  const controlWrap = el('div', 'auto-create-field-control')
  controlWrap.append(control)
  row.append(controlWrap, el('div', 'auto-create-field-desc', [copy]))
  wrap.append(el('span', 'auto-create-label', [label]), row)
  return wrap
}

function fieldBlock(main: HTMLElement, copy: string, extraClass = '') {
  const wrap = el(
    'div',
    `auto-create-field has-desc${extraClass ? ` ${extraClass}` : ''}`,
  )
  const row = el('div', 'auto-create-field-row')
  const control = el('div', 'auto-create-field-control')
  control.append(main)
  row.append(control, el('div', 'auto-create-field-desc', [copy]))
  wrap.append(row)
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
