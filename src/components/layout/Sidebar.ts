import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import { counts, getState, navigate, subscribe } from '@/app/store'
import type { ScreenId } from '@/types/domain'
import { accountDisplayName, accountInitials } from '@/lib/account'
import { ThemeIconButton } from '@/components/shared/controls'

type NavItem = {
  id: ScreenId
  label: string
  icon: string
  tone: string
  badge?: boolean
}

const primaryNav: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: icons.home, tone: 'blue' },
  { id: 'review', label: 'Review Queue', icon: icons.review, tone: 'green', badge: true },
  { id: 'automations', label: 'Automations', icon: icons.bolt, tone: 'orange' },
  { id: 'log', label: 'Logs', icon: icons.history, tone: 'pink' },
]

const libraryNav: NavItem[] = [
  { id: 'packs', label: 'Packs', icon: icons.layout, tone: 'blue' },
  { id: 'rules', label: 'Rules', icon: icons.rules, tone: 'red' },
  { id: 'connectors', label: 'Connectors', icon: icons.plug, tone: 'purple' },
]

export function Sidebar() {
  const aside = el('aside', 'sidebar')
  const top = el('div', 'sidebar-top drag-region')
  const section = el('div', 'sidebar-section no-drag')
  const buttons = new Map<ScreenId, HTMLButtonElement>()

  const appendGroup = (items: NavItem[], spaced = false) => {
    const nav = el('nav', spaced ? 'sidebar-nav is-spaced' : 'sidebar-nav')
    for (const item of items) {
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
    section.append(nav)
  }

  appendGroup(primaryNav)
  appendGroup(libraryNav, true)

  const footer = el('div', 'sidebar-footer no-drag')
  const settingsBtn = navRow('Settings', icons.gear, 'gray')
  settingsBtn.addEventListener('click', () => navigate('settings'))
  buttons.set('settings', settingsBtn)

  const user = el('div', 'user-row')
  const profile = button('user-profile')
  profile.type = 'button'
  profile.setAttribute('aria-label', 'Open account')

  const avatar = el('div', 'avatar')
  const meta = el('div', 'user-meta')
  const nameEl = el('div', 'user-name')
  const planEl = el('div', 'user-plan')
  meta.append(nameEl, planEl)
  profile.append(avatar, meta)
  profile.addEventListener('click', () => navigate('account'))

  user.append(profile, ThemeIconButton())
  footer.append(settingsBtn, user)

  const sync = () => {
    const state = getState()
    const pending = counts(state).pending
    const activeNav =
      state.route === 'automation-new'
        ? 'automations'
        : state.route === 'rule-new'
          ? 'rules'
          : state.route === 'detailed-log'
            ? 'log'
            : state.route === 'keybinds' ||
                state.route === 'appearance' ||
                state.route === 'path-variables'
              ? 'settings'
              : state.route
    for (const [id, btn] of buttons) {
      btn.classList.toggle('active', activeNav === id)
    }
    nameEl.textContent = accountDisplayName(state.account)
    planEl.textContent = state.account.licenseLabel
    if (state.account.avatarDataUrl) {
      avatar.style.backgroundImage = `url(${state.account.avatarDataUrl})`
      avatar.style.backgroundSize = 'cover'
      avatar.style.backgroundPosition = 'center'
      avatar.textContent = ''
    } else {
      avatar.style.backgroundImage = ''
      avatar.textContent = accountInitials(state.account)
    }
    const badge = aside.querySelector<HTMLElement>('[data-badge="review"]')
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
  const tile = el('span', `app-icon-tile nav-tile tone-${tone}`)
  tile.innerHTML = iconSvg
  btn.append(tile, el('span', 'nav-label', [label]))
  return btn
}
