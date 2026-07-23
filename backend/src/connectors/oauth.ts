import crypto from 'node:crypto'
import { DAEMON_HOST, DAEMON_PORT } from '../paths.js'
import { loadConnectorManifest, type ConnectorOAuth2Auth } from '../rules/catalog.js'
import {
  clearCredentials,
  getCredentials,
  setCredentials,
  type ConnectorCredentials,
} from './credentials.js'
import {
  getGenericPermissions,
  grantGenericPermissions,
  isGenericConnector,
  setGenericPermissions,
} from './genericPermissions.js'
import { accountsCapabilityReady } from './accountsGate.js'

export type AuthStatusResult = {
  status: 'available' | 'connected' | 'expired' | 'error' | 'missing-client'
  accountLabel?: string
  expiresAt?: number
  error?: string
}

type PendingOAuth = {
  connectorId: string
  verifier: string
  state: string
  auth: ConnectorOAuth2Auth
  redirectUri: string
  createdAt: number
}

const pendingByState = new Map<string, PendingOAuth>()
const PENDING_TTL_MS = 10 * 60 * 1000

function prunePending() {
  const now = Date.now()
  for (const [state, p] of pendingByState) {
    if (now - p.createdAt > PENDING_TTL_MS) pendingByState.delete(state)
  }
}

export function defaultRedirectUri() {
  return `http://${DAEMON_HOST}:${DAEMON_PORT}/oauth/callback`
}

export function getOAuth2Auth(connectorId: string): ConnectorOAuth2Auth | null {
  const auth = loadConnectorManifest(connectorId)?.auth
  if (!auth || auth.type !== 'oauth2') return null
  return auth
}

