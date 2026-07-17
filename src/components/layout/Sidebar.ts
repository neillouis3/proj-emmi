import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import { counts, getState, navigate, subscribe } from '@/app/store'
import type { ScreenId } from '@/types/domain'
import { ThemeMenuButton } from '@/components/ThemeMenu'

const navItems: {
  id: ScreenId
  label: string
  icon: string
  tone: string
  badge?: boolean
}[] = [
  { id: 'overview', label: 'Dashboard', icon: icons.home, tone: 'blue' },
  { id: 'review', label: 'Review Queue', icon: icons.review, tone: 'green', badge: true },
  { id: 'automations', label: 'Automations', icon: icons.spark, tone: 'indigo' },
  { id: 'connectors', label: 'Connectors', icon: icons.plug, tone: 'purple' },
  { id: 'log', label: 'Log', icon: icons.history, tone: 'pink' },
  { id: 'rules', label: 'Rules', icon: icons.rules, tone: 'red' },
]

export function Sidebar() {
  const aside = el('aside', 'sidebar')
  const top = el('div', 'sidebar-top drag-region')
  const nav = el('nav', 'sidebar-nav no-drag')
  const buttons = new Map<ScreenId, HTMLButtonElement>()

  for (const item of navItems) {
    const btn = navRow(item.label, item.icon, item.tone)
    btn.dataset.route = item.id
    if (item.badge) {
      const badge = el('span', 'nav-badge')
      badge.dataset.badge = 'review'
      btn.append(badge)
    }
    btn.addEventListener('click', () => navigate(item.id))
    buttons.set(item.id, btn)
    nav.append(btn)
  }

  const section = el('div', 'sidebar-section no-drag')
  section.append(nav)

  const footer = el('div', 'sidebar-footer no-drag')
  const settingsBtn = navRow('Settings', icons.gear, 'gray')
  settingsBtn.addEventListener('click', () => navigate('settings'))
  buttons.set('settings', settingsBtn)

  const user = el('div', 'user-row')
  const meta = el('div', 'user-meta')
  meta.append(
    el('div', 'user-name', ['Local Automation']),
    el('div', 'user-plan', ['Menu bar resident']),
  )
  user.append(el('div', 'avatar'), meta, ThemeMenuButton())
  footer.append(settingsBtn, user)

  const sync = () => {
    const state = getState()
    const pending = counts(state).pending
    for (const [id, btn] of buttons) {
      btn.classList.toggle('active', state.route === id)
    }
    const badge = nav.querySelector<HTMLElement>('[data-badge="review"]')
    if (badge) {
      badge.textContent = pending > 0 ? String(pending) : ''
      badge.hidden = pending === 0
    }
  }

  sync()
  subscribe(sync)
  aside.append(top, section, footer)
  return aside
}

function navRow(label: string, iconSvg: string, tone: string) {
  const btn = button(`nav-btn tone-${tone}`)
  const tile = el('span', 'nav-tile')
  tile.innerHTML = iconSvg
  btn.append(tile, el('span', 'nav-label', [label]))
  return btn
}
