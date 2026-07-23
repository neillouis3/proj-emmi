import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  builtinRulesDir,
  connectorRulesDir,
  connectorsDir,
  ensureEmmiDirs,
} from '../paths.js'
import { loadNativesFromDir, type LoadedNative } from '../natives/loadPlain.js'
import { paramsOf } from '../script/run.js'

export type RuleCategory = 'core' | 'detection' | 'routing' | 'logging'

export type RuleManifestEntry = {
  id: string
  file: string
  category: RuleCategory
  params?: string[]
}

export type ConnectorPermissionFlag = {
  id: string
  label: string
  help?: string
}

/** Declarative permission capabilities a connector needs (drives generic UI + storage). */
export type ConnectorPermissionDecl = {
  grant?: boolean
  folderScopes?: boolean
  allowlist?: boolean
  hostAllowlist?: boolean
  flags?: ConnectorPermissionFlag[]
}

export type ConnectorNaming = 'bare' | 'dotted'

/** OAuth2 (PKCE public client) declaration — provider URLs live in the pack, not Emmi. */
export type ConnectorOAuth2Auth = {
  type: 'oauth2'
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  clientId: string
  /** Defaults to http://127.0.0.1:<port>/oauth/callback */
  redirectUri?: string
  /** Hosts allowed for ctx.http (seeded into hostAllowlist on first connect). */
  apiHosts?: string[]
}

export type ConnectorAuthDecl = ConnectorOAuth2Auth

export type ConnectorManifest = {
  id: string
  name: string
  description?: string
  kind?: 'Local' | 'Web'
  scope?: string
  popular?: boolean
  naming?: ConnectorNaming
  logo?: string
  permission?: ConnectorPermissionDecl
  auth?: ConnectorAuthDecl
  setup?: { kind: string }
  rules: RuleManifestEntry[]
}

/** Built-in connectors whose rules register under bare names (fs.move -> move). */
const KNOWN_BARE_CONNECTORS = new Set(['fs', 'shell', 'git'])

/** Resolve a connector's tool naming, defaulting new connectors to dotted. */
export function connectorNaming(
  connectorId: string,
  manifest?: ConnectorManifest | null,
): ConnectorNaming {
  if (manifest?.naming) return manifest.naming
  return KNOWN_BARE_CONNECTORS.has(connectorId) ? 'bare' : 'dotted'
}

export type RuleDef = {
  id: string
  connectorId: string
  category: RuleCategory
  params: string[]
  source: string
  origin: 'builtin' | 'user'
  code?: string
}

function resolveRuleFile(connectorId: string, file: string, origin: 'builtin' | 'user') {
  const base =
    origin === 'builtin'
      ? path.join(builtinRulesDir(), connectorId)
      : connectorRulesDir(connectorId)
  return path.join(base, file)
}

function parseAuthDecl(raw: unknown): ConnectorAuthDecl | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const a = raw as Record<string, unknown>
  if (a.type !== 'oauth2') return undefined
  const authorizationUrl = String(a.authorizationUrl ?? '').trim()
  const tokenUrl = String(a.tokenUrl ?? '').trim()
  const clientId = String(a.clientId ?? '').trim()
  if (!authorizationUrl || !tokenUrl || !clientId) return undefined
  return {
    type: 'oauth2',
    authorizationUrl,
    tokenUrl,
    clientId,
    scopes: Array.isArray(a.scopes) ? a.scopes.map(String) : [],
    redirectUri: a.redirectUri ? String(a.redirectUri) : undefined,
    apiHosts: Array.isArray(a.apiHosts) ? a.apiHosts.map(String) : undefined,
  }
}

export function loadConnectorManifest(connectorId: string): ConnectorManifest | null {
  ensureEmmiDirs()
  const file = path.join(connectorsDir(), `${connectorId}.yaml`)
  if (!fs.existsSync(file)) return null
  try {
    const raw = parseYaml(fs.readFileSync(file, 'utf8')) as ConnectorManifest
    if (!raw?.id || !Array.isArray(raw.rules)) return null
    const permission = raw.permission
      ? {
          grant: raw.permission.grant === true,
          folderScopes: raw.permission.folderScopes === true,
          allowlist: raw.permission.allowlist === true,
          hostAllowlist: raw.permission.hostAllowlist === true,
          flags: Array.isArray(raw.permission.flags)
            ? raw.permission.flags.map((f) => ({
                id: String(f.id),
                label: String(f.label ?? f.id),
                help: f.help ? String(f.help) : undefined,
              }))
            : undefined,
        }
      : undefined
    return {
      id: String(raw.id),
      name: String(raw.name ?? raw.id),
      description: raw.description ? String(raw.description) : undefined,
      kind: raw.kind === 'Web' ? 'Web' : raw.kind === 'Local' ? 'Local' : undefined,
      scope: raw.scope ? String(raw.scope) : undefined,
      popular: raw.popular === true ? true : undefined,
      naming: raw.naming === 'bare' || raw.naming === 'dotted' ? raw.naming : undefined,
      logo: raw.logo ? String(raw.logo) : undefined,
      permission,
      auth: parseAuthDecl(raw.auth),
      setup: raw.setup?.kind ? { kind: String(raw.setup.kind) } : undefined,
      rules: raw.rules.map((r) => ({
        id: String(r.id),
        file: String(r.file),
        category: (r.category as RuleCategory) ?? 'core',
        params: Array.isArray(r.params) ? r.params.map(String) : undefined,
      })),
    }
  } catch {
    return null
  }
}

