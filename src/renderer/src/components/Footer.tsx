import { useEffect, useRef, type JSX } from 'react'
import { repoTint } from '../../../shared/present'
import { SearchIcon } from './icons'

export function Footer({
  lastSyncAt,
  syncError,
  now,
  snoozedCount,
  showSnoozed,
  repoFocus,
  searchable,
  searchOpen,
  search,
  onSearchOpen,
  onSearchChange,
  onSearchClose,
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
  /** false on the All tab — its filter bar carries the (server-side) search */
  searchable: boolean
  searchOpen: boolean
  search: string
  onSearchOpen: () => void
  onSearchChange: (q: string) => void
  onSearchClose: () => void
  onClearRepoFocus: () => void
  onToggleSnoozed: () => void
  onRefresh: () => void
  onOpenGithub: () => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  let syncText = 'Syncing…'
  if (lastSyncAt != null) {
    const sec = Math.max(0, Math.floor((now - lastSyncAt) / 1000))
    syncText = `Synced ${sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m`} ago`
  }
  if (syncError) syncText = lastSyncAt != null ? `${syncText} · retrying` : 'Sync failed · retrying'

  const open = searchable && searchOpen

  return (
    <div className="footer">
      {open ? (
        <span className="footer-search">
          <SearchIcon />
          <input
            ref={inputRef}
            className="footer-search-input"
            placeholder="Search this tab — title, repo, author, branch…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              // first Esc clears, second closes — the popover only hides on a third
              e.stopPropagation()
              if (search) onSearchChange('')
              else onSearchClose()
            }}
            onBlur={() => {
              if (!search) onSearchClose()
            }}
          />
          {search && (
            <button
              className="search-clear"
              title="Clear search"
              // keep the input focused across the click
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSearchChange('')}
            >
              ×
            </button>
          )}
        </span>
      ) : (
        <>
          <span className={syncError ? 'sync-dot error' : 'sync-dot'} />
          <span className="sync-text" title={syncError ?? undefined}>
            {syncText}
          </span>
        </>
      )}
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
      {!open && snoozedCount > 0 && (
        <button className="snooze-toggle" onClick={onToggleSnoozed}>
          {snoozedCount} snoozed · {showSnoozed ? 'hide' : 'show'}
        </button>
      )}
      {!open && <div className="spacer" />}
      {searchable && (
        <>
          <button
            className={open ? 'search-btn active' : 'search-btn'}
            title={open ? 'Close search (Esc)' : 'Search this tab (⌘F)'}
            aria-label="Search"
            aria-expanded={open}
            // don't blur the input on the way to the click, or the empty-blur
            // close and this toggle cancel each other out
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (open ? onSearchClose() : onSearchOpen())}
          >
            <SearchIcon />
          </button>
          <span className="sep">·</span>
        </>
      )}
      <button className="cmd-r" onClick={onRefresh} title="Refresh now">
        ⌘R
      </button>
      <span className="sep">·</span>
      <button className="open-github" onClick={onOpenGithub}>
        Open GitHub ↗
      </button>
    </div>
  )
}
