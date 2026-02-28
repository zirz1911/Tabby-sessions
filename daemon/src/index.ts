import { SessionManager } from './daemon'
import { startIPCServer } from './ipc'

console.log('[tabby-session-daemon] starting...')

const manager = new SessionManager()
const server = startIPCServer(manager)

// Graceful shutdown
function shutdown(): void {
  console.log('[tabby-session-daemon] shutting down...')
  manager.killAll()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Keep process alive
process.on('uncaughtException', (err) => {
  console.error('[daemon] uncaughtException:', err)
})

console.log('[tabby-session-daemon] ready')
