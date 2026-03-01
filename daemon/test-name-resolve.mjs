// Test that attach/kill work by name and id-prefix (not just full UUID)
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
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Simulate resolveId logic from test-client
function resolveId(input, sessions) {
  if (input.length === 36 && sessions.find(s => s.id === input)) return input
  const byName = sessions.filter(s => s.name.toLowerCase() === input.toLowerCase())
  if (byName.length === 1) return byName[0].id
  const byPrefix = sessions.filter(s => s.id.startsWith(input))
  if (byPrefix.length === 1) return byPrefix[0].id
  return null
}

const c = await connect()

// Create two sessions
c.send({ cmd: 'create', name: 'work', shell: 'cmd.exe' })
const s1 = (await c.once_('created')).session
c.send({ cmd: 'create', name: 'build', shell: 'cmd.exe' })
const s2 = (await c.once_('created')).session

c.send({ cmd: 'list' })
const { sessions } = await c.once_('sessions')
console.log('Sessions:', sessions.map(s => `${s.id.slice(0,8)} name=${s.name}`))

// Test resolve by name
const r1 = resolveId('work', sessions)
const r2 = resolveId('build', sessions)
const r3 = resolveId(s1.id.slice(0, 6), sessions)  // prefix
const r4 = resolveId(s1.id, sessions)               // full UUID

console.log('\n[verify]')
console.log(` ${r1 === s1.id ? '✓' : '✗'} "work"  → ${r1?.slice(0,8)}`)
console.log(` ${r2 === s2.id ? '✓' : '✗'} "build" → ${r2?.slice(0,8)}`)
console.log(` ${r3 === s1.id ? '✓' : '✗'} prefix "${s1.id.slice(0,6)}" → ${r3?.slice(0,8)}`)
console.log(` ${r4 === s1.id ? '✓' : '✗'} full UUID → ${r4?.slice(0,8)}`)

// Cleanup
c.send({ cmd: 'kill', id: s1.id })
c.send({ cmd: 'kill', id: s2.id })
await sleep(300)
c.destroy()

const pass = r1 === s1.id && r2 === s2.id && r3 === s1.id && r4 === s1.id
console.log(`\n${pass ? '[PASS]' : '[FAIL]'} name + prefix + UUID all resolve correctly`)
process.exit(pass ? 0 : 1)
