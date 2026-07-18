/** Canonical storage uses Electron accelerator tokens (CommandOrControl, Shift, Alt, …). */

const MOD_ORDER = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Option', 'AltGr', 'Shift', 'Super'] as const

const DISPLAY: Record<string, string> = {
  CommandOrControl: typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl',
  Command: '⌘',
  Control: typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌃'
    : 'Ctrl',
  Alt: typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌥' : 'Alt',
  Option: '⌥',
  Shift: '⇧',
  Super: '⌘',
  Meta: '⌘',
  Enter: '↵',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
  Delete: '⌦',
  Space: 'Space',
}

export function isMacPlatform() {
  if (typeof window !== 'undefined' && window.emmi?.platform === 'darwin') return true
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

export function normalizeKeybind(parts: string[]): string | null {
  const unique = [...new Set(parts.filter(Boolean))]
  if (!unique.length) return null

  const mods = unique.filter((p) =>
    MOD_ORDER.includes(p as (typeof MOD_ORDER)[number]),
  )
  const keys = unique.filter(
    (p) => !MOD_ORDER.includes(p as (typeof MOD_ORDER)[number]),
  )
  if (!keys.length) return null

  const orderedMods = MOD_ORDER.filter((m) => mods.includes(m))
  const key = keys[keys.length - 1]
  if (!key) return null
  // Require at least one modifier for global safety (except F-keys).
  if (!orderedMods.length && !/^F\d{1,2}$/i.test(key)) return null

  return [...orderedMods, key].join('+')
}

export function eventToKeybind(event: KeyboardEvent): string | null {
  if (event.key === 'Escape' || event.key === 'Tab') return null
  if (event.key === 'Backspace' || event.key === 'Delete') return null

  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  let key = event.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else if (key.startsWith('Arrow')) {
    // keep ArrowUp etc.
  } else if (/^F\d{1,2}$/i.test(key)) key = key.toUpperCase()
  else if (['Meta', 'Control', 'Alt', 'Shift', 'Dead'].includes(key)) return null

  parts.push(key)
  return normalizeKeybind(parts)
}

export function formatKeybind(accelerator: string | null | undefined): string {
  if (!accelerator) return 'None'
  return formatKeybindParts(accelerator).join(isMacPlatform() ? '' : '+')
}

export function formatKeybindParts(accelerator: string): string[] {
  return accelerator.split('+').map((part) => DISPLAY[part] ?? part)
}

export function findKeybindConflict(
  accelerator: string,
  options: {
    automations: {
      id: string
      name: string
      keybind: string | null
      keybindEnabled?: boolean
    }[]
    system?: {
      id: string
      label: string
      accelerator: string | null
      enabled?: boolean
    }[]
    ignoreAutomationId?: string
    ignoreSystemId?: string
  },
) {
  const auto = options.automations.find(
    (a) =>
      a.id !== options.ignoreAutomationId &&
      a.keybindEnabled !== false &&
      a.keybind &&
      a.keybind.toLowerCase() === accelerator.toLowerCase(),
  )
  if (auto) return { kind: 'automation' as const, id: auto.id, name: auto.name }

  const system = options.system?.find(
    (s) =>
      s.id !== options.ignoreSystemId &&
      s.enabled !== false &&
      s.accelerator &&
      s.accelerator.toLowerCase() === accelerator.toLowerCase(),
  )
  if (system) return { kind: 'system' as const, id: system.id, name: system.label }

  return null
}
