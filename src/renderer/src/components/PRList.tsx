import { useEffect, useState, type JSX, type KeyboardEvent } from 'react'
import type { PRSnapshot } from '../../../shared/types'
import {
  emptyMessage,
  isSnoozedNow,
  myGroups,
  reviewingGroups,
  rowsFor,
  sortByCreated,
  sortByUrgency,
  sortByWait,
  teamAuthorGroups,
  type Group,
  type GroupKey,
  type ListContext,
  type TabId
} from '../lib/selectors'
import { ChevronIcon } from './icons'
import { PRRow, type RowActions, type RowNav } from './PRRow'

/** Keys the list claims from anywhere in the popover (outside text inputs). */
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

type Item =
  | {
      kind: 'header'
      id: string
      group: Group
      collapsed: boolean
      visibleCount: number
      draftCount: number
      draftsHidden: boolean
      /** Reviewing sections only: current wait-time sort direction */
      sort: 'oldest' | 'newest' | null
    }
  | { kind: 'row'; id: string; pr: PRSnapshot; timeBadge: boolean }

export function PRList({
  tab,
  prs,
  ctx,
  showSnoozed,
  expandedKey,
  snoozeMenuKey,
  jiraEnabled,
  botAuthors,
  collapsedGroups,
  onToggleGroup,
  draftsShownGroups,
  onToggleGroupDrafts,
  newestFirstGroups,
  onToggleGroupSort,
  peopleNames,
  requiredReviews,
  footnote,
  actions
}: {
  tab: TabId
  prs: PRSnapshot[]
  ctx: ListContext
  showSnoozed: boolean
  expandedKey: string | null
  snoozeMenuKey: string | null
  jiraEnabled: boolean
  botAuthors: string[]
  collapsedGroups: ReadonlySet<GroupKey>
  onToggleGroup: (key: GroupKey) => void
  /** Reviewing groups where the divider toggle has un-hidden drafts (hidden by default) */
  draftsShownGroups: ReadonlySet<GroupKey>
  onToggleGroupDrafts: (key: GroupKey) => void
  /** Reviewing groups flipped to newest-first (default: longest-waiting on top) */
  newestFirstGroups: ReadonlySet<GroupKey>
  onToggleGroupSort: (key: GroupKey) => void
  peopleNames: ReadonlyMap<string, string>
  requiredReviews: number
  /** caption under the rows (All tab: "showing the 50 newest of N") */
  footnote?: string | null
  actions: RowActions
}): JSX.Element {
  // Roving focus: the cursor item is the list's single Tab stop; ↑/↓ move it.
  // Tracked by id so it survives re-sorts and falls back to the first item
  // when its row leaves the tab.
  const [cursor, setCursor] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || !NAV_KEYS.has(e.key)) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const list = document.querySelector('.list')
      if (!list) return
      const items = [...list.querySelectorAll<HTMLElement>('[data-nav]')]
      if (items.length === 0) return
      const active = document.activeElement
      // the item at or just above the focused element — an expanded row's
      // inset buttons count as that row, so ↓ from "Open" lands on the next PR
      let cur = -1
      if (active instanceof HTMLElement && list.contains(active)) {
        items.forEach((el, i) => {
          if (
            el === active ||
            el.contains(active) ||
            el.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING
          )
            cur = i
        })
      }
      let next: number
      if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = items.length - 1
      else if (cur === -1) {
        // nothing in the list has focus: ↓ picks up at the cursor, ↑ at the end
        next =
          e.key === 'ArrowDown'
            ? Math.max(
                0,
                items.findIndex((el) => el.tabIndex === 0)
              )
            : items.length - 1
      } else next = Math.min(items.length - 1, Math.max(0, cur + (e.key === 'ArrowDown' ? 1 : -1)))
      e.preventDefault()
      items[next].focus()
      items[next].scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- build the item list first so the Tab stop can be resolved ----

  const items: Item[] = []
  const pushRows = (rows: PRSnapshot[], timeBadge: boolean): void => {
    for (const pr of rows) items.push({ kind: 'row', id: `row:${pr.key}`, pr, timeBadge })
  }
  const pushGroups = (groups: Group[]): void => {
    for (const g of groups) {
      const collapsed = collapsedGroups.has(g.key)
      // Reviewing + Team groups: drafts hide behind a per-group toggle on the
      // divider itself. My PRs is exempt — drafts have their own section there.
      const draftCount =
        tab === 'rev' || tab === 'team' ? g.rows.filter((pr) => pr.isDraft).length : 0
      const draftsHidden = draftCount > 0 && !draftsShownGroups.has(g.key)
      let rows = draftsHidden ? g.rows.filter((pr) => !pr.isDraft) : g.rows
      // Reviewing: longest-waiting first, unless this section was flipped
      const sort = tab === 'rev' ? (newestFirstGroups.has(g.key) ? 'newest' : 'oldest') : null
      if (sort) rows = sortByWait(rows, sort)
      items.push({
        kind: 'header',
        id: `hdr:${g.key}`,
        group: g,
        collapsed,
        visibleCount: rows.length,
        draftCount,
        draftsHidden,
        sort
      })
      // nudge rows show how long you've been waiting instead of a WAITING chip
      if (!collapsed) pushRows(rows, g.key === 'nudge')
    }
  }

  if (tab === 'rev') {
    pushGroups(reviewingGroups(rowsFor('rev', prs, ctx, showSnoozed), botAuthors))
  } else if (tab === 'my') {
    pushGroups(myGroups(rowsFor('my', prs, ctx, showSnoozed), requiredReviews))
  } else if (tab === 'team') {
    pushGroups(teamAuthorGroups(rowsFor('team', prs, ctx, showSnoozed)))
  } else if (tab === 'all') {
    pushRows(sortByCreated(rowsFor('all', prs, ctx, showSnoozed)), false)
  } else {
    pushRows(sortByUrgency(rowsFor(tab, prs, ctx, showSnoozed)), false)
  }

  const tabStop = items.some((it) => it.id === cursor) ? cursor : items[0]?.id
  const navFor = (id: string): RowNav => ({
    id,
    tabIndex: (id === tabStop ? 0 : -1) as 0 | -1,
    onFocus: () => setCursor(id)
  })

  // ---- render ----

  const renderHeader = (it: Extract<Item, { kind: 'header' }>): JSX.Element => {
    const { group: g } = it
    const nav = navFor(it.id)
    // ←/→ step between the divider and its inline toggles; Enter/Space collapse
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
      const header = e.currentTarget
      const toggles = [...header.querySelectorAll<HTMLElement>('button')]
      if (e.target !== header) {
        const i = toggles.indexOf(e.target as HTMLElement)
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          ;(i > 0 ? toggles[i - 1] : header).focus()
        } else if (e.key === 'ArrowRight' && toggles[i + 1]) {
          e.preventDefault()
          toggles[i + 1].focus()
        }
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onToggleGroup(g.key)
      } else if (e.key === 'ArrowRight' && toggles[0]) {
        e.preventDefault()
        toggles[0].focus()
      }
    }
    return (
      <div
        className={it.collapsed ? 'group-header collapsed' : 'group-header'}
        key={it.id}
        role="button"
        aria-expanded={!it.collapsed}
        tabIndex={nav.tabIndex}
        data-nav={nav.id}
        onFocus={nav.onFocus}
        onKeyDown={onKeyDown}
        onClick={() => onToggleGroup(g.key)}
      >
        <ChevronIcon open={false} />
        <span className="glabel" style={{ color: g.color }}>
          {g.label}
        </span>
        <span className="gcount">{it.visibleCount}</span>
        <span className="grule" />
        {it.sort && it.visibleCount > 1 && (
          <button
            className="gtoggle"
            tabIndex={-1}
            title={
              it.sort === 'oldest'
                ? 'Longest-waiting first — click for newest first'
                : 'Newest first — click for longest-waiting first'
            }
            onClick={(e) => {
              e.stopPropagation()
              onToggleGroupSort(g.key)
            }}
          >
            {it.sort === 'oldest' ? '↑ oldest first' : '↓ newest first'}
          </button>
        )}
        {it.draftCount > 0 && (
          <button
            className="gtoggle"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onToggleGroupDrafts(g.key)
            }}
          >
            {it.draftsHidden
              ? `show ${it.draftCount} draft${it.draftCount === 1 ? '' : 's'}`
              : 'hide drafts'}
          </button>
        )}
      </div>
    )
  }

  const renderRow = (it: Extract<Item, { kind: 'row' }>): JSX.Element => (
    <PRRow
      key={it.id}
      pr={it.pr}
      authorName={peopleNames.get(it.pr.author) ?? null}
      now={ctx.now}
      expanded={expandedKey === it.pr.key}
      snoozeMenuOpen={snoozeMenuKey === it.pr.key}
      starred={ctx.starred.has(it.pr.key)}
      snoozed={isSnoozedNow(it.pr, ctx)}
      hideChip={tab === 'all'}
      timeBadge={tab === 'rev' || it.timeBadge}
      showOwnAvatar={tab === 'all'}
      repoFocused={ctx.repoFocus === it.pr.repo}
      jiraEnabled={jiraEnabled}
      nav={navFor(it.id)}
      actions={actions}
    />
  )

  const content = items.map((it) => (it.kind === 'header' ? renderHeader(it) : renderRow(it)))

  return (
    <div className="list">
      <div className="list-inner">
        {content.length > 0 ? (
          content
        ) : (
          <div className="empty">{emptyMessage(tab, tab === 'all' ? '' : ctx.search)}</div>
        )}
        {footnote && content.length > 0 && <div className="list-note">{footnote}</div>}
      </div>
    </div>
  )
}
