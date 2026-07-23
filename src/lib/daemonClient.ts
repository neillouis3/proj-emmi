import type {
  Automation,
  LogEntry,
  PendingAction,
  RuleDef,
} from '@/types/domain'
import { filterRuleLibrary } from '@/lib/ruleDef'

export const DAEMON_BASE =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_EMMI_DAEMON?: string } }).env
      ?.VITE_EMMI_DAEMON) ||
  'http://127.0.0.1:3921'

export class DaemonError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${DAEMON_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new DaemonError(res.status, data.error ?? res.statusText)
  }
  return data
}

export async function daemonHealth() {
  return request<{ status: string; version: string }>('/health')
}

export async function daemonReady() {
  try {
    await request<{ rules: unknown[] }>('/connectors/fs/rules')
    return true
  } catch {
    return false
  }
}

export async function daemonPing() {
  if (await daemonReady()) return true
  try {
    await daemonHealth()
    // /health ok but rules API missing — stale daemon build still running.
    return false
  } catch {
    return false
  }
}

export async function fetchAutomations() {
  const data = await request<{ automations: Automation[] }>('/automations')
  return data.automations
}

export async function fetchAutomation(id: string) {
  if (window.emmi?.fetchAutomation) {
    return window.emmi.fetchAutomation(id)
  }
  return request<{ automation: Automation }>(
    `/automations/${encodeURIComponent(id)}`,
  )
}

export type RecipeSummary = {
  id: string
  name: string
  description: string
  trigger: Automation['trigger']
  triggerSummary: string
  connectors: string[]
}

export async function fetchRecipes(): Promise<RecipeSummary[]> {
  const data = await request<{ recipes: RecipeSummary[] }>('/recipes')
  return data.recipes ?? []
}

export async function fetchRecipe(id: string): Promise<Automation> {
  const data = await request<{ recipe: Automation }>(
    `/recipes/${encodeURIComponent(id)}`,
  )
  return data.recipe
}

export type Pack = {
  id: string
  name: string
  description: string
  version: string
  core: boolean
  logo?: string
  author?: string
  installed: boolean
  installedVersion: string | null
  updateAvailable: boolean
  connectors: string[]
  requires?: string[]
  requiredBy?: { id: string; name: string }[]
  recipeCount: number
  starters?: { id: string; name: string; description?: string }[]
}

export async function fetchPacks(): Promise<Pack[]> {
  const data = await request<{ packs: Pack[] }>('/packs')
  return data.packs ?? []
}

export async function installPack(id: string): Promise<Pack[]> {
  const data = await request<{ packs: Pack[] }>(
    `/packs/${encodeURIComponent(id)}/install`,
    { method: 'POST', body: '{}' },
  )
  return data.packs ?? []
}

export async function updatePack(id: string): Promise<Pack[]> {
  const data = await request<{ packs: Pack[] }>(
    `/packs/${encodeURIComponent(id)}/update`,
    { method: 'POST', body: '{}' },
  )
  return data.packs ?? []
}

export async function removePack(id: string): Promise<Pack[]> {
  const data = await request<{ packs: Pack[] }>(
    `/packs/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  return data.packs ?? []
}

export async function fetchRuleLibrary() {
  const data = await request<{ rules: unknown[] }>('/rules')
  const rules = filterRuleLibrary(data.rules ?? [])
  return rules.length ? rules : undefined
}

export async function fetchConnectorRules(connectorId: string) {
  try {
    const data = await request<{ rules: unknown[] }>(
      `/connectors/${encodeURIComponent(connectorId)}/rules`,
    )
    const rules = filterRuleLibrary(data.rules ?? [])
    return rules.length ? rules : undefined
  } catch (err) {
    if (err instanceof DaemonError && err.status === 404) return undefined
    throw err
  }
}

export async function fetchRuleSource(connectorId: string, ruleId: string) {
  const data = await request<{ rule: RuleDef & { code: string } }>(
    `/connectors/${encodeURIComponent(connectorId)}/rules/${encodeURIComponent(ruleId)}`,
  )
  return data.rule
}

export async function createConnectorRule(
  connectorId: string,
  input: { id?: string; code: string },
) {
  return request<{ rule: RuleDef }>(
    `/connectors/${encodeURIComponent(connectorId)}/rules`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function updateConnectorRule(
  connectorId: string,
  ruleId: string,
  code: string,
) {
  return request<{ rule: RuleDef }>(
    `/connectors/${encodeURIComponent(connectorId)}/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ code }),
    },
  )
}

