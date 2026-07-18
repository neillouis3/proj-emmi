import type { ScreenId } from '@/types/domain'
import { getState, navigate, subscribe } from '@/app/store'

const loaders: Record<ScreenId, () => Promise<() => HTMLElement>> = {
  overview: () => import('@/components/screens/Overview').then((m) => m.Overview),
  review: () => import('@/components/screens/ReviewQueue').then((m) => m.ReviewQueue),
  rules: () => import('@/components/screens/RulesEditor').then((m) => m.RulesEditor),
  'rule-new': () => import('@/components/screens/RuleNew').then((m) => m.RuleNew),
  automations: () => import('@/components/screens/Automations').then((m) => m.Automations),
  'automation-new': () =>
    import('@/components/screens/AutomationNew').then((m) => m.AutomationNew),
  connectors: () => import('@/components/screens/Connectors').then((m) => m.Connectors),
  log: () => import('@/components/screens/Log').then((m) => m.Log),
  keybinds: () => import('@/components/screens/Keybinds').then((m) => m.Keybinds),
  appearance: () =>
    import('@/components/screens/Appearance').then((m) => m.Appearance),
  'path-variables': () =>
    import('@/components/screens/PathVariables').then((m) => m.PathVariables),
  settings: () => import('@/components/screens/Settings').then((m) => m.Settings),
  account: () => import('@/components/screens/Account').then((m) => m.Account),
}

export function mountRouter(outlet: HTMLElement) {
  let current: ScreenId | null = null
  let renderToken = 0

  const render = () => {
    const { route } = getState()
    if (route === current) return
    current = route
    const token = ++renderToken
    outlet.replaceChildren(placeholder(route))

    void loaders[route]().then((Screen) => {
      if (token !== renderToken || getState().route !== route) return
      outlet.replaceChildren(Screen())
    })
  }

  const params = new URLSearchParams(window.location.search)
  const initial = params.get('route') as ScreenId | null
  if (initial && initial in loaders) {
    navigate(initial)
    params.delete('route')
    const url = new URL(window.location.href)
    url.search = params.toString()
    window.history.replaceState({}, '', url.toString())
  }

  render()
  return subscribe(render)
}

function placeholder(route: ScreenId) {
  const node = document.createElement('div')
  node.className = 'screen-loading'
  node.textContent = `Loading ${route}…`
  return node
}
