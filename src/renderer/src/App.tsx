import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { AppState } from '../../shared/ipc'
import type { PRSnapshot, SnoozeMode } from '../../shared/types'
import { api } from './lib/api'
import { rowsFor, TABS, type ListContext, type TabId } from './lib/selectors'
import { Footer } from './components/Footer'
import { PRList } from './components/PRList'
import { SetupScreen } from './components/SetupScreen'
import { TabBar } from './components/TabBar'
import { TeamPillBar } from './components/TeamPillBar'
import type { RowActions } from './components/PRRow'

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [tab, setTab] = useState<TabId>('my')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [snoozeMenuKey, setSnoozeMenuKey] = useState<string | null>(null)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    api.getState().then(setState)
    const offData = api.onDataUpdated(setState)
    const offShown = api.onPopoverShown(() => setSnoozeMenuKey(null))
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      offData()
      offShown()
      clearInterval(iv)
    }
  }, [])

  const showToast = useCallback((msg: string): void => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 1900)
  }, [])

  const refresh = useCallback((): void => {
    void api.refresh()
    showToast('Refreshed')
  }, [showToast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === 'r') {
        e.preventDefault()
        refresh()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refresh])

  const ctx: ListContext = useMemo(
    () => ({
      starred: new Set(state?.starred ?? []),
      snoozed: state?.snoozed ?? {},
      teamToggles: state?.teamToggles ?? {},
      now
    }),
    [state, now]
  )

  const actions: RowActions = useMemo(
    () => ({
      toggleExpand: (key) => {
        setExpandedKey((cur) => (cur === key ? null : key))
        setSnoozeMenuKey(null)
      },
      openPr: (key) => void api.openPr(key),
      openLog: (key, check) => void api.openLog(key, check),
      rerunFailed: (key) => {
        void api.rerunFailed(key)
        showToast('Re-running failed checks…')
      },
      copyBranch: (pr: PRSnapshot) => {
        void navigator.clipboard.writeText(pr.headRefName)
        showToast(`Copied ${pr.headRefName}`)
      },
      toggleStar: (pr: PRSnapshot) => {
        const on = !ctx.starred.has(pr.key)
        void api.setStar(pr.key, on)
        showToast(on ? 'Added to Saved' : 'Removed from Saved')
      },
      toggleSnoozeMenu: (key) => setSnoozeMenuKey((cur) => (cur === key ? null : key)),
      snooze: (pr: PRSnapshot, mode: SnoozeMode) => {
        void api.snooze(pr.key, mode)
        setSnoozeMenuKey(null)
        setExpandedKey(null)
        showToast(
          mode === '1h'
            ? 'Snoozed for 1 hour'
            : mode === 'tomorrow'
              ? 'Snoozed until tomorrow'
              : 'Snoozed until activity'
        )
      },
      unsnooze: (key) => {
        void api.unsnooze(key)
        showToast('Unsnoozed')
      }
    }),
    [ctx.starred, showToast]
  )

  if (!state) return <div className="popover" />

  if (!state.authOk) {
    return (
      <div className="popover">
        <SetupScreen onRecheck={() => void api.recheckAuth()} />
      </div>
    )
  }

  if (state.settings.repos.length === 0) {
    return (
      <div className="popover">
        <div className="setup">
          <h2>No repositories yet</h2>
          <p>Pick which repos to watch and PRs will show up here.</p>
          <button className="btn" onClick={() => void api.openSettingsWindow()}>
            Open Settings
          </button>
        </div>
      </div>
    )
  }

  const counts = Object.fromEntries(
    TABS.map((t) => [t.id, rowsFor(t.id, state.prs, ctx).length])
  ) as Record<TabId, number>

  // Snoozed rows hidden from the current tab (drives the footer show/hide link)
  const snoozedCount = state.prs.filter(
    (pr) =>
      rowsFor(tab, [pr], ctx, true).length > 0 && rowsFor(tab, [pr], ctx, false).length === 0
  ).length

  return (
    <div className="popover">
      <TabBar
        active={tab}
        counts={counts}
        onSelect={(t) => {
          setTab(t)
          setSnoozeMenuKey(null)
        }}
      />
      <PRList
        tab={tab}
        prs={state.prs}
        ctx={ctx}
        showSnoozed={showSnoozed}
        expandedKey={expandedKey}
        snoozeMenuKey={snoozeMenuKey}
        actions={actions}
      />
      {tab === 'team' && (
        <TeamPillBar
          usernames={state.settings.teamUsernames}
          toggles={state.teamToggles}
          onToggle={(login, on) => void api.toggleTeam(login, on)}
        />
      )}
      <Footer
        lastSyncAt={state.lastSyncAt}
        syncError={state.syncError}
        now={now}
        snoozedCount={snoozedCount}
        showSnoozed={showSnoozed}
        onToggleSnoozed={() => setShowSnoozed((v) => !v)}
        onRefresh={refresh}
        onOpenGithub={() => void api.openGithub()}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
