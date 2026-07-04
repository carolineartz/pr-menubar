import type { AppState, RendererApi } from '../../../shared/ipc'
import { badgeCount } from '../../../shared/badge'
import { activityFingerprint, snoozeUntil } from '../../../shared/fingerprint'
import { makeMockPRs, MOCK_SETTINGS, MOCK_VIEWER } from '../../../shared/mockData'
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
    badgeCount: badgeCount(prs, {}, Date.now())
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
    openPr: async (key) => console.log('[mock] open', key),
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
