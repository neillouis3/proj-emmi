import { el, button } from '@/lib/dom'
import { dismissPromote, getState, promoteRule, subscribe } from '@/app/store'

export function PromoteSheetHost() {
  const host = el('div', 'promote-host')
  host.hidden = true

  const render = () => {
    const { promote, rules, blocking } = getState()
    if (!promote || blocking) {
      host.hidden = true
      host.replaceChildren()
      return
    }

    const rule = rules.find((r) => r.id === promote.ruleId)
    if (!rule) {
      host.hidden = true
      host.replaceChildren()
      return
    }

    host.hidden = false
    const sheet = el('div', 'promote-sheet')
    sheet.append(
      el('h3', 'promote-title', ['Promote to auto?']),
      el(
        'p',
        'promote-body',
        [
          `This rule has been approved ${promote.approvalCount} times. Emmi can run it automatically from now on.`,
        ],
      ),
      el('p', 'promote-rule', [`${rule.trigger} → ${rule.action}`]),
    )

    const actions = el('div', 'promote-actions')
    const promoteBtn = button('btn btn-primary', 'Promote to auto')
    promoteBtn.addEventListener('click', () => promoteRule(rule.id))
    const keep = button('btn btn-ghost', 'Keep reviewing')
    keep.addEventListener('click', () => dismissPromote(false))
    const never = button('btn btn-ghost', 'Never ask')
    never.addEventListener('click', () => dismissPromote(true))
    actions.append(promoteBtn, keep, never)
    sheet.append(actions)
    host.replaceChildren(sheet)
  }

  render()
  subscribe(render)
  return host
}
