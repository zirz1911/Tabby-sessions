import net from 'net'

const PIPE = '\\\\.\\pipe\\tabby-daemon'

console.log('Connecting to', PIPE)

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
      console.log('[recv]', JSON.stringify(ev).slice(0, 300))
    }
  })

  const send = (cmd) => {
    console.log('[send]', JSON.stringify(cmd))
    client.write(JSON.stringify(cmd) + '\n')
  }

  // Step 1: list (should be empty)
  send({ cmd: 'list' })

  setTimeout(() => {
    // Step 2: create session
    send({ cmd: 'create', name: 'test-session', shell: 'cmd.exe' })
  }, 500)

  setTimeout(() => {
    // Step 3: list again (should show 1 session)
    send({ cmd: 'list' })
  }, 1000)

  setTimeout(() => {
    // Step 4: kill + list
    // We'll grab the id from the create response above
    send({ cmd: 'list' })
  }, 1500)

  setTimeout(() => {
    console.log('[done] Test complete')
    client.destroy()
    process.exit(0)
  }, 3000)
})

client.on('error', (err) => {
  console.error('[error]', err.message)
  process.exit(1)
})
