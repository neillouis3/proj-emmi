import {
  Folder01Icon,
  GithubIcon,
  HardDriveIcon,
  SpotifyIcon,
} from '@hugeicons/core-free-icons'

type IconNode = [string, Record<string, string | number>]
type HugeIcon = IconNode[]

function toAttr(key: string, value: string | number) {
  const name =
    key === 'strokeWidth'
      ? 'stroke-width'
      : key === 'strokeLinecap'
        ? 'stroke-linecap'
        : key === 'strokeLinejoin'
          ? 'stroke-linejoin'
          : key === 'fillRule'
            ? 'fill-rule'
            : key === 'clipRule'
              ? 'clip-rule'
              : key
  return `${name}="${value}"`
}

function renderHugeIcon(icon: HugeIcon, size = 16) {
  const body = icon
    .map(([tag, attrs]) => {
      const attr = Object.entries(attrs)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => toAttr(key, value))
        .join(' ')
      return `<${tag} ${attr} />`
    })
    .join('')

  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
}

const logos: Record<string, string> = {
  fs: renderHugeIcon(HardDriveIcon as HugeIcon, 16),
  git: renderHugeIcon(GithubIcon as HugeIcon, 16),
  spotify: renderHugeIcon(SpotifyIcon as HugeIcon, 16),
}

const fallback = renderHugeIcon(Folder01Icon as HugeIcon, 16)

export function connectorLogo(id: string) {
  return logos[id] ?? fallback
}
