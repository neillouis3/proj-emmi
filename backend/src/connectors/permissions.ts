import fs from 'node:fs'
import path from 'node:path'
import { emmiRoot, ensureEmmiDirs, expandPath, homeDir } from '../paths.js'

export type GrantStatus = 'ask' | 'granted' | 'denied'

export type ShellConnectorPermissions = {
  status: GrantStatus
  allowlist: string[]
  folderScopes: string[]
  network: boolean
  approvedCommands?: string[]
}

export type GitConnectorPermissions = {
  status: GrantStatus
  folderScopes: string[]
  /** Pull/push over the network; off by default (like Shell network). */
  remoteOps: boolean
}

/** Safari or Chrome connector permissions (no apps toggle — app is the connector). */
export type WebBrowserPermissions = {
  status: GrantStatus
  folderScopes: string[]
  /** Empty = any host allowed when granted */
  urlHostAllowlist: string[]
}

export type WebBrowserConnectorId = 'safari' | 'chrome'

export type ConnectorPermissionsFile = {
  fs?: { folderScopes: string[] }
  shell: ShellConnectorPermissions
  git: GitConnectorPermissions
  safari: WebBrowserPermissions
  chrome: WebBrowserPermissions
  /** Legacy — migrated away on load */
  browser?: WebBrowserPermissions & { apps?: string[] }
}

const DEFAULT_SCOPES = ['~/Desktop', '~/Downloads', '~/Documents']

function permissionsPath() {
  return path.join(emmiRoot(), 'connector-permissions.json')
}

export function defaultShellPermissions(): ShellConnectorPermissions {
  return {
    status: 'ask',
    allowlist: [],
    folderScopes: [...DEFAULT_SCOPES],
    network: false,
    approvedCommands: [],
  }
}

export function defaultGitPermissions(): GitConnectorPermissions {
  return {
    status: 'ask',
    folderScopes: [...DEFAULT_SCOPES],
    remoteOps: false,
  }
}

export function defaultWebBrowserPermissions(): WebBrowserPermissions {
  return {
    status: 'ask',
    folderScopes: [...DEFAULT_SCOPES],
    urlHostAllowlist: [],
  }
}

export function defaultConnectorPermissions(): ConnectorPermissionsFile {
  return {
    shell: defaultShellPermissions(),
    git: defaultGitPermissions(),
    safari: defaultWebBrowserPermissions(),
    chrome: defaultWebBrowserPermissions(),
  }
}

function normalizeWebBrowser(
  raw: Partial<WebBrowserPermissions> | undefined,
): WebBrowserPermissions {
  return {
    ...defaultWebBrowserPermissions(),
    ...(raw ?? {}),
    folderScopes: Array.isArray(raw?.folderScopes)
      ? raw!.folderScopes.map(String)
      : [...DEFAULT_SCOPES],
    urlHostAllowlist: Array.isArray(raw?.urlHostAllowlist)
      ? raw!.urlHostAllowlist.map(String)
      : [],
    status:
      raw?.status === 'granted' || raw?.status === 'denied' ? raw.status : 'ask',
  }
}

