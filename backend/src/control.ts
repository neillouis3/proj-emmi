import fs from 'node:fs'
import path from 'node:path'
import { emmiRoot } from './paths.js'

export type ControlState = {
  pausedAsleep: boolean
  pausedBattery: boolean
  pauseWhenAsleep: boolean
  pauseOnBattery: boolean
  maxConcurrentRuns: number
  keepDetailedLogs: boolean
  verboseDaemonLogs: boolean
  requireReviewForDeletes: boolean
}

const DEFAULT_CONTROL: ControlState = {
  pausedAsleep: false,
  pausedBattery: false,
  pauseWhenAsleep: true,
  pauseOnBattery: false,
  maxConcurrentRuns: 3,
  keepDetailedLogs: true,
  verboseDaemonLogs: false,
  requireReviewForDeletes: true,
}

let control: ControlState = { ...DEFAULT_CONTROL }
let activeRuns = 0

function controlPath() {
  return path.join(emmiRoot(), 'runtime-control.json')
}

export function loadControl() {
  try {
    const raw = JSON.parse(fs.readFileSync(controlPath(), 'utf8')) as Partial<ControlState>
    control = { ...DEFAULT_CONTROL, ...raw }
  } catch {
    control = { ...DEFAULT_CONTROL }
  }
  return control
}

export function getControl() {
  return control
}

export function patchControl(partial: Partial<ControlState>) {
  control = { ...control, ...partial }
  try {
    fs.mkdirSync(emmiRoot(), { recursive: true })
    const tmp = `${controlPath()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(control, null, 2))
    fs.renameSync(tmp, controlPath())
  } catch {
    /* ignore */
  }
  return control
}

export function isAutomationPaused() {
  if (control.pauseWhenAsleep && control.pausedAsleep) return true
  if (control.pauseOnBattery && control.pausedBattery) return true
  return false
}

export function canStartRun() {
  if (isAutomationPaused()) return false
  const max = Math.max(1, control.maxConcurrentRuns || 1)
  return activeRuns < max
}

export function beginRun() {
  activeRuns += 1
}

export function endRun() {
  activeRuns = Math.max(0, activeRuns - 1)
}

export function activeRunCount() {
  return activeRuns
}
