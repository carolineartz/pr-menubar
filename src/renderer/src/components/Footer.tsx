import type { JSX } from 'react'
import { repoTint } from '../../../shared/present'

export function Footer({
  lastSyncAt,
  syncError,
  now,
  snoozedCount,
  showSnoozed,
  repoFocus,
  onClearRepoFocus,
  onToggleSnoozed,
  onRefresh,
  onOpenGithub
}: {
  lastSyncAt: number | null
  syncError: string | null
  now: number
  snoozedCount: number
  showSnoozed: boolean
  repoFocus: string | null
  onClearRepoFocus: () => void
  onToggleSnoozed: () => void
  onRefresh: () => void
  onOpenGithub: () => void
}): JSX.Element {
  let syncText = 'Syncing…'
  if (lastSyncAt != null) {
    const sec = Math.max(0, Math.floor((now - lastSyncAt) / 1000))
    syncText = `Synced ${sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m`} ago`
  }
  if (syncError) syncText = lastSyncAt != null ? `${syncText} · retrying` : 'Sync failed · retrying'

  return (
    <div className="footer">
      <span className={syncError ? 'sync-dot error' : 'sync-dot'} />
      <span className="sync-text" title={syncError ?? undefined}>
        {syncText}
      </span>
      {repoFocus && (
        <button
          className="repo-focus-chip"
          style={{ color: repoTint(repoFocus) }}
          title={`Showing only ${repoFocus} — click to clear`}
          onClick={onClearRepoFocus}
        >
          {repoFocus.split('/')[1] ?? repoFocus} ×
        </button>
      )}
      {snoozedCount > 0 && (
        <button className="snooze-toggle" onClick={onToggleSnoozed}>
          {snoozedCount} snoozed · {showSnoozed ? 'hide' : 'show'}
        </button>
      )}
      <div className="spacer" />
      <button className="cmd-r" onClick={onRefresh}>
        ⌘R
      </button>
      <span className="sep">·</span>
      <button className="open-github" onClick={onOpenGithub}>
        Open GitHub ↗
      </button>
    </div>
  )
}
