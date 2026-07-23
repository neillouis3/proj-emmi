/**
 * Isolated runner for community natives.
 * Supports:
 *  - plain function default export: fn(...args)
 *  - legacy object export: { run(params, ctx) }
 */
import { parentPort, workerData } from 'node:worker_threads'
import { pathToFileURL } from 'node:url'

function proxyCtx(snapshot) {
  const call = (op, args) =>
    new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2)
      const onMessage = (msg) => {
        if (msg?.type !== 'ctx:result' || msg.id !== id) return
        parentPort.off('message', onMessage)
        if (msg.error) reject(new Error(msg.error))
        else resolve(msg.value)
      }
      parentPort.on('message', onMessage)
      parentPort.postMessage({ type: 'ctx:call', id, op, args })
    })

  return {
    dryRun: snapshot?.dryRun,
    variables: snapshot?.variables ?? {},
    matchedFiles: snapshot?.matchedFiles ?? [],
    extracted: snapshot?.extracted,
    lastOutput: snapshot?.lastOutput,
    fileDestinations: snapshot?.fileDestinations,
    runId: snapshot?.runId,
    currentFile: snapshot?.currentFile,
    readFile: (filePath) => call('readFile', [filePath]),
    writeFile: (filePath, data) => call('writeFile', [filePath, data]),
    listDir: (dirPath) => call('listDir', [dirPath]),
    log: (message) => call('log', [message]),
    http: (req) => call('http', [req]),
    auth: {
      status: () => call('auth.status', []),
      setAccountLabel: (label) => call('auth.setAccountLabel', [label]),
    },
  }
}

const entry = workerData.entry
const mode = workerData.mode ?? 'object'
const mod = await import(pathToFileURL(entry).href)
const exported = mod.default ?? mod

parentPort.on('message', async (msg) => {
  if (msg?.type !== 'run') return
  try {
    if (mode === 'fn' || typeof exported === 'function') {
      const fn = typeof exported === 'function' ? exported : exported.run
      if (typeof fn !== 'function') {
        throw new Error('Native export is not a function')
      }
      const args = [...(msg.args ?? [])]
      if (msg.withCtx) {
        args.push(proxyCtx(null))
      }
      const value = await fn(...args)
      parentPort.postMessage({ type: 'run:result', ok: true, value })
      return
    }

    const ctx = proxyCtx(msg.ctx)
    const result = await exported.run(msg.params ?? {}, ctx)
    parentPort.postMessage({
      type: 'run:result',
      ok: true,
      result: result ?? { ok: true, summary: 'ok' },
      value: result,
      ctxPatch: {
        lastOutput: ctx.lastOutput,
        fileDestinations: ctx.fileDestinations,
        extracted: ctx.extracted,
        matchedFiles: ctx.matchedFiles,
      },
    })
  } catch (err) {
    parentPort.postMessage({
      type: 'run:result',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

parentPort.postMessage({ type: 'ready' })
