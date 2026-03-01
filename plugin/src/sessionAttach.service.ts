import { Injectable } from '@angular/core'
import { BaseTabComponent } from 'tabby-core'

@Injectable({ providedIn: 'root' })
export class SessionAttachService {
  private tabToSession = new Map<BaseTabComponent, string>()
  private sessionToTab = new Map<string, BaseTabComponent>()

  register (tab: BaseTabComponent, sessionId: string): void {
    this.tabToSession.set(tab, sessionId)
    this.sessionToTab.set(sessionId, tab)
  }

  unregister (tab: BaseTabComponent): void {
    const id = this.tabToSession.get(tab)
    if (id) this.sessionToTab.delete(id)
    this.tabToSession.delete(tab)
  }

  getSessionId (tab: BaseTabComponent): string | undefined {
    return this.tabToSession.get(tab)
  }

  getTab (sessionId: string): BaseTabComponent | undefined {
    return this.sessionToTab.get(sessionId)
  }

  isAttached (tab: BaseTabComponent): boolean {
    return this.tabToSession.has(tab)
  }
}
