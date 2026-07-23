import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  expandedScopes,
  getWebBrowserPermissions,
  pathUnderScopes,
  type WebBrowserConnectorId,
  type WebBrowserPermissions,
} from './permissions.js'
import { expandPath } from '../paths.js'
import {
  BrowserPermissionError,
  CHROME_APP,
  SAFARI_APP,
} from './browserErrors.js'
import {
  chromeClick,
  chromeEval,
  chromeFill,
  chromePageShotCdp,
  chromePageText,
  chromeQuery,
  chromeTab,
  chromeType,
  chromeWait,
} from './chromeOps.js'
import {
  safariClick,
  safariEval,
  safariFill,
  safariPageText,
  safariQuery,
  safariTab,
  safariType,
  safariWait,
} from './safariOps.js'

export {
  BrowserPermissionError,
  CHROME_APP,
  SAFARI_APP,
} from './browserErrors.js'

function labelFor(connectorId: WebBrowserConnectorId) {
  return connectorId === 'chrome' ? 'Chrome' : 'Safari'
}

function assertDarwin(connectorId: WebBrowserConnectorId) {
  if (process.platform !== 'darwin') {
    throw new BrowserPermissionError(
      `${labelFor(connectorId)} connector requires macOS`,
      { needsGrant: false, connectorId },
    )
  }
}

function assertGranted(
  perms: WebBrowserPermissions,
  connectorId: WebBrowserConnectorId,
) {
  if (perms.status === 'denied') {
    throw new BrowserPermissionError(
      `${labelFor(connectorId)} connector is denied`,
      { needsGrant: false, connectorId, code: 'denied' },
    )
  }
  if (perms.status === 'ask') {
    throw new BrowserPermissionError(
      `${labelFor(connectorId)} needs permission grant before running`,
      { needsGrant: true, connectorId, code: 'needs_grant' },
    )
  }
}

function resolveApp(app: string | undefined): {
  app: string
  connectorId: WebBrowserConnectorId
} {
  const raw = String(app ?? '').trim()
  if (raw === CHROME_APP || /^chrome$/i.test(raw) || /google\s*chrome/i.test(raw)) {
    return { app: CHROME_APP, connectorId: 'chrome' }
  }
  return { app: SAFARI_APP, connectorId: 'safari' }
}

export function hostAllowed(url: string, perms: WebBrowserPermissions) {
  const list = perms.urlHostAllowlist
  if (!list.length) return true
  try {
    const host = (
      /:\/\//.test(url) ? new URL(url).hostname : url.split('/')[0]
    )
      .toLowerCase()
      .replace(/:\d+$/, '')
    if (!host) return false
    return list.some((entry) => {
      const e = entry.toLowerCase().replace(/^\*\./, '')
      return host === e || host.endsWith(`.${e}`) || host.includes(e)
    })
  } catch {
    return false
  }
}

function assertUrlAllowed(
  url: string,
  perms: WebBrowserPermissions,
  connectorId: WebBrowserConnectorId,
) {
  if (!hostAllowed(url, perms)) {
    throw new BrowserPermissionError(`URL host not allowlisted: ${url}`, {
      needsGrant: false,
      connectorId,
    })
  }
}

function truncate(text: string, max = 8000) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…(truncated)`
}

function runOsascript(script: string, dryRun?: boolean) {
  if (dryRun) {
    return { ok: true, code: 0, stdout: '[dry-run] osascript', stderr: '' }
  }
  const result = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    shell: false,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: truncate(String(result.stdout ?? '')),
    stderr: truncate(String(result.stderr ?? '')),
  }
}

function escapeApple(s: string) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function isChrome(app: string) {
  return app === CHROME_APP
}

function tabsScript(app: string) {
  if (isChrome(app)) {
    return `tell application "Google Chrome"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      set out to out & (title of t) & " | " & (URL of t) & linefeed
    end repeat
  end repeat
  return out
end tell`
  }
  return `tell application "Safari"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      set out to out & (name of t) & " | " & (URL of t) & linefeed
    end repeat
  end repeat
  return out
