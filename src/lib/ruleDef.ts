import type { RuleDef } from '@/types/domain'

/** Built-in fs rules for offline UI when the daemon is unavailable. */
export const FALLBACK_FS_RULES: RuleDef[] = [
  { id: 'move', connectorId: 'fs', category: 'core', params: ['input', 'output'], source: '', origin: 'builtin' },
  { id: 'copy', connectorId: 'fs', category: 'core', params: ['input', 'output'], source: '', origin: 'builtin' },
  { id: 'delete', connectorId: 'fs', category: 'core', params: ['path'], source: '', origin: 'builtin' },
  { id: 'rename', connectorId: 'fs', category: 'core', params: ['path', 'newName'], source: '', origin: 'builtin' },
  { id: 'mkdir', connectorId: 'fs', category: 'core', params: ['path'], source: '', origin: 'builtin' },
  { id: 'write', connectorId: 'fs', category: 'core', params: ['path', 'content'], source: '', origin: 'builtin' },
  { id: 'sleep', connectorId: 'fs', category: 'core', params: ['ms'], source: '', origin: 'builtin' },
  { id: 'fail', connectorId: 'fs', category: 'core', params: ['message'], source: '', origin: 'builtin' },
  { id: 'detect', connectorId: 'fs', category: 'detection', params: ['pattern', 'list'], source: '', origin: 'builtin' },
  { id: 'extract', connectorId: 'fs', category: 'detection', params: ['field', 'file'], source: '', origin: 'builtin' },
  { id: 'list', connectorId: 'fs', category: 'detection', params: ['dir'], source: '', origin: 'builtin' },
  { id: 'lookup', connectorId: 'fs', category: 'routing', params: ['value', 'table'], source: '', origin: 'builtin' },
  { id: 'route', connectorId: 'fs', category: 'routing', params: ['files', 'table'], source: '', origin: 'builtin' },
  { id: 'log', connectorId: 'fs', category: 'logging', params: ['message', 'category'], source: '', origin: 'builtin' },
]

export const FALLBACK_SHELL_RULES: RuleDef[] = [
  { id: 'exec', connectorId: 'shell', category: 'core', params: ['command', 'args', 'opts'], source: '', origin: 'builtin' },
  { id: 'script', connectorId: 'shell', category: 'core', params: ['path', 'args'], source: '', origin: 'builtin' },
]

export const FALLBACK_GIT_RULES: RuleDef[] = [
  { id: 'status', connectorId: 'git', category: 'core', params: ['repo'], source: '', origin: 'builtin' },
  { id: 'diff', connectorId: 'git', category: 'core', params: ['repo', 'staged'], source: '', origin: 'builtin' },
  { id: 'gitLog', connectorId: 'git', category: 'core', params: ['repo', 'n'], source: '', origin: 'builtin' },
  { id: 'branch', connectorId: 'git', category: 'core', params: ['repo'], source: '', origin: 'builtin' },
  { id: 'init', connectorId: 'git', category: 'core', params: ['path'], source: '', origin: 'builtin' },
  { id: 'add', connectorId: 'git', category: 'core', params: ['repo', 'paths'], source: '', origin: 'builtin' },
  { id: 'commit', connectorId: 'git', category: 'core', params: ['repo', 'message'], source: '', origin: 'builtin' },
  { id: 'checkout', connectorId: 'git', category: 'core', params: ['repo', 'ref'], source: '', origin: 'builtin' },
  { id: 'pull', connectorId: 'git', category: 'core', params: ['repo', 'remote', 'branch'], source: '', origin: 'builtin' },
  { id: 'push', connectorId: 'git', category: 'core', params: ['repo', 'remote', 'branch'], source: '', origin: 'builtin' },
]

export const FALLBACK_SAFARI_RULES: RuleDef[] = [
  { id: 'browse', connectorId: 'safari', category: 'core', params: ['url'], source: '', origin: 'builtin' },
  { id: 'tabs', connectorId: 'safari', category: 'core', params: [], source: '', origin: 'builtin' },
  { id: 'navigate', connectorId: 'safari', category: 'core', params: ['url'], source: '', origin: 'builtin' },
  { id: 'pageRead', connectorId: 'safari', category: 'core', params: [], source: '', origin: 'builtin' },
  { id: 'pageShot', connectorId: 'safari', category: 'core', params: ['path'], source: '', origin: 'builtin' },
  { id: 'wait', connectorId: 'safari', category: 'core', params: ['urlOrSelector', 'timeoutMs'], source: '', origin: 'builtin' },
  { id: 'pageText', connectorId: 'safari', category: 'core', params: [], source: '', origin: 'builtin' },
  { id: 'query', connectorId: 'safari', category: 'core', params: ['selector'], source: '', origin: 'builtin' },
  { id: 'click', connectorId: 'safari', category: 'core', params: ['selector'], source: '', origin: 'builtin' },
  { id: 'type', connectorId: 'safari', category: 'core', params: ['selector', 'text'], source: '', origin: 'builtin' },
  { id: 'fill', connectorId: 'safari', category: 'core', params: ['selector', 'text'], source: '', origin: 'builtin' },
  { id: 'eval', connectorId: 'safari', category: 'core', params: ['expression'], source: '', origin: 'builtin' },
  { id: 'tab', connectorId: 'safari', category: 'core', params: ['action', 'target'], source: '', origin: 'builtin' },
]