export async function deleteConnectorRule(connectorId: string, ruleId: string) {
  return request<{ ok: boolean }>(
    `/connectors/${encodeURIComponent(connectorId)}/rules/${encodeURIComponent(ruleId)}`,
    { method: 'DELETE' },
  )
}

export async function fetchPending() {
  const data = await request<{ pending: PendingAction[] }>('/pending')
  return data.pending
}

export async function fetchLogs() {
  const data = await request<{ logs: LogEntry[] }>('/logs')
  return data.logs
}

export type DaemonConnector = {
  id: string
  name: string
  description?: string
  kind?: 'Local' | 'Web'
  scope?: string
  popular?: boolean
  logo?: string
  permission?: import('@/types/domain').ConnectorPermissionDecl
  auth?: import('@/types/domain').ConnectorOAuth2Auth
  setup?: { kind: string }
}

export async function fetchConnectors() {
  const data = await request<{ connectors: DaemonConnector[] }>('/connectors')
  return data.connectors
}

export type ConnectorAuthStatus = {
  connectorId: string
  status: 'available' | 'connected' | 'expired' | 'error' | 'missing-client'
  accountLabel?: string
  expiresAt?: number
  error?: string
}

export async function startConnectorAuth(connectorId: string) {
  return request<{ url: string }>(
    `/connectors/${encodeURIComponent(connectorId)}/auth/start`,
    { method: 'POST', body: '{}' },
  )
}

export async function fetchConnectorAuthStatus(connectorId: string) {
  return request<ConnectorAuthStatus>(
    `/connectors/${encodeURIComponent(connectorId)}/auth/status`,
  )
}

export async function disconnectConnectorAuth(connectorId: string) {
  return request<ConnectorAuthStatus>(
    `/connectors/${encodeURIComponent(connectorId)}/auth`,
    { method: 'DELETE' },
  )
}

export type GrantStatus = 'ask' | 'granted' | 'denied'

export type ShellPermissions = {
  status: GrantStatus
  allowlist: string[]
  folderScopes: string[]
  network: boolean
  approvedCommands?: string[]
}

export type GitPermissions = {
  status: GrantStatus
  folderScopes: string[]
  remoteOps: boolean
}

export type WebBrowserPermissions = {
  status: GrantStatus
  folderScopes: string[]
  urlHostAllowlist: string[]
}

export type GenericPermissions = {
  status: GrantStatus
  folderScopes: string[]
  allowlist: string[]
  hostAllowlist: string[]
  flags: Record<string, boolean>
}

export type ConnectorPermissionsPayload =
  | ShellPermissions
  | GitPermissions
  | WebBrowserPermissions
  | GenericPermissions
  | { folderScopes: string[] }

export async function fetchConnectorPermissions(connectorId: string) {
  return request<{
    connectorId: string
    permissions: ConnectorPermissionsPayload
  }>(`/connectors/${encodeURIComponent(connectorId)}/permissions`)
}

export async function saveConnectorPermissions(
  connectorId: string,
  permissions: Record<string, unknown>,
) {
  return request<{ connectorId: string; permissions: ConnectorPermissionsPayload }>(
    `/connectors/${encodeURIComponent(connectorId)}/permissions`,
    { method: 'PUT', body: JSON.stringify(permissions) },
  )
}

export async function fetchChromeCdpStatus() {
  return request<{ state: 'up' | 'no_pages' | 'down'; port: number }>(
    '/connectors/chrome/cdp',
  )
}

export async function fetchSafariJsStatus() {
  return request<{
    state: 'ready' | 'needs_setting' | 'unavailable'
    detail?: string
  }>('/connectors/safari/js')
}

export async function openSafariApp() {
  return request<{ ok: boolean; error?: string }>('/connectors/safari/open', {
    method: 'POST',
    body: '{}',
  })
}

