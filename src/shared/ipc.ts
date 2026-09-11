import type { Person, PRSnapshot, Settings, SnoozeEntry, SnoozeMode } from './types'

/** Server-side narrowing of the All tab. Any non-default field turns the
 *  All feed into an on-demand GitHub search whose total count is exact. */
export interface AllQueryParams {
  author: string | null
  /** free text, matched against PR titles */
  text: string
  hideDrafts: boolean
  /** "owner/name" repo focus — every tab narrows client-side, All narrows at the source */
  repo: string | null
}

export const EMPTY_ALL_QUERY: AllQueryParams = {
  author: null,
  text: '',
  hideDrafts: false,
  repo: null
}

export function isEmptyAllQuery(p: AllQueryParams): boolean {
  return !p.author && p.text.trim() === '' && !p.hideDrafts && !p.repo
}

export function sameAllQuery(a: AllQueryParams, b: AllQueryParams): boolean {
  return (
    a.author === b.author &&
    a.text.trim() === b.text.trim() &&
    a.hideDrafts === b.hideDrafts &&
    a.repo === b.repo
  )
}

export interface AllQueryResult {
  params: AllQueryParams
  /** keys of every PR the search matched (poll rows included) */
  keys: string[]
  /** GitHub's total match count — the list holds at most the 50 newest */
  total: number
}

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
  /** GitHub's count of open PRs across the watched repos (the feed carries the 50 newest) */
  allOpenTotal: number
  /** active on-demand All-tab search, when any filter is set */
  allQuery: AllQueryResult | null
}

/** Renderer → main (ipcRenderer.invoke). */
export interface Invokers {
  getState(): Promise<AppState>
  refresh(): Promise<void>
  /** keepOpen: open the browser tab behind the popover instead of activating it */
  openPr(prKey: string, keepOpen?: boolean): Promise<void>
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
  /** All tab filters: run the narrowed search server-side. Pass null when
   *  every filter clears so the feed falls back to the poll data. */
  setAllQuery(params: AllQueryParams | null): Promise<void>
  /** Ask the popover window to match the content's natural height. */
  resizePopover(height: number): Promise<void>
  /** Esc: the renderer decides when Escape means "close" (search open first). */
  hidePopover(): Promise<void>
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
  setAllQuery: 'all:query',
  resizePopover: 'popover:resize',
  hidePopover: 'popover:hide',
  dataUpdated: 'data:updated',
  popoverShown: 'popover:shown'
} as const
