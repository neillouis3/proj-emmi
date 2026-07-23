import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {
  configStepsToUi,
  deleteAutomation,
  loadAutomation,
  loadAutomations,
  loadConfig,
  loadRecipe,
  loadRecipes,
  uiStepsToConfig,
  withAutomationWriteLock,
  writeAutomation,
} from '../config/load.js'
import { saveConfig } from '../config/save.js'
import {
  installPack,
  installPackFromDir,
  listInstalledRecipeIds,
  listPacksForApi,
  removePack,
  resolvePackLogoPath,
  updatePack,
} from '../packs/index.js'
import { getControl, loadControl, patchControl } from '../control.js'
import { clearHistoryOlderThanDays } from '../state/history.js'
import { automationsDir, cacheDir, emmiRoot, logsDir } from '../paths.js'
import { subscribeEvents } from '../events.js'
import {
  approvePending,
  automationConnectorIds,
  rejectPending,
  runAutomation,
} from '../runner/runAutomation.js'
import { reloadTriggerHost } from '../triggers/host.js'
import { undoLogEntry } from '../runner/undoLog.js'
import { getDaemonState, getRun } from '../state/store.js'
import { initNativeFns, listNativeFns } from '../natives/fnRegistry.js'
import {
  deleteUserRule,
  enrichRuleDef,
  listConnectorIds,
  listRulesForConnector,
  loadConnectorManifest,
  readRuleSource,
  writeUserRule,
} from '../rules/catalog.js'
import {
  initNatives,
  listNatives,
} from '../natives/registry.js'
import { setNativeGrant } from '../natives/permissions.js'
import {
  getConnectorPermissions,
  getGitPermissions,
  getShellPermissions,
  getWebBrowserPermissions,
  grantGitPermissions,
  grantShellPermissions,
  grantWebBrowserPermissions,
  setGitPermissions,
  setShellPermissions,
  setWebBrowserPermissions,
  type WebBrowserConnectorId,
} from '../connectors/permissions.js'
import {
  getGenericPermissions,
  grantGenericPermissions,
  isGenericConnector,
  setGenericPermissions,
} from '../connectors/genericPermissions.js'
import {
  completeOAuthCallback,
  disconnectAuth,
  getAuthStatus,
  oauthCallbackHtml,
  startOAuth,
} from '../connectors/oauth.js'
import type { NativePermission } from '../natives/types.js'
import { listTools } from '../tools/registry.js'
import type {
  AutomationConfig,
  PendingAction,
  RunMode,
} from '../types.js'

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(json)
}

function notFound(res: ServerResponse) {
  send(res, 404, { error: 'Not found' })
}

/** Rebuild the rule/native registries after a pack install/update/remove. */
async function refreshRuleRegistry() {
  await Promise.all([initNatives(), initNativeFns()])
}

