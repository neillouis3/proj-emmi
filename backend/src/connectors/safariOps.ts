/**
 * Safari interaction ops — AppleScript `do JavaScript` in the front document.
 * pageShot stays screencapture (see browserPolicy); tab list/focus/new/close are AppleScript-only.
 */
import { spawnSync } from 'node:child_process'
import {
  BrowserPermissionError,
  formatBrowserErrorMessage,
  SAFARI_APP,
} from './browserErrors.js'

function escapeApple(s: string) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  }
}

function wrapExpr(expression: string) {
  return `(function(){ try { return (${expression}); } catch (e) { return String(e && e.message ? e.message : e); } })()`
}

function looksLikeJsDisabled(stderr: string, stdout: string) {
  const text = `${stderr}\n${stdout}`.toLowerCase()
  return (
    /javascript from apple events/i.test(text) ||
    /allow javascript from apple events/i.test(text) ||
    /apple events.*javascript/i.test(text) ||
    /javascript.*not allowed/i.test(text) ||
    /do javascript.*not allowed/i.test(text)
  )
}

function safariJsDisabledError(detail?: string) {
  const base =
    detail?.trim() ||
    'Safari blocked do JavaScript. Enable Develop → Allow JavaScript from Apple Events, then retry.'
  return new BrowserPermissionError(
    formatBrowserErrorMessage('safari_js_disabled', base),
    { needsGrant: false, connectorId: 'safari', code: 'safari_js_disabled' },
  )
}

function throwIfJsDisabled(result: { ok: boolean; stderr: string; stdout: string }) {
  if (looksLikeJsDisabled(result.stderr, result.stdout)) {
    throw safariJsDisabledError(result.stderr || result.stdout)
  }
}

function runSafariJsRaw(
  expression: string,
  opts: { dryRun?: boolean } = {},
): { via: 'applescript' | 'dry-run'; value: unknown } {
  if (opts.dryRun) {
    return { via: 'dry-run', value: null }
  }
  const js = wrapExpr(expression)
  const script = `tell application "Safari" to do JavaScript "${escapeApple(js)}" in front document`
  const result = runOsascript(script)
  if (!result.ok) {
    throwIfJsDisabled(result)
    throw new BrowserPermissionError(
      result.stderr || result.stdout || 'Safari do JavaScript failed',
      { needsGrant: false, connectorId: 'safari' },
    )
  }
  const raw = result.stdout.trim()
  if (raw === 'true') return { via: 'applescript', value: true }
  if (raw === 'false') return { via: 'applescript', value: false }
  if (raw === 'null' || raw === 'missing value' || raw === '') {
    return { via: 'applescript', value: null }
  }
  return { via: 'applescript', value: raw }
}

function frontDocWhere(): string {
  const script = `tell application "Safari"
  try
    set t to name of front document
    set u to URL of front document
    return t & linefeed & u
  on error
    return ""
  end try
end tell`
  const result = runOsascript(script)
  if (!result.ok) return ''
  const lines = result.stdout.split('\n')
  const title = (lines[0] ?? '').trim()
  const href = (lines[1] ?? '').trim()
  if (!title && !href) return ''
  return ` on “${title.slice(0, 80)}” (${href.slice(0, 120)})`
}

function missingElementError(selector: string) {
  const where = frontDocWhere()
  return new BrowserPermissionError(
    `Element not found: ${selector}${where}. Wait for the selector, or check the page.`,
    { needsGrant: false, connectorId: 'safari' },
  )
}

function selectorLiteral(selector: string) {
  return JSON.stringify(String(selector ?? ''))
}

export type SafariJsStatus = {
  state: 'ready' | 'needs_setting' | 'unavailable'
  detail?: string
}

