import * as net from 'net'
import { Command, DaemonEvent, PIPE_NAME } from './protocol'
import { SessionManager } from './daemon'
import { killOldDaemon, writePid, PID_FILE } from './pid'

// Framing: each JSON message ends with newline \n
function send(socket: net.Socket, event: DaemonEvent): void {
  if (!socket.destroyed) {
    socket.write(JSON.stringify(event) + '\n')
  }
}

export function startIPCServer(manager: SessionManager, shutdown: () => void): net.Server {
  const server = net.createServer((socket) => {
    console.log('[ipc] client connected')

    let buf = ''
    const detachFns: (() => void)[] = []

    socket.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? '' // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const cmd = JSON.parse(line) as Command
          handleCommand(cmd, socket, manager, detachFns, shutdown)
        } catch {
          send(socket, { type: 'error', message: 'Invalid JSON' })
        }
      }
    })

    socket.on('close', () => {
      console.log('[ipc] client disconnected')
      for (const fn of detachFns) fn()
    })

    socket.on('error', (err) => {
      console.error('[ipc] socket error:', err.message)
    })
  })

  const onListening = () => {
    writePid()
    console.log(`[ipc] listening on ${PIPE_NAME} (pid=${process.pid} → ${PID_FILE})`)
  }

  const doListen = () => {
    server.once('listening', onListening)
    server.listen(PIPE_NAME)
  }

  doListen()

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Remove the pending once-listener before retry to avoid double-fire
      server.removeListener('listening', onListening)
      console.log('[ipc] pipe already in use — attempting to recover...')
      const killed = killOldDaemon()
      if (killed) {
        // Give the old process ~800ms to release the pipe, then retry
        setTimeout(() => {
          console.log('[ipc] retrying listen...')
          doListen()
        }, 800)
      } else {
        console.error('[ipc] EADDRINUSE — no PID file found, cannot auto-recover.')
        console.error('[ipc] Run: taskkill /F /FI "IMAGENAME eq node.exe"  (or kill the old daemon manually)')
        process.exit(1)
      }
    } else {
      console.error('[ipc] server error:', err.message)
      process.exit(1)
    }
  })

  return server
}

function handleCommand(
  cmd: Command,
  socket: net.Socket,
  manager: SessionManager,
  detachFns: (() => void)[],
  shutdown: () => void,
): void {
  switch (cmd.cmd) {
    case 'list': {
      send(socket, { type: 'sessions', sessions: manager.list() })
      break
    }

    case 'create': {
      const session = manager.create({
        name: cmd.name,
        shell: cmd.shell,
        cwd: cmd.cwd,
        cols: cmd.cols,
        rows: cmd.rows,
      })
      send(socket, { type: 'created', session: session.toInfo() })
      break
    }

    case 'attach': {
      const session = manager.get(cmd.id)
      if (!session) {
        send(socket, { type: 'error', message: `Session not found: ${cmd.id}` })
        return
      }
      send(socket, { type: 'attached', id: session.id, buffer: session.buffer })

      const offData = session.onData((data) => {
        send(socket, { type: 'output', id: session.id, data })
      })
      const offExit = session.onExit((code) => {
        send(socket, { type: 'exit', id: session.id, code })
      })

      detachFns.push(offData, offExit)
      break
    }

    case 'detach': {
      send(socket, { type: 'detached', id: cmd.id })
      break
    }

    case 'input': {
      const session = manager.get(cmd.id)
      if (!session) {
        send(socket, { type: 'error', message: `Session not found: ${cmd.id}` })
        return
      }
      session.write(cmd.data)
      break
    }

    case 'resize': {
      const session = manager.get(cmd.id)
      if (!session) {
        send(socket, { type: 'error', message: `Session not found: ${cmd.id}` })
        return
      }
      session.resize(cmd.cols, cmd.rows)
      send(socket, { type: 'ok' })
      break
    }

    case 'kill': {
      const session = manager.get(cmd.id)
      if (!session) {
        send(socket, { type: 'error', message: `Session not found: ${cmd.id}` })
        return
      }
      session.kill()
      manager.remove(cmd.id)
      send(socket, { type: 'ok' })
      break
    }

    case 'shutdown': {
      send(socket, { type: 'ok' })
      socket.end(() => shutdown())
      break
    }
  }
}
