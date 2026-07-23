import { el, button } from '@/lib/dom'
import { EmptyState } from '@/components/shared/layout'
import {
  eventToKeybind,
  findKeybindConflict,
  formatKeybindParts,
} from '@/lib/keybind'
import { systemKeybindList } from '@/lib/systemKeybinds'
import {
  getState,
  navigate,
  resetSystemKeybinds,
  setAutomationKeybind,
  setSystemKeybind,
} from '@/app/store'
import type { Automation, SystemKeybindId } from '@/types/domain'

type EditTarget =
  | { kind: 'automation'; id: string }
  | { kind: 'system'; id: SystemKeybindId }
  | null

export function Keybinds() {
  const page = el('div', 'screen settings-screen')
  const body = el('div', 'screen-body keybinds-page')
  let editing: EditTarget = null
  let autoRecord = false
  let activeKeyHandler: ((event: KeyboardEvent) => void) | null = null

  const clearKeyHandler = () => {
    if (!activeKeyHandler) return
    window.removeEventListener('keydown', activeKeyHandler, true)
    activeKeyHandler = null
  }

  const render = () => {
    clearKeyHandler()
    const state = getState()
    page.replaceChildren()
    body.replaceChildren()

    const systemItems = systemKeybindList(state.systemKeybinds)
    const systemSection = el('div', 'keybinds-section')
    const systemHead = el('div', 'keybinds-section-head')
    systemHead.append(el('div', 'keybinds-section-title', ['General']))
    const reset = button('keybinds-reset', 'Reset defaults')
    reset.type = 'button'
    reset.addEventListener('click', () => {
      resetSystemKeybinds()
      editing = null
      autoRecord = false
      render()
    })
    systemHead.append(reset)
    systemSection.append(systemHead)

    const systemList = el('div', 'keybinds-grid')
    for (const item of systemItems) {
      const isEditing =
        editing?.kind === 'system' && editing.id === item.id
      systemList.append(
        systemKeybindItem(item, state, isEditing, isEditing && autoRecord, {
          onEdit: () => {
            editing = { kind: 'system', id: item.id }
            autoRecord = true
            render()
          },
          onDone: () => {
            editing = null
            autoRecord = false
            render()
          },
          onRefresh: () => {
            autoRecord = false
            render()
          },
          setKeyHandler: (handler) => {
            clearKeyHandler()
            activeKeyHandler = handler
            if (handler) window.addEventListener('keydown', handler, true)
          },
        }),
      )
    }
    systemSection.append(systemList)
    body.append(systemSection)

    if (!state.automations.length) {
      body.append(
        EmptyState({
          title: 'No automations yet',
          body: 'Create an automation to assign a keybind.',
          actionLabel: 'Open Automations',
          onAction: () => navigate('automations'),
        }),
      )
      page.append(body)
      return
    }

    const automations = [...state.automations].sort((a, b) => {
      const aScore = a.keybind ? 0 : 1
      const bScore = b.keybind ? 0 : 1
      if (aScore !== bScore) return aScore - bScore
      return a.name.localeCompare(b.name)
    })

    const autoSection = el('div', 'keybinds-section')
    autoSection.append(el('div', 'keybinds-section-title', ['Automations']))
    const autoList = el('div', 'keybinds-grid')
    for (const automation of automations) {
      const isEditing =
        editing?.kind === 'automation' && editing.id === automation.id
      autoList.append(
        automationKeybindItem(
          automation,
          state,
          isEditing,
          isEditing && autoRecord,
          {
            onEdit: () => {
              editing = { kind: 'automation', id: automation.id }
              autoRecord = true
              render()
            },
            onDone: () => {
              editing = null
              autoRecord = false
              render()
            },
            onRefresh: () => {
              autoRecord = false
              render()
            },
            setKeyHandler: (handler) => {
              clearKeyHandler()
              activeKeyHandler = handler
              if (handler) window.addEventListener('keydown', handler, true)
            },
          },
        ),
      )
    }
    autoSection.append(autoList)
    body.append(autoSection)
    page.append(body)
  }

  render()
  return page
}

type EditorActions = {
  onEdit: () => void
  onDone: () => void
  onRefresh: () => void
  setKeyHandler: (handler: ((event: KeyboardEvent) => void) | null) => void
}

function conflictOpts(
  state: ReturnType<typeof getState>,
  ignore?: { automationId?: string; systemId?: string },
) {
  return {
    automations: state.automations,
    system: systemKeybindList(state.systemKeybinds),
    ignoreAutomationId: ignore?.automationId,
    ignoreSystemId: ignore?.systemId,
  }
}

function automationKeybindItem(
  automation: Automation,
  state: ReturnType<typeof getState>,
  editing: boolean,
  shouldAutoRecord: boolean,
  actions: EditorActions,
) {
  const masterOn = state.keybinds.enabled
  const item = el(
    'div',
    `keybinds-item${editing ? ' editing' : ''}${
      automation.keybind && !automation.keybindEnabled ? ' disabled' : ''
    }${!masterOn ? ' muted' : ''}`,
  )

  if (editing) {
    item.append(
      keybindEditor({
        name: automation.name,
        value: automation.keybind,
        masterOn,
        shouldAutoRecord,
        conflict: (accel) =>
          findKeybindConflict(
            accel,
            conflictOpts(state, { automationId: automation.id }),
          ),
        onChange: (value) => setAutomationKeybind(automation.id, value),
        actions,
      }),
    )
    return item
  }

  item.append(keybindRowButton(automation.name, automation.keybind, actions.onEdit))
  return item
}

