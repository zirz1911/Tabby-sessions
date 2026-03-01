import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
  AfterViewInit,
  NgZone,
  Input,
  Injector,
} from '@angular/core'
import { BaseTabComponent } from 'tabby-core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { DaemonClientService } from './daemonClient.service'
import { SessionAttachService } from './sessionAttach.service'
import { Subscription } from 'rxjs'

@Component({
  selector: 'daemon-session-tab',
  template: `
    <div class="daemon-session-tab-host" #termContainer></div>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .daemon-session-tab-host {
      width: 100%;
      height: 100%;
    }
  `],
})
export class DaemonSessionTabComponent extends BaseTabComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() sessionId!: string
  @Input() sessionName!: string

  @ViewChild('termContainer') termContainer!: ElementRef<HTMLDivElement>

  private xterm!: Terminal
  private fitAddon!: FitAddon
  private eventSub?: Subscription
  private resizeObserver?: ResizeObserver
  private attached = false

  constructor (
    public injector: Injector,
    private daemon: DaemonClientService,
    private attachService: SessionAttachService,
    private zone: NgZone,
  ) {
    super(injector)
  }

  ngOnInit (): void {
    this.setTitle(this.sessionName)
  }

  ngAfterViewInit (): void {
    this.initXterm()
    this.connectToSession()
  }

  private initXterm (): void {
    this.xterm = new Terminal({
      cursorBlink: true,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      fontSize: 14,
      scrollback: 5000,
    })
    this.fitAddon = new FitAddon()
    this.xterm.loadAddon(this.fitAddon)
    this.xterm.open(this.termContainer.nativeElement)
    this.fitAddon.fit()

    // User input → daemon session
    this.xterm.onData((data: string) => {
      if (this.attached) {
        this.daemon.input(this.sessionId, data)
      }
    })

    // Resize events → daemon resize command
    this.xterm.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (this.attached) {
        this.daemon.resize(this.sessionId, cols, rows)
      }
    })

    // Keep xterm fitted when the tab is resized
    this.resizeObserver = new ResizeObserver(() => {
      this.zone.run(() => {
        try { this.fitAddon.fit() } catch { /* ignore during teardown */ }
      })
    })
    this.resizeObserver.observe(this.termContainer.nativeElement)
  }

  private connectToSession (): void {
    // Subscribe to events$ first, then send attach command
    const attachPromise = new Promise<string>((resolve, reject) => {
      const sub = this.daemon.events$.subscribe(evt => {
        if (evt.type === 'attached' && evt.id === this.sessionId) {
          sub.unsubscribe()
          resolve(evt.buffer)
        } else if (evt.type === 'error') {
          sub.unsubscribe()
          reject(new Error((evt as any).message))
        }
      })
      this.daemon.send({ cmd: 'attach', id: this.sessionId })
    })

    attachPromise.then(buffer => {
      this.attached = true
      this.attachService.register(this, this.sessionId)

      // Replay scrollback buffer
      if (buffer) this.xterm.write(buffer)

      // Stream live output + handle session exit
      this.eventSub = this.daemon.events$.subscribe(evt => {
        if (evt.type === 'output' && evt.id === this.sessionId) {
          this.zone.run(() => this.xterm.write(evt.data))
        } else if (evt.type === 'exit' && evt.id === this.sessionId) {
          this.attached = false
          this.zone.run(() => {
            this.xterm.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n')
            this.setTitle(`${this.sessionName} [ended]`)
            this.attachService.unregister(this)
          })
        }
      })
    }).catch(err => {
      this.zone.run(() => {
        this.xterm.write(`\r\n\x1b[31m[attach failed: ${err.message}]\x1b[0m\r\n`)
      })
    })
  }

  override destroy (skipDestroyedEvent?: boolean): void {
    if (this.attached) {
      this.daemon.send({ cmd: 'detach', id: this.sessionId })
      this.attached = false
      this.attachService.unregister(this)
    }
    this.eventSub?.unsubscribe()
    this.resizeObserver?.disconnect()
    this.xterm?.dispose()
    super.destroy(skipDestroyedEvent)
  }
}