/** Extract generic connector permission fields from a request body. */
function genericPermissionBody(
  body: Record<string, unknown>,
  status: 'ask' | 'granted' | 'denied' | undefined,
  folderScopes: string[] | undefined,
) {
  return {
    ...(status ? { status } : {}),
    ...(folderScopes ? { folderScopes } : {}),
    ...(Array.isArray(body.allowlist)
      ? { allowlist: body.allowlist.map(String) }
      : {}),
    ...(Array.isArray(body.hostAllowlist)
      ? { hostAllowlist: body.hostAllowlist.map(String) }
      : {}),
    ...(body.flags && typeof body.flags === 'object'
      ? { flags: body.flags as Record<string, boolean> }
      : {}),
  }
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function triggerSummaryFor(a: AutomationConfig): string {
  if (a.trigger === 'manual') return 'manual (menu bar)'
  if (a.trigger === 'keybind') {
    const kb = a.keybind?.trim()
    return kb ? `Keybind · ${kb}` : 'Keybind'
  }
  if (a.trigger === 'cli') return 'CLI command'
  if (a.trigger === 'schedule') {
    const cron = a.schedule?.cron?.trim()
    return cron ? `Schedule · ${cron}` : 'Schedule'
  }
  if (a.trigger === 'watch') {
    const paths = a.watch?.paths ?? []
    if (!paths.length) return 'Watch'
    if (paths.length === 1) return `Watch · ${paths[0]}`
    return `Watch · ${paths.length} folders`
  }
  return 'manual (menu bar)'
}

function parseScheduleBody(
  body: Record<string, unknown>,
  fallback?: AutomationConfig['schedule'],
): AutomationConfig['schedule'] | undefined {
  if (!('schedule' in body)) return fallback
  const raw = body.schedule
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as { cron?: unknown; tz?: unknown }
  const cron = typeof s.cron === 'string' ? s.cron.trim() : ''
  if (!cron) return undefined
  const tz = typeof s.tz === 'string' && s.tz.trim() ? s.tz.trim() : undefined
  return tz ? { cron, tz } : { cron }
}

function parseWatchBody(
  body: Record<string, unknown>,
  fallback?: AutomationConfig['watch'],
): AutomationConfig['watch'] | undefined {
  if (!('watch' in body)) return fallback
  const raw = body.watch
  if (!raw || typeof raw !== 'object') return undefined
  const w = raw as { paths?: unknown; debounceMs?: unknown }
  const paths = Array.isArray(w.paths)
    ? w.paths.map(String).map((p) => p.trim()).filter(Boolean)
    : []
  if (!paths.length) return undefined
  const debounceMs =
    typeof w.debounceMs === 'number' && Number.isFinite(w.debounceMs)
      ? Math.max(0, Math.floor(w.debounceMs))
      : undefined
  return debounceMs !== undefined ? { paths, debounceMs } : { paths }
}

function toUiAutomation(a: AutomationConfig) {
  const state = getDaemonState()
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    active: a.active,
    trigger: a.trigger,
    triggerSummary: triggerSummaryFor(a),
    keybind: a.keybind ?? null,
    keybindEnabled: a.keybindEnabled !== false,
    schedule: a.schedule,
    watch: a.watch,
    lastRunAt: state.lastRunAtByAutomation[a.id],
    defaultMode: a.defaultMode,
    connectors: automationConnectorIds(a),
    steps: configStepsToUi(a.steps),
  }
}

/** Lightweight summary for the recipe picker — full recipe fetched on select. */
function toRecipeSummary(a: AutomationConfig) {
  const connectors = Array.from(
    new Set(
      configStepsToUi(a.steps)
        .map((s) => s.connectorId)
        .filter(Boolean),
    ),
  )
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    trigger: a.trigger,
    triggerSummary: triggerSummaryFor(a),
    connectors,
  }
}

function toUiRuleDef(
  def: ReturnType<typeof listRulesForConnector>[0],
) {
  const fnMeta = listNativeFns().find((n) => n.name === def.id)
  const enriched = enrichRuleDef(def, fnMeta)
  return {
    id: enriched.id,
    connectorId: enriched.connectorId,
    category: enriched.category,
    params: enriched.params.length ? enriched.params : (fnMeta?.params ?? []),
    source: enriched.source,
    origin: enriched.origin,
  }
}

