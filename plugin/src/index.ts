import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'

import { DaemonClientService } from './daemonClient.service'
import { SessionsComponent } from './sessions.component'
import { SessionsSettingsTabProvider } from './sessionsTabProvider'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  providers: [
    DaemonClientService,
    { provide: SettingsTabProvider, useClass: SessionsSettingsTabProvider, multi: true },
  ],
  entryComponents: [SessionsComponent],
  declarations: [SessionsComponent],
})
export default class TabbySessionsModule {}
