import { Component, OnInit, OnDestroy } from '@angular/core'
import { Subscription } from 'rxjs'
import { AppService, TabsService, SplitTabComponent } from 'tabby-core'
import { DaemonClientService } from './daemonClient.service'
import { SessionInfo } from './protocol'
import { DaemonSessionTabComponent } from './daemonSessionTab.component'

type OpenMode = 'tab' | 'split-h' | 'split-v'

@Component({
  template: `
    <div class="tabby-sessions-panel p-3">

      <!-- Header -->
      <div class="d-flex align-items-center mb-3">
        <h5 class="mb-0 flex-grow-1">Daemon Sessions</h5>
        <span class="badge me-2"
          [class.badge-success]="daemon.connected"
          [class.badge-secondary]="!daemon.connected">
          {{ daemon.connected ? 'connected' : 'disconnected' }}
        </span>
        <button class="btn btn-sm btn-outline-secondary" (click)="reconnect()" title="Reconnect">↺</button>
      </div>

      <!-- Error -->
      <div *ngIf="error" class="alert alert-danger py-1 px-2 mb-2" style="font-size:0.85em">{{ error }}</div>

      <!-- Disconnected state -->
      <div *ngIf="!daemon.connected" class="text-muted text-center py-4">
        <div>Daemon not running.</div>
        <div style="font-size:0.8em; margin-top:4px">
          Start with: <code>node daemon/dist/index.js</code>
        </div>
      </div>

      <!-- Session list -->
      <div *ngIf="daemon.connected">

        <!-- Open mode selector -->
        <div class="d-flex align-items-center mb-2 gap-1" style="font-size:0.8em">
          <span class="text-muted me-1">Open as:</span>
          <button class="btn btn-xs"
            [class.btn-primary]="openMode === 'tab'"
            [class.btn-outline-secondary]="openMode !== 'tab'"
            (click)="openMode = 'tab'" title="New tab">
            ＋ Tab
          </button>
          <button class="btn btn-xs"
            [class.btn-primary]="openMode === 'split-h'"
            [class.btn-outline-secondary]="openMode !== 'split-h'"
            (click)="openMode = 'split-h'" title="Split horizontal (side by side)">
            ◫ Horizontal
          </button>
          <button class="btn btn-xs"
            [class.btn-primary]="openMode === 'split-v'"
            [class.btn-outline-secondary]="openMode !== 'split-v'"
            (click)="openMode = 'split-v'" title="Split vertical (top / bottom)">
            ⊟ Vertical
          </button>
        </div>

        <div *ngFor="let s of sessions"
          class="session-row d-flex align-items-center mb-2 p-2 rounded">
          <div class="flex-grow-1">
            <strong>{{ s.name }}</strong>
            <span class="text-muted ms-2" style="font-size:0.8em">{{ s.shell }} — {{ s.cwd }}</span>
          </div>
          <span class="badge me-2"
            [class.badge-success]="s.alive"
            [class.badge-secondary]="!s.alive">
            {{ s.alive ? 'alive' : 'dead' }}
          </span>
          <button class="btn btn-sm btn-outline-primary me-1"
            *ngIf="s.alive"
            (click)="openTab(s)"
            title="Open session">
            Open
          </button>
          <button class="btn btn-sm btn-danger"
            *ngIf="s.alive"
            (click)="killSession(s.id)"
            title="Kill session">
            ✕
          </button>
        </div>

        <div *ngIf="sessions.length === 0" class="text-muted text-center py-3">
          No sessions — create one below.
        </div>

        <!-- Create form -->
        <div class="d-flex mt-3 gap-1">
          <input class="form-control form-control-sm"
            [(ngModel)]="newName"
            placeholder="Session name"
            (keydown.enter)="createSession()" />
          <select class="form-select form-select-sm" [(ngModel)]="newShell" style="max-width:160px">
            <option value="">Default (cmd.exe)</option>
            <option *ngFor="let sh of shells" [value]="sh">{{ sh }}</option>
          </select>
          <button class="btn btn-sm btn-primary text-nowrap"
            (click)="createSession()"
            [disabled]="!newName.trim()">
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
    .session-row:hover { background: rgba(255,255,255,0.1); }
    .gap-1 { gap: 4px; }
    .btn-xs { padding: 1px 6px; font-size: 0.75em; }
  `],
})
export class SessionsComponent implements OnInit, OnDestroy {
  sessions: SessionInfo[] = []
  newName = ''
  newShell = ''
  error = ''
  openMode: OpenMode = 'tab'
  shells = ['powershell.exe', 'pwsh.exe', 'wsl.exe']

  private sub?: Subscription

  constructor (
    public daemon: DaemonClientService,
    private app: AppService,
    private tabs: TabsService,
  ) {}

  async ngOnInit (): Promise<void> {
    await this.reconnect()
    this.sub = this.daemon.events$.subscribe(evt => {
      if (evt.type === 'exit') this.refresh()
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
      await this.daemon.create(name, this.newShell || undefined)
      this.newName = ''
      await this.refresh()
    } catch (e: any) {
      this.error = 'create failed: ' + (e?.message ?? e)
    }
  }

  openTab (session: SessionInfo): void {
    const inputs = { sessionId: session.id, sessionName: session.name }
    try {
      if (this.openMode === 'tab') {
        this.app.openNewTabRaw({ type: DaemonSessionTabComponent, inputs })
        return
      }

      // Split mode — create tab first, then insert into active split
      const newTab = this.tabs.create({ type: DaemonSessionTabComponent, inputs })
      const dir = this.openMode === 'split-h' ? 'r' : 'b'
      const activeTop = this.app.activeTab

      if (activeTop instanceof SplitTabComponent) {
        // Already inside a split — add to it
        const innerActive = activeTop.getAllTabs()[0] ?? null
        activeTop.addTab(newTab, innerActive, dir)
      } else if (activeTop) {
        // Plain tab — get parent split or wrap
        const parentSplit = this.app.getParentTab(activeTop)
        if (parentSplit) {
          parentSplit.addTab(newTab, activeTop, dir)
        } else {
          const split = this.app.wrapAndAddTab(activeTop)
          split.addTab(newTab, activeTop, dir)
        }
      } else {
        // No active tab — fall back to new tab
        this.app.openNewTabRaw({ type: DaemonSessionTabComponent, inputs })
      }
    } catch (e: any) {
      this.error = 'openTab failed: ' + (e?.message ?? String(e))
    }
  }

  killSession (id: string): void {
    this.daemon.kill(id)
  }
}
