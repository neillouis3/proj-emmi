/**
 * Minimal Chrome DevTools Protocol client.
 * Connects to Chrome remote debugging (default port 9222 / EMMI_CHROME_DEBUG_PORT).
 */
import http from 'node:http'
import WebSocket from 'ws'
import {
  BrowserPermissionError,
  formatBrowserErrorMessage,
} from './browserErrors.js'

export type CdpTarget = {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}

export type CdpStatus = {
  state: 'up' | 'no_pages' | 'down'
  port: number
}

export function debugPort() {
  const raw = process.env.EMMI_CHROME_DEBUG_PORT?.trim()
  if (raw && /^\d+$/.test(raw)) return Number(raw)
  return 9222
}

function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('CDP HTTP timeout'))
    })
  })
}

export async function listCdpTargets(): Promise<CdpTarget[]> {
  const port = debugPort()
  const data = await getJson(`http://127.0.0.1:${port}/json/list`)
  if (!Array.isArray(data)) return []
  return data as CdpTarget[]
}

export async function getCdpStatus(): Promise<CdpStatus> {
  const port = debugPort()
  try {
    const targets = await listCdpTargets()
    const pages = targets.filter(
      (t) => t.type === 'page' && t.webSocketDebuggerUrl,
    )
    return { state: pages.length ? 'up' : 'no_pages', port }
  } catch {
    return { state: 'down', port }
  }
}

export async function cdpAvailable(): Promise<boolean> {
  const status = await getCdpStatus()
  return status.state === 'up'
}

export function cdpUnavailableError(status?: CdpStatus) {
  const port = status?.port ?? debugPort()
  const state = status?.state ?? 'down'
  if (state === 'no_pages') {
    return new BrowserPermissionError(
      formatBrowserErrorMessage(
        'cdp_no_pages',
        `No Chrome pages on debugging port ${port}. Open a tab, then retry. Or use Connectors → Enable remote debugging.`,
      ),
      { needsGrant: false, connectorId: 'chrome', code: 'cdp_no_pages' },
    )
  }
  return new BrowserPermissionError(
    formatBrowserErrorMessage(
      'cdp_unavailable',
      `Chrome remote debugging is off (port ${port}). In Emmi → Connectors → Chrome, click Enable remote debugging.`,
    ),
    { needsGrant: false, connectorId: 'chrome', code: 'cdp_unavailable' },
  )
}

export async function assertCdpReady() {
  const status = await getCdpStatus()
  if (status.state === 'up') return status
  throw cdpUnavailableError(status)
}

export class CdpSession {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          id?: number
          result?: unknown
          error?: { message?: string }
        }
        if (msg.id == null) return
        const waiter = this.pending.get(msg.id)
        if (!waiter) return
        this.pending.delete(msg.id)
        if (msg.error) {
          waiter.reject(new Error(msg.error.message || 'CDP error'))
        } else {
          waiter.resolve(msg.result)
        }
      } catch {
        /* ignore */
      }
    })
  }

  static async connect(wsUrl: string): Promise<CdpSession> {
    const ws = new WebSocket(wsUrl)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', (err) => reject(err))
      setTimeout(() => reject(new Error('CDP WebSocket timeout')), 5000)
    })
    return new CdpSession(ws)
  }

  static async connectActivePage(matchUrl?: string): Promise<CdpSession> {
    await assertCdpReady()
    const targets = await listCdpTargets()
    const pages = targets.filter(
      (t) => t.type === 'page' && t.webSocketDebuggerUrl,
    )
    if (!pages.length) {
      throw cdpUnavailableError({ state: 'no_pages', port: debugPort() })
    }
    let pick = pages[0]
    if (matchUrl) {
      const needle = matchUrl.toLowerCase()
      pick =
        pages.find((p) => p.url.toLowerCase().includes(needle)) ??
        pages.find((p) => p.title.toLowerCase().includes(needle)) ??
        pick
    }
    return CdpSession.connect(pick.webSocketDebuggerUrl!)
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 30_000)
    })
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: unknown; description?: string; type?: string } }
    return result?.result?.value ?? result?.result?.description ?? null
  }

  async screenshotPng(): Promise<Buffer> {
    await this.send('Page.enable').catch(() => undefined)
    const result = (await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    })) as { data?: string }
    if (!result?.data) throw new Error('CDP screenshot returned no data')
    return Buffer.from(result.data, 'base64')
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}
