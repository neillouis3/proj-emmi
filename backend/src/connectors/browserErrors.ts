export type WebBrowserConnectorId = 'safari' | 'chrome'

export type BrowserErrorCode =
  | 'needs_grant'
  | 'denied'
  | 'cdp_unavailable'
  | 'cdp_no_pages'
  | 'safari_js_disabled'
  | 'host_blocked'
  | 'scope_blocked'
  | 'generic'

export const SAFARI_APP = 'Safari'
export const CHROME_APP = 'Google Chrome'

export class BrowserPermissionError extends Error {
  needsGrant: boolean
  connectorId: WebBrowserConnectorId
  code: BrowserErrorCode
  constructor(
    message: string,
    opts: {
      needsGrant?: boolean
      connectorId: WebBrowserConnectorId
      code?: BrowserErrorCode
    },
  ) {
    super(message)
    this.name = 'BrowserPermissionError'
    this.needsGrant = Boolean(opts.needsGrant)
    this.connectorId = opts.connectorId
    this.code =
      opts.code ??
      (opts.needsGrant ? 'needs_grant' : 'generic')
  }
}

/** Stable prefix so UI can detect CDP / Safari JS setup failures in log text. */
export function formatBrowserErrorMessage(
  code: BrowserErrorCode,
  message: string,
) {
  if (
    code === 'cdp_unavailable' ||
    code === 'cdp_no_pages' ||
    code === 'safari_js_disabled'
  ) {
    return `[${code}] ${message}`
  }
  return message
}
