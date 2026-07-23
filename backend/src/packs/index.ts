import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  automationsDir,
  builtinRulesDir,
  bundledSeedsDir,
  connectorRulesDir,
  connectorsDir,
  nativesDir,
  packLibraryDir,
  packsDir,
  examplePacksDir,
} from '../paths.js'
import {
  getInstalledVersion,
  installedPackIds,
  isPackInstalled,
  removePackEntry,
  setPackInstalled,
  setPackVersion,
} from './registry.js'
import {
  ensureGenericPermissions,
  isGenericConnector,
} from '../connectors/genericPermissions.js'
import {
  migrateMorningTabsAutomation,
  migrateRealLifeTriggers,
} from '../config/migrateAutomations.js'

export type BundledPack = {
  id: string
  name: string
  description: string
  version: string
  core: boolean
  logo?: string
  author?: string
  connectors: string[]
  recipes: string[]
  /** Other pack ids that must be installed first (e.g. auth for OAuth packs). */
  requires: string[]
}

export type PackSummary = {
  id: string
  name: string
  description: string
  version: string
  core: boolean
  logo?: string
  author?: string
  installed: boolean
  installedVersion: string | null
  updateAvailable: boolean
  connectors: string[]
  requires: string[]
  /** Installed packs that list this pack in requires. */
  requiredBy: { id: string; name: string }[]
  recipeCount: number
  /** Starter automations this pack ships (templates for the new-automation picker). */
  starters: { id: string; name: string; description: string }[]
}

function copyDir(src: string, dest: string, { onlyIfMissing = true } = {}) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    if (fs.statSync(from).isDirectory()) {
      copyDir(from, to, { onlyIfMissing })
      continue
    }
    if (onlyIfMissing && fs.existsSync(to)) continue
    fs.copyFileSync(from, to)
  }
}

function parsePackManifest(file: string): BundledPack | null {
  try {
    const raw = parseYaml(fs.readFileSync(file, 'utf8')) as Partial<BundledPack> & {
      requires?: unknown
    }
    if (!raw?.id) return null
    return {
      id: String(raw.id),
      name: String(raw.name ?? raw.id),
      description: raw.description ? String(raw.description) : '',
      version: String(raw.version ?? '0.0.0'),
      core: raw.core === true,
      logo: raw.logo ? String(raw.logo) : undefined,
      author: raw.author ? String(raw.author) : undefined,
      connectors: Array.isArray(raw.connectors) ? raw.connectors.map(String) : [],
      recipes: Array.isArray(raw.recipes) ? raw.recipes.map(String) : [],
      requires: Array.isArray(raw.requires) ? raw.requires.map(String) : [],
    }
  } catch {
    return null
  }
}

/** Factory pack manifests bundled with the app — used only to seed the library. */
function bundledPacks(): BundledPack[] {
  const dir = packsDir()
  if (!fs.existsSync(dir)) return []
  const out: BundledPack[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue
    const pack = parsePackManifest(path.join(dir, name))
    if (pack) out.push(pack)
  }
  return out
}

/**
 * Assemble a self-contained pack folder from the bundled sources:
 *   <dest>/pack.yaml, <logo>, connectors/<c>.yaml, rules/<c>/*, recipes/<r>.yaml
 */
function assemblePack(pack: BundledPack, dest: string) {
  const seeds = bundledSeedsDir()
  fs.mkdirSync(dest, { recursive: true })

  const manifestSrc = path.join(packsDir(), `${pack.id}.yaml`)
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(dest, 'pack.yaml'))
  }
  copyPackLogo(pack, dest)

  for (const connectorId of pack.connectors) {
    const connFrom = path.join(seeds, 'connectors', `${connectorId}.yaml`)
    if (fs.existsSync(connFrom)) {
      fs.mkdirSync(path.join(dest, 'connectors'), { recursive: true })
      fs.copyFileSync(connFrom, path.join(dest, 'connectors', `${connectorId}.yaml`))
    }
    const rulesFrom = path.join(builtinRulesDir(), connectorId)
    if (fs.existsSync(rulesFrom)) {
      copyDir(rulesFrom, path.join(dest, 'rules', connectorId), { onlyIfMissing: false })
    }
  }

  for (const recipeId of pack.recipes) {
    const recipeFrom = path.join(seeds, 'recipes', `${recipeId}.yaml`)
    if (fs.existsSync(recipeFrom)) {
      fs.mkdirSync(path.join(dest, 'recipes'), { recursive: true })
      fs.copyFileSync(recipeFrom, path.join(dest, 'recipes', `${recipeId}.yaml`))
    }
  }
}

