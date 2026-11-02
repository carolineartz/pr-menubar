import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { isEmptyAllQuery, sameAllQuery, type AllQueryParams, type AppState } from '../../shared/ipc'
import type { PRSnapshot, SnoozeMode } from '../../shared/types'
import { api } from './lib/api'
import {
  DEFAULT_COLLAPSED_GROUPS,
  rowsFor,
  TABS,
  type GroupKey,
  type ListContext,
  type TabId
} from './lib/selectors'
import { AllFilterBar } from './components/AllFilterBar'
import { Footer } from './components/Footer'
import { PRList } from './components/PRList'
import { SetupScreen } from './components/SetupScreen'
import { TabBar } from './components/TabBar'
import { TeamPillBar } from './components/TeamPillBar'
import type { RowActions } from './components/PRRow'

const COLLAPSED_LS_KEY = 'rev-collapsed-groups'
/** Reviewing groups whose divider toggle has un-hidden drafts (default: hidden) */
const DRAFTS_LS_KEY = 'rev-drafts-shown'
/** pre-v0.6.1 single-group form of the same preference */
const LEGACY_DRAFTS_KEY = 'codeowner-drafts'
/** Reviewing groups flipped to newest-first (default: longest-waiting on top) */
const SORT_LS_KEY = 'rev-newest-first'
/** All tab: drafts filtered out at the source */
const ALL_DRAFTS_LS_KEY = 'all-hide-drafts'

function loadGroupSet(key: string): Set<GroupKey> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return new Set(JSON.parse(raw) as GroupKey[])
  } catch {
    // fall through to default
  }
  return new Set()
}

function loadDraftsShown(): ReadonlySet<GroupKey> {
  const set = loadGroupSet(DRAFTS_LS_KEY)
  try {
    if (set.size === 0 && localStorage.getItem(LEGACY_DRAFTS_KEY) === 'shown') set.add('team')
  } catch {
    // ignore
  }
  return set
}

function loadCollapsed(): ReadonlySet<GroupKey> {
  try {
    const raw = localStorage.getItem(COLLAPSED_LS_KEY)
    if (raw) return new Set(JSON.parse(raw) as GroupKey[])
  } catch {
    // fall through to defaults
  }
  return new Set(DEFAULT_COLLAPSED_GROUPS)
}

function saveLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // non-fatal: the preference just won't survive a relaunch
  }
}

function loadAllHideDrafts(): boolean {
  try {
    return localStorage.getItem(ALL_DRAFTS_LS_KEY) === '1'
  } catch {
    return false
  }
}

/** Toggle membership in a persisted set of group keys. */
function useGroupSet(
  key: string,
  load: () => ReadonlySet<GroupKey>
): [ReadonlySet<GroupKey>, (g: GroupKey) => void] {
  const [set, setSet] = useState<ReadonlySet<GroupKey>>(load)
  const toggle = useCallback(
    (g: GroupKey): void => {
      setSet((cur) => {
        const next = new Set(cur)
        if (next.has(g)) next.delete(g)
        else next.add(g)
        saveLs(key, JSON.stringify([...next]))
        return next
      })
    },
    [key]
  )
  return [set, toggle]
}

