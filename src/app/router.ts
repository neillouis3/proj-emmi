import type { ScreenId } from '@/types/domain'
import { getState, navigate, subscribe } from '@/app/store'

const loaders: Record<ScreenId, () => Promise<() => HTMLElement>> = {
  overview: () => import('@/components/screens/Overview').then((m) => m.Overview),
  review: () => import('@/components/screens/ReviewQueue').then((m) => m.ReviewQueue),
  rules: () => import('@/components/screens/RulesEditor').then((m) => m.RulesEditor),
  automations: () => import('@/components/screens/Automations').then((m) => m.Automations),
  connectors: () => import('@/components/screens/Connectors').then((m) => m.Connectors),
  log: () => import('@/components/screens/Log').then((m) => m.Log),
  settings: () => import('@/components/screens/Settings').then((m) => m.Settings),
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
