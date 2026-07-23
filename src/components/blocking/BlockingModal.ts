import { el, button } from '@/lib/dom'
import { icons } from '@/lib/icons'
import { dismissBlocking, getState, resolveBlocking, subscribe } from '@/app/store'

export function BlockingModalHost() {
  const host = el('div', 'blocking-host')
  host.hidden = true

  const render = () => {
    const { blocking } = getState()
    if (!blocking) {
      host.hidden = true
      host.replaceChildren()
      return
    }

    host.hidden = false
    const backdrop = el('div', 'blocking-backdrop')
    const modal = el('div', `blocking-modal kind-${blocking.kind}`)
    const icon = el('div', 'blocking-icon')
    icon.innerHTML = icons.alert

    modal.append(
      icon,
      el('h2', 'blocking-title', [blocking.title]),
      el('p', 'blocking-body', [blocking.body]),
    )

    const actions = el('div', 'blocking-actions')
    const primary = button(
      blocking.kind === 'permissions' ? 'btn btn-primary' : 'btn btn-blocking',
      blocking.primaryLabel,
    )
    primary.addEventListener('click', () => resolveBlocking(true))
    actions.append(primary)

    if (blocking.secondaryLabel) {
      const secondary = button('btn btn-ghost', blocking.secondaryLabel)
      secondary.addEventListener('click', () => {
        if (
          blocking.kind === 'ask' ||
          blocking.kind === 'permissions' ||
          blocking.kind === 'confirm' ||
          blocking.kind === 'chrome-setup' ||
          blocking.kind === 'safari-setup'
        ) {
          resolveBlocking(false)
        } else dismissBlocking()
      })
      actions.append(secondary)
    }

    modal.append(actions)
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop && blocking.kind !== 'ask') dismissBlocking()
    })
    backdrop.append(modal)
    host.replaceChildren(backdrop)
  }

  render()
  subscribe(render)
  return host
}
