// ============================================================
// IPC Protocol — JSON messages over Windows Named Pipe
// ============================================================

// Commands: Client → Daemon
export type Command =
  | { cmd: 'list' }
  | { cmd: 'create'; name: string; shell?: string; cwd?: string; cols?: number; rows?: number }
  | { cmd: 'attach'; id: string }
  | { cmd: 'detach'; id: string }
  | { cmd: 'input'; id: string; data: string }
  | { cmd: 'resize'; id: string; cols: number; rows: number }
  | { cmd: 'kill'; id: string }
  | { cmd: 'shutdown' }

// Events: Daemon → Client
export type DaemonEvent =
  | { type: 'sessions'; sessions: SessionInfo[] }
  | { type: 'created'; session: SessionInfo }
  | { type: 'attached'; id: string; buffer: string }
  | { type: 'detached'; id: string }
  | { type: 'output'; id: string; data: string }
  | { type: 'exit'; id: string; code: number }
  | { type: 'error'; message: string }
  | { type: 'ok' }

export interface SessionInfo {
  id: string
  name: string
  shell: string
  cwd: string
  cols: number
  rows: number
  createdAt: number
  alive: boolean
}

export const PIPE_NAME = '\\\\.\\pipe\\tabby-daemon'
export const DEFAULT_SHELL = 'cmd.exe'
export const DEFAULT_COLS = 120
export const DEFAULT_ROWS = 30
