import { app, nativeTheme, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Shot {
  name: string
  theme: 'dark' | 'light'
  /** index into the tab bar: my=0 rev=1 team=2 saved=3 all=4 */
  tab: number
  expandFirstRow?: boolean
}

const SHOTS: Shot[] = [
  { name: 'my-prs-dark', theme: 'dark', tab: 0, expandFirstRow: true },
  { name: 'reviewing-light', theme: 'light', tab: 1 },
  { name: 'team-light', theme: 'light', tab: 2 },
  { name: 'all-dark', theme: 'dark', tab: 4 }
]

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * PRMB_SHOOT=1 PRMB_MOCK=1: photograph the popover on the mock dataset for
 * the README, then quit. capturePage can't see the native vibrancy, so a
 * solid panel background is injected for clean captures.
 */
export async function captureScreenshots(win: BrowserWindow, outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true })
  win.removeAllListeners('blur') // keep it visible while unfocused
  win.center()
  win.show()
  await sleep(1500)

  for (const shot of SHOTS) {
    nativeTheme.themeSource = shot.theme
    await win.webContents.insertCSS(
      `body { background: ${shot.theme === 'dark' ? '#1f1f26' : '#f7f7f9'} !important }`
    )
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.tab')[${shot.tab}]?.click()`
    )
    await sleep(300)
    if (shot.expandFirstRow) {
      await win.webContents.executeJavaScript(`document.querySelector('.row')?.click()`)
      await sleep(300)
    }
    await sleep(200) // let the auto-resize settle
    const image = await win.webContents.capturePage()
    writeFileSync(join(outDir, `${shot.name}.png`), image.toPNG())
    console.log(`[shoot] captured ${shot.name}`)
  }
  app.quit()
}