/** Migrate legacy `browser` block → safari + chrome. */
function migrateLegacyBrowser(
  raw: Partial<ConnectorPermissionsFile> & {
    browser?: WebBrowserPermissions & { apps?: string[] }
  },
): { safari: WebBrowserPermissions; chrome: WebBrowserPermissions } {
  const legacy = raw.browser
  const baseSafari = normalizeWebBrowser(raw.safari)
  const baseChrome = normalizeWebBrowser(raw.chrome)

  if (!legacy) {
    return { safari: baseSafari, chrome: baseChrome }
  }

  const apps = Array.isArray(legacy.apps)
    ? legacy.apps.map(String)
    : ['Safari', 'Google Chrome']
  const scopes = Array.isArray(legacy.folderScopes)
    ? legacy.folderScopes.map(String)
    : [...DEFAULT_SCOPES]
  const hosts = Array.isArray(legacy.urlHostAllowlist)
    ? legacy.urlHostAllowlist.map(String)
    : []
  const status =
    legacy.status === 'granted' || legacy.status === 'denied'
      ? legacy.status
      : 'ask'

  const hasSafari = apps.some((a) => /safari/i.test(a))
  const hasChrome = apps.some((a) => /chrome/i.test(a))

  return {
    safari: {
      status: hasSafari ? status : baseSafari.status,
      folderScopes: scopes.length ? scopes : baseSafari.folderScopes,
      urlHostAllowlist: hosts.length ? hosts : baseSafari.urlHostAllowlist,
    },
    chrome: {
      status: hasChrome ? status : baseChrome.status,
      folderScopes: scopes.length ? scopes : baseChrome.folderScopes,
      urlHostAllowlist: hosts.length ? hosts : baseChrome.urlHostAllowlist,
    },
  }
}

function loadRaw(): ConnectorPermissionsFile {
  ensureEmmiDirs()
  try {
    const raw = JSON.parse(
      fs.readFileSync(permissionsPath(), 'utf8'),
    ) as Partial<ConnectorPermissionsFile> & {
      browser?: WebBrowserPermissions & { apps?: string[] }
    }
    const migrated = migrateLegacyBrowser(raw)
    const next: ConnectorPermissionsFile = {
      fs: raw.fs,
      shell: {
        ...defaultShellPermissions(),
        ...(raw.shell ?? {}),
        allowlist: Array.isArray(raw.shell?.allowlist)
          ? raw.shell!.allowlist.map(String)
          : [],
        folderScopes: Array.isArray(raw.shell?.folderScopes)
          ? raw.shell!.folderScopes.map(String)
          : [...DEFAULT_SCOPES],
        network: Boolean(raw.shell?.network),
        status:
          raw.shell?.status === 'granted' || raw.shell?.status === 'denied'
            ? raw.shell.status
            : 'ask',
        approvedCommands: Array.isArray(raw.shell?.approvedCommands)
          ? raw.shell!.approvedCommands.map(String)
          : [],
      },
      git: {
        ...defaultGitPermissions(),
        ...(raw.git ?? {}),
        folderScopes: Array.isArray(raw.git?.folderScopes)
          ? raw.git!.folderScopes.map(String)
          : [...DEFAULT_SCOPES],
        remoteOps: Boolean(raw.git?.remoteOps),
        status:
          raw.git?.status === 'granted' || raw.git?.status === 'denied'
            ? raw.git.status
            : 'ask',
      },
      safari: migrated.safari,
      chrome: migrated.chrome,
    }
    // Persist migration (drop legacy browser key).
    if (raw.browser) {
      saveRaw(next)
    }
    return next
  } catch {
    return defaultConnectorPermissions()
  }
}

