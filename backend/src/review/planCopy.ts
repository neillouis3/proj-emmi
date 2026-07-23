/**
 * Turn script/step summaries into short human checklist lines for Review.
 */

const FN_LABELS: Record<string, string> = {
  browse: 'Open a URL',
  wait: 'Wait for the page',
  pageText: 'Read page text',
  pageRead: 'Read tab title and URL',
  pageShot: 'Take a tab screenshot',
  query: 'Read an element',
  click: 'Click an element',
  type: 'Type into an element',
  fill: 'Fill an input',
  eval: 'Run page JavaScript',
  tab: 'Change tabs',
  navigate: 'Navigate the tab',
  tabs: 'List open tabs',
  list: 'List files',
  move: 'Move files',
  copy: 'Copy files',
  delete: 'Delete files',
  rename: 'Rename a file',
  mkdir: 'Create a folder',
  write: 'Save text to a file',
  route: 'Route files by type',
  detect: 'Filter files',
  extract: 'Read a file property',
  lookup: 'Look up a destination',
  log: 'Write a log message',
  exec: 'Run a shell command',
  script: 'Run a script file',
  sleep: 'Pause briefly',
  fail: 'Stop if something is missing',
  status: 'Check git status',
  diff: 'Show git diff',
  gitLog: 'Read git history',
  branch: 'Read git branch',
  init: 'Initialize a git repo',
  add: 'Stage git files',
  commit: 'Create a git commit',
  checkout: 'Check out a git ref',
  pull: 'Pull from a remote',
  push: 'Push to a remote',
}

function bareFn(token: string) {
  const t = token.replace(/\(\.\.\.\)$/, '').trim()
  if (t.includes('.')) return t.slice(t.lastIndexOf('.') + 1)
  return t
}

function connectorPrefix(token: string) {
  if (!token.includes('.')) return ''
  const cid = token.split('.')[0]
  if (cid === 'chrome') return ' in Chrome'
  if (cid === 'safari') return ' in Safari'
  if (cid === 'shell') return ' (shell)'
  if (cid === 'git') return ' (git)'
  return ''
}

/** One summary line → checklist item. */
export function humanizePlanLine(raw: string): string {
  const line = raw.trim()
  if (!line) return line

  const indent = line.match(/^\s*/)?.[0] ?? ''
  const body = line.trim()

  if (/^if \(\.\.\.\)$/.test(body)) return `${indent}If a condition matches`
  if (body === 'else') return `${indent}Otherwise`
  if (body === 'try') return `${indent}Try`
  if (body === 'catch') return `${indent}If that fails`
  const retry = body.match(/^retry (\d+)(?:, (\d+)ms)?$/)
  if (retry) {
    const n = retry[1]
    const ms = retry[2]
    return ms
      ? `${indent}Retry up to ${n} times (${ms}ms apart)`
      : `${indent}Retry up to ${n} times`
  }

  const assign = body.match(/^(\w+)\s*=\s*(.+)$/)
  if (assign) {
    const fnTok = assign[2]
    const fn = bareFn(fnTok)
    const label = FN_LABELS[fn] ?? fn
    return `${indent}${label}${connectorPrefix(fnTok)} → ${assign[1]}`
  }

  const call = body.match(/^(.+)\(\.\.\.\)$/)
  if (call) {
    const fnTok = call[1]
    const fn = bareFn(fnTok)
    const label = FN_LABELS[fn] ?? fn
    return `${indent}${label}${connectorPrefix(fnTok)}`
  }

  return line
}

export function humanizePlan(summaries: string[], limit = 16): string[] {
  return summaries.slice(0, limit).map(humanizePlanLine)
}

export function planLooksUndoable(summaries: string[], files: string[]): boolean {
  if (!files.length) return false
  const text = summaries.join('\n')
  const hasMoves = /\b(?:move|route|copy)\b|\.(?:move|route|copy)\(/.test(text)
  const hasBrowserOrShell =
    /\b(?:browse|navigate|click|type|fill|eval|pageShot|tab|exec|script|write|delete)\b|\.(?:browse|navigate|click|type|fill|eval|pageShot|tab|exec|script)\(/.test(
      text,
    )
  // File moves are undoable; browser/shell/write/delete are not.
  if (hasBrowserOrShell && !hasMoves) return false
  if (hasMoves) return true
  return false
}

export function trustNoteForPending(opts: {
  connectorId: string
  undoable: boolean
  grantKind?: string | null
}): string | undefined {
  if (opts.grantKind === 'shell') {
    return 'Only this command is added to your shell allowlist. Nothing runs until you approve.'
  }
  if (opts.grantKind === 'git') {
    return 'Git access stays on this Mac, limited to folders you already scoped. You can disconnect anytime.'
  }
  if (opts.grantKind === 'chrome' || opts.grantKind === 'safari') {
    const name = opts.grantKind === 'chrome' ? 'Chrome' : 'Safari'
    return `${name} access stays on this Mac. Emmi only controls the browser when an automation runs. You can disconnect anytime.`
  }
  if (!opts.undoable) {
    if (opts.connectorId === 'chrome' || opts.connectorId === 'safari') {
      return 'Browser actions can’t be undone. Approve only if this plan looks right.'
    }
    if (opts.connectorId === 'shell') {
      return 'Shell commands can’t be undone. Approve only if this plan looks right.'
    }
    if (opts.connectorId === 'git') {
      return 'Git writes on disk aren’t auto-undone. Approve only if this plan looks right.'
    }
    return 'This run isn’t automatically undoable. Approve only if this plan looks right.'
  }
  return 'File moves can be undone from Logs if something goes wrong.'
}
