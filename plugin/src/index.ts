import { NgModule, APP_INITIALIZER } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { TabContextMenuItemProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { DaemonClientService }        from './daemonClient.service'
import { DaemonLifecycleService }      from './daemonLifecycle.service'
import { SessionAttachService }        from './sessionAttach.service'
import { SessionsComponent }           from './sessions.component'
import { SessionsSettingsTabProvider } from './sessionsTabProvider'
import { DaemonSessionTabComponent }   from './daemonSessionTab.component'
import { DaemonContextMenuProvider }   from './daemonContextMenu.provider'

export function initDaemon (lifecycle: DaemonLifecycleService): () => Promise<void> {
  return () => lifecycle.initialize()
}

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  providers: [
    DaemonClientService,
    DaemonLifecycleService,
    SessionAttachService,
    { provide: SettingsTabProvider,        useClass: SessionsSettingsTabProvider, multi: true },
    { provide: TabContextMenuItemProvider, useClass: DaemonContextMenuProvider,   multi: true },
    {
      provide:    APP_INITIALIZER,
      useFactory: initDaemon,
      deps:       [DaemonLifecycleService],
      multi:      true,
    },
  ],
  entryComponents: [
    SessionsComponent,
    DaemonSessionTabComponent,
  ],
  declarations: [
    SessionsComponent,
    DaemonSessionTabComponent,
  ],
})
export default class TabbySessionsModule {}
