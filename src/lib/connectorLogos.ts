import { el } from '@/lib/dom'
import { icons } from '@/lib/icons'

type ConnectorVisual = {
  icon: string
  tone: string
}

const visuals: Record<string, ConnectorVisual> = {
  fs: { icon: icons.folder, tone: 'blue' },
  git: { icon: icons.github, tone: 'gray' },
  spotify: { icon: icons.music, tone: 'green' },
}

const fallback: ConnectorVisual = { icon: icons.plug, tone: 'purple' }

export function connectorVisual(id: string): ConnectorVisual {
  return visuals[id] ?? fallback
}

export function connectorLogo(id: string) {
  return connectorVisual(id).icon
}

/** Sidebar-matching icon tile for a connector. */
export function connectorIconTile(id: string, compact = false) {
  const { icon, tone } = connectorVisual(id)
  const tile = el(
    'span',
    `app-icon-tile${compact ? ' compact' : ''} tone-${tone}`,
  )
  tile.innerHTML = icon
  return tile
}
