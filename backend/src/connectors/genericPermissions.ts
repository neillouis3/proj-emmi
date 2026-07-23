import fs from 'node:fs'
import path from 'node:path'
import { emmiRoot, ensureEmmiDirs, expandPath, homeDir } from '../paths.js'
import { loadConnectorManifest } from '../rules/catalog.js'
import type { GrantStatus } from './permissions.js'
import { expandedScopes, pathUnderScopes } from './permissions.js'

/**
 * Generic, manifest-driven permissions for connectors that are NOT one of the
 * built-in typed connectors (fs, shell, git, safari, chrome). New packs get a
 * working permission model without any core code changes.
 */
export type GenericConnectorPermissions = {
  status: GrantStatus
  folderScopes: string[]
  allowlist: string[]
  hostAllowlist: string[]
  flags: Record<string, boolean>
}

/** Connectors that own dedicated, typed permission handling — never generic. */
export const TYPED_CONNECTORS = new Set(['fs', 'shell', 'git', 'safari', 'chrome'])

const DEFAULT_SCOPES = ['~/Desktop', '~/Downloads', '~/Documents']

export function isGenericConnector(connectorId: string): boolean {
  return !TYPED_CONNECTORS.has(connectorId)
}

function storePath() {
  return path.join(emmiRoot(), 'connector-permissions-extra.json')
}

type Store = Record<string, GenericConnectorPermissions>

function loadStore(): Store {
  ensureEmmiDirs()
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8')) as Store
    if (raw && typeof raw === 'object') return raw
  } catch {
    /* missing or malformed — start empty */
  }
  return {}
}

function saveStore(store: Store) {
  ensureEmmiDirs()
  const tmp = `${storePath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2))
  fs.renameSync(tmp, storePath())
}

/** Defaults derived from the connector's declared permission needs. */
export function defaultGenericPermissions(
  connectorId: string,
): GenericConnectorPermissions {
  const manifest = loadConnectorManifest(connectorId)
  const decl = manifest?.permission
  const flags: Record<string, boolean> = {}
  for (const flag of decl?.flags ?? []) flags[flag.id] = false

  const hosts = new Set<string>()
  const auth = manifest?.auth
  if (auth?.type === 'oauth2') {
    for (const u of [auth.authorizationUrl, auth.tokenUrl]) {
      try {
        hosts.add(new URL(u).hostname)
      } catch {
        /* ignore */
      }
    }
    for (const h of auth.apiHosts ?? []) hosts.add(h)
  }

  return {
    status: decl?.grant ? 'ask' : 'granted',
    folderScopes: decl?.folderScopes ? [...DEFAULT_SCOPES] : [],
    allowlist: [],
    hostAllowlist: decl?.hostAllowlist ? [...hosts] : [],
    flags,
  }
}

function normalize(
  connectorId: string,
  raw: Partial<GenericConnectorPermissions> | undefined,
): GenericConnectorPermissions {
  const base = defaultGenericPermissions(connectorId)
  if (!raw) return base
  return {
    status:
      raw.status === 'granted' || raw.status === 'denied' || raw.status === 'ask'
        ? raw.status
        : base.status,
    folderScopes: Array.isArray(raw.folderScopes)
      ? raw.folderScopes.map(String)
      : base.folderScopes,
    allowlist: Array.isArray(raw.allowlist)
      ? raw.allowlist.map(String)
      : base.allowlist,
    hostAllowlist: Array.isArray(raw.hostAllowlist)
      ? raw.hostAllowlist.map(String)
      : base.hostAllowlist,
    flags:
      raw.flags && typeof raw.flags === 'object'
        ? { ...base.flags, ...raw.flags }
        : base.flags,
  }
}

export function getGenericPermissions(
  connectorId: string,
): GenericConnectorPermissions {
  return normalize(connectorId, loadStore()[connectorId])
}

export function setGenericPermissions(
  connectorId: string,
  partial: Partial<GenericConnectorPermissions>,
): GenericConnectorPermissions {
  const store = loadStore()
  const current = normalize(connectorId, store[connectorId])
  const next: GenericConnectorPermissions = {
    ...current,
    ...partial,
    folderScopes:
      partial.folderScopes !== undefined
        ? partial.folderScopes.map(String)
        : current.folderScopes,
    allowlist:
      partial.allowlist !== undefined
        ? partial.allowlist.map(String)
        : current.allowlist,
    hostAllowlist:
      partial.hostAllowlist !== undefined
        ? partial.hostAllowlist.map(String)
        : current.hostAllowlist,
    flags:
      partial.flags !== undefined
        ? { ...current.flags, ...partial.flags }
        : current.flags,
  }
  store[connectorId] = next
  saveStore(store)
  return next
}

export function grantGenericPermissions(
  connectorId: string,
  body: Partial<GenericConnectorPermissions>,
): GenericConnectorPermissions {
  return setGenericPermissions(connectorId, {
    ...body,
    status: body.status ?? 'granted',
  })
}

/** Seed defaults on install so a freshly installed pack has a working panel. */
export function ensureGenericPermissions(connectorId: string) {
  const store = loadStore()
  if (store[connectorId]) return
  store[connectorId] = defaultGenericPermissions(connectorId)
  saveStore(store)
}

export class GenericPermissionError extends Error {
  connectorId: string
  needsGrant: boolean
  constructor(
    message: string,
    opts: { connectorId: string; needsGrant?: boolean },
  ) {
    super(message)
    this.name = 'GenericPermissionError'
    this.connectorId = opts.connectorId
    this.needsGrant = Boolean(opts.needsGrant)
  }
}

/**
 * Gate helper new connector rules can call. Enforces grant status, folder
 * scopes, and exposes flags. Existing typed connectors do not use this.
 */
export function assertGenericConnector(
  connectorId: string,
  opts: { path?: string } = {},
): GenericConnectorPermissions {
  const perms = getGenericPermissions(connectorId)
  const decl = loadConnectorManifest(connectorId)?.permission
  if (decl?.grant) {
    if (perms.status === 'denied') {
      throw new GenericPermissionError(`${connectorId} connector is denied`, {
        connectorId,
        needsGrant: false,
      })
    }
    if (perms.status === 'ask') {
      throw new GenericPermissionError(
        `${connectorId} needs permission grant before running`,
        { connectorId, needsGrant: true },
      )
    }
  }
  if (decl?.folderScopes && opts.path) {
    const abs = expandPath(opts.path, {})
    if (!pathUnderScopes(abs, expandedScopes(perms.folderScopes))) {
      throw new GenericPermissionError(
        `Path outside allowed folders: ${opts.path}`,
        { connectorId, needsGrant: false },
      )
    }
  }
  return perms
}

export function connectorHomeDir() {
  return homeDir()
}
