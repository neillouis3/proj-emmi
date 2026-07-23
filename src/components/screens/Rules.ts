import { el, button } from '@/lib/dom'
import {
  PageToolbar,
  EmptyState,
  dataTable,
  splitView,
  tableCell,
  tableSelectRow,
  Tabs,
} from '@/components/shared/layout'
import { CodeBlock } from '@/components/shared/CodeBlock'
import {
  getState,
  getInstalledRules,
  getRuleCode,
  loadRuleCode,
  navigate,
} from '@/app/store'
import { bindScreen } from '@/lib/bindScreen'
import { ruleDescription } from '@/lib/rules'
import { ALWAYS_ON_RULE_CONNECTORS } from '@/lib/ruleDef'
import type { Connector, RuleDef } from '@/types/domain'

function ruleParams(rule: RuleDef): string[] {
  return Array.isArray(rule.params) ? rule.params : []
}

type RulesFilter = 'all' | string

const CATEGORY_LABEL: Record<string, string> = {
  core: 'Core',
  detection: 'Detection',
  routing: 'Routing',
  logging: 'Logging',
}

const loadingCode = new Set<string>()

function sortedRuleConnectors(connectors: Connector[]): Connector[] {
  return [...connectors]
    .filter(
      (c) =>
        ALWAYS_ON_RULE_CONNECTORS.has(c.id) || c.authStatus === 'connected',
    )
    .sort((a, b) => {
      const ac = a.authStatus === 'connected' ? 0 : 1
      const bc = b.authStatus === 'connected' ? 0 : 1
      if (ac !== bc) return ac - bc
      return a.name.localeCompare(b.name)
    })
}

function ruleKey(rule: Pick<RuleDef, 'connectorId' | 'id'>) {
  return `${rule.connectorId}/${rule.id}`
}

function ensureRuleCode(rule: RuleDef) {
  if (getRuleCode(rule.connectorId, rule.id)) return
  const key = ruleKey(rule)
  if (loadingCode.has(key)) return
  loadingCode.add(key)
  void loadRuleCode(rule.connectorId, rule.id)
    .catch(() => {
      /* offline */
    })
    .finally(() => {
      loadingCode.delete(key)
    })
}

export function Rules() {
  const page = el('div', 'screen settings-screen')
  let filter: RulesFilter = 'all'
  let selectedKey: string | null = null
  const body = el('div', 'screen-body rules-page')

  const render = () => {
    const state = getState()
    const rules = getInstalledRules()
    const connectors = sortedRuleConnectors(state.connectors)
    if (
      filter !== 'all' &&
      !connectors.some((c) => c.id === filter)
    ) {
      filter = 'all'
    }
    const visible =
      filter === 'all'
        ? rules
        : rules.filter((r) => r.connectorId === filter)

    if (!visible.some((r) => ruleKey(r) === selectedKey)) {
      const first = visible[0]
      selectedKey = first ? ruleKey(first) : null
    }

    const selected = visible.find((r) => ruleKey(r) === selectedKey) ?? null
    if (selected) ensureRuleCode(selected)

    page.replaceChildren()
    body.replaceChildren()

    const create = button('btn btn-ghost btn-compact', 'New rule')
    create.addEventListener('click', () => navigate('rule-new'))

    body.append(
      PageToolbar({
        leading: [
          Tabs({
            value: filter,
            options: [
              { value: 'all', label: `All (${rules.length})` },
              ...connectors.map((c) => ({
                value: c.id,
                label: `${c.name} (${rules.filter((r) => r.connectorId === c.id).length})`,
              })),
            ],
            onChange: (next) => {
              filter = next
              render()
            },
          }),
        ],
        actions: [create],
      }),
    )

    if (!visible.length) {
      body.append(
        EmptyState({
          title: 'No rules loaded',
          body: 'Connect a connector to install its rules, or start the daemon for built-ins.',
          actionLabel: 'New rule',
          onAction: () => navigate('rule-new'),
        }),
      )
      page.append(body)
      return
    }

    const split = splitView({
      splitClass: 'rules-split',
      mainClass: 'rules-main',
      sideClass: 'rules-side',
      main: [
        dataTable({
          className: 'rules-table',
          headClass: 'rules-table-row',
          columns: ['Rule', 'Connector', 'Category', 'Author'],
          rows: visible.map((rule) =>
            ruleRow(rule, selectedKey, () => {
              selectedKey = ruleKey(rule)
              render()
            }),
          ),
        }),
      ],
      side: selected ? ruleSide(selected) : null,
    })
    body.append(split)
    page.append(body)
  }

  return bindScreen(page, render)
}

function ruleRow(rule: RuleDef, selectedKey: string | null, onSelect: () => void) {
  const key = ruleKey(rule)
  return tableSelectRow({
    rowClass: 'rules-table-row',
    selected: selectedKey === key,
    cells: [
      el('div', 'log-cell rules-table-name', [
        el('code', 'rules-table-fn', [rule.id]),
      ]),
      tableCell(rule.connectorId),
      tableCell(CATEGORY_LABEL[rule.category] ?? rule.category),
      tableCell(rule.origin === 'builtin' ? 'Built-in' : 'Custom'),
    ],
    onSelect,
  })
}

function ruleSide(rule: RuleDef) {
  const panel = el('section', 'rules-detail')
  panel.append(ruleSignatureEl(rule))
  panel.append(el('p', 'rules-detail-desc', [ruleDescription(rule.id)]))
  panel.append(
    CodeBlock({
      code: getRuleCode(rule.connectorId, rule.id),
      placeholder: loadingCode.has(ruleKey(rule))
        ? 'Loading…'
        : 'Source unavailable',
    }),
  )
  return panel
}

function ruleSignatureEl(rule: RuleDef) {
  const sig = el('code', 'rules-detail-sig')
  sig.append(el('span', 'hl-fn', [rule.id]))
  sig.append(el('span', 'hl-punctuation', ['(']))
  const params = ruleParams(rule)
  for (let i = 0; i < params.length; i++) {
    if (i > 0) sig.append(el('span', 'hl-punctuation', [', ']))
    sig.append(el('span', 'hl-variable', [params[i]!]))
  }
  sig.append(el('span', 'hl-punctuation', [')']))
  return sig
}
