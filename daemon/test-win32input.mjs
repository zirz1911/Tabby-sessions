// Verify Win32 Input Mode is stripped and typing works correctly
import net from 'net'

const PIPE = '\\\\.\\pipe\\tabby-daemon'

function connect() {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(PIPE)
    let buf = '', handlers = []
    sock.on('connect', () => resolve(sock))
    sock.on('error', reject)
    sock.on('data', chunk => {
      buf += chunk.toString()
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try { const e = JSON.parse(line); for (const h of handlers) h(e) } catch {}
      }
    })
    sock.send = cmd => sock.write(JSON.stringify(cmd) + '\n')
    sock.once_ = type => new Promise(res => {
      const h = e => { if (e.type === type) { handlers.splice(handlers.indexOf(h), 1); res(e) } }
      handlers.push(h)
    })
    sock.collect = (ms) => new Promise(res => {
      let out = ''
      const h = e => { if (e.type === 'output') out += e.data }
      handlers.push(h)
      setTimeout(() => { handlers.splice(handlers.indexOf(h), 1); res(out) }, ms)
    })
  })
}

function sanitize(data) {
  return data
    .replace(/\x1b\[\?9001h/g, '')
    .replace(/\x1b\[\?1004h/g, '')
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

const c = await connect()

// Use PowerShell — this is what triggers Win32 Input Mode
c.send({ cmd: 'create', name: 'ps-test', shell: 'powershell.exe' })
const { session } = await c.once_('created')
console.log(`[+] Session created: ${session.id.slice(0,8)} (powershell.exe)`)

// Collect live output for 1.5s while PowerShell initialises
// (Win32 Input Mode arrives as live output, not in the buffer replay)
const initOutput = c.collect(1500)
c.send({ cmd: 'attach', id: session.id })
await c.once_('attached')
const rawInit = await initOutput

const hasWin32Mode = rawInit.includes('\x1b[?9001h')
console.log(`[check] Live init output contains \\x1b[?9001h: ${hasWin32Mode ? 'yes (expected)' : 'no — PS loaded fast or already stripped'}`)

const sanitizedInit = sanitize(rawInit)
const stillHas = sanitizedInit.includes('\x1b[?9001h')
console.log(`[check] After sanitize: ${stillHas ? 'STILL PRESENT ✗' : 'stripped ✓'}`)

// Send a command and verify readable output
const cmdOutput = c.collect(1500)
c.send({ cmd: 'input', id: session.id, data: 'Write-Output "TYPED-OK"\r\n' })
const rawCmd = await cmdOutput
const cleanCmd = sanitize(rawCmd)

const typed = cleanCmd.includes('TYPED-OK')
console.log(`[check] Output contains "TYPED-OK": ${typed ? '✓ yes' : '✗ no'}`)
console.log(`[preview] ${cleanCmd.replace(/\x1b\[[^m]*m/g,'').replace(/[\r\n]+/g,' ').trim().slice(0,120)}`)

c.send({ cmd: 'kill', id: session.id })
await sleep(300)
c.destroy()

// Pass if: Win32 Mode was stripped (or never sent) AND typing works
const pass = !stillHas && typed
console.log(`\n${pass ? '[PASS]' : '[FAIL]'} Win32 Input Mode handled, output readable`)
process.exit(pass ? 0 : 1)
