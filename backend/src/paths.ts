import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DAEMON_PORT = Number(process.env.EMMI_PORT ?? 3921)
export const DAEMON_HOST = process.env.EMMI_HOST ?? '127.0.0.1'

export function homeDir() {
  return os.homedir()
}

/** Previous default — kept for one-time migration. */
export function legacyEmmiRoot() {
  return path.join(homeDir(), '.emmi')
}

/** Platform-default data root (matches Electron app.getPath('userData') on macOS). */
export function defaultEmmiRoot() {
  if (process.platform === 'darwin') {
    return path.join(homeDir(), 'Library', 'Application Support', 'Emmi')
  }
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ?? path.join(homeDir(), 'AppData', 'Roaming')
    return path.join(appData, 'Emmi')
  }
  const xdg = process.env.XDG_DATA_HOME ?? path.join(homeDir(), '.local', 'share')
  return path.join(xdg, 'emmi')
}

export function emmiRoot() {
  return process.env.EMMI_HOME ?? defaultEmmiRoot()
}

export function automationsDir() {
  return path.join(emmiRoot(), 'automations')
}

export function rulesDir() {
  return path.join(emmiRoot(), 'rules')
}

export function connectorRulesDir(connectorId: string) {
  return path.join(rulesDir(), connectorId)
}

export function connectorsDir() {
  return path.join(emmiRoot(), 'connectors')
}

export function nativesDir() {
  return path.join(emmiRoot(), 'natives')
}

export function builtinRulesDir() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../rules',
  )
}

/** Bundled pack manifests (ship with the app, read-only). Used to seed the library. */
export function packsDir() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../packs',
  )
}

/** Bundled seeds (connectors, recipes, natives) that ship with the app, read-only. */
export function bundledSeedsDir() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../seeds',
  )
}

/** Example packs shipped with the repo (seeded into the Documents library). */
export function examplePacksDir() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../examples/packs',
  )
}

/**
 * User-facing pack library — the source of truth for available packs.
 * Lives in Documents so packs are visible/editable; installing copies from here
 * into the app, and uninstalling never touches it. Override with EMMI_PACK_LIBRARY.
 */
export function packLibraryDir() {
  if (process.env.EMMI_PACK_LIBRARY) return process.env.EMMI_PACK_LIBRARY
  return path.join(homeDir(), 'Documents', 'Emmi Packs')
}

/** Registry of installed packs and their versions. */
export function packRegistryPath() {
  return path.join(emmiRoot(), 'packs.json')
}

export function statePath() {
  return path.join(emmiRoot(), 'state.json')
}

export function configPath() {
  return path.join(emmiRoot(), 'config.yaml')
}

/** Platform log directory — not inside Application Support. */
export function defaultLogsDir() {
  if (process.platform === 'darwin') {
    return path.join(homeDir(), 'Library', 'Logs', 'Emmi')
  }
  if (process.platform === 'win32') {
    const local =
      process.env.LOCALAPPDATA ?? path.join(homeDir(), 'AppData', 'Local')
    return path.join(local, 'Emmi', 'Logs')
  }
  const xdg = process.env.XDG_STATE_HOME ?? path.join(homeDir(), '.local', 'state')
  return path.join(xdg, 'emmi', 'log')
}

/** Platform cache directory — safe to delete; recreated on launch. */
export function defaultCacheDir() {
  if (process.platform === 'darwin') {
    return path.join(homeDir(), 'Library', 'Caches', 'Emmi')
  }
  if (process.platform === 'win32') {
    const local =
      process.env.LOCALAPPDATA ?? path.join(homeDir(), 'AppData', 'Local')
    return path.join(local, 'Emmi', 'Cache')
  }
  const xdg = process.env.XDG_CACHE_HOME ?? path.join(homeDir(), '.cache')
  return path.join(xdg, 'emmi')
}

export function logsDir() {
  return process.env.EMMI_LOGS ?? defaultLogsDir()
}

export function cacheDir() {
  return process.env.EMMI_CACHE ?? defaultCacheDir()
}

export function ensureEmmiDirs() {
  for (const dir of [
    emmiRoot(),
    automationsDir(),
    rulesDir(),
    connectorsDir(),
    connectorRulesDir('fs'),
    nativesDir(),
    path.join(emmiRoot(), 'history'),
    logsDir(),
    cacheDir(),
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyTree(src: string, dest: string) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    if (fs.statSync(from).isDirectory()) {
      copyTree(from, to)
      continue
    }
    if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to)
    }
  }
}

/** Move data from legacy ~/.emmi into Application Support (or platform equivalent). */
export function migrateLegacyEmmiHome() {
  const target = path.resolve(emmiRoot())
  const legacy = path.resolve(legacyEmmiRoot())
  if (target === legacy || !fs.existsSync(legacy)) return false

  const legacyAutomations = path.join(legacy, 'automations')
  const targetAutomations = path.join(target, 'automations')
  const legacyHasData =
    fs.existsSync(legacyAutomations) &&
    fs.readdirSync(legacyAutomations).some((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  const targetHasData =
    fs.existsSync(targetAutomations) &&
    fs.readdirSync(targetAutomations).some((f) => f.endsWith('.yaml') || f.endsWith('.yml'))

  if (!legacyHasData || targetHasData) return false

  copyTree(legacy, target)
  console.log(`[emmi] migrated data from ${legacy} to ${target}`)
  return true
}

/** Expand ~ and ${Var} / $Var using path variables. */
export function expandPath(input: string, variables: Record<string, string> = {}) {
  let value = input.trim()
  if (!value) return value

  value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => {
    return variables[key] ?? process.env[key] ?? ''
  })
  value = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key: string) => {
    return variables[key] ?? process.env[key] ?? `$${key}`
  })

  // Replace known variable names used as path segments (longest first)
  const sorted = Object.entries(variables).sort((a, b) => b[0].length - a[0].length)
  for (const [name, mapped] of sorted) {
    if (value === name) {
      value = mapped
      break
    }
  }

  if (value.startsWith('~/') || value === '~') {
    value = path.join(homeDir(), value.slice(2))
  }

  return path.resolve(value)
}

export function assertUnderHome(resolved: string) {
  const home = path.resolve(homeDir())
  const target = path.resolve(resolved)
  const rel = path.relative(home, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes home directory: ${resolved}`)
  }
  return target
}

/** Persist home paths as ~/… in history / logs. */
export function toTildePath(absolute: string) {
  const home = path.resolve(homeDir())
  const target = path.resolve(absolute)
  if (target === home) return '~'
  const prefix = home.endsWith(path.sep) ? home : home + path.sep
  if (!target.startsWith(prefix) && target !== home) return absolute
  const rel = path.relative(home, target)
  return `~/${rel.split(path.sep).join('/')}`
}
