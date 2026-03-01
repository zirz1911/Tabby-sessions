import { Injectable } from '@angular/core'
import { HostWindowService } from 'tabby-core'
import { DaemonClientService } from './daemonClient.service'

const childProcess = (window as any).require('child_process') as typeof import('child_process')
const path         = (window as any).require('path')          as typeof import('path')
const fs           = (window as any).require('fs')            as typeof import('fs')

@Injectable({ providedIn: 'root' })
export class DaemonLifecycleService {
  private daemonProcess: any = null

  constructor (
    private daemon: DaemonClientService,
    private hostWindow: HostWindowService,
  ) {}

  async initialize (): Promise<void> {
    // Hook app close first so we don't miss a fast shutdown
    this.hostWindow.windowCloseRequest$.subscribe(() => {
      this.stopDaemon()
    })

    const alreadyUp = await this.tryConnect()
    if (!alreadyUp) {
      await this.spawnDaemon()
      await this.waitAndConnect()
    }
  }

  private async tryConnect (): Promise<boolean> {
    try {
      await this.daemon.connect()
      console.log('[tabby-sessions] connected to existing daemon')
      return true
    } catch {
      return false
    }
  }

  private async spawnDaemon (): Promise<void> {
    const daemonScript = this.getDaemonPath()
    if (!fs.existsSync(daemonScript)) {
      console.error('[tabby-sessions] daemon script not found:', daemonScript)
      return
    }

    this.daemonProcess = childProcess.spawn('node', [daemonScript], {
      detached: true,
      stdio:    'ignore',
      env:      { ...process.env },
    })
    this.daemonProcess.unref()
    console.log('[tabby-sessions] daemon spawned, pid:', this.daemonProcess.pid)
  }

  private getDaemonPath (): string {
    // __dirname resolves to plugin/dist/ at runtime (symlink resolved by Node.js)
    // Go up 2 levels: plugin/dist → plugin → project root, then into daemon/dist/
    return path.join(__dirname, '..', '..', 'daemon', 'dist', 'index.js')
  }

  private async waitAndConnect (retries = 12, delayMs = 400): Promise<void> {
    for (let i = 0; i < retries; i++) {
      await new Promise(r => setTimeout(r, delayMs))
      if (await this.tryConnect()) return
    }
    console.error('[tabby-sessions] could not connect to daemon after spawn')
  }

  private async stopDaemon (): Promise<void> {
    if (this.daemon.connected) {
      try {
        await this.daemon.shutdown()
      } catch {
        // Connection will drop — ignore
      }
    }
  }
}