const focusInput = (selector: string): void =>
  document.querySelector<HTMLInputElement>(selector)?.focus()

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [tab, setTab] = useState<TabId>('my')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [snoozeMenuKey, setSnoozeMenuKey] = useState<string | null>(null)
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [repoFocus, setRepoFocus] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [collapsedGroups, toggleGroup] = useGroupSet(COLLAPSED_LS_KEY, loadCollapsed)
  const [draftsShownGroups, toggleGroupDrafts] = useGroupSet(DRAFTS_LS_KEY, loadDraftsShown)
  const [newestFirstGroups, toggleGroupSort] = useGroupSet(SORT_LS_KEY, () =>
    loadGroupSet(SORT_LS_KEY)
  )
  // footer search: fuzzy filter over the rows in state (every tab but All)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  // All tab: server-side narrowing
  const [allAuthor, setAllAuthor] = useState<string | null>(null)
  const [allText, setAllText] = useState('')
  const [allHideDrafts, setAllHideDrafts] = useState(loadAllHideDrafts)
  const [now, setNow] = useState(() => Date.now())
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const allParams: AllQueryParams = useMemo(
    () => ({ author: allAuthor, text: allText, hideDrafts: allHideDrafts, repo: repoFocus }),
    [allAuthor, allText, allHideDrafts, repoFocus]
  )
  // read by the popover-shown listener, which outlives any one render
  const latest = useRef({ tab, allParams })
  useEffect(() => {
    latest.current = { tab, allParams }
  }, [tab, allParams])

  useEffect(() => {
    api.getState().then(setState)
    const offData = api.onDataUpdated(setState)
    const offShown = api.onPopoverShown(() => {
      setSnoozeMenuKey(null)
      // the poll refreshes the feed but not a narrowed All search — redo it on open
      const { tab: t, allParams: p } = latest.current
      if (t === 'all' && !isEmptyAllQuery(p)) void api.setAllQuery(p)
    })
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      offData()
      offShown()
      clearInterval(iv)
    }
  }, [])

  // Any All-tab filter runs as a GitHub search while that tab is showing;
  // clearing every filter drops back to the poll's feed.
  useEffect(() => {
    if (tab !== 'all') return
    void api.setAllQuery(isEmptyAllQuery(allParams) ? null : allParams)
  }, [tab, allParams])

  const toggleAllDrafts = useCallback((): void => {
    setAllHideDrafts((v) => {
      saveLs(ALL_DRAFTS_LS_KEY, v ? '0' : '1')
      return !v
    })
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

  const closeSearch = useCallback((): void => {
    setSearch('')
    setSearchOpen(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // inputs that want Esc for themselves stop it before it gets here
        if (snoozeMenuKey) {
          setSnoozeMenuKey(null)
        } else if (searchOpen && tab !== 'all') {
          if (search) setSearch('')
          else setSearchOpen(false)
        } else {
          void api.hidePopover()
        }
        return
      }
      if (!e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'r') {
        e.preventDefault()
        refresh()
        return
      }
      if (e.key === 'f') {
        e.preventDefault()
        if (tab === 'all') focusInput('.all-search-input')
        else {
          setSearchOpen(true)
          requestAnimationFrame(() => focusInput('.footer-search-input'))
        }
        return
      }
      // ⌘1–⌘5 jump straight to a tab
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < TABS.length) {
        e.preventDefault()
        setTab(TABS[idx].id)
        setSnoozeMenuKey(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refresh, tab, snoozeMenuKey, searchOpen, search])

  // Size the window to the content: fixed chrome + the list's natural height.
  // .list-inner is unstretched, so this shrinks the window as well as grows it.
  useEffect(() => {
    const measure = (): void => {
      const list = document.querySelector<HTMLElement>('.list')
      const inner = document.querySelector<HTMLElement>('.list-inner')
      if (!list || !inner) return
      const chrome = document.body.offsetHeight - list.clientHeight
      const listPadding = 16
      void api.resizePopover(chrome + Math.max(inner.offsetHeight + listPadding, 200) + 2)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    const mo = new MutationObserver(measure)
    mo.observe(document.body, { childList: true, subtree: true })
    measure()
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  const peopleNames = useMemo(
    () =>
      new Map((state?.people ?? []).filter((p) => p.name).map((p) => [p.login, p.name as string])),
    [state?.people]
  )

  // the narrowed All search that's actually showing (stale params included —
  // the previous result stays up while the next one is in flight)
  const activeAllQuery = state?.allQuery && !isEmptyAllQuery(allParams) ? state.allQuery : null
  const allQuerySettled = activeAllQuery ? sameAllQuery(activeAllQuery.params, allParams) : false

  const ctx: ListContext = useMemo(
    () => ({
      starred: new Set(state?.starred ?? []),
      snoozed: state?.snoozed ?? {},
      teamToggles: state?.teamToggles ?? {},
      now,
      allKeys: activeAllQuery ? new Set(activeAllQuery.keys) : null,
      repoFocus,
      search
    }),
    [state, now, activeAllQuery, repoFocus, search]
  )

  const requiredReviews = state?.settings.requiredReviews ?? 2

  const actions: RowActions = useMemo(
    () => ({
      toggleExpand: (key) => {
        setExpandedKey((cur) => (cur === key ? null : key))
        setSnoozeMenuKey(null)
      },
      toggleRepoFocus: (repo) => setRepoFocus((cur) => (cur === repo ? null : repo)),
      openPr: (key, keepOpen) => void api.openPr(key, keepOpen),
      copyNudge: (pr: PRSnapshot) => {
        const msg =
          requiredReviews - pr.approvals === 1
            ? `still waiting for one more review on ${pr.url}`
            : `still waiting for reviews on ${pr.url}`
        void navigator.clipboard.writeText(msg)
        showToast('Nudge copied — paste into Slack')
      },
      openJira: (key) => void api.openJira(key),
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
    [ctx.starred, showToast, requiredReviews]
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

  // All: the feed holds the 50 newest, so GitHub's own total is the honest
  // count — minus whatever loaded rows a snooze hides. Falls back to the
  // loaded count while a narrowed search is still in flight.
  const allLoaded = rowsFor('all', state.prs, ctx, true).length
  const allTotal = isEmptyAllQuery(allParams)
    ? state.allOpenTotal
    : allQuerySettled
      ? activeAllQuery!.total
      : null
  if (allTotal != null) counts.all = Math.max(counts.all, allTotal - (allLoaded - counts.all))
  const allFootnote =
    tab === 'all' && allTotal != null && allTotal > allLoaded
      ? `Showing the ${allLoaded} newest of ${allTotal} — narrow by author or title to reach the rest`
      : null

  // Snoozed rows hidden from the current tab (drives the footer show/hide link)
  const snoozedCount = state.prs.filter(
    (pr) => rowsFor(tab, [pr], ctx, true).length > 0 && rowsFor(tab, [pr], ctx, false).length === 0
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
        jiraEnabled={state.settings.jiraBaseUrl.trim() !== ''}
        botAuthors={state.settings.botAuthors}
        collapsedGroups={collapsedGroups}
        onToggleGroup={toggleGroup}
        draftsShownGroups={draftsShownGroups}
        onToggleGroupDrafts={toggleGroupDrafts}
        newestFirstGroups={newestFirstGroups}
        onToggleGroupSort={toggleGroupSort}
        peopleNames={peopleNames}
        requiredReviews={state.settings.requiredReviews}
        footnote={allFootnote}
        actions={actions}
      />
      {tab === 'team' && (
        <TeamPillBar
          usernames={state.settings.teamUsernames}
          toggles={state.teamToggles}
          onToggle={(login, on) => void api.toggleTeam(login, on)}
        />
      )}
      {tab === 'all' && (
        <AllFilterBar
          people={state.people}
          author={allAuthor}
          onAuthor={setAllAuthor}
          text={allText}
          onText={setAllText}
          hideDrafts={allHideDrafts}
          onToggleDrafts={toggleAllDrafts}
          pending={!isEmptyAllQuery(allParams) && !allQuerySettled}
        />
      )}
      <Footer
        lastSyncAt={state.lastSyncAt}
        syncError={state.syncError}
        now={now}
        snoozedCount={snoozedCount}
        showSnoozed={showSnoozed}
        repoFocus={repoFocus}
        searchable={tab !== 'all'}
        searchOpen={searchOpen}
        search={search}
        onSearchOpen={() => setSearchOpen(true)}
        onSearchChange={setSearch}
        onSearchClose={closeSearch}
        onClearRepoFocus={() => setRepoFocus(null)}
        onToggleSnoozed={() => setShowSnoozed((v) => !v)}
        onRefresh={refresh}
        onOpenGithub={() => void api.openGithub()}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
