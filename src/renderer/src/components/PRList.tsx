import type { JSX } from 'react'
import type { PRSnapshot } from '../../../shared/types'
import {
  emptyMessage,
  isSnoozedNow,
  myGroups,
  reviewingGroups,
  rowsFor,
  sortByCreated,
  sortByUrgency,
  type Group,
  type GroupKey,
  type ListContext,
  type TabId
} from '../lib/selectors'
import { ChevronIcon } from './icons'
import { PRRow, type RowActions } from './PRRow'

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
  codeownerDraftsHidden,
  onToggleCodeownerDrafts,
  peopleNames,
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
  /** Code owner requests only: drafts are clutter there until they're ready */
  codeownerDraftsHidden: boolean
  onToggleCodeownerDrafts: () => void
  peopleNames: ReadonlyMap<string, string>
  actions: RowActions
}): JSX.Element {
  const render = (pr: PRSnapshot): JSX.Element => (
    <PRRow
      key={pr.key}
      pr={pr}
      authorName={peopleNames.get(pr.author) ?? null}
      now={ctx.now}
      expanded={expandedKey === pr.key}
      snoozeMenuOpen={snoozeMenuKey === pr.key}
      starred={ctx.starred.has(pr.key)}
      snoozed={isSnoozedNow(pr, ctx)}
      hideChip={tab === 'all'}
      timeBadge={tab === 'rev'}
      showOwnAvatar={tab === 'all'}
      repoFocused={ctx.repoFocus === pr.repo}
      jiraEnabled={jiraEnabled}
      actions={actions}
    />
  )

  const renderGroups = (groups: Group[]): JSX.Element[] =>
    groups.flatMap((g) => {
      const collapsed = collapsedGroups.has(g.key)
      // code-owner group: drafts hide behind a toggle on the divider itself
      const draftCount =
        g.key === 'team' ? g.rows.filter((pr) => pr.isDraft).length : 0
      const rows =
        g.key === 'team' && codeownerDraftsHidden ? g.rows.filter((pr) => !pr.isDraft) : g.rows
      return [
        <button
          className={collapsed ? 'group-header collapsed' : 'group-header'}
          key={`h-${g.key}`}
          onClick={() => onToggleGroup(g.key)}
        >
          <ChevronIcon open={false} />
          <span className="glabel" style={{ color: g.color }}>
            {g.label}
          </span>
          <span className="gcount">{rows.length}</span>
          <span className="grule" />
          {draftCount > 0 && (
            <span
              className="gdraft-toggle"
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleCodeownerDrafts()
              }}
            >
              {codeownerDraftsHidden
                ? `show ${draftCount} draft${draftCount === 1 ? '' : 's'}`
                : 'hide drafts'}
            </span>
          )}
        </button>,
        ...(collapsed ? [] : rows.map(render))
      ]
    })

  let content: JSX.Element[]
  if (tab === 'rev') {
    content = renderGroups(reviewingGroups(rowsFor('rev', prs, ctx, showSnoozed), botAuthors))
  } else if (tab === 'my') {
    content = renderGroups(myGroups(rowsFor('my', prs, ctx, showSnoozed)))
  } else if (tab === 'all') {
    content = sortByCreated(rowsFor('all', prs, ctx, showSnoozed)).map(render)
  } else {
    content = sortByUrgency(rowsFor(tab, prs, ctx, showSnoozed)).map(render)
  }

  return (
    <div className="list">
      <div className="list-inner">
        {content.length > 0 ? content : <div className="empty">{emptyMessage(tab)}</div>}
      </div>
    </div>
  )
}
