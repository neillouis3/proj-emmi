import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { connectorLogo } from '@/lib/connectorLogos'
import {
  createRule,
  getState,
  navigate,
  promoteRule,
  seedTemplateRule,
  updateRule,
} from '@/app/store'
import type { Rule, RuleMode } from '@/types/domain'

type RulesFilter = 'all' | RuleMode

const MODE_COPY: Record<
  RuleMode,
  { short: string; label: string; help: string }
> = {
  auto: {
    short: 'Auto',
    label: 'Do it for me',
    help: 'Runs on its own. Best once you trust the rule.',
  },
  review: {
    short: 'Review',
    label: 'Show in Review',
    help: 'Adds it to Review Queue so you can approve or reject.',
  },
  ask: {
    short: 'Ask',
    label: 'Ask me first',
    help: 'Pops up and waits for your yes before doing anything.',
  },
}

export function RulesEditor() {
  const page = el('div', 'screen settings-screen')
  let filter: RulesFilter = 'all'
  let creating = false
  let selectedId: string | null = null
  const body = el('div', 'screen-body rules-page')

  const render = () => {
    const state = getState()
    const suggestions = state.rules.filter(
      (r) => r.promoteSuggested && !r.neverPromote,
    )
    const byMode = {
      ask: state.rules.filter((r) => r.mode === 'ask').length,
      review: state.rules.filter((r) => r.mode === 'review').length,
      auto: state.rules.filter((r) => r.mode === 'auto').length,
    }
    const visible =
      filter === 'all'
        ? state.rules
        : state.rules.filter((r) => r.mode === filter)

    if (!creating && !visible.some((r) => r.id === selectedId)) {
      selectedId = visible[0]?.id ?? null
    }
    const selected = visible.find((r) => r.id === selectedId) ?? null

    const createBtn = button(
      creating ? 'btn btn-ghost' : 'btn btn-primary',
      creating ? 'Cancel' : 'New rule',
    )
    createBtn.addEventListener('click', () => {
      creating = !creating
      render()
    })

    page.replaceChildren()
    body.replaceChildren()

    body.append(
      PageToolbar({
        leading: [
          filterTabs(
            [
              { value: 'all', label: 'All' },
              { value: 'ask', label: `Ask (${byMode.ask})` },
              { value: 'review', label: `Review (${byMode.review})` },
              { value: 'auto', label: `Auto (${byMode.auto})` },
            ],
            filter,
            (next) => {
              filter = next as RulesFilter
              render()
            },
          ),
        ],
        actions: [createBtn],
      }),
    )

    if (filter !== 'all') {
      body.append(el('div', 'rules-filter-hint', [MODE_COPY[filter].help]))
    }

    if (suggestions.length && !creating) {
      const banner = button('rules-promote-banner')
      banner.type = 'button'
      banner.append(
        el('span', undefined, [
          suggestions.length === 1
            ? '1 rule looks ready to run automatically'
            : `${suggestions.length} rules look ready to run automatically`,
        ]),
        el('span', 'rules-promote-action', ['Review']),
      )
      banner.addEventListener('click', () => {
        selectedId = suggestions[0].id
        filter = 'all'
        render()
      })
      body.append(banner)
    }

    if (creating) {
      body.append(
        CreateRuleForm(
          () => {
            creating = false
            render()
          },
          () => {
            creating = false
            render()
          },
        ),
      )
      page.append(body)
      return
    }

    if (!state.rules.length) {
      body.append(
        EmptyState({
          title: 'No rules yet',
          body: 'Start with a screenshot cleanup example, or write your own.',
          actionLabel: 'Try an example',
          onAction: () => {
            seedTemplateRule()
            render()
          },
        }),
      )
      page.append(body)
      return
    }

    if (!visible.length) {
      body.append(
        EmptyState({
          title: `No “${filterLabel(filter)}” rules`,
          body: 'Try another filter, or change a rule’s mode.',
        }),
      )
      page.append(body)
      return
    }

    const split = el('div', 'rules-split')
    const main = el('div', 'rules-main')

    const table = el('div', 'log-table rules-table')
    table.append(headRow())
    for (const rule of visible) {
      table.append(
        ruleTableRow(
          rule,
          rule.id === selectedId,
          () => {
            selectedId = rule.id
            render()
          },
        ),
      )
    }
    main.append(table)

    const side = el('aside', 'rules-side')
    if (selected) {
      side.append(detailPanel(selected, state, render))
    }

    if (suggestions.length) {
      const promote = el('section', 'rules-side-section')
      promote.append(el('div', 'dashboard-section-title', ['Ready to auto']))
      const list = el('div', 'rules-promote-list')
      for (const rule of suggestions.slice(0, 3)) {
        list.append(promoteSideRow(rule, render, () => {
          selectedId = rule.id
          render()
        }))
      }
      promote.append(list)
      side.append(promote)
    }

    split.append(main, side)
    body.append(split)
    page.append(body)
  }

  render()
  return page
}

