import fs from 'node:fs'
import path from 'node:path'
import { connectorsDir, rulesDir } from '../paths.js'
import {
  loadAllRules,
  loadConnectorManifest,
  toolConnectorMap,
} from '../rules/catalog.js'
import { installBrowserHooks } from '../connectors/browserPolicy.js'
import { installGitHooks } from '../connectors/gitPolicy.js'
import { installShellHooks } from '../connectors/shellPolicy.js'
import {
  getGenericPermissions,
  isGenericConnector,
} from '../connectors/genericPermissions.js'
import { installRuleLogHook } from '../rules/context.js'
import type { NativeFn } from '../script/run.js'
import { runPlainInWorker } from './sandbox/runPlain.js'
import type { LoadedNative } from './loadPlain.js'

const fnRegistry = new Map<string, NativeFn>()
const meta = new Map<string, LoadedNative>()

export function getNativeFn(name: string) {
  return fnRegistry.get(name)
}

export function listNativeFns() {
  return [...meta.values()]
}

export function nativeFnRegistry() {
  return fnRegistry
}

function sandboxCommunity(loaded: LoadedNative): NativeFn {
  const connectorId = connectorIdOf(loaded.name)
  const sandboxed = async (...args: unknown[]) =>
    runPlainInWorker(loaded.source, args, {
      connectorId: connectorId || undefined,
    })
  Object.defineProperty(sandboxed, 'name', {
    value: loaded.name,
    configurable: true,
  })
  return sandboxed as NativeFn
}

function connectorIdOf(toolName: string): string {
  if (toolName.includes('.')) return toolName.split('.')[0] ?? ''
  return toolConnectorMap()[toolName] ?? ''
}

/**
 * Enforce the grant model for pack (generic) connectors at the host boundary,
 * since sandboxed rule workers can't read the permission store. Built-in and
 * typed connectors keep their own dedicated gates.
 */
function gatedCommunity(loaded: LoadedNative): NativeFn {
  const sandboxed = sandboxCommunity(loaded)
  const connectorId = connectorIdOf(loaded.name)
  if (!connectorId || !isGenericConnector(connectorId)) return sandboxed
  const decl = loadConnectorManifest(connectorId)?.permission
  if (!decl?.grant) return sandboxed
  const gated = async (...args: unknown[]) => {
    const perms = getGenericPermissions(connectorId)
    if (perms.status !== 'granted') {
      throw new Error(
        `${connectorId} connector is not connected. Enable it in Connectors.`,
      )
    }
    return sandboxed(...args)
  }
  Object.defineProperty(gated, 'name', {
    value: loaded.name,
    configurable: true,
  })
  return gated as NativeFn
}

/** Load built-in + user rules from connector catalogs. */
export async function initNativeFns() {
  installRuleLogHook()
  installShellHooks()
  installGitHooks()
  installBrowserHooks()
  fnRegistry.clear()
  meta.clear()

  const loaded = await loadAllRules()
  for (const n of loaded) {
    const fn =
      n.trust === 'builtin'
        ? n.fn
        : gatedCommunity(n)
    fnRegistry.set(n.name, fn)
    meta.set(n.name, n)
  }

  return listNativeFns()
}
