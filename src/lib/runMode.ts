import type { RunMode } from '@/types/domain'

export const RUN_MODES: RunMode[] = ['review', 'ask', 'auto']

export function formatRunMode(mode: RunMode): string {
  switch (mode) {
    case 'review':
      return 'Review first'
    case 'ask':
      return 'Ask each time'
    case 'auto':
      return "Don't ask"
  }
}

export function normalizeRunMode(value: string | undefined): RunMode {
  if (value === 'ask' || value === 'auto') return value
  return 'review'
}
