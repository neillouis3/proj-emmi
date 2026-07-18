import { el, button } from '@/lib/dom'
import { SelectField } from '@/components/shared/FilterBar'
import { createRule, getState, navigate } from '@/app/store'
import type { RuleMode } from '@/types/domain'

const MODE_COPY: Record<RuleMode, { label: string; help: string }> = {
  auto: {
    label: 'Do it for me',
    help: 'Runs on its own. Best once you trust the rule.',
  },
  review: {
    label: 'Show in Review',
    help: 'Adds it to Review Queue so you can approve or reject.',
  },
  ask: {
    label: 'Ask me first',
    help: 'Pops up and waits for your yes before doing anything.',
  },
}

const FIELD_COPY = {
  templates: 'Start from a common pattern, then edit the fields below.',
  connector: 'Which app or folder this rule uses to watch and act.',
  trigger: 'Event or place that should wake the rule.',
  match: 'Filters for extensions, names, commands, or patterns.',
  action: 'The action Emmi proposes or runs when it matches.',
  promote: 'After enough approvals, Emmi may offer to run this automatically.',
} as const

export function RuleNew() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body create-page')
  body.append(
    CreateRuleForm(
      () => navigate('rules'),
      () => navigate('rules'),
    ),
  )
  page.append(body)
  return page
}

