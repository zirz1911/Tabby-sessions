#!/usr/bin/env node
// Test attach + input + output round-trip
const net = require('net')

const PIPE = '\\\\.\\pipe\\tabby-daemon'
let buf = ''
let sessionId = null

function send(c, cmd) {
  console.log('>> SEND:', JSON.stringify(cmd))
  c.write(JSON.stringify(cmd) + '\n')
}

const client = net.createConnection(PIPE, () => {
  console.log('[test-attach] connected')
  send(client, { cmd: 'create', name: 'attach-test', shell: 'cmd.exe', cwd: 'C:\\' })
})

client.on('data', chunk => {
  buf += chunk.toString()
  const lines = buf.split('\n')
  buf = lines.pop()
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const evt = JSON.parse(line)
      console.log('<< RECV:', evt.type, JSON.stringify(evt).slice(0, 150))

      if (evt.type === 'created') {
        sessionId = evt.session.id
        setTimeout(() => send(client, { cmd: 'attach', id: sessionId }), 200)
      }

      if (evt.type === 'attached') {
        console.log('<< buffer replay:', JSON.stringify(evt.buffer.slice(0, 80)))
        setTimeout(() => {
          send(client, { cmd: 'input', id: sessionId, data: 'echo hello_tabby\r\n' })
        }, 300)
        setTimeout(() => {
          send(client, { cmd: 'kill', id: sessionId })
          setTimeout(() => {
            console.log('[test-attach] done')
            client.destroy()
            process.exit(0)
          }, 500)
        }, 2500)
      }

      if (evt.type === 'output') {
        process.stdout.write('<< PTY: ' + JSON.stringify(evt.data) + '\n')
      }

      if (evt.type === 'exit') {
        console.log('<< session exit code:', evt.code)
      }
    } catch {}
  }
})

client.on('error', err => {
  console.error('[test-attach] error:', err.message)
  process.exit(1)
})