function toUiPending(p: PendingAction) {
  return {
    id: p.id,
    createdAt: p.createdAt,
    title: p.title,
    trigger: p.trigger,
    action: p.action,
    reasoning: p.reasoning,
    sourceRuleId: p.sourceRuleId,
    connectorId: p.connectorId,
    automationId: p.automationId,
    editableAction: p.editableAction,
    files: p.files ?? [],
    plan: p.plan ?? [],
    undoable: Boolean(p.undoable),
    trustNote: p.trustNote,
    grantKind: p.grantKind ?? null,
    shellCommand: p.shellCommand,
  }
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const { pathname } = url
  const method = req.method ?? 'GET'

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  try {
    if (method === 'GET' && pathname === '/health') {
      send(res, 200, {
        status: 'running',
        version: '0.2.0',
        variables: Object.keys(loadConfig().variables),
        paths: {
          data: emmiRoot(),
          logs: logsDir(),
          cache: cacheDir(),
        },
      })
      return
    }

    if (method === 'GET' && pathname === '/tools') {
      send(res, 200, { tools: listTools() })
      return
    }

    if (method === 'GET' && pathname === '/natives') {
      const fromTools = listNatives()
      const fromFns = listNativeFns().map((n) => ({
        name: n.name,
        description: n.description,
        params: Object.fromEntries(n.params.map((p) => [p, 'any'])),
        permission: n.permission,
        trust: n.trust,
        source: n.source,
      }))
      // Prefer plain-function natives when names overlap.
      const byName = new Map<string, (typeof fromFns)[0] | (typeof fromTools)[0]>()
      for (const n of fromTools) byName.set(n.name, n)
      for (const n of fromFns) byName.set(n.name, n)
      send(res, 200, { natives: [...byName.values()] })
      return
    }

    if (method === 'POST' && pathname === '/natives/reload') {
      await Promise.all([initNatives(), initNativeFns()])
      const fromTools = listNatives()
      const fromFns = listNativeFns().map((n) => ({
        name: n.name,
        description: n.description,
        params: Object.fromEntries(n.params.map((p) => [p, 'any'])),
        permission: n.permission,
        trust: n.trust,
        source: n.source,
      }))
      const byName = new Map<string, (typeof fromFns)[0] | (typeof fromTools)[0]>()
      for (const n of fromTools) byName.set(n.name, n)
      for (const n of fromFns) byName.set(n.name, n)
      send(res, 200, { natives: [...byName.values()] })
      return
    }

    if (method === 'POST' && pathname.startsWith('/natives/') && pathname.endsWith('/grant')) {
      const name = decodeURIComponent(
        pathname.slice('/natives/'.length, -'/grant'.length),
      )
      const body = await readJson(req)
      const native = listNatives().find((n) => n.name === name)
      if (!native) {
        send(res, 404, { error: 'Native not found' })
        return
      }
      const status =
        body.status === 'denied' || body.status === 'ask'
          ? body.status
          : 'granted'
      const grant = setNativeGrant(name, {
        status,
        permission: (body.permission as NativePermission) ?? native.permission,
        scopes: Array.isArray(body.scopes)
          ? body.scopes.map(String)
          : native.scopes ?? [],
      })
      send(res, 200, { grant, native: listNatives().find((n) => n.name === name) })
      return
    }

    if (method === 'GET' && pathname === '/automations') {
      send(res, 200, { automations: loadAutomations().map(toUiAutomation) })
      return
    }

    if (method === 'GET' && pathname === '/recipes') {
      const installedRecipes = listInstalledRecipeIds()
      send(res, 200, {
        recipes: loadRecipes()
          .filter((r) => installedRecipes.has(r.id))
          .map(toRecipeSummary),
      })
      return
    }

    if (method === 'GET' && pathname.startsWith('/recipes/')) {
      const id = decodeURIComponent(pathname.slice('/recipes/'.length))
      const recipe = loadRecipe(id)
      if (!recipe) {
        send(res, 404, { error: 'Recipe not found' })
        return
      }
      send(res, 200, { recipe: toUiAutomation(recipe) })
      return
    }

    if (method === 'GET' && pathname === '/packs') {
      send(res, 200, { packs: listPacksForApi() })
      return
    }

    if (method === 'GET' && pathname.match(/^\/packs\/[^/]+\/logo$/)) {
      const id = decodeURIComponent(
        pathname.slice('/packs/'.length, -'/logo'.length),
      )
      const file = resolvePackLogoPath(id)
      if (!file) {
        send(res, 404, { error: 'Logo not found' })
        return
      }
      const body = fs.readFileSync(file)
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': body.length,
      })
      res.end(body)
      return
    }

    if (method === 'POST' && pathname === '/packs/install-local') {
      const body = await readJson(req)
      const dir = typeof body.dir === 'string' ? body.dir : ''
      if (!dir) {
        send(res, 400, { error: 'Missing dir' })
        return
      }
      const result = installPackFromDir(dir)
      if (!result.ok) {
        send(res, 400, { error: result.error ?? 'Install failed' })
        return
      }
      await refreshRuleRegistry()
      reloadTriggerHost()
      send(res, 200, { packs: listPacksForApi() })
      return
    }

    if (method === 'POST' && pathname.match(/^\/packs\/[^/]+\/install$/)) {
      const id = decodeURIComponent(
        pathname.slice('/packs/'.length, -'/install'.length),
      )
      const result = installPack(id)
      if (!result.ok) {
        send(res, result.error === 'Pack not found' ? 404 : 400, {
          error: result.error ?? 'Install failed',
        })
        return
      }
      await refreshRuleRegistry()
      reloadTriggerHost()
      send(res, 200, { packs: listPacksForApi() })
      return
    }

    if (method === 'POST' && pathname.match(/^\/packs\/[^/]+\/update$/)) {
      const id = decodeURIComponent(
        pathname.slice('/packs/'.length, -'/update'.length),
      )
      const result = updatePack(id)
      if (!result.ok) {
        send(res, 404, { error: result.error ?? 'Pack not found or not installed' })
        return
      }
      await refreshRuleRegistry()
      reloadTriggerHost()
      send(res, 200, { packs: listPacksForApi() })
      return
    }

    if (method === 'DELETE' && pathname.startsWith('/packs/')) {
      const id = decodeURIComponent(pathname.slice('/packs/'.length))
      const result = removePack(id)
      if (!result.ok) {
        if (result.reason === 'core-locked') {
          send(res, 400, { error: 'Core pack cannot be removed' })
        } else if (result.reason === 'required-by') {
          send(res, 400, { error: result.error ?? 'Pack is required by other packs' })
        } else {
          send(res, 404, { error: 'Pack not found' })
        }
        return
      }
      await refreshRuleRegistry()
      reloadTriggerHost()
      send(res, 200, { packs: listPacksForApi() })
      return
    }

    if (method === 'GET' && pathname.startsWith('/automations/')) {
      const id = decodeURIComponent(pathname.slice('/automations/'.length))
      if (id.endsWith('/run')) {
        notFound(res)
        return
      }
      const automation = loadAutomation(id)
      if (!automation) {
        send(res, 404, { error: 'Automation not found' })
        return
      }
      send(res, 200, { automation: toUiAutomation(automation) })
      return
    }

    if (method === 'POST' && pathname === '/automations') {
      const body = await readJson(req)
      const steps = Array.isArray(body.steps)
        ? uiStepsToConfig(
            body.steps as {
              connectorId: string
              operation: string
              params: string
            }[],
          )
        : ((body.configSteps as AutomationConfig['steps']) ?? [])
      const trigger =
        (body.trigger as AutomationConfig['trigger']) ?? 'manual'
      const schedule = parseScheduleBody(body)
      const watch = parseWatchBody(body)
      const automation: AutomationConfig = {
        id: String(body.id ?? `auto-${Date.now().toString(36)}`),
        name: String(body.name ?? 'Untitled'),
        description: String(body.description ?? ''),
        trigger,
        active: body.active !== false,
        defaultMode: (body.defaultMode as RunMode) ?? 'review',
        keybind: (body.keybind as string | null) ?? null,
        keybindEnabled: body.keybindEnabled !== false,
        ...(trigger === 'schedule' && schedule ? { schedule } : {}),
        ...(trigger === 'watch' && watch ? { watch } : {}),
        steps,
      }
      writeAutomation(automation)
      reloadTriggerHost()
      send(res, 201, { automation: toUiAutomation(automation) })
      return
    }

    if (method === 'PUT' && pathname.startsWith('/automations/')) {
      const id = decodeURIComponent(pathname.slice('/automations/'.length))
      const body = await readJson(req)
      const reloaded = await withAutomationWriteLock(id, () => {
        // Reload inside the lock so concurrent PUTs see each other's writes.
        const existing = loadAutomation(id)
        if (!existing) return null
        const steps =
          Array.isArray(body.steps) && body.steps.length > 0
            ? uiStepsToConfig(
                body.steps as {
                  connectorId: string
                  operation: string
                  params: string
                }[],
              )
            : existing.steps
        const trigger =
          (body.trigger as AutomationConfig['trigger']) ?? existing.trigger
        const schedule = parseScheduleBody(body, existing.schedule)
        const watch = parseWatchBody(body, existing.watch)
        const automation: AutomationConfig = {
          id,
          name: String(body.name ?? existing.name),
          description:
            'description' in body
              ? String(body.description ?? '')
              : String(existing.description ?? ''),
          trigger,
          active:
            body.active === undefined ? existing.active : Boolean(body.active),
          defaultMode:
            (body.defaultMode as RunMode) ?? existing.defaultMode,
          keybind:
            body.keybind === undefined
              ? existing.keybind
              : (body.keybind as string | null),
          keybindEnabled:
            body.keybindEnabled === undefined
              ? existing.keybindEnabled
              : Boolean(body.keybindEnabled),
          ...(trigger === 'schedule' && schedule ? { schedule } : {}),
          ...(trigger === 'watch' && watch ? { watch } : {}),
          steps,
          script: existing.script,
        }
        writeAutomation(automation)
        return loadAutomation(id)
      })
      if (!reloaded) {
        send(res, 404, { error: 'Automation not found' })
        return
      }
      reloadTriggerHost()
      console.log(
        `[emmi] saved automation ${id} → ${path.join(automationsDir(), `${id}.yaml`)} (name: ${JSON.stringify(reloaded.name)}, description: ${JSON.stringify(reloaded.description ?? '')})`,
      )
      send(res, 200, { automation: toUiAutomation(reloaded) })
      return
    }

    if (method === 'DELETE' && pathname.startsWith('/automations/')) {
      const id = decodeURIComponent(pathname.slice('/automations/'.length))
      deleteAutomation(id)
      reloadTriggerHost()
      send(res, 200, { ok: true })
      return
    }

    if (method === 'POST' && pathname.match(/^\/automations\/[^/]+\/run$/)) {
      const id = decodeURIComponent(pathname.split('/')[2] ?? '')
      const body = await readJson(req)
      const result = await runAutomation(id, {
        dryRun:
          body.dryRun === undefined ? undefined : Boolean(body.dryRun),
        mode: body.mode as RunMode | undefined,
      })
      send(res, 200, {
        runId: result.runId,
        mode: result.mode,
        run: result.run,
        pending: result.pending ? toUiPending(result.pending) : null,
      })
      return
    }

    if (method === 'GET' && pathname === '/runs') {
      send(res, 200, { runs: getDaemonState().runs })
      return
    }

    if (method === 'GET' && pathname.startsWith('/runs/')) {
      const id = decodeURIComponent(pathname.slice('/runs/'.length))
      const run = getRun(id)
      if (!run) {
        send(res, 404, { error: 'Run not found' })
        return
      }
      send(res, 200, { run })
      return
    }

    if (method === 'GET' && pathname === '/pending') {
      send(res, 200, {
        pending: getDaemonState().pending.map(toUiPending),
      })
      return
    }

    if (method === 'POST' && pathname.match(/^\/pending\/[^/]+\/approve$/)) {
      const id = decodeURIComponent(pathname.split('/')[2] ?? '')
      const result = await approvePending(id)
      send(res, 200, {
        run: result.run,
        pending: toUiPending(result.pending),
      })
      return
    }

    if (method === 'POST' && pathname.match(/^\/pending\/[^/]+\/reject$/)) {
      const id = decodeURIComponent(pathname.split('/')[2] ?? '')
      const pending = rejectPending(id)
      send(res, 200, { pending: toUiPending(pending) })
      return
    }

    if (method === 'PUT' && pathname.match(/^\/pending\/[^/]+$/)) {
      const id = decodeURIComponent(pathname.slice('/pending/'.length))
      const body = await readJson(req)
      const state = getDaemonState()
      const item = state.pending.find((p) => p.id === id)
      if (!item) {
        send(res, 404, { error: 'Pending not found' })
        return
      }
      if (typeof body.editableAction === 'string') {
        item.editableAction = body.editableAction
        const destMatch = body.editableAction.match(/Move to\s+(.+)$/i)
        if (destMatch) item.dest = destMatch[1].trim()
      }
      const { persist } = await import('../state/store.js')
      persist()
      send(res, 200, { pending: toUiPending(item) })
      return
    }

    if (method === 'GET' && pathname === '/connectors') {
      const connectors = listConnectorIds().map((id) => {
        const manifest = loadConnectorManifest(id)
        return {
          id,
          name: manifest?.name ?? id,
          description: manifest?.description ?? '',
          kind: manifest?.kind,
          scope: manifest?.scope,
          popular: manifest?.popular,
          logo: manifest?.logo,
          permission: manifest?.permission,
          auth: manifest?.auth,
          setup: manifest?.setup,
        }
      })
      send(res, 200, { connectors })
      return
    }

    if (method === 'GET' && pathname === '/oauth/callback') {
      const result = await completeOAuthCallback({
        code: url.searchParams.get('code') ?? undefined,
        state: url.searchParams.get('state') ?? undefined,
        error: url.searchParams.get('error') ?? undefined,
        error_description:
          url.searchParams.get('error_description') ?? undefined,
      })
      const html = oauthCallbackHtml(
        result.ok,
        result.ok ? `Connected ${result.connectorId}.` : result.error,
      )
      res.writeHead(result.ok ? 200 : 400, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(html)
      return
    }

    if (
      method === 'POST' &&
      pathname.match(/^\/connectors\/[^/]+\/auth\/start$/)
    ) {
      const id = decodeURIComponent(
        pathname.slice('/connectors/'.length, -'/auth/start'.length),
      )
      const result = startOAuth(id)
      if (!result.ok) {
        send(res, 400, { error: result.error })
        return
      }
      send(res, 200, { url: result.url })
      return
    }

    if (
      method === 'GET' &&
      pathname.match(/^\/connectors\/[^/]+\/auth\/status$/)
    ) {
      const id = decodeURIComponent(
        pathname.slice('/connectors/'.length, -'/auth/status'.length),
      )
      send(res, 200, { connectorId: id, ...getAuthStatus(id) })
      return
    }

    if (
      method === 'DELETE' &&
      pathname.match(/^\/connectors\/[^/]+\/auth$/)
    ) {
      const id = decodeURIComponent(
        pathname.slice('/connectors/'.length, -'/auth'.length),
      )
      disconnectAuth(id)
      send(res, 200, { connectorId: id, ...getAuthStatus(id) })
      return
    }

    if (method === 'GET' && pathname === '/connectors/chrome/cdp') {
      const { getCdpStatus } = await import('../connectors/chromeCdp.js')
      send(res, 200, await getCdpStatus())
      return
    }

    if (method === 'GET' && pathname === '/connectors/safari/js') {
      const { probeSafariJs } = await import('../connectors/safariOps.js')
      send(res, 200, probeSafariJs())
      return
    }

    if (
      method === 'POST' &&
      pathname === '/connectors/safari/open'
    ) {
      if (process.platform !== 'darwin') {
        send(res, 400, { ok: false, error: 'Safari requires macOS' })
        return
      }
      const { spawnSync } = await import('node:child_process')
      const result = spawnSync('open', ['-a', 'Safari'], {
        encoding: 'utf8',
        shell: false,
        timeout: 15_000,
      })
      if (result.status !== 0) {
        send(res, 500, {
          ok: false,
          error: result.stderr?.toString() || 'Failed to open Safari',
        })
        return
      }
      send(res, 200, { ok: true })
      return
    }

    if (
      method === 'GET' &&
      pathname.match(/^\/connectors\/[^/]+\/permissions$/)
    ) {
      const connectorId = decodeURIComponent(pathname.split('/')[2] ?? '')
      if (connectorId === 'shell') {
        send(res, 200, { connectorId, permissions: getShellPermissions() })
        return
      }
      if (connectorId === 'git') {
        send(res, 200, { connectorId, permissions: getGitPermissions() })
        return
      }
      if (connectorId === 'safari' || connectorId === 'chrome') {
        send(res, 200, {
          connectorId,
          permissions: getWebBrowserPermissions(
            connectorId as WebBrowserConnectorId,
          ),
        })
        return
      }
      if (connectorId === 'fs') {
        const all = getConnectorPermissions()
        send(res, 200, {
          connectorId,
          permissions: all.fs ?? { folderScopes: [] },
        })
        return
      }
      if (isGenericConnector(connectorId) && loadConnectorManifest(connectorId)) {
        send(res, 200, {
          connectorId,
          permissions: getGenericPermissions(connectorId),
        })
        return
      }
      send(res, 404, { error: 'Unknown connector permissions' })
      return
    }

    if (
      method === 'PUT' &&
      pathname.match(/^\/connectors\/[^/]+\/permissions$/)
    ) {
      const connectorId = decodeURIComponent(pathname.split('/')[2] ?? '')
      const body = await readJson(req)
      const status =
        body.status === 'ask' ||
        body.status === 'granted' ||
        body.status === 'denied'
          ? body.status
          : undefined
      const folderScopes = Array.isArray(body.folderScopes)
        ? body.folderScopes.map(String)
        : undefined

      if (connectorId === 'shell') {
        const permissions = setShellPermissions({
          status,
          allowlist: Array.isArray(body.allowlist)
            ? body.allowlist.map(String)
            : undefined,
          folderScopes,
          network:
            typeof body.network === 'boolean' ? body.network : undefined,
          approvedCommands: Array.isArray(body.approvedCommands)
            ? body.approvedCommands.map(String)
            : undefined,
        })
        send(res, 200, { connectorId, permissions })
        return
      }
      if (connectorId === 'git') {
        const permissions = setGitPermissions({
          status,
          folderScopes,
          ...(typeof body.remoteOps === 'boolean'
            ? { remoteOps: body.remoteOps }
            : {}),
        })
        send(res, 200, { connectorId, permissions })
        return
      }
      if (connectorId === 'safari' || connectorId === 'chrome') {
        const permissions = setWebBrowserPermissions(
          connectorId as WebBrowserConnectorId,
          {
            status,
            folderScopes,
            urlHostAllowlist: Array.isArray(body.urlHostAllowlist)
              ? body.urlHostAllowlist.map(String)
              : undefined,
          },
        )
        send(res, 200, { connectorId, permissions })
        return
      }
      if (isGenericConnector(connectorId) && loadConnectorManifest(connectorId)) {
        const permissions = setGenericPermissions(
          connectorId,
          genericPermissionBody(body, status, folderScopes),
        )
        send(res, 200, { connectorId, permissions })
        return
      }
      send(res, 400, { error: 'Unknown connector permissions' })
      return
    }

    if (
      method === 'POST' &&
      pathname.match(/^\/connectors\/[^/]+\/permissions\/grant$/)
    ) {
      const connectorId = decodeURIComponent(pathname.split('/')[2] ?? '')
      const body = await readJson(req)
      const status =
        body.status === 'ask' ||
        body.status === 'granted' ||
        body.status === 'denied'
          ? body.status
          : undefined
      const folderScopes = Array.isArray(body.folderScopes)
        ? body.folderScopes.map(String)
        : undefined

      if (connectorId === 'shell') {
        const permissions = grantShellPermissions({
          status,
          allowlist: Array.isArray(body.allowlist)
            ? body.allowlist.map(String)
            : undefined,
          folderScopes,
          network:
            typeof body.network === 'boolean' ? body.network : undefined,
          approvedCommands: Array.isArray(body.approvedCommands)
            ? body.approvedCommands.map(String)
            : undefined,
        })
        send(res, 200, { connectorId, permissions })
        return
      }
      if (connectorId === 'git') {
        const permissions = grantGitPermissions({
          status,
          folderScopes,
          ...(typeof body.remoteOps === 'boolean'
            ? { remoteOps: body.remoteOps }
            : {}),
        })
        send(res, 200, { connectorId, permissions })
        return
      }
      if (connectorId === 'safari' || connectorId === 'chrome') {
        const permissions = grantWebBrowserPermissions(
          connectorId as WebBrowserConnectorId,
          {
            status,
            folderScopes,
            urlHostAllowlist: Array.isArray(body.urlHostAllowlist)
              ? body.urlHostAllowlist.map(String)
              : undefined,
          },
        )
        send(res, 200, { connectorId, permissions })
        return
      }
      if (isGenericConnector(connectorId) && loadConnectorManifest(connectorId)) {
        const permissions = grantGenericPermissions(
          connectorId,
          genericPermissionBody(body, status, folderScopes),
        )
        send(res, 200, { connectorId, permissions })
        return
      }
      send(res, 400, { error: 'Unknown connector for grant' })
      return
    }

    if (method === 'GET' && pathname.match(/^\/connectors\/[^/]+\/rules$/)) {
      const connectorId = decodeURIComponent(pathname.split('/')[2] ?? '')
      const rules = listRulesForConnector(connectorId).map(toUiRuleDef)
      send(res, 200, { connectorId, rules })
      return
    }

    if (method === 'GET' && pathname.match(/^\/connectors\/[^/]+\/rules\/[^/]+$/)) {
      const parts = pathname.split('/')
      const connectorId = decodeURIComponent(parts[2] ?? '')
      const ruleId = decodeURIComponent(parts[4] ?? '')
      const def = listRulesForConnector(connectorId).find((r) => r.id === ruleId)
      if (!def) {
        send(res, 404, { error: 'Rule not found' })
        return
      }
      const code = readRuleSource(connectorId, ruleId)
      send(res, 200, { rule: { ...toUiRuleDef(def), code } })
      return
    }

    if (method === 'POST' && pathname.match(/^\/connectors\/[^/]+\/rules$/)) {
      const connectorId = decodeURIComponent(pathname.split('/')[2] ?? '')
      const body = await readJson(req)
      const id = String(body.id ?? `rule-${Date.now().toString(36)}`)
      const code = String(body.code ?? '')
      if (!code.trim()) {
        send(res, 400, { error: 'code is required' })
        return
      }
      const rule = writeUserRule(connectorId, id, code)
      await initNativeFns()
      send(res, 201, { rule: toUiRuleDef(rule) })
      return
    }

    if (method === 'PUT' && pathname.match(/^\/connectors\/[^/]+\/rules\/[^/]+$/)) {
      const parts = pathname.split('/')
      const connectorId = decodeURIComponent(parts[2] ?? '')
      const ruleId = decodeURIComponent(parts[4] ?? '')
      const existing = listRulesForConnector(connectorId).find((r) => r.id === ruleId)
      if (!existing) {
        send(res, 404, { error: 'Rule not found' })
        return
      }
      if (existing.origin === 'builtin') {
        send(res, 403, { error: 'Built-in rules are read-only' })
        return
      }
      const body = await readJson(req)
      const code = String(body.code ?? readRuleSource(connectorId, ruleId) ?? '')
      const rule = writeUserRule(connectorId, ruleId, code)
      await initNativeFns()
      send(res, 200, { rule: toUiRuleDef(rule) })
      return
    }

    if (method === 'DELETE' && pathname.match(/^\/connectors\/[^/]+\/rules\/[^/]+$/)) {
      const parts = pathname.split('/')
      const connectorId = decodeURIComponent(parts[2] ?? '')
      const ruleId = decodeURIComponent(parts[4] ?? '')
      const ok = deleteUserRule(connectorId, ruleId)
      if (!ok) {
        send(res, 404, { error: 'Rule not found or not deletable' })
        return
      }
      await initNativeFns()
      send(res, 200, { ok: true })
      return
    }

    if (method === 'GET' && pathname === '/rules') {
      const rules = listConnectorIds().flatMap((connectorId) =>
        listRulesForConnector(connectorId).map(toUiRuleDef),
      )
      send(res, 200, { rules })
      return
    }

    if (method === 'GET' && pathname === '/logs') {
      send(res, 200, { logs: getDaemonState().logs })
      return
    }

    if (method === 'POST' && pathname.match(/^\/logs\/[^/]+\/undo$/)) {
      const logId = decodeURIComponent(pathname.split('/')[2] ?? '')
      try {
        const result = undoLogEntry(logId)
        send(res, 200, result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        send(res, 400, { error: message })
      }
      return
    }

    if (method === 'GET' && pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
      const unsub = subscribeEvents((event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      })
      req.on('close', () => {
        unsub()
      })
      return
    }

    if (method === 'GET' && pathname === '/config') {
      send(res, 200, loadConfig())
      return
    }

    if (method === 'PUT' && pathname === '/config') {
      const body = await readJson(req)
      const variables =
        body.variables && typeof body.variables === 'object'
          ? (body.variables as Record<string, string>)
          : undefined
      send(res, 200, saveConfig({ variables }))
      return
    }

    if (method === 'GET' && pathname === '/control') {
      send(res, 200, getControl())
      return
    }

    if (method === 'POST' && pathname === '/control') {
      const body = await readJson(req)
      send(res, 200, patchControl(body as Parameters<typeof patchControl>[0]))
      return
    }

    if (method === 'POST' && pathname === '/history/clear-older') {
      const body = await readJson(req)
      const days = Number(body.days ?? 0)
      clearHistoryOlderThanDays(days)
      send(res, 200, { ok: true })
      return
    }

    notFound(res)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    send(res, 500, { error: message })
  }
}