function filterLabel(filter: RulesFilter) {
  if (filter === 'all') return 'All'
  return MODE_COPY[filter].short
}

function headRow() {
  const row = el('div', 'log-table-row head rules-table-row')
  for (const label of ['Action', 'When', 'Mode', 'Source']) {
    row.append(cell(label))
  }
  return row
}

function ruleTableRow(
  rule: Rule,
  selected: boolean,
  onSelect: () => void,
) {
  const row = button(
    `log-table-row rules-table-row${selected ? ' is-selected' : ''}${
      rule.origin === 'learned' ? ' is-learned' : ''
    }`,
  )
  row.type = 'button'

  const actionCell = el('div', 'log-cell rules-table-action-cell')
  const logo = el('span', `connector-logo compact tone-${rule.connectorId}`)
  logo.innerHTML = connectorLogo(rule.connectorId)
  actionCell.append(
    logo,
    el('span', 'rules-table-action-name', [friendlyAction(rule.action)]),
  )

  row.append(
    actionCell,
    cell(rule.trigger),
    cell(MODE_COPY[rule.mode].short),
    cell(
      rule.origin === 'learned' ? `Learned · ${rule.approvalCount}×` : 'You',
    ),
  )
  row.addEventListener('click', onSelect)
  return row
}

function detailPanel(
  rule: Rule,
  state: ReturnType<typeof getState>,
  refresh: () => void,
) {
  const connector = state.connectors.find((c) => c.id === rule.connectorId)
  const pending = state.pending.filter((p) => p.sourceRuleId === rule.id)

  const panel = el('section', 'rules-detail')
  const head = el('div', 'rules-detail-head')
  const logo = el('span', `connector-logo tone-${rule.connectorId}`)
  logo.innerHTML = connectorLogo(rule.connectorId)
  const copy = el('div', 'rules-detail-copy')
  copy.append(
    el('div', 'rules-detail-title', [friendlyAction(rule.action)]),
    el('div', 'rules-detail-meta', [
      `${MODE_COPY[rule.mode].label} · ${
        rule.origin === 'learned' ? `Learned · ${rule.approvalCount}×` : 'Created by you'
      }`,
    ]),
  )
  head.append(logo, copy)
  panel.append(head)

  panel.append(
    el('div', 'rules-detail-intro', [
      'When the event below happens and the match fits, Emmi follows this rule.',
    ]),
  )

  const facts = el('div', 'rules-detail-facts')
  facts.append(
    fact('When', rule.trigger),
    fact('Match', rule.match),
    fact('Then', rule.action),
    fact('Connector', connector?.name ?? rule.connectorId),
  )
  panel.append(facts)

  const modeBlock = el('div', 'rule-mode-picker')
  modeBlock.append(
    el('div', 'review-report-label', ['How should Emmi handle this?']),
    modeChoices(rule.mode, (mode) => {
      updateRule(rule.id, { mode })
      refresh()
    }),
  )
  panel.append(modeBlock)

  if (rule.promoteSuggested && !rule.neverPromote) {
    const extras = el('div', 'rules-detail-actions')
    extras.append(
      pillBtn('Keep asking', 'ghost', () => {
        updateRule(rule.id, { promoteSuggested: false })
        refresh()
      }),
      pillBtn('Run automatically', 'primary', () => {
        promoteRule(rule.id)
        refresh()
      }),
    )
    panel.append(extras)
  }

  if (pending.length) {
    const block = el('div', 'rules-detail-block')
    block.append(
      el('div', 'dashboard-section-title', ['In review']),
      el('div', 'rules-detail-note', [
        `${pending.length} pending item${pending.length === 1 ? '' : 's'} from this rule.`,
      ]),
      pillBtn('Open Review', 'ghost', () => navigate('review')),
    )
    panel.append(block)
  }

  if (connector) {
    const block = el('div', 'rules-detail-block')
    block.append(
      el('div', 'dashboard-section-title', ['Connector']),
      pillBtn(connector.name, 'ghost', () => navigate('connectors')),
    )
    panel.append(block)
  }

  return panel
}

