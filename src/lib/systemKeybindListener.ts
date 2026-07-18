import { eventToKeybind } from '@/lib/keybind'
import { systemKeybindList } from '@/lib/systemKeybinds'
import { getState, runAutomation, runSystemKeybind } from '@/app/store'
import type { SystemKeybindId } from '@/types/domain'

/** In-app keybind handling while the dashboard is focused. */
export function mountKeybindListener() {
  const onKeyDown = (event: KeyboardEvent) => {
    const state = getState()
    if (!state.keybinds.enabled) return

    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }

    const accelerator = eventToKeybind(event)
    if (!accelerator) return

    // Don't fire app actions while a keybind is being recorded.
    if (document.querySelector('.keybinds-editor-capture.recording')) return

    const system = systemKeybindList(state.systemKeybinds).find(
      (item) =>
        item.enabled &&
        item.accelerator &&
        item.accelerator.toLowerCase() === accelerator.toLowerCase(),
    )
    if (system) {
      event.preventDefault()
      runSystemKeybind(system.id as SystemKeybindId)
      return
    }

    const automation = state.automations.find(
      (a) =>
        a.active &&
        a.keybindEnabled &&
        a.keybind &&
        a.keybind.toLowerCase() === accelerator.toLowerCase(),
    )
    if (automation) {
      event.preventDefault()
      runAutomation(automation.id)
    }
  }

  window.addEventListener('keydown', onKeyDown, true)
  return () => window.removeEventListener('keydown', onKeyDown, true)
}
