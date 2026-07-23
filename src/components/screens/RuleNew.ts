import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/layout'
import { Btn, FieldRow, SelectField, TextField } from '@/components/shared/controls'
import { RuleCodeEditor } from '@/components/shared/RuleCodeEditor'
import { createUserRule, getState, navigate } from '@/app/store'
import { ALWAYS_ON_RULE_CONNECTORS } from '@/lib/ruleDef'
import type { Connector } from '@/types/domain'

const BLANK_TEMPLATE = `/**
 * @param {unknown} input
 */
export default function myRule(input) {
  return input
}
`

const LOG_TEMPLATE = `import { emitLog } from './_utils.js'

/**
 * @param {string} message
 */
export default function log(message) {
  emitLog(message, 'custom')
  return message
}
`

type StarterId = 'blank' | 'log'

function withFileDescription(code: string, description: string): string {
  const desc = description.trim()
  const body = code.trimStart()
  if (!desc) return code
  const comment = `/**\n * ${desc.replace(/\n/g, '\n * ')}\n */\n\n`
  if (body.startsWith('/**')) {
    return comment + body.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')
  }
  return comment + code
}

export function RuleNew() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body create-page create-page-flow create-page-rule')
  body.append(NewRuleForm(() => navigate('rules')))
  page.append(body)
  return page
}

function ruleConnectors(connectors: Connector[]) {
  return connectors.filter(
    (c) =>
      ALWAYS_ON_RULE_CONNECTORS.has(c.id) || c.authStatus === 'connected',
  )
}

function NewRuleForm(onDone: () => void) {
  const state = getState()
  const connected = ruleConnectors(state.connectors)
  const wrap = el('div', 'rule-create-page')

  let connectorId = connected[0]?.id ?? 'fs'

  const idInput = el('input', 'panel-input rule-create-id') as HTMLInputElement
  idInput.type = 'text'
  idInput.placeholder = 'id (optional)'
  idInput.autocomplete = 'off'
  idInput.spellcheck = false

  const description = TextField({
    placeholder: 'What does this rule do?',
    multiline: true,
    className: 'rule-create-description',
    onChange: () => {},
  })

  const connectorHost = el('div', 'rule-create-connector')
  const mountConnector = () => {
    connectorHost.replaceChildren()
    if (!connected.length) {
      connectorHost.append(
        el('p', 'auto-create-warn', ['Connect a connector first.']),
      )
      return
    }
    const control = SelectField({
      label: 'Connector',
      value: connectorId,
      options: connected.map((c) => ({ value: c.id, label: c.name })),
      onChange: (v) => {
        connectorId = v
      },
    })
    control.classList.add('rule-create-select')
    connectorHost.append(control)
  }
  mountConnector()

  let starter: StarterId = 'blank'
  const starters: { id: StarterId; label: string; code: string }[] = [
    { id: 'blank', label: 'Blank', code: BLANK_TEMPLATE },
    { id: 'log', label: 'Log message', code: LOG_TEMPLATE },
  ]

  const chips = el('div', 'rule-create-chips')
  const codeEditor = RuleCodeEditor({ value: BLANK_TEMPLATE })

  const paintChips = () => {
    chips.replaceChildren()
    for (const item of starters) {
      const chip = button(
        `rule-create-chip${starter === item.id ? ' active' : ''}`,
        item.label,
      )
      chip.type = 'button'
      chip.addEventListener('click', () => {
        starter = item.id
        codeEditor.setValue(item.code)
        paintChips()
        codeEditor.focus()
      })
      chips.append(chip)
    }
  }
  paintChips()

  const meta = el('div', 'rule-create-toolbar-meta')
  meta.append(connectorHost, idInput, chips)

  const create = button('btn btn-primary btn-compact', 'Create rule')
  create.addEventListener('click', () => {
    const code = codeEditor.getValue().trim()
    if (!code) {
      codeEditor.focus()
      return
    }
    const id = idInput.value.trim() || undefined
    createUserRule({
      connectorId,
      id,
      code: withFileDescription(codeEditor.getValue(), description.value),
    })
    onDone()
  })

  wrap.append(
    PageToolbar({
      leading: [meta],
      actions: [
        Btn({ label: 'Cancel', variant: 'ghost', onClick: onDone }),
        create,
      ],
    }),
    FieldRow({
      label: 'Description',
      control: description,
      className: 'auto-create-field rule-create-description-row',
    }),
    codeEditor,
  )

  queueMicrotask(() => {
    codeEditor.focus()
    codeEditor.editor.setSelectionRange(0, 0)
  })
  return wrap
}
