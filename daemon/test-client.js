#!/usr/bin/env node
// Quick test client for tabby-daemon Named Pipe
const net = require('net')

const PIPE = '\\\\.\\pipe\\tabby-daemon'
let buf = ''

function send(client, cmd) {
  console.log('\n>> SEND:', JSON.stringify(cmd))
  client.write(JSON.stringify(cmd) + '\n')
}

const client = net.createConnection(PIPE, () => {
  console.log('[test-client] connected to', PIPE)

  // Step 1: list sessions
  send(client, { cmd: 'list' })

  setTimeout(() => {
    // Step 2: create a session
    send(client, { cmd: 'create', name: 'test-session', shell: 'cmd.exe', cwd: 'C:\\' })
  }, 500)

  setTimeout(() => {
    // Step 3: list again to see new session
    send(client, { cmd: 'list' })
  }, 1500)

  setTimeout(() => {
    console.log('\n[test-client] done — closing')
    client.destroy()
    process.exit(0)
  }, 3000)
})

client.on('data', chunk => {
  buf += chunk.toString()
  const lines = buf.split('\n')
  buf = lines.pop()
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const evt = JSON.parse(line)
      console.log('<< RECV:', JSON.stringify(evt, null, 2))
    } catch {
      console.log('<< RAW:', line)
    }
  }
})

client.on('error', err => {
  console.error('[test-client] error:', err.message)
  process.exit(1)
})

client.on('close', () => console.log('[test-client] connection closed'))
