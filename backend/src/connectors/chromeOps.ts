/**
 * Chrome interaction ops — CDP required for DOM / pageText / wait / shots.
 * AppleScript remains for tab list/focus/new/close only.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { assertCdpReady, CdpSession } from './chromeCdp.js'
import {
  BrowserPermissionError,
  CHROME_APP,
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

async function runJs(
  expression: string,
  opts: { dryRun?: boolean; matchUrl?: string },
): Promise<{ via: 'cdp' | 'dry-run'; value: unknown }> {
  if (opts.dryRun) {
    return { via: 'dry-run', value: null }
  }
  await assertCdpReady()
  const session = await CdpSession.connectActivePage(opts.matchUrl)
  try {
    const value = await session.evaluate(wrapExpr(expression))
    return { via: 'cdp', value }
  } finally {
    session.close()
  }
}

async function missingElementError(selector: string) {
  let where = ''
  try {
    const session = await CdpSession.connectActivePage()
    try {
      const href = await session.evaluate('String(location.href || "")')
      const title = await session.evaluate('String(document.title || "")')
      where = ` on “${String(title).slice(0, 80)}” (${String(href).slice(0, 120)})`
    } finally {
      session.close()
    }
  } catch {
    /* ignore */
  }
  return new BrowserPermissionError(
    `Element not found: ${selector}${where}. Wait for the selector, or check the page.`,
    { needsGrant: false, connectorId: 'chrome' },
  )
}

function selectorLiteral(selector: string) {
  return JSON.stringify(String(selector ?? ''))
}

export async function chromeWait(opts: {
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
      const { value } = await runJs(
        `String(location.href || '')`,
        { matchUrl: urlNeedle },
      )
      if (String(value).toLowerCase().includes(urlNeedle.toLowerCase())) {
        return { ok: true, waited: true, url: String(value), stdout: String(value) }
      }
    } else if (selector) {
      const { value } = await runJs(
        `Boolean(document.querySelector(${selectorLiteral(selector)}))`,
        {},
      )
      if (value === true || value === 'true') {
        return { ok: true, waited: true, selector, stdout: selector }
      }
    } else {
      const { value } = await runJs(
        `document.readyState === 'complete'`,
        {},
      )
      if (value === true || value === 'true') {
        return { ok: true, waited: true, stdout: 'complete' }
      }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new BrowserPermissionError(
    `chrome.wait timed out after ${timeoutMs}ms` +
      (urlNeedle
        ? ` (URL containing “${urlNeedle}”)`
        : selector
          ? ` (selector ${selector})`
          : ' (document complete)'),
    { needsGrant: false, connectorId: 'chrome' },
  )
}

export async function chromePageText(opts: { dryRun?: boolean }) {
  const { value, via } = await runJs(
    `(document.body && (document.body.innerText || document.body.textContent) || '').slice(0, 20000)`,
    { dryRun: opts.dryRun },
  )
  const text = String(value ?? '')
  return { ok: true, text, via, stdout: text }
}

export async function chromeQuery(opts: {
  selector: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'chrome',
    })
  }
  const { value, via } = await runJs(
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

export async function chromeClick(opts: {
  selector: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'chrome',
    })
  }
  const { value, via } = await runJs(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return false; el.click(); return true; })()`,
    { dryRun: opts.dryRun },
  )
  if (!opts.dryRun && value !== true && value !== 'true') {
    throw await missingElementError(selector)
  }
  return { ok: true, selector, via, stdout: selector }
}

export async function chromeType(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  const text = String(opts.text ?? '')
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'chrome',
    })
  }
  const { value, via } = await runJs(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return false; el.focus(); const v = ${JSON.stringify(text)}; if ('value' in el) { el.value = (el.value || '') + v; el.dispatchEvent(new Event('input', { bubbles: true })); } else { el.textContent = (el.textContent || '') + v; } return true; })()`,
    { dryRun: opts.dryRun },
  )
  if (!opts.dryRun && value !== true && value !== 'true') {
    throw await missingElementError(selector)
  }
  return { ok: true, selector, via, stdout: selector }
}

