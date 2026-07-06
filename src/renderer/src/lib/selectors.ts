import { PRIO } from '../../../shared/nextAction'
import { isSnoozeActive } from '../../../shared/fingerprint'
import type { PRSnapshot, SnoozeEntry } from '../../../shared/types'

export type TabId = 'my' | 'rev' | 'team' | 'saved' | 'all'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'my', label: 'My PRs' },
  { id: 'rev', label: 'Reviewing' },
  { id: 'team', label: 'Team' },
  { id: 'saved', label: 'Saved' },
  { id: 'all', label: 'All' }
]

export interface ListContext {
  starred: ReadonlySet<string>
  snoozed: Record<string, SnoozeEntry>
  teamToggles: Record<string, boolean>
  now: number
  /** All tab only: show a single author's PRs */
  allAuthor?: string | null
}

export function isSnoozedNow(pr: PRSnapshot, ctx: ListContext): boolean {
  return isSnoozeActive(ctx.snoozed[pr.key], pr, ctx.now)
}

/** Port of the prototype's rowsFor(): tab membership, team toggles, snooze hiding. */
export function rowsFor(
  tab: TabId,
  prs: PRSnapshot[],
  ctx: ListContext,
  includeSnoozed = false
): PRSnapshot[] {
  return prs.filter((pr) => {
    let inTab: boolean
    if (tab === 'saved') inTab = ctx.starred.has(pr.key)
    else inTab = pr.buckets.includes(tab)
    if (tab === 'team' && ctx.teamToggles[pr.author] === false) inTab = false
    if (tab === 'all' && ctx.allAuthor && pr.author !== ctx.allAuthor) inTab = false
    // Approved and nothing left to do = done reviewing. New commits after the
    // approval turn it into RESUME (stale review) and it comes back.
    if (tab === 'rev' && pr.viewerReviewState === 'APPROVED' && pr.nextAction === 'WAITING') {
      inTab = false
    }
    if (!inTab) return false
    if (isSnoozedNow(pr, ctx) && !includeSnoozed) return false
    return true
  })
}

/** Flat tabs sort by next-action urgency, then recency. */
export function sortByUrgency(rows: PRSnapshot[]): PRSnapshot[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        PRIO[a.nextAction] - PRIO[b.nextAction] || b.updatedAt.localeCompare(a.updatedAt)
    )
}

/** The All tab is a plain feed: newest-opened first. */
export function sortByCreated(rows: PRSnapshot[]): PRSnapshot[] {
  return rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface Group {
  key: 'start' | 'continue' | 'waiting'
  label: string
  color: string
  rows: PRSnapshot[]
}

const GROUPS: Omit<Group, 'rows'>[] = [
  { key: 'start', label: 'START REVIEW', color: 'var(--bluet)' },
  { key: 'continue', label: 'CONTINUE REVIEW', color: 'var(--purt)' },
  { key: 'waiting', label: 'WAITING FOR AUTHOR', color: 'var(--ambert)' }
]

/** Reviewing tab groups: REVIEW → start, RESUME → continue, rest → waiting. */
export function reviewingGroups(rows: PRSnapshot[]): Group[] {
  const of = (key: Group['key']): PRSnapshot[] =>
    rows.filter((pr) => {
      if (key === 'start') return pr.nextAction === 'REVIEW'
      if (key === 'continue') return pr.nextAction === 'RESUME'
      return pr.nextAction !== 'REVIEW' && pr.nextAction !== 'RESUME'
    })
  return GROUPS.map((g) => ({ ...g, rows: sortByUrgency(of(g.key)) })).filter(
    (g) => g.rows.length > 0
  )
}

export function emptyMessage(tab: TabId): string {
  if (tab === 'saved') return 'Nothing saved yet — star a PR from any tab.'
  if (tab === 'team') return 'No people shown — toggle someone back on below.'
  return 'All clear — nothing needs you here.'
}
