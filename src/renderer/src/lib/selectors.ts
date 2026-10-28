import { PRIO } from '../../../shared/nextAction'
import { avatarColor, behindSince } from '../../../shared/present'
import { isSnoozeActive } from '../../../shared/fingerprint'
import {
  myGroupKey,
  reviewingGroupKey,
  type MyGroupKey,
  type ReviewingGroupKey
} from '../../../shared/groups'
import { matchesQuery } from '../../../shared/search'
import type { PRSnapshot, SnoozeEntry } from '../../../shared/types'

export { isBotAuthor } from '../../../shared/groups'

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
  /** All tab: keys matched by the active server-side search (null = the plain feed) */
  allKeys?: ReadonlySet<string> | null
  /** every tab: focus a single repo (click a repo name to toggle) */
  repoFocus?: string | null
  /** footer search — fuzzy filter over the rows in state, every tab but All */
  search?: string
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
  const search = ctx.search?.trim() ?? ''
  return prs.filter((pr) => {
    if (ctx.repoFocus && pr.repo !== ctx.repoFocus) return false
    let inTab: boolean
    if (tab === 'saved') inTab = ctx.starred.has(pr.key)
    else if (tab === 'all' && ctx.allKeys) {
      // narrowed feed: the server said which PRs match — bucket-less rows from
      // that fetch count too, they exist precisely to escape the newest-50 window
      inTab = ctx.allKeys.has(pr.key)
    } else inTab = pr.buckets.includes(tab)
    if (tab === 'team' && ctx.teamToggles[pr.author] === false) inTab = false
    if (!inTab) return false
    if (tab !== 'all' && search && !matchesQuery(pr, search)) return false
    if (isSnoozedNow(pr, ctx) && !includeSnoozed) return false
    return true
  })
}

/** Flat tabs sort by next-action urgency, then recency. */
export function sortByUrgency(rows: PRSnapshot[]): PRSnapshot[] {
  return rows
    .slice()
    .sort(
      (a, b) => PRIO[a.nextAction] - PRIO[b.nextAction] || b.updatedAt.localeCompare(a.updatedAt)
    )
}

/** The All tab is a plain feed: newest-opened first. */
export function sortByCreated(rows: PRSnapshot[]): PRSnapshot[] {
  return rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type SortDir = 'oldest' | 'newest'

/** Reviewing sections order by how long each PR has waited on you — the same
 *  anchor the time badge shows — so the longest-waiting review is on top. */
export function sortByWait(rows: PRSnapshot[], dir: SortDir): PRSnapshot[] {
  const sign = dir === 'oldest' ? 1 : -1
  return rows.slice().sort((a, b) => sign * behindSince(a).localeCompare(behindSince(b)))
}

/** Reviewing + My PRs sections are classified in shared/groups (the tray badge
 *  builds on the same rules); Team gets one section per teammate. */
export type GroupKey = ReviewingGroupKey | MyGroupKey | `author:${string}`

export interface Group {
  key: GroupKey
  label: string
  color: string
  rows: PRSnapshot[]
}

type GroupDef = Omit<Group, 'rows'> & { collapsedByDefault: boolean }

const GROUPS: GroupDef[] = [
  { key: 'start', label: 'START REVIEW', color: 'var(--bluet)', collapsedByDefault: false },
  { key: 'you', label: 'WAITING ON YOU', color: 'var(--purt)', collapsedByDefault: false },
  { key: 'them', label: 'WAITING ON THEM', color: 'var(--ambert)', collapsedByDefault: false },
  {
    key: 'team',
    label: 'CODE OWNER REQUESTS',
    color: 'var(--tealt)',
    collapsedByDefault: false
  },
  { key: 'approved', label: 'APPROVED BY YOU', color: 'var(--greent)', collapsedByDefault: true },
  { key: 'bots', label: 'BOTS', color: 'var(--neut)', collapsedByDefault: true }
]

const MY_GROUPS: GroupDef[] = [
  { key: 'yourmove', label: 'YOUR MOVE', color: 'var(--purt)', collapsedByDefault: false },
  { key: 'nudge', label: 'AWAITING REVIEWERS', color: 'var(--ambert)', collapsedByDefault: false },
  { key: 'inreview', label: 'IN REVIEW', color: 'var(--bluet)', collapsedByDefault: false },
  { key: 'drafts', label: 'DRAFTS', color: 'var(--faint)', collapsedByDefault: false }
]

export const DEFAULT_COLLAPSED_GROUPS: readonly GroupKey[] = [...GROUPS, ...MY_GROUPS]
  .filter((g) => g.collapsedByDefault)
  .map((g) => g.key)

const toGroups = (
  defs: GroupDef[],
  rows: PRSnapshot[],
  keyFor: (pr: PRSnapshot) => GroupKey
): Group[] =>
  defs
    .map((g) => ({
      key: g.key,
      label: g.label,
      color: g.color,
      rows: sortByUrgency(rows.filter((pr) => keyFor(pr) === g.key))
    }))
    .filter((g) => g.rows.length > 0)

export function reviewingGroups(rows: PRSnapshot[], botAuthors: string[] = []): Group[] {
  return toGroups(GROUPS, rows, (pr) => reviewingGroupKey(pr, botAuthors))
}

export function myGroups(rows: PRSnapshot[], requiredReviews: number): Group[] {
  return toGroups(MY_GROUPS, rows, (pr) => myGroupKey(pr, requiredReviews))
}

/** Team tab: one collapsible section per teammate, alphabetical. */
export function teamAuthorGroups(rows: PRSnapshot[]): Group[] {
  const authors = [...new Set(rows.map((pr) => pr.author))].sort((a, b) => a.localeCompare(b))
  return authors.map((author) => ({
    key: `author:${author}` as GroupKey,
    label: author,
    color: avatarColor(author, false),
    rows: sortByUrgency(rows.filter((pr) => pr.author === author))
  }))
}

export function emptyMessage(tab: TabId, search = ''): string {
  if (search.trim()) return `No matches for “${search.trim()}” here.`
  if (tab === 'saved') return 'Nothing saved yet — star a PR from any tab.'
  if (tab === 'team') return 'No people shown — toggle someone back on below.'
  if (tab === 'all') return 'No open PRs match these filters.'
  return 'All clear — nothing needs you here.'
}