/** Copy the pack's logo file into the pack folder (self-contained; UI loads it from here). */
function copyPackLogo(pack: BundledPack, dest: string) {
  if (!pack.logo) return
  const name = path.basename(pack.logo)
  if (!name || name !== pack.logo.replace(/^.*[/\\]/, '')) return
  const fromSeed = path.join(bundledSeedsDir(), 'brands', name)
  if (!fs.existsSync(fromSeed)) return
  fs.copyFileSync(fromSeed, path.join(dest, name))
}

/** Create the Documents pack library on first run; assemble any missing packs. */
export function ensurePackLibrary() {
  const library = packLibraryDir()
  fs.mkdirSync(library, { recursive: true })
  for (const pack of bundledPacks()) {
    const dest = path.join(library, pack.id)
    const manifestSrc = path.join(packsDir(), `${pack.id}.yaml`)
    if (!fs.existsSync(path.join(dest, 'pack.yaml'))) {
      assemblePack(pack, dest)
      continue
    }
    // Refresh factory metadata + logo without wiping rule edits.
    if (fs.existsSync(manifestSrc)) {
      fs.copyFileSync(manifestSrc, path.join(dest, 'pack.yaml'))
    }
    copyPackLogo(pack, dest)
  }
  seedExamplePacks(library)
}

/** Seed self-contained example packs (e.g. Spotify) into the Documents library. */
function seedExamplePacks(library: string) {
  const examples = examplePacksDir()
  if (!fs.existsSync(examples)) return
  for (const name of fs.readdirSync(examples)) {
    const src = path.join(examples, name)
    if (!fs.statSync(src).isDirectory()) continue
    if (!fs.existsSync(path.join(src, 'pack.yaml'))) continue
    const dest = path.join(library, name)
    if (!fs.existsSync(path.join(dest, 'pack.yaml'))) {
      copyDir(src, dest, { onlyIfMissing: false })
      continue
    }
    // Refresh pack.yaml + logo from the example without wiping local edits to rules.
    fs.copyFileSync(path.join(src, 'pack.yaml'), path.join(dest, 'pack.yaml'))
    const pack = parsePackManifest(path.join(src, 'pack.yaml'))
    if (pack?.logo) {
      const logoName = path.basename(pack.logo)
      const fromRoot = path.join(src, logoName)
      const fromBrands = path.join(src, 'brands', logoName)
      const logoSrc = fs.existsSync(fromRoot)
        ? fromRoot
        : fs.existsSync(fromBrands)
          ? fromBrands
          : null
      if (logoSrc) fs.copyFileSync(logoSrc, path.join(dest, logoName))
    }
    // Keep connectors + recipes in sync from the example pack.
    if (fs.existsSync(path.join(src, 'connectors'))) {
      copyDir(path.join(src, 'connectors'), path.join(dest, 'connectors'), {
        onlyIfMissing: false,
      })
    }
    if (fs.existsSync(path.join(src, 'recipes'))) {
      copyDir(path.join(src, 'recipes'), path.join(dest, 'recipes'), {
        onlyIfMissing: false,
      })
    }
    if (fs.existsSync(path.join(src, 'rules'))) {
      copyDir(path.join(src, 'rules'), path.join(dest, 'rules'), {
        onlyIfMissing: false,
      })
    }
  }
}

