import type { SystemKeybindId, SystemKeybindState } from '@/types/domain'

/** Built-in Emmi actions with default accelerators (Electron-style). */

export type SystemKeybindDef = {
  id: SystemKeybindId
  label: string
  /** Default accelerator; null = unbound by default. */
  defaultAccelerator: string | null
}

export const SYSTEM_KEYBIND_DEFS: SystemKeybindDef[] = [
  {
    id: 'open-dashboard',
    label: 'Open Dashboard',
    defaultAccelerator: 'CommandOrControl+Shift+E',
  },
  {
    id: 'open-settings',
    label: 'Settings',
    defaultAccelerator: 'CommandOrControl+,',
  },
  {
    id: 'open-review',
    label: 'Open Review Queue',
    defaultAccelerator: 'CommandOrControl+Shift+R',
  },
  {
    id: 'open-automations',
    label: 'Open Automations',
    defaultAccelerator: 'CommandOrControl+Shift+A',
  },
  {
    id: 'open-logs',
    label: 'Open Logs',
    defaultAccelerator: 'CommandOrControl+Shift+L',
  },
  {
    id: 'open-keybinds',
    label: 'Open Keybinds',
    defaultAccelerator: 'CommandOrControl+Shift+K',
  },
  {
    id: 'new-automation',
    label: 'New Automation',
    defaultAccelerator: 'CommandOrControl+N',
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    defaultAccelerator: 'CommandOrControl+B',
  },
]

export function createDefaultSystemKeybinds(): Record<
  SystemKeybindId,
  SystemKeybindState
> {
  const out = {} as Record<SystemKeybindId, SystemKeybindState>
  for (const def of SYSTEM_KEYBIND_DEFS) {
    out[def.id] = {
      accelerator: def.defaultAccelerator,
      enabled: true,
    }
  }
  return out
}

export function resolveSystemKeybinds(
  overrides?: Partial<Record<SystemKeybindId, Partial<SystemKeybindState>>>,
): Record<SystemKeybindId, SystemKeybindState> {
  const base = createDefaultSystemKeybinds()
  if (!overrides) return base
  for (const def of SYSTEM_KEYBIND_DEFS) {
    const patch = overrides[def.id]
    if (!patch) continue
    base[def.id] = {
      accelerator:
        patch.accelerator !== undefined
          ? patch.accelerator
          : base[def.id].accelerator,
      enabled: patch.enabled ?? base[def.id].enabled,
    }
  }
  return base
}

export function systemKeybindList(
  state: Record<SystemKeybindId, SystemKeybindState>,
) {
  return SYSTEM_KEYBIND_DEFS.map((def) => ({
    ...def,
    accelerator: state[def.id]?.accelerator ?? def.defaultAccelerator,
    enabled: state[def.id]?.enabled ?? true,
  }))
}