function CreateRuleForm(onDone: () => void, onCancel: () => void) {
  const state = getState()
  const wrap = el('div', 'auto-create')

  const head = el('div', 'auto-create-head')
  head.append(
    el('div', 'auto-create-title-row', [
      el('h1', 'auto-create-title', ['New Rule']),
    ]),
  )
  wrap.append(head)

  const form = el('div', 'auto-create-form')

  let modeValue: RuleMode = state.defaultRuleMode ?? 'ask'
  let neverPromote = false
  let connectorId = state.connectors[0]?.id ?? 'fs'

  const TEMPLATES: {
    label: string
    trigger: string
    match: string
    action: string
    connectorId: string
    mode: RuleMode
  }[] = [
    {
      label: 'Desktop screenshots',
      trigger: 'File created in ~/Desktop',
      match: '*.png AND filename contains "screenshot"',
      action: 'Move to ~/Pictures/Screenshots',
      connectorId: 'fs',
      mode: 'review',
    },
    {
      label: 'Downloads cleanup',
      trigger: 'File created in ~/Downloads',
      match: 'ext in (zip, dmg, pkg)',
      action: 'Move to ~/Downloads/Archive',
      connectorId: 'fs',
      mode: 'ask',
    },
    {
      label: 'Scaffold project',
      trigger: 'Manual / CLI',
      match: 'command == scaffold',
      action: 'Run automation scaffold-project',
      connectorId: 'git',
      mode: 'review',
    },
  ]

  const chips = el('div', 'rule-create-chips')
  for (const t of TEMPLATES) {
    const chip = button('rule-create-chip', t.label)
    chip.type = 'button'
    chip.addEventListener('click', () => applyTemplate(t))
    chips.append(chip)
  }
  form.append(field('Start from', chips, FIELD_COPY.templates))

  const connectorHost = el('div')
  const connectorStatus = el('div', 'auto-create-warn')
  connectorStatus.hidden = true

  const paintConnectorStatus = () => {
    const c = state.connectors.find((x) => x.id === connectorId)
    if (!c) {
      connectorStatus.hidden = true
      connectorStatus.textContent = ''
      return
    }
    if (c.authStatus === 'expired' || c.authStatus === 'error') {
      connectorStatus.hidden = false
      connectorStatus.textContent = `${c.name} needs reconnection before this rule can run.`
      return
    }
    if (c.authStatus === 'available') {
      connectorStatus.hidden = false
      connectorStatus.textContent = `${c.name} isn’t connected yet. Connect it in Connectors.`
      return
    }
    connectorStatus.hidden = true
    connectorStatus.textContent = ''
  }

  const mountConnector = () => {
    connectorHost.replaceChildren()
    const control = SelectField({
      label: 'Connector',
      value: connectorId,
      options: state.connectors.map((c) => ({ value: c.id, label: c.name })),
      onChange: (v) => {
        connectorId = v
        mountConnector()
        paintConnectorStatus()
      },
    })
    control.classList.add('auto-create-select')
    connectorHost.append(control)
  }
  mountConnector()
  paintConnectorStatus()

  const connectorControl = el('div')
  connectorControl.append(connectorHost, connectorStatus)
  form.append(field('Connector', connectorControl, FIELD_COPY.connector))

  const triggerInput = el('input', 'panel-input') as HTMLInputElement
  triggerInput.type = 'text'
  triggerInput.placeholder = 'File created in ~/Desktop'
  triggerInput.autocomplete = 'off'
  const matchInput = el('input', 'panel-input') as HTMLInputElement
  matchInput.type = 'text'
  matchInput.placeholder = '*.png AND filename contains "screenshot"'
  matchInput.autocomplete = 'off'
  const actionInput = el('input', 'panel-input') as HTMLInputElement
  actionInput.type = 'text'
  actionInput.placeholder = 'Move to ~/Pictures/Screenshots'
  actionInput.autocomplete = 'off'

  form.append(
    field('When should this run?', triggerInput, FIELD_COPY.trigger),
    field('What should it match?', matchInput, FIELD_COPY.match),
    field('What should it do?', actionInput, FIELD_COPY.action),
  )

  const modeBar = el('div', 'panel-segment panel-segment-3')
  let modeField: HTMLElement
  const paintMode = () => {
    modeBar.replaceChildren()
    for (const value of ['ask', 'review', 'auto'] as RuleMode[]) {
      const tab = button(
        `panel-segment-btn${modeValue === value ? ' active' : ''}`,
        MODE_COPY[value].label,
      )
      tab.type = 'button'
      tab.addEventListener('click', () => {
        modeValue = value
        paintMode()
        paintPromoteRow()
        const desc = modeField.querySelector('.auto-create-field-desc')
        if (desc) desc.textContent = MODE_COPY[value].help
      })
      modeBar.append(tab)
    }
  }
  modeField = field('Mode', modeBar, MODE_COPY[modeValue].help)
  paintMode()
  form.append(modeField)

  const promoteRow = el('div', 'auto-create-toggle-row')
  const paintPromoteRow = () => {
    promoteRow.replaceChildren()
    if (modeValue === 'auto') {
      promoteRow.hidden = true
      return
    }
    promoteRow.hidden = false
    promoteRow.append(
      el('span', 'auto-create-toggle-label', ['Don’t suggest Auto later']),
    )
    const toggle = button(`settings-toggle${neverPromote ? ' on' : ''}`)
    toggle.type = 'button'
    toggle.setAttribute('aria-label', 'Don’t suggest Auto later')
    toggle.append(el('span', 'settings-toggle-knob'))
    toggle.addEventListener('click', () => {
      neverPromote = !neverPromote
      toggle.classList.toggle('on', neverPromote)
    })
    promoteRow.append(toggle)
  }
  paintPromoteRow()
  form.append(fieldBlock(promoteRow, FIELD_COPY.promote))

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    triggerInput.value = t.trigger
    matchInput.value = t.match
    actionInput.value = t.action
    connectorId = t.connectorId
    modeValue = t.mode
    const desc = modeField.querySelector('.auto-create-field-desc')
    if (desc) desc.textContent = MODE_COPY[t.mode].help
    mountConnector()
    paintConnectorStatus()
    paintMode()
    paintPromoteRow()
    triggerInput.focus()
  }

  const foot = el('div', 'panel-form-foot')
  foot.append(
    buttonAction('Cancel', 'btn btn-ghost btn-compact', onCancel),
    buttonAction('Create rule', 'btn btn-primary btn-compact', () => {
      const trigger = triggerInput.value.trim()
      const match = matchInput.value.trim()
      const action = actionInput.value.trim()
      if (!trigger) {
        triggerInput.focus()
        return
      }
      if (!match) {
        matchInput.focus()
        return
      }
      if (!action) {
        actionInput.focus()
        return
      }
      createRule({
        trigger,
        match,
        action,
        mode: modeValue,
        connectorId,
        origin: 'user',
        ...(neverPromote && modeValue !== 'auto' ? { neverPromote: true } : {}),
      })
      onDone()
    }),
  )
  form.append(foot)
  wrap.append(form)

  queueMicrotask(() => triggerInput.focus())
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

function fieldBlock(main: HTMLElement, copy: string) {
  const wrap = el('div', 'auto-create-field has-desc')
  const row = el('div', 'auto-create-field-row')
  const control = el('div', 'auto-create-field-control')
  control.append(main)
  row.append(control, el('div', 'auto-create-field-desc', [copy]))
  wrap.append(row)
  return wrap
}

function buttonAction(label: string, className: string, onClick: () => void) {
  const btn = button(className, label)
  btn.addEventListener('click', onClick)
  return btn
}
