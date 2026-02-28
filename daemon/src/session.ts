import * as pty from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { SessionInfo, DEFAULT_SHELL, DEFAULT_COLS, DEFAULT_ROWS } from './protocol'

export interface SessionOptions {
  name: string
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}

export class Session {
  readonly id: string
  readonly name: string
  readonly shell: string
  readonly cwd: string
  readonly createdAt: number

  private _pty: pty.IPty
  private _buffer: string = ''
  private _alive: boolean = true

  // Active client sockets attached to this session
  private _listeners: Set<(data: string) => void> = new Set()
  private _exitListeners: Set<(code: number) => void> = new Set()

  constructor(opts: SessionOptions) {
    this.id = uuidv4()
    this.name = opts.name
    this.shell = opts.shell ?? DEFAULT_SHELL
    this.cwd = opts.cwd ?? process.env.USERPROFILE ?? 'C:\\'
    this.createdAt = Date.now()

    const cols = opts.cols ?? DEFAULT_COLS
    const rows = opts.rows ?? DEFAULT_ROWS

    this._pty = pty.spawn(this.shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: this.cwd,
      env: process.env as { [key: string]: string },
    })

    this._pty.onData((data) => {
      // Keep a rolling buffer (last 10k chars) for replay on attach
      this._buffer += data
      if (this._buffer.length > 10_000) {
        this._buffer = this._buffer.slice(-10_000)
      }
      // Fan out to all attached listeners
      for (const fn of this._listeners) fn(data)
    })

    this._pty.onExit(({ exitCode }) => {
      this._alive = false
      for (const fn of this._exitListeners) fn(exitCode ?? 0)
    })
  }

  get alive(): boolean {
    return this._alive
  }

  get buffer(): string {
    return this._buffer
  }

  get cols(): number {
    return this._pty.cols
  }

  get rows(): number {
    return this._pty.rows
  }

  write(data: string): void {
    if (this._alive) this._pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (this._alive) this._pty.resize(cols, rows)
  }

  kill(): void {
    if (this._alive) this._pty.kill()
  }

  onData(fn: (data: string) => void): () => void {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  onExit(fn: (code: number) => void): () => void {
    this._exitListeners.add(fn)
    return () => this._exitListeners.delete(fn)
  }

  toInfo(): SessionInfo {
    return {
      id: this.id,
      name: this.name,
      shell: this.shell,
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      createdAt: this.createdAt,
      alive: this._alive,
    }
  }
}
