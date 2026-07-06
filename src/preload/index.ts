import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, RendererApi } from '../shared/ipc'
import { CHANNELS } from '../shared/ipc'
import type { Settings, SnoozeMode } from '../shared/types'

const api: RendererApi = {
  getState: () => ipcRenderer.invoke(CHANNELS.getState),
  refresh: () => ipcRenderer.invoke(CHANNELS.refresh),
  openPr: (prKey: string) => ipcRenderer.invoke(CHANNELS.openPr, prKey),
  openLog: (prKey: string, checkName: string) =>
    ipcRenderer.invoke(CHANNELS.openLog, prKey, checkName),
  rerunFailed: (prKey: string) => ipcRenderer.invoke(CHANNELS.rerunFailed, prKey),
  openGithub: () => ipcRenderer.invoke(CHANNELS.openGithub),
  setStar: (prKey: string, on: boolean) => ipcRenderer.invoke(CHANNELS.setStar, prKey, on),
  snooze: (prKey: string, mode: SnoozeMode) => ipcRenderer.invoke(CHANNELS.snooze, prKey, mode),
  unsnooze: (prKey: string) => ipcRenderer.invoke(CHANNELS.unsnooze, prKey),
  toggleTeam: (login: string, on: boolean) => ipcRenderer.invoke(CHANNELS.toggleTeam, login, on),
  getSettings: () => ipcRenderer.invoke(CHANNELS.getSettings),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(CHANNELS.setSettings, patch),
  openSettingsWindow: () => ipcRenderer.invoke(CHANNELS.openSettingsWindow),
  recheckAuth: () => ipcRenderer.invoke(CHANNELS.recheckAuth),
  openJira: (prKey: string) => ipcRenderer.invoke(CHANNELS.openJira, prKey),
  resizePopover: (height: number) => ipcRenderer.invoke(CHANNELS.resizePopover, height),
  onDataUpdated: (cb: (state: AppState) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: AppState): void => cb(state)
    ipcRenderer.on(CHANNELS.dataUpdated, listener)
    return () => ipcRenderer.removeListener(CHANNELS.dataUpdated, listener)
  },
  onPopoverShown: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(CHANNELS.popoverShown, listener)
    return () => ipcRenderer.removeListener(CHANNELS.popoverShown, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
