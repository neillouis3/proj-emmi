import { loadAutomation, loadConfig } from '../config/load.js'
import {
  beginRun,
  canStartRun,
  endRun,
  getControl,
  isAutomationPaused,
} from '../control.js'
import { emitEvent } from '../events.js'
import {
  addLog,
  addPending,
  getPending,
  removePending,
  uid,
  upsertRun,
} from '../state/store.js'
import { nativeFnRegistry } from '../natives/fnRegistry.js'
import {
  clearRuleRunContext,
  setRuleRunContext,
  takeMoves,
} from '../rules/context.js'
import { getToolAsNativeRunner as getTool } from '../natives/registry.js'
import { executeScript } from '../script/execute.js'
import { parseScript } from '../script/parse.js'
import type { Statement } from '../script/ast.js'
import { toolConnectorMap } from '../rules/catalog.js'
import { BrowserPermissionError } from '../connectors/browserPolicy.js'
import { GitPermissionError } from '../connectors/gitPolicy.js'
import { ShellPermissionError } from '../connectors/shellPolicy.js'
import {
  grantGitPermissions,
  grantShellPermissions,
  grantWebBrowserPermissions,
  getShellPermissions,
  type WebBrowserConnectorId,
} from '../connectors/permissions.js'
import {
  humanizePlan,
  planLooksUndoable,
  trustNoteForPending,
} from '../review/planCopy.js'
import type {
  AutomationConfig,
  PendingAction,
  RunMode,
  RunRecord,
  ToolContext,
} from '../types.js'

export type RunOptions = {
  dryRun?: boolean
  mode?: RunMode
  /** Display label for pending/log trigger, e.g. Schedule · 0 * * * * */
  triggerSource?: string
}

const BARE_CONNECTOR: Record<string, string> = {
  exec: 'shell',
  script: 'shell',
  status: 'git',
  diff: 'git',
  gitLog: 'git',
  branch: 'git',
  init: 'git',
  add: 'git',
  commit: 'git',
  checkout: 'git',
  pull: 'git',
  push: 'git',
}

function connectorFromTool(tool: string) {
  if (!tool.includes('.')) {
    // Built-in bare tools first; fall back to pack manifests for new connectors.
    return BARE_CONNECTOR[tool] ?? toolConnectorMap()[tool] ?? 'fs'
  }
  return tool.split('.')[0] || 'fs'
}

