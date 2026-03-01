import net from 'net'

const PIPE = '\\\\.\\pipe\\tabby-daemon'

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(PIPE)
    let buf = ''
    const handlers = []

    sock.on('connect', () => resolve(sock))
    sock.on('error', reject)
    sock.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const evt = JSON.parse(line)
          for (const h of handlers) h(evt)
        } catch { /* ignore */ }
      }
    })

    sock.send = (cmd) => sock.write(JSON.stringify(cmd) + '\n')
    sock.on_ = (fn) => handlers.push(fn)
    sock.once_ = (type) => new Promise(res => {
      const h = (evt) => { if (evt.type === type) { handlers.splice(handlers.indexOf(h), 1); res(evt) } }
      handlers.push(h)
    })
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── main ───────────────────────────────────────────────

const c1 = await connect()
console.log('[1] Connected (client-1)')

// Create session
c1.send({ cmd: 'create', name: 'detach-test', shell: 'cmd.exe' })
const created = await c1.once_('created')
const id = created.session.id
console.log(`[1] Session created: ${id.slice(0, 8)}...`)

// Attach
c1.send({ cmd: 'attach', id })
const attached = await c1.once_('attached')
console.log(`[1] Attached — buffer length: ${attached.buffer.length} chars`)

// Send first command
await sleep(300)
c1.send({ cmd: 'input', id, data: 'echo BEFORE-DETACH\r\n' })
await sleep(500)

// Detach — disconnect this client entirely (simulates tab close)
console.log('\n[1] Detaching (closing client-1 connection)...')
c1.destroy()
await sleep(300)

// ── Session is now running headless ──

console.log('[bg] Session running headless, sending commands via new connection...')
const c2 = await connect()
c2.send({ cmd: 'attach', id })
await c2.once_('attached')  // get the stream
await sleep(200)

// Commands run while "nobody is watching"
c2.send({ cmd: 'input', id, data: 'echo WHILE-DETACHED-1\r\n' })
await sleep(300)
c2.send({ cmd: 'input', id, data: 'echo WHILE-DETACHED-2\r\n' })
await sleep(300)
c2.send({ cmd: 'input', id, data: 'echo WHILE-DETACHED-3\r\n' })
await sleep(400)

c2.destroy()
await sleep(300)

// ── Re-attach with fresh client ──

console.log('\n[3] Re-attaching with a fresh client...')
const c3 = await connect()
c3.send({ cmd: 'attach', id })
const replay = await c3.once_('attached')

console.log('\n══════════════════════════════════════════')
console.log('  BUFFER REPLAY (everything the session saw)')
console.log('══════════════════════════════════════════')
// Strip ANSI escape codes for readability
const clean = replay.buffer.replace(/\x1b\[[0-9;?]*[a-zA-Zlh]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
const lines = clean.split(/\r?\n/).filter(l => l.trim())
for (const line of lines) console.log(' ', line)
console.log('══════════════════════════════════════════')

// Verify all echoes are in the buffer
const checks = ['BEFORE-DETACH', 'WHILE-DETACHED-1', 'WHILE-DETACHED-2', 'WHILE-DETACHED-3']
console.log('\n[verify]')
let pass = true
for (const word of checks) {
  const found = replay.buffer.includes(word)
  console.log(` ${found ? '✓' : '✗'} ${word}`)
  if (!found) pass = false
}

// Cleanup
c3.send({ cmd: 'kill', id })
await sleep(200)
c3.destroy()

console.log(`\n${pass ? '[PASS] All markers found in replay buffer' : '[FAIL] Some markers missing'}`)
process.exit(pass ? 0 : 1)
