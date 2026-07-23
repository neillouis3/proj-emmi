import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { emmiRoot, ensureEmmiDirs } from '../paths.js'

export type ConnectorCredentials = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  tokenType?: string
  scope?: string
  accountLabel?: string
  updatedAt: number
}

function credentialsDir() {
  return path.join(emmiRoot(), 'credentials')
}

function keyPath() {
  return path.join(credentialsDir(), 'master.key')
}

function filePath(connectorId: string) {
  const safe = connectorId.replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(credentialsDir(), `${safe}.json.enc`)
}

function ensureKey(): Buffer {
  ensureEmmiDirs()
  fs.mkdirSync(credentialsDir(), { recursive: true, mode: 0o700 })
  if (fs.existsSync(keyPath())) {
    return fs.readFileSync(keyPath())
  }
  const key = crypto.randomBytes(32)
  fs.writeFileSync(keyPath(), key, { mode: 0o600 })
  return key
}

function aesEncrypt(plain: string): string {
  const key = ensureKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function aesDecrypt(payload: string): string {
  const key = ensureKey()
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/**
 * When the daemon is spawned by Electron, EMMI_CREDENTIALS_BRIDGE points at a
 * loopback helper that wraps safeStorage.encryptString / decryptString.
 * Falls back to local AES-GCM under emmiRoot()/credentials/.
 */
function bridgeCall(
  op: 'encrypt' | 'decrypt',
  payload: string,
): string | null {
  const base = process.env.EMMI_CREDENTIALS_BRIDGE?.trim()
  if (!base) return null
  try {
    const url = new URL(op, base.endsWith('/') ? base : `${base}/`)
    const body = JSON.stringify({ payload })
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `fetch(process.argv[1],{method:'POST',headers:{'content-type':'application/json'},body:process.argv[2]}).then(async r=>{if(!r.ok)process.exit(2);process.stdout.write(await r.text())}).catch(()=>process.exit(1))`,
        url.toString(),
        body,
      ],
      {
        encoding: 'utf8',
        timeout: 8000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      },
    )
    if (result.status !== 0 || !result.stdout) return null
    const parsed = JSON.parse(result.stdout) as { ok?: boolean; result?: string }
    if (!parsed.ok || typeof parsed.result !== 'string') return null
    return parsed.result
  } catch {
    return null
  }
}

/** Prefer Electron safeStorage bridge; otherwise AES file crypto. */
function encrypt(plain: string): string {
  const viaBridge = bridgeCall('encrypt', plain)
  if (viaBridge != null) return `safe:${viaBridge}`
  return `aes:${aesEncrypt(plain)}`
}

function decrypt(payload: string): string {
  if (payload.startsWith('safe:')) {
    const viaBridge = bridgeCall('decrypt', payload.slice(5))
    if (viaBridge != null) return viaBridge
    throw new Error('safeStorage decrypt unavailable')
  }
  if (payload.startsWith('aes:')) {
    return aesDecrypt(payload.slice(4))
  }
  // Legacy untagged AES payloads
  return aesDecrypt(payload)
}

export function getCredentials(connectorId: string): ConnectorCredentials | null {
  const file = filePath(connectorId)
  if (!fs.existsSync(file)) return null
  try {
    const raw = decrypt(fs.readFileSync(file, 'utf8'))
    const parsed = JSON.parse(raw) as ConnectorCredentials
    if (!parsed?.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

export function setCredentials(
  connectorId: string,
  creds: Omit<ConnectorCredentials, 'updatedAt'> & { updatedAt?: number },
): ConnectorCredentials {
  ensureEmmiDirs()
  fs.mkdirSync(credentialsDir(), { recursive: true, mode: 0o700 })
  const next: ConnectorCredentials = {
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    expiresAt: creds.expiresAt,
    tokenType: creds.tokenType ?? 'Bearer',
    scope: creds.scope,
    accountLabel: creds.accountLabel,
    updatedAt: creds.updatedAt ?? Date.now(),
  }
  fs.writeFileSync(filePath(connectorId), encrypt(JSON.stringify(next)), {
    mode: 0o600,
  })
  return next
}

export function clearCredentials(connectorId: string) {
  const file = filePath(connectorId)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

export function hasCredentials(connectorId: string): boolean {
  return getCredentials(connectorId) !== null
}

/** Used only by tests / diagnostics — probe bridge without writing. */
export function credentialsBridgeConfigured(): boolean {
  return Boolean(process.env.EMMI_CREDENTIALS_BRIDGE?.trim())
}
