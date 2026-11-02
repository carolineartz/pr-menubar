import type { AllQueryParams, AppState, RendererApi } from '../../../shared/ipc'
import { isEmptyAllQuery } from '../../../shared/ipc'
import { badgeCount } from '../../../shared/badge'
import { activityFingerprint, snoozeUntil } from '../../../shared/fingerprint'
import { makeMockPRs, MOCK_PEOPLE, MOCK_SETTINGS, MOCK_VIEWER } from '../../../shared/mockData'
import type { SnoozeMode } from '../../../shared/types'

declare global {
  interface Window {
    api?: RendererApi
  }
}

/**
 * In-renderer stand-in for the main process. Used when the preload bridge is
 * absent (vite-only dev / browser preview); state lives in memory.
 */
function createMockApi(): RendererApi {
  const prs = makeMockPRs(Date.now())
  const state: AppState = {
    authOk: true,
    viewer: MOCK_VIEWER,
    prs,
    lastSyncAt: Date.now() - 12_000,
    syncError: null,
    settings: MOCK_SETTINGS,
    starred: ['acme/api#482'],
    snoozed: {},
    teamToggles: {},
    badgeCount: badgeCount(prs, {}, Date.now()),
    people: MOCK_PEOPLE,
    allOpenTotal: prs.length,
    allQuery: null
  }
  let listeners: ((s: AppState) => void)[] = []
  const push = (): void => {
    state.badgeCount = badgeCount(state.prs, state.snoozed, Date.now())
    listeners.forEach((cb) => cb({ ...state }))
  }

  return {
    getState: async () => ({ ...state }),
    refresh: async () => {
      state.lastSyncAt = Date.now()
      push()
    },
    openPr: async (key, keepOpen) => console.log('[mock] open', key, keepOpen ? '(keep)' : ''),
    openLog: async (key, check) => console.log('[mock] open log', key, check),
    rerunFailed: async (key) => console.log('[mock] re-run failed', key),
    openGithub: async () => console.log('[mock] open github'),
    setStar: async (key, on) => {
      state.starred = on ? [...state.starred, key] : state.starred.filter((k) => k !== key)
      push()
    },
    snooze: async (key, mode: SnoozeMode) => {
      const pr = state.prs.find((p) => p.key === key)
      state.snoozed = {
        ...state.snoozed,
        [key]:
          mode === 'activity'
            ? { mode, fingerprint: pr ? activityFingerprint(pr) : '' }
            : { mode, until: snoozeUntil(mode, Date.now()) }
      }
      push()
    },
    unsnooze: async (key) => {
      const { [key]: _drop, ...rest } = state.snoozed
      state.snoozed = rest
      push()
    },
    toggleTeam: async (login, on) => {
      state.teamToggles = { ...state.teamToggles, [login]: on }
      push()
    },
    getSettings: async () => state.settings,
    setSettings: async (patch) => {
      state.settings = { ...state.settings, ...patch }
      push()
    },
    openSettingsWindow: async () => console.log('[mock] open settings'),
    recheckAuth: async () => true,
    openJira: async (key) => console.log('[mock] open jira for', key),
    // emulate the server-side search over the mock set, with a little latency
    setAllQuery: async (params: AllQueryParams | null) => {
      if (!params || isEmptyAllQuery(params)) {
        state.allQuery = null
        push()
        return
      }
      await new Promise((r) => setTimeout(r, 250))
      const text = params.text.trim().toLowerCase()
      const hits = state.prs.filter(
        (p) =>
          (!params.author || p.author === params.author) &&
          (!params.repo || p.repo === params.repo) &&
          (!params.hideDrafts || !p.isDraft) &&
          (!text || p.title.toLowerCase().includes(text))
      )
      state.allQuery = { params, keys: hits.map((p) => p.key), total: hits.length }
      push()
    },
    resizePopover: async () => {},
    hidePopover: async () => console.log('[mock] hide popover'),
    onDataUpdated: (cb) => {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    },
    onPopoverShown: () => () => {}
  }
}

export const api: RendererApi = window.api ?? createMockApi()
