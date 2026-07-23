import fs from 'node:fs'
import { emmiRoot, packRegistryPath } from '../paths.js'

export type PackInstall = {
  version: string
  installedAt: number
}

export type PackRegistry = {
  packs: Record<string, PackInstall>
}

const DEFAULT_REGISTRY: PackRegistry = { packs: {} }

let registry: PackRegistry = { packs: {} }
let loaded = false

export function loadPackRegistry(): PackRegistry {
  try {
    const raw = JSON.parse(fs.readFileSync(packRegistryPath(), 'utf8')) as Partial<PackRegistry>
    registry = { packs: { ...(raw.packs ?? {}) } }
  } catch {
    registry = { packs: {} }
  }
  loaded = true
  return registry
}

export function getPackRegistry(): PackRegistry {
  if (!loaded) loadPackRegistry()
  return registry
}

function savePackRegistry() {
  try {
    fs.mkdirSync(emmiRoot(), { recursive: true })
    const tmp = `${packRegistryPath()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2))
    fs.renameSync(tmp, packRegistryPath())
  } catch {
    /* ignore */
  }
}

export function isPackInstalled(id: string): boolean {
  return !!getPackRegistry().packs[id]
}

export function getInstalledVersion(id: string): string | null {
  return getPackRegistry().packs[id]?.version ?? null
}

export function setPackInstalled(id: string, version: string) {
  getPackRegistry().packs[id] = { version, installedAt: Date.now() }
  savePackRegistry()
}

export function setPackVersion(id: string, version: string) {
  const existing = getPackRegistry().packs[id]
  getPackRegistry().packs[id] = {
    version,
    installedAt: existing?.installedAt ?? Date.now(),
  }
  savePackRegistry()
}

export function removePackEntry(id: string) {
  delete getPackRegistry().packs[id]
  savePackRegistry()
}

export function installedPackIds(): string[] {
  return Object.keys(getPackRegistry().packs)
}