export async function chromeFill(opts: {
  selector: string
  text: string
  dryRun?: boolean
}) {
  const selector = String(opts.selector ?? '').trim()
  const text = String(opts.text ?? '')
  if (!selector) {
    throw new BrowserPermissionError('selector is required', {
      needsGrant: false,
      connectorId: 'chrome',
    })
  }
  const { value, via } = await runJs(
    `(() => { const el = document.querySelector(${selectorLiteral(selector)}); if (!el) return false; el.focus(); const v = ${JSON.stringify(text)}; if ('value' in el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } else { el.textContent = v; } return true; })()`,
    { dryRun: opts.dryRun },
  )
  if (!opts.dryRun && value !== true && value !== 'true') {
    throw await missingElementError(selector)
  }
  return { ok: true, selector, via, stdout: selector }
}

export async function chromeEval(opts: {
  expression: string
  dryRun?: boolean
}) {
  const expression = String(opts.expression ?? '').trim()
  if (!expression) {
    throw new BrowserPermissionError('expression is required', {
      needsGrant: false,
      connectorId: 'chrome',
    })
  }
  const { value, via } = await runJs(expression, { dryRun: opts.dryRun })
  return { ok: true, value, via, stdout: String(value ?? '') }
}

export async function chromeTab(opts: {
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
    const url = target || 'chrome://newtab/'
    const script = `tell application "Google Chrome"
  tell front window to make new tab with properties {URL:"${escapeApple(url)}"}
end tell`
    const result = runOsascript(script)
    if (!result.ok) {
      throw new BrowserPermissionError(result.stderr || 'tab new failed', {
        needsGrant: false,
        connectorId: 'chrome',
      })
    }
    return { ok: true, action, url, stdout: url }
  }

  if (action === 'close') {
    const script = `tell application "Google Chrome"
  tell front window to close active tab
end tell`
    const result = runOsascript(script)
    if (!result.ok) {
      throw new BrowserPermissionError(result.stderr || 'tab close failed', {
        needsGrant: false,
        connectorId: 'chrome',
      })
    }
    return { ok: true, action, stdout: 'closed' }
  }

  if (action === 'focus' || action === 'select') {
    if (!target) {
      throw new BrowserPermissionError('target URL or index required for focus', {
        needsGrant: false,
        connectorId: 'chrome',
      })
    }
    const asIndex = /^\d+$/.test(target) ? Number(target) : null
    const script =
      asIndex != null
        ? `tell application "Google Chrome"
  set active tab index of front window to ${asIndex}
end tell`
        : `tell application "Google Chrome"
  set needle to "${escapeApple(target)}"
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if (URL of t as text) contains needle or (title of t as text) contains needle then
        set index of w to 1
        set active tab index of w to i
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
        connectorId: 'chrome',
      })
    }
    return { ok: true, action, target, stdout: result.stdout.trim() }
  }

  // list
  const script = `tell application "Google Chrome"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      set out to out & (title of t) & " | " & (URL of t) & linefeed
    end repeat
  end repeat
  return out
end tell`
  const result = runOsascript(script)
  if (!result.ok) {
    throw new BrowserPermissionError(result.stderr || 'tab list failed', {
      needsGrant: false,
      connectorId: 'chrome',
    })
  }
  return { ok: true, action: 'list', stdout: result.stdout }
}

export async function chromePageShotCdp(opts: {
  path: string
  dryRun?: boolean
}): Promise<{ ok: true; path: string; via: string; stdout: string }> {
  if (opts.dryRun) {
    return {
      ok: true,
      path: opts.path,
      via: 'dry-run',
      stdout: '[dry-run] pageShot',
    }
  }
  await assertCdpReady()
  const outPath = opts.path
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const session = await CdpSession.connectActivePage()
  try {
    const png = await session.screenshotPng()
    fs.writeFileSync(outPath, png)
    return { ok: true, path: outPath, via: 'cdp', stdout: outPath }
  } finally {
    session.close()
  }
}

// Re-export app constant for callers that import from this module
export { CHROME_APP }