export function listConnectorIds(): string[] {
  ensureEmmiDirs()
  if (!fs.existsSync(connectorsDir())) return []
  return fs
    .readdirSync(connectorsDir())
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => path.basename(f, path.extname(f)))
}

function scanUserRuleFiles(connectorId: string): string[] {
  const dir = connectorRulesDir(connectorId)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(mjs|js|cjs)$/.test(f) && !f.startsWith('_'))
    .sort()
}

export function listRulesForConnector(connectorId: string): RuleDef[] {
  const manifest = loadConnectorManifest(connectorId)
  const out: RuleDef[] = []
  const seen = new Set<string>()

  if (manifest) {
    for (const entry of manifest.rules) {
      // Built-in connectors ship rules in the app; installed packs put them in
      // the user rules dir (sandboxed). Prefer builtin, fall back to user.
      const builtinSource = resolveRuleFile(connectorId, entry.file, 'builtin')
      const userSource = resolveRuleFile(connectorId, entry.file, 'user')
      const origin: 'builtin' | 'user' = fs.existsSync(builtinSource)
        ? 'builtin'
        : 'user'
      const source = origin === 'builtin' ? builtinSource : userSource
      if (!fs.existsSync(source)) continue
      seen.add(entry.id)
      out.push({
        id: entry.id,
        connectorId,
        category: entry.category,
        params: entry.params ?? [],
        source,
        origin,
      })
    }
  }

  for (const file of scanUserRuleFiles(connectorId)) {
    const id = path.basename(file, path.extname(file))
    if (seen.has(id)) continue
    const source = path.join(connectorRulesDir(connectorId), file)
    out.push({
      id,
      connectorId,
      category: 'core',
      params: [],
      source,
      origin: 'user',
    })
  }

  return out
}

export function readRuleSource(connectorId: string, ruleId: string): string | null {
  const rule = listRulesForConnector(connectorId).find((r) => r.id === ruleId)
  if (!rule) return null
  try {
    return fs.readFileSync(rule.source, 'utf8')
  } catch {
    return null
  }
}

export function writeUserRule(
  connectorId: string,
  ruleId: string,
  code: string,
): RuleDef {
  ensureEmmiDirs()
  const dir = connectorRulesDir(connectorId)
  fs.mkdirSync(dir, { recursive: true })
  const safeId = ruleId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const source = path.join(dir, `${safeId}.js`)
  fs.writeFileSync(source, code)
  return {
    id: safeId,
    connectorId,
    category: 'core',
    params: [],
    source,
    origin: 'user',
    code,
  }
}

export function deleteUserRule(connectorId: string, ruleId: string) {
  const rule = listRulesForConnector(connectorId).find(
    (r) => r.id === ruleId && r.origin === 'user',
  )
  if (!rule) return false
  if (fs.existsSync(rule.source)) fs.unlinkSync(rule.source)
  return true
}

/** Load all rule functions for a connector into the registry. */
export async function loadConnectorRules(
  connectorId: string,
): Promise<LoadedNative[]> {
  const defs = listRulesForConnector(connectorId)
  const loaded: LoadedNative[] = []
  // Dotted connectors register as <id>.<rule> (safari.browse); bare as <rule>.
  const naming = connectorNaming(connectorId, loadConnectorManifest(connectorId))

  for (const def of defs) {
    const dir = path.dirname(def.source)
    const file = path.basename(def.source)
    const forceName = naming === 'dotted' ? `${connectorId}.${def.id}` : def.id
    const batch = await loadNativesFromDir(dir, def.origin === 'builtin' ? 'builtin' : 'custom', {
      only: [file],
      forceName,
    })
    loaded.push(...batch)
  }

  return loaded
}

/**
 * Map bare tool names to their connector id, derived from manifests.
 * Dotted tools (safari.browse) resolve by prefix and are not included here.
 * Used as an additive fallback so new bare-named connectors route without core edits.
 */
export function toolConnectorMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const id of listConnectorIds()) {
    const manifest = loadConnectorManifest(id)
    if (!manifest) continue
    if (connectorNaming(id, manifest) !== 'bare') continue
    for (const rule of manifest.rules) {
      if (!(rule.id in map)) map[rule.id] = id
    }
  }
  return map
}

/** Load all rules across connectors. */
export async function loadAllRules(): Promise<LoadedNative[]> {
  const ids = listConnectorIds()
  const all: LoadedNative[] = []
  for (const id of ids) {
    all.push(...(await loadConnectorRules(id)))
  }
  return all
}

/** Infer params from loaded fn when manifest params are empty. */
export function enrichRuleDef(def: RuleDef, fn?: { params: string[] }): RuleDef {
  if (def.params.length || !fn?.params.length) return def
  return { ...def, params: fn.params }
}
