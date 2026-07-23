import type { ToolContext, ToolDef, ToolResult } from '../types.js'
import {
  initTools as initLegacyTools,
  getTool,
  listTools,
  registerTool,
} from '../tools/registry.js'
import { createNativeCtx } from './ctx.js'
import { loadCustomNatives } from './loadCustom.js'
import { getNativeFn } from './fnRegistry.js'
import { paramsOf } from '../script/run.js'
import {
  getNativeGrant,
  isNativeAllowed,
  listNativeGrants,
} from './permissions.js'
import type { Native, NativeListItem, NativeResult } from './types.js'

const natives = new Map<string, Native>()

const BUILTIN_META: Record<
  string,
  { permission: Native['permission']; returns?: string }
> = {
  'fs.match': { permission: 'read', returns: 'files' },
  'fs.move': { permission: 'write', returns: 'moved' },
  'fs.mkdir': { permission: 'write', returns: 'dirs' },
  'fs.notify': { permission: 'read', returns: 'summary' },
  'fs.open': { permission: 'execute' },
  'fs.sort': { permission: 'write' },
  'core.extract': { permission: 'read', returns: 'values' },
  'core.lookup': { permission: 'read', returns: 'values' },
}

function toolToNative(tool: ToolDef): Native {
  const meta = BUILTIN_META[tool.id] ?? {
    permission: 'execute' as const,
  }
  return {
    name: tool.id,
    description: tool.description,
    params: tool.params,
    returns: meta.returns,
    permission: meta.permission,
    scopes: [],
    trust: 'builtin',
    async run(params, ctx): Promise<NativeResult> {
      const result = await tool.run(params, ctx)
      return result
    },
  }
}

export function registerNative(native: Native) {
  natives.set(native.name, native)
}

export function getNative(name: string) {
  return natives.get(name)
}

export function listNatives(): NativeListItem[] {
  const grants = listNativeGrants()
  return [...natives.values()].map((n) => ({
    name: n.name,
    description: n.description,
    params: n.params,
    returns: n.returns,
    permission: n.permission,
    scopes: n.scopes,
    trust: n.trust,
    source: n.source,
    grant:
      n.trust === 'custom'
        ? grants[n.name] ?? {
            status: 'ask' as const,
            permission: n.permission,
            scopes: n.scopes ?? [],
          }
        : undefined,
  }))
}

export async function runNative(
  name: string,
  params: Record<string, unknown>,
  base: ToolContext,
): Promise<NativeResult> {
  const native = natives.get(name)
  if (!native) {
    return { ok: false, summary: `Unknown native: ${name}` }
  }

  const allowed = isNativeAllowed(native.name, native.trust, native.permission)
  if (!allowed.ok) {
    return {
      ok: false,
      summary: allowed.reason ?? 'Native not permitted',
    }
  }

  const ctx = createNativeCtx(base, {
    trust: native.trust,
    permission: native.permission,
    grant: allowed.grant ?? getNativeGrant(native.name),
    currentFile: base.matchedFiles[0],
  })

  const result = await native.run(params, ctx)
  // Propagate ctx mutations for builtins that mutate ToolContext in place
  base.matchedFiles = ctx.matchedFiles
  base.extracted = ctx.extracted
  base.lastOutput = ctx.lastOutput
  base.fileDestinations = ctx.fileDestinations
  return result
}

/** Bridge: existing ToolDef registry → natives, then load custom plugins. */
export async function initNatives() {
  natives.clear()
  initLegacyTools()
  for (const tool of listTools()) {
    const def = getTool(tool.id)
    if (def) registerNative(toolToNative(def))
  }
  // Also keep registerTool available for any late builtins
  const customs = await loadCustomNatives()
  for (const native of customs) registerNative(native)
}

/** Sync wrapper used when async init already completed. */
export function ensureBuiltinNativesFromTools() {
  for (const tool of listTools()) {
    if (!natives.has(tool.id)) {
      const def = getTool(tool.id)
      if (def) registerNative(toolToNative(def))
    }
  }
}

export { registerTool }

/** Adapt getTool for runner: prefer native execution path. */
export function getToolAsNativeRunner(id: string): ToolDef | undefined {
  const native = natives.get(id)
  if (native) {
    return {
      id: native.name,
      description: native.description ?? native.name,
      params: native.params,
      async run(params, ctx): Promise<ToolResult> {
        return runNative(native.name, params, ctx)
      },
    }
  }
  const legacy = getTool(id)
  if (legacy) return legacy

  // Rule fns (e.g. safari.browse) live in the script registry.
  const fn = getNativeFn(id)
  if (!fn) return undefined
  const paramNames = paramsOf(fn)
  const paramsMeta: Record<string, string> = {}
  for (const name of paramNames) paramsMeta[name] = 'any'
  return {
    id,
    description: id,
    params: paramsMeta,
    async run(params, ctx): Promise<ToolResult> {
      void ctx
      try {
        const args = paramNames.map((name) => params[name])
        const result = await fn(...args)
        return {
          ok: true,
          summary:
            result && typeof result === 'object' && 'stdout' in (result as object)
              ? String((result as { stdout?: string }).stdout ?? id)
              : `${id} ok`,
        }
      } catch (err) {
        return {
          ok: false,
          summary: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}
