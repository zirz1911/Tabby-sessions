import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export const PID_FILE = path.join(os.tmpdir(), 'tabby-daemon.pid')

export function writePid(): void {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8')
}

export function removePid(): void {
  try { fs.unlinkSync(PID_FILE) } catch { /* ignore */ }
}

/**
 * Kill the PID recorded in the file.
 * Returns true if we killed a process OR if the process was already dead
 * (so the caller should retry the bind either way).
 * Returns false only if no PID file exists (nothing we can do).
 */
export function killOldDaemon(): boolean {
  let pid: number | null = null
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
    pid = parseInt(raw, 10)
    if (isNaN(pid) || pid === process.pid) return false
  } catch {
    return false // no PID file
  }

  try {
    console.log(`[pid] killing old daemon pid=${pid}`)
    process.kill(pid, 'SIGTERM')
    return true
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      // Process is already dead — pipe may still be releasing
      console.log(`[pid] old daemon pid=${pid} already gone, retrying bind`)
      removePid()
      return true
    }
    console.error(`[pid] failed to kill pid=${pid}:`, err.message)
    return false
  }
}