end tell`
}

function navigateScript(app: string, url: string) {
  const u = escapeApple(url)
  if (isChrome(app)) {
    return `tell application "Google Chrome" to set URL of active tab of front window to "${u}"`
  }
  return `tell application "Safari" to set URL of front document to "${u}"`
}

function pageReadScript(app: string) {
  if (isChrome(app)) {
    return `tell application "Google Chrome"
  set t to title of active tab of front window
  set u to URL of active tab of front window
  return t & linefeed & u
end tell`
  }
  return `tell application "Safari"
  set t to name of front document
  set u to URL of front document
  return t & linefeed & u
end tell`
}

function gateChrome(dryRun?: boolean) {
  assertDarwin('chrome')
  const perms = getWebBrowserPermissions('chrome')
  assertGranted(perms, 'chrome')
  return perms
}

function gateSafari(dryRun?: boolean) {
  assertDarwin('safari')
  const perms = getWebBrowserPermissions('safari')
  assertGranted(perms, 'safari')
  return perms
}

export function browserBrowse(opts: {
  url: string
  app: string
  dryRun?: boolean
}) {
  const { app, connectorId } = resolveApp(opts.app)
  assertDarwin(connectorId)
  const perms = getWebBrowserPermissions(connectorId)
  assertGranted(perms, connectorId)
  const url = String(opts.url ?? '').trim()
  if (!url) {
    throw new BrowserPermissionError('url is required', {
      needsGrant: false,
      connectorId,
    })
  }
  assertUrlAllowed(url, perms, connectorId)
  if (opts.dryRun) {
    return { ok: true, app, url, stdout: `[dry-run] open -a ${app} ${url}` }
  }
  const result = spawnSync('open', ['-a', app, url], {
    encoding: 'utf8',
    shell: false,
    timeout: 15_000,
  })
  if (result.status !== 0) {
    throw new BrowserPermissionError(
      result.stderr?.toString() || `Failed to open ${url} in ${app}`,
      { needsGrant: false, connectorId },
    )
  }
  return { ok: true, app, url, stdout: '' }
}

export function browserTabs(opts: { app: string; dryRun?: boolean }) {
  const { app, connectorId } = resolveApp(opts.app)
  assertDarwin(connectorId)
  const perms = getWebBrowserPermissions(connectorId)
  assertGranted(perms, connectorId)

  const result = runOsascript(tabsScript(app), opts.dryRun)
  if (!result.ok && !opts.dryRun) {
    throw new BrowserPermissionError(
      result.stderr || `Failed to list ${app} tabs`,
      { needsGrant: false, connectorId },
    )
  }
  return { ok: true, app, stdout: result.stdout }
}

export function browserNavigate(opts: {
  url: string
  app: string
  dryRun?: boolean
}) {
  const { app, connectorId } = resolveApp(opts.app)
  assertDarwin(connectorId)
  const perms = getWebBrowserPermissions(connectorId)
  assertGranted(perms, connectorId)
  const url = String(opts.url ?? '').trim()
  if (!url) {
    throw new BrowserPermissionError('url is required', {
      needsGrant: false,
      connectorId,
    })
  }
  assertUrlAllowed(url, perms, connectorId)
  const result = runOsascript(navigateScript(app, url), opts.dryRun)
  if (!result.ok && !opts.dryRun) {
    throw new BrowserPermissionError(
      result.stderr || `Navigate failed in ${app}`,
      { needsGrant: false, connectorId },
    )
  }
  return { ok: true, app, url, stdout: result.stdout }
}

export function browserPageRead(opts: { app: string; dryRun?: boolean }) {
  const { app, connectorId } = resolveApp(opts.app)
  assertDarwin(connectorId)
  const perms = getWebBrowserPermissions(connectorId)
  assertGranted(perms, connectorId)
  const result = runOsascript(pageReadScript(app), opts.dryRun)
  if (!result.ok && !opts.dryRun) {
    throw new BrowserPermissionError(
      result.stderr || `Read failed in ${app}`,
      { needsGrant: false, connectorId },
    )
  }
  const lines = result.stdout.split('\n')
  return {
    ok: true,
    app,
    title: lines[0] ?? '',
    url: lines[1] ?? '',
    stdout: result.stdout,
  }
}

export async function browserPageShot(opts: {
  path: string
  app: string
  dryRun?: boolean
}) {
  const { app, connectorId } = resolveApp(opts.app)
  assertDarwin(connectorId)
  const perms = getWebBrowserPermissions(connectorId)
  assertGranted(perms, connectorId)
  const outPath = expandPath(String(opts.path ?? ''), {})
  const scopes = expandedScopes(perms.folderScopes)
  if (!pathUnderScopes(outPath, scopes)) {
    throw new BrowserPermissionError(
      `Screenshot path outside allowed folders: ${opts.path}`,
      { needsGrant: false, connectorId },
    )
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  if (opts.dryRun) {
    return { ok: true, app, path: outPath, stdout: '[dry-run] pageShot' }
  }

  if (connectorId === 'chrome') {
    const cdp = await chromePageShotCdp({ path: outPath, dryRun: false })
    return { ok: true, app, path: cdp.path, stdout: cdp.stdout, via: cdp.via }
  }

  spawnSync(
    'osascript',
    ['-e', `tell application "${escapeApple(app)}" to activate`],
    { shell: false },
  )
  const result = spawnSync('screencapture', ['-x', outPath], {
    encoding: 'utf8',
    shell: false,
    timeout: 15_000,
  })
  if (result.status !== 0) {
    throw new BrowserPermissionError(
      result.stderr?.toString() || 'Screenshot failed',
      { needsGrant: false, connectorId },
    )
  }
  return { ok: true, app, path: outPath, stdout: outPath, via: 'screencapture' }
}

/** Chrome-only interaction ops (CDP or AppleScript JS). */
export async function browserChromeWait(opts: {
  url?: string
  selector?: string
  timeoutMs?: number
  dryRun?: boolean
}) {
  const perms = gateChrome(opts.dryRun)
  if (opts.url) assertUrlAllowed(String(opts.url), perms, 'chrome')
  return chromeWait(opts)
}

export async function browserChromePageText(opts: { dryRun?: boolean }) {
  gateChrome(opts.dryRun)
  return chromePageText(opts)
}

export async function browserChromeQuery(opts: {
  selector: string
  dryRun?: boolean
}) {
  gateChrome(opts.dryRun)
  return chromeQuery(opts)
}

export async function browserChromeClick(opts: {
  selector: string
  dryRun?: boolean
}) {
  gateChrome(opts.dryRun)
  return chromeClick(opts)
}

export async function browserChromeType(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  gateChrome(opts.dryRun)
  return chromeType(opts)
}

export async function browserChromeFill(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  gateChrome(opts.dryRun)
  return chromeFill(opts)
}

export async function browserChromeEval(opts: {
  expression: string
  dryRun?: boolean
}) {
  gateChrome(opts.dryRun)
  return chromeEval(opts)
}

export async function browserChromeTab(opts: {
  action: string
  target?: string
  dryRun?: boolean
}) {
  const perms = gateChrome(opts.dryRun)
  const action = String(opts.action ?? '').toLowerCase()
  if (
    (action === 'new' || action === 'focus' || action === 'select') &&
    opts.target &&
    /^https?:\/\//i.test(opts.target)
  ) {
    assertUrlAllowed(opts.target, perms, 'chrome')
  }
  return chromeTab(opts)
}

/** Safari interaction ops (AppleScript do JavaScript). */
export async function browserSafariWait(opts: {
  url?: string
  selector?: string
  timeoutMs?: number
  dryRun?: boolean
}) {
  const perms = gateSafari(opts.dryRun)
  if (opts.url) assertUrlAllowed(String(opts.url), perms, 'safari')
  return safariWait(opts)
}

export async function browserSafariPageText(opts: { dryRun?: boolean }) {
  gateSafari(opts.dryRun)
  return safariPageText(opts)
}

export async function browserSafariQuery(opts: {
  selector: string
  dryRun?: boolean
}) {
  gateSafari(opts.dryRun)
  return safariQuery(opts)
}

export async function browserSafariClick(opts: {
  selector: string
  dryRun?: boolean
}) {
  gateSafari(opts.dryRun)
  return safariClick(opts)
}

export async function browserSafariType(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  gateSafari(opts.dryRun)
  return safariType(opts)
}

export async function browserSafariFill(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  gateSafari(opts.dryRun)
  return safariFill(opts)
}

export async function browserSafariEval(opts: {
  expression: string
  dryRun?: boolean
}) {
  gateSafari(opts.dryRun)
  return safariEval(opts)
}

export async function browserSafariTab(opts: {
  action: string
  target?: string
  dryRun?: boolean
}) {
  const perms = gateSafari(opts.dryRun)
  const action = String(opts.action ?? '').toLowerCase()
  if (
    (action === 'new' || action === 'focus' || action === 'select') &&
    opts.target &&
    /^https?:\/\//i.test(opts.target)
  ) {
    assertUrlAllowed(opts.target, perms, 'safari')
  }
  return safariTab(opts)
}

export function installBrowserHooks() {
  const g = globalThis as unknown as {
    __emmiBrowserBrowse: typeof browserBrowse
    __emmiBrowserTabs: typeof browserTabs
    __emmiBrowserNavigate: typeof browserNavigate
    __emmiBrowserPageRead: typeof browserPageRead
    __emmiBrowserPageShot: typeof browserPageShot
    __emmiBrowserChromeWait: typeof browserChromeWait
    __emmiBrowserChromePageText: typeof browserChromePageText
    __emmiBrowserChromeQuery: typeof browserChromeQuery
    __emmiBrowserChromeClick: typeof browserChromeClick
    __emmiBrowserChromeType: typeof browserChromeType
    __emmiBrowserChromeFill: typeof browserChromeFill
    __emmiBrowserChromeEval: typeof browserChromeEval
    __emmiBrowserChromeTab: typeof browserChromeTab
    __emmiBrowserSafariWait: typeof browserSafariWait
    __emmiBrowserSafariPageText: typeof browserSafariPageText
    __emmiBrowserSafariQuery: typeof browserSafariQuery
    __emmiBrowserSafariClick: typeof browserSafariClick
    __emmiBrowserSafariType: typeof browserSafariType
    __emmiBrowserSafariFill: typeof browserSafariFill
    __emmiBrowserSafariEval: typeof browserSafariEval
    __emmiBrowserSafariTab: typeof browserSafariTab
  }
  g.__emmiBrowserBrowse = browserBrowse
  g.__emmiBrowserTabs = browserTabs
  g.__emmiBrowserNavigate = browserNavigate
  g.__emmiBrowserPageRead = browserPageRead
  g.__emmiBrowserPageShot = browserPageShot
  g.__emmiBrowserChromeWait = browserChromeWait
  g.__emmiBrowserChromePageText = browserChromePageText
  g.__emmiBrowserChromeQuery = browserChromeQuery
  g.__emmiBrowserChromeClick = browserChromeClick
  g.__emmiBrowserChromeType = browserChromeType
  g.__emmiBrowserChromeFill = browserChromeFill
  g.__emmiBrowserChromeEval = browserChromeEval
  g.__emmiBrowserChromeTab = browserChromeTab
  g.__emmiBrowserSafariWait = browserSafariWait
  g.__emmiBrowserSafariPageText = browserSafariPageText
  g.__emmiBrowserSafariQuery = browserSafariQuery
  g.__emmiBrowserSafariClick = browserSafariClick
  g.__emmiBrowserSafariType = browserSafariType
  g.__emmiBrowserSafariFill = browserSafariFill
  g.__emmiBrowserSafariEval = browserSafariEval
  g.__emmiBrowserSafariTab = browserSafariTab
}