function systemKeybindItem(
  entry: {
    id: SystemKeybindId
    label: string
    accelerator: string | null
    enabled: boolean
  },
  state: ReturnType<typeof getState>,
  editing: boolean,
  shouldAutoRecord: boolean,
  actions: EditorActions,
) {
  const masterOn = state.keybinds.enabled
  const item = el(
    'div',
    `keybinds-item${editing ? ' editing' : ''}${
      entry.accelerator && !entry.enabled ? ' disabled' : ''
    }${!masterOn ? ' muted' : ''}`,
  )

  if (editing) {
    item.append(
      keybindEditor({
        name: entry.label,
        value: entry.accelerator,
        masterOn,
        shouldAutoRecord,
        conflict: (accel) =>
          findKeybindConflict(
            accel,
            conflictOpts(state, { systemId: entry.id }),
          ),
        onChange: (value) =>
          setSystemKeybind(entry.id, { accelerator: value }),
        actions,
      }),
    )
    return item
  }

  item.append(keybindRowButton(entry.label, entry.accelerator, actions.onEdit))
  return item
}

function keybindRowButton(
  label: string,
  accelerator: string | null,
  onEdit: () => void,
) {
  const btn = button('keybinds-item-btn')
  btn.type = 'button'
  btn.append(el('span', 'keybinds-item-label', [label]))

  const keys = el('span', 'keybinds-keys')
  if (accelerator) {
    for (const part of formatKeybindParts(accelerator)) {
      keys.append(el('kbd', 'keybinds-kbd', [part]))
    }
  } else {
    keys.append(el('span', 'keybinds-none', ['Add']))
  }
  btn.append(keys)
  btn.addEventListener('click', onEdit)
  return btn
}

function keybindEditor(opts: {
  name: string
  value: string | null
  masterOn: boolean
  shouldAutoRecord: boolean
  conflict: (accelerator: string) => { name: string } | null
  onChange: (value: string | null) => void
  actions: EditorActions
}) {
  const panel = el('div', 'keybinds-editor')

  let recording = opts.shouldAutoRecord && opts.masterOn
  let draft = opts.value
  const initial = opts.value

  const name = el('span', 'keybinds-editor-name', [opts.name])
  const capture = el('div', 'keybinds-editor-capture')
  const hint = el('div', 'keybinds-editor-hint')

  const paintCapture = () => {
    capture.replaceChildren()
    capture.classList.toggle('recording', recording)
    capture.classList.toggle('empty', !draft && !recording)

    if (recording) {
      capture.append(el('span', 'keybinds-editor-prompt', ['Press keys…']))
      hint.textContent = 'Esc to close · Backspace to clear'
      hint.classList.toggle('warn', false)
      return
    }

    if (draft) {
      const keys = el('span', 'keybinds-keys')
      for (const part of formatKeybindParts(draft)) {
        keys.append(el('kbd', 'keybinds-kbd', [part]))
      }
      capture.append(keys)
      const conflict = opts.conflict(draft)
      if (conflict) {
        hint.textContent = `Also used by ${conflict.name}`
        hint.classList.toggle('warn', true)
      } else {
        hint.textContent = 'Click keys to re-record'
        hint.classList.toggle('warn', false)
      }
      return
    }

    capture.append(el('span', 'keybinds-editor-prompt empty', ['Press keys…']))
    hint.textContent = 'Esc to close · use a modifier + key'
    hint.classList.toggle('warn', false)
  }

  const stopRecording = () => {
    if (!recording) return
    recording = false
    opts.actions.setKeyHandler(null)
    paintCapture()
  }

  const closeEditor = () => {
    opts.actions.setKeyHandler(null)
    recording = false
    opts.actions.onDone()
  }

  const startRecording = () => {
    if (!opts.masterOn || recording) return
    recording = true
    paintCapture()
    opts.actions.setKeyHandler(onKeyDown)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    if (event.key === 'Escape') {
      // Don't leave the empty "Click to record" state — just close.
      if (draft !== initial) opts.onChange(initial)
      closeEditor()
      return
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      draft = null
      opts.onChange(null)
      stopRecording()
      opts.actions.onRefresh()
      return
    }

    const next = eventToKeybind(event)
    if (!next) return
    draft = next
    opts.onChange(next)
    stopRecording()
    opts.actions.onRefresh()
  }

  capture.tabIndex = 0
  capture.setAttribute('role', 'button')
  capture.addEventListener('click', () => {
    if (!opts.masterOn) return
    if (recording) return
    startRecording()
  })

  const done = button('btn btn-ghost btn-compact', 'Done')
  done.type = 'button'
  done.addEventListener('click', closeEditor)

  const top = el('div', 'keybinds-editor-row')
  top.append(name, capture)

  const bottom = el('div', 'keybinds-editor-row')
  bottom.append(done, hint)

  panel.append(top, bottom)
  paintCapture()

  if (recording) {
    opts.actions.setKeyHandler(onKeyDown)
    requestAnimationFrame(() => capture.focus())
  } else if (!draft && opts.masterOn) {
    // Never show a dead "Click to record" panel — start capturing.
    startRecording()
  }

  return panel
}
