import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPackRuleCtx } from '../../connectors/hostHttp.js'

const workerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'worker.mjs',
)

/**
 * Run a community native (plain function file) inside a Worker.
 * Pack rules receive (...args, ctx) where ctx.http is mediated by the host.
 */
export function runPlainInWorker(
  entry: string,
  args: unknown[],
  opts?: { connectorId?: string },
): Promise<unknown> {
  const connectorId = opts?.connectorId
  const hostCtx = connectorId ? createPackRuleCtx(connectorId) : null

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { entry, mode: 'fn' },
      env: { ...process.env, EMMI_NATIVE_SANDBOX: '1' },
    })

    let settled = false
    const finish = (err: Error | null, value?: unknown) => {
      if (settled) return
      settled = true
      void worker.terminate()
      if (err) reject(err)
      else resolve(value)
    }

    worker.on('error', (err) => finish(err))
    worker.on('message', async (msg: {
      type: string
      id?: string
      op?: string
      args?: unknown[]
      ok?: boolean
      value?: unknown
      error?: string
    }) => {
      if (msg.type === 'ready') {
        worker.postMessage({
          type: 'run',
          args,
          withCtx: Boolean(hostCtx),
        })
        return
      }

      if (msg.type === 'ctx:call' && msg.id && msg.op && hostCtx) {
        try {
          if (msg.op === 'http') {
            const value = await hostCtx.http(
              (msg.args?.[0] ?? {}) as Parameters<typeof hostCtx.http>[0],
            )
            worker.postMessage({ type: 'ctx:result', id: msg.id, value })
            return
          }
          if (msg.op === 'auth.status') {
            const value = hostCtx.auth.status()
            worker.postMessage({ type: 'ctx:result', id: msg.id, value })
            return
          }
          if (msg.op === 'auth.setAccountLabel') {
            hostCtx.auth.setAccountLabel(String(msg.args?.[0] ?? ''))
            worker.postMessage({ type: 'ctx:result', id: msg.id, value: true })
            return
          }
          throw new Error(`ctx.${msg.op} is not available`)
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
          finish(new Error(msg.error ?? 'Community native failed'))
          return
        }
        finish(null, msg.value)
      }
    })
  })
}
