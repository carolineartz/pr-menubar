import type { BrowserWindow } from 'electron'
import { badgeCount } from '../shared/badge'
import { isSnoozeActive } from '../shared/fingerprint'
import type { AppState } from '../shared/ipc'
import { CHANNELS } from '../shared/ipc'
import type { Person, PRSnapshot } from '../shared/types'
import type { Store } from './store'

/**
 * Owns the runtime data (PR snapshots, sync status) and composes the full
 * AppState pushed to the renderer. All mutations funnel through here so the
 * badge and popover stay consistent.
 */
export class Coordinator {
  prs: PRSnapshot[] = []
  viewer: string | null = null
  authOk = true
  lastSyncAt: number | null = null
  syncError: string | null = null
  orgPeople: Person[] = []
  /** on-demand author-filter results (bucket-less); poll data wins on dedupe */
  private authorExtra: PRSnapshot[] = []

  constructor(
    private store: Store,
    private targets: { getWindow(): BrowserWindow | null; setBadge(count: number): void }
  ) {}

  setAuthorExtra(prs: PRSnapshot[]): void {
    this.authorExtra = prs
    this.publish()
  }

  snapshot(): AppState {
    const settings = this.store.get('settings')
    const seen = new Set(this.prs.map((p) => p.key))
    return {
      authOk: this.authOk,
      viewer: this.viewer,
      prs: [...this.prs, ...this.authorExtra.filter((p) => !seen.has(p.key))],
      lastSyncAt: this.lastSyncAt,
      syncError: this.syncError,
      settings,
      starred: this.store.get('starred'),
      snoozed: this.store.get('snoozed'),
      teamToggles: this.store.get('teamToggles'),
      badgeCount: this.currentBadge(),
      people: this.people()
    }
  }

  /** Org members plus anyone authoring a PR in the current feed. */
  private people(): Person[] {
    const merged = new Map(this.orgPeople.map((p) => [p.login, p]))
    for (const pr of this.prs) {
      if (!merged.has(pr.author)) merged.set(pr.author, { login: pr.author, name: null })
    }
    return [...merged.values()].sort((a, b) => a.login.localeCompare(b.login))
  }

  currentBadge(): number {
    if (!this.store.get('settings').badgeEnabled || !this.authOk) return 0
    return badgeCount(this.prs, this.store.get('snoozed'), Date.now())
  }

  /** Recompute badge + push fresh state to the popover. Call after any change. */
  publish(): void {
    this.targets.setBadge(this.currentBadge())
    const win = this.targets.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(CHANNELS.dataUpdated, this.snapshot())
    }
  }

  setData(prs: PRSnapshot[], viewer: string): void {
    this.prs = prs
    this.viewer = viewer
    this.authOk = true
    this.lastSyncAt = Date.now()
    this.syncError = null
    this.expireSnoozes()
    this.publish()
  }

  setError(message: string, authFailed = false): void {
    this.syncError = message
    if (authFailed) this.authOk = false
    this.publish()
  }

  /** Drop timed snoozes that have lapsed and activity snoozes whose PR changed. */
  private expireSnoozes(): void {
    const snoozed = this.store.get('snoozed')
    const now = Date.now()
    const next: typeof snoozed = {}
    let changed = false
    for (const [key, entry] of Object.entries(snoozed)) {
      const pr = this.prs.find((p) => p.key === key)
      // keep entries for PRs not currently loaded (e.g. mid-poll) — harmless
      if (!pr || isSnoozeActive(entry, pr, now)) next[key] = entry
      else changed = true
    }
    if (changed) this.store.set('snoozed', next)
  }
}
