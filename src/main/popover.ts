import { BrowserWindow, screen, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'

const WIDTH = 560
const HEIGHT = 540
const MIN_HEIGHT = 280

export interface Popover {
  win: BrowserWindow
  show(trayBounds: Electron.Rectangle): void
  hide(): void
  toggle(trayBounds: Electron.Rectangle): void
  /** true if the popover hid within the last 300ms — a tray click that
   *  blurred it should not immediately reopen it */
  justHid(): boolean
  onShow(cb: () => void): void
  /** Match the window to the content's natural height (clamped). */
  resize(contentHeight: number): void
}

/** maxHeight: the persisted cap set by dragging the window edge — auto-size
 *  follows the content up to it, and taller content scrolls inside. */
export function createPopover(maxHeight: { get(): number; set(h: number): void }): Popover {
  let hiddenAt = 0
  let programmaticResize = false
  /** mid-drag: the content auto-sizer must not fight the user's hand */
  let userResizing = false
  const showListeners: (() => void)[] = []

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    // min/max width identical → the frameless window resizes vertically only
    resizable: true,
    minWidth: WIDTH,
    maxWidth: WIDTH,
    minHeight: MIN_HEIGHT,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    vibrancy: 'menu',
    visualEffectState: 'active',
    roundedCorners: true,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // will-resize only fires for manual resizing — pause auto-size for the drag
  win.on('will-resize', () => {
    userResizing = true
  })

  // a manual drag (not our own setSize) records the new height as the cap
  win.on('resized', () => {
    userResizing = false
    if (!programmaticResize) maxHeight.set(win.getSize()[1])
  })

  win.on('blur', () => {
    // Keep open while devtools are focused during development
    if (win.webContents.isDevToolsOpened()) return
    hiddenAt = Date.now()
    win.hide()
  })

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      hiddenAt = Date.now()
      win.hide()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const show = (trayBounds: Electron.Rectangle): void => {
    const display = screen.getDisplayNearestPoint({
      x: trayBounds.x + trayBounds.width / 2,
      y: trayBounds.y + trayBounds.height / 2
    })
    const wa = display.workArea
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - WIDTH / 2)
    x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - WIDTH - 8)
    const y = wa.y + 6
    win.setPosition(x, y, false)
    win.show()
    win.focus()
    showListeners.forEach((cb) => cb())
  }

  return {
    win,
    show,
    hide: () => {
      hiddenAt = Date.now()
      win.hide()
    },
    toggle: (trayBounds) => {
      if (win.isVisible()) win.hide()
      else show(trayBounds)
    },
    justHid: () => Date.now() - hiddenAt < 300,
    onShow: (cb) => showListeners.push(cb),
    resize: (contentHeight) => {
      if (userResizing) return
      const cap = Math.max(MIN_HEIGHT, maxHeight.get())
      const h = Math.round(Math.min(Math.max(contentHeight, MIN_HEIGHT), cap))
      if (win.getSize()[1] !== h) {
        programmaticResize = true
        win.setSize(WIDTH, h, false)
        setTimeout(() => {
          programmaticResize = false
        }, 150)
      }
    }
  }
}
