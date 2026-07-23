import type {
  AccountProfile,
  AppearancePrefs,
  AppState,
  AutomationPrefs,
  GeneralPrefs,
  KeybindPrefs,
  LlmConfig,
  NotificationPrefs,
  OtherPrefs,
  PathVariable,
  SystemKeybindId,
  SystemKeybindState,
} from '@/types/domain'
import { defaultPathVariables } from '@/lib/pathVariables'
import { createDefaultSystemKeybinds } from '@/lib/systemKeybinds'

export type PersistedPrefs = {
  v: 1
  general: GeneralPrefs
  appearance: AppearancePrefs
  notifications: NotificationPrefs
  automationsPrefs: AutomationPrefs
  other: OtherPrefs
  keybinds: KeybindPrefs
  systemKeybinds: Record<SystemKeybindId, SystemKeybindState>
  account: AccountProfile
  llm: LlmConfig
  pathVariables: PathVariable[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function prefsSnapshot(state: AppState): PersistedPrefs {
  return {
    v: 1,
    general: state.general,
    appearance: state.appearance,
    notifications: state.notifications,
    automationsPrefs: state.automationsPrefs,
    other: state.other,
    keybinds: state.keybinds,
    systemKeybinds: state.systemKeybinds,
    account: state.account,
    llm: state.llm,
    pathVariables: state.pathVariables,
  }
}

export function mergePersistedPrefs(
  defaults: AppState,
  raw: unknown,
): Partial<AppState> {
  if (!isObject(raw)) return {}
  const next: Partial<AppState> = {}

  if (isObject(raw.general)) {
    next.general = { ...defaults.general, ...(raw.general as GeneralPrefs) }
  }
  if (isObject(raw.appearance)) {
    next.appearance = {
      ...defaults.appearance,
      ...(raw.appearance as AppearancePrefs),
    }
  }
  if (isObject(raw.notifications)) {
    next.notifications = {
      ...defaults.notifications,
      ...(raw.notifications as NotificationPrefs),
    }
  }
  if (isObject(raw.automationsPrefs)) {
    next.automationsPrefs = {
      ...defaults.automationsPrefs,
      ...(raw.automationsPrefs as AutomationPrefs),
    }
  }
  if (isObject(raw.other)) {
    next.other = { ...defaults.other, ...(raw.other as OtherPrefs) }
  }
  if (isObject(raw.keybinds)) {
    next.keybinds = { ...defaults.keybinds, ...(raw.keybinds as KeybindPrefs) }
  }
  if (isObject(raw.systemKeybinds)) {
    next.systemKeybinds = {
      ...createDefaultSystemKeybinds(),
      ...(raw.systemKeybinds as Record<SystemKeybindId, SystemKeybindState>),
    }
  }
  if (isObject(raw.account)) {
    const account = {
      ...defaults.account,
      ...(raw.account as AccountProfile),
    }
    if (!account.email?.trim()) account.email = 'emmi.dev'
    next.account = account
  }
  if (isObject(raw.llm)) {
    next.llm = { ...defaults.llm, ...(raw.llm as LlmConfig) }
  }
  if (Array.isArray(raw.pathVariables)) {
    const vars = raw.pathVariables.filter(
      (item): item is PathVariable =>
        isObject(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.path === 'string',
    )
    next.pathVariables = vars.length ? vars : defaultPathVariables()
  }

  return next
}
