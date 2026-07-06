import type { JSX } from 'react'
import type { PRSnapshot } from '../../../shared/types'
import {
  emptyMessage,
  isSnoozedNow,
  reviewingGroups,
  rowsFor,
  sortByCreated,
  sortByUrgency,
  type ListContext,
  type TabId
} from '../lib/selectors'
import { PRRow, type RowActions } from './PRRow'

export function PRList({
  tab,
  prs,
  ctx,
  showSnoozed,
  expandedKey,
  snoozeMenuKey,
  actions
}: {
  tab: TabId
  prs: PRSnapshot[]
  ctx: ListContext
  showSnoozed: boolean
  expandedKey: string | null
  snoozeMenuKey: string | null
  actions: RowActions
}): JSX.Element {
  const render = (pr: PRSnapshot): JSX.Element => (
    <PRRow
      key={pr.key}
      pr={pr}
      now={ctx.now}
      expanded={expandedKey === pr.key}
      snoozeMenuOpen={snoozeMenuKey === pr.key}
      starred={ctx.starred.has(pr.key)}
      snoozed={isSnoozedNow(pr, ctx)}
      hideChip={tab === 'all'}
      timeBadge={tab === 'rev'}
      repoFocused={ctx.repoFocus === pr.repo}
      actions={actions}
    />
  )

  let content: JSX.Element[]
  if (tab === 'rev') {
    content = reviewingGroups(rowsFor('rev', prs, ctx, showSnoozed)).flatMap((g) => [
      <div className="group-header" key={`h-${g.key}`}>
        <span className="glabel" style={{ color: g.color }}>
          {g.label}
        </span>
        <span className="gcount">{g.rows.length}</span>
        <span className="grule" />
      </div>,
      ...g.rows.map(render)
    ])
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
