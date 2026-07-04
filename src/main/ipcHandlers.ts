import { ipcMain, shell } from 'electron'
import { activityFingerprint, snoozeUntil } from '../shared/fingerprint'
import { CHANNELS } from '../shared/ipc'
import type { Settings, SnoozeMode } from '../shared/types'
import type { Coordinator } from './coordinator'
import type { Store } from './store'

export function registerIpcHandlers(deps: {
  coordinator: Coordinator
  store: Store
  refresh: () => void
  recheckAuth: () => Promise<boolean>
  rerunFailed: (prKey: string) => Promise<void>
  openSettingsWindow: () => void
  onSettingsChanged: () => void
  resizePopover: (height: number) => void
}): void {
  const { coordinator, store } = deps
  const pr = (key: string) => coordinator.prs.find((p) => p.key === key)

  ipcMain.handle(CHANNELS.getState, () => coordinator.snapshot())

  ipcMain.handle(CHANNELS.refresh, () => deps.refresh())

  ipcMain.handle(CHANNELS.openPr, (_e, key: string) => {
    const p = pr(key)
    if (p) void shell.openExternal(p.url)
  })

  ipcMain.handle(CHANNELS.openLog, (_e, key: string, checkName: string) => {
    const p = pr(key)
    if (!p) return
    const check = p.checks.find((c) => c.name === checkName)
    void shell.openExternal(check?.detailsUrl ?? `${p.url}/checks`)
  })

  ipcMain.handle(CHANNELS.rerunFailed, (_e, key: string) => deps.rerunFailed(key))

  ipcMain.handle(CHANNELS.openGithub, () => void shell.openExternal('https://github.com/pulls'))

  ipcMain.handle(CHANNELS.setStar, (_e, key: string, on: boolean) => {
    const cur = store.get('starred')
    store.set('starred', on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key))
    const ids = { ...store.get('starredNodeIds') }
    const nodeId = pr(key)?.nodeId
    if (on && nodeId) ids[key] = nodeId
    if (!on) delete ids[key]
    store.set('starredNodeIds', ids)
    coordinator.publish()
  })

  ipcMain.handle(CHANNELS.snooze, (_e, key: string, mode: SnoozeMode) => {
    const p = pr(key)
    const entry =
      mode === 'activity'
        ? { mode, fingerprint: p ? activityFingerprint(p) : '' }
        : { mode, until: snoozeUntil(mode, Date.now()) }
    store.set('snoozed', { ...store.get('snoozed'), [key]: entry })
    coordinator.publish()
  })

  ipcMain.handle(CHANNELS.unsnooze, (_e, key: string) => {
    const { [key]: _drop, ...rest } = store.get('snoozed')
    store.set('snoozed', rest)
    coordinator.publish()
  })

  ipcMain.handle(CHANNELS.toggleTeam, (_e, login: string, on: boolean) => {
    store.set('teamToggles', { ...store.get('teamToggles'), [login]: on })
    coordinator.publish()
  })

  ipcMain.handle(CHANNELS.getSettings, () => store.get('settings'))

  ipcMain.handle(CHANNELS.setSettings, (_e, patch: Partial<Settings>) => {
    store.set('settings', { ...store.get('settings'), ...patch })
    deps.onSettingsChanged()
    coordinator.publish()
  })

  ipcMain.handle(CHANNELS.openSettingsWindow, () => deps.openSettingsWindow())

  ipcMain.handle(CHANNELS.recheckAuth, () => deps.recheckAuth())

  ipcMain.handle(CHANNELS.resizePopover, (_e, height: number) => {
    if (typeof height === 'number' && Number.isFinite(height)) deps.resizePopover(height)
  })
}