/** Absolute path to a pack's logo file in the Documents library, if present. */
export function resolvePackLogoPath(id: string): string | null {
  const pack = getBundledPack(id)
  if (!pack?.logo) return null
  const name = path.basename(pack.logo)
  if (!name || name.includes('..')) return null
  const file = path.join(libraryPackDir(id), name)
  return fs.existsSync(file) ? file : null
}

/** Available packs = folders in the Documents library with a pack.yaml. */
export function discoverBundledPacks(): BundledPack[] {
  const library = packLibraryDir()
  if (!fs.existsSync(library)) return []
  const out: BundledPack[] = []
  for (const name of fs.readdirSync(library)) {
    const dir = path.join(library, name)
    if (!fs.statSync(dir).isDirectory()) continue
    const pack = parsePackManifest(path.join(dir, 'pack.yaml'))
    if (pack) out.push(pack)
  }
  return out
}

export function getBundledPack(id: string): BundledPack | undefined {
  return discoverBundledPacks().find((p) => p.id === id)
}

function libraryPackDir(id: string) {
  return path.join(packLibraryDir(), id)
}

function seedNatives() {
  const customNatives = nativesDir()
  if (!fs.existsSync(customNatives) || fs.readdirSync(customNatives).length === 0) {
    copyDir(path.join(bundledSeedsDir(), 'natives'), customNatives, { onlyIfMissing: true })
  }
}

/** Gift Clean Desktop on core install so a fresh install isn't blank; user edits/deletes win. */
function seedCleanDesktopGift() {
  const seed = path.join(bundledSeedsDir(), 'automations', 'clean-desktop.yaml')
  const dest = path.join(automationsDir(), 'clean-desktop.yaml')
  if (!fs.existsSync(seed) || fs.existsSync(dest)) return
  fs.mkdirSync(automationsDir(), { recursive: true })
  fs.copyFileSync(seed, dest)
}

function runPackMigrations(pack: BundledPack) {
  const seeds = bundledSeedsDir()
  if (pack.id === 'core') migrateRealLifeTriggers(seeds)
  if (pack.id === 'chrome') migrateMorningTabsAutomation(seeds)
}

/** Seed default permissions for any non-built-in connectors a pack ships. */
function seedGenericPermissions(pack: BundledPack) {
  for (const connectorId of pack.connectors) {
    if (isGenericConnector(connectorId)) ensureGenericPermissions(connectorId)
  }
}

/**
 * Install pack contents only (no dependency resolution). Caller must resolve
 * requires first when installing from the library.
 */
function installPackContents(
  pack: BundledPack,
  dir: string,
): { ok: boolean; error?: string; pack?: BundledPack } {
  const connSrc = path.join(dir, 'connectors')
  fs.mkdirSync(connectorsDir(), { recursive: true })
  for (const connectorId of pack.connectors) {
    const from = path.join(connSrc, `${connectorId}.yaml`)
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(connectorsDir(), `${connectorId}.yaml`))
    }
    // Only pack-provided (non-built-in) connectors need their rules copied in.
    const hasBuiltinRules = fs.existsSync(path.join(builtinRulesDir(), connectorId))
    const rulesFrom = path.join(dir, 'rules', connectorId)
    if (!hasBuiltinRules && fs.existsSync(rulesFrom)) {
      copyDir(rulesFrom, connectorRulesDir(connectorId), { onlyIfMissing: false })
    }
  }

  // Recipes stay as templates surfaced in the recipe picker (gated by installed
  // packs) — install does not auto-create automations, except the core gift.
  if (pack.core) {
    seedNatives()
    seedCleanDesktopGift()
  }
  seedGenericPermissions(pack)
  runPackMigrations(pack)
  setPackInstalled(pack.id, pack.version)
  return { ok: true, pack }
}

