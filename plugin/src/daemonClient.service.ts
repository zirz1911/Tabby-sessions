import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'
import { Command, DaemonEvent, SessionInfo, PIPE_NAME } from './protocol'

// Electron provides Node.js 'net' module at runtime
const net = (window as any).require('net')

@Injectable({ providedIn: 'root' })
export class DaemonClientService {
  readonly events$ = new Subject<DaemonEvent>()

  private socket: any = null
  private buf = ''
  private pending = new Map<string, (evt: DaemonEvent) => void>()
  private _connected = false

  get connected (): boolean { return this._connected }

  connect (): Promise<void> {
    if (this._connected) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const sock = net.createConnection(PIPE_NAME)

      sock.on('connect', () => {
        this.socket = sock
        this._connected = true
        resolve()
      })

      sock.on('data', (chunk: Buffer) => {
        this.buf += chunk.toString()
        const lines = this.buf.split('\n')
        this.buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const evt: DaemonEvent = JSON.parse(line)
            this.events$.next(evt)
          } catch { /* ignore malformed */ }
        }
      })

      sock.on('error', (err: Error) => {
        this._connected = false
        if (!this.socket) reject(err)
      })

      sock.on('close', () => {
        this._connected = false
        this.socket = null
      })
    })
  }

  disconnect (): void {
    this.socket?.destroy()
    this.socket = null
    this._connected = false
  }

  send (cmd: Command): void {
    if (!this.socket) throw new Error('Not connected to daemon')
    this.socket.write(JSON.stringify(cmd) + '\n')
  }

  // One-shot request → wait for a specific response type
  private request<T extends DaemonEvent> (
    cmd: Command,
    expectType: T['type'],
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const sub = this.events$.subscribe(evt => {
        if (evt.type === expectType) {
          sub.unsubscribe()
          resolve(evt as T)
        }
        if (evt.type === 'error') {
          sub.unsubscribe()
          reject(new Error((evt as any).message))
        }
      })
      try {
        this.send(cmd)
      } catch (e) {
        sub.unsubscribe()
        reject(e)
      }
    })
  }

  async list (): Promise<SessionInfo[]> {
    const evt = await this.request<{ type: 'sessions'; sessions: SessionInfo[] }>(
      { cmd: 'list' }, 'sessions',
    )
    return evt.sessions
  }

  async create (name: string, shell?: string, cwd?: string): Promise<SessionInfo> {
    const evt = await this.request<{ type: 'created'; session: SessionInfo }>(
      { cmd: 'create', name, shell, cwd }, 'created',
    )
    return evt.session
  }

  kill (id: string): void {
    this.send({ cmd: 'kill', id })
  }

  detach (id: string): void {
    this.send({ cmd: 'detach', id })
  }

  input (id: string, data: string): void {
    this.send({ cmd: 'input', id, data })
  }

  resize (id: string, cols: number, rows: number): void {
    this.send({ cmd: 'resize', id, cols, rows })
  }

  async shutdown (): Promise<void> {
    try {
      await this.request<{ type: 'ok' }>({ cmd: 'shutdown' } as any, 'ok')
    } catch { /* connection drop is expected */ }
    this.disconnect()
  }
}