function automationConnectorId(automation: AutomationConfig) {
  for (const step of automation.steps) {
    const id = connectorFromTool(step.tool)
    if (id !== 'fs') return id
  }
  const script = automation.script ?? ''
  if (/\b(?:exec|script)\s*\(/.test(script)) return 'shell'
  if (
    /\b(?:status|diff|gitLog|branch|init|add|commit|checkout|pull|push)\s*\(/.test(script)
  ) {
    return 'git'
  }
  if (/\bsafari\.(?:browse|tabs|navigate|pageRead|pageShot|wait|pageText|query|click|type|fill|eval|tab)\s*\(/.test(script)) {
    return 'safari'
  }
  if (
    /\bchrome\.(?:browse|tabs|navigate|pageRead|pageShot|wait|pageText|query|click|type|fill|eval|tab)\s*\(/.test(
      script,
    )
  ) {
    return 'chrome'
  }
  return connectorFromTool(automation.steps[0]?.tool ?? 'fs')
}

function collectScriptFns(stmts: Statement[], out: Set<string>) {
  for (const s of stmts) {
    if (s.type === 'call' || s.type === 'assign') out.add(s.fn)
    else if (s.type === 'if') {
      collectScriptFns(s.body, out)
      if (s.elseBody) collectScriptFns(s.elseBody, out)
    } else if (s.type === 'for' || s.type === 'retry') {
      collectScriptFns(s.body, out)
    } else if (s.type === 'try') {
      collectScriptFns(s.body, out)
      collectScriptFns(s.catchBody, out)
    }
  }
}

/**
 * Every connector an automation touches (steps + parsed script). Used to hide
 * automations whose connector/pack has been uninstalled. Dotted tool names in
 * the DSL are always connector.tool calls, so parsing is collision-free.
 */
export function automationConnectorIds(automation: AutomationConfig): string[] {
  const ids = new Set<string>()
  for (const step of automation.steps) ids.add(connectorFromTool(step.tool))
  if (automation.script) {
    try {
      const fns = new Set<string>()
      collectScriptFns(parseScript(automation.script), fns)
      for (const fn of fns) ids.add(connectorFromTool(fn))
    } catch {
      /* unparseable script — rely on steps */
    }
  }
  return [...ids]
}

function pendingShellGrant(
  automation: AutomationConfig,
  runId: string,
  err: ShellPermissionError,
): PendingAction {
  const cmd = err.command || 'command'
  const grantKind = 'shell' as const
  return {
    id: uid('p'),
    createdAt: new Date().toISOString(),
    title: automation.name,
    trigger: `Needs shell access · ${automation.name}`,
    action: `Allow “${cmd}” once`,
    reasoning:
      err.message ||
      `This automation wants to run “${cmd}”. Approving adds it to your shell allowlist.`,
    connectorId: 'shell',
    automationId: automation.id,
    editableAction: `Allow “${cmd}” once`,
    files: [],
    shellCommand: cmd,
    runId,
    plan: [
      `Add “${cmd}” to the shell allowlist`,
      `Continue running ${automation.name}`,
    ],
    undoable: false,
    grantKind,
    trustNote: trustNoteForPending({
      connectorId: 'shell',
      undoable: false,
      grantKind,
    }),
  }
}

function pendingConnectorGrant(
  automation: AutomationConfig,
  runId: string,
  connectorId: 'git' | WebBrowserConnectorId,
  err: { message: string },
): PendingAction {
  const label =
    connectorId === 'git'
      ? 'Git'
      : connectorId === 'chrome'
        ? 'Chrome'
        : 'Safari'
  const grantKind = connectorId
  const what =
    connectorId === 'git'
      ? 'read and write repos under your Git folder scopes'
      : `control ${label} tabs on this Mac`
  return {
    id: uid('p'),
    createdAt: new Date().toISOString(),
    title: automation.name,
    trigger: `Needs ${label} access · ${automation.name}`,
    action: `Allow ${label}`,
    reasoning:
      err.message ||
      `${automation.name} needs permission to ${what}.`,
    connectorId,
    automationId: automation.id,
    editableAction: `Allow ${label}`,
    files: [],
    runId,
    plan: [
      `Allow Emmi to use ${label}`,
      `Continue running ${automation.name}`,
    ],
    undoable: false,
    grantKind,
    trustNote: trustNoteForPending({
      connectorId,
      undoable: false,
      grantKind,
    }),
  }
}

function automationHasDelete(automation: AutomationConfig) {
  if (automation.steps.some((s) => /delete/i.test(s.tool))) return true
  return /\.delete\b/i.test(automation.script ?? '')
}

async function executeSteps(
  automation: AutomationConfig,
  ctx: ToolContext,
  fromIndex = 0,
) {
  setRuleRunContext({
    runId: ctx.runId,
    automationName: automation.name,
    connectorId: automationConnectorId(automation),
    dryRun: ctx.dryRun,
  })
  try {
    const stepResults: RunRecord['stepResults'] = []
    for (let i = fromIndex; i < automation.steps.length; i++) {
      const step = automation.steps[i]
      const tool = getTool(step.tool)
      if (!tool) {
        stepResults.push({
          tool: step.tool,
          ok: false,
          summary: `Unknown tool: ${step.tool}`,
        })
        return { ok: false as const, stepResults, error: `Unknown tool: ${step.tool}` }
      }
      const result = await tool.run(step.with ?? {}, ctx)
      stepResults.push({
        tool: step.tool,
        ok: result.ok,
        summary: result.summary,
      })
      if (!result.ok) {
        return { ok: false as const, stepResults, error: result.summary }
      }
    }
    return { ok: true as const, stepResults }
  } finally {
    clearRuleRunContext()
  }
}

export async function runAutomation(id: string, opts: RunOptions = {}) {
  const automation = loadAutomation(id)
  if (!automation) throw new Error(`Automation not found: ${id}`)
  if (!automation.active) throw new Error(`Automation is paused: ${id}`)

  if (isAutomationPaused()) {
    throw new Error('Automations are paused (sleep or battery policy)')
  }
  if (!canStartRun()) {
    throw new Error('Max concurrent runs reached')
  }
  beginRun()

  const config = loadConfig()
  let mode = opts.mode ?? automation.defaultMode
  if (
    getControl().requireReviewForDeletes &&
    mode === 'auto' &&
    automationHasDelete(automation)
  ) {
    mode = 'review'
  }
  const dryRun = opts.dryRun ?? mode !== 'auto'
  const runId = uid('run')
  const startedAt = new Date().toISOString()

  const run: RunRecord = {
    id: runId,
    automationId: automation.id,
    automationName: automation.name,
    startedAt,
    mode,
    dryRun,
    status: 'running',
    matchedFiles: [],
    stepResults: [],
  }
  upsertRun(run)
  emitEvent('run:started', { runId, automationId: id })

  try {
    return await runAutomationBody(automation, opts, config, run, runId, mode, dryRun)
  } finally {
    endRun()
  }
}

async function runAutomationBody(
  automation: NonNullable<ReturnType<typeof loadAutomation>>,
  opts: RunOptions,
  config: ReturnType<typeof loadConfig>,
  run: RunRecord,
  runId: string,
  mode: RunMode,
  dryRun: boolean,
) {
  const id = automation.id
  const triggerSource =
    opts.triggerSource?.trim() || `Manual run · ${automation.name}`

  // Prefer script (native call sequence) when present.
  if (automation.script?.trim()) {
    return runScriptAutomation(automation, {
      run,
      runId,
      mode,
      dryRun: opts.dryRun === true,
      variables: config.variables,
      triggerSource,
    })
  }

  const ctx: ToolContext = {
    dryRun: true, // always dry first to gather matches / plan
    variables: config.variables,
    matchedFiles: [],
    runId,
  }

  // Run match (+ notify planning) in dry mode first
  const plan = await executeSteps(automation, ctx, 0)
  run.matchedFiles = [...ctx.matchedFiles]
  run.stepResults = plan.stepResults

  if (!plan.ok) {
    run.status = 'failed'
    run.error = plan.error
    run.finishedAt = new Date().toISOString()
    run.summary = plan.error
    upsertRun(run)
    addLog({
      automationName: automation.name,
      summary: `${automation.name} — failed`,
      action: plan.error ?? 'Failed',
      connectorId: automationConnectorId(automation),
      success: false,
      reversible: false,
      error: plan.error,
      runId,
    })
    emitEvent('run:failed', { runId, error: plan.error })
    return { runId, mode, run, pending: null }
  }

  const moveStep = automation.steps.find((s) => s.tool === 'fs.move')
  const dest = moveStep ? String(moveStep.with?.dest ?? '') : ''
  const routed = ctx.fileDestinations && Object.keys(ctx.fileDestinations).length > 0
  const needsReview = mode === 'review' || mode === 'ask'
  const SIDE_STEP =
    /^(?:move|copy|delete|rename|mkdir|write|route|exec|script|fail)$|\.(?:browse|navigate|click|type|fill|eval|pageShot|tab|wait|exec|script|move|delete|mkdir|write)\b/
  const stepSideEffects = automation.steps.some((s) => SIDE_STEP.test(s.tool))

  if (needsReview && (ctx.matchedFiles.length > 0 || stepSideEffects)) {
    const count = ctx.matchedFiles.length
    const rawSummaries = plan.stepResults.map(
      (s) => s.summary || `${s.tool}(...)`,
    )
    const checklist = humanizePlan(
      rawSummaries.map((s) =>
        s.includes('(') ? s : s.includes('.') ? `${s}(...)` : `${s}(...)`,
      ),
    )
    // Prefer tool ids when summaries are opaque
    const fromTools = humanizePlan(
      automation.steps.map((s) =>
        s.tool.includes('.') || !s.tool.includes('(')
          ? `${s.tool}(...)`
          : s.tool,
      ),
    )
    const planLines = checklist.length ? checklist : fromTools
    const undoable =
      count > 0 &&
      planLooksUndoable(
        automation.steps.map((s) => s.tool),
        ctx.matchedFiles,
      )
    const action =
      count > 0
        ? routed
          ? `Review ${count} file${count === 1 ? '' : 's'} then route`
          : dest
            ? `Review ${count} file${count === 1 ? '' : 's'} then move`
            : `Review ${count} file${count === 1 ? '' : 's'} then run`
        : `Review ${planLines.length} step${planLines.length === 1 ? '' : 's'} then run`
    const pending: PendingAction = {
      id: uid('p'),
      createdAt: new Date().toISOString(),
      title: automation.name,
      trigger: triggerSource,
      action,
      reasoning:
        count > 0
          ? ctx.matchedFiles.map((f) => f.split('/').pop()).join(', ')
          : planLines.join('\n'),
      connectorId: automationConnectorId(automation),
      automationId: automation.id,
      editableAction: routed
        ? action
        : dest
          ? `Move to ${dest}`
          : plan.stepResults.at(-1)?.summary ?? automation.name,
      files: [...ctx.matchedFiles],
      dest: dest || undefined,
      fileDestinations: routed ? { ...ctx.fileDestinations } : undefined,
      runId,
      plan: planLines,
      undoable,
      trustNote: trustNoteForPending({
        connectorId: automationConnectorId(automation),
        undoable,
      }),
    }
    addPending(pending)
    run.status = 'pending'
    run.pendingId = pending.id
    run.finishedAt = new Date().toISOString()
    run.summary =
      count > 0
        ? `Pending review · ${ctx.matchedFiles.length} file(s)`
        : `Pending review · ${automation.steps.length} step(s)`
    upsertRun(run)
    emitEvent('run:pending', { runId, pendingId: pending.id })
    return { runId, mode, run, pending }
  }

  // Auto (or empty match): apply for real
  const applyCtx: ToolContext = {
    dryRun: dryRun && mode === 'auto' ? false : Boolean(opts.dryRun),
    variables: config.variables,
    matchedFiles: [...ctx.matchedFiles],
    fileDestinations: ctx.fileDestinations
      ? { ...ctx.fileDestinations }
      : undefined,
    runId,
  }
  // For auto mode, force apply
  applyCtx.dryRun = opts.dryRun === true ? true : false

  const applied = await executeSteps(automation, applyCtx, 0)
  run.stepResults = applied.stepResults
  run.matchedFiles = [...applyCtx.matchedFiles]
  run.finishedAt = new Date().toISOString()

  if (!applied.ok) {
    run.status = 'failed'
    run.error = applied.error
    run.summary = applied.error
    upsertRun(run)
    addLog({
      automationName: automation.name,
      summary: `${automation.name} — failed`,
      action: applied.error ?? 'Failed',
      connectorId: automationConnectorId(automation),
      success: false,
      reversible: false,
      error: applied.error,
      runId,
    })
    emitEvent('run:failed', { runId, error: applied.error })
    return { runId, mode, run, pending: null }
  }

  const notify = applied.stepResults.find((s) => s.tool === 'fs.notify')
  const summary =
    notify?.summary ??
    `Ran ${automation.steps.length} steps` +
      (applyCtx.matchedFiles.length
        ? ` · ${applyCtx.matchedFiles.length} files`
        : '')

  run.status = 'completed'
  run.summary = summary
  const moves = takeMoves(runId)
  run.moves = moves
  upsertRun(run)
  addLog({
    automationName: automation.name,
    summary: `${automation.name} — completed`,
    action: summary,
    connectorId: automationConnectorId(automation),
    success: true,
    reversible: moves.length > 0,
    runId,
    moves,
  })
  emitEvent('run:completed', { runId, summary })
  return { runId, mode, run, pending: null }
}

async function runScriptAutomation(
  automation: AutomationConfig,
  opts: {
    run: RunRecord
    runId: string
    mode: RunMode
    dryRun: boolean
    variables: Record<string, string>
    triggerSource?: string
  },
) {
  const { run, runId, mode } = opts
  const registry = nativeFnRegistry()
  const script = automation.script!.trim()
  const triggerSource =
    opts.triggerSource?.trim() || `Manual run · ${automation.name}`

  const connectorId = automationConnectorId(automation)

  setRuleRunContext({
    runId,
    automationName: automation.name,
    connectorId,
    dryRun: true,
  })

  try {
    const plan = await executeScript(script, registry, {
      dryRun: true,
      scope: { variables: opts.variables },
    })
    run.matchedFiles = plan.matchedFiles
    run.stepResults = plan.summaries.map((summary) => ({
      tool: 'script',
      ok: true,
      summary,
    }))

    const needsReview = mode === 'review' || mode === 'ask'
    if (
      needsReview &&
      (plan.matchedFiles.length > 0 || plan.hasSideEffects)
    ) {
      const count = plan.matchedFiles.length
      const checklist = humanizePlan(plan.summaries)
      const undoable = planLooksUndoable(plan.summaries, plan.matchedFiles)
      const pending: PendingAction = {
        id: uid('p'),
        createdAt: new Date().toISOString(),
        title: automation.name,
        trigger: triggerSource,
        action:
          count > 0
            ? `Review ${count} file${count === 1 ? '' : 's'} then run`
            : `Review ${checklist.length || plan.summaries.length} step${(checklist.length || plan.summaries.length) === 1 ? '' : 's'} then run`,
        reasoning:
          count > 0
            ? plan.matchedFiles.map((f) => f.split('/').pop()).join(', ')
            : checklist.join('\n'),
        connectorId,
        automationId: automation.id,
        editableAction: count > 0 ? 'Move to…' : automation.name,
        files: [...plan.matchedFiles],
        runId,
        plan: checklist,
        undoable,
        trustNote: trustNoteForPending({ connectorId, undoable }),
      }
      addPending(pending)
      run.status = 'pending'
      run.pendingId = pending.id
      run.finishedAt = new Date().toISOString()
      run.summary =
        count > 0
          ? `Pending review · ${count} file(s)`
          : `Pending review · ${plan.summaries.length} step(s)`
      upsertRun(run)
      emitEvent('run:pending', { runId, pendingId: pending.id })
      return { runId, mode, run, pending }
    }

    if (opts.dryRun) {
      run.status = 'completed'
      run.summary = plan.matchedFiles.length
        ? `Dry run · ${plan.matchedFiles.length} file(s)`
        : `Dry run · ${plan.summaries.length} step(s)`
      run.finishedAt = new Date().toISOString()
      upsertRun(run)
      emitEvent('run:completed', { runId, summary: run.summary })
      return { runId, mode, run, pending: null }
    }

    setRuleRunContext({
      runId,
      automationName: automation.name,
      connectorId,
      dryRun: false,
    })
    const applied = await executeScript(script, registry, {
      dryRun: false,
      scope: { variables: opts.variables },
    })
    run.matchedFiles = applied.matchedFiles
    run.stepResults = applied.summaries.map((summary) => ({
      tool: 'script',
      ok: true,
      summary,
    }))
    const moves = takeMoves(runId)
    run.moves = moves
    run.status = 'completed'
    const fileCount = moves.length || applied.matchedFiles.length
    run.summary = fileCount
      ? `Ran script · ${fileCount} file(s)`
      : `Ran script · ${applied.summaries.length} step(s)`
    run.finishedAt = new Date().toISOString()
    upsertRun(run)
    addLog({
      automationName: automation.name,
      summary: `${automation.name} — completed`,
      action: run.summary,
      connectorId,
      success: true,
      reversible: moves.length > 0,
      runId,
      moves,
    })
    emitEvent('run:completed', { runId, summary: run.summary })
    return { runId, mode, run, pending: null }
  } catch (err) {
    if (err instanceof ShellPermissionError && err.needsGrant) {
      const pending = pendingShellGrant(automation, runId, err)
      addPending(pending)
      run.status = 'pending'
      run.pendingId = pending.id
      run.finishedAt = new Date().toISOString()
      run.summary = pending.action
      upsertRun(run)
      emitEvent('run:pending', { runId, pendingId: pending.id })
      return { runId, mode, run, pending }
    }
    if (err instanceof GitPermissionError && err.needsGrant) {
      const pending = pendingConnectorGrant(automation, runId, 'git', err)
      addPending(pending)
      run.status = 'pending'
      run.pendingId = pending.id
      run.finishedAt = new Date().toISOString()
      run.summary = pending.action
      upsertRun(run)
      emitEvent('run:pending', { runId, pendingId: pending.id })
      return { runId, mode, run, pending }
    }
    if (err instanceof BrowserPermissionError && err.needsGrant) {
      const pending = pendingConnectorGrant(
        automation,
        runId,
        err.connectorId,
        err,
      )
      addPending(pending)
      run.status = 'pending'
      run.pendingId = pending.id
      run.finishedAt = new Date().toISOString()
      run.summary = pending.action
      upsertRun(run)
      emitEvent('run:pending', { runId, pendingId: pending.id })
      return { runId, mode, run, pending }
    }
    const message = err instanceof Error ? err.message : String(err)
    run.status = 'failed'
    run.error = message
    run.summary = message
    run.finishedAt = new Date().toISOString()
    upsertRun(run)
    addLog({
      automationName: automation.name,
      summary: `${automation.name} — failed`,
      action: message,
      connectorId,
      success: false,
      reversible: false,
      error: message,
      runId,
    })
    emitEvent('run:failed', { runId, error: message })
    return { runId, mode, run, pending: null }
  } finally {
    clearRuleRunContext()
  }
}

export async function approvePending(pendingId: string) {
  const pending = getPending(pendingId)
  if (!pending) throw new Error(`Pending not found: ${pendingId}`)
  if (!pending.automationId) {
    removePending(pendingId)
    throw new Error('Pending has no automation to execute')
  }

  const automation = loadAutomation(pending.automationId)
  if (!automation) throw new Error('Automation missing for pending item')

  const config = loadConfig()
  const runId = pending.runId ?? uid('run')

  if (pending.shellCommand || pending.grantKind === 'shell') {
    const current = getShellPermissions()
    const cmd = pending.shellCommand
    if (cmd) {
      const nextAllow = [...new Set([...current.allowlist, cmd])]
      grantShellPermissions({
        status: 'granted',
        allowlist: nextAllow,
      })
    }
  }
  if (
    pending.grantKind === 'git' ||
    (pending.connectorId === 'git' && /^Allow git/i.test(pending.action))
  ) {
    grantGitPermissions({ status: 'granted' })
  }
  if (
    pending.grantKind === 'safari' ||
    pending.grantKind === 'chrome' ||
    ((pending.connectorId === 'safari' || pending.connectorId === 'chrome') &&
      /^Allow (safari|chrome|Safari|Chrome)/i.test(pending.action))
  ) {
    const id =
      pending.grantKind === 'safari' || pending.grantKind === 'chrome'
        ? pending.grantKind
        : (pending.connectorId as WebBrowserConnectorId)
    grantWebBrowserPermissions(id, { status: 'granted' })
  }

  if (automation.script?.trim()) {
    setRuleRunContext({
      runId,
      automationName: automation.name,
      connectorId: pending.connectorId,
      dryRun: false,
    })
    try {
      const applied = await executeScript(automation.script, nativeFnRegistry(), {
        dryRun: false,
        scope: { variables: config.variables },
      })
      const moves = takeMoves(runId)
      removePending(pendingId)
      const fileCount = moves.length || applied.matchedFiles.length
      const summary = fileCount
        ? `Ran script · ${fileCount} file(s)`
        : `Ran script · ${applied.summaries.length} step(s)`
      const run: RunRecord = {
        id: runId,
        automationId: automation.id,
        automationName: automation.name,
        startedAt: pending.createdAt,
        finishedAt: new Date().toISOString(),
        mode: 'review',
        dryRun: false,
        status: 'completed',
        summary,
        matchedFiles: pending.files,
        moves,
        stepResults: applied.summaries.map((s) => ({
          tool: 'script',
          ok: true,
          summary: s,
        })),
        pendingId,
      }
      upsertRun(run)
      addLog({
        automationName: automation.name,
        summary: `${automation.name} — completed`,
        action: summary,
        connectorId: pending.connectorId,
        success: true,
        reversible: moves.length > 0,
        runId,
        moves,
      })
      emitEvent('pending:approved', { pendingId, runId })
      emitEvent('run:completed', { runId, summary })
      return { run, pending }
    } finally {
      clearRuleRunContext()
    }
  }

  const ctx: ToolContext = {
    dryRun: false,
    variables: config.variables,
    matchedFiles: [...pending.files],
    fileDestinations: pending.fileDestinations
      ? { ...pending.fileDestinations }
      : undefined,
    runId,
  }

  // If editable action changed dest: "Move to …"
  const destMatch = pending.editableAction.match(/Move to\s+(.+)$/i)
  const dest = destMatch?.[1]?.trim() || pending.dest

  setRuleRunContext({
    runId,
    automationName: automation.name,
    connectorId: pending.connectorId,
    dryRun: false,
  })
  try {
    // Apply using reviewed files (skip rematch; rebuild route if destinations missing)
    const stepResults: RunRecord['stepResults'] = []
    for (const step of automation.steps) {
    if (step.tool === 'fs.match') {
      stepResults.push({
        tool: step.tool,
        ok: true,
        summary: `Using ${pending.files.length} reviewed files`,
      })
      continue
    }
    if (
      (step.tool === 'core.lookup' ||
        step.tool === 'core.extract' ||
        step.tool === 'fs.route') &&
      ctx.fileDestinations
    ) {
      stepResults.push({
        tool: step.tool,
        ok: true,
        summary: `Using chained destinations for ${pending.files.length} files`,
      })
      continue
    }
    const tool = getTool(step.tool)
    if (!tool) {
      throw new Error(`Unknown tool: ${step.tool}`)
    }
    const params =
      step.tool === 'fs.move'
        ? {
            ...step.with,
            ...(dest && !ctx.fileDestinations ? { dest } : {}),
            files: pending.files,
          }
        : (step.with ?? {})
    const result = await tool.run(params, ctx)
    stepResults.push({ tool: step.tool, ok: result.ok, summary: result.summary })
    if (!result.ok) throw new Error(result.summary)
    }

    removePending(pendingId)

    const summary =
      stepResults.find((s) => s.tool === 'fs.notify')?.summary ??
      `Moved ${pending.files.length} files`

    const moves = takeMoves(runId)
    const run: RunRecord = {
      id: runId,
      automationId: automation.id,
      automationName: automation.name,
      startedAt: pending.createdAt,
      finishedAt: new Date().toISOString(),
      mode: 'review',
      dryRun: false,
      status: 'completed',
      summary,
      matchedFiles: pending.files,
      moves,
      stepResults,
      pendingId,
    }
    upsertRun(run)
    addLog({
      automationName: automation.name,
      summary: `${automation.name} — completed`,
      action: summary,
      connectorId: pending.connectorId,
      success: true,
      reversible: moves.length > 0,
      runId,
      moves,
    })
    emitEvent('pending:approved', { pendingId, runId })
    emitEvent('run:completed', { runId, summary })
    return { run, pending }
  } finally {
    clearRuleRunContext()
  }
}

export function rejectPending(pendingId: string) {
  const pending = getPending(pendingId)
  if (!pending) throw new Error(`Pending not found: ${pendingId}`)
  removePending(pendingId)
  if (pending.runId) {
    upsertRun({
      id: pending.runId,
      automationId: pending.automationId ?? '',
      automationName: pending.title,
      startedAt: pending.createdAt,
      finishedAt: new Date().toISOString(),
      mode: 'review',
      dryRun: true,
      status: 'rejected',
      summary: 'Rejected',
      matchedFiles: pending.files,
      stepResults: [],
      pendingId,
    })
  }
  addLog({
    automationName: pending.title,
    summary: `${pending.title} — rejected`,
    action: pending.action,
    connectorId: pending.connectorId,
    success: false,
    reversible: false,
    runId: pending.runId,
  })
  emitEvent('pending:rejected', { pendingId })
  return pending
}
