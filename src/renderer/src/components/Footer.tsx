import type { JSX } from 'react'

export function Footer({
  lastSyncAt,
  syncError,
  now,
  snoozedCount,
  showSnoozed,
  onToggleSnoozed,
  onRefresh,
  onOpenGithub
}: {
  lastSyncAt: number | null
  syncError: string | null
  now: number
  snoozedCount: number
  showSnoozed: boolean
  onToggleSnoozed: () => void
  onRefresh: () => void
  onOpenGithub: () => void
}): JSX.Element {
  let syncText = 'Never synced'
  if (lastSyncAt != null) {
    const sec = Math.max(0, Math.floor((now - lastSyncAt) / 1000))
    syncText = `Synced ${sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m`} ago`
  }
  if (syncError) syncText = syncError

  return (
    <div className="footer">
      <span className={syncError ? 'sync-dot error' : 'sync-dot'} />
      <span className="sync-text">{syncText}</span>
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
