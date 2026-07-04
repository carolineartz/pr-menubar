import { app } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { CHANNELS } from '../shared/ipc'
import { makeMockPRs, MOCK_SETTINGS, MOCK_VIEWER } from '../shared/mockData'
import { Coordinator } from './coordinator'
import { registerIpcHandlers } from './ipcHandlers'
import { createPopover } from './popover'
import { Poller, type PollResult } from './poller'
import { openSettingsWindow } from './settingsWindow'
import { Store } from './store'
import { createTray } from './tray'

const MOCK = !!process.env.PRMB_MOCK

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

async function fetchPRs(store: Store): Promise<PollResult> {
  if (MOCK) {
    return { prs: makeMockPRs(Date.now(), MOCK_SETTINGS.noisyPatterns), viewer: MOCK_VIEWER }
  }
  // Real GitHub data layer lands in M4; until then mock keeps the shell testable.
  return { prs: makeMockPRs(Date.now(), store.get('settings').noisyPatterns), viewer: MOCK_VIEWER }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.carolineartz.pr-menubar')
  app.dock?.hide()

  const store = new Store(MOCK ? 'state-mock.json' : 'state.json')
  if (MOCK) {
    store.set('settings', MOCK_SETTINGS)
  }

  const popover = createPopover()

  const trayCtl = createTray({
    onClick: (bounds) => {
      if (popover.win.isVisible() || popover.justHid()) popover.hide()
      else popover.show(bounds)
    },
    onRefresh: () => poller.refresh(),
    onSettings: () => openSettingsWindow(),
    onQuit: () => app.quit()
  })

  const coordinator = new Coordinator(store, {
    getWindow: () => popover.win,
    setBadge: (n) => trayCtl.setBadge(n)
  })

  const poller = new Poller(
    () => fetchPRs(store),
    ({ prs, viewer }) => coordinator.setData(prs, viewer),
    (err) => coordinator.setError(err instanceof Error ? err.message : String(err))
  )

  popover.onShow(() => {
    popover.win.webContents.send(CHANNELS.popoverShown)
    poller.refresh()
  })

  registerIpcHandlers({
    coordinator,
    store,
    refresh: () => poller.refresh(),
    recheckAuth: async () => true, // real gh check lands in M4
    rerunFailed: async () => {}, // real re-run lands in M4
    openSettingsWindow,
    onSettingsChanged: () => {
      app.setLoginItemSettings({ openAtLogin: store.get('settings').launchAtLogin })
      poller.refresh()
    }
  })

  poller.start()
})

// Menubar app: stay alive with zero windows; quit only via the tray menu.
app.on('window-all-closed', () => {})
