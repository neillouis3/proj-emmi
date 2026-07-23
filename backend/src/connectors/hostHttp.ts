import { getGenericPermissions } from './genericPermissions.js'
import { getAccessToken, getAuthStatus, setAccountLabel } from './oauth.js'
import { getCredentials } from './credentials.js'
import { accountsCapabilityReady } from './accountsGate.js'

export type HostHttpRequest = {
  method?: string
  url: string
  headers?: Record<string, string>
  body?: string
  json?: unknown
  /** If true (default when connector has oauth tokens), attach Bearer token. */
  auth?: boolean
}

export type HostHttpResponse = {
  ok: boolean
  status: number
  headers: Record<string, string>
  json?: unknown
  text?: string
}

function hostAllowedForConnector(connectorId: string, url: string): boolean {
  const perms = getGenericPermissions(connectorId)
  const list = perms.hostAllowlist
  if (!list.length) return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    return list.some((entry) => {
      const e = entry.toLowerCase().replace(/^\*\./, '')
      return host === e || host.endsWith(`.${e}`)
    })
  } catch {
    return false
  }
}

/**
 * Mediated HTTP for pack rules. Tokens stay on the host; workers only see the response.
 */
export async function hostHttp(
  connectorId: string,
  req: HostHttpRequest,
): Promise<HostHttpResponse> {
  const gate = accountsCapabilityReady()
  if (!gate.ok) throw new Error(gate.error)

  const perms = getGenericPermissions(connectorId)
  if (perms.status !== 'granted') {
    throw new Error(
      `${connectorId} connector is not connected. Enable it in Connectors.`,
    )
  }

  const method = (req.method ?? 'GET').toUpperCase()
  const url = String(req.url ?? '')
  if (!url) throw new Error('ctx.http requires url')
  if (!hostAllowedForConnector(connectorId, url)) {
    throw new Error(`URL host not allowlisted for ${connectorId}: ${url}`)
  }

  const headers: Record<string, string> = { ...(req.headers ?? {}) }
  const useAuth = req.auth !== false
  if (useAuth) {
    const token = await getAccessToken(connectorId)
    if (!token) {
      const status = getAuthStatus(connectorId)
      if (status.status === 'expired') {
        throw new Error(`${connectorId} auth expired. Reconnect in Connectors.`)
      }
      throw new Error(
        `${connectorId} has no access token. Connect the account in Connectors.`,
      )
    }
    if (!headers.Authorization && !headers.authorization) {
      const type = getCredentials(connectorId)?.tokenType ?? 'Bearer'
      headers.Authorization = `${type} ${token}`
    }
  }

  let body: string | undefined
  if (req.json !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
    body = JSON.stringify(req.json)
  } else if (req.body !== undefined) {
    body = String(req.body)
  }

  const res = await fetch(url, { method, headers, body })
  const text = await res.text()
  const outHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    outHeaders[k] = v
  })

  let json: unknown
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json') && text) {
    try {
      json = JSON.parse(text)
    } catch {
      /* leave undefined */
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    headers: outHeaders,
    json,
    text,
  }
}

export function createPackRuleCtx(connectorId: string) {
  return {
    http: (req: HostHttpRequest) => hostHttp(connectorId, req),
    auth: {
      status: () => getAuthStatus(connectorId),
      setAccountLabel: (label: string) => setAccountLabel(connectorId, label),
    },
  }
}
