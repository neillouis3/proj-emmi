import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { Cron } from 'croner'
import { loadAutomations } from '../config/load.js'
import { canStartRun, isAutomationPaused } from '../control.js'
import { expandPath } from '../paths.js'
import { runAutomation } from '../runner/runAutomation.js'
import type { AutomationConfig } from '../types.js'

type ScheduledJob = {
  automationId: string
  stop: () => void
}

const jobs: ScheduledJob[] = []
let started = false
let reloading = false

function triggerLabel(automation: AutomationConfig, kind: 'schedule' | 'watch') {
  if (kind === 'schedule') {
    const cron = automation.schedule?.cron?.trim()
    return cron ? `Schedule · ${cron}` : 'Schedule'
  }
  const paths = automation.watch?.paths ?? []
  if (paths.length === 1) return `Watch · ${paths[0]}`
  if (paths.length > 1) return `Watch · ${paths.length} folders`
  return 'Watch'
}

async function fireAutomation(
  automation: AutomationConfig,
  kind: 'schedule' | 'watch',
) {
  if (!automation.active) return
  if (isAutomationPaused()) {
    console.warn(
      `[emmi-triggers] skip ${automation.id}: automations paused`,
    )
    return
  }
  if (!canStartRun()) {
    console.warn(
      `[emmi-triggers] skip ${automation.id}: max concurrent runs`,
    )
    return
  }
  const source = triggerLabel(automation, kind)
  try {
    await runAutomation(automation.id, {
      mode: automation.defaultMode,
      triggerSource: source,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[emmi-triggers] ${automation.id} failed: ${message}`)
  }
}

function clearJobs() {
  while (jobs.length) {
    const job = jobs.pop()
    try {
      job?.stop()
    } catch {
      /* ignore */
    }
  }
}

function mountSchedule(automation: AutomationConfig) {
  const cron = automation.schedule?.cron?.trim()
  if (!cron) {
    console.warn(
      `[emmi-triggers] ${automation.id}: schedule missing cron`,
    )
    return
  }
  try {
    const job = new Cron(
      cron,
      {
        timezone: automation.schedule?.tz || undefined,
        protect: true,
      },
      () => {
        void fireAutomation(automation, 'schedule')
      },
    )
    jobs.push({
      automationId: automation.id,
      stop: () => job.stop(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `[emmi-triggers] invalid cron for ${automation.id}: ${message}`,
    )
  }
}

function mountWatch(automation: AutomationConfig) {
  const paths = (automation.watch?.paths ?? [])
    .map((p) => expandPath(p, {}))
    .filter(Boolean)
  if (!paths.length) {
    console.warn(`[emmi-triggers] ${automation.id}: watch missing paths`)
    return
  }
  const debounceMs = Math.max(0, automation.watch?.debounceMs ?? 500)
  let timer: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null

  const scheduleFire = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void fireAutomation(automation, 'watch')
    }, debounceMs)
  }

  try {
    watcher = chokidarWatch(paths, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: Math.min(debounceMs, 200),
        pollInterval: 50,
      },
    })
    watcher.on('add', scheduleFire)
    watcher.on('change', scheduleFire)
    // Ignore unlink so move/route workflows don't re-fire when files leave the folder.
    watcher.on('error', (err) => {
      console.warn(
        `[emmi-triggers] watch error ${automation.id}:`,
        err instanceof Error ? err.message : err,
      )
    })
    jobs.push({
      automationId: automation.id,
      stop: () => {
        if (timer) clearTimeout(timer)
        void watcher?.close()
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `[emmi-triggers] could not watch ${automation.id}: ${message}`,
    )
  }
}

function mountAll() {
  clearJobs()
  const automations = loadAutomations().filter((a) => a.active)
  for (const automation of automations) {
    if (automation.trigger === 'schedule') mountSchedule(automation)
    else if (automation.trigger === 'watch') mountWatch(automation)
  }
  const n = jobs.length
  if (n) {
    console.log(`[emmi-triggers] armed ${n} trigger(s)`)
  }
}

export function startTriggerHost() {
  if (started) {
    reloadTriggerHost()
    return
  }
  started = true
  mountAll()
}

export function stopTriggerHost() {
  clearJobs()
  started = false
}

export function reloadTriggerHost() {
  if (!started) return
  if (reloading) return
  reloading = true
  try {
    mountAll()
  } finally {
    reloading = false
  }
}