/** Install missing required packs from the library (depth-first). */
function ensureRequiresInstalled(
  pack: BundledPack,
  chain: string[],
): { ok: boolean; error?: string } {
  for (const depId of pack.requires) {
    if (depId === pack.id || chain.includes(depId)) {
      return {
        ok: false,
        error: `Circular pack dependency: ${[...chain, pack.id, depId].join(' → ')}`,
      }
    }
    if (isPackInstalled(depId)) continue
    const depDir = libraryPackDir(depId)
    if (!fs.existsSync(path.join(depDir, 'pack.yaml'))) {
      return {
        ok: false,
        error: `Required pack "${depId}" is not in the library (needed by ${pack.id}).`,
      }
    }
    const dep = parsePackManifest(path.join(depDir, 'pack.yaml'))
    if (!dep) {
      return {
        ok: false,
        error: `Required pack "${depId}" has an invalid pack.yaml.`,
      }
    }
    const nested = ensureRequiresInstalled(dep, [...chain, pack.id])
    if (!nested.ok) return nested
    const installed = installPackContents(dep, depDir)
    if (!installed.ok) {
      return {
        ok: false,
        error: installed.error ?? `Failed to install required pack "${depId}".`,
      }
    }
  }
  return { ok: true }
}

/**
 * Install a pack from a self-contained folder (library or external) into the app.
 * Connector manifests + recipes are copied into the Emmi home. Rule files are
 * copied only for connectors without built-in rules; built-in connectors keep
 * their in-process rules (the loader prefers the built-in source).
 * Required packs listed in pack.yaml `requires` are installed first.
 */
function installFromPackDir(dir: string): { ok: boolean; error?: string; pack?: BundledPack } {
  const manifestPath = path.join(dir, 'pack.yaml')
  const pack = fs.existsSync(manifestPath) ? parsePackManifest(manifestPath) : null
  if (!pack) return { ok: false, error: `No valid pack.yaml in ${dir}` }

  const deps = ensureRequiresInstalled(pack, [])
  if (!deps.ok) return deps

  return installPackContents(pack, dir)
}

export function installPack(id: string): { ok: boolean; error?: string } {
  const dir = libraryPackDir(id)
  if (!fs.existsSync(path.join(dir, 'pack.yaml'))) {
    return { ok: false, error: 'Pack not found' }
  }
  const result = installFromPackDir(dir)
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Install failed' }
}

/**
 * Install a pack from an arbitrary external folder. The folder is first copied
 * into the Documents library (so it becomes an available pack that survives
 * uninstall), then installed from there.
 */
export function installPackFromDir(dir: string): { ok: boolean; error?: string } {
  const manifestPath = path.join(dir, 'pack.yaml')
  const pack = fs.existsSync(manifestPath) ? parsePackManifest(manifestPath) : null
  if (!pack) return { ok: false, error: `No valid pack.yaml in ${dir}` }
  const libDest = libraryPackDir(pack.id)
  const resolvedSrc = path.resolve(dir)
  if (path.resolve(libDest) !== resolvedSrc) {
    fs.rmSync(libDest, { recursive: true, force: true })
    copyDir(resolvedSrc, libDest, { onlyIfMissing: false })
  }
  return installFromPackDir(libDest)
}

export function updatePack(id: string): { ok: boolean; error?: string } {
  const dir = libraryPackDir(id)
  if (!isPackInstalled(id) || !fs.existsSync(path.join(dir, 'pack.yaml'))) {
    return { ok: false, error: 'Pack not found or not installed' }
  }
  const result = installFromPackDir(dir)
  if (result.ok && result.pack) setPackVersion(id, result.pack.version)
  return result.ok
    ? { ok: true }
    : { ok: false, error: result.error ?? 'Update failed' }
}

function installedDependents(id: string): { id: string; name: string }[] {
  return discoverBundledPacks()
    .filter((p) => p.id !== id && isPackInstalled(p.id) && p.requires.includes(id))
    .map((p) => ({ id: p.id, name: p.name }))
}

