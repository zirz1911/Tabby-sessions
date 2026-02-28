import { Session, SessionOptions } from './session'
import { SessionInfo } from './protocol'

export class SessionManager {
  private _sessions: Map<string, Session> = new Map()

  create(opts: SessionOptions): Session {
    const session = new Session(opts)

    // Auto-remove from map when process exits
    session.onExit(() => {
      console.log(`[daemon] session exited: ${session.id} (${session.name})`)
    })

    this._sessions.set(session.id, session)
    console.log(`[daemon] session created: ${session.id} (${session.name}) shell=${session.shell}`)
    return session
  }

  get(id: string): Session | undefined {
    return this._sessions.get(id)
  }

  remove(id: string): void {
    this._sessions.delete(id)
  }

  list(): SessionInfo[] {
    return Array.from(this._sessions.values()).map((s) => s.toInfo())
  }

  killAll(): void {
    for (const session of this._sessions.values()) {
      session.kill()
    }
    this._sessions.clear()
  }
}