/** Probe: tiny `do JavaScript "true"` for Connectors badge. */
export function probeSafariJs(): SafariJsStatus {
  if (process.platform !== 'darwin') {
    return { state: 'unavailable', detail: 'Safari requires macOS' }
  }
  const script = `tell application "Safari" to do JavaScript "true" in front document`
  const result = runOsascript(script)
  if (result.ok) {
    return { state: 'ready' }
  }
  if (looksLikeJsDisabled(result.stderr, result.stdout)) {
    return {
      state: 'needs_setting',
      detail: result.stderr || result.stdout || undefined,
    }
  }
  // No front document / Safari not running — treat as needs setting only if
  // the error clearly mentions Apple Events JS; otherwise still “unavailable”
  // so the UI can say open a tab / grant Safari.
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase()
  if (
    /no document|isn't running|application isn't running|front document/i.test(
      text,
    )
  ) {
    // Safari may be fine once a document exists; report ready-ish via needs open.
    // Prefer “needs_setting” only for the Develop menu; use unavailable for no doc.
    return {
      state: 'unavailable',
      detail:
        result.stderr?.trim() ||
        'Open Safari with at least one tab, then refresh.',
    }
  }
  if (/not authorized|permission|osascript/i.test(text)) {
    return {
      state: 'unavailable',
      detail: result.stderr || result.stdout || undefined,
    }
  }
  // Ambiguous failures often mean JS from Apple Events is off.
  return {
    state: 'needs_setting',
    detail: result.stderr || result.stdout || undefined,
  }
}

export async function safariWait(opts: {
  url?: string
  selector?: string
  timeoutMs?: number
  dryRun?: boolean
}) {
  const timeoutMs = Math.min(
    Math.max(Number(opts.timeoutMs ?? 10_000) || 10_000, 100),
    120_000,
  )
  if (opts.dryRun) {
    return {
      ok: true,
      waited: true,
      stdout: `[dry-run] wait ${opts.url || opts.selector || 'load'}`,
    }
  }
  const deadline = Date.now() + timeoutMs
  const urlNeedle = String(opts.url ?? '').trim()
  const selector = String(opts.selector ?? '').trim()

  while (Date.now() < deadline) {
    if (urlNeedle) {
      const { value } = runSafariJsRaw(`String(location.href || '')`, {})
      if (String(value).toLowerCase().includes(urlNeedle.toLowerCase())) {
        return { ok: true, waited: true, url: String(value), stdout: String(value) }
      }
    } else if (selector) {
      const { value } = runSafariJsRaw(
        `Boolean(document.querySelector(${selectorLiteral(selector)}))`,
        {},
      )
      if (value === true || value === 'true') {
        return { ok: true, waited: true, selector, stdout: selector }
      }
    } else {
      const { value } = runSafariJsRaw(`document.readyState === 'complete'`, {})
      if (value === true || value === 'true') {
        return { ok: true, waited: true, stdout: 'complete' }
      }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new BrowserPermissionError(
    `safari.wait timed out after ${timeoutMs}ms` +
      (urlNeedle
        ? ` (URL containing “${urlNeedle}”)`
        : selector
          ? ` (selector ${selector})`
          : ' (document complete)'),
    { needsGrant: false, connectorId: 'safari' },
  )
}

export async function safariPageText(opts: { dryRun?: boolean }) {
  const { value, via } = runSafariJsRaw(
    `(document.body && (document.body.innerText || document.body.textContent) || '').slice(0, 20000)`,
    { dryRun: opts.dryRun },
  )
  const text = String(value ?? '')
  return { ok: true, text, via, stdout: text }
}

export async function safariQuery(opts: {
  selector: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'safari',
    })
  }
  const { value, via } = runSafariJsRaw(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return null; return (el.innerText || el.textContent || el.value || '').toString().slice(0, 8000); })()`,
    { dryRun: opts.dryRun },
  )
  return {
    ok: true,
    selector,
    text: value == null ? null : String(value),
    via,
    stdout: String(value ?? ''),
  }
}

export async function safariClick(opts: {
  selector: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'safari',
    })
  }
  const { value, via } = runSafariJsRaw(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return false; el.click(); return true; })()`,
    { dryRun: opts.dryRun },
  )
  if (!opts.dryRun && value !== true && value !== 'true') {
    throw missingElementError(selector)
  }
  return { ok: true, selector, via, stdout: selector }
}

