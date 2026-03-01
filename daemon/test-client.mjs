/**
 * Tabby Session Daemon — Interactive Test Client
 * Usage: node test-client.mjs
 */
import net from 'net'
import readline from 'readline'

const PIPE = '\\\\.\\pipe\\tabby-daemon'

// Reset terminal input mode on startup and exit — in case a previous session
// left the terminal in Win32 Input Mode (\x1b[?9001h)
const RESET_INPUT_MODE = '\x1b[?9001l\x1b[?1004l'
process.stdout.write(RESET_INPUT_MODE)
process.on('exit', () => process.stdout.write(RESET_INPUT_MODE))
process.on('SIGINT', () => { process.stdout.write(RESET_INPUT_MODE); process.exit(0) })

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

// Strip sequences that would corrupt our terminal's input mode
function sanitize(data) {
  return data
    .replace(/\x1b\[\?9001h/g, '')   // Win32 Input Mode enable  — blocks typed input
    .replace(/\x1b\[\?1004h/g, '')   // Focus tracking enable    — noisy in test-client
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'sessions':
      knownSessions = ev.sessions
      if (ev.sessions.length === 0) {
        console.log('[sessions] (none)')
      } else {
        for (const s of ev.sessions) {
          console.log(`[session] ${s.id.slice(0, 8)}… name="${s.name}" shell=${s.shell} alive=${s.alive}`)
        }
      }
      break
    case 'created':
      knownSessions = [...knownSessions.filter(s => s.id !== ev.session.id), ev.session]
      console.log(`[created] id=${ev.session.id.slice(0, 8)}… name="${ev.session.name}"`)
      break
    case 'attached':
      console.log(`[attached] id=${ev.id.slice(0, 8)}… (buffer replay below)`)
      if (ev.buffer) process.stdout.write(sanitize(ev.buffer))
      // Reset Win32 Input Mode in case the shell enabled it
      process.stdout.write('\x1b[?9001l')
      break
    case 'detached':
      // Restore normal input mode on detach
      process.stdout.write('\x1b[?9001l')
      console.log(`[detached] id=${ev.id.slice(0, 8)}…`)
      break
    case 'output':
      process.stdout.write(sanitize(ev.data))
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
let knownSessions = []  // cache from last 'list' or 'created' event

// Resolve name, id-prefix, or full UUID → full ID
function resolveId(input) {
  if (!input) return null
  // exact full UUID
  if (input.length === 36 && knownSessions.find(s => s.id === input)) return input
  // match by name (exact, case-insensitive)
  const byName = knownSessions.filter(s => s.name.toLowerCase() === input.toLowerCase())
  if (byName.length === 1) return byName[0].id
  if (byName.length > 1) { console.log(`[ambiguous] ${byName.length} sessions named "${input}"`); return null }
  // match by id prefix
  const byPrefix = knownSessions.filter(s => s.id.startsWith(input))
  if (byPrefix.length === 1) return byPrefix[0].id
  if (byPrefix.length > 1) { console.log(`[ambiguous] ${byPrefix.length} sessions start with "${input}"`); return null }
  console.log(`[not found] no session named or prefixed "${input}" — run l to refresh`)
  return null
}

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
      const raw = parts[1]
      if (!raw) { console.log('Usage: attach <id-prefix>'); break }
      const id = resolveId(raw)
      if (!id) break
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
      const id = attachedId ?? resolveId(parts[1])
      const text = attachedId ? parts.slice(1).join(' ') + '\r\n' : parts.slice(2).join(' ') + '\r\n'
      if (!id) { console.log('Usage: input <id-prefix> <text>  or attach first'); break }
      send({ cmd: 'input', id, data: text })
      break
    }

    case 'kill':
    case 'k': {
      const raw = parts[1] ?? attachedId
      const id = attachedId && raw === attachedId ? attachedId : resolveId(raw)
      if (!id) { console.log('Usage: kill <id-prefix>'); break }
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

Note: <id> accepts session name, id-prefix, or full UUID
`)
}