function saveRaw(data: ConnectorPermissionsFile) {
  ensureEmmiDirs()
  const { browser: _drop, ...rest } = data as ConnectorPermissionsFile & {
    browser?: unknown
  }
  void _drop
  const tmp = `${permissionsPath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(rest, null, 2))
  fs.renameSync(tmp, permissionsPath())
}

export function getConnectorPermissions() {
  return loadRaw()
}

export function getShellPermissions(): ShellConnectorPermissions {
  return loadRaw().shell
}

export function setShellPermissions(
  partial: Partial<ShellConnectorPermissions>,
): ShellConnectorPermissions {
  const current = loadRaw()
  const next: ShellConnectorPermissions = {
    ...current.shell,
    ...partial,
    allowlist:
      partial.allowlist !== undefined
        ? partial.allowlist.map(String)
        : current.shell.allowlist,
    folderScopes:
      partial.folderScopes !== undefined
        ? partial.folderScopes.map(String)
        : current.shell.folderScopes,
    approvedCommands:
      partial.approvedCommands !== undefined
        ? partial.approvedCommands.map(String)
        : current.shell.approvedCommands,
  }
  saveRaw({ ...current, shell: next })
  return next
}

export function grantShellPermissions(body: {
  status?: GrantStatus
  allowlist?: string[]
  folderScopes?: string[]
  network?: boolean
  approvedCommands?: string[]
}): ShellConnectorPermissions {
  return setShellPermissions({
    status: body.status ?? 'granted',
    ...(body.allowlist !== undefined ? { allowlist: body.allowlist } : {}),
    ...(body.folderScopes !== undefined
      ? { folderScopes: body.folderScopes }
      : {}),
    ...(body.network !== undefined ? { network: body.network } : {}),
    ...(body.approvedCommands !== undefined
      ? { approvedCommands: body.approvedCommands }
      : {}),
  })
}

export function getGitPermissions(): GitConnectorPermissions {
  return loadRaw().git
}

export function setGitPermissions(
  partial: Partial<GitConnectorPermissions>,
): GitConnectorPermissions {
  const current = loadRaw()
  const next: GitConnectorPermissions = {
    ...current.git,
    ...partial,
    folderScopes:
      partial.folderScopes !== undefined
        ? partial.folderScopes.map(String)
        : current.git.folderScopes,
    remoteOps:
      partial.remoteOps !== undefined
        ? Boolean(partial.remoteOps)
        : current.git.remoteOps,
  }
  saveRaw({ ...current, git: next })
  return next
}

export function grantGitPermissions(body: {
  status?: GrantStatus
  folderScopes?: string[]
  remoteOps?: boolean
}): GitConnectorPermissions {
  return setGitPermissions({
    status: body.status ?? 'granted',
    ...(body.folderScopes !== undefined
      ? { folderScopes: body.folderScopes }
      : {}),
    ...(body.remoteOps !== undefined ? { remoteOps: body.remoteOps } : {}),
  })
}

export function getWebBrowserPermissions(
  connectorId: WebBrowserConnectorId,
): WebBrowserPermissions {
  return loadRaw()[connectorId]
}

export function setWebBrowserPermissions(
  connectorId: WebBrowserConnectorId,
  partial: Partial<WebBrowserPermissions>,
): WebBrowserPermissions {
  const current = loadRaw()
  const prev = current[connectorId]
  const next: WebBrowserPermissions = {
    ...prev,
    ...partial,
    folderScopes:
      partial.folderScopes !== undefined
        ? partial.folderScopes.map(String)
        : prev.folderScopes,
    urlHostAllowlist:
      partial.urlHostAllowlist !== undefined
        ? partial.urlHostAllowlist.map(String)
        : prev.urlHostAllowlist,
  }
  saveRaw({ ...current, [connectorId]: next })
  return next
}

export function grantWebBrowserPermissions(
  connectorId: WebBrowserConnectorId,
  body: {
    status?: GrantStatus
    folderScopes?: string[]
    urlHostAllowlist?: string[]
  },
): WebBrowserPermissions {
  return setWebBrowserPermissions(connectorId, {
    status: body.status ?? 'granted',
    ...(body.folderScopes !== undefined
      ? { folderScopes: body.folderScopes }
      : {}),
    ...(body.urlHostAllowlist !== undefined
      ? { urlHostAllowlist: body.urlHostAllowlist }
      : {}),
  })
}

/** Expand folder scopes to absolute paths. */
export function expandedScopes(scopes: string[]): string[] {
  return scopes.map((s) => expandPath(s, {})).filter(Boolean)
}

export function expandedShellScopes(scopes?: string[]): string[] {
  return expandedScopes(scopes ?? getShellPermissions().folderScopes)
}

export function pathUnderScopes(absPath: string, scopes: string[]): boolean {
  const resolved = path.resolve(absPath)
  const home = homeDir()
  if (!resolved.startsWith(home + path.sep) && resolved !== home) return false
  for (const scope of scopes) {
    const root = path.resolve(scope)
    if (resolved === root || resolved.startsWith(root + path.sep)) return true
  }
  return false
}
