import { app, Menu, shell } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { CHANNELS } from '../shared/ipc'
import { makeMockPRs, MOCK_SETTINGS, MOCK_VIEWER } from '../shared/mockData'
import { Coordinator } from './coordinator'
import { AuthFailedError, GithubService } from './github/service'
import { registerIpcHandlers } from './ipcHandlers'
import { processNotifications } from './notifier'
import { createPopover } from './popover'
import { Poller, type PollResult } from './poller'
import { openSettingsWindow } from './settingsWindow'
import { Store } from './store'
import { createTray } from './tray'

const MOCK = !!process.env.PRMB_MOCK

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.carolineartz.pr-menubar')
  app.dock?.hide()

  // No visible menu bar (LSUIElement), but roles keep ⌘C/⌘V/⌘Q working
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' }
    ])
  )

  const store = new Store(MOCK ? 'state-mock.json' : 'state.json')
  if (MOCK) {
    store.set('settings', MOCK_SETTINGS)
  }

  const github = new GithubService()

  const fetchPRs = async (): Promise<PollResult> => {
    if (MOCK) {
      return { prs: makeMockPRs(Date.now(), MOCK_SETTINGS.noisyPatterns), viewer: MOCK_VIEWER }
    }
    const settings = store.get('settings')
    const starred = new Set(store.get('starred'))
    const savedNodeIds = Object.entries(store.get('starredNodeIds'))
      .filter(([key]) => starred.has(key))
      .map(([, id]) => id)
    const { prs, viewer, rateLimit } = await github.poll(settings, savedNodeIds)
    // ease off when the hourly GraphQL budget runs low
    poller.backoffFactor = rateLimit.remaining < 500 ? 4 : rateLimit.remaining < 1500 ? 2 : 1
    return { prs, viewer }
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
    fetchPRs,
    ({ prs, viewer }) => {
      console.log(
        `[poll] ${prs.length} PRs for ${viewer} · badge ${coordinator.currentBadge()} · ` +
          prs.map((p) => `${p.key}:${p.nextAction}`).join(' ')
      )
      coordinator.setData(prs, viewer)
      processNotifications(store, prs)
    },
    (err) => {
      const cause = err instanceof Error && err.cause ? ` (cause: ${String(err.cause)})` : ''
      console.error('[poll] failed:', err instanceof Error ? err.message + cause : err)
      coordinator.setError(
        err instanceof Error ? err.message : String(err),
        err instanceof AuthFailedError
      )
    }
  )

  popover.onShow(() => {
    popover.win.webContents.send(CHANNELS.popoverShown)
    poller.refresh()
  })

  registerIpcHandlers({
    coordinator,
    store,
    refresh: () => poller.refresh(),
    recheckAuth: async () => {
      const ok = MOCK ? true : await github.checkAuth()
      if (ok && !coordinator.authOk) {
        coordinator.authOk = true
        poller.refresh()
      }
      return ok
    },
    rerunFailed: async (prKey) => {
      const pr = coordinator.prs.find((p) => p.key === prKey)
      if (!pr || MOCK) return
      const ok = await github.rerunFailed(pr).catch(() => false)
      if (!ok) void shell.openExternal(`${pr.url}/checks`)
      else poller.refresh()
    },
    openSettingsWindow,
    onSettingsChanged: () => {
      app.setLoginItemSettings({ openAtLogin: store.get('settings').launchAtLogin })
      poller.refresh()
    },
    resizePopover: (h) => popover.resize(h)
  })

  poller.start()
})

// Menubar app: stay alive with zero windows; quit only via the tray menu.
app.on('window-all-closed', () => {})
