import { SessionManager } from './daemon'
import { startIPCServer } from './ipc'
import { writePid, removePid, PID_FILE } from './pid'

console.log('[tabby-session-daemon] starting...')

const manager = new SessionManager()

function shutdown(): void {
  console.log('[tabby-session-daemon] shutting down...')
  manager.killAll()
  removePid()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

const server = startIPCServer(manager, shutdown)

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('uncaughtException', (err) => {
  console.error('[daemon] uncaughtException:', err)
})

console.log('[tabby-session-daemon] ready')
