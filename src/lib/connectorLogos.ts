import { el } from '@/lib/dom'
import { icons } from '@/lib/icons'
import appleSvg from '@/assets/brands/apple.svg?raw'
import chromeSvg from '@/assets/brands/chrome.svg?raw'
import filesSvg from '@/assets/brands/files.svg?raw'
import gitSvg from '@/assets/brands/git.svg?raw'
import safariSvg from '@/assets/brands/safari.svg?raw'
import shellSvg from '@/assets/brands/shell.svg?raw'
import spotifySvg from '@/assets/brands/spotify.svg?raw'
import accountsSvg from '@/assets/brands/accounts.svg?raw'

type BrandAsset = {
  svg: string
  mono?: boolean
  scale?: number
}

/**
 * Brand SVGs keyed by logo filename from connector/pack manifests.
 * Packs preferably load their own file from the daemon; this map is the
 * fallback for in-app connector tiles that declare `logo: chrome.svg`.
 */
const LOGO_ASSETS: Record<string, BrandAsset> = {
  'chrome.svg': { svg: chromeSvg },
  'safari.svg': { svg: safariSvg },
  'git.svg': { svg: gitSvg },
  'shell.svg': { svg: shellSvg, mono: true, scale: 1.12 },
  'files.svg': { svg: filesSvg, scale: 1.08 },
  'apple.svg': { svg: appleSvg, mono: true, scale: 1.08 },
  'spotify.svg': { svg: spotifySvg },
  'accounts.svg': { svg: accountsSvg, mono: true, scale: 1.05 },
}

let brandSeq = 0

function toCurrentColor(svg: string): string {
  return svg
    .replace(/\sfill="(?!none)[^"]*"/gi, ' fill="currentColor"')
    .replace(/style="fill:[^"]*"/gi, 'style="fill:currentColor"')
    .replace(/fill:#(?:[0-9a-f]{3,8})\b/gi, 'fill:currentColor')
}

/** Prepare brand SVG for inline use (unique ids, sized to the tile). */
export function prepareBrandSvg(
  raw: string,
  opts: { scale?: number; mono?: boolean } = {},
): string {
  const scale = opts.scale ?? 1
  brandSeq += 1
  const uid = `b${brandSeq}`
  let svg = String(raw ?? '').trim()
  if (!svg) return ''

  if (opts.mono) svg = toCurrentColor(svg)

  svg = svg.replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${uid}-${id}"`)
  svg = svg.replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${uid}-${id})`)
  svg = svg.replace(/xlink:href="#([^"]+)"/g, (_m, id: string) => `xlink:href="#${uid}-${id}"`)
  svg = svg.replace(/href="#([^"]+)"/g, (_m, id: string) => `href="#${uid}-${id}"`)

  if (/<svg\b/.test(svg)) {
    svg = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
      let next = attrs
        .replace(/\s(width|height)="[^"]*"/g, '')
        .replace(/\sstyle="[^"]*"/g, '')
        .replace(/\sclass="[^"]*"/g, '')
      if (!/\bviewBox=/.test(next)) {
        const wh = attrs.match(/\bwidth="(\d+(?:\.\d+)?)"/)
        const hh = attrs.match(/\bheight="(\d+(?:\.\d+)?)"/)
        if (wh && hh) next += ` viewBox="0 0 ${wh[1]} ${hh[1]}"`
      }
      if (!/\bpreserveAspectRatio=/.test(next)) {
        next += ' preserveAspectRatio="xMidYMid meet"'
      }
      if (!/\bfocusable=/.test(next)) next += ' focusable="false"'
      if (!/\baria-hidden=/.test(next)) next += ' aria-hidden="true"'
      const style =
        scale === 1 ? '' : ` style="transform:scale(${scale});transform-origin:center"`
      return `<svg${next} width="100%" height="100%" class="connector-brand-svg"${style}>`
    })
  }

  if (opts.mono && !/\bfill="/i.test(svg)) {
    svg = svg.replace(/<path\b/i, '<path fill="currentColor"')
  }

  return svg
}

/** Unique-ify gradient/clip ids so multiple inline SVGs don't collide. */
export function uniqueInlineSvg(raw: string): string {
  return prepareBrandSvg(raw, { scale: 1, mono: false })
}

function normalizeLogoKey(logo: string): string {
  const base = logo.trim().split(/[/\\]/).pop() ?? logo.trim()
  return base.toLowerCase()
}

function fallbackTile(compact: boolean) {
  const tile = el(
    'span',
    `app-icon-tile${compact ? ' compact' : ''} tone-purple`,
  )
  tile.innerHTML = icons.plug
  return tile
}

/** Icon tile from a manifest `logo:` filename. */
export function logoIconTile(logo?: string | null, compact = false) {
  if (!logo) return fallbackTile(compact)
  const asset = LOGO_ASSETS[normalizeLogoKey(logo)]
  if (!asset) return fallbackTile(compact)

  const stem = normalizeLogoKey(logo).replace(/\.svg$/i, '')
  const wrap = el(
    'span',
    `connector-brand-icon${compact ? ' compact' : ''}${asset.mono ? ' mono' : ''} brand-${stem}`,
  )
  wrap.innerHTML = prepareBrandSvg(asset.svg, {
    scale: asset.scale ?? 1,
    mono: asset.mono,
  })
  return wrap
}

/**
 * Connector icon. Prefer the manifest logo filename; fall back to `<id>.svg`
 * (with `fs` → `files.svg`) so call sites that only have an id still work.
 */
export function connectorIconTile(
  id: string,
  compact = false,
  logo?: string | null,
) {
  const resolved =
    logo?.trim() ||
    (id === 'fs' ? 'files.svg' : id ? `${id}.svg` : '')
  return logoIconTile(resolved, compact)
}