export const FALLBACK_CHROME_RULES: RuleDef[] = [
  { id: 'browse', connectorId: 'chrome', category: 'core', params: ['url'], source: '', origin: 'builtin' },
  { id: 'tabs', connectorId: 'chrome', category: 'core', params: [], source: '', origin: 'builtin' },
  { id: 'navigate', connectorId: 'chrome', category: 'core', params: ['url'], source: '', origin: 'builtin' },
  { id: 'pageRead', connectorId: 'chrome', category: 'core', params: [], source: '', origin: 'builtin' },
  { id: 'pageShot', connectorId: 'chrome', category: 'core', params: ['path'], source: '', origin: 'builtin' },
  { id: 'wait', connectorId: 'chrome', category: 'core', params: ['urlOrSelector', 'timeoutMs'], source: '', origin: 'builtin' },
  { id: 'pageText', connectorId: 'chrome', category: 'core', params: [], source: '', origin: 'builtin' },
  { id: 'query', connectorId: 'chrome', category: 'core', params: ['selector'], source: '', origin: 'builtin' },
  { id: 'click', connectorId: 'chrome', category: 'core', params: ['selector'], source: '', origin: 'builtin' },
  { id: 'type', connectorId: 'chrome', category: 'core', params: ['selector', 'text'], source: '', origin: 'builtin' },
  { id: 'fill', connectorId: 'chrome', category: 'core', params: ['selector', 'text'], source: '', origin: 'builtin' },
  { id: 'eval', connectorId: 'chrome', category: 'core', params: ['expression'], source: '', origin: 'builtin' },
  { id: 'tab', connectorId: 'chrome', category: 'core', params: ['action', 'target'], source: '', origin: 'builtin' },
]

function isLegacyPolicyRule(item: Record<string, unknown>) {
  return 'watch' in item || 'actionKind' in item || 'extensions' in item
}

export function normalizeRuleDef(item: unknown): RuleDef | null {
  if (!item || typeof item !== 'object') return null
  const r = item as Record<string, unknown>
  if (isLegacyPolicyRule(r)) return null
  if (typeof r.id !== 'string' || !r.id.trim()) return null
  if (typeof r.connectorId !== 'string' || !r.connectorId.trim()) return null
  const category = typeof r.category === 'string' ? r.category : 'core'
  const origin = r.origin === 'user' ? 'user' : 'builtin'
  return {
    id: r.id,
    connectorId: r.connectorId,
    category: category as RuleDef['category'],
    params: Array.isArray(r.params) ? r.params.map(String) : [],
    source: typeof r.source === 'string' ? r.source : '',
    origin,
    code: typeof r.code === 'string' ? r.code : undefined,
  }
}

export function filterRuleLibrary(items: unknown[]): RuleDef[] {
  const out: RuleDef[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const rule = normalizeRuleDef(item)
    if (!rule) continue
    const key = `${rule.connectorId}/${rule.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rule)
  }
  return out
}

export function rulesForConnectorFallback(connectorId: string): RuleDef[] {
  if (connectorId === 'fs') return FALLBACK_FS_RULES
  if (connectorId === 'shell') return FALLBACK_SHELL_RULES
  if (connectorId === 'git') return FALLBACK_GIT_RULES
  if (connectorId === 'safari') return FALLBACK_SAFARI_RULES
  if (connectorId === 'chrome') return FALLBACK_CHROME_RULES
  return []
}

export function allFallbackRules(): RuleDef[] {
  return [
    ...FALLBACK_FS_RULES,
    ...FALLBACK_SHELL_RULES,
    ...FALLBACK_GIT_RULES,
    ...FALLBACK_SAFARI_RULES,
    ...FALLBACK_CHROME_RULES,
  ]
}

/** FS + Shell always expose rules; others only when the connector is connected. */
export const ALWAYS_ON_RULE_CONNECTORS = new Set(['fs', 'shell'])

export function connectorRulesActive(
  connectorId: string,
  connectors: { id: string; authStatus: string }[],
): boolean {
  if (ALWAYS_ON_RULE_CONNECTORS.has(connectorId)) return true
  return connectors.some(
    (c) => c.id === connectorId && c.authStatus === 'connected',
  )
}

export function filterActiveConnectorRules<T extends { connectorId: string }>(
  rules: T[],
  connectors: { id: string; authStatus: string }[],
): T[] {
  return rules.filter((r) => connectorRulesActive(r.connectorId, connectors))
}

