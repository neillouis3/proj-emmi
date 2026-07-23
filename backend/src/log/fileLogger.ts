import fs from 'node:fs'
import path from 'node:path'
import { logsDir } from '../paths.js'

const LOG_FILE = 'daemon.log'
const MAX_BYTES = 5 * 1024 * 1024

let logPath = ''
let stream: fs.WriteStream | null = null

function rotateIfNeeded() {
  if (!logPath || !fs.existsSync(logPath)) return
  const size = fs.statSync(logPath).size
  if (size < MAX_BYTES) return
  const rotated = `${logPath}.${new Date().toISOString().replace(/[:.]/g, '-')}`
  fs.renameSync(logPath, rotated)
  stream?.end()
  stream = fs.createWriteStream(logPath, { flags: 'a' })
}

function write(level: string, args: unknown[]) {
  if (!stream) return
  const line = `[${new Date().toISOString()}] ${level} ${args.map(formatArg).join(' ')}\n`
  rotateIfNeeded()
  stream.write(line)
}

function formatArg(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Append daemon diagnostics to ~/Library/Logs/Emmi/daemon.log (platform equivalent). */
export function initFileLogger() {
  fs.mkdirSync(logsDir(), { recursive: true })
  logPath = path.join(logsDir(), LOG_FILE)
  stream = fs.createWriteStream(logPath, { flags: 'a' })

  const wrap =
    (level: string, original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      write(level, args)
      original(...args)
    }

  console.log = wrap('INFO', console.log.bind(console))
  console.warn = wrap('WARN', console.warn.bind(console))
  console.error = wrap('ERROR', console.error.bind(console))
}
