import type { ScreenId } from '@/types/domain'
import { getState, navigate, subscribe } from '@/app/store'

const loaders: Record<ScreenId, () => Promise<() => HTMLElement>> = {
  overview: () => import('@/components/screens/Overview').then((m) => m.Overview),
  review: () => import('@/components/screens/ReviewQueue').then((m) => m.ReviewQueue),
  rules: () => import('@/components/screens/Rules').then((m) => m.Rules),
  automations: () => import('@/components/screens/Automations').then((m) => m.Automations),
  'automation-new': () =>
    import('@/components/screens/AutomationNew').then((m) => m.AutomationNew),
  'rule-new': () => import('@/components/screens/RuleNew').then((m) => m.RuleNew),
  connectors: () => import('@/components/screens/Connectors').then((m) => m.Connectors),
  packs: () => import('@/components/screens/Packs').then((m) => m.Packs),
  log: () => import('@/components/screens/Log').then((m) => m.Log),
  'detailed-log': () =>
    import('@/components/screens/DetailedLog').then((m) => m.DetailedLog),
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

    void loaders[route]()
      .then((Screen) => {
        if (token !== renderToken || getState().route !== route) return
        outlet.replaceChildren(Screen())
      })
      .catch((err) => {
        if (token !== renderToken || getState().route !== route) return
        outlet.replaceChildren(loadError(route, err))
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

function loadError(route: ScreenId, err: unknown) {
  const node = document.createElement('div')
  node.className = 'screen-loading screen-error'
  const message = err instanceof Error ? err.message : String(err)
  node.textContent = `Could not open ${route}: ${message}`
  return node
}

function placeholder(route: ScreenId) {
  const node = document.createElement('div')
  node.className = 'screen-loading'
  node.textContent = `Loading ${route}…`
  return node
}
