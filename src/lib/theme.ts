export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'emmi.theme'

type ThemeListener = (resolved: ResolvedTheme, preference: ThemePreference) => void

const listeners = new Set<ThemeListener>()

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

export function resolveTheme(preference: ThemePreference = getPreference()): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference
}

export function applyTheme(preference: ThemePreference = getPreference()) {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  window.emmi?.setNativeTheme?.(preference)
  for (const listener of listeners) {
    listener(resolved, preference)
  }
  return resolved
}

export function setTheme(preference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, preference)
  return applyTheme(preference)
}

export function cycleTheme() {
  const order: ThemePreference[] = ['system', 'light', 'dark']
  const next = order[(order.indexOf(getPreference()) + 1) % order.length]
  return setTheme(next)
}

export function onThemeChange(listener: ThemeListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function initTheme() {
  applyTheme()

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getPreference() === 'system') {
      applyTheme('system')
    }
  })
}
