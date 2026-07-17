import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import {
  getPreference,
  onThemeChange,
  setTheme,
  type ThemePreference,
} from '@/lib/theme'

const options: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'system', label: 'System', icon: icons.laptop },
  { value: 'light', label: 'Light', icon: icons.sun },
  { value: 'dark', label: 'Dark', icon: icons.moon },
]

export function ThemeMenuButton() {
  const wrap = el('div', 'theme-menu-wrap')
  const trigger = button('icon-btn')
  trigger.setAttribute('aria-label', 'Theme')
  trigger.title = 'Theme'

  const menu = el('div', 'theme-menu')
  menu.hidden = true

  const renderTrigger = () => {
    const preference = getPreference()
    const current = options.find((option) => option.value === preference) ?? options[0]
    trigger.innerHTML = current.icon
    trigger.title = `Theme: ${current.label}`
  }

  const renderMenu = () => {
    const preference = getPreference()
    menu.replaceChildren(
      ...options.map((option) => {
        const item = button(
          `theme-menu-item${option.value === preference ? ' active' : ''}`,
        )
        item.innerHTML = `
          <span class="icon">${option.icon}</span>
          <span>${option.label}</span>
          ${option.value === preference ? `<span class="check">${icons.check}</span>` : ''}
        `
        item.addEventListener('click', () => {
          setTheme(option.value)
          menu.hidden = true
        })
        return item
      }),
    )
  }

  const close = () => {
    menu.hidden = true
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    const nextHidden = !menu.hidden
    if (!nextHidden) renderMenu()
    menu.hidden = nextHidden
  })

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target as Node)) {
      close()
    }
  })

  onThemeChange(() => {
    renderTrigger()
    if (!menu.hidden) renderMenu()
  })

  renderTrigger()
  wrap.append(trigger, menu)
  return wrap
}
