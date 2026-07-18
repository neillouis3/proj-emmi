import '@/styles/index.css'
import { initTheme } from '@/lib/theme'
import type { ScreenId, SystemKeybindId } from '@/types/domain'

initTheme()

const rootEl = document.querySelector<HTMLDivElement>('#app')
if (!rootEl) {
  throw new Error('Root element #app not found')
}
const root = rootEl

const params = new URLSearchParams(window.location.search)
const surface = params.get('surface') ?? 'dashboard'
const route = params.get('route') as ScreenId | null

document.documentElement.dataset.surface = surface

async function boot() {
  if (surface === 'menu') {
    window.close()
    return
  }

  const store = await import('@/app/store')
  store.pushTraySync()
  window.emmi.setShowInDock?.(store.getState().general.showInDock)
  window.emmi.setMenuBarTitle?.(store.getState().general.showMenuBarTitle)
  window.emmi.onClearNotifications?.(() => store.clearNotifications())
  window.emmi.onKeybindTriggered?.((payload) => {
    if (payload.kind === 'system') {
      store.runSystemKeybind(payload.id as SystemKeybindId)
      return
    }
    store.runAutomation(payload.id)
  })

  if (surface === 'panel') {
    document.body.classList.add('surface-panel')
    const { Panel } = await import('@/surfaces/Panel')
    root.replaceChildren(Panel(params.get('kind') ?? '', params.get('id') ?? undefined))
    return
  }

  const { App } = await import('@/components/App')
  if (route) store.navigate(route)
  // Drop sticky route from the URL so refresh opens Dashboard again.
  const url = new URL(window.location.href)
  if (url.searchParams.has('route')) {
    url.searchParams.delete('route')
    window.history.replaceState({}, '', url.toString())
  }
  App(root)

  const { mountKeybindListener } = await import('@/lib/systemKeybindListener')
  mountKeybindListener()
}

void boot()
