import http from 'node:http'
import { handleRequest } from './api/routes.js'
import { loadConfig } from './config/load.js'
import { loadControl } from './control.js'
import { initNativeFns } from './natives/fnRegistry.js'
import { initNatives } from './natives/registry.js'
import { initFileLogger } from './log/fileLogger.js'
import { DAEMON_HOST, DAEMON_PORT, cacheDir, ensureEmmiDirs, emmiRoot, logsDir } from './paths.js'
import { seedIfNeeded } from './seed.js'
import { loadState } from './state/store.js'
import { startTriggerHost, stopTriggerHost } from './triggers/host.js'

ensureEmmiDirs()
initFileLogger()
seedIfNeeded()
loadConfig()
loadControl()
loadState()

const server = http.createServer((req, res) => {
  void handleRequest(req, res)
})

void Promise.all([initNatives(), initNativeFns()]).then(() => {
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[emmi-daemon] port ${DAEMON_PORT} already in use — quit the other Emmi daemon or set EMMI_PORT`,
      )
    } else {
      console.error('[emmi-daemon] failed to listen:', err.message)
    }
    process.exit(1)
  })
  server.listen(DAEMON_PORT, DAEMON_HOST, () => {
    console.log(
      `[emmi-daemon] listening on http://${DAEMON_HOST}:${DAEMON_PORT}`,
    )
    console.log(`[emmi-daemon] data ${emmiRoot()}`)
    console.log(`[emmi-daemon] logs ${logsDir()}`)
    console.log(`[emmi-daemon] cache ${cacheDir()}`)
    startTriggerHost()
  })
})

function shutdown() {
  stopTriggerHost()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
