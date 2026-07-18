import { el, button } from '@/lib/dom'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
import { SelectField } from '@/components/shared/FilterBar'
import { connectorIconTile } from '@/lib/connectorLogos'
import { labelPathText } from '@/lib/pathVariables'
import {
  getState,
  navigate,
  promoteRule,
  seedTemplateRule,
  updateRule,
} from '@/app/store'
import type { PathVariable, Rule, RuleMode } from '@/types/domain'

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

    if (!visible.some((r) => r.id === selectedId)) {
      selectedId = visible[0]?.id ?? null
    }
    const selected = visible.find((r) => r.id === selectedId) ?? null

    const createBtn = button('btn btn-ghost btn-compact', 'New rule')
    createBtn.addEventListener('click', () => navigate('rule-new'))

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

    if (suggestions.length) {
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
          state.pathVariables,
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
        list.append(
          promoteSideRow(rule, state.pathVariables, render, () => {
            selectedId = rule.id
            render()
          }),
        )
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
  pathVariables: PathVariable[],
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
  const logo = connectorIconTile(rule.connectorId, true)
  actionCell.append(
    logo,
    el('span', 'rules-table-action-name', [
      friendlyAction(rule.action, pathVariables),
    ]),
  )

  row.append(
    actionCell,
    cell(labelPathText(rule.trigger, pathVariables)),
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
  const logo = connectorIconTile(rule.connectorId)
  const copy = el('div', 'rules-detail-copy')
  const vars = state.pathVariables
  copy.append(
    el('div', 'rules-detail-title', [friendlyAction(rule.action, vars)]),
    el('div', 'rules-detail-meta', [
      [
        connector?.name ?? rule.connectorId,
        rule.origin === 'learned' ? `Learned · ${rule.approvalCount}×` : 'Yours',
      ].join(' · '),
    ]),
  )
  head.append(logo, copy)
  panel.append(head)

  const facts = el('div', 'rules-detail-facts')
  facts.append(
    fact('When', labelPathText(rule.trigger, vars)),
    fact('Match', labelPathText(rule.match, vars)),
    fact('Then', labelPathText(rule.action, vars)),
  )
  panel.append(facts)

  const modeBlock = el('div', 'rule-mode-picker')
  modeBlock.append(
    el('div', 'review-report-label', ['Handle']),
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
      el('div', 'rules-detail-note', [
        `${pending.length} in review`,
      ]),
    )
    const openReview = button('btn btn-ghost btn-compact', 'Open Review')
    openReview.type = 'button'
    openReview.addEventListener('click', () => navigate('review'))
    block.append(openReview)
    panel.append(block)
  }

  return panel
}

function promoteSideRow(
  rule: Rule,
  pathVariables: PathVariable[],
  refresh: () => void,
  onSelect: () => void,
) {
  const row = el('div', 'rules-promote-row')
  const copy = button('rules-promote-copy-btn')
  copy.type = 'button'
  copy.append(
    el('div', 'rules-promote-title', [
      friendlyAction(rule.action, pathVariables),
    ]),
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

function modeChoices(current: RuleMode, onChange: (mode: RuleMode) => void) {
  const control = SelectField({
    label: 'Handle',
    value: current,
    options: (['ask', 'review', 'auto'] as RuleMode[]).map((value) => ({
      value,
      label: MODE_COPY[value].label,
    })),
    onChange: (v) => onChange(v as RuleMode),
  })
  control.classList.add('settings-select')
  return control
}

function friendlyAction(action: string, pathVariables: PathVariable[]) {
  return labelPathText(
    action.replace(/^Run automation\s+/i, 'Run '),
    pathVariables,
  )
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
