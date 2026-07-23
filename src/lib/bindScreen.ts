import { subscribe } from '@/app/store'

/** Render now and again whenever app state changes (until the page is removed). */
export function bindScreen(page: HTMLElement, render: () => void) {
  render()
  const unsub = subscribe(() => {
    if (!page.isConnected) {
      unsub()
      return
    }
    render()
  })
  return page
}