export async function safariType(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  const text = String(opts.text ?? '')
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'safari',
    })
  }
  const { value, via } = runSafariJsRaw(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return false; el.focus(); const v = ${JSON.stringify(text)}; if ('value' in el) { el.value = (el.value || '') + v; el.dispatchEvent(new Event('input', { bubbles: true })); } else { el.textContent = (el.textContent || '') + v; } return true; })()`,
    { dryRun: opts.dryRun },
  )
  if (!opts.dryRun && value !== true && value !== 'true') {
    throw missingElementError(selector)
  }
  return { ok: true, selector, via, stdout: selector }
}

export async function safariFill(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  const text = String(opts.text ?? '')
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'safari',
    })
  }
  const { value, via } = runSafariJsRaw(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return false; el.focus(); const v = ${JSON.stringify(text)}; if ('value' in el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } else { el.textContent = v; } return true; })()`,
    { dryRun: opts.dryRun },
  )
  if (!opts.dryRun && value !== true && value !== 'true') {
    throw missingElementError(selector)
  }
  return { ok: true, selector, via, stdout: selector }
}

export async function safariEval(opts: {
  expression: string
  dryRun?: boolean
}) {
  const expression = String(opts.expression ?? '').trim()
  if (!expression) {
    throw new BrowserPermissionError('expression is required', {
      needsGrant: false,
      connectorId: 'safari',
    })
  }
  const { value, via } = runSafariJsRaw(expression, { dryRun: opts.dryRun })
  return { ok: true, value, via, stdout: String(value ?? '') }
}

export async function safariTab(opts: {
  action: string
  target?: string
  dryRun?: boolean
}) {
  const action = String(opts.action ?? 'list').trim().toLowerCase()
  const target = String(opts.target ?? '').trim()

  if (opts.dryRun) {
    return { ok: true, action, stdout: `[dry-run] tab ${action}` }
  }

  if (action === 'new') {
    const url = target || 'about:blank'
    const script = `tell application "Safari"
  tell front window to set current tab to (make new tab with properties {URL:"${escapeApple(url)}"})
end tell`
    const result = runOsascript(script)
    if (!result.ok) {
      throw new BrowserPermissionError(result.stderr || 'tab new failed', {
        needsGrant: false,
        connectorId: 'safari',
      })
    }
    return { ok: true, action, url, stdout: url }
  }

  if (action === 'close') {
    const script = `tell application "Safari"
  close current tab of front window
end tell`
    const result = runOsascript(script)
    if (!result.ok) {
      throw new BrowserPermissionError(result.stderr || 'tab close failed', {
        needsGrant: false,
        connectorId: 'safari',
      })
    }
    return { ok: true, action, stdout: 'closed' }
  }

  if (action === 'focus' || action === 'select') {
    if (!target) {
      throw new BrowserPermissionError('target URL or index required for focus', {
        needsGrant: false,
        connectorId: 'safari',
      })
    }
    const asIndex = /^\d+$/.test(target) ? Number(target) : null
    const script =
      asIndex != null
        ? `tell application "Safari"
  set current tab of front window to tab ${asIndex} of front window
end tell`
        : `tell application "Safari"
  set needle to "${escapeApple(target)}"
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if (URL of t as text) contains needle or (name of t as text) contains needle then
        set index of w to 1
        set current tab of w to t
        return URL of t
      end if
    end repeat
  end repeat
  error "No tab matched"
end tell`
    const result = runOsascript(script)
    if (!result.ok) {
      throw new BrowserPermissionError(result.stderr || 'tab focus failed', {
        needsGrant: false,
        connectorId: 'safari',
      })
    }
    return { ok: true, action, target, stdout: result.stdout.trim() }
  }

  // list
  const script = `tell application "Safari"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      set out to out & (name of t) & " | " & (URL of t) & linefeed
    end repeat
  end repeat
  return out
end tell`
  const result = runOsascript(script)
  if (!result.ok) {
    throw new BrowserPermissionError(result.stderr || 'tab list failed', {
      needsGrant: false,
      connectorId: 'safari',
    })
  }
  return { ok: true, action: 'list', stdout: result.stdout }
}

export { SAFARI_APP }
