import { PRIO } from '../../../shared/nextAction'
import { avatarColor } from '../../../shared/present'
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
  /** every tab: focus a single repo (click a repo name to toggle) */
  repoFocus?: string | null
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
    if (ctx.repoFocus && pr.repo !== ctx.repoFocus) return false
    let inTab: boolean
    if (tab === 'saved') inTab = ctx.starred.has(pr.key)
    else inTab = pr.buckets.includes(tab)
    if (tab === 'team' && ctx.teamToggles[pr.author] === false) inTab = false
    if (tab === 'all' && ctx.allAuthor) {
      // author filter: bucket-less rows from the on-demand author fetch count
      // too — they exist precisely to escape the All feed's newest-50 window
      inTab = pr.author === ctx.allAuthor
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

export type GroupKey =
  // Reviewing tab
  | 'start'
  | 'you'
  | 'them'
  | 'team'
  | 'approved'
  | 'bots'
  // My PRs tab
  | 'yourmove'
  | 'nudge'
  | 'inreview'
  | 'drafts'
  // Team tab: one section per teammate
  | `author:${string}`

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

/** "dependabot", "dependabot[bot]", and "app/dependabot" are the same account. */
const botName = (login: string): string =>
  login.replace(/^app\//i, '').replace(/\[bot\]$/i, '').toLowerCase()

export function isBotAuthor(login: string, botAuthors: string[]): boolean {
  return botAuthors.some((b) => botName(b) === botName(login))
}

/**
 * Reviewing classification — a PR waits on you only if their move is newer
 * than yours. First match wins:
 * - bots
 * - re-requested review (you reviewed, they clicked re-request) → waiting on you
 * - you approved (sticky, even through later commits) → approved
 * - fresh direct request, not started → start review
 * - code-owner group request, not started → code owner requests (never PRs
 *   where you're tagged individually — those matched above)
 * - unfinished pending review, or an unresolved thread whose last word isn't
 *   yours (and you haven't 👍'd it) → waiting on you
 * - anything else you've engaged with → waiting on them
 */
function groupKeyFor(pr: PRSnapshot, botAuthors: string[]): GroupKey {
  if (isBotAuthor(pr.author, botAuthors)) return 'bots'
  const started =
    pr.viewerReviewState !== null || pr.viewerCommented || pr.viewerHasPendingReview
  if (pr.reviewRequestedFromViewer && pr.viewerReviewState !== null) return 'you'
  if (pr.viewerReviewState === 'APPROVED') return 'approved'
  if (pr.reviewRequestedFromViewer && !started) return 'start'
  if (pr.reviewRequestedFromTeam && !started) return 'team'
  if (pr.viewerHasPendingReview || pr.threadsAwaitingViewer > 0) return 'you'
  return 'them'
}

export function reviewingGroups(rows: PRSnapshot[], botAuthors: string[] = []): Group[] {
  return toGroups(GROUPS, rows, (pr) => groupKeyFor(pr, botAuthors))
}

/** My PRs groups, by whose move it is. "Your move" holds every own-PR verb
 *  (merge / respond / fix, plus red-dot CI failures); "Awaiting reviewers" is
 *  the nudge list — nothing on your plate, but fewer reviewers engaged than
 *  the repo requires; "In review" is relax-and-wait. */
export function myGroups(rows: PRSnapshot[], requiredReviews: number): Group[] {
  return toGroups(MY_GROUPS, rows, (pr) => {
    if (pr.isDraft) return 'drafts'
    if (pr.nextAction !== 'WAITING') return 'yourmove'
    if (pr.engagedReviewers < requiredReviews) return 'nudge'
    return 'inreview'
  })
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

export function emptyMessage(tab: TabId): string {
  if (tab === 'saved') return 'Nothing saved yet — star a PR from any tab.'
  if (tab === 'team') return 'No people shown — toggle someone back on below.'
  return 'All clear — nothing needs you here.'
}
