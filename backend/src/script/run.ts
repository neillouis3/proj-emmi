import type { Arg, Statement } from './ast.js'

export type NativeFn = (...args: unknown[]) => unknown | Promise<unknown>

/** Infer parameter names from a function's source (no hand-kept schema). */
export function paramsOf(fn: NativeFn): string[] {
  const src = Function.prototype.toString.call(fn)
  const match = src.match(/^[^(]*\(([^)]*)\)/)
  if (!match) return []
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/=.*$/, '').trim())
    .filter((s) => s && s !== '...')
}

function resolveArg(arg: Arg, scope: Record<string, unknown>): unknown {
  if (arg.type === 'literal') return arg.value
  if (!(arg.name in scope)) {
    throw new Error(`Unknown variable: ${arg.name}`)
  }
  return scope[arg.name]
}

function isTruthy(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value)
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return Boolean(value)
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value == null) return []
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [value]
}

async function runCall(
  fnName: string,
  args: Arg[],
  registry: Map<string, NativeFn>,
  scope: Record<string, unknown>,
): Promise<unknown> {
  const fn = registry.get(fnName)
  if (!fn) throw new Error(`Unknown native: ${fnName}`)
  const resolved = args.map((a) => resolveArg(a, scope))
  return fn(...resolved)
}

/**
 * Walk statements: resolve args from scope, call registry natives, assign outputs.
 * Supports if / for / try control flow.
 */
export async function runScript(
  statements: Statement[],
  registry: Map<string, NativeFn>,
  scope: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  for (const stmt of statements) {
    if (stmt.type === 'if') {
      const cond = resolveArg(stmt.condition, scope)
      const branch = isTruthy(cond) ? stmt.body : (stmt.elseBody ?? [])
      await runScript(branch, registry, scope)
      continue
    }
    if (stmt.type === 'for') {
      const list = asList(resolveArg(stmt.list, scope))
      for (const item of list) {
        scope[stmt.item] = item
        await runScript(stmt.body, registry, scope)
      }
      continue
    }
    if (stmt.type === 'try') {
      try {
        await runScript(stmt.body, registry, scope)
      } catch (err) {
        scope.__error = err instanceof Error ? err.message : String(err)
        await runScript(stmt.catchBody, registry, scope)
      }
      continue
    }
    if (stmt.type === 'retry') {
      let lastErr: unknown
      for (let attempt = 1; attempt <= stmt.times; attempt++) {
        scope.__attempt = attempt
        try {
          await runScript(stmt.body, registry, scope)
          lastErr = undefined
          break
        } catch (err) {
          lastErr = err
          scope.__error = err instanceof Error ? err.message : String(err)
          if (attempt < stmt.times && stmt.delayMs > 0) {
            await new Promise((r) => setTimeout(r, stmt.delayMs))
          }
        }
      }
      if (lastErr != null) {
        const msg =
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        throw new Error(
          `retry failed after ${stmt.times} attempt(s): ${msg}`,
        )
      }
      continue
    }
    const result = await runCall(stmt.fn, stmt.args, registry, scope)
    if (stmt.type === 'assign' && stmt.output) {
      scope[stmt.output] = result
    }
  }
  return scope
}

/** Flatten statements to one-line summaries for review UI. */
export function summarizeStatements(statements: Statement[], prefix = ''): string[] {
  const out: string[] = []
  for (const s of statements) {
    if (s.type === 'assign') {
      out.push(`${prefix}${s.output} = ${s.fn}(...)`)
    } else if (s.type === 'call') {
      out.push(`${prefix}${s.fn}(...)`)
    } else if (s.type === 'if') {
      out.push(`${prefix}if (...)`)
      out.push(...summarizeStatements(s.body, `${prefix}  `))
      if (s.elseBody?.length) {
        out.push(`${prefix}else`)
        out.push(...summarizeStatements(s.elseBody, `${prefix}  `))
      }
    } else if (s.type === 'for') {
      out.push(`${prefix}for ${s.item} in ...`)
      out.push(...summarizeStatements(s.body, `${prefix}  `))
    } else if (s.type === 'try') {
      out.push(`${prefix}try`)
      out.push(...summarizeStatements(s.body, `${prefix}  `))
      out.push(`${prefix}catch`)
      out.push(...summarizeStatements(s.catchBody, `${prefix}  `))
    } else if (s.type === 'retry') {
      out.push(
        `${prefix}retry ${s.times}${s.delayMs ? `, ${s.delayMs}ms` : ''}`,
      )
      out.push(...summarizeStatements(s.body, `${prefix}  `))
    }
  }
  return out
}

/** True if the plan includes side-effecting ops (browser/shell/fs writes). */
export function scriptHasSideEffects(summaries: string[]): boolean {
  const SIDE =
    /\b(?:move|copy|delete|rename|mkdir|write|route|exec|script|browse|navigate|click|type|fill|eval|pageShot|tab|wait|fail)\b|\.(?:browse|navigate|click|type|fill|eval|pageShot|tab|wait)\(/
  return summaries.some((line) => SIDE.test(line))
}
