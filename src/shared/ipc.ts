import type { Person, PRSnapshot, Settings, SnoozeEntry, SnoozeMode } from './types'

/** Full state pushed to the popover after every poll or mutation. */
export interface AppState {
  authOk: boolean
  viewer: string | null
  prs: PRSnapshot[]
  /** epoch ms of last successful sync (null before first) */
  lastSyncAt: number | null
  syncError: string | null
  settings: Settings
  starred: string[]
  snoozed: Record<string, SnoozeEntry>
  teamToggles: Record<string, boolean>
  badgeCount: number
  /** org members + feed authors, for the All-tab author filter */
  people: Person[]
}

/** Renderer → main (ipcRenderer.invoke). */
export interface Invokers {
  getState(): Promise<AppState>
  refresh(): Promise<void>
  openPr(prKey: string): Promise<void>
  openLog(prKey: string, checkName: string): Promise<void>
  rerunFailed(prKey: string): Promise<void>
  openGithub(): Promise<void>
  setStar(prKey: string, on: boolean): Promise<void>
  snooze(prKey: string, mode: SnoozeMode): Promise<void>
  unsnooze(prKey: string): Promise<void>
  toggleTeam(login: string, on: boolean): Promise<void>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<void>
  openSettingsWindow(): Promise<void>
  recheckAuth(): Promise<boolean>
  /** Open the Jira ticket for a PR (main validates against jiraBaseUrl). */
  openJira(prKey: string): Promise<void>
  /** Ask the popover window to match the content's natural height. */
  resizePopover(height: number): Promise<void>
}

/** Main → renderer push events. */
export interface PushEvents {
  'data:updated': AppState
  'popover:shown': void
}

/** Exposed on window.api by the preload script. */
export interface RendererApi extends Invokers {
  onDataUpdated(cb: (state: AppState) => void): () => void
  onPopoverShown(cb: () => void): () => void
}

export const CHANNELS = {
  getState: 'state:get',
  refresh: 'refresh',
  openPr: 'pr:open',
  openLog: 'pr:openLog',
  rerunFailed: 'pr:rerunFailed',
  openGithub: 'openGithub',
  setStar: 'pr:star',
  snooze: 'pr:snooze',
  unsnooze: 'pr:unsnooze',
  toggleTeam: 'team:toggle',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  openSettingsWindow: 'settings:openWindow',
  recheckAuth: 'auth:recheck',
  openJira: 'pr:openJira',
  resizePopover: 'popover:resize',
  dataUpdated: 'data:updated',
  popoverShown: 'popover:shown'
} as const
