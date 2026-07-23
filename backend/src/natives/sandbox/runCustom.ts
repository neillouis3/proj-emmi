import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ToolContext } from '../../types.js'
import { createNativeCtx } from '../ctx.js'
import type { Native, NativeCtx, NativeResult } from '../types.js'
import { getNativeGrant } from '../permissions.js'

const workerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'worker.mjs',
)

function snapshotCtx(ctx: NativeCtx) {
  return {
    dryRun: ctx.dryRun,
    variables: ctx.variables,
    matchedFiles: ctx.matchedFiles,
    extracted: ctx.extracted,
    lastOutput: ctx.lastOutput,
    fileDestinations: ctx.fileDestinations,
    runId: ctx.runId,
    currentFile: ctx.currentFile,
  }
}

/** Run a custom native in a worker; ctx ops are mediated by the host. */
export async function runCustomNative(
  native: Native,
  params: Record<string, unknown>,
  base: ToolContext,
): Promise<NativeResult> {
  if (!native.source) {
    return { ok: false, summary: `Custom native ${native.name} has no source` }
  }

  const grant = getNativeGrant(native.name)
  const hostCtx = createNativeCtx(base, {
    trust: 'custom',
    permission: native.permission,
    grant,
    currentFile: base.matchedFiles[0],
  })

  return new Promise((resolve) => {
    const worker = new Worker(workerPath, {
      workerData: { entry: native.source },
      // No env inheritance of secrets beyond what's needed
      env: { ...process.env, EMMI_NATIVE_SANDBOX: '1' },
    })

    let settled = false
    const finish = (result: NativeResult) => {
      if (settled) return
      settled = true
      void worker.terminate()
      resolve(result)
    }

    worker.on('error', (err) => {
      finish({ ok: false, summary: err.message })
    })

    worker.on('message', async (msg: {
      type: string
      id?: string
      op?: string
      args?: unknown[]
      ok?: boolean
      result?: NativeResult
      error?: string
      ctxPatch?: Partial<ToolContext>
    }) => {
      if (msg.type === 'ready') {
        worker.postMessage({
          type: 'run',
          params,
          ctx: snapshotCtx(hostCtx),
        })
        return
      }

      if (msg.type === 'ctx:call' && msg.id && msg.op) {
        try {
          const fn = (hostCtx as unknown as Record<string, unknown>)[msg.op]
          if (typeof fn !== 'function') {
            throw new Error(`ctx.${msg.op} is not available`)
          }
          const value = await (fn as (...a: unknown[]) => unknown).apply(
            hostCtx,
            msg.args ?? [],
          )
          worker.postMessage({ type: 'ctx:result', id: msg.id, value })
        } catch (err) {
          worker.postMessage({
            type: 'ctx:result',
            id: msg.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        return
      }

      if (msg.type === 'run:result') {
        if (!msg.ok) {
          finish({ ok: false, summary: msg.error ?? 'Custom native failed' })
          return
        }
        if (msg.ctxPatch) {
          if (msg.ctxPatch.lastOutput !== undefined) {
            base.lastOutput = msg.ctxPatch.lastOutput
          }
          if (msg.ctxPatch.fileDestinations) {
            base.fileDestinations = msg.ctxPatch.fileDestinations
          }
          if (msg.ctxPatch.extracted) {
            base.extracted = msg.ctxPatch.extracted
          }
          if (msg.ctxPatch.matchedFiles) {
            base.matchedFiles = msg.ctxPatch.matchedFiles
          }
        }
        const result = msg.result ?? { ok: true, summary: 'ok' }
        if (result.output !== undefined) {
          base.lastOutput = result.output
        }
        finish(result)
      }
    })
  })
}
