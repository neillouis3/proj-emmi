import { isPackInstalled } from '../packs/registry.js'
import { getGenericPermissions } from './genericPermissions.js'

export const AUTH_PACK_ID = 'auth'
export const ACCOUNTS_CONNECTOR_ID = 'accounts'

/**
 * Provider OAuth + ctx.http require the Auth pack (Accounts connector) to be
 * installed and connected. Provider packs declare `requires: [auth]`.
 */
export function accountsCapabilityReady():
  | { ok: true }
  | { ok: false; error: string } {
  if (!isPackInstalled(AUTH_PACK_ID)) {
    return {
      ok: false,
      error: 'Auth pack is not installed. Install Auth from Packs (required for account login).',
    }
  }
  const perms = getGenericPermissions(ACCOUNTS_CONNECTOR_ID)
  if (perms.status !== 'granted') {
    return {
      ok: false,
      error:
        'Enable Accounts in Connectors before connecting API accounts or calling ctx.http.',
    }
  }
  return { ok: true }
}
