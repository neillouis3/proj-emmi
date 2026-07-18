import { el, button } from '@/lib/dom'
import {
  eventToKeybind,
  findKeybindConflict,
  formatKeybind,
} from '@/lib/keybind'

export function KeybindField(opts: {
  value: string | null
  automations: {
    id: string
    name: string
    keybind: string | null
    keybindEnabled?: boolean
  }[]
  ignoreId?: string
  disabled?: boolean
  onChange: (value: string | null) => void
}) {
  const root = el('div', 'keybind-field')
  const capture = button('keybind-capture')
  capture.type = 'button'
  capture.disabled = Boolean(opts.disabled)

  let recording = false
  let current = opts.value

  const hint = el('div', 'keybind-hint')

  const paint = () => {
    capture.classList.toggle('recording', recording)
    capture.classList.toggle('empty', !current && !recording)
    capture.textContent = recording
      ? 'Press keys…'
      : current
        ? formatKeybind(current)
        : 'Click to record'
    capture.setAttribute(
      'aria-label',
      recording
        ? 'Recording shortcut. Press Escape to cancel.'
        : current
          ? `Shortcut ${formatKeybind(current)}. Click to change.`
          : 'No shortcut. Click to record.',
    )

    if (!current || recording) {
      hint.textContent = recording
        ? 'Esc to cancel · Backspace to clear'
        : 'Use a modifier + key (e.g. ⌘⇧D)'
      hint.classList.toggle('warn', false)
      return
    }

    const conflict = findKeybindConflict(current, {
      automations: opts.automations,
      ignoreAutomationId: opts.ignoreId,
    })
    if (conflict) {
      hint.textContent = `Also used by ${conflict.name}`
      hint.classList.toggle('warn', true)
    } else {
      hint.textContent = ''
      hint.classList.toggle('warn', false)
    }
  }

  const stopRecording = () => {
    if (!recording) return
    recording = false
    window.removeEventListener('keydown', onKeyDown, true)
    paint()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      stopRecording()
      return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      current = null
      opts.onChange(null)
      stopRecording()
      return
    }

    const next = eventToKeybind(event)
    if (!next) return
    current = next
    opts.onChange(next)
    stopRecording()
  }

  capture.addEventListener('click', () => {
    if (opts.disabled) return
    if (recording) {
      stopRecording()
      return
    }
    recording = true
    paint()
    window.addEventListener('keydown', onKeyDown, true)
  })

  capture.addEventListener('blur', () => {
    // Defer so a successful key capture can finish first.
    requestAnimationFrame(() => {
      if (recording && document.activeElement !== capture) stopRecording()
    })
  })

  paint()
  root.append(capture, hint)
  return root
}
