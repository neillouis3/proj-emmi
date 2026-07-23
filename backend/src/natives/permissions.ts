import fs from 'node:fs'
import path from 'node:path'
import { emmiRoot, ensureEmmiDirs } from '../paths.js'
import type { NativeGrant, NativePermission } from './types.js'

function permissionsPath() {
  return path.join(emmiRoot(), 'native-permissions.json')
}

type Store = { grants: Record<string, NativeGrant> }

function load(): Store {
  ensureEmmiDirs()
  try {
    const raw = JSON.parse(fs.readFileSync(permissionsPath(), 'utf8')) as Store
    return { grants: raw.grants ?? {} }
  } catch {
    return { grants: {} }
  }
}

function save(store: Store) {
  ensureEmmiDirs()
  fs.writeFileSync(permissionsPath(), JSON.stringify(store, null, 2))
}

export function getNativeGrant(name: string): NativeGrant | undefined {
  return load().grants[name]
}

export function listNativeGrants() {
  return load().grants
}

export function setNativeGrant(
  name: string,
  grant: {
    status: NativeGrant['status']
    permission: NativePermission
    scopes?: string[]
  },
) {
  const store = load()
  store.grants[name] = {
    status: grant.status,
    permission: grant.permission,
    scopes: grant.scopes ?? [],
    grantedAt:
      grant.status === 'granted' ? new Date().toISOString() : undefined,
  }
  save(store)
  return store.grants[name]
}

/** Built-ins are always allowed. Custom defaults to ask. */
export function isNativeAllowed(
  name: string,
  trust: 'builtin' | 'custom',
  permission: NativePermission,
): { ok: boolean; reason?: string; grant?: NativeGrant } {
  if (trust === 'builtin') return { ok: true }
  const grant = getNativeGrant(name)
  if (!grant || grant.status === 'ask') {
    return {
      ok: false,
      reason: `Custom native “${name}” needs permission grant (${permission})`,
      grant: grant ?? {
        status: 'ask',
        permission,
        scopes: [],
      },
    }
  }
  if (grant.status === 'denied') {
    return { ok: false, reason: `Native “${name}” was denied`, grant }
  }
  return { ok: true, grant }
}
