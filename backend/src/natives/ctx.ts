import fs from 'node:fs/promises'
import path from 'node:path'
import { assertUnderHome, expandPath } from '../paths.js'
import type { ToolContext } from '../types.js'
import type { NativeCtx, NativeGrant, NativePermission } from './types.js'

function pathAllowed(
  abs: string,
  permission: NativePermission,
  grant?: NativeGrant,
) {
  // Always keep under home for custom natives
  assertUnderHome(abs)
  if (grant?.scopes?.length) {
    const allowed = grant.scopes.some((scope) => {
      const root = assertUnderHome(expandPath(scope, {}))
      return abs === root || abs.startsWith(root + path.sep)
    })
    if (!allowed) {
      throw new Error(`Path not in granted scopes: ${abs}`)
    }
  }
  const granted = grant?.permission
  if (!granted) {
    throw new Error('Native has no permission grant')
  }
  if (permission === 'read') {
    // write/execute/network grants imply read for scoped file ops
    return
  }
  if (
    (permission === 'write' || permission === 'execute') &&
    (granted === 'write' || granted === 'execute')
  ) {
    return
  }
  if (permission === granted) return
  throw new Error(`Operation requires ${permission}; grant is ${granted}`)
}

/** Build a capability ctx. For custom natives, file ops are scope-checked. */
export function createNativeCtx(
  base: ToolContext,
  opts: {
    trust: 'builtin' | 'custom'
    permission: NativePermission
    grant?: NativeGrant
    currentFile?: string
  },
): NativeCtx {
  const scoped = opts.trust === 'custom'

  const resolve = (input: string) =>
    assertUnderHome(expandPath(input, base.variables))

  return {
    ...base,
    currentFile: opts.currentFile,
    async readFile(filePath: string) {
      const abs = resolve(filePath)
      if (scoped) pathAllowed(abs, 'read', opts.grant)
      return fs.readFile(abs, 'utf8')
    },
    async writeFile(filePath: string, data: string) {
      const abs = resolve(filePath)
      if (scoped) pathAllowed(abs, 'write', opts.grant)
      if (base.dryRun) return abs
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, data, 'utf8')
      return abs
    },
    async listDir(dirPath: string) {
      const abs = resolve(dirPath)
      if (scoped) pathAllowed(abs, 'read', opts.grant)
      return fs.readdir(abs)
    },
    log(message: string) {
      console.log(`[native] ${message}`)
    },
  }
}
