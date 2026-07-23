import { el } from '@/lib/dom'
import { getInstalledRules, getState, subscribe } from '@/app/store'
import { connectorRulesActive, rulesForConnectorFallback } from '@/lib/ruleDef'
import { setRuleCatalog } from '@/lib/rules'
import type { RuleDef } from '@/types/domain'

const CATEGORY_LABEL: Record<string, string> = {
  core: 'Core',
  detection: 'Detection',
  routing: 'Routing',
  logging: 'Logging',
}

/** Compact read-only list of connector rules for automation screens. */
export function RuleCatalog(connectorId = 'fs') {
  const root = el('div', 'rule-catalog')

  const show = (rules: RuleDef[], hint?: string) => {
    if (!rules.length) {
      root.replaceChildren(
        el('p', 'rule-catalog-empty', [
          hint ?? 'No rules loaded — restart the app to pick up the latest daemon.',
        ]),
      )
      return
    }
    setRuleCatalog(rules)
    paint(root, rules)
  }

  const fromStore = () =>
    getInstalledRules().filter((r) => r.connectorId === connectorId)

  const paintCatalog = () => {
    const state = getState()
    if (!connectorRulesActive(connectorId, state.connectors)) {
      show([], 'Connect this connector to install its rules.')
      return
    }
    const next = fromStore()
    show(next.length ? next : rulesForConnectorFallback(connectorId))
  }

  paintCatalog()

  const unsub = subscribe(() => {
    if (!root.isConnected) {
      unsub()
      return
    }
    paintCatalog()
  })

  return root
}

function paint(root: HTMLElement, rules: RuleDef[]) {
  root.replaceChildren()
  root.append(
    el('div', 'rule-catalog-head', [
      el('div', 'rule-catalog-title', ['Filesystem rules']),
      el('p', 'rule-catalog-lede', [
        'Built-in code primitives you chain in an automation — list, move, detect, …',
      ]),
    ]),
  )

  const groups = new Map<string, RuleDef[]>()
  for (const rule of rules) {
    const key = rule.category
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(rule)
  }

  for (const [category, items] of groups) {
    const section = el('div', 'rule-catalog-group')
    section.append(
      el('div', 'rule-catalog-group-label', [
        CATEGORY_LABEL[category] ?? category,
      ]),
    )
    const list = el('div', 'rule-catalog-list')
    for (const rule of items) {
      const row = el('div', 'rule-catalog-item')
      const params = Array.isArray(rule.params) ? rule.params : []
      const sig =
        params.length > 0
          ? `${rule.id}(${params.join(', ')})`
          : `${rule.id}()`
      row.append(
        el('code', 'rule-catalog-fn', [sig]),
        rule.origin === 'user'
          ? el('span', 'rule-catalog-badge', ['custom'])
          : el('span', 'rule-catalog-badge muted', ['built-in']),
      )
      list.append(row)
    }
    section.append(list)
    root.append(section)
  }
}
