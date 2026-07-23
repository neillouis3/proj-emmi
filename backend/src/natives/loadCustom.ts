import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureEmmiDirs, nativesDir } from '../paths.js'
import type { Native, NativePermission } from './types.js'
import { runCustomNative } from './sandbox/runCustom.js'

function asPermission(value: unknown): NativePermission {
  if (
    value === 'read' ||
    value === 'write' ||
    value === 'execute' ||
    value === 'network'
  ) {
    return value
  }
  return 'read'
}

/** Load user-authored natives from ~/.emmi/natives/*.{js,mjs,cjs}. */
export async function loadCustomNatives(): Promise<Native[]> {
  ensureEmmiDirs()
  const dir = nativesDir()
  if (!fs.existsSync(dir)) return []

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(mjs|js|cjs)$/.test(f))
    .sort()

  const out: Native[] = []
  for (const file of files) {
    const source = path.join(dir, file)
    try {
      const mod = await import(`${pathToFileURL(source).href}?t=${Date.now()}`)
      const raw = mod.default ?? mod
      if (!raw || typeof raw.run !== 'function' || !raw.name) {
        console.warn(`[emmi] skip native ${file}: missing name/run`)
        continue
      }
      const name = String(raw.name)
      const permission = asPermission(raw.permission)
      const scopes = Array.isArray(raw.scopes)
        ? raw.scopes.map(String)
        : []
      const params =
        raw.params && typeof raw.params === 'object'
          ? (raw.params as Record<string, string>)
          : {}

      const native: Native = {
        name,
        description: raw.description ? String(raw.description) : undefined,
        params,
        returns: raw.returns ? String(raw.returns) : undefined,
        permission,
        scopes,
        trust: 'custom',
        source,
        async run(runParams, _ctx) {
          // Always execute via sandbox — never call user run() in-process.
          return runCustomNative(native, runParams, _ctx)
        },
      }
      out.push(native)
    } catch (err) {
      console.warn(
        `[emmi] failed to load native ${file}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return out
}
