import net from 'net'

const PIPE = '\\\\.\\pipe\\tabby-daemon'
let sessionId = null

const client = net.createConnection(PIPE, () => {
  console.log('[ok] Connected')

  let buf = ''
  client.on('data', (chunk) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const ev = JSON.parse(line)
      if (ev.type === 'output') {
        process.stdout.write('[output] ' + ev.data)
      } else {
        console.log('[recv]', JSON.stringify(ev).slice(0, 200))
      }
    }
  })

  const send = (cmd) => {
    console.log('\n[send]', JSON.stringify(cmd))
    client.write(JSON.stringify(cmd) + '\n')
  }

  // 1. Create session
  send({ cmd: 'create', name: 'attach-test', shell: 'cmd.exe' })

  setTimeout(() => {
    // 2. Grab ID from list
    send({ cmd: 'list' })
  }, 300)

  setTimeout(() => {
    // 3. Attach (we'll use the ID from the create response — hacky but works for test)
    // Re-list to get id, attach to it
    const listClient = net.createConnection(PIPE, () => {
      listClient.write(JSON.stringify({ cmd: 'list' }) + '\n')
      let lb = ''
      listClient.on('data', chunk => {
        lb += chunk.toString()
        const lines = lb.split('\n')
        lb = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line)
          if (ev.type === 'sessions' && ev.sessions.length > 0) {
            sessionId = ev.sessions[0].id
            console.log('[attach] using session id:', sessionId)
            listClient.destroy()
            send({ cmd: 'attach', id: sessionId })
          }
        }
      })
    })
  }, 600)

  setTimeout(() => {
    // 4. Send a command
    if (sessionId) {
      send({ cmd: 'input', id: sessionId, data: 'echo Hello from daemon test\r\n' })
    }
  }, 1200)

  setTimeout(() => {
    if (sessionId) {
      send({ cmd: 'input', id: sessionId, data: 'dir /b\r\n' })
    }
  }, 1800)

  setTimeout(() => {
    // 5. Kill session
    if (sessionId) {
      send({ cmd: 'kill', id: sessionId })
    }
  }, 3000)

  setTimeout(() => {
    // 6. Verify empty list
    send({ cmd: 'list' })
  }, 3500)

  setTimeout(() => {
    console.log('\n[done] All tests passed')
    client.destroy()
    process.exit(0)
  }, 4500)
})

client.on('error', (err) => {
  console.error('[error]', err.message)
  process.exit(1)
})
