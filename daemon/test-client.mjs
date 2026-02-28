/**
 * Tabby Session Daemon — Interactive Test Client
 * Usage: node test-client.mjs
 */
import net from 'net'
import readline from 'readline'

const PIPE = '\\\\.\\pipe\\tabby-daemon'

const client = net.createConnection(PIPE, () => {
  console.log('[client] Connected to daemon')
  showHelp()
  rl.prompt()
})

let buf = ''
client.on('data', (chunk) => {
  buf += chunk.toString()
  const lines = buf.split('\n')
  buf = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line)
      handleEvent(event)
    } catch {
      console.log('[raw]', line)
    }
  }
  rl.prompt()
})

client.on('error', (err) => {
  console.error('[client] Error:', err.message)
  process.exit(1)
})

client.on('close', () => {
  console.log('[client] Disconnected')
  process.exit(0)
})

function send(cmd) {
  client.write(JSON.stringify(cmd) + '\n')
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'sessions':
      if (ev.sessions.length === 0) {
        console.log('[sessions] (none)')
      } else {
        for (const s of ev.sessions) {
          console.log(`[session] ${s.id.slice(0, 8)}… name="${s.name}" shell=${s.shell} alive=${s.alive}`)
        }
      }
      break
    case 'created':
      console.log(`[created] id=${ev.session.id.slice(0, 8)}… name="${ev.session.name}"`)
      break
    case 'attached':
      console.log(`[attached] id=${ev.id.slice(0, 8)}… (buffer replay below)`)
      if (ev.buffer) process.stdout.write(ev.buffer)
      break
    case 'detached':
      console.log(`[detached] id=${ev.id.slice(0, 8)}…`)
      break
    case 'output':
      process.stdout.write(ev.data)
      break
    case 'exit':
      console.log(`\n[exit] id=${ev.id.slice(0, 8)}… code=${ev.code}`)
      break
    case 'ok':
      console.log('[ok]')
      break
    case 'error':
      console.error('[error]', ev.message)
      break
    default:
      console.log('[event]', JSON.stringify(ev))
  }
}

// --- CLI ---

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' })

let attachedId = null

rl.on('line', (line) => {
  const parts = line.trim().split(/\s+/)
  const cmd = parts[0]

  switch (cmd) {
    case 'list':
    case 'l':
      send({ cmd: 'list' })
      break

    case 'create':
    case 'c': {
      const name = parts[1] ?? 'test'
      const shell = parts[2] ?? 'cmd.exe'
      send({ cmd: 'create', name, shell })
      break
    }

    case 'attach':
    case 'a': {
      const id = parts[1]
      if (!id) { console.log('Usage: attach <id>'); break }
      attachedId = id
      send({ cmd: 'attach', id })
      break
    }

    case 'detach':
    case 'd':
      if (!attachedId) { console.log('Not attached'); break }
      send({ cmd: 'detach', id: attachedId })
      attachedId = null
      break

    case 'input':
    case 'i': {
      const id = attachedId ?? parts[1]
      const text = attachedId ? parts.slice(1).join(' ') + '\r\n' : parts.slice(2).join(' ') + '\r\n'
      if (!id) { console.log('Usage: input <id> <text>  or attach first'); break }
      send({ cmd: 'input', id, data: text })
      break
    }

    case 'kill':
    case 'k': {
      const id = parts[1] ?? attachedId
      if (!id) { console.log('Usage: kill <id>'); break }
      send({ cmd: 'kill', id })
      if (id === attachedId) attachedId = null
      break
    }

    case 'help':
    case 'h':
    case '?':
      showHelp()
      break

    case 'quit':
    case 'q':
      process.exit(0)
      break

    default:
      if (attachedId && line.trim()) {
        // In attached mode, send raw input
        send({ cmd: 'input', id: attachedId, data: line + '\r\n' })
      } else if (line.trim()) {
        console.log('Unknown command. Type help.')
      }
  }
  rl.prompt()
})

function showHelp() {
  console.log(`
Commands:
  list (l)              — list all sessions
  create (c) [name] [shell]  — create session (default: test, cmd.exe)
  attach (a) <id>       — attach to session (stream output)
  detach (d)            — detach from current session
  input (i) [id] <text> — send input (or just type when attached)
  kill (k) [id]         — kill session
  quit (q)              — exit

Note: <id> can be the first few chars of the session ID
`)
}