export async function undoDaemonLog(id: string) {
  return request<{ logId: string; restored: number }>(
    `/logs/${encodeURIComponent(id)}/undo`,
    { method: 'POST', body: '{}' },
  )
}

export async function runDaemonAutomation(
  id: string,
  body: { dryRun?: boolean; mode?: string } = {},
) {
  return request<{
    runId: string
    mode: string
    pending: PendingAction | null
  }>(`/automations/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function approveDaemonPending(id: string) {
  return request(`/pending/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: '{}',
  })
}

export async function rejectDaemonPending(id: string) {
  return request(`/pending/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: '{}',
  })
}

export async function updateDaemonPending(
  id: string,
  editableAction: string,
) {
  return request(`/pending/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ editableAction }),
  })
}

export async function createDaemonAutomation(input: {
  id?: string
  name: string
  description?: string
  trigger: string
  defaultMode: string
  steps: Automation['steps']
  keybind?: string | null
  keybindEnabled?: boolean
  active?: boolean
  schedule?: Automation['schedule'] | null
  watch?: Automation['watch'] | null
}) {
  if (window.emmi?.createAutomation) {
    return window.emmi.createAutomation(input)
  }
  return request<{ automation: Automation }>('/automations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateDaemonAutomation(
  id: string,
  partial: Omit<Partial<Automation>, 'schedule' | 'watch'> & {
    schedule?: Automation['schedule'] | null
    watch?: Automation['watch'] | null
  },
) {
  const body = partial as Record<string, unknown>
  if (window.emmi?.updateAutomation) {
    try {
      return await window.emmi.updateAutomation(id, body)
    } catch {
      /* fall through to direct fetch */
    }
  }
  return request<{ automation: Automation }>(
    `/automations/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(partial),
    },
  )
}

export type NativeInfo = {
  name: string
  description?: string
  params: Record<string, string>
  returns?: string
  permission: 'read' | 'write' | 'execute' | 'network'
  scopes?: string[]
  trust: 'builtin' | 'custom'
  source?: string
  grant?: {
    status: 'ask' | 'granted' | 'denied'
    permission: 'read' | 'write' | 'execute' | 'network'
    scopes: string[]
    grantedAt?: string
  }
}

export async function fetchNatives() {
  const data = await request<{ natives: NativeInfo[] }>('/natives')
  return data.natives
}

export async function reloadNatives() {
  const data = await request<{ natives: NativeInfo[] }>('/natives/reload', {
    method: 'POST',
    body: '{}',
  })
  return data.natives
}

export async function grantNative(
  name: string,
  body: {
    status: 'ask' | 'granted' | 'denied'
    permission?: NativeInfo['permission']
    scopes?: string[]
  },
) {
  return request<{ grant: NativeInfo['grant']; native?: NativeInfo }>(
    `/natives/${encodeURIComponent(name)}/grant`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export async function fetchDaemonConfig() {
  return request<{ variables: Record<string, string> }>('/config')
}

export async function saveDaemonConfig(variables: Record<string, string>) {
  return request<{ variables: Record<string, string> }>('/config', {
    method: 'PUT',
    body: JSON.stringify({ variables }),
  })
}

export async function patchDaemonControl(partial: Record<string, unknown>) {
  return request<Record<string, unknown>>('/control', {
    method: 'POST',
    body: JSON.stringify(partial),
  })
}

export async function clearDaemonLogsOlderThan(days: number) {
  return request<{ ok: boolean }>('/history/clear-older', {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

export function subscribeDaemonEvents(onEvent: () => void) {
  let es: EventSource | null = null
  try {
    es = new EventSource(`${DAEMON_BASE}/events`)
  } catch {
    return () => {}
  }
  const handler = () => onEvent()
  es.addEventListener('ready', handler)
  for (const name of [
    'run:started',
    'run:pending',
    'run:completed',
    'run:failed',
    'pending:approved',
    'pending:rejected',
    'log:undone',
  ]) {
    es.addEventListener(name, handler)
  }
  es.onerror = () => {
    // browser will retry EventSource automatically
  }
  return () => {
    es?.close()
  }
}
