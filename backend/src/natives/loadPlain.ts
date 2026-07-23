import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { paramsOf, type NativeFn } from '../script/run.js'

export type LoadedNative = {
  name: string
  fn: NativeFn
  params: string[]
  source: string
  trust: 'builtin' | 'custom'
  permission: 'read' | 'write' | 'execute' | 'network'
  description?: string
}

function permissionFor(name: string): LoadedNative['permission'] {
  if (
    name === 'list' ||
    name === 'detect' ||
    name === 'extract' ||
    name === 'extension' ||
    name === 'lookup'
  ) {
    return 'read'
  }
  if (
    name === 'move' ||
    name === 'copy' ||
    name === 'delete' ||
    name === 'rename' ||
    name === 'route' ||
    name === 'mkdir'
  ) {
    return 'write'
  }
  if (name === 'log') return 'execute'
  return 'execute'
}

function asFn(mod: Record<string, unknown>, file: string): NativeFn | null {
  const base = path.basename(file, path.extname(file))
  const candidate = mod.default ?? mod[base]
  if (typeof candidate === 'function') return candidate as NativeFn
  // Legacy object export { name, run }
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as { name?: string; run?: NativeFn }
    if (typeof obj.run === 'function') {
      const name = obj.name || base
      const wrapped = async (...args: unknown[]) => {
        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          return obj.run!(args[0] as never)
        }
        return obj.run!({ args } as never)
      }
      Object.defineProperty(wrapped, 'name', {
        value: name,
        configurable: true,
      })
      return wrapped as NativeFn
    }
  }
  return null
}

type LoadOptions = {
  only?: string[]
  forceName?: string
}

/** Load plain function natives from a directory (one export per file). */
export async function loadNativesFromDir(
  dir: string,
  trust: 'builtin' | 'custom',
  opts: LoadOptions = {},
): Promise<LoadedNative[]> {
  if (!fs.existsSync(dir)) return []
  let files = fs
    .readdirSync(dir)
    .filter((f) => /\.(mjs|js|cjs)$/.test(f) && !f.startsWith('_'))
    .sort()
  if (opts.only?.length) {
    files = files.filter((f) => opts.only!.includes(f))
  }

  const out: LoadedNative[] = []
  for (const file of files) {
    const source = path.join(dir, file)
    try {
      const stat = fs.statSync(source)
      const mod = (await import(
        `${pathToFileURL(source).href}?v=${stat.mtimeMs}`
      )) as Record<string, unknown>
      const fn = asFn(mod, file)
      if (!fn) {
        console.warn(`[emmi] skip native ${file}: no function export`)
        continue
      }
      const name =
        opts.forceName ||
        fn.name ||
        path.basename(file, path.extname(file))
      if (!opts.forceName && (!name || name === 'default' || name === 'anonymous')) {
        console.warn(`[emmi] skip native ${file}: function needs a name`)
        continue
      }
      out.push({
        name,
        fn,
        params: paramsOf(fn),
        source,
        trust,
        permission: permissionFor(name),
      })
    } catch (err) {
      console.warn(
        `[emmi] failed to load native ${file}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return out
}

export function builtinNativesDir() {
  // backend/natives/builtin — sibling of src/ (and of dist/)
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../natives/builtin',
  )
}