function base64Url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function pkcePair() {
  const verifier = base64Url(crypto.randomBytes(32))
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function startOAuth(
  connectorId: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const gate = accountsCapabilityReady()
  if (!gate.ok) return gate

  const auth = getOAuth2Auth(connectorId)
  if (!auth) return { ok: false, error: 'Connector does not declare oauth2 auth' }
  if (!auth.clientId || auth.clientId.startsWith('<') || auth.clientId === 'YOUR_SPOTIFY_CLIENT_ID') {
    return {
      ok: false,
      error:
        'Set auth.clientId in the connector manifest (your app’s OAuth client id).',
    }
  }

  prunePending()
  const { verifier, challenge } = pkcePair()
  const state = base64Url(crypto.randomBytes(16))
  const redirectUri = auth.redirectUri?.trim() || defaultRedirectUri()

  pendingByState.set(state, {
    connectorId,
    verifier,
    state,
    auth,
    redirectUri,
    createdAt: Date.now(),
  })

  const url = new URL(auth.authorizationUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', auth.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  if (auth.scopes.length) url.searchParams.set('scope', auth.scopes.join(' '))

  return { ok: true, url: url.toString() }
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

async function exchangeToken(
  auth: ConnectorOAuth2Auth,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const res = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok) {
    throw new Error(
      json.error_description || json.error || `Token exchange failed (${res.status})`,
    )
  }
  return json
}

function storeTokenResponse(
  connectorId: string,
  auth: ConnectorOAuth2Auth,
  json: TokenResponse,
  prev?: ConnectorCredentials | null,
) {
  if (!json.access_token) throw new Error('Token response missing access_token')
  return setCredentials(connectorId, {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? prev?.refreshToken,
    expiresAt: json.expires_in
      ? Date.now() + Number(json.expires_in) * 1000
      : undefined,
    tokenType: json.token_type ?? 'Bearer',
    scope: json.scope ?? auth.scopes.join(' '),
    accountLabel: prev?.accountLabel,
  })
}

export async function completeOAuthCallback(query: {
  code?: string
  state?: string
  error?: string
  error_description?: string
}): Promise<{ ok: true; connectorId: string } | { ok: false; error: string }> {
  prunePending()
  if (query.error) {
    return {
      ok: false,
      error: query.error_description || query.error,
    }
  }
  const state = String(query.state ?? '')
  const code = String(query.code ?? '')
  const pending = pendingByState.get(state)
  if (!pending || !code) {
    return { ok: false, error: 'Invalid or expired OAuth state' }
  }
  pendingByState.delete(state)

  try {
    const json = await exchangeToken(pending.auth, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.auth.clientId,
      code_verifier: pending.verifier,
    })
    storeTokenResponse(pending.connectorId, pending.auth, json)

    if (isGenericConnector(pending.connectorId)) {
      grantGenericPermissions(pending.connectorId, { status: 'granted' })
    }

    // Best-effort account label fetch for known profile endpoints is pack-specific;
    // packs can set it later. Leave blank for now.
    return { ok: true, connectorId: pending.connectorId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function refreshCredentials(
  connectorId: string,
): Promise<ConnectorCredentials | null> {
  const auth = getOAuth2Auth(connectorId)
  const creds = getCredentials(connectorId)
  if (!auth || !creds?.refreshToken) return creds

  try {
    const json = await exchangeToken(auth, {
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: auth.clientId,
    })
    return storeTokenResponse(connectorId, auth, json, creds)
  } catch {
    return null
  }
}

/** Valid access token, refreshing if needed. */
export async function getAccessToken(
  connectorId: string,
): Promise<string | null> {
  let creds = getCredentials(connectorId)
  if (!creds) return null
  const skew = 60_000
  if (creds.expiresAt && creds.expiresAt < Date.now() + skew) {
    creds = (await refreshCredentials(connectorId)) ?? creds
    if (creds.expiresAt && creds.expiresAt < Date.now()) return null
  }
  return creds.accessToken
}

export function getAuthStatus(connectorId: string): AuthStatusResult {
  const auth = getOAuth2Auth(connectorId)
  if (!auth) {
    // Non-oauth connectors: fall back to generic grant
    if (isGenericConnector(connectorId)) {
      const perms = getGenericPermissions(connectorId)
      if (perms.status === 'granted') return { status: 'connected' }
      return { status: 'available' }
    }
    return { status: 'available' }
  }

  if (!auth.clientId || auth.clientId.startsWith('<') || auth.clientId === 'YOUR_SPOTIFY_CLIENT_ID') {
    return { status: 'missing-client', error: 'OAuth clientId not configured' }
  }

  const creds = getCredentials(connectorId)
  if (!creds) return { status: 'available' }
  if (creds.expiresAt && creds.expiresAt < Date.now() && !creds.refreshToken) {
    return { status: 'expired', accountLabel: creds.accountLabel, expiresAt: creds.expiresAt }
  }
  return {
    status: 'connected',
    accountLabel: creds.accountLabel,
    expiresAt: creds.expiresAt,
  }
}

export function disconnectAuth(connectorId: string) {
  clearCredentials(connectorId)
  if (isGenericConnector(connectorId)) {
    setGenericPermissions(connectorId, { status: 'ask' })
  }
}

export function setAccountLabel(connectorId: string, accountLabel: string) {
  const creds = getCredentials(connectorId)
  if (!creds) return
  setCredentials(connectorId, { ...creds, accountLabel })
}

export function oauthCallbackHtml(ok: boolean, message: string) {
  const title = ok ? 'Connected' : 'Connection failed'
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} — Emmi</title>
<style>
  body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{max-width:420px;padding:24px;border-radius:14px;background:#1c1c1c}
  h1{font-size:18px;font-weight:500;margin:0 0 8px}
  p{margin:0;color:#aaa;font-size:14px;line-height:1.45}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${message.replace(/</g, '&lt;')}</p>
<p style="margin-top:12px">You can close this window and return to Emmi.</p></div>
<script>setTimeout(()=>window.close(),1200)</script>
</body></html>`
}