function promoteSideRow(
  rule: Rule,
  refresh: () => void,
  onSelect: () => void,
) {
  const row = el('div', 'rules-promote-row')
  const copy = button('rules-promote-copy-btn')
  copy.type = 'button'
  copy.append(
    el('div', 'rules-promote-title', [friendlyAction(rule.action)]),
    el('div', 'rules-promote-meta', [
      `Approved ${rule.approvalCount}×`,
    ]),
  )
  copy.addEventListener('click', onSelect)
  const go = pillBtn('Auto', 'primary', () => {
    promoteRule(rule.id)
    refresh()
  })
  row.append(copy, go)
  return row
}

function CreateRuleForm(onDone: () => void, onCancel: () => void) {
  const state = getState()
  const form = el('div', 'rule-create')
  form.append(
    el('div', 'rule-create-lead', [
      'Describe when it should run, what to look for, and what to do. You can keep it on “Ask me first” until you’re comfortable.',
    ]),
  )

  const trigger = textField(
    'When should this run?',
    'Example: a new file appears on your Desktop',
    'File created in ~/Desktop',
  )
  const match = textField(
    'What should it match?',
    'Example: PNG files with “screenshot” in the name',
    '*.png AND filename contains "screenshot"',
  )
  const action = textField(
    'What should it do?',
    'Example: move the file into Pictures/Screenshots',
    'Move → ~/Pictures/Screenshots',
  )

  let modeValue: RuleMode = 'ask'
  const modeBlock = el('div', 'rule-create-field')
  modeBlock.append(
    el('div', 'review-report-label', ['How should Emmi handle matches?']),
    modeChoices(modeValue, (next) => {
      modeValue = next
    }),
  )

  const connectorBlock = el('div', 'rule-create-field')
  connectorBlock.append(
    el('div', 'review-report-label', ['Which connector?']),
    el('div', 'rule-create-hint', [
      'Connectors are the apps and folders Emmi can work with.',
    ]),
  )
  const connector = el('select', 'rule-create-select') as HTMLSelectElement
  for (const item of state.connectors) {
    const opt = el('option') as HTMLOptionElement
    opt.value = item.id
    opt.textContent = item.name
    if (item.id === state.connectors[0]?.id) opt.selected = true
    connector.append(opt)
  }
  connectorBlock.append(connector)

  const actions = el('div', 'rule-create-actions')
  actions.append(
    pillBtn('Cancel', 'ghost', onCancel),
    pillBtn('Create rule', 'primary', () => {
      createRule({
        trigger: trigger.input.value.trim() || trigger.fallback,
        match: match.input.value.trim() || match.fallback,
        action: action.input.value.trim() || action.fallback,
        mode: modeValue,
        connectorId: connector.value,
        origin: 'user',
      })
      onDone()
    }),
  )

  form.append(
    trigger.field,
    match.field,
    action.field,
    modeBlock,
    connectorBlock,
    actions,
  )
  return form
}

function textField(label: string, hint: string, fallback: string) {
  const field = el('div', 'rule-create-field')
  field.append(
    el('div', 'review-report-label', [label]),
    el('div', 'rule-create-hint', [hint]),
  )
  const input = el('input', 'rule-create-input') as HTMLInputElement
  input.placeholder = fallback
  field.append(input)
  return { field, input, fallback }
}

function modeChoices(current: RuleMode, onChange: (mode: RuleMode) => void) {
  const wrap = el('div', 'rule-mode-choices')
  for (const value of ['ask', 'review', 'auto'] as RuleMode[]) {
    const copy = MODE_COPY[value]
    const choice = button(
      `rule-mode-choice${current === value ? ' active' : ''}`,
    )
    choice.type = 'button'
    choice.append(
      el('div', 'rule-mode-choice-title', [copy.label]),
      el('div', 'rule-mode-choice-help', [copy.help]),
    )
    choice.addEventListener('click', () => {
      onChange(value)
      for (const child of wrap.children) {
        child.classList.toggle('active', child === choice)
      }
    })
    wrap.append(choice)
  }
  return wrap
}

function friendlyAction(action: string) {
  return action
    .replace(/^Move\s*→\s*/i, 'Move to ')
    .replace(/^Run automation\s+/i, 'Run ')
}

function fact(label: string, value: string) {
  const row = el('div', 'review-report-row')
  row.append(
    el('span', 'review-report-label', [label]),
    el('span', 'review-report-value', [value]),
  )
  return row
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

function pillBtn(
  label: string,
  tone: 'primary' | 'ghost',
  onClick: () => void,
) {
  const btn = button(
    `connector-action pill${tone === 'primary' ? ' primary' : ' ghost'}`,
    label,
  )
  btn.addEventListener('click', onClick)
  return btn
}
