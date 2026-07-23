import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { automationsDir } from '../paths.js'
import type { AutomationConfig } from '../types.js'

export function isLegacyCleanDesktop(raw: Partial<AutomationConfig>): boolean {
  const desc = String(raw.description ?? '')
  if (/match\s*→\s*extract|all natives,\s*parameters only/i.test(desc)) return true

  const script = String(raw.script ?? '')
  if (/\$(file|files|dest|extracted)\b/.test(script)) return true
  if (/lookup\s*\(\s*["']extracted["']/i.test(script)) return true
  if (/extract\s*\(\s*["']extension["']\s*,\s*["']\$/i.test(script)) return true
  if (/move\s*\(\s*["']\$/.test(script)) return true

  const steps = raw.steps ?? []
  const tools = steps.map((s) => s.tool)
  if (
    tools.some((t) =>
      ['fs.match', 'core.extract', 'core.lookup', 'fs.move', 'fs.notify'].includes(
        String(t),
      ),
    )
  ) {
    return true
  }
  if (
    tools.includes('extract') &&
    tools.includes('lookup') &&
    tools.includes('move') &&
    !tools.includes('route')
  ) {
    return true
  }

  const blob = JSON.stringify({ steps, script: raw.script })
  if (
    blob.includes('~/Documents/Pictures') ||
    blob.includes('~/Documents/Documents') ||
    blob.includes('~/Documents/Videos') ||
    blob.includes('~/Desktop/Other')
  ) {
    return true
  }

  return false
}

/** Clean Desktop must use list → route → log — not core.extract / core.lookup. */
export function isBrokenCleanDesktop(raw: Partial<AutomationConfig>): boolean {
  if (raw.id && raw.id !== 'clean-desktop') return false
  if (isLegacyCleanDesktop(raw)) return true
  const tools = (raw.steps ?? []).map((s) => String(s.tool))
  return tools.includes('list') && !tools.includes('route')
}

export function cleanDesktopSeedPath(seedsRoot: string) {
  return path.join(seedsRoot, 'automations', 'clean-desktop.yaml')
}

/** Replace broken legacy Clean Desktop automation with the current seed. */
export function repairCleanDesktopFile(seedsRoot: string): boolean {
  const dest = path.join(automationsDir(), 'clean-desktop.yaml')
  const seed = cleanDesktopSeedPath(seedsRoot)
  if (!fs.existsSync(dest) || !fs.existsSync(seed)) return false
  try {
    const raw = parseYaml(fs.readFileSync(dest, 'utf8')) as Partial<AutomationConfig>
    raw.id = raw.id ?? 'clean-desktop'
    if (!isBrokenCleanDesktop(raw)) return false
    fs.copyFileSync(seed, dest)
    return true
  } catch {
    return false
  }
}

function rewriteFromSeed(
  dest: string,
  seed: string,
  opts: { active?: boolean },
) {
  if (!fs.existsSync(seed)) return
  let next = fs.readFileSync(seed, 'utf8')
  if (opts.active) next = next.replace(/^(active:\s*)false\s*$/m, '$1true')
  fs.writeFileSync(dest, next)
}

/** Refresh morning-tabs when outdated (bare browse, missing wait, or still manual). */
export function migrateMorningTabsAutomation(seedsRoot: string) {
  const file = path.join(automationsDir(), 'morning-tabs.yaml')
  if (!fs.existsSync(file)) return
  const raw = fs.readFileSync(file, 'utf8')
  const hasWait = /\bchrome\.wait\b/.test(raw)
  const hasBareBrowse =
    (/\bbrowse\s*\(/.test(raw) && !/\bsafari\.browse\b/.test(raw)) ||
    /tool:\s*browse\b/.test(raw)
  const hasSchedule =
    /trigger:\s*schedule\b/.test(raw) && /cron:\s*["']?0 9 \* \* 1-5/.test(raw)
  if (hasWait && !hasBareBrowse && hasSchedule) return
  const active = /^\s*active:\s*true\s*$/m.test(raw)
  rewriteFromSeed(file, path.join(seedsRoot, 'recipes', 'morning-tabs.yaml'), {
    active,
  })
}

/**
 * Arm real-life triggers on core starter autos that still look like the old manual demos.
 * Only rewrites when the install still matches the previous seed shape — user edits win.
 */
export function migrateRealLifeTriggers(seedsRoot: string) {
  const filePdfs = path.join(automationsDir(), 'file-pdfs.yaml')
  if (fs.existsSync(filePdfs)) {
    const raw = fs.readFileSync(filePdfs, 'utf8')
    const stillManualDemo =
      /trigger:\s*manual\b/.test(raw) &&
      /list\(["']~\/Desktop\/\*/.test(raw) &&
      !/trigger:\s*watch\b/.test(raw)
    if (stillManualDemo) {
      const active = /^\s*active:\s*true\s*$/m.test(raw)
      rewriteFromSeed(filePdfs, path.join(seedsRoot, 'recipes', 'file-pdfs.yaml'), {
        active,
      })
    }
  }

  const shot = path.join(automationsDir(), 'screenshot-desktop.yaml')
  if (fs.existsSync(shot)) {
    const raw = fs.readFileSync(shot, 'utf8')
    const needsKeybind =
      (/trigger:\s*manual\b/.test(raw) || /keybind:\s*null\b/.test(raw)) &&
      /screencapture/.test(raw) &&
      !/CommandOrControl\+Shift\+E/.test(raw)
    if (needsKeybind) {
      const active = /^\s*active:\s*true\s*$/m.test(raw)
      rewriteFromSeed(
        shot,
        path.join(seedsRoot, 'recipes', 'screenshot-desktop.yaml'),
        { active },
      )
    }
  }

  const clean = path.join(automationsDir(), 'clean-desktop.yaml')
  if (fs.existsSync(clean)) {
    const raw = fs.readFileSync(clean, 'utf8')
    if (/keybind:\s*null\b/.test(raw) && /routeDesktop\b/.test(raw)) {
      const next = raw.replace(/keybind:\s*null\b/, 'keybind: CommandOrControl+Shift+D')
      if (next !== raw) fs.writeFileSync(clean, next)
    }
  }
}
