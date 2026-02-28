import * as net from 'net'
import { Command, DaemonEvent, PIPE_NAME } from './protocol'
import { SessionManager } from './daemon'

// Framing: each JSON message ends with newline \n
function send(socket: net.Socket, event: DaemonEvent): void {
  if (!socket.destroyed) {
    socket.write(JSON.stringify(event) + '\n')
  }
}

export function startIPCServer(manager: SessionManager): net.Server {
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
          handleCommand(cmd, socket, manager, detachFns)
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

  server.listen(PIPE_NAME, () => {
    console.log(`[ipc] listening on ${PIPE_NAME}`)
  })

  server.on('error', (err) => {
    console.error('[ipc] server error:', err.message)
    process.exit(1)
  })

  return server
}

function handleCommand(
  cmd: Command,
  socket: net.Socket,
  manager: SessionManager,
  detachFns: (() => void)[],
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
      // Send buffered output for replay
      send(socket, { type: 'attached', id: session.id, buffer: session.buffer })

      // Stream live output
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
      // Detach is handled by socket close — nothing special needed
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
  }
}
