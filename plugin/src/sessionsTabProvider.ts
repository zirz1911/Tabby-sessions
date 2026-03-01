import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { SessionsComponent } from './sessions.component'

@Injectable()
export class SessionsSettingsTabProvider extends SettingsTabProvider {
  id = 'daemon-sessions'
  icon = 'layers'
  title = 'Sessions'
  component = SessionsComponent
}
