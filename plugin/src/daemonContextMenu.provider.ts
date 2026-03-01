import { Injectable } from '@angular/core'
import { TabContextMenuItemProvider, BaseTabComponent, MenuItemOptions } from 'tabby-core'
import { Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'
import { DaemonClientService } from './daemonClient.service'
import { SessionAttachService } from './sessionAttach.service'
import { SessionInfo } from './protocol'

interface RedirectState {
  sessionId:     string
  sessionName:   string
  originalTitle: string
  inputSub:      Subscription
  outputSub:     Subscription
  destroySub:    Subscription
}

@Injectable()
export class DaemonContextMenuProvider extends TabContextMenuItemProvider {
  weight = 100
  private redirects = new Map<BaseTabComponent, RedirectState>()

  constructor (
    private daemon: DaemonClientService,
    private attachService: SessionAttachService,
  ) {
    super()
  }

  async getItems (tab: BaseTabComponent): Promise<MenuItemOptions[]> {
    if (!this.daemon.connected) return []

    const frontend = (tab as any).frontend
    if (!frontend) return []  // not a terminal tab

    const existing = this.redirects.get(tab)
    if (existing) {
      return [{
        type: 'normal',
        label: `Detach from [${existing.sessionName}]`,
        click: () => this.detachRedirect(tab, existing),
      }]
    }

    let sessions: SessionInfo[] = []
    try { sessions = await this.daemon.list() } catch { return [] }
    const alive = sessions.filter(s => s.alive)
    if (alive.length === 0) return []

    return [{
      type: 'submenu',
      label: 'Attach to daemon session...',
      submenu: alive.map(s => ({
        type: 'normal' as const,
        label: `${s.name}  \x1b[90m(${s.shell})\x1b[0m`,
        click: () => this.attachRedirect(tab, s, frontend),
      })),
    }]
  }

  private async attachRedirect (
    tab: BaseTabComponent,
    session: SessionInfo,
    frontend: any,
  ): Promise<void> {
    // Subscribe to events$ before sending attach to avoid race
    const buffer = await new Promise<string>((resolve, reject) => {
      const sub = this.daemon.events$.subscribe(evt => {
        if (evt.type === 'attached' && evt.id === session.id) {
          sub.unsubscribe(); resolve(evt.buffer)
        } else if (evt.type === 'error') {
          sub.unsubscribe(); reject(new Error((evt as any).message))
        }
      })
      this.daemon.send({ cmd: 'attach', id: session.id })
    }).catch(() => null)

    if (buffer === null) return

    // Replay scrollback into existing terminal
    if (buffer) await frontend.write(buffer)

    // Daemon output → existing terminal display
    const outputSub = this.daemon.events$.pipe(
      filter(evt => evt.type === 'output' && (evt as any).id === session.id),
    ).subscribe(evt => frontend.write((evt as any).data))

    // Existing terminal input → daemon session
    const inputSub = (frontend.input$ as any).subscribe((buf: Buffer | Uint8Array) => {
      this.daemon.input(session.id, Buffer.from(buf).toString())
    })

    const originalTitle = tab.title

    const state: RedirectState = {
      sessionId:     session.id,
      sessionName:   session.name,
      originalTitle,
      inputSub,
      outputSub,
      destroySub:    tab.destroyed$.subscribe(() => this.detachRedirect(tab, state)),
    }
    this.redirects.set(tab, state)
    this.attachService.register(tab, session.id)
    tab.setTitle(`[${session.name}] ${originalTitle}`)

    // Auto-detach when daemon session exits
    this.daemon.events$.pipe(
      filter(evt => evt.type === 'exit' && (evt as any).id === session.id),
    ).subscribe(() => {
      if (this.redirects.has(tab)) this.detachRedirect(tab, state)
    })
  }

  private detachRedirect (tab: BaseTabComponent, state: RedirectState): void {
    state.inputSub.unsubscribe()
    state.outputSub.unsubscribe()
    state.destroySub.unsubscribe()
    this.redirects.delete(tab)
    this.attachService.unregister(tab)
    this.daemon.send({ cmd: 'detach', id: state.sessionId })
    tab.setTitle(state.originalTitle)
  }
}
