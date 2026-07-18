import type { AppearancePrefs } from '@/types/domain'

const FONT_STACKS: Record<AppearancePrefs['uiFontFamily'], string> = {
  system:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'sf-pro': '"SF Pro Text", "Avenir Next", "Segoe UI", sans-serif',
  inter: 'Inter, "Segoe UI", system-ui, sans-serif',
  geist: 'Geist, Inter, "Segoe UI", system-ui, sans-serif',
  'ibm-plex': '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
}

export const UI_FONT_OPTIONS: {
  value: AppearancePrefs['uiFontFamily']
  label: string
}[] = [
  { value: 'system', label: 'System font' },
  { value: 'sf-pro', label: 'SF Pro' },
  { value: 'inter', label: 'Inter' },
  { value: 'geist', label: 'Geist' },
  { value: 'ibm-plex', label: 'IBM Plex Sans' },
]

export function accentCss(hue: number, intensity: number) {
  const sat = 18 + (intensity / 100) * 52
  const light = 52 + (1 - intensity / 100) * 8
  return {
    accent: `hsl(${hue} ${sat}% ${light}%)`,
    accentHover: `hsl(${hue} ${Math.min(100, sat + 8)}% ${Math.max(30, light - 8)}%)`,
    tint: `hsla(${hue} ${Math.max(sat, 40)}% 50% / ${intensity / 100})`,
  }
}

export function applyAppearance(prefs: AppearancePrefs) {
  const root = document.documentElement

  if (prefs.accentIntensity <= 0) {
    root.style.setProperty('--color-accent', '#3b82f6')
    root.style.setProperty('--color-accent-hover', '#2563eb')
    root.style.setProperty('--appearance-tint', 'transparent')
  } else {
    const colors = accentCss(prefs.accentHue, prefs.accentIntensity)
    root.style.setProperty('--color-accent', colors.accent)
    root.style.setProperty('--color-accent-hover', colors.accentHover)
    root.style.setProperty('--appearance-tint', colors.tint)
  }

  root.style.setProperty('--font-size-ui', `${prefs.uiFontSize}px`)
  root.style.setProperty('--font-ui', FONT_STACKS[prefs.uiFontFamily])

  root.dataset.reduceTransparency = prefs.reduceTransparency ? 'true' : 'false'
  root.dataset.reduceMotion = prefs.reduceMotion ? 'true' : 'false'
  root.dataset.fontSmoothing = prefs.fontSmoothing ? 'true' : 'false'

  root.style.setProperty(
    '-webkit-font-smoothing',
    prefs.fontSmoothing ? 'antialiased' : 'auto',
  )
}
