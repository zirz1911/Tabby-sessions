import { Component, OnInit, OnDestroy } from '@angular/core'
import { Subscription } from 'rxjs'
import { DaemonClientService } from './daemonClient.service'
import { SessionInfo } from './protocol'

@Component({
  template: `
    <div class="tabby-sessions-panel p-3">
      <div class="d-flex align-items-center mb-3">
        <h5 class="mb-0 flex-grow-1">Daemon Sessions</h5>
        <span class="badge" [class.badge-success]="daemon.connected" [class.badge-secondary]="!daemon.connected">
          {{ daemon.connected ? 'connected' : 'disconnected' }}
        </span>
        <button class="btn btn-sm btn-outline-secondary ms-2" (click)="reconnect()">
          ↺
        </button>
      </div>

      <div *ngIf="error" class="alert alert-danger py-1 px-2 mb-2" style="font-size:0.85em">
        {{ error }}
      </div>

      <div *ngIf="!daemon.connected" class="text-muted text-center py-4">
        <div>Daemon not running.</div>
        <div style="font-size:0.8em">Start: <code>node dist/index.js</code> in daemon/</div>
      </div>

      <div *ngIf="daemon.connected">
        <div *ngFor="let s of sessions" class="session-row d-flex align-items-center mb-2 p-2 rounded">
          <div class="flex-grow-1">
            <strong>{{ s.name }}</strong>
            <span class="text-muted ms-2" style="font-size:0.8em">{{ s.shell }} — {{ s.cwd }}</span>
          </div>
          <span class="badge me-2" [class.badge-success]="s.alive" [class.badge-secondary]="!s.alive">
            {{ s.alive ? 'alive' : 'dead' }}
          </span>
          <button class="btn btn-sm btn-danger" (click)="killSession(s.id)" *ngIf="s.alive">
            ✕
          </button>
        </div>

        <div *ngIf="sessions.length === 0" class="text-muted text-center py-3">
          No sessions. Create one below.
        </div>

        <div class="d-flex mt-3">
          <input class="form-control form-control-sm me-2" [(ngModel)]="newName" placeholder="Session name"
            (keydown.enter)="createSession()" />
          <button class="btn btn-sm btn-primary" (click)="createSession()" [disabled]="!newName.trim()">
            + New
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .session-row {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .session-row:hover {
      background: rgba(255,255,255,0.1);
    }
  `],
})
export class SessionsComponent implements OnInit, OnDestroy {
  sessions: SessionInfo[] = []
  newName = ''
  error = ''
  private sub?: Subscription

  constructor (public daemon: DaemonClientService) {}

  async ngOnInit (): Promise<void> {
    await this.reconnect()

    // Listen for exit events to refresh the list
    this.sub = this.daemon.events$.subscribe(evt => {
      if (evt.type === 'exit') {
        this.refresh()
      }
    })
  }

  ngOnDestroy (): void {
    this.sub?.unsubscribe()
  }

  async reconnect (): Promise<void> {
    this.error = ''
    try {
      await this.daemon.connect()
      await this.refresh()
    } catch (e: any) {
      this.error = 'Cannot connect to daemon: ' + (e?.message ?? e)
    }
  }

  async refresh (): Promise<void> {
    try {
      this.sessions = await this.daemon.list()
    } catch (e: any) {
      this.error = 'list failed: ' + (e?.message ?? e)
    }
  }

  async createSession (): Promise<void> {
    const name = this.newName.trim()
    if (!name) return
    this.error = ''
    try {
      await this.daemon.create(name)
      this.newName = ''
      await this.refresh()
    } catch (e: any) {
      this.error = 'create failed: ' + (e?.message ?? e)
    }
  }

  killSession (id: string): void {
    this.daemon.kill(id)
    // list will refresh via exit event
  }
}
