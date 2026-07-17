import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import {
  canGoBack,
  canGoForward,
  getState,
  goBack,
  goForward,
  navigate,
  subscribe,
} from '@/app/store'
import type { ScreenId } from '@/types/domain'

const TITLES: Record<ScreenId, string> = {
  overview: 'Dashboard',
  review: 'Review Queue',
  automations: 'Automations',
  connectors: 'Connectors',
  log: 'Log',
  rules: 'Rules',
  settings: 'Settings',
}

export function WorkspaceHeader() {
  const bar = el('div', 'workspace-header drag-region')
  const left = el('div', 'workspace-header-left')
  const right = el('div', 'workspace-header-right')

  const back = iconBtn(icons.back, 'Back', goBack)
  const forward = iconBtn(icons.forward, 'Forward', goForward)
  const title = el('span', 'workspace-header-title')

  left.append(
    el('div', 'workspace-header-nav no-drag', [back, forward]),
    el('span', 'workspace-header-sep'),
    title,
  )

  const more = iconBtn(icons.more, 'More', () => navigate('settings'))

  right.append(more)
  bar.append(left, right)

  const sync = () => {
    const state = getState()
    title.textContent = TITLES[state.route]
    back.disabled = !canGoBack()
    forward.disabled = !canGoForward()
  }

  sync()
  subscribe(sync)
  return bar
}

function iconBtn(svg: string, label: string, onClick: () => void) {
  const btn = button('workspace-header-btn no-drag')
  btn.type = 'button'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = svg
  btn.addEventListener('click', onClick)
  return btn
}
