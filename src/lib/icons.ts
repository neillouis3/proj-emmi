import plusSvg from 'heroicons/20/solid/plus.svg?raw'
import searchSvg from 'heroicons/20/solid/magnifying-glass.svg?raw'
import inboxSvg from 'heroicons/20/solid/inbox.svg?raw'
import layoutSvg from 'heroicons/20/solid/squares-2x2.svg?raw'
import filterSvg from 'heroicons/20/solid/funnel.svg?raw'
import folderPlusSvg from 'heroicons/20/solid/folder-plus.svg?raw'
import folderSvg from 'heroicons/20/solid/folder.svg?raw'
import chevronDownSvg from 'heroicons/20/solid/chevron-down.svg?raw'
import chevronLeftSvg from 'heroicons/20/solid/chevron-left.svg?raw'
import chevronRightSvg from 'heroicons/20/solid/chevron-right.svg?raw'
import chevronUpSvg from 'heroicons/20/solid/chevron-up.svg?raw'
import chevronUpDownSvg from 'heroicons/20/solid/chevron-up-down.svg?raw'
import branchSvg from 'heroicons/20/solid/share.svg?raw'
import laptopSvg from 'heroicons/20/solid/computer-desktop.svg?raw'
import micSvg from 'heroicons/20/solid/microphone.svg?raw'
import giftSvg from 'heroicons/20/solid/gift.svg?raw'
import gearSvg from 'heroicons/20/solid/cog-6-tooth.svg?raw'
import moreSvg from 'heroicons/20/solid/ellipsis-horizontal.svg?raw'
import sidebarSvg from 'heroicons/20/solid/bars-3.svg?raw'
import externalSvg from 'heroicons/20/solid/arrow-top-right-on-square.svg?raw'
import githubSvg from 'heroicons/20/solid/code-bracket.svg?raw'
import backSvg from 'heroicons/20/solid/arrow-left.svg?raw'
import forwardSvg from 'heroicons/20/solid/arrow-right.svg?raw'
import chatSvg from 'heroicons/20/solid/chat-bubble-left-right.svg?raw'
import sunSvg from 'heroicons/20/solid/sun.svg?raw'
import moonSvg from 'heroicons/20/solid/moon.svg?raw'
import checkSvg from 'heroicons/20/solid/check.svg?raw'
import homeSvg from 'heroicons/20/solid/home.svg?raw'
import reviewSvg from 'heroicons/20/solid/queue-list.svg?raw'
import rulesSvg from 'heroicons/20/solid/bookmark.svg?raw'
import sparkSvg from 'heroicons/20/solid/sparkles.svg?raw'
import plugSvg from 'heroicons/20/solid/puzzle-piece.svg?raw'
import historySvg from 'heroicons/20/solid/clock.svg?raw'
import alertSvg from 'heroicons/20/solid/exclamation-triangle.svg?raw'
import xSvg from 'heroicons/20/solid/x-mark.svg?raw'
import playSvg from 'heroicons/20/solid/play.svg?raw'
import undoSvg from 'heroicons/20/solid/arrow-uturn-left.svg?raw'
import stopSvg from 'heroicons/20/solid/stop.svg?raw'
import refreshSvg from 'heroicons/20/solid/arrow-path.svg?raw'
import bellSvg from 'heroicons/20/solid/bell.svg?raw'
import adjustmentsSvg from 'heroicons/20/solid/adjustments-horizontal.svg?raw'
import keySvg from 'heroicons/20/solid/key.svg?raw'
import shieldCheckSvg from 'heroicons/20/solid/shield-check.svg?raw'
import boltSvg from 'heroicons/20/solid/bolt.svg?raw'
import pauseSvg from 'heroicons/20/solid/pause.svg?raw'
import pencilSvg from 'heroicons/20/solid/pencil.svg?raw'
import paintBrushSvg from 'heroicons/20/solid/paint-brush.svg?raw'
import swatchSvg from 'heroicons/20/solid/swatch.svg?raw'
import cloudSvg from 'heroicons/20/solid/cloud.svg?raw'
import cpuChipSvg from 'heroicons/20/solid/cpu-chip.svg?raw'
import userCircleSvg from 'heroicons/20/solid/user-circle.svg?raw'
import userSvg from 'heroicons/20/solid/user.svg?raw'
import checkBadgeSvg from 'heroicons/20/solid/check-badge.svg?raw'
import identificationSvg from 'heroicons/20/solid/identification.svg?raw'
import musicalNoteSvg from 'heroicons/20/solid/musical-note.svg?raw'

function icon(svg: string, size = 16) {
  return svg.replace(/<svg([^>]*)>/, (_, attrs: string) => {
    const cleaned = attrs
      .replace(/\s*(?:width|height|aria-hidden|data-slot)="[^"]*"/g, '')
    return `<svg${cleaned} width="${size}" height="${size}" aria-hidden="true">`
  })
}

export const icons = {
  plus: icon(plusSvg),
  search: icon(searchSvg),
  inbox: icon(inboxSvg),
  layout: icon(layoutSvg),
  filter: icon(filterSvg, 14),
  folderPlus: icon(folderPlusSvg, 14),
  folder: icon(folderSvg, 14),
  chevronDown: icon(chevronDownSvg, 14),
  chevronUp: icon(chevronUpSvg, 14),
  chevronUpDown: icon(chevronUpDownSvg, 14),
  chevronLeft: icon(chevronLeftSvg, 12),
  chevronRight: icon(chevronRightSvg, 12),
  branch: icon(branchSvg, 14),
  laptop: icon(laptopSvg, 14),
  mic: icon(micSvg),
  gift: icon(giftSvg, 14),
  gear: icon(gearSvg),
  more: icon(moreSvg),
  sidebar: icon(sidebarSvg),
  external: icon(externalSvg, 13),
  github: icon(githubSvg),
  back: icon(backSvg, 14),
  forward: icon(forwardSvg, 14),
  chat: icon(chatSvg, 14),
  sun: icon(sunSvg),
  moon: icon(moonSvg),
  check: icon(checkSvg),
  home: icon(homeSvg),
  review: icon(reviewSvg),
  rules: icon(rulesSvg),
  spark: icon(sparkSvg),
  plug: icon(plugSvg),
  history: icon(historySvg),
  alert: icon(alertSvg),
  x: icon(xSvg),
  play: icon(playSvg),
  undo: icon(undoSvg),
  stop: icon(stopSvg),
  refresh: icon(refreshSvg),
  bell: icon(bellSvg),
  adjustments: icon(adjustmentsSvg),
  key: icon(keySvg, 14),
  shield: icon(shieldCheckSvg, 14),
  bolt: icon(boltSvg, 14),
  pause: icon(pauseSvg),
  pencil: icon(pencilSvg, 14),
  paint: icon(paintBrushSvg, 14),
  swatch: icon(swatchSvg, 14),
  typography: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><text x="8" y="12" text-anchor="middle" font-size="11" font-weight="400" font-family="ui-sans-serif, system-ui, sans-serif" letter-spacing="-0.04em">Aa</text></svg>`,
  cloud: icon(cloudSvg, 14),
  cpu: icon(cpuChipSvg, 14),
  user: icon(userSvg, 14),
  userCircle: icon(userCircleSvg, 14),
  checkBadge: icon(checkBadgeSvg, 14),
  id: icon(identificationSvg, 14),
  music: icon(musicalNoteSvg, 14),
  apple: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.7 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.9-3.5 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7 1.1 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.1-.8-2.2-3.3zm-2-6.1c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.6 2.8-1.4z"/></svg>`,
}