/** Uninstall a pack from the app. Never touches the Documents library copy. */
export function removePack(id: string): { ok: boolean; reason?: string; error?: string } {
  const pack = getBundledPack(id)
  if (!pack) return { ok: false, reason: 'not-found' }
  if (pack.core) return { ok: false, reason: 'core-locked' }
  if (!isPackInstalled(id)) return { ok: true }

  const dependents = installedDependents(id)
  if (dependents.length) {
    const names = dependents.map((d) => d.name).join(', ')
    return {
      ok: false,
      reason: 'required-by',
      error: `Cannot remove ${pack.name}: required by ${names}. Remove those packs first.`,
    }
  }

  for (const connectorId of pack.connectors) {
    for (const ext of ['yaml', 'yml']) {
      const file = path.join(connectorsDir(), `${connectorId}.${ext}`)
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
    // Remove only rules we copied in (pack-provided connectors, not built-ins).
    const hasBuiltinRules = fs.existsSync(path.join(builtinRulesDir(), connectorId))
    if (!hasBuiltinRules) {
      fs.rmSync(connectorRulesDir(connectorId), { recursive: true, force: true })
    }
  }
  removePackEntry(id)
  return { ok: true }
}

/**
 * Existing installs predate the registry: mark any non-core pack whose connector
 * manifests already live on disk as installed (at a stale version) so nothing is
 * lost, then let syncPacks() update it to the current version.
 */
function bootstrapRegistryFromDisk(available: BundledPack[]) {
  if (installedPackIds().length > 0) return
  for (const pack of available) {
    if (pack.core) continue
    const hasAll =
      pack.connectors.length > 0 &&
      pack.connectors.every((c) =>
        fs.existsSync(path.join(connectorsDir(), `${c}.yaml`)),
      )
    if (hasAll) setPackVersion(pack.id, '0.0.0')
  }
}

export function syncPacks() {
  ensurePackLibrary()
  const available = discoverBundledPacks()
  const byId = new Map(available.map((p) => [p.id, p]))

  bootstrapRegistryFromDisk(available)

  for (const pack of available) {
    if (pack.core && !isPackInstalled(pack.id)) installPack(pack.id)
  }

  for (const id of installedPackIds()) {
    const pack = byId.get(id)
    if (!pack) continue
    if (getInstalledVersion(id) !== pack.version) updatePack(id)
  }
}

export function listInstalledRecipeIds(): Set<string> {
  const ids = new Set<string>()
  for (const pack of discoverBundledPacks()) {
    if (!isPackInstalled(pack.id)) continue
    for (const recipeId of pack.recipes) ids.add(recipeId)
  }
  return ids
}

function packStarters(
  pack: BundledPack,
): { id: string; name: string; description: string }[] {
  const recipesDir = path.join(libraryPackDir(pack.id), 'recipes')
  return pack.recipes.map((id) => {
    let name = id
    let description = ''
    for (const ext of ['yaml', 'yml']) {
      const file = path.join(recipesDir, `${id}.${ext}`)
      if (!fs.existsSync(file)) continue
      try {
        const raw = parseYaml(fs.readFileSync(file, 'utf8')) as {
          name?: string
          description?: string
        }
        if (raw?.name) name = String(raw.name)
        if (raw?.description) description = String(raw.description)
      } catch {
        /* keep id */
      }
      break
    }
    return { id, name, description }
  })
}

export function listPacksForApi(): PackSummary[] {
  const available = discoverBundledPacks()
  return available.map((pack) => {
    const installed = isPackInstalled(pack.id)
    const installedVersion = getInstalledVersion(pack.id)
    const starters = packStarters(pack)
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      version: pack.version,
      core: pack.core,
      logo: pack.logo,
      author: pack.author,
      installed,
      installedVersion,
      updateAvailable: installed && installedVersion !== pack.version,
      connectors: pack.connectors,
      requires: pack.requires,
      requiredBy: installedDependents(pack.id),
      recipeCount: starters.length,
      starters,
    }
  })
}
