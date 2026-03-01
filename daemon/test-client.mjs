/**
 * Tabby Session Daemon — Interactive Test Client
 * Usage: node test-client.mjs
 *
 * Keyboard shortcuts when attached:
 *   Ctrl+]   — detach from session (return to command mode)
 *   Ctrl+C   — passed through to the session (not exit)
 */
import net from 'net'
import readline from 'readline'

const PIPE = '\\\\.\\pipe\\tabby-daemon'
const DETACH_KEY = 0x1d  // Ctrl+]

// ── Terminal helpers ─────────────────────────────────────────────────────────

const RESET_INPUT_MODE = '\x1b[?9001l\x1b[?1004l'
process.stdout.write(RESET_INPUT_MODE)
process.on('exit', () => process.stdout.write(RESET_INPUT_MODE))
process.on('SIGINT', () => { process.stdout.write(RESET_INPUT_MODE); process.exit(0) })

// Strip sequences that corrupt our terminal's input mode
function sanitize(data) {
  return data
    .replace(/\x1b\[\?9001h/g, '')  // Win32 Input Mode enable
    .replace(/\x1b\[\?1004h/g, '')  // Focus tracking enable
}

// ── Connection ───────────────────────────────────────────────────────────────

const client = net.createConnection(PIPE, () => {
  console.log('[tabby-sessions] connected\n')
  showHelp()
  rl.prompt()
})

let ipcBuf = ''
client.on('data', (chunk) => {
  ipcBuf += chunk.toString()
  const lines = ipcBuf.split('\n')
  ipcBuf = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try { handleEvent(JSON.parse(line)) }
    catch { process.stdout.write('[raw] ' + line + '\n') }
  }
  if (!isRawMode) rl.prompt()
})

client.on('error', (err) => { console.error('[error]', err.message); process.exit(1) })
client.on('close', () => { console.log('\n[disconnected]'); process.exit(0) })

function send(cmd) { client.write(JSON.stringify(cmd) + '\n') }

// ── Raw mode (while attached) ────────────────────────────────────────────────

let isRawMode = false

function enterRawMode() {
  if (isRawMode || !process.stdin.isTTY) return
  isRawMode = true
  rl.pause()
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', onRawData)
  process.stdout.write('\x1b[2m  [attached — Ctrl+] to detach]\x1b[0m\r\n')
}

function exitRawMode() {
  if (!isRawMode) return
  isRawMode = false
  process.stdin.setRawMode(false)
  process.stdin.removeListener('data', onRawData)
  rl.resume()
  process.stdout.write('\r\n')
  rl.prompt()
}

function onRawData(buf) {
  if (buf.length === 1 && buf[0] === DETACH_KEY) {
    // Ctrl+] — detach
    if (attachedId) {
      send({ cmd: 'detach', id: attachedId })
      attachedId = null
    }
    exitRawMode()
    return
  }
  if (attachedId) {
    send({ cmd: 'input', id: attachedId, data: buf.toString() })
  }
}

// ── Event handler ────────────────────────────────────────────────────────────

function handleEvent(ev) {
  switch (ev.type) {
    case 'sessions':
      knownSessions = ev.sessions
      if (ev.sessions.length === 0) {
        console.log('  (no sessions)')
      } else {
        for (const s of ev.sessions) {
          const status = s.alive ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m'
          console.log(`  ${status} \x1b[1m${s.name}\x1b[0m  \x1b[90m${s.id.slice(0,8)}  ${s.shell}\x1b[0m`)
        }
      }
      break

    case 'created':
      knownSessions = [...knownSessions.filter(s => s.id !== ev.session.id), ev.session]
      console.log(`\x1b[32m[created]\x1b[0m \x1b[1m${ev.session.name}\x1b[0m  \x1b[90m${ev.session.id.slice(0,8)}\x1b[0m`)
      console.log(`\x1b[2m  → type: a ${ev.session.name}\x1b[0m`)
      break

    case 'attached':
      if (ev.buffer) process.stdout.write(sanitize(ev.buffer))
      process.stdout.write('\x1b[?9001l')
      enterRawMode()
      break

    case 'detached':
      process.stdout.write('\x1b[?9001l')
      exitRawMode()
      console.log(`\x1b[33m[detached]\x1b[0m  \x1b[90m${ev.id.slice(0,8)}\x1b[0m`)
      break

    case 'output':
      process.stdout.write(sanitize(ev.data))
      break

    case 'exit':
      if (attachedId === ev.id) {
        attachedId = null
        exitRawMode()
      }
      console.log(`\x1b[31m[exit]\x1b[0m  \x1b[90m${ev.id.slice(0,8)}  code=${ev.code}\x1b[0m`)
      break

    case 'ok':
      break  // suppress noisy acks

    case 'error':
      console.error(`\x1b[31m[error]\x1b[0m ${ev.message}`)
      break

    default:
      console.log('[event]', JSON.stringify(ev))
  }
}

// ── Command mode (readline) ──────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '\x1b[90m›\x1b[0m ' })

let attachedId = null
let knownSessions = []

function resolveId(input) {
  if (!input) return null
  if (input.length === 36 && knownSessions.find(s => s.id === input)) return input
  const byName = knownSessions.filter(s => s.name.toLowerCase() === input.toLowerCase())
  if (byName.length === 1) return byName[0].id
  if (byName.length > 1) { console.log(`[ambiguous] ${byName.length} sessions named "${input}"`); return null }
  const byPrefix = knownSessions.filter(s => s.id.startsWith(input))
  if (byPrefix.length === 1) return byPrefix[0].id
  if (byPrefix.length > 1) { console.log(`[ambiguous] ${byPrefix.length} match "${input}"`); return null }
  console.log(`\x1b[33m[not found]\x1b[0m "${input}" — run l to refresh`)
  return null
}

rl.on('line', (line) => {
  const parts = line.trim().split(/\s+/)
  const cmd = parts[0]

  switch (cmd) {
    case 'list': case 'l':
      send({ cmd: 'list' })
      break

    case 'create': case 'c': {
      const name = parts[1] ?? 'test'
      const shell = parts[2] ?? 'cmd.exe'
      send({ cmd: 'create', name, shell })
      break
    }

    case 'attach': case 'a': {
      const raw = parts[1]
      if (!raw) { console.log('usage: a <name|prefix>'); break }
      const id = resolveId(raw)
      if (!id) break
      attachedId = id
      send({ cmd: 'attach', id })
      break
    }

    case 'detach': case 'd':
      if (!attachedId) { console.log('not attached'); break }
      send({ cmd: 'detach', id: attachedId })
      attachedId = null
      break

    case 'kill': case 'k': {
      const raw = parts[1] ?? attachedId
      const id = (attachedId && raw === attachedId) ? attachedId : resolveId(raw)
      if (!id) { console.log('usage: k <name|prefix>'); break }
      send({ cmd: 'kill', id })
      if (id === attachedId) attachedId = null
      break
    }

    case 'shutdown':
      send({ cmd: 'shutdown' })
      break

    case 'help': case 'h': case '?':
      showHelp()
      break

    case 'quit': case 'q':
      process.exit(0)
      break

    case '':
      break

    default:
      console.log(`unknown: ${cmd} — type h for help`)
  }

  if (!isRawMode) rl.prompt()
})

function showHelp() {
  console.log(`
  \x1b[1mCommands\x1b[0m
  l              list sessions
  c <name>       create session  (cmd.exe)
  c <name> <sh>  create with shell  e.g. c ps powershell.exe
  a <name>       attach  (accepts name, id-prefix, or UUID)
  k <name>       kill session
  shutdown       stop daemon
  q              quit client

  \x1b[2mWhile attached: type freely — Ctrl+] to detach\x1b[0m
`)
}
